// Janelas: pesquisa, projeto foguete, estatísticas/placar/conquistas e mapa visto de cima.
import { game } from './state.js';
import { TECHS, PHASES, ITEMS, ACHIEVEMENTS, REGIONS, MACHINES, CELL, WORLD_MIN, WORLD_MAX, GRID_MIN, GRID_MAX, ORES, INF_TECHS, infCost } from './data.js';
import { renderSpace } from './space.js';
import { renderDisks } from './disks.js';
import { Lab } from './machines2.js';
import { thumbs } from './thumbs.js';
import { audio } from './audio.js';
import { ores, purity, findByName, itemName } from './machines.js';
import { wires } from './power.js';
import { structures, edgeSegment } from './structures.js';
import { PIECES, MATERIALS } from './data.js';

const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const icon = (k) => `<img class="ic" src="${thumbs['item:' + k] || ''}" alt="">`;

// ─────────────── Pesquisa ───────────────
export function renderResearch(el, lab) {
  const eco = game.economy;
  const tiers = [0, 1, 2];
  const busy = new Set(game.entities.filter((e) => e.type === 'laboratorio' && e !== lab && e.research).map((e) => e.research));
  el.innerHTML = `
    <div class="rs-head">
      <div><b>${lab.name}</b> · ${lab.research ? `pesquisando <b class="amber">${Lab.nameOf(lab.research)}</b> (${Math.round(lab.percent() * 100)}%)` : 'escolha uma pesquisa e mande os itens por esteira'}</div>
      <div class="muted">${eco.techs.length}/${Object.keys(TECHS).length} pesquisas · fase do foguete: ${Math.min(eco.phase, PHASES.length)}/${PHASES.length} · 💾 ${eco.disks}</div>
      ${lab.research ? '<button class="primary" id="rs-deliver">📦 Entregar do inventário</button>' : ''}
    </div>
    <div class="rs-tree">${tiers.map((f) => `
      <div class="rs-col">
        <div class="rs-col-h">${f === 0 ? 'Desde já' : `Fase ${f} do foguete`}${eco.phase < f ? ' 🔒' : ''}</div>
        ${Object.entries(TECHS).filter(([, t]) => t.fase === f).map(([id, t]) => {
    const done = eco.hasTech(id);
    const why = eco.techBlocked(id);
    const cur = lab.research === id;
    const cls = done ? 'done' : cur ? 'cur' : why ? 'locked' : busy.has(id) ? 'busy' : 'avail';
    const cost = Object.entries(t.custo).map(([k, n]) => `<span class="rs-cost">${icon(k)}${cur ? `${Math.min(n, lab.progress[k] || 0)}/` : ''}${n}</span>`).join('');
    return `<button class="rs-node ${cls}" data-id="${id}" ${done || (why && !cur) || busy.has(id) ? 'disabled' : ''}>
            <div class="rs-top"><span class="rs-ic">${t.icone}</span><b>${t.nome}</b></div>
            <div class="rs-desc">${t.desc}</div>
            <div class="rs-costs">${done ? '<span class="good">✔ pesquisado</span>' : cost}</div>
            ${cur ? `<div class="rs-bar"><i style="width:${lab.percent() * 100}%"></i></div>` : ''}
            ${!done && why && !cur ? `<div class="rs-why">${why}</div>` : ''}
            ${busy.has(id) ? '<div class="rs-why">em outro laboratório</div>' : ''}
          </button>`;
  }).join('')}
      </div>`).join('')}
    </div>
    <div id="rs-disks"></div>
    <p class="muted" style="margin:10px 4px 0">Entregue os itens pelo botão (do seu inventário) ou por esteira, por qualquer lado. Ele só aceita o que a pesquisa pede. Trocar de pesquisa perde o que já foi entregue.</p>`;
  const dv = el.querySelector('#rs-deliver');
  if (dv) dv.onclick = () => { const n = lab.deliverFromPlayer(); audio.play(n ? 'drop' : 'deny', { volume: 0.5 }); renderResearch(el, lab); };
  renderDisks(el.querySelector('#rs-disks'), () => renderResearch(el, lab));
  el.querySelectorAll('.rs-node.avail, .rs-node.cur').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id;
      if (lab.research === id) return;
      if (lab.research && lab.percent() > 0 && !confirm('Trocar de pesquisa? O que já foi entregue será perdido.')) return;
      const why = lab.setResearch(id);
      if (why) { game.ui.toast(why, 'warn'); audio.play('deny'); return; }
      audio.play('select', { volume: 0.6 });
      renderResearch(el, lab);
    };
  });
}

