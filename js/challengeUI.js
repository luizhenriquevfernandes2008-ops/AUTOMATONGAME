// 🧩 Terminal de Desafios (na mesa do escritório): lista, editor com realce e as notas de cada desafio.
import * as THREE from 'three';
import { game } from './state.js';
import { CHALLENGES, byId, evaluate, medal, MEDAL_ICON } from './challenges.js';
import { weeklyChallenge, weekKey } from './weekly.js';
import { highlight } from './editor.js';
import { cloneModel } from './assets.js';
import { audio } from './audio.js';
import { confetti } from './fx.js';
import { colliders, interactables } from './world.js';
import { virtualLight } from './lights.js';

const METRICS = [['instr', '⚙️ Instruções', 'executadas em média'], ['linhas', '📏 Linhas', 'de código (sem comentários)'], ['vars', '🧠 Memória', 'variáveis ao mesmo tempo']];
const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let current = null;

export function buildTerminal() {
  const x = 11.2, z = 25.4;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI / 2; // a tela fica de frente pro centro do escritório
  const desk = cloneModel('terminal'); g.add(desk);
  const chair = cloneModel('terminalChair'); chair.position.set(0, 0, -0.95); g.add(chair);
  const books = cloneModel('books'); books.position.set(0.6, desk.userData.size?.y || 0.8, -0.15); g.add(books);
  const glow = virtualLight(new THREE.PointLight(0x3ee6b8, 2.5, 4, 1.6));
  glow.position.set(0, 1.3, 0.3);
  g.add(glow);
  game.scene.add(g);
  colliders.push({ x, z, r: 0.85 });
  interactables.push({ obj: g, label: '🧩 Terminal de Desafios: quebra-cabeças de programação', action: 'challenges' });
}

export function unlockedIndex() {
  const done = game.economy.challenges;
  let i = 0;
  while (i < CHALLENGES.length && done[CHALLENGES[i].id]?.solved) i++;
  return i; // pode abrir até este (inclusive)
}
export function challengeSolved(fn) {
  const ch = CHALLENGES.find((c) => c.libera[0] === fn);
  return !ch || !!game.economy.challenges[ch.id]?.solved;
}
export function challengeFor(fn) { return CHALLENGES.find((c) => c.libera[0] === fn); }

// desafio da semana: guardado em eco.weekly (zera quando a semana muda)
export function weeklyRec() {
  const eco = game.economy;
  const wk = weekKey();
  if (!eco.weekly || eco.weekly.week !== wk) eco.weekly = { week: wk, code: weeklyChallenge(wk).inicial, best: {}, medals: {}, solved: false, friends: [] };
  return eco.weekly;
}
const chOf = (id) => (id.startsWith('semana:') ? weeklyChallenge() : byId(id));
function recOf(id) {
  if (id.startsWith('semana:')) return weeklyRec();
  const all = game.economy.challenges;
  if (!all[id]) all[id] = { code: byId(id).inicial || '# pegar() lê a entrada · entregar(x) responde\n\nwhile True:\n    x = pegar()\n', best: {}, solved: false, medals: {} };
  return all[id];
}

