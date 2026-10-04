// Menu principal: painéis, navegação por teclado, terminal animado e câmera orbitando a fábrica.
import { game } from './state.js';
import { audio } from './audio.js';
import { saveInfo, deleteSave, SLOTS, currentSlot, setSlot, requestNewGame } from './save.js';
import { BIOMES, START_BIOMES, previewWorld, randomSeedText } from './terrain.js';
import { OBJECTIVES } from './data.js';
import { CELL } from './data.js';
import { heightAt } from './terrain.js';

const $ = (s) => document.querySelector(s);

const TAGLINES = [
  'pouse. colete. automatize. programe.',
  'while True: kx7.fabrica.turbo()',
  'júpiter está chegando perto.',
  'minério entra, placa reforçada sai.',
  'sem dinheiro. só itens e boas ideias.',
];

const TIPS = [
  'Segure <kbd>E</kbd> num veio pra <b>minerar na mão</b>, e numa árvore pra tirar <b>madeira e folhas</b>.',
  'Folhas, fibra e madeira viram <b>biomassa</b> na Bancada: é o combustível do primeiro gerador.',
  'A <b>seta laranja</b> no chão é a saída de cada máquina. As <b>azuis</b> são as entradas.',
  'Terreno inclinado? Coloque <b>🟫 Fundações</b> (Construção, tecla 2). <kbd>R</kbd> sobe o nível em 0,5 m.',
  'Um minerador normal faz <b>60 minérios/min</b>, e a esteira Mk1 também carrega 60/min. Mais que isso, use esteiras melhores.',
  'O <b>Juntador</b> mistura várias esteiras numa só. O <b>Separador</b> separa de novo, por filtro ou por código.',
  '<code>maquina("fornalha1").turbo(1.5)</code> deixa a fornalha 50% mais rápida enquanto o programa rodar.',
  'Veios <b>puros ⭐</b> rendem o dobro. Veios <b>impuros</b> rendem a metade. Procure no mapa (<kbd>Tab</kbd>).',
  'O <b>Cristal KX</b> só existe nos Campos de Cristal, e a <b>Luminita</b> só no Pântano Luminoso.',
  'De tempos em tempos <b>Júpiter</b> passa bem perto de KX-7: as noites ficam claras e os cristais brilham mais.',
  'À noite muitas plantas brilham. Algumas se encolhem quando você chega perto 🌿',
  'A <b>semente</b> do planeta (ex: KX-4471) gera sempre o mesmo mundo: mande pro seu amigo.',
  'Joga com <b>controle</b> 🎮? Só conectar e mexer a alavanca.',
];

const DEMO = [
  'forno = maquina("fornalha1")',
  'forno.receita("lingote_ferro")',
  'forno.ligar()',
  '',
  'while True:',
  '    forno.turbo(1.5)',
  '    if inventario("placa_ferro") < 100:',
  '        maquina("construtora1").ligar()',
  '    print("lingotes:", forno.saida())',
  '    esperar(5)',
];
// sequência de linhas executadas (linha, espera?)
const DEMO_RUN = [[1], [2], [3], [5], [6], [7], [8], [9], [10, 1], [5], [6], [7], [9], [10, 1]];

let panel = 'home';
let focusIdx = 0;
let startPlay = null;

export function initMenu(onPlay) {
  startPlay = onPlay;
  const items = [...document.querySelectorAll('#menu-nav .mi')];
  items.forEach((b, i) => {
    b.addEventListener('mouseenter', () => focus(i, false));
    b.addEventListener('click', () => activate(i));
  });
  $('#new-cancel').onclick = () => { showPanel('home'); focus(0, false); };
  $('#new-confirm').onclick = () => { deleteSave(); game.skipSave = true; location.replace(location.pathname); };
  initNewWorld();
  $('#menu-guide').onclick = () => game.ui.openOverlay('guide');
  // começa a música no primeiro clique no menu
  $('#menu').addEventListener('pointerdown', () => audio.start(), { once: true });
  addEventListener('keydown', (e) => {
    if (game.mode !== 'menu' || game.ui?.overlay) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); focus((focusIdx + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focus((focusIdx - 1 + items.length) % items.length); }
    if (e.key === 'Enter') { e.preventDefault(); audio.start(); activate(focusIdx); }
    if (e.key === 'Escape' && panel !== 'home') { showPanel('home'); focus(0, false); }
  });
  audio.onTrackChangeMenu = (t) => { $('#menu-track').textContent = '♪ ' + t.nome; };
  $('#menu-track').textContent = '♪ ' + audio.currentTrack().nome;
  typeLoop();
  termLoop();
  tipLoop();
  refreshMenu();
  focus(0, false);
}

