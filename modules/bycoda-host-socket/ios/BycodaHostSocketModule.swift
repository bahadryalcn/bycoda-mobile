import BycodaVoiceCompanion
import ExpoModulesCore
import ExpoSecureStore
import Foundation
import Security
import CryptoKit

/** A background voice peer cannot browse, navigate, execute tools or address another Room. */
enum VoiceRpcPolicy {
  private static let voiceMethods: Set<String> = ["voice.local.start", "voice.local.transcribe", "voice.cloud.transcribe", "voice.local.release", "voice.local.speak", "voice.local.speechNext", "voice.local.keepAlive"]
  static func allowed(_ method: String, op: String?, requestedThread: String?, threadId: String, hasThread: Bool, emptyParams: Bool) -> Bool {
    if method == "connection.hello" || method == "environment.describe" || voiceMethods.contains(method) { return true }
    if method == "projects.directory" { return emptyParams }
    guard method == "assistant.request" else { return false }
    switch op {
    case "threads.sendIdentity": return !hasThread
    case "threads.send", "threads.sendStatus", "threads.messages": return requestedThread == threadId
    default: return false
    }
  }
}

struct HostCa: Record {
  @Field var version: Int = 0
  @Field var environmentId: String = ""
  @Field var caGeneration: Double = -1
  @Field var caCertificatePem: String = ""
  @Field var caSpkiPin: String = ""
}
struct HostBinding: Record {
  @Field var machineId: String = ""
  @Field var environmentId: String = ""
  @Field var endpoint: String = ""
  @Field var credentialGeneration: Double = -1
  @Field var accessEpoch: Double = -1
  @Field var tls: HostCa?
}
struct HostBulkDescriptor: Record {
  @Field var kind: String = ""
  @Field var transferId: String = ""
  @Field var environmentId: String = ""
  @Field var totalBytes: Double = -1
  @Field var chunkBytes: Double = -1
  @Field var sha256: String = ""
  @Field var expiresAt: Double = -1
}
private enum HostSocketFailure: Error { case rejected(String) }
private func failure(_ code: String) -> Error { HostSocketFailure.rejected(code) }
private func safe(_ value: Double) -> Bool { value.isFinite && value >= 0 && value <= 9_007_199_254_740_991 && value.rounded() == value }
private func matches(_ value: String, _ pattern: String) -> Bool {
  let full = NSRange(location: 0, length: value.utf16.count)
  guard let expression = try? NSRegularExpression(pattern: pattern), let match = expression.firstMatch(in: value, range: full) else { return false }
  return match.range == full
}

/** CryptoKit emits the complete DER SubjectPublicKeyInfo, not a raw EC point. */
enum HostTls {
  static func ca(_ binding: HostBinding) throws -> SecCertificate? {
    guard let paired = binding.tls else { return nil }
    guard paired.version == 1, paired.environmentId == binding.environmentId, safe(paired.caGeneration), paired.caCertificatePem.utf8.count <= 16_384 else { throw failure("trust") }
    let pem = paired.caCertificatePem.trimmingCharacters(in: .whitespacesAndNewlines)
    let begin = "-----BEGIN CERTIFICATE-----", end = "-----END CERTIFICATE-----"
    guard pem.hasPrefix(begin), pem.hasSuffix(end) else { throw failure("trust") }
    let body = String(pem.dropFirst(begin.count).dropLast(end.count)).filter { !$0.isWhitespace }
    guard let der = Data(base64Encoded: body), let certificate = SecCertificateCreateWithData(nil, der as CFData), let key = SecCertificateCopyKey(certificate) else { throw failure("trust") }
    var error: Unmanaged<CFError>?
    guard let raw = SecKeyCopyExternalRepresentation(key, &error) as Data? else { throw failure("trust") }
    let publicKey = try P256.Signing.PublicKey(x963Representation: raw)
    let pin = "sha256/" + Data(SHA256.hash(data: publicKey.derRepresentation)).base64EncodedString()
    guard pin == paired.caSpkiPin else { throw failure("trust") }
    return certificate
  }
  static func endpoint(_ binding: HostBinding) throws -> URL {
    guard let url = URL(string: binding.endpoint), let components = URLComponents(url: url, resolvingAgainstBaseURL: false), components.scheme == "wss", components.host != nil, components.user == nil, components.password == nil, components.query == nil, components.fragment == nil, components.path == "/ws" else { throw failure("endpoint") }
    return url
  }
}

