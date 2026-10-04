// v2 · KX-7: converte as cores dos modelos baixados (Kenney, Quaternius, Kay Lousberg…)
// pra paleta do trailer: aço escuro, âmbar/laranja, teal, terra avermelhada e cristal roxo.
// Funciona tanto em cores de material quanto em texturas-paleta (atlas de cores).
import * as THREE from 'three';

// cores do trailer (css do automatom-trailer.html)
export const KX = {
  ink: 0x05080c,
  steel: 0x3a444f,
  amber: 0xffae34,
  orange: 0xff7a1a,
  teal: 0x3fe0cc,
  red: 0xff4455,
  crystal: 0x9a5ae6,
  rock: 0x4a322a,
  ground: 0x5a3226,
  fog: 0x462a28,
};

function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

// r,g,b em 0..1 (sRGB). mode: 'auto' | 'amber' (vermelho vira âmbar) | 'rock' | 'crystal' | 'steel' | 'mountain'
export function kxColor(r, g, b, mode = 'auto') {
  let [h, s, l] = rgb2hsl(r, g, b);
  if (mode === 'amber' && s >= 0.18 && (h < 12 || h >= 330)) h = 30;
  if (mode === 'rock') {
    // pedra/terra: marrom-avermelhado do chão do trailer, mantendo o relevo de claro/escuro
    return hsl2rgb(12 + s * 6, 0.3 + s * 0.12, 0.1 + l * 0.3);
  }
  if (mode === 'mountain') {
    // silhuetas distantes: roxo-acastanhado escuro (camadas de montanha do trailer)
    return hsl2rgb(330, 0.2, 0.08 + l * 0.18);
  }
  if (mode === 'crystal') {
    if (s < 0.2 || l < 0.12) return hsl2rgb(12, 0.25, 0.08 + l * 0.25); // base de pedra
    return hsl2rgb(268, 0.7, 0.35 + l * 0.3);
  }
  if (mode === 'steel' || s < 0.18) {
    // cinzas (inclusive o cinza-lavanda do Kenney) viram aço azulado escuro
    return hsl2rgb(210, 0.12 + s * 0.1, 0.17 + l * 0.5);
  }
  // cinza-azulado/lavanda pouco saturado também é "metal"
  if (h >= 195 && h < 285 && s < 0.55) return hsl2rgb(212, 0.14, 0.17 + l * 0.48);
  if (h >= 12 && h < 62) {
    // laranja/amarelo/madeira → âmbar e laranja do trailer
    const hh = h < 28 ? 24 : 34;
    return hsl2rgb(hh, 0.85, Math.min(0.6, 0.3 + l * 0.35));
  }
  if (h < 12 || h >= 330) return hsl2rgb(356, 0.62, Math.min(0.55, 0.22 + l * 0.4)); // vermelho
  if (h >= 62 && h < 195) return hsl2rgb(172, 0.62, Math.min(0.55, 0.18 + l * 0.42)); // verde/ciano → teal
  if (h >= 285 && h < 330) return hsl2rgb(268, 0.65, 0.3 + l * 0.35); // rosa/roxo → cristal
  // azul forte (telas, vidros)
  return hsl2rgb(196, 0.55, Math.min(0.5, 0.15 + l * 0.4));
}

const lin = new THREE.Color();
function remapColor(c, mode) {
  // Color do three fica em linear; converte pra sRGB, remapeia e volta
  lin.copy(c).convertLinearToSRGB();
  const [r, g, b] = kxColor(lin.r, lin.g, lin.b, mode);
  c.setRGB(r, g, b, THREE.SRGBColorSpace);
}

const texCache = new Map(); // chave "arquivo|modo" → textura remapeada (reaproveitada entre modelos)
const glowCache = new Map(); // mesma chave → mapa emissivo (só as cores de destaque)
function glowOf(r, g, b) {
  const [h, s, l] = rgb2hsl(r / 255, g / 255, b / 255);
  const accent = s > 0.6 && l > 0.3 && ((h >= 18 && h < 45) || (h >= 160 && h < 185));
  return accent ? 1 : 0;
}
function remapTexture(tex, key, mode) {
  const k = key + '|' + mode;
  if (texCache.has(k)) return texCache.get(k);
  const img = tex.image;
  if (!img || !img.width) return tex;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const memo = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const packed = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let out = memo.get(packed);
    if (out === undefined) {
      const [r, gg, b] = kxColor(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, mode);
      out = (Math.round(r * 255) << 16) | (Math.round(gg * 255) << 8) | Math.round(b * 255);
      memo.set(packed, out);
    }
    px[i] = (out >> 16) & 255; px[i + 1] = (out >> 8) & 255; px[i + 2] = out & 255;
  }
  g.putImageData(data, 0, 0);
  // emissivo: copia só os pixels de destaque, o resto fica preto
  const ec = document.createElement('canvas');
  ec.width = c.width; ec.height = c.height;
  const eg = ec.getContext('2d');
  const ed = eg.createImageData(c.width, c.height);
  let any = false;
  for (let i = 0; i < px.length; i += 4) {
    if (glowOf(px[i], px[i + 1], px[i + 2])) { ed.data[i] = px[i]; ed.data[i + 1] = px[i + 1]; ed.data[i + 2] = px[i + 2]; any = true; }
    ed.data[i + 3] = 255;
  }
  eg.putImageData(ed, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.magFilter = tex.magFilter; t.minFilter = tex.minFilter;
  t.anisotropy = 4;
  t.channel = tex.channel;
  t.offset.copy(tex.offset); t.repeat.copy(tex.repeat);
  texCache.set(k, t);
  if (any) {
    // textura nova (clone() dividiria a mesma imagem com o mapa de cor)
    const et = new THREE.CanvasTexture(ec);
    et.flipY = t.flipY; et.colorSpace = THREE.SRGBColorSpace;
    et.wrapS = t.wrapS; et.wrapT = t.wrapT; et.magFilter = t.magFilter; et.minFilter = t.minFilter;
    et.channel = t.channel; et.offset.copy(t.offset); et.repeat.copy(t.repeat);
    glowCache.set(k, et);
  }
  return t;
}

// aplica a paleta em todos os materiais de um modelo carregado
// texKey: função (texture) → chave estável do arquivo de imagem (pra reaproveitar entre modelos)
export function kxify(root, mode = 'auto', texKey = () => null) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (done.has(m)) return;
      done.add(m);
      if (m.map) {
        const k = texKey(m.map) || 'tex:' + m.map.uuid;
        m.map = remapTexture(m.map, k, mode);
        const glow = glowCache.get(k + '|' + mode);
        if (glow && m.emissive && (mode === 'auto' || mode === 'amber')) { m.emissiveMap = glow; m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.35; }
      } else if (m.color) remapColor(m.color, mode);
      // cristais do trailer brilham (emissivo roxo)
      if (mode === 'crystal' && m.emissive && m.color) {
        const hsl = {}; m.color.getHSL(hsl);
        if (hsl.s > 0.4) { m.emissive.copy(m.color); m.emissiveIntensity = 0.9; }
      }
      // acabamento: metal fosco industrial
      if (m.roughness !== undefined) m.roughness = Math.max(0.45, m.roughness);
      if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.35);
      m.needsUpdate = true;
    });
  });
  return root;
}
