# 5. Passkeys by SimpleWebAuthn, with discoverable credentials

## Status

superseded by 0008

## Context

ADR 0002 makes a person a member of one household, signed in by a device
token in a cookie. It already says a passkey may come later. The cost of the
cookie-only design is that a device with no cookie (a cleared browser, a new
phone) needs an invite link, a device link or a code from someone already in.
A passkey lets a member get back in alone, with nothing to type.

I weighed:

- **A hand-rolled verifier on `node:crypto`.** No dependency, but registration
  and sign-in verification means parsing CBOR and COSE keys, checking
  attestation formats, the origin, the relying-party hash, the signature and
  the counter. Each is easy to get subtly wrong, and a wrong check is a way
  into someone else's pantry.
- **Passkeys as a second kind of session.** The middleware and every endpoint
  would then need to know two ways of being signed in.
- **Named credentials (ask for a username first).** The sign-in page would have
  to learn who is signing in before the browser answers, which means a lookup
  that can confirm whether a name exists.

## Decision

- **Library:** `@simplewebauthn/server` 14 verifies registration and
  sign-in; `@simplewebauthn/browser` 14 wraps `navigator.credentials` and the
  base64url handling. They add about 1.1 MB unpacked, and the server package
  has ten small transitive dependencies. The server package is loaded with
  `await import()` inside the passkey handlers only, so a process that never
  sees a passkey request never loads it.
- **Discoverable credentials.** Registration asks for `residentKey: required`
  and `userVerification: required`, with the member id as the user handle.
  Sign-in sends no `allowCredentials`, so the page never learns who is signing
  in before the browser answers, and the endpoint has no username to confirm.
  Unknown credential, wrong challenge, mismatched handle and bad signature all
  give the same 400.
- **A passkey mints a device token.** A successful sign-in inserts a new
  `device_tokens` row and sets the same `pantry_device` cookie as every other
  sign-in. Middleware and all other endpoints are unchanged, and a member
  removed from a household loses their passkeys by cascade, like their tokens.
- **What is stored:** the credential id, public key, signature counter and
  transports, per member. No secret. A counter that does not go up is refused
  (the library's rule for cloned credentials); synced passkeys report 0 and are
  accepted.
- **Challenges** live in memory for five minutes, single use, keyed by an id in
  a short-lived `httpOnly` cookie scoped to `/passkey`. There is one machine,
  so a restart only costs a retry. Failed sign-ins count toward a throttle of
  ten per minute per client address.
- **Relying party:** the host the request arrived on (`url.hostname`,
  `url.origin`), which behind Fly is the `fly.dev` host because Astro trusts
  Fly's forwarded protocol.

## Consequences

- A member can add a passkey on the household page and later sign in on a
  device with no cookie, as the same member. Nobody else can see or use it.
- Two dependencies join the app, one of them (the server package) loaded only
  when a passkey is used.
- Passkeys are optional: invite links, device links and codes still work, and
  with scripts off or no WebAuthn the page says so.
- A passkey is bound to the host. Moving the app to another domain strands
  existing passkeys until members add new ones.
- A removed passkey stops working at once on the server, even if a device still
  holds the credential.

### Measured memory

Fly's machine has 256 MB. Resident set size of the built server
(`node dist/server/entry.mjs`, local macOS, Node 24, 2026-10-07), in KB:

| Build | Idle (a few page requests, no passkey request) | After one register and one sign-in |
| --- | --- | --- |
| HEAD without passkeys | 250,896 | n/a |
| With passkeys | 252,336 | 257,760 |

Passkeys add about 1.4 MB at idle and about 5.4 MB more once the server
package has been loaded. The idle baseline is already about 250 MB on this
machine; macOS counts shared libraries in RSS, so it is not the figure Fly's
Linux machine will show. Read on the deployed machine on 2026-10-07, right
after the offers, privacy and communities specs had run against it, the whole
machine showed 212 MB total and 111 MB available, so about 100 MB in use. (The
container has no `ps`, so the node process's own figure wasn't readable; the
machine-wide number includes it.) That leaves comfortable room under the
256 MB limit, so passkeys are accepted on memory grounds.
