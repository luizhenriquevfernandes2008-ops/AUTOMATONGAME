// Telas da 3.0: Central (Marcos · Bancada · Inventário), menu de construção, painel das máquinas
// e a "cerimônia" quando um marco é concluído.
import { game } from './state.js';
import {
  ITEMS, MACHINES, MILESTONES, TIER_NAMES, TIER_PHASE, PHASES, HAND, SMELT, CONSTRUCT, RECIPES, recipeOut, BUILD_CATS, PIECES, TIERS, TIERABLE, PURITY, ORES, FUELS,
} from './data.js';
import { thumbs } from './thumbs.js';
import { audio } from './audio.js';
import { confetti } from './fx.js';
import { craft, handRecipes, canCraft } from './hub.js';
import { itemName } from './machines.js';
import { powerText } from './power.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const ic = (k, cls = 'ic') => `<img class="${cls}" src="${thumbs['item:' + k] || thumbs[k] || ''}" alt="">`;
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const perMin = (n, secs, mul = 1) => (n * 60 * mul) / secs;
const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

// linha de custo: ícone, nome, tem/precisa
function costRows(cost, mult = 1) {
  const eco = game.economy;
  return Object.entries(cost).map(([k, n]) => {
    const need = n * mult, have = eco.count(k);
    const ok = have >= need;
    return `<div class="c3-cost ${ok ? 'ok' : 'no'}">${ic(k)}<span>${ITEMS[k]?.nome || k}</span><i><b style="width:${Math.min(100, (have / need) * 100)}%"></b></i><em>${fmt(Math.min(have, 99999))}/${fmt(need)}</em></div>`;
  }).join('');
}
const chips = (cost) => Object.entries(cost).map(([k, n]) => `<span class="c3-chip ${game.economy.count(k) >= n ? '' : 'no'}">${ic(k)}${n}</span>`).join('');

// ─── Central ───
let hubTab = 'marcos', tierSel = null;
export function renderHub(body, tab) {
  if (tab) hubTab = tab;
  const eco = game.economy;
  const tabs = [['marcos', '🏁 Marcos'], ['bancada', '🔨 Bancada'], ['inventario', `🎒 Inventário <small>${eco.slotsUsed()}/${eco.slots}</small>`]];
  body.innerHTML = `<div class="c3-tabs">${tabs.map(([k, t]) => `<button class="c3-tab ${hubTab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div><div class="c3-body" id="c3-body"></div>`;
  body.querySelectorAll('.c3-tab').forEach((b) => { b.onclick = () => { hubTab = b.dataset.tab; audio.play('click', { volume: 0.4 }); renderHub(body); }; });
  const inner = body.querySelector('#c3-body');
  if (hubTab === 'marcos') renderMilestones(inner, body);
  else if (hubTab === 'bancada') renderBench(inner);
  else renderInventory(inner);
}

