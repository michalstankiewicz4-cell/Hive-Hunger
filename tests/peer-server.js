// Local PeerJS signalling server for the multiplayer test (127.0.0.1:9000, path /peerjs).
const express = require('express');
const { ExpressPeerServer } = require('peer');

const port = Number(process.env.PEER_PORT || 9000);
const app = express();
const server = app.listen(port, '127.0.0.1', () => console.log(`peer server on 127.0.0.1:${port}`));
app.use('/peerjs', ExpressPeerServer(server, { path: '/' }));
