import ExpoModulesCore
import Network
import UIKit
import WebKit

private func stopBoundTunnel(port: Int, alias: String) {
  if port > 0, !alias.isEmpty { BycodaTunnelRegistry.stop(port: port, alias: alias) }
}

/**
 * Hosts a `WKWebView` whose traffic for the tunnel alias goes through the loopback SOCKS5 proxy of a `BycodaTunnel`.
 * The proxy needs iOS 17 (`WKWebsiteDataStore.proxyConfigurations`); `tunnelSupported()` is false below it and the view
 * stays empty. Everything here runs on the main thread.
 *
 * - Data store: non-persistent, so cookies and storage of the dev server never reach disk.
 * - Proxy: only the alias domain, no failover to a direct connection.
 * - Navigation: only `http://<alias>` is loaded; any other target is cancelled and reported through `onExternalLink`.
 */
final class BycodaTunnelWebView: ExpoView, WKNavigationDelegate, WKUIDelegate {
  let onNavigationChange = EventDispatcher()
  let onLoadError = EventDispatcher()
  let onExternalLink = EventDispatcher()

  var proxyPort = 0
  var alias = ""
  var urlString = ""
  var dataSaver = false

  private(set) var pageView: WKWebView?
  private var contentController: WKUserContentController?
  private var observers = [NSKeyValueObservation]()
  private var appliedKey = ""
  private var loadedUrl = ""
  private var appliedSaver: Bool?
  private var rulesReady = false
  private var rulesEpoch = 0
  private var lastProcessReload: Date?

