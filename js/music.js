// 3.0 · A música de KX-7: um tema só, composto por código e tocado ao vivo com Web Audio.
// Mesma progressão e mesma melodia sempre (é "a" música do jogo), mas o arranjo respira com o mundo:
//  · dia: pulso com arpejo, percussão leve e o tema no marimba;
//  · noite: mais lento, sem bateria, sinos com muito eco e pad mais escuro;
//  · bioma muda o timbre (tundra brilha, pântano abafa, cânion esquenta, cristal cintila);
//  · aurora acende brilhos agudos, Júpiter perto traz um zumbido grave, eclipse deixa tudo menor.
// Partes (8 compassos cada): início → pulso → tema → respiro → (de novo).
import { game } from './state.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// progressão (um acorde por compasso): Dmaj9 · F#m7 · Gmaj7(#11) · Asus4 · Bm9 · Gmaj9 · Em9 · A7sus4
const CHORDS = [
  { bass: 38, pad: [62, 66, 69, 73, 76] },
  { bass: 42, pad: [61, 64, 66, 69, 73] },
  { bass: 43, pad: [62, 66, 67, 71, 73] },
  { bass: 45, pad: [62, 64, 69, 71, 76] },
  { bass: 47, pad: [61, 62, 66, 69, 73] },
  { bass: 43, pad: [62, 66, 67, 69, 71] },
  { bass: 40, pad: [62, 64, 66, 67, 71] },
  { bass: 45, pad: [62, 64, 67, 69, 74] },
];
// o tema: [tempo no compasso (em batidas), duração, nota]
const THEME = [
  [[0, 1.5, 78], [1.5, 0.5, 76], [2, 2, 73]],
  [[0, 1, 73], [1, 1, 76], [2, 2, 69]],
  [[0, 1.5, 74], [1.5, 0.5, 73], [2, 1, 71], [3, 1, 73]],
  [[0, 3, 76]],
  [[0, 1.5, 78], [1.5, 0.5, 81], [2, 2, 73]],
  [[0, 1, 74], [1, 1, 71], [2, 2, 78]],
  [[0, 1, 71], [1, 1, 74], [2, 1, 78], [3, 1, 76]],
  [[0, 4, 74]],
];
const PARTS = ['início', 'pulso', 'tema', 'respiro'];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1];

