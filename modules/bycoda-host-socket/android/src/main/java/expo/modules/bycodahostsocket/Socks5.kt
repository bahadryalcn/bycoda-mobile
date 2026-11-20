package expo.modules.bycodahostsocket

import java.net.URI

/** Outcome of parsing the bytes received so far. Pure, so it is unit-testable without sockets. */
internal sealed interface Socks5Parse {
  /** The frame is incomplete; read more bytes and parse again from the same buffer. */
  object NeedMore : Socks5Parse
  /** A complete frame of [consumed] bytes was accepted. */
  data class Done(val consumed: Int) : Socks5Parse
  /** Refuse and close. [reply] is the SOCKS5 reply byte to send first, or null to close silently. */
  data class Reject(val reply: Int?) : Socks5Parse
}

/**
 * Minimal SOCKS5 server side for the phone tunnel: method 0x00 only, CONNECT only, ATYP 0x03 (domain) only.
 * The domain must equal the tunnel alias and the port the tunnel target port; anything else is refused.
 */
internal object Socks5 {
  const val VERSION = 5
  const val CMD_CONNECT = 1
  const val ATYP_DOMAIN = 3
  const val REPLY_OK = 0x00
  const val REPLY_FAILURE = 0x01
  const val REPLY_NOT_ALLOWED = 0x02
  const val REPLY_HOST_UNREACHABLE = 0x04
  const val REPLY_REFUSED = 0x05
  const val REPLY_COMMAND_UNSUPPORTED = 0x07
  /** Greeting (2 + 255 methods) or request (4 + 1 + 255 + 2) never exceeds this. */
  const val MAX_FRAME = 262

  val METHOD_ACCEPT = byteArrayOf(5, 0)
  val METHOD_REJECT = byteArrayOf(5, 0xFF.toByte())

  fun reply(code: Int) = byteArrayOf(5, code.toByte(), 0, 1, 0, 0, 0, 0, 0, 0)

  fun parseGreeting(buf: ByteArray, len: Int): Socks5Parse {
    if (len < 2) return Socks5Parse.NeedMore
    if (buf[0].toInt() != VERSION) return Socks5Parse.Reject(null)
    val count = buf[1].toInt() and 0xFF
    if (count == 0) return Socks5Parse.Reject(null)
    if (len < 2 + count) return Socks5Parse.NeedMore
    var noAuth = false
    for (i in 0 until count) if (buf[2 + i].toInt() == 0) noAuth = true
    // Only "no authentication" is offered; the listener is bound to loopback and the alias gates the target.
    return if (noAuth) Socks5Parse.Done(2 + count) else Socks5Parse.Reject(0xFF)
  }

  fun parseConnect(buf: ByteArray, len: Int, alias: String, port: Int): Socks5Parse {
    if (len < 1) return Socks5Parse.NeedMore
    if (buf[0].toInt() != VERSION) return Socks5Parse.Reject(null)
    if (len >= 2 && buf[1].toInt() != CMD_CONNECT) return Socks5Parse.Reject(REPLY_COMMAND_UNSUPPORTED)
    if (len >= 3 && buf[2].toInt() != 0) return Socks5Parse.Reject(null)
    if (len >= 4 && buf[3].toInt() != ATYP_DOMAIN) return Socks5Parse.Reject(REPLY_NOT_ALLOWED)
    if (len < 5) return Socks5Parse.NeedMore
    val nameLength = buf[4].toInt() and 0xFF
    if (nameLength == 0) return Socks5Parse.Reject(REPLY_NOT_ALLOWED)
    val total = 5 + nameLength + 2
    if (len < total) return Socks5Parse.NeedMore
    val name = String(buf, 5, nameLength, Charsets.US_ASCII).lowercase()
    val requestedPort = ((buf[5 + nameLength].toInt() and 0xFF) shl 8) or (buf[6 + nameLength].toInt() and 0xFF)
    if (name != alias.lowercase() || requestedPort != port) return Socks5Parse.Reject(REPLY_NOT_ALLOWED)
    return Socks5Parse.Done(total)
  }
}

internal class TunnelTargetSpec(val projectId: String, val id: String, val pid: Int, val startedAt: String, val port: Int, val address: String)

/** Input validation for [BycodaHostSocketModule.startTunnel]; pure so it is unit-testable. */
internal object TunnelRules {
  const val SUBPROTOCOL = "bycoda.tunnel.v1"
  const val PATH = "/ws-tunnel"
  const val MAX_CONNECTIONS = 32
  private val text = Regex("[\\x21-\\x7E]{1,200}")

  /** The tunnel endpoint must be the handle's own host and port with path exactly /ws-tunnel. */
  fun endpointValid(endpoint: String, bindingEndpoint: String): Boolean = runCatching {
    val uri = URI(endpoint)
    val bound = URI(bindingEndpoint)
    uri.scheme == "wss" && uri.host != null && uri.host.equals(bound.host, ignoreCase = true) &&
      effectivePort(uri) == effectivePort(bound) && uri.rawUserInfo == null && uri.rawQuery == null &&
      uri.rawFragment == null && uri.rawPath == PATH
  }.getOrDefault(false)

  private fun effectivePort(uri: URI) = if (uri.port < 0) 443 else uri.port

  fun targetValid(t: TunnelTargetSpec): Boolean =
    t.port in 1..65535 && t.pid > 0 && text.matches(t.projectId) && text.matches(t.id) &&
      t.startedAt.length in 1..200 && text.matches(t.address)

  /** `X-Bycoda-Tunnel-Error` value as a tunnel event code; unknown or missing values become `connect`. */
  fun errorCode(header: String?): String = when (header) {
    "unauthorized", "forbidden", "identity", "limit", "connect" -> header
    else -> "connect"
  }
}
