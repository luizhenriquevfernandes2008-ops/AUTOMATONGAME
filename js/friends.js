// 🤝 Jogar com amigos, sem servidor: tudo vira um código de texto (ou arquivo) que vocês trocam
// pelo WhatsApp, Discord etc.
//  - Desafio da semana: placar com as notas dos amigos (o código leva a solução, que é conferida aqui)
//  - Visitar fábrica: abre a fábrica do amigo só pra passear (nada é salvo); dá pra copiar projetos
//  - Parceria: um contrato em dupla; cada um entrega na sua fábrica e troca o comprovante no fim
import { game } from './state.js';
import { ITEMS } from './data.js';
import { settings, saveSettings } from './settings.js';
import { audio } from './audio.js';
import { confetti } from './fx.js';
import { weeklyChallenge, encodeScore, decodeScore, hashStr, weekKey } from './weekly.js';
import { evaluate, medal, MEDAL_ICON } from './challenges.js';
import { weeklyRec } from './challengeUI.js';
import { saveData, VISIT_KEY } from './save.js';
import { canMake, addPartnerContract } from './contracts.js';
import { gainDisk } from './disks.js';

const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\s+/g, ''))));
export const myName = () => (settings.nome || '').trim() || 'Jogador(a)';
let tab = 'semana';

// ─── desafio da semana ───
function friendRow(f, best, isMe) {
  const col = (k) => `<td class="${best[k] === f[k] ? 'fr-best' : ''}">${f[k]}${best[k] === f[k] ? ' 👑' : ''}</td>`;
  return `<tr class="${isMe ? 'fr-me' : ''}"><td><b>${escH(f.nome)}</b>${isMe ? ' (você)' : ''}</td>${col('instr')}${col('linhas')}${col('vars')}<td>${f.code && !isMe ? `<button class="mini" data-see="${escH(f.nome)}">ver código</button>` : ''}</td></tr>`;
}
function renderWeek(el) {
  const ch = weeklyChallenge();
  const r = weeklyRec();
  const me = r.solved ? { nome: myName(), instr: r.best.instr, linhas: r.best.linhas, vars: r.best.vars } : null;
  const all = [...(me ? [me] : []), ...r.friends];
  const best = {};
  for (const k of ['instr', 'linhas', 'vars']) best[k] = all.length ? Math.min(...all.map((f) => f[k])) : null;
  const myCode = r.solved ? encodeScore(ch.week, myName(), r.best, r.code) : '';
  el.innerHTML = `
    <div class="card-x"><div class="card-h"><span>// semana ${ch.week} · ${ch.icone} ${ch.nome}</span><b>igual pra todo mundo</b></div>
      <p style="margin:0">${ch.desc}</p>
      <p class="muted" style="margin:6px 0 0">Resolva no 🧩 Terminal de Desafios (mesa do escritório). Depois mande seu código pros amigos e cole o deles aqui. Toda segunda-feira chega um desafio novo.</p></div>
    <table class="market fr-table"><tr><th>Quem</th><th>⚙️ Instruções</th><th>📏 Linhas</th><th>🧠 Memória</th><th></th></tr>
      ${all.map((f) => friendRow(f, best, f === me)).join('') || '<tr><td colspan="5" class="muted">Ninguém resolveu ainda. Seja o primeiro!</td></tr>'}</table>
    <div class="fr-cols">
      <div class="card-x"><div class="card-h"><span>// seu código</span>${r.solved ? '<button id="fr-copy" class="mini">copiar</button>' : ''}</div>
        ${r.solved ? `<textarea id="fr-mine" rows="3" readonly>${escH(myCode)}</textarea>` : '<p class="muted" style="margin:0">Resolva o desafio da semana pra gerar seu código.</p>'}</div>
      <div class="card-x"><div class="card-h"><span>// código de um amigo</span></div>
        <div class="row"><textarea id="fr-in" rows="3" placeholder="Cole aqui o AUTOMATON-SEMANA:…"></textarea><button id="fr-add" class="primary">Adicionar</button></div></div>
    </div>
    <div id="fr-see" class="hidden card-x"><div class="card-h"><span id="fr-see-h">// código</span></div><pre class="doc-code" id="fr-see-code"></pre></div>`;
  const $ = (s) => el.querySelector(s);
  if ($('#fr-copy')) $('#fr-copy').onclick = () => copyText(myCode);
  $('#fr-add').onclick = () => {
    try {
      const d = decodeScore($('#fr-in').value);
      if (d.week !== ch.week) throw new Error(`Esse código é da semana ${d.week}; a de agora é ${ch.week}`);
      if (d.nome === myName() && r.solved) throw new Error('Esse é o seu próprio código 😄');
      // confere de verdade: roda a solução do amigo aqui
      const res = evaluate(d.code, ch);
      if (!res.ok) throw new Error('A solução desse código não passou no desafio 🤔');
      const f = { nome: d.nome, ...res.score, code: d.code };
      r.friends = r.friends.filter((x) => x.nome !== f.nome).concat(f);
      game.economy.stats.friendScores = (game.economy.stats.friendScores || 0) + 1;
      audio.play('buy', { volume: 0.6 });
      game.ui.toast(`🤝 ${escH(f.nome)} entrou no placar da semana!`, 'good');
      renderWeek(el);
    } catch (e) { game.ui.toast(e.message, 'warn'); audio.play('deny'); }
  };
  el.querySelectorAll('[data-see]').forEach((b) => {
    b.onclick = () => {
      if (!r.solved) { game.ui.toast('Resolva o desafio primeiro pra poder ver a solução do amigo 😉', 'warn'); return; }
      const f = r.friends.find((x) => x.nome === b.dataset.see);
      $('#fr-see').classList.remove('hidden');
      $('#fr-see-h').textContent = `// solução de ${f.nome}`;
      $('#fr-see-code').textContent = f.code;
    };
  });
}

