# 2. A person is a household member identified by device tokens

## Status

proposed

## Context

The brief leaves "what counts as a person" to me. My core argument is that
food trackers die from friction, so getting in has to cost almost nothing:
open an invite link, type your name, and you're in. But people use a phone
and a laptop, and they clear cookies, so identity can't be just one cookie
forever. Markers test as a newly invited member in two sessions and come back
the next day.

The app also crosses a privacy line: households share offers with
neighbours they may not know. I don't want public profiles, and I don't want
member names leaving the household.

I weighed:

- **Email magic links**: survives cleared cookies and works on any device,
  but needs an outbound mail service and an API secret on Fly, has
  deliverability problems, and means storing email addresses.
- **Password accounts**: the most robust and the most friction, which is
  exactly what the app argues against.

## Decision

A person is a **member**: a display name inside one household. There are no
accounts.

- Joining (first run or invite link or code) creates a member and a device
  token: an unguessable random value sent as an `httpOnly` cookie and stored
  only as a hash, so there is no signing secret to manage and a leaked
  database can't be replayed as cookies.
- A signed-in member can show a "sign in as me" link or QR code to add
  another device; that creates another token for the same member.
- Later (week 12), a member can register a **passkey** as an optional way
  back in after clearing cookies. It stores only a public key.
- One household per device.
- Any member can invite, leave, or remove another member; removal revokes
  that member's tokens immediately.
- Communities see the **household** name only, never member names.

## Consequences

- Getting in is one name field. Nothing personal is stored beyond a display
  name.
- Until passkeys land, someone who clears cookies on their only device needs
  a housemate to invite them again, and their old member record is orphaned.
- Any member removing any other relies on household trust; there is no
  owner role.
- Passkeys add one server dependency (`@simplewebauthn/server`); Chrome's
  virtual authenticator can test them in `spec/`.
- Household names become the public identity in communities, so clashes need
  a suffix ("Unit 4 · 2").
