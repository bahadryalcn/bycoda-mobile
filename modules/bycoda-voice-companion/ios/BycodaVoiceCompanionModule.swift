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
 * One streamed spoken reply: PCM16 chunks become Float32 buffers scheduled on a player node as they arrive.
 * The node feeds the engine's main mixer, which converts the reply rate (24 kHz) to the output format.
 * Played position counts buffers the speaker finished, so an underrun never counts as heard. Main queue only.
 */
private final class PcmStream {
  let id: String
  let format: AVAudioFormat
  let rate: Double
  var engine: AVAudioEngine?
  var node: AVAudioPlayerNode?
  /** Bumped when the node is replaced or detached; completions of an older node are ignored. */
  var generation = 0
  var scheduled: AVAudioFramePosition = 0
  var played: AVAudioFramePosition = 0
  var started = false
  var finishing = false
  var drained: [Promise] = []
  init?(id: String, sampleRate: Int) {
    guard (8_000...96_000).contains(sampleRate),
          let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(sampleRate), channels: 1, interleaved: false) else { return nil }
    self.id = id; self.format = format; self.rate = Double(sampleRate)
  }
  var playedMs: Double { rate > 0 ? (Double(played) * 1000 / rate).rounded(.down) : 0 }
  /** Start (or restart after an underrun) once 150 ms is queued, or at once for the reply's last audio. */
  func playIfReady() {
    guard !started, let node, let engine, engine.isRunning, scheduled > played,
          finishing || Double(scheduled - played) >= rate * 0.15 else { return }
    node.play(); started = true
  }
  func resolveIfDrained() {
    guard finishing, played >= scheduled else { return }
    let waiting = drained; drained = []
    waiting.forEach { $0.resolve() }
  }
  /** Detach from the engine; buffers still queued on the old node are dropped from the accounting. */
  func detach() {
    generation += 1
    if let node { node.stop(); engine?.detach(node) }
    node = nil; engine = nil; started = false
    scheduled = played
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
  /** 300 ms of 16 kHz PCM16 per bridge event, as the Android service batches, instead of one per ~85 ms tap. */
  private static let pcmBatchBytes = 9600
  /** 100 ms batches for a realtime call relayed by the computer; only these two sizes are accepted. */
  private static let realtimePcmBatchBytes = 3200
  private var batchBytes = 9600
  private var pcmBatch = Data()
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayer?
  /** A streamed reply (startPcm/appendPcm/finishPcm), on the call's engine or the playback-only engine. */
  private var stream: PcmStream?
  /** Output-only engine of a playback session, which has no microphone engine to share. */
  private var outputEngine: AVAudioEngine?
  private var outputObserver: NSObjectProtocol?
  /** Played milliseconds of the live stream, readable from the JS thread. */
  private var reported: (id: String, ms: Double)?
  /**
   * Realtime full duplex: voice-chat mode with voice processing (echo cancellation) on the engine, so the
   * microphone stays open while a reply plays through the same engine. Off for every other session.
   */
  private var duplex = false
  private var playbackId: String?
  private var captureFence = VoiceOperationFence()
  private var playbackFence = VoiceOperationFence()
  private var idleTimer: DispatchWorkItem?
  private var captureLimit: DispatchWorkItem?
  private var playbackLimit: DispatchWorkItem?
  private var observers: [NSObjectProtocol] = []
  /** Route-change observer of the current engine only; replaced and removed with it, never accumulated. */
  private var engineObserver: NSObjectProtocol?
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
    idleTimer = nil
    // Muted time is not idle time: the window runs only while unmuted and restarts on unmute.
    if locked({ muted }) { return }
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
    locked { id = next; ended = false; phase = "idle"; muted = false; microphone = wantsMicrophone; live = nil; reported = nil }
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
    stopEngine(); stopOutputEngine()
    duplex = false
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
    // Voice processing (echo cancellation against this engine's own output) must be set before the
    // engine is prepared and changes the input format, so it is read afterwards.
    if duplex {
      do { try input.setVoiceProcessingEnabled(true) } catch { throw VoiceError("Echo cancellation is unavailable.") }
      guard input.isVoiceProcessingEnabled else { throw VoiceError("Echo cancellation is unavailable.") }
    }
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0, let converter = AVAudioConverter(from: format, to: target) else {
      throw VoiceError("Microphone configuration is unavailable.")
    }
    // A voice-processed input can report several channels; mix them down instead of taking only the first.
    if format.channelCount > 1 { converter.downmix = true }
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in self?.receive(buffer, converter) }
    _ = next.mainMixerNode
    next.prepare()
    do { try next.start() } catch { input.removeTap(onBus: 0); throw VoiceError("Microphone could not start.") }
    engine = next
    // A reply streaming while the engine was replaced (route change) continues on the new one.
    if let stream { attach(stream, to: next) }
    // A route change (headset, Bluetooth) stops the engine; reopen it on the new input or end the call.
    engineObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: next, queue: .main) { [weak self] _ in
      guard let self, self.engine === next, !self.ended else { return }
      self.stopEngine()
      do { try self.startEngine() } catch { self.end("audio-interrupted", (error as? VoiceError)?.param) }
    }
  }
  private func stopEngine() {
    if let observer = engineObserver { NotificationCenter.default.removeObserver(observer); engineObserver = nil }
    guard let current = engine else { return }
    engine = nil
    if let stream, stream.engine === current { stream.detach() }
    current.inputNode.removeTap(onBus: 0)
    current.stop()
  }
  /** The engine a streamed reply plays on: the call's own (so voice processing hears it), else an output-only one. */
  private func playbackEngine() throws -> AVAudioEngine {
    if microphone {
      if engine?.isRunning != true { stopEngine(); try startEngine() }
      guard let current = engine else { throw VoiceError("Speech playback is unavailable.") }
      return current
    }
    if let current = outputEngine, current.isRunning { return current }
    stopOutputEngine()
    let next = AVAudioEngine()
    _ = next.mainMixerNode
    next.prepare()
    do { try next.start() } catch { throw VoiceError("Speech playback is unavailable.") }
    outputEngine = next
    outputObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: next, queue: .main) { [weak self] _ in
      guard let self, self.outputEngine === next, !self.ended else { return }
      self.stopOutputEngine()
      do { if self.stream != nil { _ = try self.playbackEngine() } } catch { self.stopPlayback(self.id, error: "Speech playback failed.") }
    }
    if let stream { attach(stream, to: next) }
    return next
  }
  private func stopOutputEngine() {
    if let observer = outputObserver { NotificationCenter.default.removeObserver(observer); outputObserver = nil }
    guard let current = outputEngine else { return }
    outputEngine = nil
    if let stream, stream.engine === current { stream.detach() }
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
    pcmBatch.append(data)
    let finished = captured >= Self.captureSamples
    // A partial batch is sent only when the sample budget is spent, so the final audio is never dropped at the limit.
    if pcmBatch.count >= batchBytes || finished { flushPcm(capture) }
    if finished { stopCapture(id, reason: "limit") }
  }
  private func flushPcm(_ capture: Capture) {
    guard !pcmBatch.isEmpty else { return }
    let batch = pcmBatch
    pcmBatch.removeAll(keepingCapacity: true)
    emit(["type": "pcm", "sessionId": id, "captureId": capture.id, "audio": batch.base64EncodedString(), "sampleRate": Int(Self.sampleRate)])
  }
  func startCapture(_ supplied: String, _ token: String, _ requestedBatch: Int? = nil) throws {
    guard allows(supplied) else { throw VoiceError("Voice session is unavailable.") }
    guard microphone else { throw VoiceError("This voice session is playback-only.") }
    guard captureFence.allows(token) else { throw VoiceError("This recording operation was canceled.") }
    guard Self.microphoneGranted() else { throw VoiceError("Microphone permission is required.") }
    guard !muted, live == nil else { throw VoiceError("Microphone is muted or already recording.") }
    // Half duplex stops the reply; full duplex keeps it playing so speaking can interrupt it.
    if !duplex { stopPlayback(supplied) }
    applyPreferredInput()
    if engine?.isRunning != true {
      stopEngine()
      try startEngine()
    }
    generation += 1; captured = 0; pcmBatch.removeAll(keepingCapacity: true)
    batchBytes = requestedBatch == Self.realtimePcmBatchBytes ? Self.realtimePcmBatchBytes : Self.pcmBatchBytes
    let capture = Capture(id: token, generation: generation)
    locked { live = capture; if phase != "speaking" { phase = "recording" } }
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
    // The capture's time limit still delivers its last partial batch; any other stop discards it.
    if reason == "limit" { flushPcm(stopped) }
    pcmBatch.removeAll(keepingCapacity: true)
    locked { live = nil; if phase == "recording" { phase = "idle" } }
    if !ended { armIdle(); publish() }
    if let reason { emit(["type": "ended", "sessionId": id, "captureId": stopped.id, "reason": reason]) }
  }
  func setMuted(_ supplied: String, _ value: Bool) {
    guard allows(supplied) else { return }
    locked { muted = value }
    if value { stopCapture(supplied, reason: "muted") }
    // Re-evaluate after stopCapture (which re-arms): mute disarms the timer, unmute starts a fresh window. Never opens the microphone.
    if !ended { armIdle() }
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
    // Reserve the playback on the main queue, then read and decode the WAV off it; only the start and the
    // state publish hop back. A failure or cancel arrives as a playback event, never as a main-queue stall.
    playbackId = playingId
    locked { phase = "speaking" }
    armIdle(); publish()
    playbackLimit?.cancel()
    playbackLimit = later(120) { [weak self] in
      guard let self, self.playbackId == playingId else { return }
      self.stopPlayback(self.id, error: "Speech playback timed out.")
    }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let next = try? AVAudioPlayer(contentsOf: file)
      let prepared = next?.prepareToPlay() ?? false
      DispatchQueue.main.async { self?.startPrepared(next, prepared, supplied, playingId) }
    }
  }
  /** Main queue: adopt the prepared player only if this exact playback is still the live one. */
  private func startPrepared(_ next: AVAudioPlayer?, _ prepared: Bool, _ supplied: String, _ playingId: String) {
    guard allows(supplied), playbackId == playingId, playbackFence.allows(playingId) else { return }
    guard let next, prepared else { stopPlayback(supplied, error: "Speech playback failed."); return }
    next.delegate = self
    guard next.play() else { next.delegate = nil; stopPlayback(supplied, error: "Speech playback failed."); return }
    player = next
    armIdle()
  }
  // MARK: Streamed playback

  /** Starts a streamed reply at `sampleRate` (24 kHz for a realtime call); the engine's mixer converts it. */
  func startPcm(_ supplied: String, _ playingId: String, _ sampleRate: Int) throws {
    guard allows(supplied), playbackFence.allows(playingId) else { throw VoiceError("Voice session is unavailable.") }
    guard let next = PcmStream(id: playingId, sampleRate: sampleRate) else { throw VoiceError("Invalid speech sample rate.") }
    if !duplex { stopCapture(supplied) }
    stopPlayback(supplied)
    let output = try playbackEngine()
    stream = next; playbackId = playingId
    attach(next, to: output)
    locked { phase = "speaking"; reported = (playingId, 0) }
    armIdle(); publish()
    armPlaybackLimit(playingId)
  }
  func appendPcm(_ supplied: String, _ playingId: String, _ audio: String) throws {
    guard allows(supplied), playbackId == playingId, let current = stream, current.id == playingId else {
      throw VoiceError("Voice stream is unavailable.")
    }
    guard (1...1_000_000).contains(audio.utf8.count), let data = Data(base64Encoded: audio, options: .ignoreUnknownCharacters),
          !data.isEmpty, data.count % 2 == 0 else { throw VoiceError("Invalid speech audio.") }
    let frames = data.count / 2
    guard let buffer = AVAudioPCMBuffer(pcmFormat: current.format, frameCapacity: AVAudioFrameCount(frames)),
          let channel = buffer.floatChannelData?[0] else { throw VoiceError("Speech playback failed.") }
    buffer.frameLength = AVAudioFrameCount(frames)
    data.withUnsafeBytes { raw in
      for index in 0..<frames {
        channel[index] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: index * 2, as: Int16.self))) / 32768
      }
    }
    // A route change can leave the stream between engines for a moment; reattach before scheduling.
    if current.node == nil { let output = try playbackEngine(); attach(current, to: output) }
    schedule(buffer, on: current)
    armIdle()
    armPlaybackLimit(playingId)
  }
  /** Resolves once every scheduled frame has played, or at once when the stream is stopped. */
  func finishPcm(_ supplied: String, _ playingId: String, _ promise: Promise) {
    guard allows(supplied), playbackId == playingId, let current = stream, current.id == playingId else {
      promise.reject(VoiceError("Voice stream is unavailable.")); return
    }
    current.finishing = true
    current.drained.append(promise)
    current.playIfReady()
    current.resolveIfDrained()
  }
  /** Thread-safe: milliseconds of the live stream the speaker has played; 0 for any other playback. */
  func pcmPlayedMs(_ supplied: String, _ playingId: String) -> Double {
    locked { !ended && id == supplied && reported?.id == playingId ? reported?.ms ?? 0 : 0 }
  }
  private func attach(_ current: PcmStream, to output: AVAudioEngine) {
    if current.engine === output, current.node != nil { return }
    current.detach()
    let node = AVAudioPlayerNode()
    output.attach(node)
    output.connect(node, to: output.mainMixerNode, format: current.format)
    if !output.isRunning { try? output.start() }
    current.engine = output; current.node = node
    // After a route change the lost buffers no longer count; a finishing reply may now be complete.
    current.resolveIfDrained()
  }
  private func schedule(_ buffer: AVAudioPCMBuffer, on current: PcmStream) {
    guard let node = current.node else { return }
    let generation = current.generation, frames = AVAudioFramePosition(buffer.frameLength)
    current.scheduled += frames
    node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      DispatchQueue.main.async { self?.played(frames, of: current, generation) }
    }
    current.playIfReady()
  }
  /** Main queue: a buffer finished playing. An empty queue pauses the node until 150 ms is buffered again. */
  private func played(_ frames: AVAudioFramePosition, of current: PcmStream, _ generation: Int) {
    guard stream === current, current.generation == generation else { return }
    current.played += frames
    locked { reported = (current.id, current.playedMs) }
    if current.played >= current.scheduled {
      if current.finishing { current.resolveIfDrained() }
      else if current.started { current.node?.pause(); current.started = false }
    }
  }
  /** A reply that keeps receiving audio is not stalled: the limit counts from its last chunk. */
  private func armPlaybackLimit(_ playingId: String) {
    playbackLimit?.cancel()
    playbackLimit = later(120) { [weak self] in
      guard let self, self.playbackId == playingId else { return }
      self.stopPlayback(self.id, error: "Speech playback timed out.")
    }
  }

  // MARK: Realtime full duplex

  /**
   * A realtime call asks for full duplex before it first listens: voice-chat mode and voice processing on the
   * call's engine, so its replies are cancelled out of the microphone. Returns whether that is active; on
   * failure the call stays half duplex on the default path.
   */
  func setEchoCancellation(_ supplied: String, _ enabled: Bool) throws -> Bool {
    guard allows(supplied), microphone else { throw VoiceError("Voice session is unavailable.") }
    if enabled == duplex { return duplex }
    guard live == nil, stream == nil, player == nil else { throw VoiceError("Echo cancellation changes only while the call is quiet.") }
    let session = AVAudioSession.sharedInstance()
    stopEngine()
    do {
      try session.setCategory(.playAndRecord, mode: enabled ? .voiceChat : .default, options: [.defaultToSpeaker, .allowBluetooth])
      duplex = enabled
      applyPreferredInput()
      try startEngine()
      return duplex
    } catch {
      stopEngine()
      duplex = false
      try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
      do { try startEngine() } catch {
        end("audio-interrupted", (error as? VoiceError)?.param)
        throw VoiceError("Microphone could not start.")
      }
      return false
    }
  }

  func stopPlayback(_ supplied: String, error: String? = nil, expected: String? = nil) {
    guard !id.isEmpty, id == supplied else { return }
    if let expected {
      playbackFence.cancel(expected)
      if playbackId != expected { return }
    }
    playbackLimit?.cancel()
    let previous = player, previousId = playbackId, previousStream = stream
    player = nil; playbackId = nil; stream = nil
    if let previousId { playbackFence.cancel(previousId) }
    previous?.delegate = nil; previous?.stop()
    // A stopped stream is flushed at once; a waiting finishPcm resolves, as on Android.
    if let previousStream {
      previousStream.detach()
      let waiting = previousStream.drained; previousStream.drained = []
      waiting.forEach { $0.resolve() }
    }
    // An open duplex capture keeps listening after the reply.
    locked { if phase == "speaking" { phase = live != nil ? "recording" : "idle" } }
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
    AsyncFunction("startCapture") { (id: String, captureId: String, batchBytes: Int?) throws in
      try VoiceCallEngine.shared.startCapture(id, captureId, batchBytes)
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
    /** Streamed reply, the same surface as Android: PCM16 base64 chunks at `sampleRate`, played as they arrive. */
    AsyncFunction("startPcm") { (id: String, playbackId: String, sampleRate: Int) throws in
      try VoiceCallEngine.shared.startPcm(id, playbackId, sampleRate)
    }.runOnQueue(.main)
    AsyncFunction("appendPcm") { (id: String, playbackId: String, audio: String) throws in
      try VoiceCallEngine.shared.appendPcm(id, playbackId, audio)
    }.runOnQueue(.main)
    AsyncFunction("finishPcm") { (id: String, playbackId: String, promise: Promise) in
      VoiceCallEngine.shared.finishPcm(id, playbackId, promise)
    }.runOnQueue(.main)
    /** Milliseconds of a streamed reply the speaker has played (an underrun does not count); 0 when it is not live. */
    Function("pcmPlayedMs") { (id: String, playbackId: String) -> Double in
      VoiceCallEngine.shared.pcmPlayedMs(id, playbackId)
    }
    /** Realtime full duplex, asked before the call first listens; resolves whether echo cancellation is active. */
    AsyncFunction("setEchoCancellation") { (id: String, enabled: Bool) throws -> Bool in
      try VoiceCallEngine.shared.setEchoCancellation(id, enabled)
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