// ─── visitar fábrica ───
const FAB = 'AUTOMATON-FABRICA:';
async function gz(text, dir) {
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([text]).stream().pipeThrough(dir === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}
const bufToB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToBuf = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
export async function exportFactory() {
  const d = saveData();
  d.visitDe = myName();
  d.economy.lastSeen = Date.now(); // quem visita não ganha progresso offline
  const json = JSON.stringify(d);
  const z = await gz(json, 'in');
  return z ? FAB + 'z' + bufToB64(z) : FAB + 'j' + b64(json);
}
export async function importFactory(text) {
  const t = String(text).trim();
  if (!t.startsWith(FAB)) throw new Error('Esse código não é de uma fábrica do AUTOMATON (começa com AUTOMATON-FABRICA:)');
  const body = t.slice(FAB.length).replace(/\s+/g, '');
  let json;
  try {
    if (body[0] === 'z') json = new TextDecoder().decode(await gz(new Blob([b64ToBuf(body.slice(1))]), 'out'));
    else json = unb64(body.slice(1));
  } catch { throw new Error('Código quebrado: confira se copiou inteiro'); }
  let d;
  try { d = JSON.parse(json); } catch { throw new Error('Código quebrado'); }
  if (!d || !d.economy || !Array.isArray(d.entities)) throw new Error('Esse código não tem uma fábrica dentro');
  // os computadores do amigo não rodam sozinhos na sua visita (você liga se quiser)
  for (const e of d.entities) if (e && e.type === 'computador') e.running = false;
  return sanitizeVisit(d);
}
// o save veio de outra pessoa: tira < > " ' ` de todo texto (e das chaves) que pode acabar virando HTML na tela.
// Código Jiboia (que usa < e > de verdade) fica, porque só aparece em caixas de texto e no realce (que escapa tudo).
const KEEP = new Set(['code', 'stash']);
export function sanitizeVisit(v, key = '', parent = '') {
  if (typeof v === 'string') return KEEP.has(key) || parent === 'libs' ? v : v.replace(/[<>"'`]/g, '');
  if (Array.isArray(v)) return v.map((x) => sanitizeVisit(x, key, parent));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'last' || k === '__proto__') continue; // "last" guarda HTML do terminal de desafios
      out[k.replace(/[<>"'`&]/g, '')] = sanitizeVisit(x, k, key);
    }
    return out;
  }
  return v;
}
function startVisit(d) {
  try { localStorage.setItem(VISIT_KEY, JSON.stringify(d)); } catch { game.ui.toast('Essa fábrica é grande demais pro navegador guardar 😕', 'warn'); return; }
  game.economy.stats.visits = (game.economy.stats.visits || 0) + 1;
  import('./save.js').then((m) => { m.saveGame(); location.href = location.pathname + '?visita=1'; });
}
function renderVisit(el) {
  el.innerHTML = `
    <div class="fr-cols">
      <div class="card-x"><div class="card-h"><span>// mandar a sua fábrica</span></div>
        <p class="muted" style="margin-top:0">Gera um arquivo (ou código) com a sua fábrica inteira: máquinas, esteiras, cabos, programas e construções. O amigo abre e passeia por ela.</p>
        <div class="row"><button id="vi-file" class="primary">💾 Baixar arquivo</button><button id="vi-code">📋 Copiar código</button></div>
        <textarea id="vi-out" rows="3" readonly class="hidden"></textarea></div>
      <div class="card-x"><div class="card-h"><span>// visitar a fábrica de um amigo</span></div>
        <p class="muted" style="margin-top:0">A sua fábrica fica salva e esperando. Na visita <b>nada é salvo</b>: dá pra andar, ler os programas (E nos computadores) e <b>copiar grupos com C</b> e salvar em 📐 Projetos pra usar na sua fábrica.</p>
        <div class="row"><label class="fr-file">📂 Abrir arquivo<input type="file" id="vi-open" accept=".automaton,.txt"></label></div>
        <div class="row"><textarea id="vi-in" rows="2" placeholder="…ou cole o AUTOMATON-FABRICA:…"></textarea><button id="vi-go">👀 Visitar</button></div></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  $('#vi-file').onclick = async () => {
    const code = await exportFactory();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    a.download = `fabrica-de-${myName().replace(/[^\wÀ-ɏ-]+/g, '_')}.automaton`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    game.ui.toast('💾 Arquivo baixado! Mande pro seu amigo.', 'good');
  };
  $('#vi-code').onclick = async () => {
    const code = await exportFactory();
    $('#vi-out').classList.remove('hidden');
    $('#vi-out').value = code;
    copyText(code);
    if (code.length > 200000) game.ui.toast('O código ficou grande: se não couber na mensagem, mande o arquivo 💾', 'warn');
  };
  const go = async (text) => {
    try { const d = await importFactory(text); game.ui.confirm('👀 Visitar fábrica?', `<p>Vamos visitar a fábrica de <b>${escH(d.visitDe || 'um amigo')}</b> (nível ${d.economy.level}, ${d.entities.length} peças).</p><p class="muted">A sua fábrica é salva agora. Na visita nada é salvo. Pra voltar: Pausa → ⌂ Voltar pra minha fábrica.</p>`, () => startVisit(d), { yes: 'Visitar', no: 'Cancelar' }); }
    catch (e) { game.ui.toast(e.message, 'warn'); audio.play('deny'); }
  };
  $('#vi-go').onclick = () => go($('#vi-in').value);
  $('#vi-open').onchange = async (e) => { const f = e.target.files[0]; if (f) go(await f.text()); };
}

// ─── parceria (contrato em dupla) ───
const PAR = 'AUTOMATON-PARCERIA:', REC = 'AUTOMATON-COMPROVANTE:';
const signP = (d) => hashStr(JSON.stringify([d.p, d.n, d.it, d.pr, 'parceria'])).toString(36);
function partners() { const e = game.economy; if (!e.partners) e.partners = []; return e.partners; }
function makePartnership() {
  const eco = game.economy;
  let pool = Object.keys(ITEMS).filter((k) => canMake(k) && ITEMS[k].base >= 5 && ITEMS[k].base <= 60 && !ITEMS[k].material);
  if (pool.length < 2) pool = Object.keys(ITEMS).filter((k) => canMake(k) && ITEMS[k].base >= 2 && ITEMS[k].base <= 60 && !ITEMS[k].material);
  if (pool.length < 2) return null;
  const itens = {};
  while (Object.keys(itens).length < Math.min(3, pool.length)) {
    const k = pool[Math.floor(Math.random() * pool.length)];
    if (!itens[k]) itens[k] = Math.min(200, Math.max(10, Math.round(((250 + eco.level * 70) / ITEMS[k].base) / 5) * 5));
  }
  const value = Object.entries(itens).reduce((a, [k, n]) => a + n * ITEMS[k].base, 0);
  const d = { p: Math.random().toString(36).slice(2, 10), n: myName(), it: itens, pr: Math.round((value * 2.5) / 10) * 10 };
  d.h = signP(d);
  return d;
}
function joinPartnership(d, mine) {
  const list = partners();
  if (list.some((x) => x.id === d.p)) return false;
  list.push({ id: d.p, criador: d.n, itens: d.it, premio: d.pr, done: false, friendDone: null, bonus: false, mine });
  addPartnerContract({ parceria: d.p, cliente: `Parceria com ${mine ? 'um amigo' : d.n}`, icone: '🤝', raridade: 'lendario', itens: d.it, premio: d.pr, fichas: 3, disco: 0, expira: 0 });
  return true;
}
function receipt(p) { const d = { p: p.id, n: myName() }; d.h = hashStr(`${d.p}|${d.n}|comprovante`).toString(36); return REC + b64(JSON.stringify(d)); }
function checkBonus(p) {
  if (!p.done || !p.friendDone || p.bonus) return;
  p.bonus = true;
  const eco = game.economy;
  eco.addTokens(5);
  gainDisk('parceria');
  eco.stats.partnerships = (eco.stats.partnerships || 0) + 1;
  confetti(160);
  audio.play('achievement', { volume: 0.8 });
  game.ui.banner('🤝 Parceria concluída!', `Você e ${escH(p.friendDone)} entregaram tudo`, ['+5 🎟️ fichas', '+1 💾 disco de dados']);
}
game.on('contractDone', (o) => {
  if (!o.parceria) return;
  const p = partners().find((x) => x.id === o.parceria);
  if (!p) return;
  p.done = true;
  game.ui?.toast('🤝 Sua parte da parceria está pronta! Mande o <b>comprovante</b> pro amigo (🤝 Amigos → Parceria).', 'ach');
  checkBonus(p);
});
function renderPartner(el) {
  const list = partners();
  el.innerHTML = `
    <p class="muted" style="margin-top:0">Um contrato grande que <b>cada um cumpre na sua fábrica</b>. Quem cria manda o código; o amigo cola. Quando os dois terminarem, troquem os <b>comprovantes</b>: cada um ganha <b>+5 🎟️ e 1 💾</b> além do prêmio normal. Parcerias não ocupam vaga no quadro e não têm prazo.</p>
    <div class="fr-cols">
      <div class="card-x"><div class="card-h"><span>// criar parceria</span></div><button id="pa-new" class="primary" ${game.economy.level < 2 ? 'disabled' : ''}>🤝 Criar parceria</button>${game.economy.level < 2 ? ' <span class="muted">(nível 2)</span>' : ''}<textarea id="pa-out" rows="2" readonly class="hidden"></textarea></div>
      <div class="card-x"><div class="card-h"><span>// entrar numa parceria ou colar comprovante</span></div>
        <div class="row"><textarea id="pa-in" rows="2" placeholder="AUTOMATON-PARCERIA:… ou AUTOMATON-COMPROVANTE:…"></textarea><button id="pa-add">Colar</button></div></div>
    </div>
    <h3 class="rec-h">Suas parcerias</h3>
    <div class="bp-list">${list.map((p) => `<div class="bp-card"><div><b>🤝 ${p.mine ? 'Criada por você' : `Com ${escH(p.criador)}`}</b>
      <small>${Object.entries(p.itens).map(([k, n]) => `${n}× ${ITEMS[k]?.nome || k}`).join(', ')} · $ ${fmt(p.premio)}</small>
      <small>${p.bonus ? '✅ concluída pelos dois' : `${p.done ? '✔ sua parte pronta' : '⏳ sua parte em andamento'} · ${p.friendDone ? `✔ ${escH(p.friendDone)} terminou` : '⏳ esperando o comprovante do amigo'}`}</small></div>
      <div class="row">${p.mine ? `<button data-code="${p.id}">🔗 Código</button>` : ''}${p.done ? `<button data-rec="${p.id}" class="primary">📄 Comprovante</button>` : ''}</div></div>`).join('') || '<p class="muted">Nenhuma ainda.</p>'}</div>`;
  const $ = (s) => el.querySelector(s);
  const show = (code) => { $('#pa-out').classList.remove('hidden'); $('#pa-out').value = code; copyText(code); };
  $('#pa-new').onclick = () => {
    const d = makePartnership();
    if (!d) { game.ui.toast('Produza mais coisas antes de criar uma parceria', 'warn'); return; }
    joinPartnership(d, true);
    audio.play('buy', { volume: 0.6 });
    renderPartner(el);
    el.querySelector('#pa-out').classList.remove('hidden');
    el.querySelector('#pa-out').value = PAR + b64(JSON.stringify(d));
    copyText(PAR + b64(JSON.stringify(d)));
    game.ui.toast('🤝 Parceria criada e já está no seu Quadro de Contratos. Mande o código pro amigo!', 'good');
  };
  $('#pa-add').onclick = () => {
    const t = $('#pa-in').value.trim();
    try {
      if (t.startsWith(PAR)) {
        const d = JSON.parse(unb64(t.slice(PAR.length)));
        if (d.h !== signP(d) || !d.it || Object.keys(d.it).some((k) => !ITEMS[k])) throw new Error('Código de parceria inválido');
        if (!joinPartnership(d, false)) throw new Error('Você já está nessa parceria');
        audio.play('buy', { volume: 0.6 });
        game.ui.toast(`🤝 Parceria com ${escH(d.n)} aceita! Está no seu Quadro de Contratos.`, 'good');
      } else if (t.startsWith(REC)) {
        const d = JSON.parse(unb64(t.slice(REC.length)));
        if (d.h !== hashStr(`${d.p}|${d.n}|comprovante`).toString(36)) throw new Error('Comprovante inválido');
        const p = partners().find((x) => x.id === d.p);
        if (!p) throw new Error('Esse comprovante é de uma parceria que você não tem');
        if (d.n === myName()) throw new Error('Esse é o seu próprio comprovante 😄 Mande ele pro amigo');
        p.friendDone = d.n;
        game.ui.toast(`📄 Comprovante de ${escH(d.n)} recebido!${p.done ? '' : ' Agora termine a sua parte.'}`, 'good');
        checkBonus(p);
      } else throw new Error('Cole um código AUTOMATON-PARCERIA: ou AUTOMATON-COMPROVANTE:');
      renderPartner(el);
    } catch (e) { game.ui.toast(e.message.startsWith('Unexpected') ? 'Código quebrado' : e.message, 'warn'); audio.play('deny'); }
  };
  el.querySelectorAll('[data-code]').forEach((b) => { b.onclick = () => { const p = partners().find((x) => x.id === b.dataset.code); const d = { p: p.id, n: p.criador, it: p.itens, pr: p.premio }; d.h = signP(d); show(PAR + b64(JSON.stringify(d))); }; });
  el.querySelectorAll('[data-rec]').forEach((b) => { b.onclick = () => show(receipt(partners().find((x) => x.id === b.dataset.rec))); });
}

function copyText(t) {
  navigator.clipboard?.writeText(t).then(() => game.ui.toast('Código copiado! 📋 Cole numa mensagem pro amigo.', 'good'), () => game.ui.toast('Selecione o código e copie com Ctrl+C', 'warn'));
}

export function renderFriends(el, arg) {
  if (arg) tab = arg;
  const tabs = [['semana', '📅 Desafio da semana'], ['visita', '👀 Visitar fábrica'], ['parceria', '🤝 Parceria']];
  el.innerHTML = `<div class="fr-top"><div class="st-tabs">${tabs.map(([k, n]) => `<button class="shop-tab ${tab === k ? 'active' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
    <label class="fr-name">Seu nome <input id="fr-nome" maxlength="24" value="${escH(settings.nome || '')}" placeholder="Jogador(a)"></label></div><div id="fr-body"></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; audio.play('click', { volume: 0.4 }); renderFriends(el); }; });
  const nm = el.querySelector('#fr-nome');
  nm.onchange = () => { settings.nome = nm.value.trim().slice(0, 24); saveSettings(); game.ui.toast(`Agora você é <b>${escH(myName())}</b> nos códigos`); renderFriends(el); };
  const body = el.querySelector('#fr-body');
  if (tab === 'semana') renderWeek(body);
  else if (tab === 'visita') renderVisit(body);
  else renderPartner(body);
  el.querySelectorAll('input, textarea').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
}
void weekKey; void medal; void MEDAL_ICON;