function renderMilestones(el, root) {
  const eco = game.economy;
  if (tierSel == null || !eco.tierOpen(tierSel)) tierSel = eco.tier;
  const tiers = TIER_NAMES.map((nome, t) => {
    const ms = MILESTONES.filter((m) => m.tier === t);
    const done = ms.filter((m) => eco.milestones.includes(m.id)).length;
    const open = eco.tierOpen(t);
    const why = !open ? (TIER_PHASE[t] > eco.phase && eco.tierDone(t - 1) ? `🚀 Fase ${TIER_PHASE[t]} do foguete` : '🔒') : done === ms.length ? '✔' : `${done}/${ms.length}`;
    return `<button class="c3-tier ${t === tierSel ? 'on' : ''} ${open ? '' : 'lock'} ${done === ms.length ? 'done' : ''}" data-t="${t}" ${open ? '' : 'disabled'}><b>Tier ${t}</b><span>${nome}</span><em>${why}</em></button>`;
  }).join('');
  const cards = MILESTONES.filter((m) => m.tier === tierSel).map((m) => {
    const st = eco.milestoneState(m.id);
    const unl = [...(m.libera || []).map((t) => `<span class="c3-unl" title="${MACHINES[t]?.nome || PIECES[t]?.nome || t}">${t === 'fundacao' ? '<i class="c3-emoji">🟫</i>' : `<img src="${thumbs[t] || ''}">`}<small>${MACHINES[t]?.nome || PIECES[t]?.nome || t}</small></span>`),
      ...(m.receitas || []).map((r) => { const rec = SMELT[r] || CONSTRUCT[r] || RECIPES[r]; const out = rec ? recipeOut(r, rec) : r; return `<span class="c3-unl">${ic(out)}<small>${ITEMS[out]?.nome || out}</small></span>`; })].join('');
    const can = st === 'open' && eco.has(m.custo);
    return `<div class="c3-ms ${st}">
      <div class="c3-ms-h"><span class="c3-ms-ic">${m.icone}</span><div><b>${m.nome}</b><small>${st === 'done' ? 'concluído ✔' : st === 'nohub' ? 'monte a Central' : st === 'locked' ? 'bloqueado' : 'disponível'}</small></div></div>
      <div class="c3-unls">${unl}</div>
      ${m.extra || m.slots ? `<div class="c3-extra">${[m.extra, m.slots ? `🎒 +${m.slots} espaços no inventário` : ''].filter(Boolean).join(' · ')}</div>` : ''}
      ${st !== 'done' ? `<div class="c3-costs">${costRows(m.custo)}</div><button class="primary c3-pay" data-id="${m.id}" ${can ? '' : 'disabled'}>${can ? '⬆ Concluir marco' : st === 'open' ? 'Faltam itens' : '🔒'}</button>` : ''}
    </div>`;
  }).join('');
  const ph = PHASES[eco.phase];
  el.innerHTML = `<div class="c3-ms-wrap"><div class="c3-tiers">${tiers}
    <div class="c3-phase">🚀 Projeto Foguete<br><b>${eco.launched ? 'lançado!' : `fase ${eco.phase}/${PHASES.length}`}</b>${ph && !eco.launched ? `<small>próxima: ${ph.nome}${ph.libera ? ` → ${ph.libera}` : ''}</small>` : ''}</div></div>
    <div class="c3-ms-list"><div class="c3-ms-title">Tier ${tierSel} · ${TIER_NAMES[tierSel]}</div><div class="c3-ms-grid">${cards}</div></div></div>`;
  el.querySelectorAll('.c3-tier').forEach((b) => { b.onclick = () => { tierSel = +b.dataset.t; audio.play('tick', { volume: 0.4 }); renderHub(root); }; });
  el.querySelectorAll('.c3-pay').forEach((b) => {
    b.onclick = () => {
      const why = eco.payMilestone(b.dataset.id);
      if (why) { game.ui.toast(why, 'warn'); audio.play('deny', { volume: 0.5 }); return; }
      renderHub(root);
    };
  });
}

function renderBench(el) {
  const eco = game.economy;
  const list = handRecipes();
  el.innerHTML = `<div class="c3-bench-help">Segure o botão da receita pra fabricar na mão (vai repetindo enquanto segurar). As máquinas fazem o mesmo sozinhas, bem mais rápido.</div>
  <div class="c3-bench">${list.map(([k, r]) => {
    const out = recipeOut(k, r);
    const ok = canCraft(k);
    const from = list.filter(([k2, r2]) => recipeOut(k2, r2) === out).length > 1 ? ` <span class="muted">de ${Object.keys(r.in).map((x) => ITEMS[x].nome.toLowerCase()).join(' + ')}</span>` : '';
    return `<div class="c3-rec ${ok ? '' : 'no'} ${craft.recipe === k && craft.active ? 'on' : ''}" data-k="${k}">
      <div class="c3-rec-out">${ic(out, 'big')}<b>${ITEMS[out].nome}${from}</b><small>×${r.qtd} · ${r.mao}s · tenho ${fmt(eco.count(out))}</small></div>
      <div class="c3-rec-in">${chips(r.in)}</div>
      <div class="c3-ring"><i></i></div>
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('.c3-rec').forEach((c) => {
    c.onpointerdown = (e) => { e.preventDefault(); if (!canCraft(c.dataset.k)) { audio.play('deny', { volume: 0.4 }); return; } craft.recipe = c.dataset.k; craft.active = true; craft.t = 0; c.classList.add('on'); };
  });
}
addEventListener('pointerup', () => { craft.active = false; document.querySelectorAll('.c3-rec.on').forEach((c) => c.classList.remove('on')); });

