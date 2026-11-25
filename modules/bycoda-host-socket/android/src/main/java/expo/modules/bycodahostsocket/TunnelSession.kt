package expo.modules.bycodahostsocket

import okhttp3.Dispatcher
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Process-wide lookup so a detached WebView can stop the tunnel that serves its proxy port. */
internal object TunnelRegistry {
  private val byPort = ConcurrentHashMap<Int, TunnelSession>()
  fun add(session: TunnelSession) { byPort[session.proxyPort] = session }
  fun remove(session: TunnelSession) { byPort.remove(session.proxyPort, session) }
  fun stopByPort(port: Int, code: String) { byPort[port]?.stop(code) }
}

/**
 * One phone tunnel: a loopback SOCKS5 listener whose every CONNECT opens its own pinned WSS to the Host and then
 * pipes raw bytes as binary frames. The bearer is never logged and the alias is never logged or put in a message.
 */
internal class TunnelSession(
  val id: String,
  val machineId: String,
  private val client: OkHttpClient,
  private val url: HttpUrl,
  private val bearer: String,
  private val target: TunnelTargetSpec,
  val alias: String,
  /** Seed of the phone key this credential is bound to; null while the Host has not bound one. */
  private val proofSeed: ByteArray? = null,
  private val environmentId: String = "",
  /** `code` is a short machine code; called without holding any module lock. */
  private val onError: (code: String) -> Unit,
  private val onClosed: (code: String) -> Unit,
) {
  private val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
  val proxyPort: Int = server.localPort
  private val stopped = AtomicBoolean(false)
  private val active = AtomicInteger(0)
  private val connections = ConcurrentHashMap.newKeySet<Pipe>()
  private val pool = Executors.newCachedThreadPool { r -> Thread(r, "bycoda-tunnel").apply { isDaemon = true } }
  private val tunnelClient: OkHttpClient = client.newBuilder()
    .dispatcher(Dispatcher().apply { maxRequests = 64; maxRequestsPerHost = TunnelRules.MAX_CONNECTIONS })
    .readTimeout(0, TimeUnit.SECONDS).build()

  fun start() {
    TunnelRegistry.add(this)
    Thread({ acceptLoop() }, "bycoda-tunnel-accept").apply { isDaemon = true }.start()
  }

  fun stop(code: String) {
    if (!stopped.compareAndSet(false, true)) return
    TunnelRegistry.remove(this)
    runCatching { server.close() }
    connections.toList().forEach { it.close(abort = true) }
    pool.shutdownNow()
    tunnelClient.dispatcher.cancelAll()
    tunnelClient.connectionPool.evictAll()
    tunnelClient.dispatcher.executorService.shutdown()
    client.dispatcher.executorService.shutdown()
    onClosed(code)
  }

  private fun acceptLoop() {
    while (!stopped.get()) {
      val socket = try { server.accept() } catch (_: Exception) { return }
      if (active.incrementAndGet() > TunnelRules.MAX_CONNECTIONS) { active.decrementAndGet(); runCatching { socket.close() }; continue }
      try { pool.execute { try { handle(socket) } finally { active.decrementAndGet() } } }
      catch (_: Exception) { active.decrementAndGet(); runCatching { socket.close() } }
    }
  }

  private inner class Pipe(val socket: Socket) {
    @Volatile var ws: WebSocket? = null
    private val closed = AtomicBoolean(false)
    fun close(abort: Boolean) {
      if (!closed.compareAndSet(false, true)) return
      connections.remove(this)
      runCatching { socket.close() }
      if (abort) ws?.cancel() else ws?.close(1000, null)
    }
    val isClosed get() = closed.get()
  }

  private fun handle(socket: Socket) {
    val pipe = Pipe(socket)
    connections.add(pipe)
    if (stopped.get()) { pipe.close(true); return }
    try {
      socket.tcpNoDelay = true
      socket.soTimeout = 10_000
      val input = socket.getInputStream()
      val output = socket.getOutputStream()
      val buf = ByteArray(Socks5.MAX_FRAME * 2)
      var len = 0
      fun fill(): Boolean {
        if (len >= buf.size) return false
        val n = input.read(buf, len, buf.size - len)
        if (n < 0) return false
        len += n
        return true
      }
      fun consume(n: Int) { System.arraycopy(buf, n, buf, 0, len - n); len -= n }

      var greeting = Socks5.parseGreeting(buf, len)
      while (greeting is Socks5Parse.NeedMore) { if (!fill()) { pipe.close(true); return }; greeting = Socks5.parseGreeting(buf, len) }
      when (greeting) {
        is Socks5Parse.Reject -> { if (greeting.reply != null) output.write(Socks5.METHOD_REJECT); pipe.close(true); return }
        is Socks5Parse.Done -> { consume(greeting.consumed); output.write(Socks5.METHOD_ACCEPT) }
        else -> { pipe.close(true); return }
      }
      var request = Socks5.parseConnect(buf, len, alias, target.port)
      while (request is Socks5Parse.NeedMore) { if (!fill()) { pipe.close(true); return }; request = Socks5.parseConnect(buf, len, alias, target.port) }
      when (request) {
        is Socks5Parse.Reject -> { if (request.reply != null) output.write(Socks5.reply(request.reply)); pipe.close(true); return }
        is Socks5Parse.Done -> consume(request.consumed)
        else -> { pipe.close(true); return }
      }

      val opened = CountDownLatch(1)
      val failure = arrayOfNulls<String>(1)
      val websocket = tunnelClient.newWebSocket(
        Request.Builder().url(url).header("Authorization", "Bearer $bearer").header("Sec-WebSocket-Protocol", TunnelRules.SUBPROTOCOL)
          // A fresh proof per CONNECT: every WSS upgrade of this tunnel is its own request.
          .apply { proofSeed?.let { DeviceProof.sign(it, bearer, "GET", url.encodedPath, environmentId) }?.let { header(DeviceProof.HEADER, it) } }.build(),
        object : WebSocketListener() {
          override fun onOpen(ws: WebSocket, response: Response) {
            if (response.header("Sec-WebSocket-Protocol") != TunnelRules.SUBPROTOCOL) { failure[0] = "schema"; ws.cancel() }
            opened.countDown()
          }
          override fun onMessage(ws: WebSocket, bytes: ByteString) {
            try { socket.getOutputStream().write(bytes.toByteArray()) } catch (_: Exception) { pipe.close(true) }
          }
          // The Host only sends binary frames; a text frame is a protocol violation.
          override fun onMessage(ws: WebSocket, text: String) { ws.close(1003, null); pipe.close(true) }
          override fun onClosing(ws: WebSocket, code: Int, reason: String) { ws.close(1000, null); pipe.close(false) }
          override fun onClosed(ws: WebSocket, code: Int, reason: String) { pipe.close(false) }
          override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
            if (failure[0] == null) failure[0] = if (response != null) TunnelRules.errorCode(response.header("X-Bycoda-Tunnel-Error")) else "connect"
            opened.countDown(); pipe.close(true)
          }
        },
      )
      pipe.ws = websocket
      if (stopped.get()) { pipe.close(true); return }
      if (!opened.await(10, TimeUnit.SECONDS) || failure[0] != null) {
        val code = failure[0] ?: "connect"
        if (!pipe.isClosed) runCatching { output.write(Socks5.reply(Socks5.REPLY_REFUSED)) }
        onError(code)
        pipe.close(true)
        return
      }
      output.write(Socks5.reply(Socks5.REPLY_OK))
      socket.soTimeout = 0
      if (len > 0) websocket.send(buf.toByteString(0, len))
      val chunk = ByteArray(16 * 1024)
      while (!pipe.isClosed) {
        val n = input.read(chunk)
        if (n < 0) break
        // Backpressure: stop reading the local socket while OkHttp holds more than 1 MiB unsent.
        while (!pipe.isClosed && websocket.queueSize() > 1_048_576) Thread.sleep(5)
        if (!websocket.send(chunk.toByteString(0, n))) break
      }
      pipe.close(false)
    } catch (_: Exception) {
      pipe.close(true)
    }
  }

  companion object {
    fun newAlias(): String {
      val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
      return "b" + bytes.joinToString("") { "%02x".format(it) } + ".test"
    }
  }
}
