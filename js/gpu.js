// Diagnóstico da placa de vídeo: descobre qual GPU o navegador está usando pro WebGL.
// Muita gente com PC bom roda o jogo a ~10 fps porque o navegador está sem aceleração de hardware
// (desenhando pelo processador) ou usando a placa integrada em vez da dedicada. O jogo avisa e ensina a resolver.
import { game } from './state.js';
import { settings } from './settings.js';

export const gpu = { name: 'desconhecida', kind: 'ok' }; // kind: ok | software | integrada

export function detectGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu.name = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || 'desconhecida');
  } catch { /* sem WebGL? */ }
  const n = gpu.name.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/.test(n)) gpu.kind = 'software';
  else if (/intel|uhd|iris|hd graphics|radeon\(tm\) graphics|vega \d+ graphics|radeon graphics/.test(n) && !/nvidia|geforce|rtx|gtx|radeon rx|arc a/.test(n)) gpu.kind = 'integrada';
  return gpu;
}
// nome curtinho pro contador de FPS: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x2503) Direct3D11 vs_5_0…)" -> "NVIDIA GeForce RTX 3060"
export function shortGpu() {
  if (gpu.kind === 'software') return 'sem placa de vídeo (software)';
  let s = gpu.name;
  const m = /^ANGLE \((.*)\)$/.exec(s);
  if (m) {
    // separa "fabricante, placa, driver" respeitando os parênteses
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    s = parts[1] || parts[0];
  }
  return s.replace(/\(0x[0-9a-f]+\)/gi, '').replace(/\((R|TM)\)/gi, '').replace(/\s+(Direct3D|vs_|OpenGL|Metal).*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 48);
}

const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
const HOW_ACCEL = isFirefox
  ? '<li>Abra <code>about:preferences</code>, procure <b>Desempenho</b>, desmarque “Usar as configurações recomendadas” e marque <b>“Usar aceleração de hardware quando disponível”</b>.</li><li>Feche e abra o Firefox de novo.</li>'
  : '<li>Abra <code>chrome://settings/system</code> (ou <code>edge://settings/system</code> no Edge).</li><li>Ligue <b>“Usar aceleração de gráficos quando disponível”</b> e clique em <b>Reiniciar</b>.</li><li>Pra conferir: <code>chrome://gpu</code> deve mostrar “WebGL: Hardware accelerated”.</li>';
const HOW_DEDICATED = '<li>No Windows: <b>Configurações → Sistema → Tela → Gráficos</b>.</li><li>Escolha o navegador (Chrome/Edge/Firefox) → <b>Opções</b> → <b>Alto desempenho</b> (a placa NVIDIA/AMD) → Salvar.</li><li>Feche e abra o navegador de novo. No notebook, deixe na tomada.</li>';

let warned = false;
// chamado ao entrar no jogo: navegador sem aceleração = aviso na hora
export function warnGpuOnStart() {
  if (warned || gpu.kind !== 'software' || window.__noGpuWarn) return;
  warned = true;
  // espera outras janelas (tutorial, correio) fecharem pra não atropelar
  const show = () => {
    if (!document.getElementById('confirm').classList.contains('hidden') || game.ui.overlay || game.mode === 'menu') { setTimeout(show, 700); return; }
    showSoftwareWarning();
  };
  setTimeout(show, 1200);
}
function showSoftwareWarning() {
  game.ui.confirm('⚠️ O jogo está sem placa de vídeo', `<p>O navegador está desenhando o jogo pelo <b>processador</b> (<code>${escH(gpu.name)}</code>), por isso ele fica bem lento (uns 10 fps), mesmo num PC bom.</p>
    <p><b>Como resolver:</b></p><ol>${HOW_ACCEL}</ol><p class="muted">Depois disso o jogo deve rodar liso. Enquanto isso, a qualidade <b>Baixa</b> ajuda um pouco.</p>`,
  () => lowerQuality(), { yes: 'Usar qualidade Baixa por enquanto', no: 'Entendi' });
}

// vigia o FPS jogando: se ficar baixo por um tempo, explica o porquê e oferece baixar a qualidade
const watch = { t: 0, frames: 0, bad: 0 };
export function watchFps(dt) {
  if (window.__noGpuWarn) return;
  if (warned || game.mode !== 'play') { watch.t = 0; watch.frames = 0; return; }
  watch.t += dt; watch.frames++;
  if (watch.t < 6) return;
  const fps = watch.frames / watch.t;
  watch.t = 0; watch.frames = 0;
  watch.bad = fps < 25 ? watch.bad + 1 : 0;
  if (watch.bad < 2) return; // 12 s seguidos abaixo de 25 fps
  warned = true;
  const f = Math.round(fps);
  let why, how;
  if (gpu.kind === 'software') { why = 'o navegador está <b>sem aceleração de hardware</b> (desenhando pelo processador)'; how = HOW_ACCEL; }
  else if (gpu.kind === 'integrada') { why = `o navegador está usando a <b>placa integrada</b> (<code>${escH(shortGpu())}</code>). Se o seu PC tem placa NVIDIA/AMD, ela não está sendo usada`; how = HOW_DEDICATED; }
  else { why = `a placa <code>${escH(shortGpu())}</code> está com dificuldade nessa resolução`; how = '<li>Baixe a <b>Qualidade</b> (botão abaixo) ou o tamanho da janela.</li><li>Feche outras abas pesadas e confira se o navegador está atualizado.</li>'; }
  game.ui.confirm(`🐢 O jogo está a ${f} fps`, `<p>Parece que ${why}.</p><p><b>Como melhorar:</b></p><ol>${how}</ol><p class="muted">Dá pra ver o FPS e a placa usada em Configurações → Mostrar FPS.</p>`,
    () => lowerQuality(), { yes: settings.quality === 'baixa' ? 'Ok' : 'Baixar a qualidade', no: 'Agora não' });
}
function lowerQuality() {
  if (settings.quality === 'baixa') return;
  settings.quality = settings.quality === 'alta' ? 'media' : 'baixa';
  game.applyQualityUI?.();
  game.ui.toast(`Qualidade: ${settings.quality === 'media' ? 'Média' : 'Baixa'}. Dá pra mudar em Configurações.`);
}
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