function focus(i, sound = true) {
  const items = [...document.querySelectorAll('#menu-nav .mi')];
  if (items[i].style.display === 'none') i = (i + (i > focusIdx ? 1 : -1) + items.length) % items.length;
  focusIdx = i;
  items.forEach((b, j) => b.classList.toggle('focus', j === i));
  const p = items[i].dataset.panel;
  if (p && p !== 'newgame') showPanel(p);
  if (sound) audio.play('tick', { volume: 0.35 });
}

function activate(i) {
  const b = [...document.querySelectorAll('#menu-nav .mi')][i];
  audio.play('select', { volume: 0.5 });
  if (b.id === 'btn-play') {
    if (saveInfo() && !game.demoWorld) { startPlay && startPlay(); return; }
    showPanel('livre');
    return;
  }
  if (b.id === 'btn-story') { audio.play('deny', { volume: 0.5 }); showPanel('historia'); return; }
  if (b.id === 'btn-quit') { window.desktop?.quit(); return; }
  showPanel(b.dataset.panel);
}

function showPanel(p) {
  if (p === panel) return;
  panel = p;
  document.querySelectorAll('.mpanel').forEach((el) => el.classList.toggle('show', el.dataset.panel === p));
}

const fmtMoney = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtTime = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

export function openMenu() {
  refreshMenu();
  panel = null;
  showPanel('home');
  focus(0, false);
}

export function refreshMenu() {
  const info = saveInfo();
  $('#play-label').textContent = info ? 'Continuar' : 'Jogar';
  $('#play-sub').textContent = info ? `tier ${info.tier} · ${info.seed}` : 'escolher onde pousar';
  let n = 1;
  document.querySelectorAll('#menu-nav .mi').forEach((b) => {
    if (b.style.display !== 'none') b.querySelector('.mi-n').textContent = String(n++).padStart(2, '0');
  });
  $('#save-state').textContent = info ? 'online' : 'vazio';
  renderSlots();
  if (info) {
    const pct = Math.min(100, (info.objective / OBJECTIVES.length) * 100);
    const B = BIOMES[info.start] || BIOMES.floresta;
    $('#save-card').innerHTML = `
      <div class="save-grid">
        <div><span>tier</span><b class="amber">${info.tier}</b></div>
        <div><span>marcos</span><b>${info.milestones}</b></div>
        <div><span>tempo</span><b>${fmtTime(info.time)}</b></div>
        <div><span>máquinas</span><b>${info.machines}</b></div>
        <div><span>esteiras</span><b>${info.belts}</b></div>
        <div><span>planeta</span><b>${info.seed}</b></div>
      </div>
      <div class="progress-line"><i style="width:${pct}%"></i></div>
      <div class="muted" style="margin-top:6px;font-size:12px">${B.icone} pouso: ${B.nome}${info.phase ? ` · 🚀 fase ${info.phase}` : ''} · objetivos ${Math.min(info.objective, OBJECTIVES.length)}/${OBJECTIVES.length}</div>`;
    void fmtMoney;
  } else {
    $('#save-card').innerHTML = `<div class="save-empty">Nenhuma fábrica ainda.<br>Aperte <b>02 · Modo Livre</b> pra escolher onde pousar em KX-7.</div>`;
  }
}

