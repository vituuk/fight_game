import Peer from 'peerjs';

export const NetworkRole = {
  OFFLINE: 'offline',
  HOST: 'host',
  CLIENT: 'client'
};

class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = NetworkRole.OFFLINE;
    
    // Callbacks to hook into main.js
    this.onReady = null;      // When peer ID is generated
    this.onConnect = null;    // When 2 players connect
    this.onData = null;       // When receiving another player's coordinates
    this.onDisconnect = null; // When partner leaves
  }

  /** Initialize a Peer connection. If targetId exists, join as Client. Else, be Host. */
  init(targetId = null) {
    // Generate a random ID or rely on PeerJS default
    this.peer = new Peer({
      debug: 1, // log level
    });

    this.peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      if (this.onReady) this.onReady(id);

      if (targetId) {
        // I am the Client! Let's connect to the Host
        this.role = NetworkRole.CLIENT;
        console.log('Connecting to host: ' + targetId);
        this.conn = this.peer.connect(targetId, { reliable: false }); // false for lower latency UDP-like behavior
        this._setupConnection(this.conn);
      } else {
        // I am the Host! Wait for connections
        this.role = NetworkRole.HOST;
        console.log('Waiting for guest...');
      }
    });

    // Only host ever receives an incoming connection request
    this.peer.on('connection', (conn) => {
      console.log('Guest connected!');
      this.conn = conn;
      this._setupConnection(this.conn);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Error:', err);
      // Optional: alert the user
    });
  }

  _setupConnection(conn) {
    conn.on('open', () => {
      if (this.onConnect) this.onConnect(this.role);
    });
    
    conn.on('data', (data) => {
      if (this.onData) this.onData(data);
    });

    conn.on('close', () => {
      console.log('Connection closed.');
      if (this.onDisconnect) this.onDisconnect();
    });
  }

  /** Send state data 60x a second to the other player */
  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  /** Helper to quickly construct the shareable link */
  getInviteLink(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('join', id);
    return url.toString();
  }
}

export const network = new NetworkManager();
