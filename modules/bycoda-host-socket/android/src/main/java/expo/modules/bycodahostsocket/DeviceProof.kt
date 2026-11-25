package expo.modules.bycodahostsocket

import com.google.crypto.tink.subtle.Ed25519Sign
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Device proof-of-possession (spec v1, `src/integrations/device-proof.ts`): a signed JWS sent as the `DPoP` header of every
 * Host request that carries the device bearer. The 32-byte Ed25519 seed lives in SecureStore next to the credential
 * (`bycoda.remote.proof.<machineId>`, 43 base64url characters); JavaScript writes it, only this module reads it for sockets.
 * Tink's pure-Java Ed25519 is used because `java.security` has no Ed25519 below API 33 (minSdk is 24).
 */
object DeviceProof {
  const val HEADER = "DPoP"
  private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  private val random = SecureRandom()

  fun seedKey(machineId: String) = "bycoda.remote.proof.$machineId"

  fun base64url(bytes: ByteArray): String {
    val out = StringBuilder()
    var i = 0
    while (i < bytes.size) {
      val n = ((bytes[i].toInt() and 0xff) shl 16) or
        ((if (i + 1 < bytes.size) bytes[i + 1].toInt() and 0xff else 0) shl 8) or
        (if (i + 2 < bytes.size) bytes[i + 2].toInt() and 0xff else 0)
      out.append(ALPHABET[(n shr 18) and 63]).append(ALPHABET[(n shr 12) and 63])
      if (i + 1 < bytes.size) out.append(ALPHABET[(n shr 6) and 63])
      if (i + 2 < bytes.size) out.append(ALPHABET[n and 63])
      i += 3
    }
    return out.toString()
  }

  /** The 32-byte seed of a stored 43-character base64url value, or null when it is anything else. */
  fun decodeSeed(value: String): ByteArray? {
    if (value.length != 43 || value.any { ALPHABET.indexOf(it) < 0 }) return null
    val out = ByteArray(32)
    var bits = 0
    var acc = 0
    var index = 0
    for (c in value) {
      acc = (acc shl 6) or ALPHABET.indexOf(c)
      bits += 6
      if (bits >= 8) {
        bits -= 8
        out[index++] = ((acc shr bits) and 0xff).toByte()
        acc = acc and ((1 shl bits) - 1)
      }
    }
    return if (index == 32 && acc == 0) out else null
  }

  private fun escape(value: String): String {
    val out = StringBuilder()
    for (c in value) when {
      c == '"' -> out.append("\\\"")
      c == '\\' -> out.append("\\\\")
      c.code < 0x20 -> out.append(String.format("\\u%04x", c.code))
      else -> out.append(c)
    }
    return out.toString()
  }

  /** `path` is the request path without query or fragment (the `htu` claim). `jti` and `iat` are injectable for tests. */
  fun sign(seed: ByteArray, token: String, method: String, path: String, environmentId: String, jti: String? = null, iat: Long = System.currentTimeMillis() / 1000): String? {
    if (seed.size != 32) return null
    return try {
      val signer = Ed25519Sign(seed)
      val x = base64url(Ed25519Sign.KeyPair.newKeyPairFromSeed(seed).publicKey)
      val id = jti ?: base64url(ByteArray(16).also { random.nextBytes(it) })
      val ath = base64url(MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8)))
      val header = "{\"typ\":\"dpop+jwt\",\"alg\":\"EdDSA\",\"jwk\":{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"$x\"}}"
      val payload = "{\"jti\":\"$id\",\"htm\":\"${escape(method.uppercase())}\",\"htu\":\"${escape(path)}\",\"iat\":$iat,\"ath\":\"$ath\",\"eid\":\"${escape(environmentId)}\"}"
      val signingInput = base64url(header.toByteArray(Charsets.UTF_8)) + "." + base64url(payload.toByteArray(Charsets.UTF_8))
      signingInput + "." + base64url(signer.sign(signingInput.toByteArray(Charsets.UTF_8)))
    } catch (_: Exception) {
      null
    }
  }
}