  private static let dataSaverRules = #"[{"trigger":{"url-filter":".*","resource-type":["image","media"]},"action":{"type":"block"}}]"#
  private static let externalSchemes: Set<String> = ["http", "https", "mailto", "tel"]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
  }

  deinit {
    stopBoundTunnel(port: proxyPort, alias: alias)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    pageView?.frame = bounds
  }

  override func willMove(toSuperview newSuperview: UIView?) {
    super.willMove(toSuperview: newSuperview)
    // Detach: the tunnel exists only for this page, so it ends with the view.
    if newSuperview == nil {
      stopBoundTunnel(port: proxyPort, alias: alias)
      tearDown()
    }
  }

  // MARK: Props

  /** Called once after every batch of prop updates. */
  func configure() {
    guard #available(iOS 17.0, *) else { return }
    guard (1...65_535).contains(proxyPort), !alias.isEmpty, !urlString.isEmpty else { return }
    let key = "\(proxyPort)|\(alias)"
    if pageView == nil || key != appliedKey {
      build()
      appliedKey = key; loadedUrl = ""; appliedSaver = nil; rulesReady = false
    }
    syncRules()
  }

  @available(iOS 17.0, *)
  private func build() {
    tearDown()
    guard let port = NWEndpoint.Port(rawValue: UInt16(proxyPort)) else { return }
    let store = WKWebsiteDataStore.nonPersistent()
    var proxy = Network.ProxyConfiguration(socksv5Proxy: NWEndpoint.hostPort(host: .ipv4(.loopback), port: port))
    proxy.matchDomains = [alias]
    proxy.allowFailover = false
    store.proxyConfigurations = [proxy]

    let content = WKUserContentController()
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = store
    configuration.userContentController = content
    configuration.allowsInlineMediaPlayback = true
    let view = WKWebView(frame: bounds, configuration: configuration)
    view.navigationDelegate = self
    view.uiDelegate = self
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.allowsBackForwardNavigationGestures = true
    addSubview(view)
    pageView = view; contentController = content
    observers = [
      view.observe(\.url) { [weak self] _, _ in self?.emitNavigation() },
      view.observe(\.title) { [weak self] _, _ in self?.emitNavigation() },
      view.observe(\.isLoading) { [weak self] _, _ in self?.emitNavigation() },
      view.observe(\.canGoBack) { [weak self] _, _ in self?.emitNavigation() },
      view.observe(\.canGoForward) { [weak self] _, _ in self?.emitNavigation() },
    ]
  }

  private func tearDown() {
    observers.removeAll()
    pageView?.stopLoading()
    pageView?.navigationDelegate = nil; pageView?.uiDelegate = nil
    pageView?.removeFromSuperview()
    pageView = nil; contentController = nil
    rulesEpoch += 1
  }

  /** Rule lists apply to the next load, so a page is never started before the data saver state is in place. */
  private func syncRules() {
    if appliedSaver == dataSaver { loadIfNeeded(); return }
    appliedSaver = dataSaver
    rulesEpoch += 1
    let epoch = rulesEpoch
    rulesReady = false
    contentController?.removeAllContentRuleLists()
    guard dataSaver else { rulesReady = true; loadIfNeeded(); return }
    guard let store = WKContentRuleListStore.default() else { rulesReady = true; loadIfNeeded(); return }
    store.compileContentRuleList(forIdentifier: "bycoda.tunnel.data-saver.v1", encodedContentRuleList: BycodaTunnelWebView.dataSaverRules) { [weak self] list, _ in
      DispatchQueue.main.async {
        guard let self, self.rulesEpoch == epoch else { return }
        if let list { self.contentController?.add(list) }
        self.rulesReady = true
        self.loadIfNeeded()
      }
    }
  }

  private func loadIfNeeded() {
    guard rulesReady, let pageView, urlString != loadedUrl, let url = URL(string: urlString), isOwn(url) else { return }
    loadedUrl = urlString
    pageView.load(URLRequest(url: url))
  }

  // MARK: Commands

  func goBack() { pageView?.goBack() }
  func goForward() { pageView?.goForward() }
  func reload() { pageView?.reload() }
  func stopPage() { pageView?.stopLoading() }

  // MARK: Events

  private func isOwn(_ url: URL) -> Bool { url.scheme == "http" && url.host?.lowercased() == alias }

  private func emitNavigation() {
    guard let pageView else { return }
    onNavigationChange([
      "url": pageView.url?.absoluteString ?? "",
      "title": pageView.title ?? "",
      "loading": pageView.isLoading,
      "canGoBack": pageView.canGoBack,
      "canGoForward": pageView.canGoForward,
    ])
  }

  private func emitExternal(_ url: URL) {
    guard let scheme = url.scheme, BycodaTunnelWebView.externalSchemes.contains(scheme), url.host?.lowercased() != alias else { return }
    onExternalLink(["url": url.absoluteString])
  }

  private func emitError(_ error: Error) {
    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
    // WebKit reports a policy-cancelled navigation as "Frame load interrupted".
    if nsError.domain == "WebKitErrorDomain" && nsError.code == 102 { return }
    let description = nsError.localizedDescription.replacingOccurrences(of: alias, with: "localhost")
    onLoadError(["code": nsError.code, "description": description])
  }

  // MARK: WKNavigationDelegate / WKUIDelegate

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
    if isOwn(url) || url.absoluteString == "about:blank" { decisionHandler(.allow); return }
    decisionHandler(.cancel)
    if navigationAction.targetFrame?.isMainFrame ?? true { emitExternal(url) }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { emitError(error) }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { emitError(error) }
  /**
   * WebKit kills heavy dev-server pages under memory pressure. One automatic reload per window
   * recovers a single kill; a page that keeps dying shows the failed state (like Android) and the
   * manual Reload button instead of looping reload, kill, reload over the tunnel.
   */
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    let now = Date()
    if window != nil, lastProcessReload.map({ now.timeIntervalSince($0) >= 30 }) ?? true {
      lastProcessReload = now
      webView.reload()
      return
    }
    onLoadError(["code": "render_process_gone", "description": "The page process stopped."])
  }

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url {
      if isOwn(url) { webView.load(navigationAction.request) } else { emitExternal(url) }
    }
    return nil
  }
}
