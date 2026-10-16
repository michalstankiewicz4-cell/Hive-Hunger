# Libraries kept in the repository

So the game loads nothing from the internet: single player works offline (from a local server);
multiplayer still needs the internet to find the other players (the PeerJS signalling server and WebRTC).

| File | Library | Version | Licence |
| --- | --- | --- | --- |
| `three.min.js` | [Three.js](https://threejs.org/) — the 3D engine (UMD build, `window.THREE`) | r128 (0.128.0) | MIT, `LICENSE-three` |
| `peerjs.min.js` | [PeerJS](https://peerjs.com/) — WebRTC connections for multiplayer (`window.Peer`) | 1.5.4 | MIT, `LICENSE-peerjs` |

The same files as the tests' local copies (`tests/node_modules`, from `npm install` in `tests/`). To update
one, copy the new build here, change the version above, and run the tests.
