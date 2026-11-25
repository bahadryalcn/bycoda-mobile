import Foundation
import Network
import Security

/** A tunnel failure whose `code` is surfaced to JS unchanged; it never carries the alias, token or a URL. */
struct TunnelError: Error { let code: String }

struct TunnelTarget {
  let projectId: String
  let id: String
  let pid: Int
  let startedAt: String
  let port: Int
  let address: String

  func validate() throws {
    for text in [projectId, id, startedAt, address] where text.isEmpty || text.utf8.count > 200 { throw TunnelError(code: "target") }
    guard pid > 0, pid <= Int(Int32.max), (1...65_535).contains(port) else { throw TunnelError(code: "target") }
  }
}

enum TunnelEndpoint {
  private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

  /** `wss://<binding host>/ws-tunnel` plus the target query; the Host decodes it like `URLSearchParams`, so `+` must be escaped. */
  static func url(endpoint: String, binding: HostBinding, target: TunnelTarget, alias: String) throws -> URL {
    guard let bound = URLComponents(string: binding.endpoint), let host = bound.host,
      let url = URL(string: endpoint), var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.scheme == "wss", components.host == host, components.port == bound.port, components.user == nil, components.password == nil,
      components.query == nil, components.fragment == nil, components.path == "/ws-tunnel" else { throw TunnelError(code: "endpoint") }
    let items: [(String, String)] = [
      ("projectId", target.projectId), ("id", target.id), ("pid", String(target.pid)), ("startedAt", target.startedAt),
      ("port", String(target.port)), ("address", target.address), ("alias", alias),
    ]
    components.percentEncodedQuery = items.map { name, value in
      "\(name)=\(value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")"
    }.joined(separator: "&")
    guard let result = components.url else { throw TunnelError(code: "endpoint") }
    return result
  }

  /** `b<32 hex>.test`: iOS does not route loopback hosts through a proxy, so the page uses this synthetic name. */
  static func makeAlias() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw TunnelError(code: "random") }
    return "b" + bytes.map { String(format: "%02x", $0) }.joined() + ".test"
  }
}

/** Live tunnels by SOCKS port, so a detached web view can stop the tunnel it was bound to. */
enum BycodaTunnelRegistry {
  private static let lock = NSLock()
  private static var tunnels = [UInt16: BycodaTunnel]()
  static func register(_ port: UInt16, _ tunnel: BycodaTunnel) { lock.lock(); tunnels[port] = tunnel; lock.unlock() }
  static func remove(_ port: UInt16, _ tunnel: BycodaTunnel) { lock.lock(); if tunnels[port] === tunnel { tunnels.removeValue(forKey: port) }; lock.unlock() }
  static func stop(port: Int, alias: String) {
    guard let key = UInt16(exactly: port) else { return }
    lock.lock(); let tunnel = tunnels[key]; lock.unlock()
    if let tunnel, tunnel.alias == alias { tunnel.stop("detached", failed: false) }
  }
}

/**
 * One loopback SOCKS5 listener per tunnel. Every CONNECT opens its own pinned WSS to the Host `/ws-tunnel` route and pipes
 * raw TCP bytes as binary frames. All state lives on `queue`: NWListener, NWConnection and every URLSession of the tunnel
 * deliver their callbacks there, so no locks are needed. The tunnel never logs or emits the alias or the bearer token.
 */
final class BycodaTunnel {
  static let maxConnections = 32
  let tunnelId: String
  let alias: String
  let machineId: String
  let queue = DispatchQueue(label: "bycoda.tunnel")
  let binding: HostBinding
  let url: URL
  let targetPort: UInt16
  /** Re-reads and verifies the credential for every CONNECT; nil when access is gone or the secret rotated. */
  private let tokenProvider: () -> String?
  /** The `DPoP` proof for one CONNECT's WSS upgrade of this token, or nil while the credential has no bound key. */
  private let proofProvider: (_ token: String, _ url: URL) -> String?
  /** (type, code, message) with type `error` or `closed`. */
  private let emit: (String, String?, String?) -> Void
  private let finished: (BycodaTunnel) -> Void
  private var listener: NWListener?
  private var connections = [ObjectIdentifier: TunnelConnection]()
  private var stopped = false
  private var proxyPort: UInt16 = 0
  private var lastError: (code: String, at: Date)?

