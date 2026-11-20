# bycoda Host socket

Local Expo module, automatically discovered from `mobile/modules/`. It requires a
new native development/release build; Expo Go and the browser never substitute
an unpinned React Native WebSocket for this module.

`acquireCredential` binds an opaque UUID handle to the existing
`bycoda.remote.<machineId>` SecureStore entry, environment, exact WSS endpoint,
credential generation and access epoch. It stores a native fingerprint, not a
base64 secret disguised as a handle. Reads reuse SecureStore's own authentication
and legacy-recovery routines. Store/delete use the same fixed bycoda service and
WHEN_UNLOCKED_THIS_DEVICE_ONLY policy. No native secret getter is registered for
JavaScript. Existing guarded JS credential access remains a separately owned
legacy HTTP compatibility exception until that cohort retires.

The native-only SecureStore accessor patch is pinned to 58.0.2 and registered in
`pnpm-workspace.yaml`. A future authorized dependency installation must apply it
before a native build. No installed package is edited by the verifier:

```
node modules/bycoda-host-socket/patches/secure-store-bridge.mjs
```

The verifier applies the maintained patch in memory and rejects version/routine
drift. Changing the SDK requires reviewing the native provider. Provisioning
accepts newly paired token input; it never returns a stored bearer. A future
fully native pairing/bootstrap owner can call the same provider. Source alone
does not establish that the current JS pairing path is already native-only.

WSS accepts no URL userinfo, query token or redirect. A paired private CA is
verified against its full DER SPKI hash and used as the sole per-client trust
anchor. Android retains OkHttp hostname checks; iOS retains SSL host policy and
evaluates the chain to the exact paired CA. CryptoKit's P256 DER representation
provides SPKI encoding; no raw EC point is mislabeled as SPKI. Ordinary public-CA
WSS uses normal platform trust. No global TLS override exists.

`open` is one attempt. The app-scoped `MobileHostRuntimeRegistry` owns retry and
lifecycle policy. Auth, identity, schema and TLS errors block until explicit
input/access changes. App background/lock, route replacement and credential
changes invalidate handles and close sockets. A command acknowledgement lost
after dispatch remains uncertain under its same commandId; reconnect never
resends it or falls back to HTTP. Calls made while connecting remain unsent.

Limits: four sockets, 64 opaque handles, 64 pending JS RPCs, 1 MiB application
messages, 8 MiB outbound bytes, and 512 native bridge deliveries/16 MiB per socket (a busy Host sends a burst of stream frames on connect; a lower credit closed healthy sockets with `overload`).
Native bridge credit is distinct from a server stream acknowledgement. The
application acknowledges a server cursor only after its cache/reducer commits.
Bulk HTTP is same-origin and credential-bound, 64 KiB chunks, at most two jobs,
32 MiB per descriptor/64 MiB aggregate. It checks total length, SHA-256, UTF-8 and
the domain result schema before disclosure. Bulk timeout/cancellation retains a
job until the outstanding native chunk settles.

`AppProviders` installs the ref-counted app owner. The existing `HostTransport`
routes the explicit `transport.ws.sessions.v2` method cohort through it and
releases each view's demand at detach. Authenticated `environment.describe`
remains the HTTP descriptor/bootstrap plane; private LAN uses its existing
encrypted request. Its public `mobileTls` is checked against environment, CA
generation and same-origin bulk policy before native use. Missing private-LAN
trust is explicitly unsupported. Old Hosts, unported domains, and the separate
browser cohort retain their existing guarded HTTP adapters. They never receive
a request that already attempted WSS as a transport fallback.

The mounted transcript uses scoped snapshot/delta demand instead of its polling
loop. An unmatched delta base requests a fresh logical subscription without
advancing the cursor. Cache writes fence current route, access, project/session
and native generation, cancel older query writes, and finish bounded history
hydration before acknowledgement. Project activity uses the first 32 scoped
project streams; additional project groups keep the explicit bounded HTTP
compatibility cohort, preserving the complete collection within socket quotas.
Retiring that last large-directory polling cohort requires a paged/lazy demand
surface or an aggregate summary stream. Transport readiness and cached-data
freshness remain distinct; cached content can survive a transient disconnect.

Native access starts locked and requires a monotonic access epoch. Background
events independently close the native gate, even before JavaScript resumes.
Canceled socket/bulk SDK jobs remain charged until their native completion
callbacks release them; logical detach cannot free admission for hanging I/O.

OkHttp exposes application messages after assembling their frames. Its callback
byte check bounds delivery queues, and the Host enforces outgoing frame limits;
it is not proof of an Android preassembly heap cap. iOS additionally sets
maximumMessageSize. Native heap/slow-consumer stress is a named acceptance gate.

The TypeScript tests use a fake native module. The public SPKI fixture is shared
by Node, Android JUnit and iOS XCTest; the platform tests still require actual
native compilation. Pending acceptance: patched SecureStore native read/write/
delete and upgrade recovery; actual CA/leaf/SAN/validity/rotation/MITM handshakes;
Android heap limits; Android/iOS background/lock/revocation; physical-device
pairing and multi-device sessions. No package build, installation or publication
is performed by this implementation.

## Phone tunnel

`tunnelSupported()` is true only on a native build whose platform can scope a proxy
to the tunnel alias (iOS 17+, Android WebView proxy override); it is false in Expo
Go and on the web. `startTunnel({credential, endpoint, target})` takes a handle from
`acquireCredential` and the Host's `wss://<host>/ws-tunnel` endpoint, and returns
`{tunnelId, proxyPort, alias}`; `stopTunnel` ends it and `onTunnelEvent` reports
`error`/`closed`. The native view `BycodaTunnelWebView` (`tunnelWebViewComponent()`)
loads `http://<alias>:<port>/...` through that local SOCKS5 proxy; the alias is a
per-tunnel secret and is shown to users only as `localhost`. The Host contract is in
`temp/local/chat-cross-device/tunnel-contract.md`.

References: [Expo local modules](https://docs.expo.dev/modules/get-started/),
[Expo autolinking](https://docs.expo.dev/modules/autolinking/),
[CryptoKit P256 public key](https://developer.apple.com/documentation/cryptokit/p256/signing/publickey).