class MusicEngine {
  constructor() {
    this.on = true; this.vol = 0.45; this.started = false;
    this.step = 0;           // colcheias desde o começo
    this.next = 0;           // tempo (ctx) da próxima colcheia
    this.mood = { night: 0, aurora: 0, jup: 0, eclipse: 0, menu: 1, bright: 0.5, biome: 'floresta' };
    this.onChange = null;
    this.lastPart = -1;
  }
  init(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    const c = ctx;
    this.out = c.createGain(); this.out.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    this.out.connect(comp).connect(c.destination);
    // eco (reverb com resposta gerada) e delay
    this.verb = c.createConvolver(); this.verb.buffer = this.ir(3.4, 2.6);
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.9;
    this.verbIn.connect(this.verb).connect(this.out);
    this.dly = c.createDelay(2); this.dly.delayTime.value = 0.54;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.dlyIn = c.createGain(); this.dlyIn.gain.value = 0.5;
    this.dlyIn.connect(this.dly).connect(dlp).connect(fb).connect(this.dly);
    dlp.connect(this.out); dlp.connect(this.verbIn);
    this.dry = c.createGain(); this.dry.gain.value = 0.8; this.dry.connect(this.out);
    // filtro geral do pad (abre de dia, fecha de noite)
    this.padF = c.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 1400; this.padF.Q.value = 0.7;
    this.padF.connect(this.dry); this.padF.connect(this.verbIn);
    this.noise = this.noiseBuf();
    // zumbido grave de Júpiter
    this.drone = c.createOscillator(); this.drone.type = 'sine'; this.drone.frequency.value = mtof(26);
    const d2 = c.createOscillator(); d2.type = 'sine'; d2.frequency.value = mtof(26) * 1.5;
    this.droneG = c.createGain(); this.droneG.gain.value = 0;
    this.drone.connect(this.droneG); d2.connect(this.droneG); this.droneG.connect(this.verbIn); this.droneG.connect(this.dry);
    this.drone.start(); d2.start();
  }
  ir(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  noiseBuf() { const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }

  start() {
    if (!this.ctx || this.started) return;
    this.started = true;
    this.next = this.ctx.currentTime + 0.1;
    this.setVolume(this.vol);
    this.timer = setInterval(() => this.tick(), 40);
  }
  setVolume(v) { this.vol = v; if (this.out) this.out.gain.setTargetAtTime(this.on ? v * 1.15 : 0, this.ctx.currentTime, 0.4); }
  toggle() { this.on = !this.on; this.setVolume(this.vol); return this.on; }
  skip() { const bar = Math.floor(this.step / 8); this.step = (Math.floor(bar / 8) + 1) * 64; this.change(); }
  get part() { return PARTS[Math.floor(this.step / 64) % PARTS.length]; }
  name() { const m = this.mood; return `KX-7 · ${m.eclipse > 0.3 ? 'eclipse' : m.aurora > 0.3 ? 'aurora' : m.night > 0.6 ? 'noite' : 'dia'} · ${this.part}`; }
  change() { this.onChange?.(this.name()); }

  // lê o mundo (chamado pelo jogo a cada quadro)
  update() {
    const m = this.mood, sky = game.sky;
    const k = 0.01;
    const bw = sky?.biomeW || {};
    m.night += ((game.nightK ?? 0) - m.night) * k;
    m.aurora += ((game.natureFx?.aurora || 0) * (game.nightK ?? 0) - m.aurora) * k;
    m.jup += ((sky?.astro?.jupNear || 0) * (game.nightK ?? 0) - m.jup) * k;
    m.eclipse += ((game.eclipseK || 0) - m.eclipse) * 0.05;
    m.menu = game.mode === 'menu' ? 1 : 0;
    m.bright = 0.5 + (bw.tundra || 0) * 0.35 + (bw.cristal || 0) * 0.25 - (bw.pantano || 0) * 0.35 + (bw.canion || 0) * 0.1;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.padF.frequency.setTargetAtTime(500 + (1 - m.night) * 1300 * m.bright * 1.4 + m.aurora * 600 - m.eclipse * 300, t, 0.5);
    this.droneG.gain.setTargetAtTime(m.jup * 0.05 + m.eclipse * 0.04, t, 1);
  }

  tick() {
    if (!this.on || this.ctx.state !== 'running') { this.next = Math.max(this.next, this.ctx.currentTime + 0.05); return; }
    const m = this.mood;
    const bpm = 84 - m.night * 12 - m.eclipse * 8;
    const e8 = 30 / bpm; // uma colcheia
    if (this.next < this.ctx.currentTime - 0.3) this.next = this.ctx.currentTime + 0.05; // aba voltou do segundo plano
    while (this.next < this.ctx.currentTime + 0.25) {
      this.schedule(this.step, this.next, e8);
      this.step++;
      this.next += e8;
    }
  }

  schedule(step, t, e8) {
    const m = this.mood;
    const bar = Math.floor(step / 8), s = step % 8;
    const ch = CHORDS[bar % 8];
    const partI = Math.floor(step / 64) % PARTS.length;
    if (partI !== this.lastPart && s === 0 && bar % 8 === 0) { this.lastPart = partI; this.change(); }
    const part = PARTS[partI];
    const night = m.night > 0.55;
    const eclipse = m.eclipse > 0.3;
    const tr = eclipse ? -1 : 0; // eclipse: tudo meio tom abaixo, mais estranho
    const barLen = e8 * 8;
    // pad: o acorde inteiro no começo do compasso
    if (s === 0) this.pad(ch.pad.map((n) => n + tr), t, barLen * 1.05, part === 'respiro' ? 0.05 : 0.04);
    // baixo
    if (part !== 'respiro' && (s === 0 || (s === 5 && !night))) this.bass(ch.bass + tr, t, s === 0 ? barLen * 0.6 : e8 * 2.5);
    // arpejo
    if (part === 'pulso' || part === 'tema') {
      const every = night ? 2 : 1;
      if (s % every === 0) {
        const notes = [...ch.pad].sort((a, b) => a - b);
        const n = notes[ARP[s] % notes.length] + 12 + tr;
        this.pluck(n, t, night ? 0.05 : 0.045, m.bright);
      }
    }
    // percussão leve (só de dia, fora do menu)
    if (!night && !eclipse && (part === 'pulso' || part === 'tema') && m.menu < 0.5) {
      if (s === 0 || s === 4) this.kick(t);
      if (s % 2 === 1) this.hat(t, 0.025);
      if (s === 6) this.hat(t, 0.015);
    }
    // melodia: o tema (marimba de dia, sinos à noite)
    if ((part === 'tema' || (part === 'respiro' && bar % 2 === 0)) && s === 0) {
      for (const [b, d, n] of THEME[bar % 8]) {
        if (part === 'respiro' && b > 0) continue;
        const at = t + b * 2 * e8, dur = d * 2 * e8;
        if (night || part === 'respiro') this.bell(n + tr, at, dur, 0.06);
        else this.marimba(n + tr, at, dur, 0.07);
      }
    }
    // aurora e cristal: brilhinhos agudos
    if ((m.aurora > 0.2 || m.bright > 0.7) && s % 3 === 0 && Math.random() < 0.25 + m.aurora * 0.4) {
      const notes = ch.pad;
      this.bell(notes[Math.floor(Math.random() * notes.length)] + 24 + tr, t, 1.2, 0.02 + m.aurora * 0.02);
    }
  }

  env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
  }
  osc(type, f, t, stop, dest, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(stop); return o;
  }
  pad(notes, t, dur, vol) {
    const g = this.ctx.createGain(); g.connect(this.padF);
    this.env(g, t, 1.4, vol, dur, 1.8);
    for (const n of notes) { this.osc('sawtooth', mtof(n), t, t + dur + 2, g, -7); this.osc('triangle', mtof(n), t, t + dur + 2, g, 6); }
  }
  bass(n, t, dur) {
    const g = this.ctx.createGain(); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    g.connect(f).connect(this.dry);
    this.env(g, t, 0.02, 0.16, dur, 0.3);
    this.osc('sine', mtof(n), t, t + dur + 0.4, g); this.osc('triangle', mtof(n + 12), t, t + dur + 0.4, g);
  }
  pluck(n, t, vol, bright) {
    const g = this.ctx.createGain(); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400 + bright * 2600;
    g.connect(f); f.connect(this.dry); f.connect(this.dlyIn);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    this.osc('triangle', mtof(n), t, t + 0.5, g); this.osc('square', mtof(n), t, t + 0.12, g, 3);
  }
  marimba(n, t, dur, vol) {
    const g = this.ctx.createGain(); g.connect(this.dry); g.connect(this.verbIn); g.connect(this.dlyIn);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(1.6, dur + 0.8));
    this.osc('sine', mtof(n), t, t + dur + 1, g); const h = this.ctx.createGain(); h.gain.value = 0.25; h.connect(g); this.osc('sine', mtof(n) * 4, t, t + 0.2, h);
  }
  bell(n, t, dur, vol) {
    const g = this.ctx.createGain(); g.connect(this.verbIn); g.connect(this.dlyIn); const dry = this.ctx.createGain(); dry.gain.value = 0.4; g.connect(dry).connect(this.dry);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8 + dur * 0.3);
    for (const [mul, a] of [[1, 1], [2.76, 0.35], [5.4, 0.15]]) { const h = this.ctx.createGain(); h.gain.value = a; h.connect(g); this.osc('sine', mtof(n) * mul, t, t + 3.2 + dur * 0.3, h); }
  }
  kick(t) {
    const g = this.ctx.createGain(); g.connect(this.dry);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    o.connect(g); o.start(t); o.stop(t + 0.32);
  }
  hat(t, vol) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g).connect(this.dry); s.start(t, Math.random() * 0.5); s.stop(t + 0.08);
  }
  // fanfarras curtas: marco concluído, tier novo, foguete
  sting(kind = 'marco') {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.05;
    const seq = kind === 'tier' ? [62, 66, 69, 73, 74, 78, 81, 85, 86] : kind === 'foguete' ? [50, 57, 62, 66, 69, 74, 78, 81, 86, 90] : [69, 73, 76, 78, 81];
    seq.forEach((n, i) => this.bell(n, t + i * 0.09, 0.4, 0.07));
    this.pad([62, 66, 69, 73, 76].map((n) => n + 12), t, 2.2, 0.03);
  }
}

export const music = new MusicEngine();
game.music = music;