private class TrustDelegate: NSObject, URLSessionTaskDelegate {
  let binding: HostBinding
  let anchor: SecCertificate?
  init(binding: HostBinding) throws { self.binding = binding; self.anchor = try HostTls.ca(binding); super.init() }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    evaluate(challenge, completionHandler)
  }
  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    evaluate(challenge, completionHandler)
  }
  private func evaluate(_ challenge: URLAuthenticationChallenge, _ completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust, let anchor else { completionHandler(.performDefaultHandling, nil); return }
    guard let trust = challenge.protectionSpace.serverTrust, let endpoint = URL(string: binding.endpoint), challenge.protectionSpace.host == endpoint.host else { completionHandler(.cancelAuthenticationChallenge, nil); return }
    SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString))
    SecTrustSetAnchorCertificates(trust, [anchor] as CFArray)
    SecTrustSetAnchorCertificatesOnly(trust, true)
    var error: CFError?
    guard SecTrustEvaluateWithError(trust, &error), SecTrustGetCertificateCount(trust) >= 2,
      let root = SecTrustGetCertificateAtIndex(trust, SecTrustGetCertificateCount(trust) - 1),
      (SecCertificateCopyData(root) as Data) == (SecCertificateCopyData(anchor) as Data) else { completionHandler(.cancelAuthenticationChallenge, nil); return }
    completionHandler(.useCredential, URLCredential(trust: trust))
  }
}
private final class SocketDelegate: TrustDelegate, URLSessionWebSocketDelegate {
  weak var owner: BycodaHostSocketModule?
  let id: String
  let generation: Double
  init(owner: BycodaHostSocketModule, id: String, generation: Double, binding: HostBinding) throws {
    self.owner = owner; self.id = id; self.generation = generation; try super.init(binding: binding)
  }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol negotiatedProtocol: String?) { owner?.opened(id, generation, negotiatedProtocol) }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) { owner?.ended(id, generation, "remote_closed", false) }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    owner?.completedJob(id, generation)
    if error != nil {
      let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
      let code = [401, 403].contains(status) ? "authentication" : (error as NSError?)?.domain == NSURLErrorDomain && [-1200, -1201, -1202, -1203, -1204].contains((error as NSError?)?.code ?? 0) ? "tls" : "network"
      owner?.ended(id, generation, code, true)
    }
  }
}

private final class BulkDelegate: TrustDelegate, URLSessionDataDelegate {
  let limit: Int
  var bytes = Data()
  let done: (Result<Data, Error>) -> Void
  var rejected = false
  init(binding: HostBinding, limit: Int, done: @escaping (Result<Data, Error>) -> Void) throws { self.limit = limit; self.done = done; try super.init(binding: binding) }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let http = response as? HTTPURLResponse, http.statusCode == 200, response.expectedContentLength <= Int64(limit) else { rejected = true; completionHandler(.cancel); return }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    if bytes.count + data.count > limit { rejected = true; dataTask.cancel(); return }
    bytes.append(data)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if rejected || error != nil || bytes.count != limit { done(.failure(failure("bulk_response"))) }
    else { done(.success(bytes)) }
    session.finishTasksAndInvalidate()
  }
}