  init(tunnelId: String, alias: String, binding: HostBinding, url: URL, targetPort: UInt16, tokenProvider: @escaping () -> String?, proofProvider: @escaping (_ token: String, _ url: URL) -> String?, emit: @escaping (String, String?, String?) -> Void, finished: @escaping (BycodaTunnel) -> Void) {
    self.tunnelId = tunnelId; self.alias = alias; self.machineId = binding.machineId; self.binding = binding; self.url = url
    self.targetPort = targetPort; self.tokenProvider = tokenProvider; self.proofProvider = proofProvider; self.emit = emit; self.finished = finished
  }

  func start(_ completion: @escaping (Result<UInt16, TunnelError>) -> Void) {
    queue.async {
      do {
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: .any)
        let listener = try NWListener(using: parameters)
        var reported = false
        listener.stateUpdateHandler = { [weak self, weak listener] state in
          guard let self else { return }
          switch state {
          case .ready:
            guard !reported, let port = listener?.port?.rawValue else { return }
            reported = true; self.proxyPort = port
            BycodaTunnelRegistry.register(port, self)
            completion(.success(port))
          case .failed:
            if reported { self.finish("listener_failed", failed: true) }
            else { reported = true; self.stopped = true; listener?.cancel(); completion(.failure(TunnelError(code: "listener"))) }
          default: break
          }
        }
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        self.listener = listener
        listener.start(queue: self.queue)
      } catch {
        completion(.failure(TunnelError(code: "listener")))
      }
    }
  }

  func stop(_ code: String, failed: Bool) { queue.async { self.finish(code, failed: failed) } }

  private func finish(_ code: String, failed: Bool) {
    guard !stopped else { return }
    stopped = true
    listener?.cancel(); listener = nil
    if proxyPort != 0 { BycodaTunnelRegistry.remove(proxyPort, self) }
    for connection in Array(connections.values) { connection.close() }
    connections.removeAll()
    emit(failed ? "error" : "closed", code, nil)
    finished(self)
  }

  private func accept(_ connection: NWConnection) {
    guard !stopped, connections.count < BycodaTunnel.maxConnections, Self.isLoopback(connection.endpoint) else { connection.cancel(); return }
    let tunnelConnection = TunnelConnection(owner: self, nw: connection)
    connections[ObjectIdentifier(tunnelConnection)] = tunnelConnection
    tunnelConnection.start()
  }

  private static func isLoopback(_ endpoint: NWEndpoint) -> Bool {
    guard case .hostPort(let host, _) = endpoint else { return false }
    switch host {
    case .ipv4(let address): return address.isLoopback
    case .ipv6(let address): return address.isLoopback
    default: return false
    }
  }

  // MARK: Called by TunnelConnection on `queue`

  func proof(for token: String) -> String? { proofProvider(token, url) }

  func token() -> String? {
    guard !stopped else { return nil }
    guard let value = tokenProvider() else { finish("access_changed", failed: true); return nil }
    return value
  }
  func remove(_ connection: TunnelConnection) { connections.removeValue(forKey: ObjectIdentifier(connection)) }
  /** A failed CONNECT keeps the tunnel alive; a retrying page must not flood JS, so one event per code per second. */
  func report(_ code: String, _ message: String?) {
    let now = Date()
    if let last = lastError, last.code == code, now.timeIntervalSince(last.at) < 1 { return }
    lastError = (code, now)
    emit("error", code, message)
  }
}

/** One accepted SOCKS5 client connection and its WSS peer. */
final class TunnelConnection {
  private enum Stage { case greeting, request, connecting, failing, piping, closed }
  private static let hostErrorCodes: Set<String> = ["unauthorized", "forbidden", "identity", "limit", "connect"]
  private let owner: BycodaTunnel
  private let nw: NWConnection
  private var stage = Stage.greeting
  private var buffer = [UInt8]()
  private var pending = [UInt8]()
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var deadline: DispatchWorkItem?

