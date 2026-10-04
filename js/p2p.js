// 3.0.2 · Multiplayer sem servidor próprio: conexão direta entre os jogadores (WebRTC, via PeerJS).
// O servidor público e grátis do PeerJS só apresenta um jogador ao outro (troca de "endereço");
// depois os dados vão direto de PC pra PC, pela internet ou pela rede local.
//
// Este arquivo imita o servidor de salas antigo (servidor-online/server.js) DENTRO do jogo do
// anfitrião: o mp.js continua falando o mesmo "idioma" ({t:'host'}, {t:'join'}, {t:'to'}, {t:'room'}…),
// só que em vez de um WebSocket ele recebe um objeto com send()/close() igualzinho.
const PREFIX = 'automaton-kx7-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0 e I/1
const MAX_PLAYERS = 4;
// servidores STUN públicos (descobrem o endereço de internet de cada PC)
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const newCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const cleanName = (n) => String(n || 'Jogador(a)').replace(/[<>"'`&]/g, '').slice(0, 24) || 'Jogador(a)';

// opções do PeerJS: servidor público por padrão; dá pra apontar pra um próprio (testes / PeerServer)
function peerOptions() {
  const o = { config: { iceServers: ICE }, debug: 0 };
  const custom = window.__peerServer;
  if (custom) Object.assign(o, custom);
  return o;
}

// Cria um "socket de mentirinha". onMessage(str) recebe exatamente o que o servidor antigo mandaria.
export function openP2P(onMessage, onClose) {
  if (!window.Peer) return Promise.reject(new Error('A biblioteca de conexão (lib/peerjs.min.js) não carregou.'));
  const sock = {
    readyState: 0, peer: null, role: null, name: '', code: null,
    conns: new Map(),      // anfitrião: id do convidado -> { conn, name }
    hostConn: null,        // convidado: conexão com o anfitrião
    nextId: 2,
    emit(obj) { onMessage(JSON.stringify(obj)); },
    send(raw) {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'host') return this.startHost(m.name);
      if (m.t === 'join') return this.startJoin(m.code, m.name);
      if (m.t !== 'to') return;
      if (this.role === 'guest') { if (this.hostConn?.open) this.hostConn.send(raw); return; }
      if (this.role === 'host') this.route('h', m.to, m.m);
    },
    // anfitrião: entrega uma mensagem (de um convidado ou dele mesmo) pra quem deve receber
    route(from, to, m) {
      const out = JSON.stringify({ t: 'msg', from, m });
      const toGuest = (id) => { const g = this.conns.get(id); if (g?.conn.open) g.conn.send(out); };
      if (to === 'all') {
        for (const id of this.conns.keys()) if (id !== from) toGuest(id);
        if (from !== 'h') onMessage(out);
      } else if (to === 'host' || to === 'h') { if (from !== 'h') onMessage(out); }
      else toGuest(to);
    },
    toAll(obj, except) { const s = JSON.stringify(obj); for (const [id, g] of this.conns) if (id !== except && g.conn.open) g.conn.send(s); },
    close() {
      this.readyState = 3;
      try { this.peer?.destroy(); } catch { /* */ }
      onClose?.();
    },

    // ─── anfitrião ───
    startHost(name, tries = 0) {
      this.role = 'host'; this.name = cleanName(name);
      const code = newCode();
      const peer = new window.Peer(PREFIX + code, peerOptions());
      this.peer = peer;
      peer.on('open', () => { this.code = code; this.emit({ t: 'room', code, id: 'h' }); });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && tries < 4) { peer.destroy(); this.startHost(name, tries + 1); return; }
        this.fail(e);
      });
      peer.on('disconnected', () => { if (this.readyState === 1) try { peer.reconnect(); } catch { /* */ } });
      peer.on('connection', (conn) => this.acceptGuest(conn));
    },
    acceptGuest(conn) {
      const name = cleanName(conn.metadata?.name);
      let id = null;
      // espera o "oi" do convidado (mandar antes disso às vezes se perdia)
      const welcome = () => {
        if (id) return;
        if (this.conns.size + 1 >= MAX_PLAYERS) { conn.send(JSON.stringify({ t: 'error', msg: 'A sala está cheia (máximo 4).' })); setTimeout(() => conn.close(), 500); return; }
        id = 'g' + this.nextId++;
        this.conns.set(id, { conn, name });
        const players = [{ id: 'h', name: this.name }, ...[...this.conns].map(([i, g]) => ({ id: i, name: g.name }))];
        conn.send(JSON.stringify({ t: 'joined', code: this.code, id, host: { id: 'h', name: this.name }, players }));
        const ev = { t: 'peer', join: true, id, name };
        this.toAll(ev, id);
        this.emit(ev);
      };
      conn.on('data', (raw) => {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (m?.t === 'hello') return welcome();
        if (m?.t === 'to' && id) this.route(id, m.to, m.m);
      });
      const bye = () => {
        if (!id || !this.conns.has(id)) return;
        this.conns.delete(id);
        const ev2 = { t: 'peer', leave: true, id, name };
        this.toAll(ev2);
        this.emit(ev2);
      };
      conn.on('close', bye);
      conn.on('error', bye);
    },

    // ─── convidado ───
    startJoin(code, name) {
      this.role = 'guest'; this.name = cleanName(name);
      code = String(code || '').toUpperCase().trim();
      const peer = new window.Peer(peerOptions());
      this.peer = peer;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) this.emit({ t: 'error', msg: `Não achei a sala ${code}. Confira o código e se o anfitrião ainda está com a sala aberta.` }); }, 25000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, metadata: { name: this.name }, serialization: 'binary' });
        this.hostConn = conn;
        conn.on('open', () => { opened = true; clearTimeout(timer); conn.send(JSON.stringify({ t: 'hello' })); });
        conn.on('data', (raw) => onMessage(typeof raw === 'string' ? raw : JSON.stringify(raw)));
        conn.on('close', () => { if (this.readyState === 1) { this.emit({ t: 'closed', msg: 'O anfitrião fechou a sala.' }); this.close(); } });
      });
      peer.on('error', (e) => {
        clearTimeout(timer);
        if (e.type === 'peer-unavailable') this.emit({ t: 'error', msg: `A sala ${code} não existe (ou o anfitrião saiu). Confira o código.` });
        else this.fail(e);
      });
    },
    fail(e) {
      const msg = e?.type === 'network' || e?.type === 'server-error' || e?.type === 'socket-error'
        ? 'Não consegui falar com o servidor de conexão (internet caiu ou está bloqueado). Tente de novo em instantes.'
        : e?.type === 'browser-incompatible' ? 'Seu navegador não suporta conexão direta (WebRTC). Use Chrome, Edge ou Firefox.'
          : 'Erro de conexão: ' + (e?.message || e?.type || e);
      this.emit({ t: 'error', msg });
    },
  };
  sock.readyState = 1;
  return Promise.resolve(sock);
}
