package expo.modules.bycodahostsocket

import android.util.Base64
import expo.modules.bycodavoice.VoiceCompanionRuntime
import org.json.JSONObject
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.securestore.SecureStoreModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withContext
import okhttp3.*
import okio.ByteString
import java.io.ByteArrayInputStream
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class HostCa : Record {
  @Field var version: Int = 0
  @Field var environmentId: String = ""
  @Field var caGeneration: Double = -1.0
  @Field var caCertificatePem: String = ""
  @Field var caSpkiPin: String = ""
}
class HostBinding : Record {
  @Field var machineId: String = ""
  @Field var environmentId: String = ""
  @Field var endpoint: String = ""
  @Field var credentialGeneration: Double = -1.0
  @Field var accessEpoch: Double = -1.0
  @Field var tls: HostCa? = null
}
class BulkDescriptor : Record {
  @Field var kind: String = ""
  @Field var transferId: String = ""
  @Field var environmentId: String = ""
  @Field var totalBytes: Double = -1.0
  @Field var chunkBytes: Double = -1.0
  @Field var sha256: String = ""
  @Field var expiresAt: Double = -1.0
}

class TunnelTarget : Record {
  @Field var projectId: String = ""
  @Field var id: String = ""
  @Field var pid: Int = 0
  @Field var startedAt: String = ""
  @Field var port: Int = 0
  @Field var address: String = ""
}
class TunnelInput : Record {
  @Field var credential: String = ""
  @Field var endpoint: String = ""
  @Field var target: TunnelTarget = TunnelTarget()
}

/** Each client owns its trust store. There is no process/global TLS override. */
internal object HostTls {
  fun client(binding: HostBinding): OkHttpClient {
    val uri = URI(binding.endpoint)
    require(uri.scheme == "wss" && uri.host != null && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.rawPath == "/ws")
    val builder = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
      .connectTimeout(5, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
      .writeTimeout(12, TimeUnit.SECONDS).pingInterval(25, TimeUnit.SECONDS)
      .retryOnConnectionFailure(false)
    binding.tls?.let { paired ->
      require(paired.version == 1 && paired.environmentId == binding.environmentId && safe(paired.caGeneration))
      require(paired.caCertificatePem.length <= 16384)
      val certificates = CertificateFactory.getInstance("X.509").generateCertificates(ByteArrayInputStream(paired.caCertificatePem.toByteArray(Charsets.US_ASCII)))
      require(certificates.size == 1)
      val ca = certificates.single() as X509Certificate
      ca.checkValidity()
      require(ca.basicConstraints >= 0 && ca.keyUsage?.getOrNull(5) == true)
      require(ca.publicKey.algorithm == "EC" && (ca.publicKey as java.security.interfaces.ECPublicKey).params.curve.field.fieldSize == 256)
      val spki = "sha256/" + Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(ca.publicKey.encoded), Base64.NO_WRAP)
      require(spki == paired.caSpkiPin)
      val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("paired-environment-ca", ca) }
      val managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }.trustManagers
      val trust = managers.single() as X509TrustManager
      val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
      builder.sslSocketFactory(ssl.socketFactory, trust)
      builder.certificatePinner(CertificatePinner.Builder().add(uri.host, spki).build())
      // OkHttp's ordinary hostname verifier is intentionally retained.
    }
    return builder.build()
  }
  fun safe(value: Double): Boolean = value.isFinite() && value >= 0 && value <= 9007199254740991.0 && value % 1.0 == 0.0
}