function applyResult(ch, res) {
  const eco = game.economy;
  const rec = recOf(ch.id);
  const msgs = [];
  const first = !rec.solved;
  if (first) {
    rec.solved = true;
    eco.addMoney(ch.premio.dinheiro);
    eco.stats.earned += ch.premio.dinheiro;
    eco.addTokens(ch.premio.fichas);
    eco.addXp(ch.premio.dinheiro / 2);
    msgs.push(`+$ ${ch.premio.dinheiro}`, `+${ch.premio.fichas} 🎟️`, ch.libera ? `Nova função na Jiboia: ${ch.libera[1]}` : 'Mande sua nota pros amigos: 🤝 Amigos → Desafio da semana');
    if (ch.week) eco.stats.weeklies = (eco.stats.weeklies || 0) + 1;
  }
  let newGold = 0;
  for (const [k] of METRICS) {
    const v = res.score[k];
    if (rec.best[k] == null || v < rec.best[k]) rec.best[k] = v;
    const m = medal(ch, k, rec.best[k]);
    if (m === 'ouro' && rec.medals[k] !== 'ouro') newGold++;
    rec.medals[k] = m;
  }
  if (newGold) { eco.addTokens(newGold); msgs.push(`+${newGold} 🎟️ por medalha de ouro nova`); }
  if (METRICS.every(([k]) => rec.medals[k] === 'ouro')) eco.stats.challengeGold = true;
  if (CHALLENGES.every((c) => eco.challenges[c.id]?.solved)) eco.stats.allChallenges = true;
  if (first || newGold) {
    audio.play('achievement', { volume: 0.7 });
    confetti(first ? 120 : 60);
    game.ui?.banner(`${ch.icone} ${ch.nome}`, first ? 'Desafio resolvido!' : 'Medalha de ouro!', msgs);
  } else audio.play('buy', { volume: 0.5 });
  game.emit('challenge', ch.id);
}

