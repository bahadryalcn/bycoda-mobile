package expo.modules.bycodahostsocket

import com.google.crypto.tink.subtle.Ed25519Verify
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceProofTest {
  private fun vector(): Map<String, String> {
    val json = JSONObject(javaClass.classLoader!!.getResourceAsStream("device-proof-vector.json")!!.bufferedReader().readText())
    return json.keys().asSequence().associateWith { json.getString(it) }
  }

  private fun decode(value: String): ByteArray {
    val padded = value.replace('-', '+').replace('_', '/') + "=".repeat((4 - value.length % 4) % 4)
    return java.util.Base64.getDecoder().decode(padded)
  }

  @Test fun headerAndPayloadMatchThePinnedVectorAndTheSignatureVerifies() {
    val v = vector()
    val seed = DeviceProof.decodeSeed(v.getValue("seed"))
    assertNotNull(seed)
    val proof = DeviceProof.sign(seed!!, v.getValue("token"), "POST", v.getValue("htu"), v.getValue("eid"), v.getValue("jti"), v.getValue("iat").toLong())
    assertNotNull(proof)
    val actual = proof!!.split(".")
    val expected = v.getValue("proof").split(".")
    assertEquals(3, actual.size)
    assertEquals(expected[0], actual[0])
    assertEquals(expected[1], actual[1])
    // Ed25519 is deterministic, so the whole proof equals the shared vector.
    assertEquals(v.getValue("proof"), proof)
    val x = JSONObject(String(decode(actual[0]))).getJSONObject("jwk").getString("x")
    Ed25519Verify(decode(x)).verify(decode(actual[2]), "${actual[0]}.${actual[1]}".toByteArray())
  }

  @Test fun rejectsMalformedSeeds() {
    assertNull(DeviceProof.decodeSeed("short"))
    assertNull(DeviceProof.decodeSeed("!".repeat(43)))
    assertTrue(DeviceProof.base64url(byteArrayOf(0, 1, 2)) == "AAEC")
  }
}