export function renderInventory(el) {
  const eco = game.economy;
  const stacks = [];
  const order = Object.keys(ITEMS);
  for (const k of Object.keys(eco.items).sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    let n = eco.items[k];
    const p = ITEMS[k].pilha;
    while (n > 0) { stacks.push([k, Math.min(p, n)]); n -= p; }
  }
  const cells = [];
  for (let i = 0; i < eco.slots; i++) {
    const s = stacks[i];
    cells.push(s ? `<div class="c3-slot" title="${ITEMS[s[0]].nome}">${ic(s[0])}<em>${fmt(s[1])}</em></div>` : '<div class="c3-slot empty"></div>');
  }
  el.innerHTML = `<div class="c3-inv-head"><b>🎒 ${eco.slotsUsed()}/${eco.slots}</b> espaços · cada espaço guarda uma pilha (minério 100, peças 200, parafusos 500…)</div><div class="c3-inv">${cells.join('')}</div>`;
}

// ─── menu de construção ───
let buildCat = 'producao';
export function renderBuild(body) {
  const eco = game.economy;
  const cats = Object.entries(BUILD_CATS);
  const tabs = cats.map(([k, t]) => `<button class="c3-tab ${buildCat === k ? 'on' : ''}" data-cat="${k}">${t}</button>`).join('');
  let cards;
  if (buildCat === 'construcao') {
    cards = Object.entries(PIECES).map(([k, p]) => {
      const ok = eco.pieceUnlocked(k);
      return `<div class="c3-bcard ${ok ? '' : 'lock'}" data-piece="${k}"><div class="c3-bimg"><span class="c3-emoji">${p.icone}</span></div><b>${p.nome}</b><div class="c3-bcost">${p.fixo ? chips({ [p.fixo === 'concreto' ? 'concreto' : p.fixo]: p.custo }) : `<small>${p.custo}× material</small>`}</div>${ok ? '' : '<div class="c3-lockmsg">🔒 Marco Construtora</div>'}</div>`;
    }).join('');
  } else {
    cards = Object.entries(MACHINES).filter(([, d]) => d.cat === buildCat && !d.oculto).map(([k, d]) => {
      const ok = eco.isUnlocked(k);
      const m = d.u ? MILESTONES.find((x) => x.id === d.u) : null;
      const placed = d.unico && game.entities.some((e) => e.type === k);
      const pinned = eco.hotbar.includes(k);
      return `<div class="c3-bcard ${ok ? '' : 'lock'} ${placed ? 'placed' : ''}" data-t="${k}">
        <div class="c3-bimg"><img src="${thumbs[k] || ''}"></div><b>${d.nome}</b>
        <div class="c3-bcost">${chips(d.custo)}</div>
        ${ok ? `<button class="mini c3-pin ${pinned ? 'on' : ''}" data-pin="${k}" title="Fixar na barra">${pinned ? '📌' : '＋'}</button>` : `<div class="c3-lockmsg">🔒 ${m ? `${m.icone} ${m.nome} (Tier ${m.tier})` : ''}</div>`}
        ${placed ? '<div class="c3-lockmsg">já construída</div>' : ''}
        <div class="c3-bdesc">${d.desc || ''}${d.energia ? ` <span class="amber">⚡ ${d.energia}</span>` : ''}${d.gera ? ` <span class="good">⚡ +${d.gera}</span>` : ''}</div>
      </div>`;
    }).join('');
  }
  body.innerHTML = `<div class="c3-tabs">${tabs}</div><div class="c3-bgrid">${cards}</div><div class="c3-bfoot">Clique pra escolher e construir · 📌 fixa na barra (teclas 3-9) · o custo sai do inventário e volta quando você desmonta</div>`;
  body.querySelectorAll('.c3-tab').forEach((b) => { b.onclick = () => { buildCat = b.dataset.cat; audio.play('click', { volume: 0.4 }); renderBuild(body); }; });
  body.querySelectorAll('.c3-pin').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const t = b.dataset.pin, hb = eco.hotbar;
      const i = hb.indexOf(t);
      if (i >= 0) hb.splice(i, 1); else { hb.push(t); if (hb.length > 7) hb.shift(); }
      game.emit('hotbar');
      renderBuild(body);
    };
  });
  body.querySelectorAll('.c3-bcard[data-t]').forEach((c) => {
    c.onclick = () => {
      const t = c.dataset.t;
      if (!eco.isUnlocked(t)) { audio.play('deny', { volume: 0.4 }); return; }
      if (!eco.hotbar.includes(t) && t !== 'central') { eco.hotbar.push(t); if (eco.hotbar.length > 7) eco.hotbar.shift(); }
      game.ui.closeOverlay();
      game.builder.selected = null;
      game.builder.select(t);
    };
  });
  body.querySelectorAll('.c3-bcard[data-piece]').forEach((c) => {
    c.onclick = () => {
      if (!eco.pieceUnlocked(c.dataset.piece)) { audio.play('deny', { volume: 0.4 }); return; }
      game.ui.closeOverlay();
      game.builder.piece = c.dataset.piece;
      game.builder.selected = null;
      game.builder.select('construir');
    };
  });
}