  init(owner: BycodaTunnel, nw: NWConnection) { self.owner = owner; self.nw = nw }

  func start() {
    nw.stateUpdateHandler = { [weak self] state in
      switch state {
      case .failed, .cancelled: self?.close()
      default: break
      }
    }
    nw.start(queue: owner.queue)
    arm(10) { $0.close() }
    readHandshake()
  }

  func close() {
    guard stage != .closed else { return }
    stage = .closed
    deadline?.cancel(); deadline = nil
    task?.cancel(with: .goingAway, reason: nil); session?.invalidateAndCancel()
    task = nil; session = nil
    nw.stateUpdateHandler = nil
    nw.cancel()
    owner.remove(self)
  }

  private func arm(_ seconds: Double, _ action: @escaping (TunnelConnection) -> Void) {
    deadline?.cancel()
    let item = DispatchWorkItem { [weak self] in if let self { action(self) } }
    deadline = item
    owner.queue.asyncAfter(deadline: .now() + seconds, execute: item)
  }

  private func write(_ bytes: [UInt8], then: (() -> Void)? = nil) {
    nw.send(content: Data(bytes), contentContext: .defaultStream, isComplete: false, completion: .contentProcessed { [weak self] error in
      guard let self else { return }
      if error != nil { self.close() } else { then?() }
    })
  }

  // MARK: SOCKS5 handshake

  private func readHandshake() {
    nw.receive(minimumIncompleteLength: 1, maximumLength: 1024) { [weak self] data, _, isComplete, error in
      guard let self, self.stage == .greeting || self.stage == .request else { return }
      if error != nil { self.close(); return }
      if let data, !data.isEmpty {
        self.buffer.append(contentsOf: data)
        guard self.buffer.count <= Socks5.maxHandshakeBytes else { self.close(); return }
        self.process()
      }
      guard self.stage == .greeting || self.stage == .request else { return }
      if isComplete { self.close() } else { self.readHandshake() }
    }
  }

  private func process() {
    while true {
      switch stage {
      case .greeting:
        switch Socks5.parseGreeting(buffer) {
        case .incomplete: return
        case .accepted(let consumed):
          buffer.removeFirst(consumed); stage = .request
          write(Socks5.methodSelected)
        case .noAcceptableMethod:
          stage = .failing; write(Socks5.noAcceptableMethod) { [weak self] in self?.close() }; return
        case .malformed: close(); return
        }
      case .request:
        switch Socks5.parseRequest(buffer, alias: owner.alias, port: owner.targetPort) {
        case .incomplete: return
        case .connect(let consumed):
          pending = Array(buffer.dropFirst(consumed)); buffer.removeAll(); stage = .connecting
          openSocket(); return
        case .refused(let code):
          stage = .failing; write(Socks5.reply(code)) { [weak self] in self?.close() }; return
        case .malformed: close(); return
        }
      default: return
      }
    }
  }

  // MARK: WSS peer

