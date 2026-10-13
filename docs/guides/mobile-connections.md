# Connecting the mobile app

In desktop **Settings → Connections → Connect your phone**, choose the computer
and a connection method. Choose the same method in the phone's Connections screen,
then scan the QR code or paste its pairing code. Codes expire after two minutes.

## Local network

Connect the phone and computer to the same Wi-Fi or LAN. Tailscale is optional.
Choose **Local network**, then **Enable local network access**. If the computer
has multiple private IPv4 addresses, select the one reachable from the phone.
Allow the phone's local network permission and the computer's firewall prompt
for the host on private networks. Guest Wi-Fi or client isolation can prevent
devices on the same Wi-Fi from reaching one another.

The normal host remains on loopback. A separate listener binds only to the selected
RFC 1918 IPv4 address and accepts encrypted mobile envelopes, with no browser
origins, bearer headers, raw RPC, or public forwarding. The QR pins an X25519
host public key. Each request uses a fresh ephemeral X25519 key, HKDF-SHA256,
separate request/response keys and AES-256-GCM with authenticated context.
The device credential, pairing ticket and workspace payloads are inside the
encrypted envelope. Captured requests have bounded timestamps and replay IDs.
A boot challenge inside each authenticated envelope also invalidates captured
requests when the listener restarts. Write operations retain the existing
no-automatic-retry policy.

The listener configuration and private key are stored in `mobile-lan.json` in the
existing host data directory (0600 on Unix, inherited host-directory permissions
on Windows). Explicitly enabled access resumes when the host restarts if that
interface is still available. **Turn off local network access** closes it without
revoking phone credentials or changing Tailscale services. If the IP changes,
update the saved phone connection using its existing pinned key, or scan a new QR.
The mobile device credential remains in SecureStore; only the public pin is saved
with connection metadata. Plain HTTP without a valid pin is rejected.

This transport protects payloads on a private network; it does not hide addresses,
traffic sizes or timing, prevent denial of service, or provide forward secrecy
against later compromise of the persistent host private key. Do not publish or
port-forward the LAN listener. IPv6-only LANs currently need a trusted HTTPS
endpoint or Tailscale. Native Android/iOS builds include local-network settings;
browser preview is not a pairing client.

## Tailscale

Choose **Tailscale** to connect from a different network. Sign into the same
Tailscale account on both devices. The existing setup flow enables a private HTTPS
Serve endpoint without overwriting unrelated Serve services or enabling Funnel.
Manual HTTPS address and device-key entry remains available.

Pairing with another method for an already saved computer updates that computer's
connection after verifying its environment identity. It does not automatically
switch networks or bypass the app lock, provider consent, host credential
revocation, or social sending approval rules.

Source checks, native configuration validation and loopback integration tests are
separate from installed desktop and physical-phone acceptance. A new native mobile
build is needed for changed network settings; an OTA JavaScript update alone is
insufficient.

The current React Native Android toolchain targets SDK 36. When migrating to SDK
37 or higher, also implement Android's `ACCESS_LOCAL_NETWORK` runtime permission
before raising the target; SDK 36 apps use the existing `INTERNET` permission.
See [Android local network permissions](https://developer.android.com/privacy-and-security/local-network-permission),
[Apple local-network transport settings](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking),
and the [Noble cryptography APIs](https://github.com/paulmillr/noble-curves#ecdh-diffie-hellman-shared-secrets).