// as 3 fábricas (saves)
function renderSlots() {
  const cur = currentSlot();
  $('#save-title').textContent = `// fábrica ${cur}`;
  $('#slots').innerHTML = SLOTS.map((n) => {
    const i = saveInfo(n);
    const desc = i ? `tier ${i.tier} · ${i.seed}<br>${i.machines} máquinas · ${fmtTime(i.time)}` : '<span class="muted">vazia</span>';
    const btns = n === cur ? '<button disabled>▶ esta</button>' : `<button data-open="${n}">${i ? 'Abrir' : 'Começar'}</button>${i ? `<button data-del="${n}" class="danger">Apagar</button>` : ''}`;
    return `<div class="slot-card ${n === cur ? 'cur' : ''}"><b>Fábrica ${n}</b><div>${desc}</div><div class="row">${btns}</div></div>`;
  }).join('');
  $('#slots').querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = () => { game.skipSave = false; import('./save.js').then((m) => { m.saveGame(); setSlot(+b.dataset.open); game.skipSave = true; location.replace(location.pathname); }); };
  });
  $('#slots').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => { if (confirm(`Apagar a Fábrica ${b.dataset.del}? Não dá pra desfazer.`)) { deleteSave(+b.dataset.del); renderSlots(); audio.play('remove', { volume: 0.5 }); } };
  });
}

// digitação do subtítulo
function typeLoop() {
  const el = $('#typed');
  let li = 0, ci = 0, del = false;
  const step = () => {
    const txt = '> ' + TAGLINES[li];
    if (!del) {
      ci++;
      el.textContent = txt.slice(0, ci);
      if (ci >= txt.length) { del = true; return setTimeout(step, 2600); }
      return setTimeout(step, 45 + Math.random() * 50);
    }
    ci -= 2;
    el.textContent = txt.slice(0, Math.max(2, ci));
    if (ci <= 2) { del = false; ci = 2; li = (li + 1) % TAGLINES.length; return setTimeout(step, 400); }
    setTimeout(step, 18);
  };
  step();
}