// ─────────────── Projeto Foguete ───────────────
export function renderPlatform(el) {
  const eco = game.economy;
  const pl = game.platform;
  if (eco.launched) { el.innerHTML = '<div class="card-x"><div class="card-h"><span>// Projeto Foguete</span><b>concluído</b></div><p>🚀 O foguete foi lançado. KX-7 é todo seu: continue construindo, explorando e programando.</p></div>'; return; }
  el.innerHTML = `
    <div class="pf-phases">${PHASES.map((p, i) => {
    const st = i < eco.phase ? 'done' : i === eco.phase ? 'cur' : 'next';
    return `<div class="pf-step ${st}"><span>${i + 1}</span><b>${p.nome}</b></div>`;
  }).join('<i class="pf-line"></i>')}</div>
    ${(() => {
    const p = PHASES[eco.phase];
    if (!p) return '';
    const rows = Object.entries(p.itens).map(([k, n]) => {
      const have = Math.min(n, eco.phaseProgress[k] || 0);
      return `<div class="pf-row">${icon(k)}<div class="pf-name">${ITEMS[k].nome}<small><code>"${k}"</code></small></div>
          <div class="pf-bar"><i style="width:${(have / n) * 100}%"></i></div><div class="pf-n">${have}/${n}</div></div>`;
    }).join('');
    return `<div class="card-x pf-card">
        <div class="card-h"><span>// fase ${eco.phase + 1} · ${p.nome}</span><b>${p.libera ? 'libera ' + p.libera : 'lançamento'}</b></div>
        <p class="muted" style="margin-top:0">${p.desc} Leve os itens por esteira até qualquer lado da plataforma (3×3) ou entregue direto do inventário.</p>
        ${rows}
        <div class="row"><button id="pf-deliver" class="primary">📦 Entregar do inventário</button>
        ${p.final ? `<button id="pf-launch" class="big" ${pl.readyToLaunch() ? '' : 'disabled'}>🚀 Lançar foguete</button>` : ''}</div>
      </div>`;
  })()}`;
  const b = el.querySelector('#pf-launch');
  if (b) b.onclick = () => { pl.launch(); game.ui.closeOverlay(); };
  const dv = el.querySelector('#pf-deliver');
  if (dv) dv.onclick = () => { const n = pl.deliverFromPlayer(); audio.play(n ? 'drop' : 'deny', { volume: 0.5 }); renderPlatform(el); };
}

