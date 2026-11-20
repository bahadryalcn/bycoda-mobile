import Foundation

/**
 * Minimal SOCKS5 server-side parser for the phone loopback tunnel: method 0x00 only, CONNECT only, domain (ATYP 0x03)
 * only. Pure and stateless: the caller keeps the receive buffer and drops `consumed` bytes after a complete message.
 */
enum Socks5 {
  enum Greeting: Equatable {
    case incomplete
    /** Reply `[05 00]`. */
    case accepted(consumed: Int)
    /** Reply `[05 FF]`, then close. */
    case noAcceptableMethod(consumed: Int)
    /** Not SOCKS5; close without a reply. */
    case malformed
  }
  enum Request: Equatable {
    case incomplete
    case connect(consumed: Int)
    /** Send `Socks5.reply(code)`, then close. */
    case refused(reply: UInt8)
    /** Invalid framing; close without a reply. */
    case malformed
  }

  static let replySucceeded: UInt8 = 0x00
  static let replyGeneralFailure: UInt8 = 0x01
  static let replyNotAllowed: UInt8 = 0x02
  static let replyConnectionRefused: UInt8 = 0x05
  static let replyCommandNotSupported: UInt8 = 0x07
  static let replyAddressTypeNotSupported: UInt8 = 0x08

  static let methodSelected: [UInt8] = [0x05, 0x00]
  static let noAcceptableMethod: [UInt8] = [0x05, 0xFF]
  /** Largest message the parser can ask for: greeting 2 + 255, request 4 + 1 + 255 + 2. */
  static let maxHandshakeBytes = 512

  static func reply(_ code: UInt8) -> [UInt8] { [0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0] }

  static func parseGreeting(_ bytes: [UInt8]) -> Greeting {
    guard let version = bytes.first else { return .incomplete }
    guard version == 0x05 else { return .malformed }
    guard bytes.count >= 2 else { return .incomplete }
    let methodCount = Int(bytes[1])
    guard methodCount >= 1 else { return .malformed }
    let total = 2 + methodCount
    guard bytes.count >= total else { return .incomplete }
    return bytes[2..<total].contains(0x00) ? .accepted(consumed: total) : .noAcceptableMethod(consumed: total)
  }

  static func parseRequest(_ bytes: [UInt8], alias: String, port: UInt16) -> Request {
    guard let version = bytes.first else { return .incomplete }
    guard version == 0x05 else { return .malformed }
    guard bytes.count >= 4 else { return .incomplete }
    guard bytes[2] == 0x00 else { return .malformed }
    guard bytes[1] == 0x01 else { return .refused(reply: replyCommandNotSupported) }
    guard bytes[3] == 0x03 else { return .refused(reply: replyAddressTypeNotSupported) }
    guard bytes.count >= 5 else { return .incomplete }
    let length = Int(bytes[4])
    guard length >= 1 else { return .malformed }
    let total = 5 + length + 2
    guard bytes.count >= total else { return .incomplete }
    let domain = String(decoding: bytes[5..<(5 + length)], as: UTF8.self)
    let requestedPort = (UInt16(bytes[5 + length]) << 8) | UInt16(bytes[6 + length])
    guard domain == alias, requestedPort == port else { return .refused(reply: replyNotAllowed) }
    return .connect(consumed: total)
  }
}
