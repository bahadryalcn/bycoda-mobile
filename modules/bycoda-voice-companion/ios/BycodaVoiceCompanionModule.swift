import AVFoundation
import ExpoModulesCore
import UIKit

private final class VoiceError: GenericException<String> {
  override var reason: String { param }
}

/** Retire the ordered operation prefix, so even very late queued starts stay canceled. */
final class VoiceOperationFence {
  private var retired: Int64 = -1
  private func order(_ id: String) -> Int64? {
    let parts = id.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 2, parts.allSatisfy({ (1...16).contains($0.count) && $0.allSatisfy { $0.isASCII && $0.isNumber } }) else { return nil }
    // Wall time provides uniqueness only; cancellation follows the runtime's monotonic sequence.
    return Int64(parts[1])
  }
  func allows(_ id: String) -> Bool {
    guard let candidate = order(id) else { return false }
    return candidate > retired
  }
  func cancel(_ id: String) {
    guard let candidate = order(id), candidate > retired else { return }
    retired = candidate
  }
}

/**
 * The iOS call engine. A started call keeps one audio engine with the microphone running until it
 * ends, which (with the audio background mode) keeps the call alive with the screen locked or the app
 * in the background, like a phone call. Samples reach JS only inside an explicit capture; mute,
 * interruption, revocation and the idle limit stop them. Mutations happen on the main queue.
 */
public final class VoiceCallEngine: NSObject, AVAudioPlayerDelegate {
  public static let shared = VoiceCallEngine()
  /** Posted whenever the call's state changes; the Host socket then ends peers of a call that is no longer live. */
  public static let changed = Notification.Name("BycodaVoiceCallChanged")
  private override init() { super.init() }
  private struct Capture { let id: String; let generation: Int }
  private static let sampleRate = 16_000.0
  private static let captureSamples = 480_000
  private static let idleTimeout = 180.0

