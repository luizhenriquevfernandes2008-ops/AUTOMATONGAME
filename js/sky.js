// 3.0 · Céu de KX-7: dia e noite de verdade (o sol nasce no leste e faz um arco), clima, e a astronomia:
//  · Júpiter: KX-7 dá a volta no sol mais rápido que ele, então a cada 8 dias de jogo KX-7 "ultrapassa"
//    Júpiter (oposição): ele fica enorme, nasce no pôr do sol e passa a noite inteira no céu. Do outro lado
//    da órbita (conjunção) ele fica pequeno e some no brilho do sol. A órbita de Júpiter é um pouco oval:
//    a cada 3 oposições uma cai perto do periélio e vira a GRANDE APROXIMAÇÃO (bem maior).
//  · Mira (lua grande, 5 dias) e Pip (lua pequena, 1,7 dia) com fases. Quando Mira passa na frente do
//    sol com o nó alinhado (a cada 10 dias, ao meio-dia) tem eclipse.
//  · Estrelas e galáxia giram em volta do polo norte celeste.
import * as THREE from 'three';
import { game } from './state.js';
import { audio } from './audio.js';
import { makeSkyDome } from './kxsky.js';
import { weightsAt, BIOMES, BIOME_KEYS, terrainUniforms, waterUniforms } from './terrain.js';

export const DAY_LENGTH = 16 * 60; // segundos por dia completo
const rainAudio = new Audio('assets/sounds/rain_loop.mp3');
rainAudio.loop = true;
rainAudio.volume = 0;

let dome = null;
const sky = {
  t: 0.36,          // 0 = meia-noite, 0.25 = amanhecer, 0.5 = meio-dia, 0.75 = anoitecer
  day: 0,           // dias completos desde o pouso
  weather: 'limpo', // limpo | nublado | chuva (a chuva vira neve na tundra e tempestade de areia no cânion)
  weatherT: 240,
  rainK: 0,         // 0..1 intensidade visual do "tempo ruim"
  cloudK: 0,
  frozen: false,
  meteorRate: 1 / 40, // estrelas cadentes por segundo (a chuva de meteoros aumenta)
  comet: null,      // { dir:[x,y,z] (no céu das estrelas), ate: dia }
  aurora: 0,        // 0..1 (os eventos controlam)
  rainbow: 0,
  astro: null,
};
game.sky = sky;

// ─── astronomia ───
const LAT = 0.62; // latitude da área de pouso (o polo celeste fica 35° acima do norte)
const sinL = Math.sin(LAT), cosL = Math.cos(LAT);
const POLE = new THREE.Vector3(0, sinL, -cosL);
const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
// direção no céu a partir do ângulo horário (0 = no meridiano, ao sul) e da declinação
function skyDir(h, dec, out = new THREE.Vector3()) {
  const cd = Math.cos(dec), sd = Math.sin(dec), ch = Math.cos(h), sh = Math.sin(h);
  return out.set(-cd * sh, sinL * sd + cosL * cd * ch, -(cosL * sd - sinL * cd * ch));
}
const SUN_R = 0.028, MIRA_R = 0.035, PIP_R = 0.017, JUP_K = 0.155;
export const JUP_SYNODIC = 8;
// fração do disco do sol coberta pela lua (área da lente entre dois círculos)
function overlap(sep, r1, r2) {
  if (sep >= r1 + r2) return 0;
  if (sep <= Math.abs(r2 - r1)) return r2 >= r1 ? 1 : (r2 * r2) / (r1 * r1);
  const a = r1 * r1 * Math.acos((sep * sep + r1 * r1 - r2 * r2) / (2 * sep * r1));
  const b = r2 * r2 * Math.acos((sep * sep + r2 * r2 - r1 * r1) / (2 * sep * r2));
  const c = 0.5 * Math.sqrt(Math.max(0, (-sep + r1 + r2) * (sep + r1 - r2) * (sep - r1 + r2) * (sep + r1 + r2)));
  return (a + b - c) / (Math.PI * r1 * r1);
}