  private func openSocket() {
    guard let token = owner.token() else { close(); return }
    guard let delegate = try? TunnelSocketDelegate(binding: owner.binding, connection: self) else { fail(Socks5.replyGeneralFailure, "trust", nil); return }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil
    // Idle window: the Host closes an idle tunnel after 10 minutes, so the client timer must be longer.
    configuration.timeoutIntervalForRequest = 660
    let operations = OperationQueue()
    operations.maxConcurrentOperationCount = 1
    operations.underlyingQueue = owner.queue
    let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: operations)
    var request = URLRequest(url: owner.url)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let proof = owner.proof(for: token) { request.setValue(proof, forHTTPHeaderField: DeviceProof.header) }
    request.setValue("bycoda.tunnel.v1", forHTTPHeaderField: "Sec-WebSocket-Protocol")
    let task = session.webSocketTask(with: request)
    task.maximumMessageSize = 2_097_152
    self.session = session; self.task = task
    arm(8) { $0.fail(0x04, "connect", "deadline") }
    task.resume()
  }

  /** Reply to the SOCKS client, report to JS and tear this connection down; the tunnel itself stays up. */
  private func fail(_ reply: UInt8, _ code: String, _ message: String?) {
    guard stage == .connecting else { return }
    stage = .failing
    deadline?.cancel(); deadline = nil
    task?.cancel(with: .goingAway, reason: nil); session?.invalidateAndCancel()
    task = nil; session = nil
    owner.report(code, message)
    write(Socks5.reply(reply)) { [weak self] in self?.close() }
  }

  func socketOpened(_ negotiated: String?) {
    guard stage == .connecting else { return }
    guard negotiated == "bycoda.tunnel.v1" else { fail(Socks5.replyGeneralFailure, "schema", nil); return }
    deadline?.cancel(); deadline = nil
    stage = .piping
    write(Socks5.reply(Socks5.replySucceeded)) { [weak self] in self?.beginPumps() }
  }

  func socketCompleted(_ task: URLSessionTask, _ error: Error?) {
    guard error != nil else { return }
    switch stage {
    case .connecting:
      let response = task.response as? HTTPURLResponse
      let status = response?.statusCode ?? 0
      let header = response?.value(forHTTPHeaderField: "X-Bycoda-Tunnel-Error")?.lowercased()
      let nsError = error as NSError?
      let code: String
      if let header, Self.hostErrorCodes.contains(header) { code = header }
      else if status == 401 { code = "unauthorized" }
      else if status != 0 { code = "connect" }
      else if nsError?.domain == NSURLErrorDomain, [-1200, -1201, -1202, -1203, -1204].contains(nsError?.code ?? 0) { code = "tls" }
      else { code = "network" }
      fail(Socks5.replyConnectionRefused, code, status == 0 ? nil : "HTTP \(status)")
    case .piping:
      // The receive loop sees the failure too; this covers a loop that is waiting on a TCP write.
      close()
    default: break
    }
  }

  // MARK: Byte pumps. Each direction is a sequential loop: the next read starts only after the previous write completed.

  private func beginPumps() {
    guard stage == .piping, let task else { return }
    pumpDown()
    if pending.isEmpty { pumpUp(); return }
    let first = Data(pending); pending.removeAll()
    task.send(.data(first)) { [weak self] error in
      guard let self, self.stage == .piping else { return }
      if error != nil { self.close() } else { self.pumpUp() }
    }
  }

  /** Phone page to Host. */
  private func pumpUp() {
    nw.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
      guard let self, self.stage == .piping, let task = self.task else { return }
      if error != nil { self.close(); return }
      guard let data, !data.isEmpty else {
        // The client closed its side; allow a short drain for the response in flight, then end both directions.
        if isComplete { self.arm(5) { $0.close() } }
        return
      }
      task.send(.data(data)) { [weak self] sendError in
        guard let self, self.stage == .piping else { return }
        if sendError != nil { self.close(); return }
        if isComplete { self.arm(5) { $0.close() } } else { self.pumpUp() }
      }
    }
  }

  /** Host to phone page. */
  private func pumpDown() {
    task?.receive { [weak self] result in
      guard let self, self.stage == .piping else { return }
      switch result {
      case .failure:
        // Remote close or network loss: flush what was queued, then half-close the loopback socket.
        self.nw.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] _ in self?.close() })
      case .success(.data(let data)):
        if data.isEmpty { self.pumpDown(); return }
        self.nw.send(content: data, contentContext: .defaultStream, isComplete: false, completion: .contentProcessed { [weak self] sendError in
          guard let self, self.stage == .piping else { return }
          if sendError != nil { self.close() } else { self.pumpDown() }
        })
      case .success(.string):
        self.task?.cancel(with: .unsupportedData, reason: nil); self.close()
      @unknown default:
        self.close()
      }
    }
  }
}

final class TunnelSocketDelegate: TrustDelegate, URLSessionWebSocketDelegate {
  private weak var connection: TunnelConnection?
  init(binding: HostBinding, connection: TunnelConnection) throws { self.connection = connection; try super.init(binding: binding) }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol negotiatedProtocol: String?) { connection?.socketOpened(negotiatedProtocol) }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { connection?.socketCompleted(task, error) }
}
