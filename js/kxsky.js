// 3.0 · O céu de KX-7 num shader só (cúpula que segue a câmera, sempre no fundo):
// gradiente do dia, sol com halo, estrelas e nebulosa que giram com a noite, Júpiter procedural
// (faixas, grande mancha, anéis fracos e as 4 luas dele), as duas luas de KX-7 com fases (Mira e Pip),
// nuvens, aurora, arco-íris, cometa, estrelas cadentes e a coroa do eclipse.
// Tudo fica no mesmo desenho pra nada do céu aparecer "na frente" das montanhas lá longe.
import * as THREE from 'three';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // sempre no fundo
}`;

const frag = /* glsl */`
uniform vec3 cZen, cMid, cHor, cSunHor, cFog, sunCol;
uniform vec3 sunDir;
uniform float sunGlow, sunDisc, sunR, uTime, uStars, uDay, uFogK;
uniform mat3 uStarMat;
uniform vec3 uJupDir, uJupL; uniform float uJupR, uJupK, uJupSpin;
uniform vec3 uMoonDir[2]; uniform float uMoonR[2]; uniform vec3 uMoonCol[2];
uniform float uCloud; uniform vec3 uCloudCol, uCloudDark;
uniform float uAurora, uRainbow, uEclipse, uQuality;
uniform vec3 uCometDir, uCometTail; uniform float uCometK;
uniform vec4 uMetA[4]; uniform vec4 uMetB[4];
varying vec3 vDir;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm2(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vn2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }

// estrelas: um ponto por célula de uma grade 3D cortada pela esfera
vec3 starLayer(vec3 sd, float scale, float thr, float size) {
  vec3 p = sd * scale; vec3 i = floor(p); vec3 f = p - i;
  float h = h31(i);
  if (h < thr) return vec3(0.0);
  vec3 o = vec3(h31(i + 1.3), h31(i + 7.1), h31(i + 3.7)) * 0.8 + 0.1;
  vec3 dv = f - o;
  float d2 = dot(dv, dv);
  float b = pow((h - thr) / (1.0 - thr), 3.0);
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 6.0) + h * 40.0);
  vec3 col = mix(vec3(1.0, 0.72, 0.55), vec3(0.72, 0.82, 1.0), h31(i + 5.5));
  return col * exp(-d2 / (size * size)) * (0.35 + b * 3.0) * tw;
}

// base de um corpo redondo no céu: coordenadas no plano tangente (em raios do corpo)
vec2 bodyUV(vec3 d, vec3 c, float R, out vec3 rt, out vec3 up) {
  rt = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
  up = cross(rt, c);
  float z = max(dot(d, c), 1e-4);
  return vec2(dot(d, rt), dot(d, up)) / z / R;
}

