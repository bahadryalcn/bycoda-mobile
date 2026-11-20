import XCTest
@testable import BycodaHostSocket

final class Socks5ParserTests: XCTestCase {
  private let alias = "b0123456789abcdef0123456789abcdef.test"
  private let port: UInt16 = 5173

  private func connectRequest(domain: String? = nil, port requested: UInt16? = nil, command: UInt8 = 0x01, atyp: UInt8 = 0x03) -> [UInt8] {
    let name = Array((domain ?? alias).utf8)
    let value = requested ?? port
    return [0x05, command, 0x00, atyp, UInt8(name.count)] + name + [UInt8(value >> 8), UInt8(value & 0xFF)]
  }

  func testGreetingWithNoAuthIsAccepted() {
    XCTAssertEqual(Socks5.parseGreeting([0x05, 0x01, 0x00]), .accepted(consumed: 3))
    XCTAssertEqual(Socks5.parseGreeting([0x05, 0x02, 0x02, 0x00, 0x99]), .accepted(consumed: 4))
    XCTAssertEqual(Socks5.methodSelected, [0x05, 0x00])
  }

  func testGreetingWithoutNoAuthIsRefused() {
    XCTAssertEqual(Socks5.parseGreeting([0x05, 0x01, 0x02]), .noAcceptableMethod(consumed: 3))
    XCTAssertEqual(Socks5.noAcceptableMethod, [0x05, 0xFF])
  }

  func testGreetingRejectsOtherVersionsAndEmptyMethodList() {
    XCTAssertEqual(Socks5.parseGreeting([0x04, 0x01, 0x00]), .malformed)
    XCTAssertEqual(Socks5.parseGreeting([0x05, 0x00]), .malformed)
  }

  func testGreetingPartialReads() {
    XCTAssertEqual(Socks5.parseGreeting([]), .incomplete)
    XCTAssertEqual(Socks5.parseGreeting([0x05]), .incomplete)
    XCTAssertEqual(Socks5.parseGreeting([0x05, 0x02, 0x00]), .incomplete)
  }

  func testConnectToAliasAndPortIsAccepted() {
    let request = connectRequest()
    XCTAssertEqual(Socks5.parseRequest(request, alias: alias, port: port), .connect(consumed: request.count))
    // Bytes pipelined after the request are not consumed.
    XCTAssertEqual(Socks5.parseRequest(request + [0x47, 0x45, 0x54], alias: alias, port: port), .connect(consumed: request.count))
  }

  func testWrongDomainIsRefusedWithNotAllowed() {
    let request = connectRequest(domain: "example.com")
    XCTAssertEqual(Socks5.parseRequest(request, alias: alias, port: port), .refused(reply: 0x02))
    XCTAssertEqual(Socks5.parseRequest(connectRequest(domain: "localhost"), alias: alias, port: port), .refused(reply: 0x02))
  }

  func testWrongPortIsRefusedWithNotAllowed() {
    XCTAssertEqual(Socks5.parseRequest(connectRequest(port: 80), alias: alias, port: port), .refused(reply: 0x02))
    XCTAssertEqual(Socks5.parseRequest(connectRequest(port: 5174), alias: alias, port: port), .refused(reply: 0x02))
  }

  func testIpv4AddressTypeIsRejected() {
    let request: [UInt8] = [0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0x14, 0x45]
    XCTAssertEqual(Socks5.parseRequest(request, alias: alias, port: port), .refused(reply: 0x08))
    XCTAssertEqual(Socks5.parseRequest(Array(request.prefix(4)), alias: alias, port: port), .refused(reply: 0x08))
  }

  func testIpv6AddressTypeIsRejected() {
    let request: [UInt8] = [0x05, 0x01, 0x00, 0x04] + [UInt8](repeating: 0, count: 15) + [0x01, 0x14, 0x45]
    XCTAssertEqual(Socks5.parseRequest(request, alias: alias, port: port), .refused(reply: 0x08))
  }

  func testOtherCommandsAreRefused() {
    XCTAssertEqual(Socks5.parseRequest(connectRequest(command: 0x02), alias: alias, port: port), .refused(reply: 0x07))
    XCTAssertEqual(Socks5.parseRequest(connectRequest(command: 0x03), alias: alias, port: port), .refused(reply: 0x07))
  }

  func testMalformedRequests() {
    XCTAssertEqual(Socks5.parseRequest([0x04, 0x01, 0x00, 0x03], alias: alias, port: port), .malformed)
    XCTAssertEqual(Socks5.parseRequest([0x05, 0x01, 0x01, 0x03, 0x01, 0x61, 0x00, 0x50], alias: alias, port: port), .malformed)
    XCTAssertEqual(Socks5.parseRequest([0x05, 0x01, 0x00, 0x03, 0x00, 0x00, 0x50], alias: alias, port: port), .malformed)
  }

  func testRequestPartialReadsAtEveryByteBoundary() {
    let request = connectRequest()
    for length in 0..<request.count {
      XCTAssertEqual(Socks5.parseRequest(Array(request.prefix(length)), alias: alias, port: port), .incomplete, "prefix of \(length) bytes")
    }
    XCTAssertEqual(Socks5.parseRequest(request, alias: alias, port: port), .connect(consumed: request.count))
  }

  func testReplyFrame() {
    XCTAssertEqual(Socks5.reply(0x00), [0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
    XCTAssertEqual(Socks5.reply(0x05)[1], 0x05)
  }
}
