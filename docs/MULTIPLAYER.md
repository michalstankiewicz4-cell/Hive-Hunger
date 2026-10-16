# Multiplayer

Up to 4 players over WebRTC, peer to peer, with [PeerJS](https://peerjs.com/) 1.5.4. The game stays a static page on GitHub Pages; PeerJS's free public signalling server only introduces the browsers to each other.

## Playing

1. On the start screen choose **Multiplayer · Co-op** or **Multiplayer · PvP** — a room opens (the waiting room).
2. Click **Copy link** and send it. The link is the game's address with `?room=CODE`.
3. Others open the link and join the waiting room automatically (up to 4 players; a 5th sees "This room is full").
4. Everyone presses **Start** (**Not ready** takes it back while waiting). The match begins once every player in the room has pressed it; until then the swarms wait at their tunnels and the planet stands still. Someone who opens the link after the match has begun joins it straight away.
5. **Leave room** (or closing the tab) returns to the start screen. If the host leaves, guests see "The host left the room".

- **Co-op** — everyone eats the same planet; the scoreboard shows how many voxels each player ate.
- **PvP** — the same planet, a race: when it is eaten, the player who ate most of it wins the planet ("Blue wins planet 2"); the scoreboard shows voxels eaten of the current planet and planets won.

**Summary.** When the last voxel is eaten, everyone sees a summary: per player the voxels eaten of this planet, the share, the total, planets won (PvP) and who has pressed **Next planet**; in PvP the winner is named in their colour. The swarms jump to hyperspace meanwhile. The next planet appears when every player has pressed Next planet and every ship is gone (or `beacon.returnTimeoutFrames` passed); it closes the summary on every screen. Players who join during the summary don't hold it up.

Players: 1 Blue (host), 2 Pink, 3 Green, 4 Violet. Each has their own tunnel at their spawn point and their own settings panel. Spawn points are spread evenly around the planet: 2 players opposite each other, 3 a third of a turn apart, 4 a quarter; the host keeps its spawn and the others are spread again whenever someone joins or leaves. Every player's camera starts facing their own spawn.

## How it works

**Host-authoritative.** The host's browser simulates the planet and every swarm (`role: 'host'`). Guests (`role: 'guest'`) don't simulate:

- they build the planet themselves from the host's **seed** (same seed → same planet);
- they remove the voxels the host reports and show debris locally;
- they show swarm positions from **snapshots**, easing towards them every frame (`net.follow`);
- they send their **clicks**, **recall** and **settings** to the host, which applies them to that player's swarm, and their **Start / Not ready**, **Next planet** and **upgrade purchases**.

All swarms share the planet's voxel claims on the host, so one voxel is eaten by one unit of one swarm.

**Left or lost.** A player who leaves (Leave room, closing the tab) sends `bye` first: everyone sees "… left the room". A connection that closes or fails without `bye`, or stays silent for `net.timeoutMs` (10 s), is reported as "…: connection lost". The same goes for the host: guests see "The host left the room" after the host's `bye`, otherwise "Lost the connection to the host".

**Connection stats.** The scoreboard shows every player's ping (the host is marked "host", `… ms` before the first measurement); during a match the room panel shows a guest "Ping 42 ms · 37.3 kB/s from the host" and the host "Hosting · sending … kB/s to N players"; the waiting room shows the pings too.

Note: browsers pause animation in background tabs, so if the host switches to another tab, the game pauses for everyone until they come back.

## Messages

Control messages are JSON strings; PeerJS runs with `serialization: 'raw'`.

| Direction | Message | Meaning |
| --- | --- | --- |
| guest → host | `{t:'hello'}` | first message after connecting |
| host → guest | `{t:'welcome', index, mode, code}` | your player index (1–3), `coop` / `pvp` |
| host → guest | `{t:'players', list:[{index,name,color,ready,spawn}], started}` | who is in the room, who pressed Start, spawn points, whether the match has begun (sent on every join, leave and Start) |
| host → guest | `{t:'full'}` | the room already has 4 players |
| guest → host | `{t:'ready', ready}` | I pressed Start (`true`) or Not ready (`false`) |
| guest → host | `{t:'cmd', kind:'click', p:{x,y,z}}` | send my swarm to this point (planet frame) |
| guest → host | `{t:'cmd', kind:'recall'}` | call my swarm back to its tunnel |
| guest → host | `{t:'set', key, value}` | one setting: `count`, `speed`, `power`, `turn`, or a ship type (`lasers`, `storms`, `tugs`, `bombers`, `orbs`, `supports`, `cleaners`, `drills`) |
| host → guest | `{t:'ping', ts}` | every `net.pingMs` (2 s); `ts` = host time |
| guest → host | `{t:'pong', ts}` | answer to a ping; the host's round trip `now − ts` is the guest's **ping** |
| guest → host | `{t:'ping'}` | "still here", every `net.pingMs` |
| host → guest | `{t:'stats', list:[{index, host:true} \| {index, rtt, rate}]}` | every `net.pingMs`: each player's ping (ms) and the data the host sends them (bytes/s) |
| host → guest | `{t:'summary', summary:{level, mode, winner, rows:[{index,name,color,planet,share,score,wins,next}]}}` | results of the eaten planet; sent again whenever someone presses Next planet |
| guest → host | `{t:'next'}` | I pressed Next planet |
| guest → host | `{t:'buy', id}` | buy upgrade `id` with my points |
| host → guest | `{t:'tree', tree:{owned, spent}}` | your upgrade tree after a purchase |
| host → guest | `{t:'bolt', index, p:[x,y,z,…]}` | a chain-lightning bolt of player `index` to draw |
| host → guest | `{t:'frags', list:[[id, px, py, pz, qx, qy, qz, qw, vx, vy, vz, towed], …]}` | where the drifting pieces are and how they move, every `fragments.syncEvery` frames (30; `towSyncEvery` = 6 while one is towed); guests move them with the same physics in between |
| host → guest | `{t:'orb', a:[x,y,z], b:[x,y,z]}` | an orb ship fired from a at b: the guest flies the same orb (its burst's voxels arrive in snapshots) |
| host → guest | `{t:'zap', index, chain:[units…], seed}` | a support ship of player `index` fired: the guest draws the same bolt through the same ships (the destroyed voxels arrive in snapshots) |
| host → guest | `{t:'warp', index, list:[[unit,dx,dy,dz]…]}` | ships of player `index` jumped to hyperspace in that direction: the guest flies the same jump and streak (when they are gone, the snapshot's hidden bits say so) |
| host → guest | `{t:'hole', p:[x,y,z]}` | a bomber blew up there: the guest opens the same black hole (the destroyed voxels arrive in snapshots) |
| host → guest | `{t:'settings', values:{count, bombers}}` | the guest's bombers blew up: its Units and Bombers settings are lower now |
| host → guest | `{t:'notice', text}` | "Pink joined", "Pink left the room", "Pink: connection lost" — shown in the HUD for `net.noticeMs` |
| both | `{t:'bye'}` | leaving (a guest closing the tab, or the host closing the room) |

Binary messages (`js/net/Protocol.js`, little-endian):

**PLANET** (type 2) — a new planet, or the current one for a guest who joins:
```
u8 type=2 | u32 seed | u16 level | u8 hasBits | [eaten voxels: run lengths as varints]
```
The guest builds the planet from the seed and level, then removes the eaten voxels (voxels of drifting pieces don't count as eaten — they follow as FRAG messages). The run lengths go over all voxel indices, alternating "not eaten" / "eaten" (starting with "not eaten"), each as a little-endian base-128 varint (`VoxelPlanet.eatenRuns`). Eaten areas are craters, so this stays small (a bitset of the whole grid was too big for one WebRTC message on large levels).

**FRAG** (type 4) — a piece bitten off the planet (sent when it comes loose, and to a guest who joins for every piece drifting at that moment):
```
u8 type=4 | u32 id | 19 × f32: original centre (3), position (3), rotation quaternion (4), velocity (3), spin (3), origin (3: where it came off)
| u32 count | count × varint: voxel indices, sorted, each as the gap from the previous one
```
The guest takes those voxels out of its grid — or out of the piece they belonged to, when a piece broke up — into a fragment with the same id and motion. Voxels eaten off a piece arrive in snapshots like any other eaten voxel. Large pieces go in PART messages.

**PART** (type 3) — a piece of any binary message larger than 60 000 bytes (`MAX_PART`); the guest joins the pieces and handles the result as the original message:
```
u8 type=3 | u32 id | u16 index | u16 count | bytes
```

**SNAPSHOT** (type 1) — every `net.snapshotEvery` frames (4 → about 15 per second):
```
u8 type=1 | f32 spin | u32 left | u8 bannerLen | banner (utf-8) | u8 players
per player: u8 index | u8 home (0 none, 1 recall, 2 jump) | u32 score | u32 planetScore
            | u16 wins | u16 count | count × 3 × i16 position (×100) | count × 3 × i8 heading (×127)
            | u16 lasers (units 0 … lasers−1 are red laser ships)
            | u16 beams | beams × (u16 unit | 3 × i16 point hit (×100))
            | u16 storms (the next `storms` units are storm ships)
            | u16 bolts | bolts × (u16 unit | u8 sides | 3 × i16 bite | sides × 3 × i16 side voxel)
            | u16 tugs (the next `tugs` units are tugs) | u16 tows | tows × (u16 unit | u32 piece id)
            | u16 bombers (the next `bombers` units are bombers) | u16 orbs (the next `orbs` units are orb ships) | u16 supports | u16 cleaners
            | u16 drills | u16 drilling | drilling × u16 unit (drills drilling now: the guest draws their bits)
            | u8 portal (1 = the tunnel is open) | ceil(count / 8) bytes hidden (bit per unit: not out of the tunnel yet / gone to hyperspace)
u32 removed | removed × u32 voxel index (eaten since the last snapshot)
```
If a guest's connection is backed up (`bufferedAmount > net.maxBuffered`), the host skips a snapshot; eaten voxels stay queued for the next one, so nothing is lost.

Size: about 9 bytes per unit plus 4 bytes per eaten voxel — e.g. 4 players × 450 units ≈ 16 KB per snapshot.

## Testing locally

The public PeerJS server can be replaced by a local one. Start a PeerJS server (`npm i peer`, then for example `ExpressPeerServer` on `127.0.0.1:9000` at `/peerjs`) and, before the game loads, set:

```js
window.HIVE_PEER_OPTIONS = { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false };
```

(e.g. with Playwright's `addInitScript`). Then open the game in two tabs: create a room in one, open its link in the other, and press Start in both. The automated version of this is `tests/test_multi.py` (see `tests/README.md`).
