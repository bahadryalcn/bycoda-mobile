package expo.modules.bycodahostsocket

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.net.URI

internal object TunnelWebViewSupport {
  /** Scoping needs reverse bypass: only the alias is proxied, every other host (and every other WebView) stays direct. */
  fun supported() = WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE) &&
    WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE_REVERSE_BYPASS)
}

/**
 * Native WebView for "open on this phone". The page loads only after the app-wide proxy override (alias only,
 * via SOCKS5 on the loopback tunnel listener) is active. No file access, no JavaScript interfaces, no persistence.
 */
@SuppressLint("SetJavaScriptEnabled")
class BycodaTunnelWebView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onNavigationChange by EventDispatcher<Map<String, Any?>>()
  private val onLoadError by EventDispatcher<Map<String, Any?>>()
  private val onExternalLink by EventDispatcher<Map<String, Any?>>()
  override val shouldUseAndroidLayout = true

  var proxyPort = 0
  var alias = ""
  var url = ""
  var dataSaver = false

  private var proxyActive = false
  private var appliedPort = 0
  private var appliedAlias = ""
  private var loadedUrl: String? = null
  private var destroyed = false

  private val web = WebView(context).apply {
    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    @Suppress("DEPRECATION") run {
      settings.allowFileAccessFromFileURLs = false
      settings.allowUniversalAccessFromFileURLs = false
    }
    settings.setGeolocationEnabled(false)
    settings.setSupportMultipleWindows(false)
    settings.mediaPlaybackRequiresUserGesture = true
    settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
    settings.setSupportZoom(true)
    settings.builtInZoomControls = true
    settings.displayZoomControls = false
    webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (isAlias(request.url)) return false
        if (request.isForMainFrame) onExternalLink(mapOf("url" to request.url.toString()))
        return true
      }
      override fun onPageStarted(view: WebView, pageUrl: String, favicon: Bitmap?) { emitNavigation(pageUrl, true) }
      override fun onPageFinished(view: WebView, pageUrl: String) { emitNavigation(pageUrl, false) }
      override fun doUpdateVisitedHistory(view: WebView, pageUrl: String, isReload: Boolean) { emitNavigation(pageUrl, false) }
      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) onLoadError(mapOf("code" to error.errorCode.toString(), "description" to error.description.toString()))
      }
      override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        onLoadError(mapOf("code" to "render_process_gone", "description" to "The page process stopped."))
        return true
      }
    }
  }

  init { addView(web) }

  private fun isAlias(uri: android.net.Uri) =
    alias.isNotEmpty() && uri.scheme == "http" && uri.host.equals(alias, ignoreCase = true)

  private fun emitNavigation(pageUrl: String, loading: Boolean) {
    if (destroyed) return
    onNavigationChange(mapOf("url" to pageUrl, "title" to (web.title ?: ""), "loading" to loading, "canGoBack" to web.canGoBack(), "canGoForward" to web.canGoForward()))
  }

  /** Called by the module after a batch of prop changes (props arrive in no fixed order). */
  fun applyProps() {
    if (destroyed) return
    web.settings.blockNetworkImage = dataSaver
    web.settings.loadsImagesAutomatically = !dataSaver
    if (proxyPort <= 0 || alias.isEmpty() || url.isEmpty()) return
    if (!proxyActive || appliedPort != proxyPort || appliedAlias != alias) { setProxy(); return }
    if (loadedUrl != url) { loadedUrl = url; web.loadUrl(url) }
  }

  private fun setProxy() {
    if (!TunnelWebViewSupport.supported()) { onLoadError(mapOf("code" to "proxy_unsupported", "description" to "Proxy override is not supported.")); return }
    val port = proxyPort
    val name = alias
    val config = ProxyConfig.Builder()
      .addProxyRule("socks5://127.0.0.1:$port")
      .addBypassRule(name)
      .setReverseBypassEnabled(true)
      .build()
    ProxyController.getInstance().setProxyOverride(config, ContextCompat.getMainExecutor(context)) {
      if (destroyed || port != proxyPort || name != alias) return@setProxyOverride
      proxyActive = true; appliedPort = port; appliedAlias = name
      applyProps()
    }
  }

  fun goBack() { if (web.canGoBack()) web.goBack() }
  fun goForward() { if (web.canGoForward()) web.goForward() }
  fun reload() { web.reload() }
  fun stopLoading() { web.stopLoading() }

  /** Detach: clear the app-wide proxy override, stop the tunnel that served this view and wipe alias-scoped state. */
  fun destroyTunnelView() {
    if (destroyed) return
    destroyed = true
    val port = appliedPort.takeIf { it > 0 } ?: proxyPort
    val origin = runCatching { URI(url).let { "${it.scheme}://${it.host}" + (if (it.port > 0) ":${it.port}" else "") } }.getOrNull()
    val host = runCatching { URI(url).host }.getOrNull()
    web.stopLoading()
    web.loadUrl("about:blank")
    web.clearHistory()
    web.clearCache(true)
    // Cookies and storage are process-wide; only the per-tunnel random alias origin is cleared so other WebViews keep theirs.
    if (host != null) {
      val cookies = CookieManager.getInstance()
      cookies.getCookie("http://$host")?.split(";")?.map { it.substringBefore('=').trim() }?.filter { it.isNotEmpty() }?.forEach {
        cookies.setCookie("http://$host", "$it=; Max-Age=0; Path=/")
      }
      cookies.flush()
    }
    if (origin != null) WebStorage.getInstance().deleteOrigin(origin)
    if (proxyActive && WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
      ProxyController.getInstance().clearProxyOverride(ContextCompat.getMainExecutor(context)) {}
    }
    proxyActive = false
    removeView(web)
    web.destroy()
    if (port > 0) TunnelRegistry.stopByPort(port, "detached")
  }
}
