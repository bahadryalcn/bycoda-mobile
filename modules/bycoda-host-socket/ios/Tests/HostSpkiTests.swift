import XCTest
import CryptoKit
@testable import BycodaHostSocket

final class HostSpkiTests: XCTestCase {
  func testFullDerSpkiMatchesNodeAndRawPointDoesNot() throws {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "host-spki", withExtension: "json"))
    let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: String])
    func hex(_ value: String) -> Data {
      let characters = Array(value); return Data(stride(from: 0, to: characters.count, by: 2).map { UInt8(String(characters[$0...($0+1)]), radix: 16)! })
    }
    let raw = hex(try XCTUnwrap(fixture["x963PublicKeyHex"]))
    let key = try P256.Signing.PublicKey(x963Representation: raw)
    XCTAssertEqual(key.derRepresentation, hex(try XCTUnwrap(fixture["subjectPublicKeyInfoDerHex"])))
    let pin = "sha256/" + Data(SHA256.hash(data: key.derRepresentation)).base64EncodedString()
    XCTAssertEqual(pin, fixture["pin"])
    XCTAssertNotEqual(pin, "sha256/" + Data(SHA256.hash(data: raw)).base64EncodedString())
  }
  func testSharedPublicCaCertificateUsesTheSameSpki() throws {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "public-ca-pin-vector", withExtension: "json"))
    let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: String])
    var ca = HostCa(); ca.version = 1; ca.environmentId = "fixture-environment"; ca.caGeneration = 1
    ca.caCertificatePem = try XCTUnwrap(fixture["caCertificatePem"]); ca.caSpkiPin = try XCTUnwrap(fixture["caSpkiPin"])
    var binding = HostBinding(); binding.environmentId = ca.environmentId; binding.tls = ca
    XCTAssertNotNil(try HostTls.ca(binding))
    ca.caSpkiPin = "sha256/" + String(repeating: "a", count: 43) + "="; binding.tls = ca
    XCTAssertThrowsError(try HostTls.ca(binding))
  }
}
