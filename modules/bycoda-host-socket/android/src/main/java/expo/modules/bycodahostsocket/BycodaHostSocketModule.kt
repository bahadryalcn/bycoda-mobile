package expo.modules.bycodahostsocket

import android.util.Base64
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
  private data class Credential(val binding: HostBinding, val digest: ByteArray)
  private class Connection(val id: String, val generation: Double, val credential: Credential, val client: OkHttpClient, val opening: CompletableDeferred<Unit>) {
    var socket: WebSocket? = null
    var opened = false
    var settled = false
    var sequence = 0L
    val deliveries = linkedMapOf<Long, Int>()
    var deliveryBytes = 0
  }
  private val lock = Any()
  private val credentials = linkedMapOf<String, Credential>()
  private val connections = linkedMapOf<String, Connection>()
  // Logical detach does not release admission while the SDK still owns I/O.
  private val socketJobs = mutableSetOf<Connection>()
  private val bulkCalls = linkedMapOf<Call, String>()
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
  private fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
  private fun current(connection: Connection) = foreground && accessAllowed && connections[connection.id] === connection
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
      if (!connection.settled) { connection.settled = true; connection.opening.completeExceptionally(error(code)) }
      event(connection, if (failed) "error" else "closed", mapOf("code" to code))
    }
  }
  private fun invalidate(machineId: String? = null) {
    synchronized(lock) {
      lifecycleEpoch++
      credentials.entries.removeAll { machineId == null || it.value.binding.machineId == machineId }
      connections.values.toList().filter { machineId == null || it.credential.binding.machineId == machineId }.forEach { finish(it, "credentials_invalidated", true) }
      bulkCalls.entries.toList().filter { machineId == null || it.value == machineId }.forEach { it.key.cancel() }
    }
  }
  private suspend fun acquire(binding: HostBinding): Map<String, Any> {
    validate(binding)
    val epoch = synchronized(lock) { if (!foreground || !accessAllowed || binding.accessEpoch != accessEpoch || credentials.size >= 64) throw error("unavailable"); lifecycleEpoch }
    val value = secret(binding)
    return synchronized(lock) {
      if (!foreground || !accessAllowed || binding.accessEpoch != accessEpoch || lifecycleEpoch != epoch || credentials.size >= 64) throw error("access_changed")
      val handle = UUID.randomUUID().toString()
      credentials[handle] = Credential(binding, digest(value))
      mapOf("handle" to handle, "machineId" to binding.machineId, "environmentId" to binding.environmentId, "credentialGeneration" to binding.credentialGeneration, "accessEpoch" to binding.accessEpoch)
    }
  }
  override fun definition() = ModuleDefinition {
    Name("BycodaHostSocket")
    Events("onSocketEvent")
    AsyncFunction("setAccess") { active: Boolean, epoch: Double ->
      synchronized(lock) {
        require(HostTls.safe(epoch) && epoch >= accessEpoch)
        if (active && !accessAllowed) require(epoch > accessEpoch)
        if (!active || epoch != accessEpoch) invalidate()
        accessEpoch = epoch; accessAllowed = active && foreground
      }
    }
    AsyncFunction("acquireCredential") Coroutine { binding: HostBinding -> acquire(binding) }
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
    AsyncFunction("open") Coroutine { handle: String, id: String, generation: Double ->
      require(id.length in 1..200 && HostTls.safe(generation))
      val credential = synchronized(lock) { credentials[handle] ?: throw error("credential_handle_expired") }
      val value = secret(credential.binding)
      if (!MessageDigest.isEqual(credential.digest, digest(value))) { invalidate(credential.binding.machineId); throw error("credential_rotated") }
      val client = HostTls.client(credential.binding)
      val connection = Connection(id, generation, credential, client, CompletableDeferred())
      synchronized(lock) {
        if (!foreground || !accessAllowed || credential.binding.accessEpoch != accessEpoch || credentials[handle] !== credential || socketJobs.size >= 4 || socketJobs.any { it.id == id }) throw error("connection_unavailable")
        connections[id] = connection
        socketJobs.add(connection)
      }
      val request = Request.Builder().url(credential.binding.endpoint).header("Authorization", "Bearer $value").header("Sec-WebSocket-Protocol", "bycoda.rpc.v2").build()
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
            if (bytes > 1048576 || connection.deliveries.size >= 32 || connection.deliveryBytes + bytes > 2097152) { finish(connection, "overload", true); return }
            val sequence = ++connection.sequence
            connection.deliveries[sequence] = bytes; connection.deliveryBytes += bytes
            event(connection, "message", mapOf("sequence" to sequence.toDouble(), "text" to text))
          }
        }
        override fun onMessage(ws: WebSocket, bytes: ByteString) { finish(connection, "binary_not_supported", true) }
        override fun onFailure(ws: WebSocket, cause: Throwable, response: Response?) {
          synchronized(lock) { socketJobs.remove(connection) }
          finish(connection, if (response?.code == 401 || response?.code == 403) "authentication" else if (cause is SSLException) "tls" else "network", true)
        }
        override fun onClosing(ws: WebSocket, code: Int, reason: String) { ws.close(code, null); finish(connection, "remote_closed", false) }
        override fun onClosed(ws: WebSocket, code: Int, reason: String) { synchronized(lock) { socketJobs.remove(connection) }; finish(connection, "remote_closed", false) }
      })
      connection.opening.await()
    }
    AsyncFunction("send") { id: String, generation: Double, text: String ->
      synchronized(lock) {
        val connection = connections[id] ?: throw error("closed")
        if (!current(connection) || connection.generation != generation || !connection.opened) throw error("stale_connection")
        if (text.toByteArray(Charsets.UTF_8).size > 1048576 || (connection.socket?.queueSize() ?: 0) + text.toByteArray(Charsets.UTF_8).size > 8388608) throw error("overload")
        val method = runCatching { JSONObject(text).optString("method") }.getOrDefault("")
        if (method.startsWith("native.") || method.startsWith("devServers.bridge")) throw error("native_profile_required")
        if (connection.socket?.send(text) != true) throw error("send_failed")
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
      require(descriptor.kind == "bulk" && descriptor.environmentId == credential.binding.environmentId && Regex("[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}").matches(descriptor.transferId) && !descriptor.transferId.contains('/'))
      require(HostTls.safe(descriptor.totalBytes) && descriptor.totalBytes <= 33554432 && HostTls.safe(descriptor.chunkBytes) && descriptor.chunkBytes in 1.0..65536.0 && HostTls.safe(descriptor.expiresAt) && descriptor.expiresAt > System.currentTimeMillis())
      require(Regex("[a-f0-9]{64}").matches(descriptor.sha256) && HostTls.safe(offset) && offset < descriptor.totalBytes)
      val value = secret(credential.binding)
      if (!MessageDigest.isEqual(credential.digest, digest(value))) { invalidate(credential.binding.machineId); throw error("credential_rotated") }
      val client = HostTls.client(credential.binding)
      val endpoint = URI(credential.binding.endpoint)
      val url = HttpUrl.Builder().scheme("https").host(endpoint.host).port(if (endpoint.port < 0) 443 else endpoint.port).addPathSegment("ws-bulk").addPathSegment(descriptor.transferId).addQueryParameter("offset", offset.toLong().toString()).build()
      val call = client.newCall(Request.Builder().url(url).header("Authorization", "Bearer $value").build())
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
    OnActivityEntersBackground { synchronized(lock) { foreground = false; accessAllowed = false; invalidate() } }
    OnActivityEntersForeground { foreground = true }
    OnDestroy { synchronized(lock) { foreground = false; accessAllowed = false; invalidate() } }
  }
}
