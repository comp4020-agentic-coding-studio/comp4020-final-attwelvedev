# 22. A camera out of sight shows its cone on the ground you can see

## Status

accepted

Amends the hazards line of 0012 (`doc/adr/0012-line-of-sight-perception.md`): "a sighted role receives hazards ... only within its line of sight". The camera itself stays inside that rule. What changes is whether the ground it watches is told about.

## Context

In room 3 a camera on the wall behind a run of glass watches the corridor in front of the glass. Can't hear, standing far along that corridor, sees the glass and the lit floor in front of it, and the camera's cone falls on that floor. They were never shown it: a camera is sent only when the tile it stands on is in the seat's line of sight, and this one stands in a wall that is out of sight from far away. The user saw the cone appear only after walking close, and called it wrong, because the ground it covers was in plain view all along ("it should poke out").

A hazard standing in a dark zone already has the answer. The seat is sent a `sight`: the part of the hazard's real cone that is in the light, as polygons, and nothing of where the hazard is (`sightInLight` in `src/game/perception.ts`). The client draws it as any cone and no body.

We weighed these.

- **Leave it.** Matches 0012 to the letter and the spec's list of hazards. The cone appears late and in a way that reads as a bug to a player who can see the ground it covers. Rejected by the user.
- **Send the camera whenever any of its cone is in sight.** Fixes the picture, but tells the seat where the camera stands (its tile, its bracket), which is more than the seat could see. Rejected: 0012's reason for the rule is that where a hazard stands is knowledge a role earns by seeing it.
- **Send the whole cone.** Cheaper to compute, and the client already clips floor drawing to the seat's light. But the server would then send ground the seat cannot see, which 0007 forbids: the client is told only what its role perceives. Rejected.
- **Send the part of the cone the seat's light covers, as a `sight`, and nothing of the camera.** The dark-zone rule, applied to a camera out of sight instead of a camera in the dark. Chosen.

## Decision

A sighted role is sent a `sight` for each camera that is **not itself sent** (its tile is not in the role's line of sight) and whose real cone, cut to the role's own light polygon, is not empty. The cone is the same fan the simulation uses (rays stop at walls, vents, closed doors and cover); the light is the same exact polygon the client draws for that seat (`lightPolygon`), so what is sent is on ground the client already draws as lit. Dark zones are taken out as for any sight. Nothing of the camera is sent: no entity, no position, no apex, and no state beyond whether it is `watching` or `idle`.

An idle camera is sent the same way, marked `idle`, and the client draws it as a dashed outline, as an idle camera's cone is drawn up close, so the idle state reads in the shape and not the colour. (The first version sent only a watching camera; the user found the idle cone vanished when far away while the active one did not.) A camera that is sent in full (its tile in sight) is not also sent as a sight. Can't see receives nothing, as before. Guards, lasers and every other hazard are unchanged.

The client draws all the pieces of one sight as a single shape (one clip, one fill, one hatch, one outline). A sight cut along every ray of a light is about a hundred pieces that tile one region, and each outlined alone showed its seams as stacked bands.

## Consequences

- A seat that can see ground a camera watches learns the camera's direction and reach there, and so, by looking at the cone, roughly where it is. It still does not learn the camera's tile, and a camera it cannot see is still not drawn. This is a deliberate small widening of what 0012 allows, taken because the ground is in view.
- Room 3 is the only shipped room with a camera. Another room that adds one gets the same behaviour; `rooms/` linting does not check it.
- Bots are unaffected: they react to `guard`, `camera` and `laser` entities and never to `sight` (`src/game/bots/brain.ts`), and `spec/rooms.test.ts` still has them clear every room in every rotation.
- `viewFor` does more work for a view in a room with a camera: one fan and one light polygon per camera per view, not kept between views, idle or watching. Measured in the old-rooms `10-vault` fixture, which has one camera: an idle view cost 0.09 ms before the idle case was added and 1.8 ms after, because the seat's light there has 753 corners and each was cut against the camera's fan. That slowed a bot test past its 20 s timeout. `intersectLight` now skips a corner whose triangle lies beside the fan's bounding box, which brings the cut from 0.6 ms to 0.1 ms in that room and from 0.6 to 0.3 ms in room 3, where the caster is far from the fan. Still per view, per camera, on a development machine, and not measured under load on the 256 MB machine. The light polygon is the same one `placeOf` builds for the tile set, so a later change may share it.
- The role tables in `src/game/types.ts` are unchanged: `sight` was already a sighted-role view field.