// ─────────────── Estatísticas ───────────────
let statsTab = 'geral';
export function renderStats(el, tab) {
  if (tab) statsTab = tab;
  const eco = game.economy;
  const visibleItems = Object.keys(ITEMS).filter((k) => !ITEMS[k].oculto);
  const found = visibleItems.filter((k) => eco.discovered(k)).length;
  const achs = ACHIEVEMENTS.filter((a) => !a.oculto);
  const tabs = [['geral', 'Visão geral'], ['placar', 'Placar'], ['conquistas', `Conquistas ${eco.achievements.length}/${achs.length}`], ['album', `Álbum ${found}/${visibleItems.length}`], ['producao', 'Produção']];
  el.innerHTML = `<div class="st-tabs">${tabs.map(([k, n]) => `<button class="shop-tab ${statsTab === k ? 'active' : ''}" data-t="${k}">${n}</button>`).join('')}</div><div id="st-body"></div>`;
  el.querySelectorAll('.st-tabs button').forEach((b) => { b.onclick = () => { renderStats(el, b.dataset.t); audio.play('click', { volume: 0.4 }); }; });
  const body = el.querySelector('#st-body');
  if (statsTab === 'geral') {
    const s = eco.series;
    const last = s.slice(-30);
    const total = Object.values(eco.stats.produced).reduce((a, b) => a + b, 0);
    const ipm = last.length ? Math.round((last.reduce((a, b) => a + b.items, 0) / (last.length * 10)) * 60) : 0;
    body.innerHTML = `
      <div class="st-kpis">
        <div><span>tier</span><b>${eco.tier}</b></div>
        <div><span>marcos</span><b>${eco.milestones.length}</b></div>
        <div><span>itens/min (5 min)</span><b class="amber">${fmt(ipm)}</b></div>
        <div><span>itens produzidos</span><b>${fmt(total)}</b></div>
        <div><span>tempo de jogo</span><b>${Math.floor(game.time / 60)} min</b></div>
        <div><span>minério na mão</span><b>${fmt(eco.stats.handMined || 0)}</b></div>
        <div><span>plantas coletadas</span><b>${fmt(eco.stats.collected || 0)}</b></div>
        <div><span>fundações</span><b>${fmt(eco.stats.foundations || 0)}</b></div>
      </div>
      <div class="st-chart"><div class="card-h"><span>// itens produzidos a cada 10 s</span><b>itens</b></div><canvas id="ch-items" width="900" height="170"></canvas></div>
      <div class="st-chart"><div class="card-h"><span>// energia: gerada × usada</span><b>⚡</b></div><canvas id="ch-power" width="900" height="140"></canvas></div>`;
    lineChart(body.querySelector('#ch-items'), s, [['items', '#3ee6b8']], true);
    lineChart(body.querySelector('#ch-power'), s, [['supply', '#ffcf5c'], ['demand', '#ff5a6e']]);
    void last;
  } else if (statsTab === 'placar') {
    const pcs = game.entities.filter((e) => e.type === 'computador').sort((a, b) => (b.board.moneyMin + b.board.itemsMin * 5) - (a.board.moneyMin + a.board.itemsMin * 5));
    body.innerHTML = `<p class="muted">Medalhas pelo último minuto: 🥉 4+ itens/min · 🥈 12+ itens/min · 🥇 30+ itens/min. Menos instruções por item = código mais eficiente.</p>
      <table class="market board"><tr><th>#</th><th>Computador</th><th>Medalha</th><th>Itens/min</th><th>Instr/item</th><th>Status</th></tr>
      ${pcs.map((p, i) => `<tr><td>${i + 1}</td><td><b>${p.name}</b></td><td style="font-size:22px">${p.medalIcon || '—'}</td><td>${p.board.itemsMin}</td><td>${p.board.instrPerItem || '—'}</td><td class="muted">${p.statusText}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum computador ainda.</td></tr>'}</table>`;
  } else if (statsTab === 'conquistas') {
    body.innerHTML = `<div class="ach-grid">${ACHIEVEMENTS.filter((a) => !a.oculto).map((a) => {
      const ok = eco.achievements.includes(a.id);
      return `<div class="ach ${ok ? 'ok' : ''}"><span class="ach-ic">${ok ? a.icone : '🔒'}</span><b>${a.nome}</b><small>${a.desc}</small></div>`;
    }).join('')}</div>`;
  } else if (statsTab === 'album') {
    body.innerHTML = `<p class="muted">Cada item que você fabrica, coleta ou minera entra no álbum.</p>
      <div class="al-grid">${visibleItems.map((k) => {
    const ok = eco.discovered(k);
    return `<div class="al-card ${ok ? 'ok' : ''}">${ok ? icon(k) : '<span class="al-q">?</span>'}<b>${ok ? ITEMS[k].nome : '???'}</b><small>${ok ? `feitos ${fmt(eco.stats.produced[k] || 0)} · no inventário ${fmt(eco.count(k))}` : 'ainda não descoberto'}</small></div>`;
  }).join('')}</div>`;
  } else {
    const p = eco.stats.produced;
    body.innerHTML = `<table class="market"><tr><th></th><th>Item</th><th>Produzidos</th><th>No inventário</th></tr>
      ${visibleItems.filter((k) => p[k] || eco.count(k)).map((k) => `<tr><td>${icon(k)}</td><td><b>${ITEMS[k].nome}</b></td><td>${fmt(p[k] || 0)}</td><td>${fmt(eco.count(k))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nada produzido ainda.</td></tr>'}</table>`;
  }
}

function lineChart(c, series, keys, fill) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(58,74,99,.35)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (H / 4) * i); g.lineTo(W, (H / 4) * i); g.stroke(); }
  if (series.length < 2) {
    g.fillStyle = '#5b6679'; g.font = '14px "JetBrains Mono", monospace'; g.fillText('juntando dados… (uma amostra a cada 10 s)', 16, H / 2);
    return;
  }
  const mx = Math.max(1, ...series.flatMap((s) => keys.map(([k]) => s[k] || 0)));
  g.fillStyle = '#5b6679'; g.font = '12px "JetBrains Mono", monospace'; g.fillText(fmt(mx), 6, 14);
  for (const [k, col] of keys) {
    g.beginPath();
    series.forEach((s, i) => {
      const x = (i / (series.length - 1)) * (W - 10) + 5;
      const y = H - 6 - ((s[k] || 0) / mx) * (H - 22);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = col; g.lineWidth = 2.2; g.stroke();
    if (fill) {
      g.lineTo(W - 5, H - 6); g.lineTo(5, H - 6); g.closePath();
      g.fillStyle = col + '22'; g.fill();
    }
  }
}

// ─────────────── Mapa visto de cima ───────────────
const TYPE_COLOR = {
  esteira: '#4a5570', esteira_alta: '#6a7aa0', rampa_sobe: '#6a7aa0', rampa_desce: '#6a7aa0', sensor: '#3ee6b8',
  divisor: '#3ee6b8', juntador: '#ffcf5c', minerador: '#6cb8ff', fornalha: '#ff8a3a', montadora: '#b39bff', separador: '#ff6ec7',
  venda: '#ffb020', bau: '#c0643c', computador: '#3ee6b8', gerador: '#ffd84a', gerador_grande: '#ffd84a', gerador_carvao: '#ffd84a',
  painel_solar: '#8fb8ff', poste: '#ffa640', laboratorio: '#6cf5ff', doca_drones: '#9fd8ff', lampada: '#fff4a0', tela: '#9fa8c0',
  altofalante: '#9fa8c0', lixeira: '#7a6a5a', canteiro: '#6aa84a', irrigador: '#6cb8ff', deposito: '#b98352', braco: '#ff9a4a', doca_entrega: '#c9a77a',
};
const ORE_COLOR = { ferro: '#9fb4d6', cobre: '#e8844a', quartzo: '#f3c4ff', carvao: '#555566', estelar: '#b18cff' };
const mapView = { zoom: 1, cx: 0, cz: 0, drag: null };
export function renderMap(el) {
  if (!el.querySelector('canvas')) {
    el.innerHTML = `<div class="map-wrap"><canvas id="mapc" width="1100" height="720"></canvas>
      <div class="map-legend">${Object.entries(ORE_COLOR).map(([k, c]) => `<span><i style="background:${c}"></i>${ORES[k].nome}</span>`).join('')}
      <span><i style="background:#ffb020"></i>venda</span><span><i style="background:#3ee6b8"></i>computador</span><span><i style="background:#ffd84a"></i>energia</span>
      <span class="muted">bolinha grande com borda = veio puro (2×), pequena = impuro (½×)</span><span class="muted">roda do mouse: zoom · arrastar: mover · Tab fecha</span></div></div>`;
    const c = el.querySelector('canvas');
    c.addEventListener('wheel', (e) => { e.preventDefault(); mapView.zoom = Math.max(0.6, Math.min(5, mapView.zoom * (e.deltaY < 0 ? 1.15 : 0.87))); drawMap(c); }, { passive: false });
    c.addEventListener('mousedown', (e) => { mapView.drag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cz: mapView.cz }; });
    addEventListener('mouseup', () => { mapView.drag = null; });
    c.addEventListener('mousemove', (e) => {
      if (!mapView.drag) return;
      const s = scaleOf(c);
      mapView.cx = mapView.drag.cx - (e.clientX - mapView.drag.x) * (c.width / c.clientWidth) / s;
      mapView.cz = mapView.drag.cz - (e.clientY - mapView.drag.y) * (c.height / c.clientHeight) / s;
      drawMap(c);
    });
    const p = game.camera.position;
    mapView.cx = p.x / CELL; mapView.cz = p.z / CELL;
  }
  drawMap(el.querySelector('canvas'));
}
const scaleOf = (c) => (Math.min(c.width, c.height) / (WORLD_MAX - WORLD_MIN + 1)) * mapView.zoom;
function drawMap(c) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height, s = scaleOf(c);
  const X = (cx) => W / 2 + (cx - mapView.cx) * s, Z = (cz) => H / 2 + (cz - mapView.cz) * s;
  g.fillStyle = '#0b1017'; g.fillRect(0, 0, W, H);
  // mundo
  g.fillStyle = '#1b2a1c'; g.fillRect(X(WORLD_MIN), Z(WORLD_MIN), (WORLD_MAX - WORLD_MIN + 1) * s, (WORLD_MAX - WORLD_MIN + 1) * s);
  for (const [id, r] of Object.entries(REGIONS)) {
    const own = game.economy.hasRegion(id);
    g.fillStyle = own ? '#22362a' : 'rgba(8,11,16,.55)';
    g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0 + 1) * s, (r.z1 - r.z0 + 1) * s);
    if (!own) {
      g.strokeStyle = '#ffb02066'; g.setLineDash([6, 6]); g.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0 + 1) * s, (r.z1 - r.z0 + 1) * s); g.setLineDash([]);
      g.fillStyle = '#ffb020'; g.font = `600 ${Math.max(11, 13 * mapView.zoom)}px "Barlow", sans-serif`; g.textAlign = 'center';
      g.fillText(`🔒 ${r.nome} · $ ${fmt(r.preco)}`, X((r.x0 + r.x1 + 1) / 2), Z((r.z0 + r.z1 + 1) / 2));
      g.textAlign = 'left';
    }
  }
  g.fillStyle = '#24372a'; g.fillRect(X(GRID_MIN), Z(GRID_MIN), (GRID_MAX - GRID_MIN + 1) * s, (GRID_MAX - GRID_MIN + 1) * s);
  g.fillStyle = '#2d2f4a'; g.fillRect(X(-12), Z(-12), 24 * s, 24 * s); // piso
  g.fillStyle = '#34364f'; g.fillRect(X(-9), Z(13), 18 * s, 6 * s); // escritório
  if (s > 6) { g.strokeStyle = 'rgba(255,255,255,.05)'; for (let x = WORLD_MIN; x <= WORLD_MAX + 1; x++) { g.beginPath(); g.moveTo(X(x), Z(WORLD_MIN)); g.lineTo(X(x), Z(WORLD_MAX + 1)); g.stroke(); } for (let z = WORLD_MIN; z <= WORLD_MAX + 1; z++) { g.beginPath(); g.moveTo(X(WORLD_MIN), Z(z)); g.lineTo(X(WORLD_MAX + 1), Z(z)); g.stroke(); } }
  // veios
  for (const [k, t] of ores) {
    const [x, z] = k.split(',').map(Number);
    const pu = purity.get(k) || 'normal';
    g.fillStyle = ORE_COLOR[t]; g.beginPath(); g.arc(X(x + 0.5), Z(z + 0.5), Math.max(2.5, s * (pu === 'puro' ? 0.55 : pu === 'impuro' ? 0.3 : 0.45)), 0, Math.PI * 2); g.fill();
    if (pu === 'puro') { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
  }
  // plataforma
  g.fillStyle = '#ffffff22'; g.strokeStyle = '#ffb020'; g.lineWidth = 2;
  g.fillRect(X(-1), Z(-22), 3 * s, 3 * s); g.strokeRect(X(-1), Z(-22), 3 * s, 3 * s);
  g.fillStyle = '#ffb020'; g.font = `${Math.max(12, s * 1.2)}px sans-serif`; g.fillText('🚀', X(-0.5), Z(-19.6));
  // pisos, tetos e paredes construídos
  for (const st of structures.values()) {
    if (st.kind !== 'peca') continue;
    const col = '#' + (st.paint ?? MATERIALS[st.mat].cor).toString(16).padStart(6, '0');
    if (PIECES[st.piece].borda) {
      const sg = edgeSegment(st);
      g.strokeStyle = col; g.lineWidth = Math.max(2, s * 0.18);
      g.beginPath(); g.moveTo(X(sg.ax / CELL), Z(sg.az / CELL)); g.lineTo(X(sg.bx / CELL), Z(sg.bz / CELL)); g.stroke();
    } else {
      g.fillStyle = col + (PIECES[st.piece].alto ? '30' : '55');
      g.fillRect(X(st.x), Z(st.z), s, s);
    }
  }
  // cabos
  g.strokeStyle = '#ffa64088'; g.lineWidth = 1.2;
  for (const w of wires) { g.beginPath(); g.moveTo(X(w.a.x + 0.5), Z(w.a.z + 0.5)); g.lineTo(X(w.b.x + 0.5), Z(w.b.z + 0.5)); g.stroke(); }
  // entidades
  for (const e of game.entities) {
    const col = TYPE_COLOR[e.type] || '#8b95a8';
    const x = X(e.x), z = Z(e.z);
    if (['esteira', 'esteira_alta', 'rampa_sobe', 'rampa_desce', 'sensor'].includes(e.type)) {
      g.fillStyle = col; g.fillRect(x + s * 0.1, z + s * 0.1, s * 0.8, s * 0.8);
      if (s > 5) { // setinha
        const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][e.dir];
        g.strokeStyle = '#ffcf5c'; g.lineWidth = 1.5; g.beginPath();
        g.moveTo(x + s / 2 - d[0] * s * 0.25, z + s / 2 - d[1] * s * 0.25); g.lineTo(x + s / 2 + d[0] * s * 0.3, z + s / 2 + d[1] * s * 0.3); g.stroke();
      }
    } else {
      g.fillStyle = col; g.fillRect(x + s * 0.05, z + s * 0.05, s * 0.9, s * 0.9);
      if (MACHINES[e.type]?.energia && e.noPower) { g.strokeStyle = '#ff5a6e'; g.lineWidth = 2; g.strokeRect(x + s * 0.05, z + s * 0.05, s * 0.9, s * 0.9); }
    }
    if (e.name && s > 9) { g.fillStyle = '#ece5d5'; g.font = '10px "JetBrains Mono", monospace'; g.fillText(e.name, x, z - 2); }
  }
  for (const d of game.drones || []) { g.fillStyle = '#9fd8ff'; g.beginPath(); g.arc(X(d.p.x / CELL), Z(d.p.z / CELL), Math.max(3, s * 0.35), 0, Math.PI * 2); g.fill(); }
  // pedrinhas de meteorito e o TÊTÊ
  for (const pk of game.events?.pickups || []) { g.fillStyle = '#b18cff'; g.beginPath(); g.arc(X(pk.x / CELL), Z(pk.z / CELL), Math.max(2.5, s * 0.25), 0, Math.PI * 2); g.fill(); }
  if (game.pet?.obj.visible) { g.fillStyle = '#ff6ec7'; g.font = `${Math.max(12, s)}px sans-serif`; g.fillText('🤖', X(game.pet.p.x / CELL) - 6, Z(game.pet.p.z / CELL) + 5); }
  // jogador
  const p = game.camera.position;
  const fwd = { x: -Math.sin(game.camera.rotation.y), z: -Math.cos(game.camera.rotation.y) };
  const px = X(p.x / CELL), pz = Z(p.z / CELL);
  g.fillStyle = '#ff5a6e'; g.beginPath();
  g.moveTo(px + fwd.x * 12, pz + fwd.z * 12); g.lineTo(px - fwd.z * 6 - fwd.x * 5, pz + fwd.x * 6 - fwd.z * 5); g.lineTo(px + fwd.z * 6 - fwd.x * 5, pz - fwd.x * 6 - fwd.z * 5); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
}