// tudo que está no céu num instante D (dias desde o pouso, com fração)
export function astro(D) {
  const t = frac(D);
  const hSun = TAU * (t - 0.5);
  const sun = skyDir(hSun, 0);
  // Júpiter: órbita 2,2× maior que a de KX-7, excentricidade 0,12, periélio na 3ª oposição
  const psi = TAU * ((D - 1) / JUP_SYNODIC);
  const rJ = 2.2 * (1 - 0.12 * Math.cos(TAU * (D - 17) / (JUP_SYNODIC * 3)));
  const jx = rJ * Math.cos(psi), jy = rJ * Math.sin(psi);
  const vx = jx - 1, vy = jy;
  const dist = Math.hypot(vx, vy);
  const elong = Math.atan2(-vy, -vx);
  const jup = skyDir(hSun - elong, 0.05);
  const phaseA = Math.acos(Math.max(-1, Math.min(1, ((-jx) * (1 - jx) + (-jy) * (-jy)) / (rJ * dist))));
  const tng = sun.clone().addScaledVector(jup, -jup.dot(sun));
  if (tng.lengthSq() < 1e-8) tng.set(1, 0, 0);
  tng.normalize();
  const jupL = jup.clone().multiplyScalar(-Math.cos(phaseA)).addScaledVector(tng, Math.sin(phaseA));
  const k = Math.round((D - 1) / JUP_SYNODIC);           // número da oposição mais próxima
  const nextOpp = 1 + Math.ceil((D - 1) / JUP_SYNODIC - 1e-6) * JUP_SYNODIC;
  // Mira: lua nova ao meio-dia a cada 5 dias; nó alinhado a cada 10 → eclipse
  const eM = TAU * frac((D - 0.5) / 5);
  const mira = skyDir(hSun - eM, 0.11 * Math.cos(TAU * (D - 0.5) / 20));
  const eP = TAU * frac(D / 1.7 + 0.3);
  const pip = skyDir(hSun - eP, 0.2 * Math.sin(TAU * D / 3.1));
  const sep = Math.acos(Math.max(-1, Math.min(1, sun.dot(mira))));
  const eclipse = sun.y > -0.05 ? overlap(sep, SUN_R, MIRA_R) : 0;
  const nextEcl = 5.5 + Math.ceil((D - 5.5) / 10 - 1e-6) * 10;
  return {
    t, D, hSun, sun,
    jup, jupL, jupDist: dist, jupR: JUP_K / dist, jupNear: Math.max(0, Math.min(1, (2.0 - dist) / 0.67)), grand: dist < 1.1,
    jupTrend: Math.sin(psi) > 0 ? 'afastando' : 'aproximando', oppIndex: k, nextOpp, phaseA,
    mira, miraLit: (1 - Math.cos(eM)) / 2, pip, pipLit: (1 - Math.cos(eP)) / 2,
    eclipse, nextEcl,
  };
}

export function initSky() {
  dome = makeSkyDome();
  game.scene.add(dome);
  game.skyDome = dome;
}

// ─── estrelas cadentes (desenhadas no shader do céu) ───
const meteors = [];
function spawnMeteor() {
  if (meteors.length >= 4) return;
  const az = Math.random() * TAU, el = 0.35 + Math.random() * 0.6;
  const a = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const dir = new THREE.Vector3(Math.random() - 0.5, -0.4 - Math.random() * 0.4, Math.random() - 0.5).normalize();
  const b = a.clone().addScaledVector(dir, 0.12 + Math.random() * 0.2).normalize();
  meteors.push({ a, b, t: 0, dur: 0.5 + Math.random() * 0.7, bright: 0.6 + Math.random() * 0.6 });
}
function updateMeteors(dt, night) {
  if (night > 0.3 && Math.random() < dt * sky.meteorRate) spawnMeteor();
  const u = dome.userData.u;
  for (let i = 0; i < 4; i++) {
    const m = meteors[i];
    if (!m) { u.uMetA.value[i].w = 0; continue; }
    m.t += dt / m.dur;
    const k = Math.min(1, m.t);
    const head = m.a.clone().lerp(m.b, k).normalize();
    const tail = m.a.clone().lerp(m.b, Math.max(0, k - 0.35)).normalize();
    u.uMetA.value[i].set(head.x, head.y, head.z, Math.sin(Math.PI * k) * m.bright * night);
    u.uMetB.value[i].set(tail.x, tail.y, tail.z, 0);
  }
  for (let i = meteors.length - 1; i >= 0; i--) if (meteors[i].t >= 1) meteors.splice(i, 1);
}