// terminal mostrando Jiboia rodando devagar
function termLoop() {
  const term = $('#term'), out = $('#term-out');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const hl = (s) => esc(s)
    .replace(/(".*?")/g, '<span class="t-str">$1</span>')
    .replace(/\b(while|if|True)\b/g, '<span class="t-kw">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="t-num">$1</span>')
    .replace(/\.(\w+)\(/g, '.<span class="t-meth">$1</span>(')
    .replace(/\b(maquina|print)\(/g, '<span class="t-fn">$1</span>(');
  term.innerHTML = DEMO.map((l, i) => `<div class="ln"><span class="n">${i + 1}</span><span>${hl(l) || ' '}</span></div>`).join('');
  const lines = [...term.children];
  let k = 0, money = 0;
  const logs = [];
  const tick = () => {
    const [ln, wait] = DEMO_RUN[k % DEMO_RUN.length];
    lines.forEach((el, i) => { el.classList.toggle('cur', i === ln - 1 && !wait); el.classList.toggle('wait', i === ln - 1 && !!wait); });
    if (ln === 9) {
      const g = +(9 + Math.random() * 6).toFixed(1);
      money += g;
      logs.push(`lingotes: ${Math.round(g)}   (feitos ${Math.round(money)})`);
      if (logs.length > 2) logs.shift();
      out.innerHTML = logs.map((l) => `<div>${l}</div>`).join('');
    }
    k++;
    setTimeout(tick, wait ? 1300 : 520);
  };
  tick();
}

function tipLoop() {
  const el = $('#tip'), n = $('#tip-n');
  let i = Math.floor(Math.random() * TIPS.length);
  const show = () => {
    el.style.opacity = 0;
    setTimeout(() => {
      el.innerHTML = TIPS[i];
      n.textContent = String(i + 1).padStart(2, '0');
      el.style.opacity = 1;
      i = (i + 1) % TIPS.length;
    }, 350);
  };
  show();
  setInterval(show, 7000);
}

// câmera passeando em volta da fábrica enquanto o menu está aberto
let orbitT = Math.random() * 10;
export function updateMenuCamera(dt) {
  const cam = game.camera;
  orbitT += dt * 0.045;
  // centro: média das máquinas (ou o meio do mapa)
  const s = game.spawn || { x: 0, z: 0 };
  let cx = s.x, cz = s.z, n = 0;
  for (const e of game.entities) { cx += e.pos.x; cz += e.pos.z; n++; }
  if (n) { cx /= n + 1; cz /= n + 1; }
  const r = (n ? 18 : 30) + Math.sin(orbitT * 0.7) * 4;
  const px = cx + Math.cos(orbitT) * r, pz = cz + Math.sin(orbitT) * r;
  const gy = Math.max(heightAt(px, pz), heightAt(cx, cz));
  cam.position.set(px, gy + (n ? 8 : 11) + Math.sin(orbitT * 0.5) * 1.5, pz);
  cam.lookAt(cx - Math.sin(orbitT) * 6, heightAt(cx, cz) + 1.5, cz + Math.cos(orbitT) * 6);
}


// ─── Modo Livre: escolher a área de pouso e a semente ───
let nwStart = 'floresta', nwT = null;
function initNewWorld() {
  const seedIn = $('#nw-seed');
  seedIn.value = randomSeedText();
  const RES = {
    floresta: ['Ferro', 'Cobre', 'Calcário', 'Carvão', 'Madeira'],
    canion: ['Ferro puro', 'Cobre', 'Quartzo', 'Fibra'],
    tundra: ['Carvão', 'Calcário', 'Ferro', 'Quartzo'],
  };
  const cards = () => {
    $('#nw-areas').innerHTML = START_BIOMES.map((b) => {
      const B = BIOMES[b];
      return `<button class="nw-area ${nwStart === b ? 'on' : ''}" data-b="${b}"><span class="nw-ic">${B.icone}</span><b>${B.nome}</b><em>${B.dificuldade}</em><small>${B.desc}</small><span class="nw-res">${RES[b].map((r) => `<i>${r}</i>`).join('')}</span></button>`;
    }).join('');
    $('#nw-areas').querySelectorAll('.nw-area').forEach((c) => { c.onclick = () => { nwStart = c.dataset.b; audio.play('select', { volume: 0.4 }); cards(); drawPreview(); }; });
  };
  cards();
  seedIn.oninput = () => { clearTimeout(nwT); nwT = setTimeout(drawPreview, 350); };
  $('#nw-dice').onclick = () => { seedIn.value = randomSeedText(); audio.play('tick', { volume: 0.5 }); drawPreview(); };
  $('#nw-go').onclick = () => {
    const seed = seedIn.value.trim() || randomSeedText();
    const info = saveInfo();
    if (info && !confirm(`Isso apaga a Fábrica ${currentSlot()} (tier ${info.tier}, planeta ${info.seed}) e pousa num planeta novo. Continuar?`)) return;
    audio.play('levelup', { volume: 0.6 });
    requestNewGame({ seed, start: nwStart });
    game.skipSave = true;
    $('#nw-go').textContent = '🚀 Preparando o pouso…';
    setTimeout(() => location.replace(location.pathname), 250);
  };
  drawPreview();
}
let lastPrev = '';
function drawPreview() {
  const seed = $('#nw-seed').value.trim() || 'KX-0001';
  const key = seed;
  const c = $('#nw-canvas'), g = c.getContext('2d');
  if (key !== lastPrev) {
    lastPrev = key;
    const p = previewWorld(seed, c.width);
    const img = g.createImageData(p.size, p.size);
    img.data.set(p.img);
    c._img = img; c._p = p;
  }
  g.putImageData(c._img, 0, 0);
  const p = c._p;
  // os 5 biomas e as 3 áreas de pouso
  g.font = '600 11px Barlow, sans-serif';
  g.textAlign = 'center';
  for (const s of p.sites) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(BIOMES[s.b].icone, s.u * c.width, s.v * c.height + 4); }
  for (const [b, s] of Object.entries(p.spots)) {
    const x = s.u * c.width, y = s.v * c.height, on = b === nwStart;
    g.beginPath(); g.arc(x, y, on ? 7 : 4.5, 0, Math.PI * 2);
    g.fillStyle = on ? '#ffae34' : 'rgba(255,255,255,.75)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#05080c'; g.stroke();
    if (on) { g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.strokeStyle = '#ffae34'; g.stroke(); }
  }
  $('#nw-legend').innerHTML = `<b>${seed}</b> · ⬤ ${BIOMES[nwStart].nome}`;
  $('#nw-slot').textContent = `fábrica ${currentSlot()}`;
}