// Júpiter: faixas turbulentas, grande mancha, polos acinzentados, anéis finos e 4 luazinhas
vec4 jupiter(vec3 d, float px) {
  if (dot(d, uJupDir) < 0.9) return vec4(0.0);
  vec3 rt, up;
  vec2 uv0 = bodyUV(d, uJupDir, uJupR, rt, up);
  float a = 0.2;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 uv = rot * uv0;
  float r2 = dot(uv, uv);
  vec4 res = vec4(0.0);
  // luz média do lado de cá (pros anéis e as luas)
  float litSide = clamp(dot(-uJupDir, uJupL) * 0.5 + 0.5, 0.0, 1.0);
  // anéis
  float re = length(vec2(uv.x, uv.y / 0.12));
  float ring = smoothstep(1.32, 1.4, re) * (1.0 - smoothstep(1.85, 1.95, re)) * (0.55 + 0.45 * sin(re * 55.0)) * 0.32;
  vec3 ringCol = vec3(0.86, 0.78, 0.66) * (0.25 + 0.9 * litSide);
  bool front = uv.y < 0.0;
  if (!front && r2 > 1.0) res = vec4(ringCol, ring);
  if (r2 < 1.0) {
    vec3 n = vec3(uv, sqrt(1.0 - r2));
    float lat = n.y;
    float lon = atan(n.x, n.z) + uJupSpin;
    float turb = vn2(vec2(lon * 3.0, lat * 26.0)) * 0.6 + vn2(vec2(lon * 9.0, lat * 64.0)) * 0.3;
    float bands = sin(lat * 21.0 + turb * 2.4);
    vec3 col = mix(vec3(0.95, 0.89, 0.78), vec3(0.78, 0.57, 0.39), smoothstep(-0.3, 0.6, bands));
    col = mix(col, vec3(0.56, 0.36, 0.25), smoothstep(0.78, 1.0, bands) * 0.6);
    col = mix(col, vec3(0.58, 0.56, 0.6), smoothstep(0.72, 0.95, abs(lat)));
    float wl = mod(lon + 3.14159, 6.28318) - 3.14159 - 0.4;
    vec2 gs = vec2(wl * 1.3, (lat + 0.34) * 3.4);
    float spot = exp(-dot(gs, gs) * 18.0);
    col = mix(col, vec3(0.8, 0.38, 0.24), spot * 0.9);
    vec2 nb = transpose(rot) * n.xy;
    vec3 N = rt * nb.x + up * nb.y - uJupDir * n.z;
    float diff = clamp(dot(N, uJupL), 0.0, 1.0);
    float limb = pow(n.z, 0.45);
    vec3 lit = col * (diff * 1.3 * limb + 0.012);
    res = vec4(lit, 1.0 - smoothstep(1.0 - max(0.02, px * 1.5), 1.0, sqrt(r2)));
  }
  if (front && ring > 0.0) res = vec4(mix(res.rgb, ringCol, ring), max(res.a, ring));
  // as quatro luas grandes, enfileiradas no equador
  float dotR = max(0.045, px * 1.2);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float A = 2.3 + fi * 1.35;
    float ph = uTime * (0.05 / (1.0 + fi)) + fi * 1.9;
    vec2 mp = vec2(A * sin(ph), 0.0);
    bool behind = cos(ph) < 0.0 && abs(mp.x) < 1.0;
    float dd = length(uv - mp);
    float m = 1.0 - smoothstep(dotR * 0.4, dotR, dd);
    if (!behind && m > 0.0) res = vec4(mix(res.rgb, vec3(0.95, 0.9, 0.82) * (0.4 + 0.8 * litSide), m), max(res.a, m));
  }
  return res;
}