// paletas (zênite, meio, horizonte, horizonte do lado do sol)
const PAL = {
  night: ['#02040b', '#070c20', '#141a33', '#1d1b33'],
  dusk: ['#0d1838', '#3b3f6e', '#d9774a', '#ff8a3a'],
  day: ['#1f5aa8', '#4b8ccc', '#b4cfe0', '#ffe6c4'],
};
const PC = Object.fromEntries(Object.entries(PAL).map(([k, a]) => [k, a.map((h) => new THREE.Color(h))]));
const cSunNoon = new THREE.Color(0xfff2dc), cSunGold = new THREE.Color(0xff9446);
const cMira = new THREE.Color(0x9fb4e8), cJup = new THREE.Color(0xffd6a8);
const hemiDaySky = new THREE.Color(0xb8d0ee), hemiNightSky = new THREE.Color(0x46548e), hemiAurora = new THREE.Color(0x3a9a78);
const hemiDayGround = new THREE.Color(0x7a6450), hemiNightGround = new THREE.Color(0x2a2432);
const cGrey = new THREE.Color(0x6a7280), cGreyN = new THREE.Color(0x141824), cSand = new THREE.Color(0xc0844e), cSnow = new THREE.Color(0xc8d4e2);
const tmp = new THREE.Color(), tmpB = new THREE.Color(), _bf = new THREE.Color(), _bc = new THREE.Color();
const starMat4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _l = new THREE.Vector3();
const smooth = THREE.MathUtils.smoothstep;
const bw = { floresta: 0, canion: 0, tundra: 0, cristal: 0, pantano: 0 };

