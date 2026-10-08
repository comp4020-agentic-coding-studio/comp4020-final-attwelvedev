# DESIGN.md (draft v0)

Status: a proposal to react to, not a decision. Items tagged **[decide]** are open.
Every value below is a named constant. Code reads these tokens and never hard-codes a colour, size or duration.

## Principles

1. Roles must be readable at a glance: every role and hazard uses colour **and** shape.
2. Humour comes from the chaos, not from the conditions. UI labels name the constraint.
3. Everything is drawn in code (canvas shapes). No sprite sheets. The only outside assets are the reaction faces and the sound clips, each logged in `CREDITS.md`.

## Palette tokens

| token | hex | use |
|---|---|---|
| `bg` | `#0B1220` | background |
| `solid` | `#1B2742` | walls and floor fill |
| `solid-edge` | `#4A5F8F` | 2px edge on solid tiles |
| `ui` | `#E8EEF9` | text, outlines of interactables |
| `ui-muted` | `#9AA7C2` | secondary text; smoke at 45% alpha |
| `danger` | `#FF3B5C` | lasers, alarms, guard sight line |
| `camera-light` | `#FFD166` | camera cone at 25% alpha |
| `crate-light` | `#C58B5A` | light crate |
| `crate-heavy` | `#8A5A3C` | heavy crate (plus a thick X brace) |
| `gate` | `#6C7A9C` | doors and gates |
| `checkpoint` | `#7DD3FC` | checkpoint flag |
| `goal` | `#5BE3A8` | loot (diamond) and exit (framed doorway) |

## Role identity

| id (code) | UI label | colour | shape |
|---|---|---|---|
| `blind` | Can't see | `#F2A93B` | circle |
| `deaf` | Can't hear | `#2EC4B6` | square |
| `mute` | Can't speak | `#9B7EDE` | triangle |

Check contrast of all three against `bg` before locking them.

## Lines and shapes

- Tile 32px, avatar 28px, 2px outlines, 4px corner radius on crates and avatars.
- No gradients. Glow (8px blur) only on lasers and the exit.

## Typography

One open-licence typeface (for example Space Grotesk, check its licence), self-hosted so the showcase doesn't depend on the network. Sizes 14 / 18 / 28 px. Fallback `system-ui`.

## Motion

| thing | duration |
|---|---|
| UI transitions | 150 ms ease-out |
| reaction pop | 1500 ms |
| alarm shake | 120 ms |
| laser flicker | 100 ms |

Respect `prefers-reduced-motion`: no shake, no flicker.

## What each client draws

| role | draws | does not draw |
|---|---|---|
| blind | black screen, a dim silhouette of their own avatar **[decide: silhouette or total blackout]**, audio cues | map, tiles, other players, visual hazards |
| deaf | full map, all visual hazards, reaction faces, stamps | any audio; captions off by default |
| mute | full map plus the secret layer (dashed outlines for hidden doors, code glyphs); audio, or captions if no headphones | nothing visual is withheld |

The server sends each client only the state its role can perceive.

## Captions

Bottom centre, 18px, `ui` on `bg` at 70% alpha. Format: `[footsteps, left]`. Shown only to roles that would hear the sound but have audio off (the mute player in real-life mode without headphones).

## Stamps and reactions

- **Stamps** are drawn by us: arrow (four directions), X, ?, !, door, key. They are the functional channel.
- **Reaction faces** come from bluemoji.io: at most 12, 48px, popping above the avatar for 1.5 s. Credit Tanya Mau in `CREDITS.md` and on the credits screen. Non-commercial use only; contact the author before any commercial use.
- Stamps and reactions are visual events, delivered to deaf and mute players only.

## Accessibility

- Never colour alone. Check text contrast (target 4.5:1).
- Offer a captions setting to everyone, as a real accessibility option separate from the role simulation.
- Reduced-motion support as above.

## Camera **[decide]**

Proposed: one shared camera fitted to the team with a maximum spread, so players can't wander off (Pico Park style).

## Out of scope for art v1

Sprite sheets, particle systems beyond smoke, parallax, any theme other than the heist.
