// Som: efeitos (Kenney, CC0), ambiente da floresta (OpenGameArt, CC0) e a música de KX-7 (composta por código, music.js).
import { music } from './music.js';

// 3.0: não tem mais rádio — uma trilha única gerada ao vivo
export const STATIONS = [{ id: 'kx7', nome: 'Trilha de KX-7', icone: '🎵', tracks: [] }];
export const TRACKS = [];
const SFX = {
  stepConcrete: ['footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003', 'footstep_concrete_004'],
  stepGrass: ['footstep_grass_000', 'footstep_grass_001', 'footstep_grass_002', 'footstep_grass_003', 'footstep_grass_004'],
  place: ['impactMetal_light_000', 'impactMetal_light_001'],
  remove: ['impactPlate_light_000', 'impactPlate_light_001'],
  mine: ['impactMining_000', 'impactMining_001', 'impactMining_002'],
  smelt: ['forceField_000'],
  assemble: ['impactTin_medium_000'],
  sell: ['glass_002'],
  coins: ['confirmation_002'],
  levelup: ['maximize_006'],
  click: ['click_001', 'click_002'],
  select: ['select_001', 'select_002'],
  open: ['open_001'],
  close: ['close_001'],
  error: ['error_004'],
  run: ['confirmation_001'],
  stop: ['toggle_001'],
  tick: ['tick_001'],
  beep: ['pluck_001', 'pluck_002'],
  drop: ['drop_002'],
  buy: ['confirmation_004'],
  deny: ['error_006'],
  sorter: ['switch_002'],
  quest: ['bong_001'],
  computer: ['computerNoise_000', 'computerNoise_001'],
  jump: ['impactSoft_medium_000'],
  coffee: ['question_001'],
  question: ['question_001'],
  back: ['back_001'],
  launch: ['spaceEngineLarge_000'],
  thruster: ['thrusterFire_000'],
  achievement: ['maximize_008'],
  photo: ['laserRetro_000'],
  stepWood: ['footstep_wood_000', 'footstep_wood_001', 'footstep_wood_002'],
  plank: ['impactPlank_medium_000', 'impactPlank_medium_001'],
  glass: ['impactGlass_light_000', 'impactGlass_light_001'],
  water: ['slime_000', 'slime_001'],
  meteor: ['explosionCrunch_000'],
  harvest: ['scratch_001'],
  record: ['maximize_003'],
  plant: ['drop_001'],
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.settings = { music: 0.45, sfx: 0.7, ambience: 0.35 };
    this.station = 0;
    this.trackIndex = 0;
    this.music = music;
    music.onChange = (nome) => { this.onTrackChange && this.onTrackChange({ nome }); this.onTrackChangeMenu && this.onTrackChangeMenu({ nome }); };
    this.ambience = new Audio('assets/sounds/forest_ambience.mp3');
    this.ambience.loop = true;
    this.listener = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, z: 0 } };
    this.onTrackChange = null;
    this.musicOn = true;
    this.started = false;
  }

  async load() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    music.init(this.ctx);
    music.setVolume(this.settings.music);
    const names = new Set(Object.values(SFX).flat());
    await Promise.all([...names].map(async (n) => {
      try {
        const res = await fetch('assets/sounds/' + n + '.ogg');
        const arr = await res.arrayBuffer();
        this.buffers[n] = await this.ctx.decodeAudioData(arr);
      } catch (e) { console.warn('som falhou', n, e); }
    }));
  }

  start() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.started) return;
    this.started = true;
    this.ambience.volume = this.settings.ambience;
    this.ambience.play().catch(() => { });
    music.on = this.musicOn;
    music.start();
  }

  get stationObj() { return STATIONS[0]; }
  playTrack() { music.change(); }
  setStation() { return STATIONS[0]; }
  nextStation() { return STATIONS[0]; }
  nextTrack() { music.skip(); }
  prevTrack() { music.skip(); }
  toggleMusic() { this.musicOn = music.toggle(); return this.musicOn; }
  currentTrack() { return { nome: music.name() }; }

  // nota musical sintetizada (alto-falante programável)
  note(freq, dur, pos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let vol = 0.35 * this.settings.sfx, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.pos.x, dz = pos.z - this.listener.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 35) return;
      vol *= Math.pow(1 - d / 35, 1.4);
      if (d > 0.5) pan = Math.max(-1, Math.min(1, (dx * this.listener.right.x + dz * this.listener.right.z) / d)) * 0.7;
    }
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur + 0.35);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.master);
    // timbre de marimba: fundamental + harmônico suave
    for (const [mul, type, amp] of [[1, 'triangle', 1], [4, 'sine', 0.18], [2, 'sine', 0.25]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.4);
    }
  }
  setVolume(kind, v) {
    this.settings[kind] = v;
    if (kind === 'music') music.setVolume(v);
    if (kind === 'ambience') this.ambience.volume = v;
  }

  setListener(pos, rightX, rightZ) {
    this.listener.pos = pos;
    this.listener.right = { x: rightX, z: rightZ };
  }

  // toca um efeito. pos opcional => volume/pan pela distância
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const list = SFX[name];
    if (!list) return;
    const buf = this.buffers[list[Math.floor(Math.random() * list.length)]];
    if (!buf) return;
    let vol = (opts.volume ?? 1) * this.settings.sfx;
    let pan = 0;
    if (opts.pos) {
      const dx = opts.pos.x - this.listener.pos.x, dz = opts.pos.z - this.listener.pos.z;
      const d = Math.hypot(dx, dz);
      const maxD = opts.range ?? 22;
      if (d > maxD) return;
      vol *= Math.pow(1 - d / maxD, 1.6);
      if (d > 0.5) pan = Math.max(-1, Math.min(1, (dx * this.listener.right.x + dz * this.listener.right.z) / d)) * 0.7;
    }
    if (vol < 0.01) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? (0.94 + Math.random() * 0.12);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master);
    src.start();
  }
}

export const audio = new AudioManager();