// lua perto (Mira e Pip): o lado iluminado aponta pro sol de verdade, então tem fases e eclipse
vec4 moonBody(vec3 d, vec3 c, float R, vec3 albedo, float seed, float px) {
  if (dot(d, c) < 0.95) return vec4(0.0);
  vec3 rt, up;
  vec2 uv = bodyUV(d, c, R, rt, up);
  float r2 = dot(uv, uv);
  if (r2 > 1.0) return vec4(0.0);
  vec3 n = vec3(uv, sqrt(1.0 - r2));
  vec3 N = rt * n.x + up * n.y - c * n.z;
  float diff = clamp(dot(N, sunDir) * 1.1 + 0.03, 0.0, 1.0);
  float cr = vn2(uv * 2.5 + seed) * 0.55 + vn2(uv * 6.0 + seed) * 0.3 + vn2(uv * 14.0) * 0.15;
  vec3 col = albedo * (0.6 + 0.7 * cr);
  return vec4(col * diff * 1.5, 1.0 - smoothstep(1.0 - max(0.04, px * 1.5), 1.0, sqrt(r2)));
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float px = fwidth(d.x) + fwidth(d.y);
  // gradiente: zênite → meio → horizonte (o horizonte esquenta do lado do sol)
  float sunAz = max(dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(vec2(sunDir.x, sunDir.z) + 1e-5)), 0.0);
  vec3 hor = mix(cHor, cSunHor, pow(sunAz, 3.0) * (1.0 - smoothstep(0.0, 0.5, sunDir.y + 0.1) * 0.6));
  vec3 c;
  float t = pow(clamp(e / 0.8, 0.0, 1.0), 0.55);
  if (t < 0.35) c = mix(hor, cMid, smoothstep(0.0, 0.35, t));
  else c = mix(cMid, cZen, smoothstep(0.35, 1.0, t));
  vec3 base = c;
  float aboveH = smoothstep(-0.03, 0.02, e);
  // céu noturno: estrelas, nebulosa e a faixa da galáxia (giram em volta do polo)
  if (uStars > 0.01 && e > -0.05) {
    vec3 sd = uStarMat * d;
    vec3 st = starLayer(sd, 210.0, 0.55, 0.16) + starLayer(sd, 70.0, 0.93, 0.07) * 1.6;
    float g = dot(sd, normalize(vec3(0.35, 0.55, 0.76)));
    float band = exp(-g * g * 12.0);
    float n = vn3(sd * 4.0) * 0.55 + vn3(sd * 9.0) * 0.3 + vn3(sd * 21.0) * 0.15;
    float dust = smoothstep(0.42, 0.72, vn3(sd * 7.0 + 3.0));
    vec3 neb = mix(vec3(0.32, 0.16, 0.55), vec3(0.1, 0.42, 0.58), n) * band * n * (1.0 - dust * 0.75) * 0.55;
    // nuvem rosa (nebulosa da Pétala) num canto da galáxia
    vec3 pd = sd - normalize(vec3(-0.6, 0.45, 0.66));
    neb += vec3(0.85, 0.3, 0.55) * exp(-dot(pd, pd) * 30.0) * (0.4 + 0.8 * vn3(sd * 12.0)) * 0.45;
    st *= 1.0 + band * 1.5;
    c += (st + neb) * uStars * aboveH * smoothstep(-0.02, 0.15, e);
  }
  // aurora: cortinas verdes e roxas pro norte, com raios que tremem
  if (uAurora > 0.01 && e > 0.0) {
    float az = atan(d.x, -d.z);
    float el = asin(e);
    vec3 ac = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float bse = 0.16 + 0.09 * fi + 0.07 * sin(az * 2.1 + fi * 1.7 + uTime * 0.05) + 0.05 * vn2(vec2(az * 3.0 + fi * 5.0, uTime * 0.06));
      float dy = el - bse;
      float curtain = smoothstep(-0.012, 0.012, dy) * exp(-max(dy, 0.0) * (6.5 + fi * 3.0));
      float rays = 0.35 + 0.65 * vn2(vec2(az * 45.0 + fi * 13.0, uTime * 0.5 + fi));
      float span = 1.0 - smoothstep(0.5, 2.0, abs(az - 0.25 * fi + 0.2));
      ac += mix(vec3(0.12, 1.0, 0.5), vec3(0.55, 0.22, 0.75), smoothstep(0.02, 0.3, dy)) * curtain * rays * span * (1.0 - fi * 0.22);
    }
    c += ac * uAurora * 0.85;
  }
  // estrelas cadentes
  for (int i = 0; i < 4; i++) {
    vec4 A = uMetA[i];
    if (A.w <= 0.0) continue;
    vec3 tl = uMetB[i].xyz, ba = A.xyz - tl;
    float k = clamp(dot(d - tl, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    vec3 q = d - tl - ba * k;
    c += vec3(1.0, 0.9, 0.8) * exp(-dot(q, q) / 3.2e-6) * k * k * A.w * 1.6;
  }
  // cometa: cabeça azulada e cauda apontando pra longe do sol
  if (uCometK > 0.01) {
    vec3 v = d - uCometDir;
    float along = dot(v, uCometTail);
    float perp = length(v - uCometTail * along);
    float w = 0.003 + max(along, 0.0) * 0.12;
    float tail = along > -0.004 ? exp(-perp * perp / (w * w)) * exp(-max(along, 0.0) * 7.0) : 0.0;
    float head = exp(-dot(v, v) / 4e-6);
    c += (vec3(0.75, 0.9, 1.0) * head * 2.0 + vec3(0.55, 0.75, 1.0) * tail * 0.55) * uCometK * aboveH;
  }
  // Júpiter (de dia ele fica mais apagado pelo azul)
  vec4 J = jupiter(d, px / max(uJupR, 0.01));
  if (J.a > 0.0) c = mix(c, base * uDay * 0.6 + J.rgb * mix(1.0, 0.45, uDay), J.a * uJupK * aboveH);
  // as duas luas
  float moonMask = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 M = moonBody(d, uMoonDir[i], uMoonR[i], uMoonCol[i], float(i) * 7.3, px / uMoonR[i]);
    if (M.a > 0.0) { c = mix(c, base * (0.15 + uDay * 0.85) + M.rgb * mix(1.0, 0.7, uDay), M.a * aboveH); moonMask = max(moonMask, M.a); }
  }
  // sol: disco, halo e (no eclipse) a coroa
  float s = max(dot(d, sunDir), 0.0);
  c += sunCol * (pow(s, 8.0) * 0.18 + pow(s, 60.0) * 0.45) * sunGlow;
  float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
  float disc = 1.0 - smoothstep(sunR * 0.92, sunR, ang);
  c += sunCol * disc * sunDisc * 5.0 * (1.0 - moonMask) * aboveH;
  if (uEclipse > 0.01) {
    float rr = ang / sunR;
    float streak = 0.6 + 0.4 * vn2(vec2(atan(d.y - sunDir.y, d.x - sunDir.x) * 6.0, uTime * 0.1));
    c += vec3(0.85, 0.9, 1.0) * exp(-max(rr - 1.0, 0.0) * 2.2) * smoothstep(0.95, 1.05, rr) * streak * uEclipse * 1.2;
  }
  // nuvens
  if (uCloud > 0.01 && e > 0.0) {
    vec2 p = d.xz / (e + 0.1) * 1.4 + vec2(uTime * 0.005, uTime * 0.0018);
    int oct = uQuality > 0.5 ? 5 : 3;
    float n = fbm2(p, oct);
    float th = 1.0 - uCloud * 0.75;
    float dens = smoothstep(th - 0.12, th + 0.22, n);
    float n2 = fbm2(p + sunDir.xz * 0.06, 3);
    float shade = clamp((n - n2) * 3.5 + 0.65, 0.25, 1.25);
    vec3 cl = mix(uCloudDark, uCloudCol, shade) + sunCol * pow(s, 5.0) * 0.6 * sunGlow * (1.0 - dens * 0.5);
    c = mix(c, cl, dens * smoothstep(0.0, 0.2, e) * 0.96);
  }
  // arco-íris (42° do ponto oposto ao sol) e o secundário mais fraco
  if (uRainbow > 0.01 && e > 0.0) {
    float aa = acos(clamp(dot(d, -sunDir), -1.0, 1.0));
    float t1 = (aa - 0.705) / 0.04;
    if (t1 > 0.0 && t1 < 1.0) c += hue(0.78 * (1.0 - t1)) * sin(t1 * 3.1416) * uRainbow * 0.32;
    float t2 = (aa - 0.88) / 0.05;
    if (t2 > 0.0 && t2 < 1.0) c += hue(0.78 * t2) * sin(t2 * 3.1416) * uRainbow * 0.12;
  }
  // horizonte some na névoa (casa com a névoa do terreno)
  c = mix(c, cFog, (1.0 - smoothstep(-0.02, 0.16, e)) * uFogK);
  if (e < -0.02) c = cFog;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const V = (x = 0, y = 1, z = 0) => new THREE.Vector3(x, y, z);
export function makeSkyDome() {
  const u = {
    cZen: { value: new THREE.Color('#2c63b0') }, cMid: { value: new THREE.Color('#5a95d0') }, cHor: { value: new THREE.Color('#bfd6e6') },
    cSunHor: { value: new THREE.Color('#ffd0a0') }, cFog: { value: new THREE.Color('#9ab0c0') }, sunCol: { value: new THREE.Color('#fff0d8') },
    sunDir: { value: V(0.3, 0.8, 0.5).normalize() },
    sunGlow: { value: 1 }, sunDisc: { value: 1 }, sunR: { value: 0.028 }, uTime: { value: 0 }, uStars: { value: 0 }, uDay: { value: 1 }, uFogK: { value: 1 },
    uStarMat: { value: new THREE.Matrix3() },
    uJupDir: { value: V(0, 0.5, -1).normalize() }, uJupL: { value: V(0, 0, 1) }, uJupR: { value: 0.06 }, uJupK: { value: 1 }, uJupSpin: { value: 0 },
    uMoonDir: { value: [V(0.5, 0.4, -0.7).normalize(), V(-0.6, 0.3, -0.5).normalize()] }, uMoonR: { value: [0.035, 0.018] },
    uMoonCol: { value: [new THREE.Color(0.75, 0.8, 0.9), new THREE.Color(0.9, 0.62, 0.5)] },
    uCloud: { value: 0.25 }, uCloudCol: { value: new THREE.Color(1, 1, 1) }, uCloudDark: { value: new THREE.Color(0.6, 0.65, 0.75) },
    uAurora: { value: 0 }, uRainbow: { value: 0 }, uEclipse: { value: 0 }, uQuality: { value: 1 },
    uCometDir: { value: V(0, 0.5, 1).normalize() }, uCometTail: { value: V(1, 0, 0) }, uCometK: { value: 0 },
    uMetA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, 0)) },
    uMetB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, 0)) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 64, 32), mat);
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  dome.userData.u = u;
  return dome;
}

// mapa de ambiente gerado do próprio céu (reflexos das máquinas): um dia claro e meio nublado
export function makeEnvMap(renderer) {
  const scene = new THREE.Scene();
  const dome = makeSkyDome();
  dome.userData.u.uCloud.value = 0.35;
  scene.add(dome);
  const g = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: 0x4a4038 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -2;
  scene.add(g);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02, 0.1, 1000);
  pm.dispose();
  dome.geometry.dispose(); dome.material.dispose();
  return rt.texture;
}
