package expo.modules.bycodahostsocket

import org.junit.Assert.*
import org.junit.Test
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.security.cert.CertificateFactory

class HostSpkiTest {
  private fun hex(value: String) = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
  @Test fun hashesTheFullSubjectPublicKeyInfoInsteadOfTheRawPoint() {
    val fixture = javaClass.classLoader!!.getResourceAsStream("host-spki.json")!!.bufferedReader().readText()
    fun field(key: String) = Regex("\"$key\"\\s*:\\s*\"([^\"]+)\"").find(fixture)!!.groupValues[1]
    val spki = hex(field("subjectPublicKeyInfoDerHex"))
    val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(spki))
    val digest = MessageDigest.getInstance("SHA-256")
    val pin = "sha256/" + Base64.getEncoder().encodeToString(digest.digest(key.encoded))
    assertEquals(field("pin"), pin)
    assertFalse(pin == "sha256/" + Base64.getEncoder().encodeToString(digest.digest(hex(field("x963PublicKeyHex")))))
  }
  @Test fun safeCountersRejectNonFiniteFractionalAndUnsafeValues() {
    assertTrue(HostTls.safe(9007199254740991.0))
    for (value in listOf(-1.0, 0.5, Double.POSITIVE_INFINITY, Double.NaN, 9007199254740992.0)) assertFalse(HostTls.safe(value))
  }
  @Test fun parsesTheSharedPublicCaCertificateAndPinsItsSpki() {
    val fixture = javaClass.classLoader!!.getResourceAsStream("public-ca-pin-vector.json")!!.bufferedReader().readText()
    fun field(key: String) = Regex("\"$key\"\\s*:\\s*\"([^\"]+)\"").find(fixture)!!.groupValues[1].replace("\\n", "\n")
    val ca = CertificateFactory.getInstance("X.509").generateCertificate(field("caCertificatePem").byteInputStream()) as java.security.cert.X509Certificate
    ca.checkValidity(); assertTrue(ca.basicConstraints >= 0)
    val pin = "sha256/" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(ca.publicKey.encoded))
    assertEquals(field("caSpkiPin"), pin)
  }
}