public final class BycodaHostSocketModule: Module {
  private struct VoiceScope { let sessionId: String; let threadId: String; let projectId: String? }
  private struct Credential { let binding: HostBinding; let digest: Data; var voice: VoiceScope? = nil }
  private final class Connection {
    let id: String; let generation: Double; let credential: Credential; let session: URLSession; let task: URLSessionWebSocketTask; let opening: Promise
    var opened = false; var settled = false; var sequence = 0
    var deliveries = [Int: Int](); var deliveryBytes = 0; var outgoingBytes = 0
    var sends = [UUID: Promise]()
    var voiceRequests = Set<String>()
    init(id: String, generation: Double, credential: Credential, session: URLSession, task: URLSessionWebSocketTask, opening: Promise) { self.id = id; self.generation = generation; self.credential = credential; self.session = session; self.task = task; self.opening = opening }
  }
  private let lock = NSRecursiveLock()
  private var credentials = [String: Credential]()
  private var connections = [String: Connection]()
  // SDK jobs remain charged after detach/cancellation until their delegate settles.
  private var socketJobs = [String: Connection]()
  private var bulks = [UUID: (String, URLSession)]()
  private var foreground = true
  private var accessAllowed = false
  private var accessEpoch: Double = -1
  private var lifecycleEpoch = 0
  private var voiceObserver: NSObjectProtocol?
  /** Only a socket admitted for the live voice call survives background; ordinary ones need the visible, unlocked app. */
  private func voiceCurrent(_ voice: VoiceScope?) -> Bool { voice.map { VoiceCallEngine.shared.allowsSession($0.sessionId) } ?? false }
  private func current(_ connection: Connection) -> Bool {
    connections[connection.id] === connection && (connection.credential.voice != nil ? voiceCurrent(connection.credential.voice) : foreground && accessAllowed)
  }
  private func sync<T>(_ body: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try body() }
  private func secureStore() throws -> SecureStoreModule {
    guard let module = appContext?.moduleRegistry.get(moduleWithName: "ExpoSecureStore") as? SecureStoreModule else { throw failure("secure_store_unavailable") }
    return module
  }
  private func validate(_ binding: HostBinding) throws {
    guard matches(binding.machineId, "^[A-Za-z0-9-]{1,80}$"), !binding.machineId.contains("\n"), matches(binding.environmentId, "^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$"), !binding.environmentId.contains("\n"), safe(binding.credentialGeneration), safe(binding.accessEpoch) else { throw failure("binding") }
    _ = try HostTls.endpoint(binding); _ = try HostTls.ca(binding)
  }
  private func secret(_ binding: HostBinding) throws -> String {
    guard let value = try secureStore().bycodaHostReadNative("bycoda.remote.\(binding.machineId)"), matches(value, "^[A-Za-z0-9_-]{43}$"), value.utf8.count == 43 else { throw failure("credential_missing") }
    return value
  }
  private func digest(_ value: String) -> Data { Data(SHA256.hash(data: Data(value.utf8))) }
  private func event(_ connection: Connection, _ type: String, _ fields: [String: Any] = [:]) {
    sendEvent("onSocketEvent", ["connectionId": connection.id, "environmentId": connection.credential.binding.environmentId, "generation": connection.generation, "type": type].merging(fields, uniquingKeysWith: { _, new in new }))
  }
  fileprivate func ended(_ id: String, _ generation: Double, _ code: String, _ failed: Bool) {
    sync {
      guard let connection = connections[id], connection.generation == generation else { return }
      connections.removeValue(forKey: id); connection.task.cancel(with: .goingAway, reason: nil); connection.session.invalidateAndCancel()
      if !connection.settled { connection.settled = true; connection.opening.reject("ERR_HOST_SOCKET", code) }
      for promise in connection.sends.values { promise.reject("ERR_HOST_SOCKET", code) }
      connection.sends.removeAll(); connection.deliveries.removeAll(); connection.voiceRequests.removeAll()
      event(connection, failed ? "error" : "closed", ["code": code])
    }
  }
  private func invalidate(_ machineId: String? = nil, preserveVoice: Bool = false) {
    sync {
      lifecycleEpoch += 1
      let affected = { (binding: HostBinding, voice: VoiceScope?) in (machineId == nil || binding.machineId == machineId) && !(preserveVoice && self.voiceCurrent(voice)) }
      credentials = credentials.filter { !affected($0.value.binding, $0.value.voice) }
      for connection in Array(connections.values) where affected(connection.credential.binding, connection.credential.voice) { ended(connection.id, connection.generation, "credentials_invalidated", true) }
      for value in Array(bulks.values) where machineId == nil || value.0 == machineId { value.1.invalidateAndCancel() }
    }
  }
  /** The call ended, was revoked or changed session: its scoped credentials and peers end with it. */
  private func revokeStaleVoice() {
    sync {
      credentials = credentials.filter { $0.value.voice == nil || voiceCurrent($0.value.voice) }
      for connection in Array(connections.values) where connection.credential.voice != nil && !voiceCurrent(connection.credential.voice) { ended(connection.id, connection.generation, "voice_revoked", true) }
    }
  }
  fileprivate func completedJob(_ id: String, _ generation: Double) { sync { if socketJobs[id]?.generation == generation { socketJobs.removeValue(forKey: id) } } }
  private func acquire(_ binding: HostBinding, voice: VoiceScope? = nil) throws -> [String: Any] {
    try validate(binding)
    if voice != nil && !voiceCurrent(voice) { throw failure("voice_unavailable") }
    let epoch = try sync { () throws -> Int in if !foreground || !accessAllowed || binding.accessEpoch != accessEpoch || credentials.count >= 64 { throw failure("unavailable") }; return lifecycleEpoch }
    let value = try secret(binding)
    return try sync {
      guard foreground, accessAllowed, binding.accessEpoch == accessEpoch, epoch == lifecycleEpoch, credentials.count < 64, voice == nil || voiceCurrent(voice) else { throw failure("access_changed") }
      let handle = UUID().uuidString; credentials[handle] = Credential(binding: binding, digest: digest(value), voice: voice)
      return ["handle": handle, "machineId": binding.machineId, "environmentId": binding.environmentId, "credentialGeneration": binding.credentialGeneration, "accessEpoch": binding.accessEpoch]
    }
  }
  fileprivate func opened(_ id: String, _ generation: Double, _ proto: String?) {
    sync {
      guard let connection = connections[id], connection.generation == generation, current(connection) else { return }
      guard proto == "bycoda.rpc.v2" else { ended(id, generation, "schema", true); return }
      connection.opened = true; connection.settled = true; connection.opening.resolve(nil); receive(connection)
    }
  }
  private func receive(_ connection: Connection) {
    connection.task.receive { [weak self, weak connection] result in
      guard let self, let connection else { return }
      self.sync {
        guard self.current(connection) else { return }
        switch result {
        case .failure: self.ended(connection.id, connection.generation, "network", true)
        case .success(.data): self.ended(connection.id, connection.generation, "binary_not_supported", true)
        case .success(.string(let text)):
          // A voice peer receives only replies to its own admitted requests, never Host-initiated calls.
          if connection.credential.voice != nil {
            let frame = text.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            guard let frame, frame["method"] == nil, let requestId = frame["id"] as? String, connection.voiceRequests.remove(requestId) != nil else { self.receive(connection); return }
          }
          let count = text.utf8.count
          guard count <= 1_048_576, connection.deliveries.count < 512, connection.deliveryBytes + count <= 16_777_216 else { self.ended(connection.id, connection.generation, "overload", true); return }
          connection.sequence += 1; connection.deliveries[connection.sequence] = count; connection.deliveryBytes += count
          self.event(connection, "message", ["sequence": connection.sequence, "text": text]); self.receive(connection)
        @unknown default: self.ended(connection.id, connection.generation, "schema", true)
        }
      }
    }
  }
  private func openPeer(_ handle: String, _ id: String, _ generation: Double, _ sessionId: String?, _ promise: Promise) throws {
    guard safe(generation), !id.isEmpty, id.utf8.count <= 200 else { throw failure("generation") }
    let credential = try sync { () throws -> Credential in
      guard let credential = credentials[handle] else { throw failure("unavailable") }
      guard credential.voice?.sessionId == sessionId else { throw failure("credential_scope") }
      let admitted = credential.voice != nil ? voiceCurrent(credential.voice) : foreground && accessAllowed && credential.binding.accessEpoch == accessEpoch
      guard admitted, socketJobs.count < 4, socketJobs[id] == nil else { throw failure("unavailable") }
      return credential
    }
    let token = try secret(credential.binding)
    guard digest(token) == credential.digest else { invalidate(credential.binding.machineId); throw failure("credential_rotated") }
    let delegate = try SocketDelegate(owner: self, id: id, generation: generation, binding: credential.binding)
    let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCredentialStorage = nil; config.timeoutIntervalForRequest = 5
    let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    var request = URLRequest(url: try HostTls.endpoint(credential.binding)); request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization"); request.setValue("bycoda.rpc.v2", forHTTPHeaderField: "Sec-WebSocket-Protocol")
    let task = session.webSocketTask(with: request); task.maximumMessageSize = 1_048_576
    let connection = Connection(id: id, generation: generation, credential: credential, session: session, task: task, opening: promise)
    try sync {
      let admitted = credential.voice != nil ? voiceCurrent(credential.voice) : foreground && accessAllowed
      guard admitted, credentials[handle] != nil, socketJobs[id] == nil, socketJobs.count < 4 else { session.invalidateAndCancel(); throw failure("access_changed") }
      connections[id] = connection; socketJobs[id] = connection; task.resume()
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + 5) { [weak self, weak connection] in
      guard let self, let connection else { return }; self.sync { if self.connections[id] === connection && !connection.opened { self.ended(id, generation, "deadline", true) } }
    }
  }
  public func definition() -> ModuleDefinition {
    Name("BycodaHostSocket")
    Events("onSocketEvent")
    OnCreate {
      self.voiceObserver = NotificationCenter.default.addObserver(forName: VoiceCallEngine.changed, object: nil, queue: nil) { [weak self] _ in self?.revokeStaleVoice() }
    }
    AsyncFunction("setAccess") { (active: Bool, epoch: Double) in
      try self.sync {
        guard safe(epoch), epoch >= self.accessEpoch else { throw failure("access_epoch") }
        if active && !self.accessAllowed && epoch <= self.accessEpoch { throw failure("access_epoch") }
        if !active || epoch != self.accessEpoch { self.invalidate(preserveVoice: true) }
        self.accessEpoch = epoch; self.accessAllowed = active && self.foreground
      }
    }
    AsyncFunction("acquireCredential") { (binding: HostBinding) in try self.acquire(binding) }
    AsyncFunction("storeCredential") { (binding: HostBinding, token: String) in
      try self.sync { guard self.foreground, self.accessAllowed, binding.accessEpoch == self.accessEpoch else { throw failure("access_changed") } }
      try self.validate(binding)
      guard matches(token, "^[A-Za-z0-9_-]{43}$"), token.utf8.count == 43 else { throw failure("credential") }
      self.invalidate(binding.machineId); try self.secureStore().bycodaHostWriteNative("bycoda.remote.\(binding.machineId)", value: token)
      return try self.acquire(binding)
    }
    AsyncFunction("deleteCredential") { (machineId: String) in
      try self.sync { guard self.foreground, self.accessAllowed else { throw failure("access_changed") } }
      guard matches(machineId, "^[A-Za-z0-9-]{1,80}$"), !machineId.contains("\n") else { throw failure("binding") }
      self.invalidate(machineId); try self.secureStore().bycodaHostDeleteNative("bycoda.remote.\(machineId)")
    }
    AsyncFunction("invalidateCredentials") { (machineId: String?) in self.invalidate(machineId) }
    AsyncFunction("acquireVoiceCredential") { (binding: HostBinding, sessionId: String, threadId: String, projectId: String?) in
      guard (1...200).contains(threadId.utf8.count), projectId.map({ (1...200).contains($0.utf8.count) }) ?? true else { throw failure("voice_scope") }
      return try self.acquire(binding, voice: VoiceScope(sessionId: sessionId, threadId: threadId, projectId: projectId))
    }
    AsyncFunction("open") { (handle: String, id: String, generation: Double, promise: Promise) in
      try self.openPeer(handle, id, generation, nil, promise)
    }
    AsyncFunction("openVoice") { (handle: String, id: String, generation: Double, sessionId: String, promise: Promise) in
      try self.openPeer(handle, id, generation, sessionId, promise)
    }
    AsyncFunction("send") { (id: String, generation: Double, text: String, promise: Promise) in
      try self.sync {
        guard let connection = self.connections[id], self.current(connection), connection.generation == generation, connection.opened else { throw failure("stale_connection") }
        let count = text.utf8.count
        guard count <= 1_048_576, connection.outgoingBytes + count <= 8_388_608, connection.sends.count < 64 else { throw failure("overload") }
        let request = text.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        let method = request?["method"] as? String ?? ""
        if let scope = connection.credential.voice {
          let params = request?["params"] as? [String: Any]
          guard request != nil, VoiceRpcPolicy.allowed(method, op: params?["op"] as? String, requestedThread: params?["threadId"] as? String, threadId: scope.threadId,
                  hasThread: params?["threadId"] != nil, emptyParams: params?.isEmpty == true) else { throw failure("voice_scope_denied") }
          guard let requestId = request?["id"] as? String, (1...200).contains(requestId.utf8.count), connection.voiceRequests.count < 64,
                connection.voiceRequests.insert(requestId).inserted else { throw failure("voice_request_invalid") }
        }
        if method.hasPrefix("native.") || method.hasPrefix("devServers.bridge") { throw failure("native_profile_required") }
        let key = UUID(); connection.sends[key] = promise; connection.outgoingBytes += count
        connection.task.send(.string(text)) { [weak self, weak connection] error in
          guard let self, let connection else { return }; self.sync {
            guard let pending = connection.sends.removeValue(forKey: key) else { return }; connection.outgoingBytes -= count
            if error != nil || !self.current(connection) { pending.reject("ERR_HOST_SOCKET", "send_failed") } else { pending.resolve(nil) }
          }
        }
      }
    }
    AsyncFunction("acknowledge") { (id: String, generation: Double, sequence: Int) in self.sync { if let connection = self.connections[id], connection.generation == generation, let bytes = connection.deliveries.removeValue(forKey: sequence) { connection.deliveryBytes -= bytes } } }
    AsyncFunction("close") { (id: String, generation: Double) in self.ended(id, generation, "detached", false) }
    AsyncFunction("readBulk") { (handle: String, descriptor: HostBulkDescriptor, offset: Double, promise: Promise) in
      let credential = try self.sync { () throws -> Credential in guard self.foreground, self.accessAllowed, let credential = self.credentials[handle], credential.voice == nil, credential.binding.accessEpoch == self.accessEpoch, self.bulks.count < 2 else { throw failure("bulk_unavailable") }; return credential }
      guard descriptor.kind == "bulk", descriptor.environmentId == credential.binding.environmentId, matches(descriptor.transferId, "^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$"), !descriptor.transferId.contains("\n"), safe(descriptor.totalBytes), descriptor.totalBytes <= 33_554_432, safe(descriptor.chunkBytes), (1...65_536).contains(descriptor.chunkBytes), safe(descriptor.expiresAt), descriptor.expiresAt > Date().timeIntervalSince1970 * 1000, safe(offset), offset < descriptor.totalBytes, matches(descriptor.sha256, "^[a-f0-9]{64}$"), descriptor.sha256.count == 64 else { throw failure("bulk_descriptor") }
      let token = try self.secret(credential.binding)
      guard self.digest(token) == credential.digest else { self.invalidate(credential.binding.machineId); throw failure("credential_rotated") }
      let key = UUID(); let epoch = self.sync { self.lifecycleEpoch }
      let limit = Int(min(descriptor.chunkBytes, descriptor.totalBytes - offset))
      let delegate = try BulkDelegate(binding: credential.binding, limit: limit) { [weak self] result in
        guard let self else { promise.reject("ERR_HOST_SOCKET", "closed"); return }
        self.sync {
          self.bulks.removeValue(forKey: key)
          guard self.foreground, self.accessAllowed, self.lifecycleEpoch == epoch, self.credentials[handle] != nil else { promise.reject("ERR_HOST_SOCKET", "access_changed"); return }
          switch result { case .success(let bytes): promise.resolve(["dataBase64": bytes.base64EncodedString()]); case .failure: promise.reject("ERR_HOST_SOCKET", "bulk_response") }
        }
      }
      let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCredentialStorage = nil; config.timeoutIntervalForRequest = 12
      let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
      var url = URLComponents(url: try HostTls.endpoint(credential.binding), resolvingAgainstBaseURL: false)!; url.scheme = "https"; url.path = "/ws-bulk/\(descriptor.transferId)"; url.queryItems = [URLQueryItem(name: "offset", value: String(Int(offset)))]
      var request = URLRequest(url: url.url!); request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      try self.sync { guard self.foreground, self.accessAllowed, self.lifecycleEpoch == epoch, self.credentials[handle] != nil, self.bulks.count < 2 else { session.invalidateAndCancel(); throw failure("access_changed") }; self.bulks[key] = (credential.binding.machineId, session) }
      session.dataTask(with: request).resume()
    }
    OnAppEntersBackground { self.sync { self.foreground = false; self.accessAllowed = false; self.invalidate(preserveVoice: true) } }
    OnAppBecomesActive { self.sync { self.foreground = true } }
    OnDestroy {
      if let observer = self.voiceObserver { NotificationCenter.default.removeObserver(observer) }
      self.sync { self.foreground = false; self.accessAllowed = false; self.invalidate() }
    }
  }
}
