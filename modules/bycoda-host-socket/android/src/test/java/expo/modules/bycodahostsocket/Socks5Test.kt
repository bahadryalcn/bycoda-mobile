package expo.modules.bycodahostsocket

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Socks5Test {
  private val alias = "b0123456789abcdef0123456789abcdef.test"

  private fun connect(name: String, port: Int, atyp: Int = 3, cmd: Int = 1): ByteArray {
    val n = name.toByteArray(Charsets.US_ASCII)
    return byteArrayOf(5, cmd.toByte(), 0, atyp.toByte(), n.size.toByte()) + n + byteArrayOf((port shr 8).toByte(), port.toByte())
  }

  private fun greeting(buf: ByteArray, len: Int = buf.size) = Socks5.parseGreeting(buf.copyOf(maxOf(len, 0)), len)
  private fun request(buf: ByteArray, len: Int = buf.size, port: Int = 3000) = Socks5.parseConnect(buf.copyOf(len), len, alias, port)

  @Test fun greetingAcceptsNoAuth() { assertEquals(Socks5Parse.Done(3), greeting(byteArrayOf(5, 1, 0))) }
  @Test fun greetingAcceptsNoAuthAmongMethods() { assertEquals(Socks5Parse.Done(4), greeting(byteArrayOf(5, 2, 2, 0))) }
  @Test fun greetingRejectsWithoutNoAuth() { assertEquals(Socks5Parse.Reject(0xFF), greeting(byteArrayOf(5, 1, 2))) }
  @Test fun greetingRejectsWrongVersionSilently() { assertEquals(Socks5Parse.Reject(null), greeting(byteArrayOf(4, 1, 0))) }
  @Test fun greetingRejectsZeroMethods() { assertEquals(Socks5Parse.Reject(null), greeting(byteArrayOf(5, 0))) }
  @Test fun greetingPartialReadsNeedMore() {
    val full = byteArrayOf(5, 2, 2, 0)
    for (len in 0 until full.size) assertEquals(Socks5Parse.NeedMore, greeting(full, len))
    assertEquals(Socks5Parse.Done(4), greeting(full))
  }

  @Test fun connectAcceptsAliasAndPort() {
    val frame = connect(alias, 3000)
    assertEquals(Socks5Parse.Done(frame.size), request(frame))
  }
  @Test fun connectIsCaseInsensitiveOnDomain() {
    val frame = connect(alias.uppercase(), 3000)
    assertEquals(Socks5Parse.Done(frame.size), request(frame))
  }
  @Test fun connectReportsConsumedWhenDataFollows() {
    val frame = connect(alias, 3000)
    val withData = frame + "GET / HTTP/1.1".toByteArray()
    assertEquals(Socks5Parse.Done(frame.size), request(withData))
  }
  @Test fun connectPartialReadsNeedMoreAtEveryLength() {
    val frame = connect(alias, 3000)
    for (len in 0 until frame.size) assertEquals("len=$len", Socks5Parse.NeedMore, request(frame, len))
  }
  @Test fun connectRejectsWrongPort() { assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(connect(alias, 3001))) }
  @Test fun connectRejectsOtherDomain() { assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(connect("example.com", 3000))) }
  @Test fun connectRejectsAliasSuffixAndPrefixTricks() {
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(connect("x$alias", 3000)))
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(connect("$alias.evil.test", 3000)))
  }
  @Test fun connectRejectsIpv4Atyp() {
    val frame = byteArrayOf(5, 1, 0, 1, 127, 0, 0, 1, 0x0B, 0xB8.toByte())
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(frame))
  }
  @Test fun connectRejectsIpv6Atyp() {
    val frame = byteArrayOf(5, 1, 0, 4) + ByteArray(16) + byteArrayOf(0x0B, 0xB8.toByte())
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(frame))
  }
  @Test fun connectRejectsAtypEarlyBeforeFullFrame() {
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(byteArrayOf(5, 1, 0, 1), 4))
  }
  @Test fun connectRejectsBindAndUdp() {
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_COMMAND_UNSUPPORTED), request(connect(alias, 3000, cmd = 2)))
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_COMMAND_UNSUPPORTED), request(connect(alias, 3000, cmd = 3)))
  }
  @Test fun connectRejectsEmptyDomainAndWrongVersion() {
    assertEquals(Socks5Parse.Reject(Socks5.REPLY_NOT_ALLOWED), request(byteArrayOf(5, 1, 0, 3, 0, 0, 80)))
    assertEquals(Socks5Parse.Reject(null), request(byteArrayOf(4, 1, 0, 3)))
  }
  @Test fun replyShape() {
    val ok = Socks5.reply(Socks5.REPLY_OK)
    assertEquals(10, ok.size); assertEquals(5, ok[0].toInt()); assertEquals(0, ok[1].toInt())
  }

  private fun target(port: Int = 3000, pid: Int = 42) = TunnelTargetSpec("project-1", "dev-1", pid, "2026-11-19T10:00:00.000Z", port, "127.0.0.1")

  @Test fun endpointMustMatchHandleHostAndPath() {
    val bound = "wss://host.example:8443/ws"
    assertTrue(TunnelRules.endpointValid("wss://host.example:8443/ws-tunnel", bound))
    assertTrue(TunnelRules.endpointValid("wss://HOST.example:8443/ws-tunnel", bound))
    assertFalse(TunnelRules.endpointValid("wss://other.example:8443/ws-tunnel", bound))
    assertFalse(TunnelRules.endpointValid("wss://host.example:9443/ws-tunnel", bound))
    assertFalse(TunnelRules.endpointValid("wss://host.example:8443/ws", bound))
    assertFalse(TunnelRules.endpointValid("wss://host.example:8443/ws-tunnel?x=1", bound))
    assertFalse(TunnelRules.endpointValid("wss://u@host.example:8443/ws-tunnel", bound))
    assertFalse(TunnelRules.endpointValid("ws://host.example:8443/ws-tunnel", bound))
    assertFalse(TunnelRules.endpointValid("wss://host.example:8443/ws-tunnel/", bound))
    assertTrue(TunnelRules.endpointValid("wss://host.example/ws-tunnel", "wss://host.example:443/ws"))
  }

  @Test fun targetValidation() {
    assertTrue(TunnelRules.targetValid(target()))
    assertFalse(TunnelRules.targetValid(target(port = 0)))
    assertFalse(TunnelRules.targetValid(target(port = 65536)))
    assertFalse(TunnelRules.targetValid(target(pid = 0)))
    assertFalse(TunnelRules.targetValid(TunnelTargetSpec("", "dev-1", 1, "t", 1, "127.0.0.1")))
  }

  @Test fun errorCodeMapping() {
    assertEquals("identity", TunnelRules.errorCode("identity"))
    assertEquals("connect", TunnelRules.errorCode(null))
    assertEquals("connect", TunnelRules.errorCode("surprise"))
  }

  @Test fun aliasShape() {
    val a = TunnelSession.newAlias()
    assertTrue(Regex("b[0-9a-f]{32}\\.test").matches(a))
    assertFalse(a == TunnelSession.newAlias())
  }
}