// ─── painel de máquina ───
const RECIPE_TABLE = { fornalha: SMELT, construtora: CONSTRUCT, montadora: RECIPES };
export const PANEL3 = new Set(['fornalha', 'construtora', 'montadora', 'minerador', 'gerador', 'gerador_carvao', 'bau', 'separador', 'braco', 'painel_solar']);
export function renderMachine(body, e) {
  if (!e || e.removed) { game.ui.closeOverlay(); return; }
  const eco = game.economy;
  const d = MACHINES[e.type];
  const T = RECIPE_TABLE[e.type];
  const on = !!e.auto || (e.on !== undefined && e.on && !e.auto && (e.type === 'gerador' || e.type === 'gerador_carvao'));
  const speed = e.speedMul || 1;
  let main = '';
  // receita (fornalha, construtora, montadora)
  if (T) {
    const list = Object.entries(T).filter(([k, r]) => eco.recipeUnlocked(k, r));
    const r = e.recipe && T[e.recipe];
    const out = r ? recipeOut(e.recipe, r) : null;
    main += `<div class="c3-sec">Receita</div><div class="c3-recipes">${list.map(([k, rr]) => { const o = recipeOut(k, rr); return `<button class="c3-rbtn ${e.recipe === k ? 'on' : ''}" data-r="${k}" title="${ITEMS[o].nome}${rr.alt ? ' (alternativa)' : ''}">${ic(o)}<small>${ITEMS[o].nome}${rr.alt ? ' ★' : ''}</small></button>`; }).join('')}</div>`;
    if (r) {
      main += `<div class="c3-flow">
        <div class="c3-flow-in">${Object.entries(r.in).map(([k, n]) => `<div class="c3-slotbig">${ic(k, 'big')}<b>${e.inv[k] || 0}</b><small>${ITEMS[k].nome}</small><small class="rate">${f1(perMin(n, r.tempo, speed))}/min</small>
          <div class="c3-sbtns"><button class="mini" data-in="${k}" data-n="1">+1</button><button class="mini" data-in="${k}" data-n="10">+10</button><button class="mini" data-in="${k}" data-n="999">Tudo</button>${e.inv[k] ? `<button class="mini" data-back="${k}">↩</button>` : ''}</div></div>`).join('')}</div>
        <div class="c3-arrow">➜<small>${f1(r.tempo / speed)} s</small></div>
        <div class="c3-flow-out"><div class="c3-slotbig out">${ic(out, 'big')}<b>${e.out.length}</b><small>${ITEMS[out].nome} ×${r.qtd || 1}</small><small class="rate">${f1(perMin(r.qtd || 1, r.tempo, speed))}/min</small><div class="c3-sbtns"><button class="mini" data-take="1" ${e.out.length ? '' : 'disabled'}>Pegar tudo</button></div></div></div>
      </div>`;
    } else main += '<div class="c3-hint">👆 Escolha uma receita. Depois aperte LIGAR: ela trabalha sozinha enquanto tiver energia e ingredientes.</div>';
  }
  if (e.type === 'minerador') {
    const ore = ORES[e.oreType];
    const pu = PURITY[e.purity];
    const rate = ore ? perMin(1, ore.tempo / pu.mult, speed) : 0;
    main += `<div class="c3-flow"><div class="c3-flow-in"><div class="c3-slotbig">${ore ? ic(ore.item, 'big') : ''}<b>${ore ? ore.nome : '—'}</b><small>veio ${pu.icone} ${pu.nome} (${pu.mult}×)</small></div></div>
      <div class="c3-arrow">➜<small>${f1(rate)}/min</small></div>
      <div class="c3-flow-out"><div class="c3-slotbig out">${ore ? ic(ore.item, 'big') : ''}<b>${e.out.length}</b><small>na saída</small><div class="c3-sbtns"><button class="mini" data-take="1" ${e.out.length ? '' : 'disabled'}>Pegar tudo</button></div></div></div></div>`;
  }
  if (e.type === 'gerador' || e.type === 'gerador_carvao') {
    const fuels = FUELS[e.type];
    main += `<div class="c3-sec">Combustível · ${e.fuelCount()}/${e.inCap}</div><div class="c3-fuel">${Object.entries(fuels).map(([k, s]) => `<div class="c3-slotbig">${ic(k, 'big')}<b>${e.inv[k] || 0}</b><small>${ITEMS[k].nome} · ${s}s cada</small><small class="rate">tenho ${fmt(eco.count(k))}</small>
      <div class="c3-sbtns"><button class="mini" data-in="${k}" data-n="10" ${eco.count(k) ? '' : 'disabled'}>+10</button><button class="mini" data-in="${k}" data-n="999" ${eco.count(k) ? '' : 'disabled'}>Tudo</button></div></div>`).join('')}</div>`;
  }
  if (e.type === 'bau') {
    const inv = Object.entries(e.inv);
    main += `<div class="c3-sec">Guardado · ${e.stacksUsed()}/${e.stacks} pilhas</div><div class="c3-inv small">${inv.map(([k, n]) => `<div class="c3-slot" title="${ITEMS[k].nome}">${ic(k)}<em>${fmt(n)}</em><button class="mini" data-back="${k}">Pegar</button></div>`).join('') || '<div class="muted">vazio</div>'}</div>
      <div class="c3-sec">Guardar do inventário</div><div class="c3-inv small">${Object.entries(eco.items).map(([k, n]) => `<div class="c3-slot" title="${ITEMS[k].nome}">${ic(k)}<em>${fmt(n)}</em><button class="mini" data-in="${k}" data-n="999">Guardar</button></div>`).join('') || '<div class="muted">inventário vazio</div>'}</div>`;
  }
  if (e.type === 'separador') {
    const rules = e.auto?.arg?.regras || e.filters || {};
    const items = [...new Set([...Object.keys(eco.stats.produced || {}), ...Object.keys(rules)])].filter((k) => ITEMS[k] && !ITEMS[k].oculto).slice(0, 24);
    main += `<div class="c3-sec">Filtros (sem código): pra onde vai cada item</div><div class="c3-filters">${items.map((k) => `<div class="c3-filter">${ic(k)}<small>${ITEMS[k].nome}</small><select data-f="${k}"><option value="">padrão</option>${['esquerda', 'frente', 'direita'].map((s) => `<option ${rules[k] === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="c3-hint">O resto vai pra: <select id="c3-padrao">${['frente', 'esquerda', 'direita'].map((s) => `<option ${(e.auto?.arg?.padrao || e.filterDefault || 'frente') === s ? 'selected' : ''}>${s}</option>`).join('')}</select> · ou programe com <code>.enviar()</code></div>`;
  }
  const canOnOff = !!(T || e.type === 'minerador' || e.type === 'braco' || e.type === 'separador' || e.type === 'gerador' || e.type === 'gerador_carvao');
  const tierBtn = TIERABLE.includes(e.type) && e.tier < 2 ? (() => {
    const nx = TIERS[e.tier + 1];
    const ok = eco.hasTech(nx.tech);
    return `<button class="c3-act" data-act="tier" ${ok && eco.has(nx.custo) ? '' : 'disabled'} title="${ok ? '' : 'Pesquise ' + nx.nome + ' no Laboratório'}">⬆ ${nx.nome} (${nx.vel}× velocidade) ${ok ? chips(nx.custo) : '🔒'}</button>`;
  })() : '';
  const turbo = e.turboK ? `<span class="c3-turbo">⏩ turbo ${f1(e.turboK)}× por código</span>` : '';
  body.innerHTML = `<div class="c3-mhead"><img src="${thumbs[e.type] || ''}"><div><input class="c3-name" value="${esc(e.name)}" maxlength="20"><small>${d.nome}${e.tier ? ' ' + TIERS[e.tier].nome : ''} · velocidade ${f1(speed)}× ${turbo}</small></div>
    <div class="grow"></div>${canOnOff ? `<button class="c3-power ${on ? 'on' : ''}" data-act="power">${on ? '⏻ LIGADA' : '⏻ LIGAR'}</button>` : ''}</div>
    <div class="c3-status"><span>${e.status || ''}</span><span>${powerText(e) || ''}</span></div>
    ${main}
    <div class="c3-actions"><button class="c3-act" data-act="rot">↻ Girar</button>${tierBtn}<button class="c3-act" data-act="code">🐍 Usar no código</button></div>
    <div class="c3-code hidden">${Object.entries(e.api ? e.api() : {}).map(([k, v]) => `<div><code>maquina("${esc(e.name)}").${k}()</code> <span class="muted">${v.doc || ''}</span></div>`).join('')}</div>`;
  // ações
  const rerender = () => renderMachine(body, e);
  body.querySelector('.c3-name').onchange = (ev) => {
    const n = ev.target.value.trim().replace(/[^\w\-]/g, '').slice(0, 20);
    if (!n || game.entities.some((o) => o !== e && o.name === n)) { game.ui.toast('Nome inválido ou repetido', 'warn'); return; }
    if (game.mp?.guestRpc?.('rename', { a: `${e.x},${e.z},0`, n })) return;
    e.rename(n);
  };
  body.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { if (game.mp?.guestRpc?.('panelAct', { a: `${e.x},${e.z},0`, act: 'recipe', v: b.dataset.r })) return; e.setRecipe(b.dataset.r); audio.play('select', { volume: 0.4 }); rerender(); }; });
  body.querySelectorAll('[data-in]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.in, n = +b.dataset.n;
      if (game.mp?.guestRpc?.('panelAct', { a: `${e.x},${e.z},0`, act: 'insert', v: k, n })) return;
      const got = e.insertFromPlayer(k, n);
      audio.play(got ? 'drop' : 'deny', { volume: 0.4 });
      rerender();
    };
  });
  body.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { if (game.mp?.guestRpc?.('panelAct', { a: `${e.x},${e.z},0`, act: 'back', v: b.dataset.back })) return; e.takeInput(b.dataset.back); audio.play('click', { volume: 0.4 }); rerender(); }; });
  body.querySelectorAll('[data-take]').forEach((b) => { b.onclick = () => { if (game.mp?.guestRpc?.('panelAct', { a: `${e.x},${e.z},0`, act: 'take' })) return; e.takeOutput(); audio.play('click', { volume: 0.4 }); rerender(); }; });
  body.querySelectorAll('[data-f]').forEach((s) => { s.onchange = () => { setFilters(e, body); }; });
  const pad = body.querySelector('#c3-padrao');
  if (pad) pad.onchange = () => setFilters(e, body);
  body.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'power') {
        if (game.mp?.guestRpc?.('panelAct', { a: `${e.x},${e.z},0`, act: 'power' })) return;
        togglePower(e);
        audio.play(e.auto || e.on ? 'select' : 'close', { volume: 0.5 });
      }
      if (act === 'rot') game.builder.rotateEntity(e);
      if (act === 'code') { body.querySelector('.c3-code').classList.toggle('hidden'); return; }
      if (act === 'tier') {
        const nx = TIERS[e.tier + 1];
        if (game.mp?.guestRpc?.('tier', { a: `${e.x},${e.z},0` })) return;
        if (!eco.pay(nx.custo)) return;
        e.setTier(e.tier + 1);
        audio.play('levelup', { volume: 0.6 });
      }
      rerender();
    };
  });
}
export function togglePower(e) {
  if (e.type === 'gerador' || e.type === 'gerador_carvao') { e.on = !e.on; return; }
  if (e.auto) { e.setAuto(null); return; }
  if (e.type === 'separador') { e.setAuto('on', { regras: e.filters || {}, padrao: e.filterDefault || 'frente' }); return; }
  if (RECIPE_TABLE[e.type] && !e.recipe) { game.ui.toast('Escolha uma receita primeiro 👆', 'warn'); return; }
  e.setAuto('on', RECIPE_TABLE[e.type] ? e.recipe : null);
}
function setFilters(e, body) {
  const regras = {};
  body.querySelectorAll('[data-f]').forEach((s) => { if (s.value) regras[s.dataset.f] = s.value; });
  const padrao = body.querySelector('#c3-padrao')?.value || 'frente';
  e.filters = regras; e.filterDefault = padrao;
  if (e.auto) e.setAuto('on', { regras, padrao });
}

