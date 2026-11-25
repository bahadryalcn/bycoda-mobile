import CryptoKit
import Foundation

/**
 * Device proof-of-possession (spec v1, `src/integrations/device-proof.ts`): a signed JWS sent as the `DPoP` header of every
 * Host request that carries the device bearer. The 32-byte Ed25519 seed lives in SecureStore next to the credential
 * (`bycoda.remote.proof.<machineId>`, 43 base64url characters); JavaScript writes it, only this module reads it for sockets.
 */
enum DeviceProof {
  static let header = "DPoP"
  static func seedKey(_ machineId: String) -> String { "bycoda.remote.proof.\(machineId)" }

  static func base64url(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
  static func decodeSeed(_ value: String) -> Data? {
    guard value.utf8.count == 43, value.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_").contains($0) }) else { return nil }
    let padded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="
    guard let data = Data(base64Encoded: padded), data.count == 32 else { return nil }
    return data
  }
  /** Request path without query or fragment: the `htu` claim. */
  static func path(_ url: URL) -> String { url.path.isEmpty ? "/" : url.path }
  private static func escape(_ value: String) -> String {
    var out = ""
    for scalar in value.unicodeScalars {
      switch scalar {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      default: out += scalar.value < 0x20 ? String(format: "\\u%04x", scalar.value) : String(scalar)
      }
    }
    return out
  }

  /** nil when the seed is not a valid Ed25519 seed. `jti` and `now` are injectable for tests. */
  static func sign(seed: Data, token: String, method: String, path: String, environmentId: String, jti: String? = nil, now: Date = Date()) -> String? {
    guard seed.count == 32, let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: seed) else { return nil }
    let x = base64url(key.publicKey.rawRepresentation)
    var random = Data(count: 16)
    if jti == nil { guard random.withUnsafeMutableBytes({ SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }) == errSecSuccess else { return nil } }
    let header = "{\"typ\":\"dpop+jwt\",\"alg\":\"EdDSA\",\"jwk\":{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"\(x)\"}}"
    let ath = base64url(Data(SHA256.hash(data: Data(token.utf8))))
    let payload = "{\"jti\":\"\(jti ?? base64url(random))\",\"htm\":\"\(escape(method.uppercased()))\",\"htu\":\"\(escape(path))\",\"iat\":\(Int(now.timeIntervalSince1970)),\"ath\":\"\(ath)\",\"eid\":\"\(escape(environmentId))\"}"
    let signingInput = base64url(Data(header.utf8)) + "." + base64url(Data(payload.utf8))
    guard let signature = try? key.signature(for: Data(signingInput.utf8)) else { return nil }
    return signingInput + "." + base64url(signature)
  }
}
