import Peer from 'peerjs';

export const NetworkRole = {
  OFFLINE: 'offline',
  HOST: 'host',
  CLIENT: 'client'
};

class NetworkManager {
  constructor() {
    this.peer = null;
    this.clients = {}; // Map of peerId -> connection (for Host)
    this.hostConn = null; // Single connection to Host (for Client)
    this.role = NetworkRole.OFFLINE;
    
    // Callbacks
    this.onReady = null;      
    this.onConnect = null;    
    this.onData = null;       // (peerId, data)
    this.onDisconnect = null; 
  }

  init(targetId = null) {
    this.peer = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls:       'turn:openrelay.metered.ca:80',
            username:   'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      if (this.onReady) this.onReady(id);

      if (targetId) {
        // CLIENT MODE
        this.role = NetworkRole.CLIENT;
        console.log('Connecting to host: ' + targetId);
        this.hostConn = this.peer.connect(targetId, { reliable: true }); 
        this._setupClientConnection(this.hostConn);
      } else {
        // HOST MODE
        this.role = NetworkRole.HOST;
        console.log('Waiting for guests...');
      }
    });

    // Only host ever receives incoming connection requests
    this.peer.on('connection', (conn) => {
      if (this.role !== NetworkRole.HOST) return;
      console.log('Guest connected: ' + conn.peer);
      this.clients[conn.peer] = conn;
      this._setupHostConnection(conn);
    });

    this.peer.on('disconnected', () => {
      console.warn('Lost connection to PeerJS server. Attempting reconnect...');
      this.peer.reconnect();
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Error:', err);
    });
  }

  _setupHostConnection(conn) {
    conn.on('open', () => {
      if (this.onConnect) this.onConnect(conn.peer);
    });
    conn.on('data', (data) => {
      if (this.onData) this.onData(conn.peer, data);
    });
    conn.on('close', () => {
      console.log('Guest disconnected: ' + conn.peer);
      delete this.clients[conn.peer];
      if (this.onDisconnect) this.onDisconnect(conn.peer);
    });
  }

  _setupClientConnection(conn) {
    conn.on('open', () => {
      console.log('Connected to Host!');
      if (this.onConnect) this.onConnect(conn.peer);
    });
    conn.on('data', (data) => {
      if (this.onData) this.onData(conn.peer, data);
    });
    conn.on('close', () => {
      console.log('Disconnected from Host.');
      if (this.onDisconnect) this.onDisconnect(conn.peer);
    });
  }

  /** Send state data. Clients send to host. Hosts broadcast to ALL clients. */
  send(data) {
    if (this.role === NetworkRole.CLIENT && this.hostConn && this.hostConn.open) {
      this.hostConn.send(data);
    } else if (this.role === NetworkRole.HOST) {
      Object.values(this.clients).forEach(conn => {
        if (conn.open) conn.send(data);
      });
    }
  }

  getInviteLink(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('join', id);
    return url.toString();
  }
}

export const network = new NetworkManager();