// ─── cerimônia do marco ───
export function milestoneFx(m) {
  const el = $('#mfx');
  if (!el) return;
  const unl = [...(m.libera || []).map((t) => ({ img: t === 'fundacao' ? '' : thumbs[t], emoji: t === 'fundacao' ? '🟫' : '', nome: MACHINES[t]?.nome || PIECES[t]?.nome || t })),
    ...(m.receitas || []).map((r) => { const rec = SMELT[r] || CONSTRUCT[r] || RECIPES[r]; const o = rec ? recipeOut(r, rec) : r; return { img: thumbs['item:' + o], nome: 'Receita: ' + (ITEMS[o]?.nome || o) }; })];
  el.innerHTML = `<div class="mfx-in">
    <div class="mfx-tier">TIER ${m.tier} · ${TIER_NAMES[m.tier].toUpperCase()}</div>
    <div class="mfx-title"><span>${m.icone}</span> ${m.nome}</div>
    <div class="mfx-sub">MARCO CONCLUÍDO</div>
    <div class="mfx-cards">${unl.map((u, i) => `<div class="mfx-card" style="animation-delay:${0.5 + i * 0.12}s">${u.img ? `<img src="${u.img}">` : `<span>${u.emoji || '⭐'}</span>`}<small>${u.nome}</small></div>`).join('')}</div>
    ${m.extra || m.slots ? `<div class="mfx-extra">${[m.extra, m.slots ? `🎒 +${m.slots} espaços` : ''].filter(Boolean).join(' · ')}</div>` : ''}
    <div class="mfx-hint">clique pra continuar</div></div>`;
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  audio.play('levelup', { volume: 0.9 });
  game.music?.sting?.('marco');
  confetti(90);
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 600);
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 9000);
  el.onclick = () => el.classList.add('hidden');
}