export function updateSky(dt, simulate) {
  if (simulate && !sky.frozen) {
    sky.t += dt / DAY_LENGTH;
    if (sky.t >= 1) { sky.t -= 1; sky.day++; game.emit?.('newday', sky.day); }
  }
  // clima
  if (simulate) {
    sky.weatherT -= dt;
    if (sky.weatherT <= 0) {
      const r = Math.random();
      if (sky.weather === 'chuva') { sky.weather = r < 0.5 ? 'nublado' : 'limpo'; sky.weatherT = 240 + Math.random() * 360; }
      else if (sky.weather === 'nublado') { sky.weather = r < 0.5 ? 'chuva' : 'limpo'; sky.weatherT = sky.weather === 'chuva' ? 100 + Math.random() * 120 : 200 + Math.random() * 300; }
      else { sky.weather = r < 0.5 ? 'nublado' : 'limpo'; sky.weatherT = 200 + Math.random() * 300; }
      game.emit('weather', sky.weather);
    }
  }
  sky.rainK += ((sky.weather === 'chuva' ? 1 : 0) - sky.rainK) * Math.min(1, dt * 0.25);
  sky.cloudK += ((sky.weather === 'limpo' ? 0 : 1) - sky.cloudK) * Math.min(1, dt * 0.2);

  const A = astro(sky.day + sky.t);
  sky.astro = A;
  const cam = game.camera.position;
  const w = weightsAt(cam.x, cam.z);
  BIOME_KEYS.forEach((b, i) => { bw[b] = w[i]; });
  sky.biomeW = bw;

  // dia/noite pelo sol (o eclipse escurece tudo por uns segundos)
  const ecl = A.eclipse;
  const alt = A.sun.y;
  let day = smooth(alt, -0.12, 0.22);
  day *= 1 - ecl * ecl * 0.72;
  const golden = Math.max(0, 1 - Math.abs(alt + 0.02) / 0.26) * smooth(alt, -0.2, 0.0);
  const cloud = sky.cloudK;
  const storm = sky.rainK;
  // tempo ruim por bioma: chuva, neve, areia
  const sand = storm * Math.min(1, bw.canion * 1.3), snow = storm * Math.min(1, bw.tundra * 1.3), wet = storm * Math.max(0, 1 - 1.6 * (bw.canion + bw.tundra));
  sky.sandK = sand; sky.snowK = snow; sky.wetK = wet;
  game.sunLight = Math.max(0, Math.min(1, alt * 2.2)) * (1 - cloud * 0.35) * (1 - ecl * 0.95);
  game.weatherPower = 1 - storm * 0.45;
  game.isNight = day < 0.25;
  game.nightK = 1 - day;
  game.eclipseK = ecl;

  // luz principal: o sol de dia; de noite a mais forte entre Mira e Júpiter ("luz de Júpiter")
  const jupUp = smooth(A.jup.y, -0.02, 0.12), miraUp = smooth(A.mira.y, -0.02, 0.12);
  const jupB = jupUp * (0.18 + 0.75 * A.jupNear + (A.grand ? 0.25 : 0));
  const miraB = miraUp * A.miraLit * 0.7;
  sky.jupLight = jupB;
  const sun = game.sun, hemi = game.hemi, scene = game.scene;
  const night = 1 - day;
  if (day > 0.05 || (jupB < 0.05 && miraB < 0.05)) _l.copy(A.sun);
  else _l.copy(jupB >= miraB ? A.jup : A.mira);
  _l.y = Math.max(0.12, _l.y);
  _l.normalize();
  game.sunDir = _l;
  if (sun) {
    tmp.copy(cSunNoon).lerp(cSunGold, golden);
    tmpB.copy(cMira).lerp(cJup, jupB / Math.max(0.001, jupB + miraB));
    sun.color.copy(tmp).lerp(tmpB, night);
    const nightI = 0.35 + Math.max(jupB, miraB) * 1.1;
    sun.intensity = (day * (1.0 + 2.3 * smooth(alt, 0, 0.4)) + night * nightI) * (1 - cloud * 0.4) * (1 - storm * 0.2);
  }
  if (game.fill) {
    game.fill.position.set(-_l.x * 60, 50, -_l.z * 60).add(cam);
    game.fill.target.position.copy(cam);
    game.fill.intensity = (0.55 + 0.7 * day) * (1 - cloud * 0.25);
  }
  if (hemi) {
    hemi.color.copy(hemiNightSky).lerp(hemiAurora, sky.aurora * 0.5 * night).lerp(hemiDaySky, day);
    hemi.groundColor.copy(hemiNightGround).lerp(hemiDayGround, day);
    hemi.intensity = 1.05 + 0.6 * day + night * jupB * 0.4;
  }
  scene.environmentIntensity = 0.35 + 0.55 * day * (1 - cloud * 0.3);

  // cores do céu
  const u = dome.userData.u;
  const keys = ['cZen', 'cMid', 'cHor', 'cSunHor'];
  // tinta do bioma (a névoa de cada um) puxa o horizonte
  _bf.setRGB(0, 0, 0);
  BIOME_KEYS.forEach((b, i) => { _bc.setHex(BIOMES[b].fog); _bf.r += _bc.r * w[i]; _bf.g += _bc.g * w[i]; _bf.b += _bc.b * w[i]; });
  keys.forEach((k, i) => {
    tmp.copy(PC.night[i]).lerp(PC.day[i], day).lerp(PC.dusk[i], golden * 0.85);
    if (i === 2) tmp.lerp(_bf, 0.3 * day);
    if (i >= 2 && ecl > 0.05) tmp.lerp(PC.dusk[3], ecl * ecl * 0.7);
    tmp.lerp(day > 0.3 ? cGrey : cGreyN, cloud * (i === 3 ? 0.6 : 0.4) + storm * 0.25);
    if (sand > 0.01) tmp.lerp(cSand, sand * 0.6 * Math.max(0.3, day));
    if (snow > 0.01) tmp.lerp(cSnow, snow * 0.45 * Math.max(0.2, day));
    u[k].value.copy(tmp);
  });
  // névoa = horizonte + bioma
  tmp.copy(u.cHor.value).lerp(_bf, 0.45 * Math.max(0.2, day));
  if (day < 0.5) tmp.multiplyScalar(0.55 + day);
  if (sand > 0.01) tmp.lerp(cSand, sand * 0.7);
  u.cFog.value.copy(tmp);
  if (scene.fog) {
    scene.fog.color.copy(tmp);
    const swampFog = bw.pantano * 0.35 + wet * 0.45 + snow * 0.55 + sand * 0.78;
    scene.fog.near = 90 * (1 - swampFog * 0.7);
    scene.fog.far = 820 * (1 - swampFog * 0.75);
  }
  scene.background?.copy?.(tmp);
  u.sunDir.value.copy(A.sun);
  u.sunCol.value.copy(cSunNoon).lerp(cSunGold, golden);
  u.sunGlow.value = (0.25 + 0.9 * smooth(alt, -0.1, 0.1)) * (1 - cloud * 0.6) * (1 - ecl * 0.97);
  u.sunDisc.value = smooth(alt, -0.04, 0.02) * (1 - cloud * 0.8);
  u.uTime.value += dt;
  u.uDay.value = day;
  u.uStars.value = Math.max(0, (1 - day * 1.15)) * (1 - cloud * 0.7) * (1 - ecl * 0.6) + ecl * ecl * 0.3;
  u.uEclipse.value = smooth(ecl, 0.85, 1.0);
  // estrelas giram com o dia
  starMat4.makeRotationAxis(POLE, TAU * (sky.t - 0.5) + sky.day * 0.07);
  u.uStarMat.value.setFromMatrix4(starMat4);
  // Júpiter e as luas
  u.uJupDir.value.copy(A.jup);
  u.uJupL.value.copy(A.jupL);
  u.uJupR.value = A.jupR;
  u.uJupK.value = (1 - cloud * 0.75) * (1 - smooth(A.sun.dot(A.jup), 0.96, 0.995));
  u.uJupSpin.value += dt * 0.012;
  u.uMoonDir.value[0].copy(A.mira);
  u.uMoonDir.value[1].copy(A.pip);
  u.uMoonR.value[0] = MIRA_R; u.uMoonR.value[1] = PIP_R;
  // nuvens
  const baseCloud = 0.16 + bw.pantano * 0.15 + bw.floresta * 0.06 - bw.canion * 0.1;
  u.uCloud.value = Math.max(0.04, baseCloud + cloud * 0.45 + storm * 0.25);
  tmp.setRGB(1, 0.98, 0.95).lerp(tmpB.set(0xffb07a), golden * 0.8);
  tmp.lerp(tmpB.setRGB(0.09, 0.1, 0.16).lerp(cJup, jupB * 0.12), night);
  u.uCloudCol.value.copy(tmp).lerp(cGrey, storm * 0.6 * day);
  u.uCloudDark.value.copy(tmp).multiplyScalar(0.62).lerp(tmpB.copy(u.cMid.value), 0.3);
  u.uAurora.value = sky.aurora * night;
  u.uRainbow.value = sky.rainbow * day;
  // cometa
  if (sky.comet && sky.day + sky.t < sky.comet.ate) {
    _v.fromArray(sky.comet.dir).applyMatrix3(_m3.copy(u.uStarMat.value).transpose());
    u.uCometDir.value.copy(_v);
    const tail = _v.clone().sub(A.sun);
    tail.addScaledVector(_v, -tail.dot(_v));
    if (tail.lengthSq() > 1e-6) u.uCometTail.value.copy(tail.normalize());
    u.uCometK.value = night * (1 - cloud * 0.8) * smooth(sky.comet.ate - (sky.day + sky.t), 0, 0.5);
  } else u.uCometK.value = 0;
  updateMeteors(dt, night * (1 - cloud * 0.7));
  dome.position.copy(cam);
  game.skyHook?.(u, A); // testes

  game.renderer.toneMappingExposure = 1.05 + night * 0.4;
  // brilho do terreno, da água e da flora à noite
  terrainUniforms.uTime.value += dt;
  terrainUniforms.uNight.value = night;
  waterUniforms.uTime.value += dt;
  waterUniforms.uNight.value = night;
  waterUniforms.uSkyZ.value.copy(u.cMid.value); waterUniforms.uSkyH.value.copy(u.cHor.value);
  waterUniforms.uSunDir.value.copy(day > 0.05 ? A.sun : _l); waterUniforms.uSunCol.value.copy(u.sunCol.value);
  waterUniforms.uSunK.value = (day > 0.05 ? u.sunDisc.value : Math.max(jupB, miraB) * 0.4) * (1 - cloud * 0.7);

  const vol = wet * audio.settings.ambience * 1.2;
  if (vol > 0.01) { rainAudio.volume = Math.min(1, vol); if (rainAudio.paused && audio.started) rainAudio.play().catch(() => { }); }
  else if (!rainAudio.paused) rainAudio.pause();
  // conquistas e marcas
  if (game.mode === 'play' && game.economy) {
    const s = game.economy.stats;
    if (game.isNight) s.nightSeen = true;
    if (storm > 0.7) s.rainSeen = true;
    if (A.grand && jupUp > 0.5 && night > 0.5) s.jupiterSeen = true;
    if (ecl > 0.5) s.eclipseSeen = true;
  }
}
const _m3 = new THREE.Matrix3();

