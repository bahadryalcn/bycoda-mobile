import XCTest
import CryptoKit
@testable import BycodaHostSocket

final class DeviceProofTests: XCTestCase {
  private func vector() throws -> [String: String] {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "device-proof-vector", withExtension: "json"))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: String])
  }
  func testHeaderAndPayloadMatchThePinnedVectorAndTheSignatureVerifies() throws {
    let v = try vector()
    let seed = try XCTUnwrap(DeviceProof.decodeSeed(try XCTUnwrap(v["seed"])))
    let proof = try XCTUnwrap(DeviceProof.sign(seed: seed, token: v["token"]!, method: "POST", path: v["htu"]!, environmentId: v["eid"]!, jti: v["jti"]!, now: Date(timeIntervalSince1970: TimeInterval(v["iat"]!)!)))
    let expected = try XCTUnwrap(v["proof"]).split(separator: ".").map(String.init)
    let actual = proof.split(separator: ".").map(String.init)
    XCTAssertEqual(actual.count, 3)
    XCTAssertEqual(actual[0], expected[0])
    XCTAssertEqual(actual[1], expected[1])
    let key = try Curve25519.Signing.PrivateKey(rawRepresentation: seed).publicKey
    func decode(_ s: String) -> Data { Data(base64Encoded: s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + String(repeating: "=", count: (4 - s.count % 4) % 4))! }
    XCTAssertTrue(key.isValidSignature(decode(actual[2]), for: Data((actual[0] + "." + actual[1]).utf8)))
  }
  func testRejectsMalformedSeeds() {
    XCTAssertNil(DeviceProof.decodeSeed("short"))
    XCTAssertNil(DeviceProof.decodeSeed(String(repeating: "!", count: 43)))
    XCTAssertEqual(DeviceProof.path(URL(string: "https://host.example/ws-bulk/abc?offset=0")!), "/ws-bulk/abc")
  }
}
