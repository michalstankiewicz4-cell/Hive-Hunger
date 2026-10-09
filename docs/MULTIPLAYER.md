# Multiplayer

Up to 4 players over WebRTC, peer to peer, with [PeerJS](https://peerjs.com/) 1.5.4. The game stays a static page on GitHub Pages; PeerJS's free public signalling server only introduces the browsers to each other.

## Playing

1. On the start screen choose **Multiplayer · Co-op** or **Multiplayer · PvP** — a room opens (the waiting room).
2. Click **Copy link** and send it. The link is the game's address with `?room=CODE`.
3. Others open the link and join the waiting room automatically (up to 4 players; a 5th sees "This room is full").
4. Everyone presses **Start**. The match begins once every player in the room has pressed it; until then the swarms wait at their beacons and the planet stands still. Someone who opens the link after the match has begun joins it straight away.
5. **Leave room** (or closing the tab) returns to the start screen. If the host leaves, guests see "The host left the room".

- **Co-op** — everyone eats the same planet; the scoreboard shows how many voxels each player ate.
- **PvP** — the same planet, a race: when it is eaten, the player who ate most of it wins the planet ("Blue wins planet 2"); the scoreboard shows voxels eaten of the current planet and planets won.

Players: 1 Blue (host), 2 Pink, 3 Green, 4 Violet. Each has their own beacon (in their colour) and their own settings panel. Spawn points are spread evenly around the planet: 2 players opposite each other, 3 a third of a turn apart, 4 a quarter; the host keeps its spawn and the others are spread again whenever someone joins or leaves. Every player's camera starts facing their own spawn.

## How it works

**Host-authoritative.** The host's browser simulates the planet and every swarm (`role: 'host'`). Guests (`role: 'guest'`) don't simulate:

- they build the planet themselves from the host's **seed** (same seed → same planet);
- they remove the voxels the host reports and show debris locally;
- they show swarm positions from **snapshots**, easing towards them every frame (`net.follow`);
- they send their **clicks**, **recall** and **settings** to the host, which applies them to that player's swarm.

All swarms share the planet's voxel claims on the host, so one voxel is eaten by one unit of one swarm.

Note: browsers pause animation in background tabs, so if the host switches to another tab, the game pauses for everyone until they come back.

## Messages

Control messages are JSON strings; PeerJS runs with `serialization: 'raw'`.

| Direction | Message | Meaning |
| --- | --- | --- |
| guest → host | `{t:'hello'}` | first message after connecting |
| host → guest | `{t:'welcome', index, mode, code}` | your player index (1–3), `coop` / `pvp` |
| host → guest | `{t:'players', list:[{index,name,color,beaconColor,ready,spawn}], started}` | who is in the room, who pressed Start, spawn points, whether the match has begun (sent on every join, leave and Start) |
| host → guest | `{t:'full'}` | the room already has 4 players |
| guest → host | `{t:'ready'}` | I pressed Start |
| guest → host | `{t:'cmd', kind:'click', p:{x,y,z}}` | send my swarm to this point (planet frame) |
| guest → host | `{t:'cmd', kind:'recall'}` | call my swarm back to its beacon |
| guest → host | `{t:'set', key, value}` | one setting: `count`, `speed`, `power`, `spacing`, `cohesion`, `nearest` |
| both | `{t:'ping'}` | "still here", every `net.pingMs` (2 s); silence for `net.timeoutMs` (10 s) = left |
| guest → host | `{t:'bye'}` | leaving |

Binary messages (`js/net/Protocol.js`, little-endian):

**PLANET** (type 2) — a new planet, or the current one for a guest who joins:
```
u8 type=2 | u32 seed | u16 level | u8 hasBits | [bits: 1 bit per voxel, 1 = still solid]
```

**SNAPSHOT** (type 1) — every `net.snapshotEvery` frames (4 → about 15 per second):
```
u8 type=1 | f32 spin | u32 left | u8 bannerLen | banner (utf-8) | u8 players
per player: u8 index | u8 home (0 none, 1 recall, 2 return) | u32 score | u32 planetScore
            | u16 wins | u16 count | count × 3 × i16 position (×100) | count × 3 × i8 heading (×127)
u32 removed | removed × u32 voxel index (eaten since the last snapshot)
```
If a guest's connection is backed up (`bufferedAmount > net.maxBuffered`), the host skips a snapshot; eaten voxels stay queued for the next one, so nothing is lost.

Size: about 9 bytes per unit plus 4 bytes per eaten voxel — e.g. 4 players × 450 units ≈ 16 KB per snapshot.

## Testing locally

The public PeerJS server can be replaced by a local one. Start a PeerJS server (`npm i peer`, then for example `ExpressPeerServer` on `127.0.0.1:9000` at `/peerjs`) and, before the game loads, set:

```js
window.HIVE_PEER_OPTIONS = { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false };
```

(e.g. with Playwright's `addInitScript`). Then open the game in two tabs: create a room in one, open its link in the other, and press Start in both.