export function clockText() {
  const mins = Math.floor(sky.t * 24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  const bad = sky.weather === 'chuva' ? (sky.sandK > 0.4 ? '🌪️' : sky.snowK > 0.4 ? '🌨️' : '🌧️') : null;
  const icon = game.eclipseK > 0.3 ? '🌑' : bad || (sky.weather === 'nublado' ? '⛅' : game.isNight ? '🌙' : '☀️');
  return `${icon} ${String(h).padStart(2, '0')}:${String(m - (m % 10)).padStart(2, '0')} · dia ${sky.day + 1}`;
}
// almanaque: o que tem no céu agora e o que vem por aí
export function skyInfo() {
  const A = sky.astro || astro(sky.day + sky.t);
  const D = sky.day + sky.t;
  const inDays = (x) => { const d = x - D; if (d < 0.05) return 'agora!'; return d < 1 ? `em ${Math.max(1, Math.round(d * 24))} h` : `em ${Math.round(d)} dia${Math.round(d) > 1 ? 's' : ''}`; };
  const nextGrand = (() => { let o = A.nextOpp; for (let i = 0; i < 4; i++) { if (astro(o).grand) return o; o += JUP_SYNODIC; } return null; })();
  return {
    dia: sky.day + 1,
    jupiter: `${A.jupDist.toFixed(2).replace('.', ',')} UA · ${A.jupTrend}${A.grand ? ' · GRANDE APROXIMAÇÃO' : A.jupNear > 0.75 ? ' · bem perto' : ''}`,
    oposicao: inDays(A.nextOpp),
    grande: nextGrand ? inDays(nextGrand) : '—',
    eclipse: A.eclipse > 0.01 ? 'agora!' : inDays(A.nextEcl),
    mira: moonPhaseName(A.miraLit, A.mira, A),
    near: A.jupNear, grand: A.grand,
  };
}
function moonPhaseName(lit) {
  if (lit < 0.05) return '🌑 nova';
  if (lit > 0.95) return '🌕 cheia';
  return lit < 0.5 ? '🌒 crescente' : '🌔 quase cheia';
}
export function serializeSky() { return { t: sky.t, day: sky.day, weather: sky.weather, weatherT: sky.weatherT, comet: sky.comet }; }
export function loadSky(d) {
  if (!d) return;
  sky.t = d.t ?? sky.t; sky.day = d.day || 0;
  sky.weather = d.weather || 'limpo'; sky.weatherT = d.weatherT || 240;
  sky.rainK = sky.weather === 'chuva' ? 1 : 0; sky.cloudK = sky.weather === 'limpo' ? 0 : 1;
  sky.comet = d.comet || null;
}