// ─────────────── TÊTÊ: humor e tarefas ───────────────
export function renderPet(el) {
  const pet = game.pet;
  if (!pet || !pet.obj.visible) { el.innerHTML = '<p class="muted">O TÊTÊ está desligado nas Configurações.</p>'; return; }
  const ripe = game.entities.filter((e) => e.type === 'canteiro' && e.ready).length;
  const rocks = (game.events?.pickups || []).length;
  const sources = game.entities.filter((e) => e.isMachine && e.name && (e.type === 'bau' || e.type === 'venda' || e.out?.length || e.type === 'canteiro'));
  const targets = game.entities.filter((e) => e.isMachine && e.name && e.canAccept && !['computador', 'gerador', 'gerador_grande', 'poste'].includes(e.type));
  const opt = (list) => list.map((e) => `<option value="${e.name}">${e.name}</option>`).join('');
  const t = pet.task;
  const taskText = !t ? 'Nenhuma: tô livre! 😊' : t.tipo === 'colher' ? `🧺 Colhendo a horta (${t.done} feitos)` : t.tipo === 'meteoritos' ? `☄️ Buscando meteoritos (${t.done})` : `📦 Levando ${t.item ? itemName(t.item) : 'itens'} de ${t.from} pra ${t.to} (${t.done}/${t.n})`;
  el.innerHTML = `
  <div class="pet-win">
    <div class="pet-top">
      <img src="${thumbs.estatua || ''}" alt="">
      <div>
        <div class="pet-name">TÊTÊ <span class="muted">· pug espacial de KX-7</span></div>
        <div class="pet-mood">Humor: <b>${pet.moodText}</b></div>
        <div class="progress-line pet-bar"><i style="width:${Math.round(pet.mood * 100)}%"></i></div>
        <div class="muted" style="font-size:12.5px">Carinho (<kbd>E</kbd> nele) e tarefas deixam ele feliz. Ele comemora quando a fábrica bate recorde 🏆</div>
      </div>
    </div>
    <div class="row">
      <button id="pet-carinho" class="primary">💜 Carinho</button>
      <button id="pet-seguir" class="${pet.mode === 'seguir' ? 'on' : ''}">🐾 Me seguir</button>
      <button id="pet-ficar" class="${pet.mode === 'ficar' ? 'on' : ''}">🧍 Ficar aqui</button>
    </div>
    <div class="card-x pet-task"><div class="card-h"><span>// tarefa atual</span>${t ? '<button id="pet-cancel" class="mini">cancelar</button>' : ''}</div><div>${taskText}</div></div>
    <div class="pet-tasks">
      <button data-t="colher" ${ripe ? '' : 'disabled'}>🧺 Colher a horta <small>${ripe} canteiro(s) pronto(s)</small></button>
      <button data-t="meteoritos" ${rocks ? '' : 'disabled'}>☄️ Buscar meteoritos <small>${rocks} no chão</small></button>
    </div>
    <div class="card-x">
      <div class="card-h"><span>// 📦 levar itens</span></div>
      <div class="pet-fetch">
        <label>De <select id="pet-from">${opt(sources)}</select></label>
        <label>Item <select id="pet-item"><option value="">qualquer</option>${Object.keys(ITEMS).map((k) => `<option value="${k}">${ITEMS[k].nome}</option>`).join('')}</select></label>
        <label>Pra <select id="pet-to">${opt(targets)}</select></label>
        <label>Quantos <select id="pet-n"><option>1</option><option selected>5</option><option>10</option><option>20</option></select></label>
        <button id="pet-go" ${sources.length && targets.length ? '' : 'disabled'}>Vai, TÊTÊ!</button>
      </div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">Ele pega de baús, caixas de venda, canteiros e da saída das máquinas, e entrega em qualquer máquina que aceite o item.</div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const again = () => { audio.play('click', { volume: 0.4 }); renderPet(el); };
  $('#pet-carinho').onclick = () => { pet.pet(); again(); };
  $('#pet-seguir').onclick = () => { pet.setMode('seguir'); again(); };
  $('#pet-ficar').onclick = () => { pet.setMode('ficar'); again(); };
  if ($('#pet-cancel')) $('#pet-cancel').onclick = () => { pet.cancelTask(); pet.say('Tá bom, parei 👍'); again(); };
  el.querySelectorAll('.pet-tasks button').forEach((b) => { b.onclick = () => { pet.startTask({ tipo: b.dataset.t }); again(); }; });
  $('#pet-go').onclick = () => {
    const from = $('#pet-from').value, to = $('#pet-to').value;
    if (from === to) { game.ui.toast('Escolha máquinas diferentes', 'warn'); return; }
    if (!findByName(from) || !findByName(to)) return;
    pet.startTask({ tipo: 'buscar', from, to, item: $('#pet-item').value || null, n: +$('#pet-n').value });
    again();
  };
}