export function renderChallenges(el) {
  const eco = game.economy;
  const open = unlockedIndex();
  const wk = weeklyChallenge();
  if (!current || (!current.startsWith('semana:') && CHALLENGES.findIndex((c) => c.id === current) > open)) current = CHALLENGES[Math.min(open, CHALLENGES.length - 1)].id;
  if (current.startsWith('semana:')) current = wk.id;
  const ch = chOf(current);
  const rec = recOf(ch.id);
  const wr = weeklyRec();
  const weekItem = `<button class="chx-item week ${current === wk.id ? 'on' : ''}" data-ch="${wk.id}"><span class="chx-ic">📅</span><span><b>Desafio da semana</b><small>${wr.solved ? METRICS.map(([k]) => MEDAL_ICON[wr.medals[k]] || '').join('') + ` · ${wr.friends.length} amigo(s)` : `✨ ${wk.nome}`}</small></span></button>`;
  const list = CHALLENGES.map((c, i) => {
    const r = eco.challenges[c.id];
    const locked = i > open;
    const med = r?.solved ? METRICS.map(([k]) => MEDAL_ICON[r.medals[k]] || '').join('') : locked ? '🔒' : '✨ novo';
    return `<button class="chx-item ${c.id === current ? 'on' : ''} ${locked ? 'locked' : ''}" data-ch="${c.id}" ${locked ? 'disabled' : ''}><span class="chx-ic">${c.icone}</span><span><b>${i + 1}. ${c.nome}</b><small>${med}</small></span></button>`;
  }).join('');
  const bars = METRICS.map(([k, nome, sub]) => {
    const [prata, ouro] = ch.metas[k];
    const best = rec.best[k];
    const m = best != null ? medal(ch, k, best) : null;
    return `<div class="chx-metric"><div><b>${nome}</b> <small class="muted">${sub}</small></div>
      <div class="chx-scale"><span>🥇 ≤ ${ouro}</span><span>🥈 ≤ ${prata}</span><span>🥉 resolveu</span></div>
      <div class="chx-best">${best != null ? `seu recorde: <b>${best}</b> ${MEDAL_ICON[m]}` : '<span class="muted">ainda não resolvido</span>'}</div></div>`;
  }).join('');
  el.innerHTML = `
  <div class="chx">
    <div class="chx-list">${weekItem}${list}
      <p class="muted" style="font-size:12px;margin-top:8px">Resolver libera o próximo desafio, dá dinheiro, 🎟️ fichas e uma <b>função nova</b> pros computadores da fábrica. Cada 🥇 nova dá +1 ficha.</p>
    </div>
    <div class="chx-main">
      <div class="chx-head"><span class="chx-big">${ch.icone}</span><div><h2>${ch.nome}</h2><div class="chx-desc">${ch.desc}</div></div></div>
      <div class="chx-ex"><span>exemplo:</span> entrada <code>${escH(ch.exemplo[0])}</code> → saída <code>${escH(ch.exemplo[1])}</code> · <span class="muted">prêmio: $ ${ch.premio.dinheiro} + ${ch.premio.fichas} 🎟️${ch.libera ? ` + <code>${ch.libera[0]}()</code>` : ` · semana ${ch.week} · igual pra todo mundo`}</span>${ch.week && rec.solved ? ' <button id="chx-share" class="mini">🤝 placar com amigos</button>' : ''}</div>
      <div class="chx-ed"><pre class="chx-hl" aria-hidden="true"></pre><textarea class="chx-ta" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea></div>
      <div class="row"><button id="chx-run" class="primary">▶ Testar (Ctrl+Enter)</button><button id="chx-reset">↺ Recomeçar código</button><span class="muted" style="font-size:12px"><code>pegar()</code> · <code>tem_mais()</code> · <code>entregar(x${ch.lados ? ', "esquerda"' : ''})</code> · quando a entrada acaba, <code>pegar()</code> termina o programa</span></div>
      <div id="chx-out" class="chx-out">${rec.last ? rec.last : '<span class="muted">Escreva o programa e clique em Testar. Ele roda em 3 entradas diferentes.</span>'}</div>
      <div class="chx-metrics">${bars}</div>
    </div>
  </div>`;
  const ta = el.querySelector('.chx-ta'), hl = el.querySelector('.chx-hl');
  const paint = () => { hl.innerHTML = highlight(ta.value) + '\n'; hl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; };
  ta.value = rec.code;
  paint();
  ta.addEventListener('input', () => { rec.code = ta.value; paint(); });
  ta.addEventListener('scroll', paint);
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('    ', s, ta.selectionEnd, 'end');
      rec.code = ta.value; paint();
    }
    if (e.key === 'Enter' && !e.ctrlKey) {
      // mantém a indentação (e soma 4 depois de ":")
      e.preventDefault();
      const s = ta.selectionStart;
      const line = ta.value.slice(ta.value.lastIndexOf('\n', s - 1) + 1, s);
      const ind = (line.match(/^ */)[0]) + (line.trimEnd().endsWith(':') ? '    ' : '');
      ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
      rec.code = ta.value; paint();
    }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); run(); }
    if (e.key === 'Escape') game.ui.closeOverlay();
  });
  const out = el.querySelector('#chx-out');
  const run = () => {
    const res = evaluate(ta.value, ch);
    if (!res.ok) {
      audio.play('error', { volume: 0.5 });
      rec.last = `<div class="bad">✖ ${res.line ? `Linha ${res.line}: ` : ''}${escH(res.error)}</div>
        <div class="chx-io"><span>entrada</span><code>${escH(res.input || '')}</code><span>esperado</span><code>${escH(res.want || '')}</code><span>seu programa</span><code>${escH(res.got || '')}</code></div>
        ${res.logs?.length ? `<div class="muted">print: ${escH(res.logs.slice(-5).join(' · '))}</div>` : ''}`;
      out.innerHTML = rec.last;
      return;
    }
    const sc = res.score;
    rec.last = `<div class="good">✔ Passou nas 3 entradas!</div><div class="chx-score">${METRICS.map(([k, nome]) => `<span>${nome}: <b>${sc[k]}</b> ${MEDAL_ICON[medal(ch, k, sc[k])]}</span>`).join('')}</div>`;
    applyResult(ch, res);
    renderChallenges(el);
  };
  el.querySelector('#chx-run').onclick = run;
  el.querySelector('#chx-reset').onclick = () => { if (!confirm('Apagar o código deste desafio e começar de novo?')) return; rec.code = ch.inicial || '# pegar() lê a entrada · entregar(x) responde\n\nwhile True:\n    x = pegar()\n'; rec.last = ''; renderChallenges(el); };
  const sh = el.querySelector('#chx-share');
  if (sh) sh.onclick = () => game.ui.openOverlay('friends', 'semana');
  el.querySelectorAll('[data-ch]').forEach((b) => { b.onclick = () => { current = b.dataset.ch; audio.play('click', { volume: 0.4 }); renderChallenges(el); }; });
  setTimeout(() => ta.focus(), 30);
}