  var listener: (([String: Any?]) -> Void)?
  /** Input port uid chosen by the owner's microphone priority; nil keeps the system default. */
  var preferredInput: String?
  private let lock = NSLock()
  private var id = ""
  private var phase = "idle"
  private var muted = false
  private var ended = true
  private var microphone = false
  private var live: Capture?
  private var generation = 0
  private var captured = 0
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayer?
  private var playbackId: String?
  private var captureFence = VoiceOperationFence()
  private var playbackFence = VoiceOperationFence()
  private var idleTimer: DispatchWorkItem?
  private var captureLimit: DispatchWorkItem?
  private var playbackLimit: DispatchWorkItem?
  private var observers: [NSObjectProtocol] = []
  private let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: sampleRate, channels: 1, interleaved: true)!

  private func locked<T>(_ body: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return body() }
  func snapshot() -> [String: Any] {
    locked { ["active": !ended && !id.isEmpty, "sessionId": id, "phase": phase, "muted": muted, "pip": false] }
  }
  private func emit(_ event: [String: Any?]) { listener?(event) }
  private func publish() {
    emit(["type": "state", "sessionId": id, "state": snapshot()])
    NotificationCenter.default.post(name: Self.changed, object: nil)
  }
  private func allows(_ supplied: String) -> Bool { !ended && !id.isEmpty && id == supplied }
  /** Thread-safe: the Host socket admits a background voice peer only for the live call. */
  public func allowsSession(_ supplied: String) -> Bool { locked { !ended && !id.isEmpty && id == supplied } }
  private func later(_ seconds: Double, _ action: @escaping () -> Void) -> DispatchWorkItem {
    let work = DispatchWorkItem(block: action)
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    return work
  }
  private func armIdle() {
    idleTimer?.cancel()
    idleTimer = later(Self.idleTimeout) { [weak self] in self?.end("timeout") }
  }

  static func microphoneGranted() -> Bool {
    if #available(iOS 17.0, *) { return AVAudioApplication.shared.recordPermission == .granted }
    return AVAudioSession.sharedInstance().recordPermission == .granted
  }
  static func listInputs() -> [[String: String]] {
    (AVAudioSession.sharedInstance().availableInputs ?? []).map { port in
      let kind: String
      switch port.portType {
      case .builtInMic: kind = "builtin"
      case .headsetMic, .usbAudio, .lineIn: kind = "wired"
      case .bluetoothHFP, .bluetoothLE: kind = "bluetooth"
      case .carAudio: kind = "carplay"
      default: kind = "other"
      }
      return ["name": port.portName, "type": kind, "uid": port.uid]
    }
  }
  /** A missing or rejected preferred microphone silently keeps the current input. */
  private func applyPreferredInput() {
    let session = AVAudioSession.sharedInstance()
    guard let uid = preferredInput, session.currentRoute.inputs.first?.uid != uid,
          let port = session.availableInputs?.first(where: { $0.uid == uid }) else { return }
    try? session.setPreferredInput(port)
  }

  // MARK: Session

  /** Starting needs the visible app and, for a call, granted microphone permission. */
  func begin(microphone wantsMicrophone: Bool) throws -> String {
    guard UIApplication.shared.applicationState == .active, !wantsMicrophone || Self.microphoneGranted() else {
      throw VoiceError("Start voice while Bycoda is visible, unlocked and microphone permission is granted.")
    }
    guard ended || id.isEmpty else { throw VoiceError("A voice session is already active.") }
    let session = AVAudioSession.sharedInstance()
    do {
      if wantsMicrophone {
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
      } else {
        try session.setCategory(.playback, mode: .spokenAudio, options: [])
      }
      try session.setActive(true)
      if wantsMicrophone { applyPreferredInput(); try startEngine() }
    } catch {
      stopEngine()
      try? session.setActive(false, options: .notifyOthersOnDeactivation)
      throw (error as? VoiceError) ?? VoiceError("Audio is in use by another app. Try voice again when it is available.")
    }
    let next = UUID().uuidString.lowercased()
    captureFence = VoiceOperationFence(); playbackFence = VoiceOperationFence()
    locked { id = next; ended = false; phase = "idle"; muted = false; microphone = wantsMicrophone; live = nil }
    observe(); armIdle(); publish()
    return next
  }
  func endSession(_ supplied: String) { if allows(supplied) { end("revoked") } }
  func end(_ reason: String, _ error: String? = nil) {
    guard !ended, !id.isEmpty else { return }
    let endedId = id
    stopCapture(endedId); stopPlayback(endedId)
    locked { ended = true; phase = "idle"; live = nil }
    for work in [idleTimer, captureLimit, playbackLimit] { work?.cancel() }
    observers.forEach { NotificationCenter.default.removeObserver($0) }; observers = []
    stopEngine()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    emit(["type": "ended", "sessionId": endedId, "reason": reason, "error": error])
    publish()
  }
  private func observe() {
    let center = NotificationCenter.default, session = AVAudioSession.sharedInstance()
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] note in
      let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(AVAudioSession.InterruptionType.init(rawValue:))
      if type == .began { self?.end("audio-interrupted") }
    })
    observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main) { [weak self] _ in
      self?.end("audio-interrupted")
    })
  }

  // MARK: Microphone

  private func startEngine() throws {
    let next = AVAudioEngine()
    let input = next.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0, let converter = AVAudioConverter(from: format, to: target) else {
      throw VoiceError("Microphone configuration is unavailable.")
    }
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in self?.receive(buffer, converter) }
    _ = next.mainMixerNode
    next.prepare()
    do { try next.start() } catch { input.removeTap(onBus: 0); throw VoiceError("Microphone could not start.") }
    engine = next
    // A route change (headset, Bluetooth) stops the engine; reopen it on the new input or end the call.
    observers.append(NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: next, queue: .main) { [weak self] _ in
      guard let self, self.engine === next, !self.ended else { return }
      self.stopEngine()
      do { try self.startEngine() } catch { self.end("audio-interrupted", (error as? VoiceError)?.param) }
    })
  }
  private func stopEngine() {
    guard let current = engine else { return }
    engine = nil
    current.inputNode.removeTap(onBus: 0)
    current.stop()
  }
  /** Audio thread: convert to 16 kHz mono PCM16 only while a capture is open. */
  private func receive(_ buffer: AVAudioPCMBuffer, _ converter: AVAudioConverter) {
    guard let capture = locked({ live }), buffer.frameLength > 0, buffer.format.sampleRate > 0 else { return }
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * Self.sampleRate / buffer.format.sampleRate).rounded(.up) + 32)
    guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
    var supplied = false
    var failure: NSError?
    let status = converter.convert(to: output, error: &failure) { _, state in
      if supplied { state.pointee = .noDataNow; return nil }
      supplied = true; state.pointee = .haveData
      return buffer
    }
    guard status != .error, output.frameLength > 0, let channels = output.int16ChannelData else { return }
    let data = Data(bytes: channels[0], count: Int(output.frameLength) * 2)
    DispatchQueue.main.async { [weak self] in self?.deliver(data, capture) }
  }
  private func deliver(_ data: Data, _ capture: Capture) {
    guard !ended, let current = live, current.id == capture.id, current.generation == capture.generation else { return }
    captured += data.count / 2
    emit(["type": "pcm", "sessionId": id, "captureId": capture.id, "audio": data.base64EncodedString(), "sampleRate": Int(Self.sampleRate)])
    if captured >= Self.captureSamples { stopCapture(id, reason: "limit") }
  }
  func startCapture(_ supplied: String, _ token: String) throws {
    guard allows(supplied) else { throw VoiceError("Voice session is unavailable.") }
    guard microphone else { throw VoiceError("This voice session is playback-only.") }
    guard captureFence.allows(token) else { throw VoiceError("This recording operation was canceled.") }
    guard Self.microphoneGranted() else { throw VoiceError("Microphone permission is required.") }
    guard !muted, live == nil else { throw VoiceError("Microphone is muted or already recording.") }
    stopPlayback(supplied)
    applyPreferredInput()
    if engine?.isRunning != true {
      stopEngine()
      try startEngine()
    }
    generation += 1; captured = 0
    let capture = Capture(id: token, generation: generation)
    locked { live = capture; phase = "recording" }
    armIdle(); publish()
    captureLimit?.cancel()
    captureLimit = later(30) { [weak self] in
      guard let self, self.live?.id == capture.id else { return }
      self.stopCapture(self.id, reason: "limit")
    }
  }
  func stopCapture(_ supplied: String, reason: String? = nil, expected: String? = nil) {
    guard !id.isEmpty, id == supplied else { return }
    if let expected {
      captureFence.cancel(expected)
      if live?.id != expected { return }
    }
    guard let stopped = live else { return }
    captureFence.cancel(stopped.id)
    captureLimit?.cancel()
    locked { live = nil; if phase == "recording" { phase = "idle" } }
    if !ended { armIdle(); publish() }
    if let reason { emit(["type": "ended", "sessionId": id, "captureId": stopped.id, "reason": reason]) }
  }
  func setMuted(_ supplied: String, _ value: Bool) {
    guard allows(supplied) else { return }
    locked { muted = value }
    if value { stopCapture(supplied, reason: "muted") }
    publish()
  }

  // MARK: Playback

  /** Only an app-owned cached WAV is accepted. Completion arrives as a playback event. */
  func playWav(_ supplied: String, _ playingId: String, _ uri: String) throws {
    guard allows(supplied) else { throw VoiceError("Voice session is unavailable.") }
    guard playbackFence.allows(playingId) else { throw VoiceError("This playback operation was canceled.") }
    guard let url = URL(string: uri), url.isFileURL,
          let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { throw VoiceError("Invalid cached voice audio.") }
    let file = url.standardizedFileURL.resolvingSymlinksInPath()
    let root = caches.standardizedFileURL.resolvingSymlinksInPath().path + "/"
    let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    guard file.path.hasPrefix(root), file.lastPathComponent.hasPrefix("bycoda-voice-"), file.pathExtension == "wav", (44...8_000_044).contains(size) else {
      throw VoiceError("Invalid cached voice audio.")
    }
    stopCapture(supplied); stopPlayback(supplied)
    guard let next = try? AVAudioPlayer(contentsOf: file) else { throw VoiceError("Speech playback failed.") }
    next.delegate = self
    guard next.prepareToPlay(), next.play() else { throw VoiceError("Speech playback failed.") }
    player = next; playbackId = playingId
    locked { phase = "speaking" }
    armIdle(); publish()
    playbackLimit?.cancel()
    playbackLimit = later(120) { [weak self] in
      guard let self, self.playbackId == playingId else { return }
      self.stopPlayback(self.id, error: "Speech playback timed out.")
    }
  }
  func stopPlayback(_ supplied: String, error: String? = nil, expected: String? = nil) {
    guard !id.isEmpty, id == supplied else { return }
    if let expected {
      playbackFence.cancel(expected)
      if playbackId != expected { return }
    }
    playbackLimit?.cancel()
    let previous = player, previousId = playbackId
    player = nil; playbackId = nil
    if let previousId { playbackFence.cancel(previousId) }
    previous?.delegate = nil; previous?.stop()
    locked { if phase == "speaking" { phase = "idle" } }
    if let previousId { emit(["type": "playback", "sessionId": id, "playbackId": previousId, "error": error]) }
    if !ended { publish() }
  }
  public func audioPlayerDidFinishPlaying(_ finished: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.player === finished else { return }
      self.stopPlayback(self.id, error: flag ? nil : "Speech playback failed.")
    }
  }
  public func audioPlayerDecodeErrorDidOccur(_ failed: AVAudioPlayer, error: Error?) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.player === failed else { return }
      self.stopPlayback(self.id, error: "Speech playback failed.")
    }
  }
}