class BycodaHostSocketModule : Module() {
  private data class VoiceScope(val sessionId: String, val threadId: String, val projectId: String?)
  private data class Credential(val binding: HostBinding, val digest: ByteArray, val voice: VoiceScope? = null)
  private class Connection(val id: String, val generation: Double, val credential: Credential, val client: OkHttpClient, val opening: CompletableDeferred<Unit>) {
    var socket: WebSocket? = null
    var opened = false
    var settled = false
    var sequence = 0L
    val deliveries = linkedMapOf<Long, Int>()
    var deliveryBytes = 0
    val voiceRequests = mutableSetOf<String>()
    /** Fair so frames of one connection reach the socket in the order their native calls arrived. */
    val sendLock = ReentrantLock(true)
  }
  private val lock = Any()
  private val credentials = linkedMapOf<String, Credential>()
  private val connections = linkedMapOf<String, Connection>()
  // Logical detach does not release admission while the SDK still owns I/O.
  private val socketJobs = mutableSetOf<Connection>()
  private val bulkCalls = linkedMapOf<Call, String>()
  // The WebView proxy override is process-wide, so at most one phone tunnel is live; a new one replaces the old.
  private val tunnels = linkedMapOf<String, TunnelSession>()
  @Volatile private var foreground = true
  private var accessAllowed = false
  private var accessEpoch = -1.0
  private var lifecycleEpoch = 0L
  private fun error(code: String) = IllegalStateException("Host socket: $code")
  private fun secureStore(): SecureStoreModule = appContext.registry.getModule<SecureStoreModule>() ?: throw error("secure_store_unavailable")
  private fun validate(binding: HostBinding) {
    require(Regex("[A-Za-z0-9-]{1,80}").matches(binding.machineId))
    require(Regex("[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}").matches(binding.environmentId))
    require(HostTls.safe(binding.credentialGeneration) && HostTls.safe(binding.accessEpoch))
    HostTls.client(binding).dispatcher.executorService.shutdown()
  }
  private suspend fun secret(binding: HostBinding): String {
    val value = secureStore().bycodaHostReadNative("bycoda.remote.${binding.machineId}") ?: throw error("credential_missing")
    require(Regex("[A-Za-z0-9_-]{43}").matches(value))
    return value
  }
  /** The Ed25519 seed bound to this credential, or null while the Host has not bound a phone key yet. */
  private suspend fun proofSeed(binding: HostBinding): ByteArray? =
    runCatching { secureStore().bycodaHostReadNative(DeviceProof.seedKey(binding.machineId)) }.getOrNull()?.let { DeviceProof.decodeSeed(it) }
  /** The `DPoP` header value for one request of a key-bound credential. */
  private fun deviceProof(seed: ByteArray?, binding: HostBinding, token: String, path: String): String? =
    seed?.let { DeviceProof.sign(it, token, "GET", path, binding.environmentId) }
  private fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
  private fun voiceCurrent(voice: VoiceScope?) = voice != null && VoiceCompanionRuntime.allowsSession(voice.sessionId)
  private fun current(connection: Connection) = connections[connection.id] === connection && (if (connection.credential.voice != null) voiceCurrent(connection.credential.voice) else foreground && accessAllowed)
  private fun event(connection: Connection, type: String, fields: Map<String, Any> = emptyMap()) {
    sendEvent("onSocketEvent", mapOf("connectionId" to connection.id, "generation" to connection.generation, "environmentId" to connection.credential.binding.environmentId, "type" to type) + fields)
  }
  private fun finish(connection: Connection, code: String, failed: Boolean) {
    synchronized(lock) {
      if (connections[connection.id] !== connection) return
      connections.remove(connection.id)
      connection.socket?.cancel()
      connection.client.dispatcher.cancelAll()
      connection.client.connectionPool.evictAll()
      connection.client.dispatcher.executorService.shutdown()
      connection.deliveries.clear(); connection.deliveryBytes = 0
      connection.voiceRequests.clear()
      if (!connection.settled) { connection.settled = true; connection.opening.completeExceptionally(error(code)) }
      event(connection, if (failed) "error" else "closed", mapOf("code" to code))
    }
  }
  private fun invalidate(machineId: String? = null, preserveVoice: Boolean = false) {
    synchronized(lock) {
      lifecycleEpoch++
      credentials.entries.removeAll { (machineId == null || it.value.binding.machineId == machineId) && !(preserveVoice && voiceCurrent(it.value.voice)) }
      connections.values.toList().filter { (machineId == null || it.credential.binding.machineId == machineId) && !(preserveVoice && voiceCurrent(it.credential.voice)) }.forEach { finish(it, "credentials_invalidated", true) }
      bulkCalls.entries.toList().filter { machineId == null || it.value == machineId }.forEach { it.key.cancel() }
      tunnels.values.toList().filter { machineId == null || it.machineId == machineId }.forEach { it.stop("credentials_invalidated") }
    }
  }
  private suspend fun startTunnel(input: TunnelInput): Map<String, Any> {
    if (!TunnelWebViewSupport.supported()) throw error("tunnel_unsupported")
    val t = input.target
    val spec = TunnelTargetSpec(t.projectId, t.id, t.pid, t.startedAt, t.port, t.address)
    require(TunnelRules.targetValid(spec))
    val credential = synchronized(lock) { credentials[input.credential] ?: throw error("credential_handle_expired") }
    if (credential.voice != null) throw error("credential_scope")
    require(TunnelRules.endpointValid(input.endpoint, credential.binding.endpoint))
    val value = secret(credential.binding)
    if (!MessageDigest.isEqual(credential.digest, digest(value))) { invalidate(credential.binding.machineId); throw error("credential_rotated") }
    val client = HostTls.client(credential.binding)
    val endpoint = URI(input.endpoint)
    val alias = TunnelSession.newAlias()
    val url = HttpUrl.Builder().scheme("https").host(endpoint.host).port(if (endpoint.port < 0) 443 else endpoint.port)
      .addPathSegment("ws-tunnel")
      .addQueryParameter("projectId", spec.projectId).addQueryParameter("id", spec.id).addQueryParameter("pid", spec.pid.toString())
      .addQueryParameter("startedAt", spec.startedAt).addQueryParameter("port", spec.port.toString()).addQueryParameter("address", spec.address)
      .addQueryParameter("alias", alias).build()
    val id = UUID.randomUUID().toString()
    val session = TunnelSession(id, credential.binding.machineId, client, url, value, spec, alias,
      proofSeed = proofSeed(credential.binding), environmentId = credential.binding.environmentId,
      onError = { code -> sendEvent("onTunnelEvent", mapOf("tunnelId" to id, "type" to "error", "code" to code)) },
      onClosed = { code -> synchronized(lock) { tunnels.remove(id) }; sendEvent("onTunnelEvent", mapOf("tunnelId" to id, "type" to "closed", "code" to code)) })
    val replaced = synchronized(lock) {
      if (!foreground || !accessAllowed || credential.binding.accessEpoch != accessEpoch || credentials[input.credential] !== credential) { session.stop("access_changed"); throw error("access_changed") }
      val old = tunnels.values.toList()
      tunnels[id] = session
      old
    }
    replaced.forEach { it.stop("replaced") }
    session.start()
    return mapOf("tunnelId" to id, "proxyPort" to session.proxyPort, "alias" to alias)
  }
  private suspend fun acquire(binding: HostBinding, voice: VoiceScope? = null): Map<String, Any> {
    validate(binding)
    if (voice != null && !voiceCurrent(voice)) throw error("voice_unavailable")
    val epoch = synchronized(lock) { if (!foreground || !accessAllowed || binding.accessEpoch != accessEpoch || credentials.size >= 64) throw error("unavailable"); lifecycleEpoch }
    val value = secret(binding)
    return synchronized(lock) {
      if (!foreground || !accessAllowed || binding.accessEpoch != accessEpoch || lifecycleEpoch != epoch || credentials.size >= 64 || (voice != null && !voiceCurrent(voice))) throw error("access_changed")
      val handle = UUID.randomUUID().toString()
      credentials[handle] = Credential(binding, digest(value), voice)
      mapOf("handle" to handle, "machineId" to binding.machineId, "environmentId" to binding.environmentId, "credentialGeneration" to binding.credentialGeneration, "accessEpoch" to binding.accessEpoch)
    }
  }
  private suspend fun openPeer(handle: String, id: String, generation: Double, sessionId: String? = null) {
      require(id.length in 1..200 && HostTls.safe(generation))
      val credential = synchronized(lock) { credentials[handle] ?: throw error("credential_handle_expired") }
      if (credential.voice?.sessionId != sessionId) throw error("credential_scope")
      if (sessionId != null && !voiceCurrent(credential.voice)) throw error("voice_unavailable")
      val value = secret(credential.binding)
      if (!MessageDigest.isEqual(credential.digest, digest(value))) { invalidate(credential.binding.machineId); throw error("credential_rotated") }
      val client = HostTls.client(credential.binding)
      val connection = Connection(id, generation, credential, client, CompletableDeferred())
      synchronized(lock) {
        if ((if (credential.voice != null) !voiceCurrent(credential.voice) else !foreground || !accessAllowed || credential.binding.accessEpoch != accessEpoch) || credentials[handle] !== credential || socketJobs.size >= 4 || socketJobs.any { it.id == id }) throw error("connection_unavailable")
        connections[id] = connection
        socketJobs.add(connection)
      }
      val socketPath = URI(credential.binding.endpoint).rawPath.ifEmpty { "/" }
      val request = Request.Builder().url(credential.binding.endpoint).header("Authorization", "Bearer $value").header("Sec-WebSocket-Protocol", "bycoda.rpc.v2")
        .apply { deviceProof(proofSeed(credential.binding), credential.binding, value, socketPath)?.let { header(DeviceProof.HEADER, it) } }.build()
      connection.socket = client.newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
          synchronized(lock) {
            if (!current(connection)) { ws.cancel(); return }
            if (response.header("Sec-WebSocket-Protocol") != "bycoda.rpc.v2") { finish(connection, "schema", true); return }
            connection.opened = true; connection.settled = true; connection.opening.complete(Unit)
          }
        }
        override fun onMessage(ws: WebSocket, text: String) {
          val bytes = text.toByteArray(Charsets.UTF_8).size
          synchronized(lock) {
            if (!current(connection)) return
            if (connection.credential.voice != null) {
              val frame = runCatching { JSONObject(text) }.getOrNull() ?: return
              if (frame.has("method") || !connection.voiceRequests.remove(frame.optString("id"))) return
            }
            if (bytes > 1048576 || connection.deliveries.size >= 512 || connection.deliveryBytes + bytes > 16777216) { finish(connection, "overload", true); return }
            val sequence = ++connection.sequence
            connection.deliveries[sequence] = bytes; connection.deliveryBytes += bytes
            event(connection, "message", mapOf("sequence" to sequence.toDouble(), "text" to text))
          }
        }
        override fun onMessage(ws: WebSocket, bytes: ByteString) { finish(connection, "binary_not_supported", true) }
        override fun onFailure(ws: WebSocket, cause: Throwable, response: Response?) {
          // The only trace of why a socket died: the type and OkHttp's short reason (no frames or keys).
          android.util.Log.w("BycodaHostSocket", "socket failed: ${cause.javaClass.simpleName}: ${cause.message?.take(160)} http=${response?.code}")
          synchronized(lock) { socketJobs.remove(connection) }
          finish(connection, if (response?.code == 401 || response?.code == 403) "authentication" else if (cause is SSLException) "tls" else "network", true)
        }
        override fun onClosing(ws: WebSocket, code: Int, reason: String) { ws.close(code, null); finish(connection, "remote_closed", false) }
        override fun onClosed(ws: WebSocket, code: Int, reason: String) { synchronized(lock) { socketJobs.remove(connection) }; finish(connection, "remote_closed", false) }
      })
      connection.opening.await()
    }
  private val voiceListener: (Map<String, Any?>) -> Unit = { synchronized(lock) {
    credentials.entries.removeAll { it.value.voice != null && !voiceCurrent(it.value.voice) }
    connections.values.toList().filter { it.credential.voice != null && !voiceCurrent(it.credential.voice) }.forEach { finish(it, "voice_revoked", true) }
  } }
  override fun definition() = ModuleDefinition {
    Name("BycodaHostSocket")
    Events("onSocketEvent", "onTunnelEvent")
    OnCreate { VoiceCompanionRuntime.add(voiceListener) }
    Function("tunnelSupported") { TunnelWebViewSupport.supported() }
    AsyncFunction("startTunnel") Coroutine { input: TunnelInput -> startTunnel(input) }
    AsyncFunction("stopTunnel") { tunnelId: String -> synchronized(lock) { tunnels[tunnelId] }?.stop("stopped"); Unit }
    View(BycodaTunnelWebView::class) {
      Events("onNavigationChange", "onLoadError", "onExternalLink")
      Prop("proxyPort") { view: BycodaTunnelWebView, value: Int -> view.proxyPort = value }
      Prop("alias") { view: BycodaTunnelWebView, value: String -> view.alias = value }
      Prop("url") { view: BycodaTunnelWebView, value: String -> view.url = value }
      Prop("dataSaver") { view: BycodaTunnelWebView, value: Boolean -> view.dataSaver = value }
      OnViewDidUpdateProps { view: BycodaTunnelWebView -> view.applyProps() }
      OnViewDestroys { view: BycodaTunnelWebView -> view.destroyTunnelView() }
      AsyncFunction("goBack") { view: BycodaTunnelWebView -> view.goBack() }
      AsyncFunction("goForward") { view: BycodaTunnelWebView -> view.goForward() }
      AsyncFunction("reload") { view: BycodaTunnelWebView -> view.reload() }
      AsyncFunction("stopLoading") { view: BycodaTunnelWebView -> view.stopLoading() }
    }
    AsyncFunction("setAccess") { active: Boolean, epoch: Double ->
      synchronized(lock) {
        require(HostTls.safe(epoch) && epoch >= accessEpoch)
        if (active && !accessAllowed) require(epoch > accessEpoch)
        if (!active || epoch != accessEpoch) invalidate(preserveVoice = true)
        accessEpoch = epoch; accessAllowed = active && foreground
      }
    }
    AsyncFunction("acquireCredential") Coroutine { binding: HostBinding -> acquire(binding) }
    AsyncFunction("acquireVoiceCredential") Coroutine { binding: HostBinding, sessionId: String, threadId: String, projectId: String? ->
      require(threadId.length in 1..200 && (projectId == null || projectId.length in 1..200))
      acquire(binding, VoiceScope(sessionId, threadId, projectId))
    }
    AsyncFunction("storeCredential") Coroutine { binding: HostBinding, token: String ->
      synchronized(lock) { if (!foreground || !accessAllowed || binding.accessEpoch != accessEpoch) throw error("access_changed") }
      validate(binding); require(Regex("[A-Za-z0-9_-]{43}").matches(token)); invalidate(binding.machineId)
      secureStore().bycodaHostWriteNative("bycoda.remote.${binding.machineId}", token)
      acquire(binding)
    }
    AsyncFunction("deleteCredential") { machineId: String ->
      synchronized(lock) { if (!foreground || !accessAllowed) throw error("access_changed") }
      require(Regex("[A-Za-z0-9-]{1,80}").matches(machineId)); invalidate(machineId)
      secureStore().bycodaHostDeleteNative("bycoda.remote.$machineId")
    }
    AsyncFunction("invalidateCredentials") { machineId: String? -> invalidate(machineId) }
    AsyncFunction("open") Coroutine { handle: String, id: String, generation: Double -> openPeer(handle, id, generation) }
    AsyncFunction("openVoice") Coroutine { handle: String, id: String, generation: Double, sessionId: String -> openPeer(handle, id, generation, sessionId) }
    AsyncFunction("send") { id: String, generation: Double, text: String ->
      val connection = synchronized(lock) {
        val live = connections[id] ?: throw error("closed")
        if (!current(live) || live.generation != generation || !live.opened) throw error("stale_connection")
        live
      }
      // The size scan and JSON parse of a large frame run outside the shared lock so reads and lifecycle calls are not
      // stalled; this connection's fair lock keeps its sends in arrival order, and every check is repeated under the lock.
      connection.sendLock.withLock {
        val size = text.toByteArray(Charsets.UTF_8).size
        val parsed = if (size > 1048576) null else runCatching { JSONObject(text) }.getOrNull()
        synchronized(lock) {
          if (connections[id] == null) throw error("closed")
          if (connections[id] !== connection || !current(connection) || connection.generation != generation || !connection.opened) throw error("stale_connection")
          if (size > 1048576 || (connection.socket?.queueSize() ?: 0) + size > 8388608) throw error("overload")
          val frame = parsed ?: throw error("invalid_frame")
          val method = frame.optString("method")
          connection.credential.voice?.let { scope ->
            val params = frame.optJSONObject("params")
            if (!VoiceRpcPolicy.allowed(method, params?.optString("op"), params?.optString("threadId"), params?.optString("projectId"), scope.threadId, scope.projectId, params?.has("threadId") == true, params != null && params.length() == 0)) throw error("voice_scope_denied")
            val requestId = frame.optString("id")
            if (requestId.length !in 1..200 || connection.voiceRequests.size >= 64 || !connection.voiceRequests.add(requestId)) throw error("voice_request_invalid")
          }
          if (method.startsWith("native.") || method.startsWith("devServers.bridge")) throw error("native_profile_required")
          if (connection.socket?.send(text) != true) throw error("send_failed")
        }
      }
    }
    AsyncFunction("acknowledge") { id: String, generation: Double, sequence: Double ->
      synchronized(lock) {
        val connection = connections[id]
        if (connection != null && connection.generation == generation && HostTls.safe(sequence))
          connection.deliveries.remove(sequence.toLong())?.let { connection.deliveryBytes -= it }
      }
    }
    AsyncFunction("close") { id: String, generation: Double -> synchronized(lock) { connections[id]?.takeIf { it.generation == generation }?.let { finish(it, "detached", false) } } }
    AsyncFunction("readBulk") Coroutine { handle: String, descriptor: BulkDescriptor, offset: Double ->
      val credential = synchronized(lock) { credentials[handle] ?: throw error("credential_handle_expired") }
      if (credential.voice != null) throw error("voice_scope_denied")
      require(descriptor.kind == "bulk" && descriptor.environmentId == credential.binding.environmentId && Regex("[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}").matches(descriptor.transferId) && !descriptor.transferId.contains('/'))
      require(HostTls.safe(descriptor.totalBytes) && descriptor.totalBytes <= 33554432 && HostTls.safe(descriptor.chunkBytes) && descriptor.chunkBytes in 1.0..65536.0 && HostTls.safe(descriptor.expiresAt) && descriptor.expiresAt > System.currentTimeMillis())
      require(Regex("[a-f0-9]{64}").matches(descriptor.sha256) && HostTls.safe(offset) && offset < descriptor.totalBytes)
      val value = secret(credential.binding)
      if (!MessageDigest.isEqual(credential.digest, digest(value))) { invalidate(credential.binding.machineId); throw error("credential_rotated") }
      val client = HostTls.client(credential.binding)
      val endpoint = URI(credential.binding.endpoint)
      val url = HttpUrl.Builder().scheme("https").host(endpoint.host).port(if (endpoint.port < 0) 443 else endpoint.port).addPathSegment("ws-bulk").addPathSegment(descriptor.transferId).addQueryParameter("offset", offset.toLong().toString()).build()
      val call = client.newCall(Request.Builder().url(url).header("Authorization", "Bearer $value")
        .apply { deviceProof(proofSeed(credential.binding), credential.binding, value, url.encodedPath)?.let { header(DeviceProof.HEADER, it) } }.build())
      val epoch = synchronized(lock) {
        if (!foreground || !accessAllowed || credential.binding.accessEpoch != accessEpoch || credentials[handle] !== credential || bulkCalls.size >= 2) throw error("bulk_unavailable")
        bulkCalls[call] = credential.binding.machineId; lifecycleEpoch
      }
      try {
        withContext(Dispatchers.IO) {
          call.execute().use { response ->
            if (!response.isSuccessful || response.priorResponse != null) throw error("bulk_response")
            val source = response.body?.source() ?: throw error("bulk_response")
            val bytes = source.readByteArray(minOf(descriptor.chunkBytes.toLong(), descriptor.totalBytes.toLong() - offset.toLong()))
            if (!source.exhausted()) throw error("bulk_oversized")
            synchronized(lock) { if (!foreground || !accessAllowed || lifecycleEpoch != epoch || credentials[handle] !== credential) throw error("access_changed") }
            mapOf("dataBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP))
          }
        }
      } finally {
        synchronized(lock) { bulkCalls.remove(call) }
        client.dispatcher.cancelAll(); client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown()
      }
    }
    OnActivityEntersBackground { synchronized(lock) { foreground = false; accessAllowed = false; invalidate(preserveVoice = true) } }
    OnActivityEntersForeground { foreground = true }
    OnDestroy { VoiceCompanionRuntime.remove(voiceListener); synchronized(lock) { foreground = false; accessAllowed = false; invalidate() } }
  }
}