public class BycodaVoiceCompanionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BycodaVoiceCompanion")
    Events("onVoiceEvent")
    OnCreate { VoiceCallEngine.shared.listener = { [weak self] event in self?.sendEvent("onVoiceEvent", event) } }
    OnDestroy { DispatchQueue.main.async { VoiceCallEngine.shared.end("revoked") } }
    Function("getState") { VoiceCallEngine.shared.snapshot() }
    /** Input ports as {name, type, uid}; type is a coarse kind (builtin, wired, bluetooth, carplay or other). */
    Function("listInputs") { VoiceCallEngine.listInputs() }
    Function("setPreferredInput") { (uid: String?) in
      DispatchQueue.main.async { VoiceCallEngine.shared.preferredInput = uid }
    }
    AsyncFunction("beginSession") { () throws -> String in try VoiceCallEngine.shared.begin(microphone: true) }.runOnQueue(.main)
    AsyncFunction("beginPlaybackSession") { () throws -> String in try VoiceCallEngine.shared.begin(microphone: false) }.runOnQueue(.main)
    AsyncFunction("startCapture") { (id: String, captureId: String) throws in
      try VoiceCallEngine.shared.startCapture(id, captureId)
    }.runOnQueue(.main)
    Function("stopCapture") { (id: String, captureId: String) in
      DispatchQueue.main.async { VoiceCallEngine.shared.stopCapture(id, expected: captureId) }
    }
    Function("setMuted") { (id: String, muted: Bool) in
      DispatchQueue.main.async { VoiceCallEngine.shared.setMuted(id, muted) }
    }
    AsyncFunction("playWav") { (id: String, playbackId: String, uri: String) throws in
      try VoiceCallEngine.shared.playWav(id, playbackId, uri)
    }.runOnQueue(.main)
    Function("stopPlayback") { (id: String, playbackId: String) in
      DispatchQueue.main.async { VoiceCallEngine.shared.stopPlayback(id, expected: playbackId) }
    }
    Function("endSession") { (id: String) in
      DispatchQueue.main.async { VoiceCallEngine.shared.endSession(id) }
    }
    /** iOS has no picture-in-picture call window; the system microphone indicator returns to the app. */
    AsyncFunction("enterPip") { (_: String) -> Bool in false }
  }
}
