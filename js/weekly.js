// 📅 Desafio da semana: um quebra-cabeça novo a cada semana, igual pra todo mundo (sorteado pelo número
// da semana). A nota vira um código pra mandar pros amigos e montar um placar, sem servidor nenhum.
// Este arquivo não mexe em tela: dá pra testar no Node.
import { rng, evaluate } from './challenges.js';

// "2026-S39" (semana ISO: começa na segunda)
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-S${String(w).padStart(2, '0')}`;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pickR = (r, a) => a[Math.floor(r() * a.length)];
const ORES3 = ['minerio_ferro', 'minerio_cobre', 'quartzo'];
const nums = (r, a, b, lo = 1, hi = 60) => Array.from({ length: int(r, a, b) }, () => int(r, lo, hi));
const groups = (r, lo = 1, hi = 50) => { const out = []; const n = int(r, 3, 4); for (let i = 0; i < n; i++) { for (let j = int(r, 2, 4); j > 0; j--) out.push(int(r, lo, hi)); out.push(0); } return out; };

// modelos de desafio: p = parâmetros sorteados pela semana. ref = solução de referência (define as metas)
const TEMPLATES = [
  (p) => ({
    nome: `Múltiplos de ${p.k}`, icone: '➗',
    desc: `Entregue só os números que são <b>múltiplos de ${p.k}</b>, na ordem em que chegam.`,
    gen: (r) => nums(r, 10, 14, 1, 90), solve: (i) => i.filter((x) => x % p.k === 0),
    ref: `while True:\n    x = pegar()\n    if x % ${p.k} == 0:\n        entregar(x)`,
  }),
  (p) => ({
    nome: `Fórmula da fábrica: ×${p.a} + ${p.b}`, icone: '🧮',
    desc: `Pra cada número <code>x</code>, entregue <code>x × ${p.a} + ${p.b}</code>.`,
    gen: (r) => nums(r, 8, 12, 1, 40), solve: (i) => i.map((x) => x * p.a + p.b),
    ref: `while True:\n    entregar(pegar() * ${p.a} + ${p.b})`,
  }),
  (p) => ({
    nome: 'Soma de cada lote', icone: '🧺',
    desc: 'Os números vêm em lotes separados por <code>0</code>. Entregue a <b>soma de cada lote</b>.',
    gen: (r) => groups(r), solve: (i) => { const o = []; let s = 0; for (const x of i) { if (x === 0) { o.push(s); s = 0; } else s += x; } return o; },
    ref: 's = 0\nwhile True:\n    x = pegar()\n    if x == 0:\n        entregar(s)\n        s = 0\n    else:\n        s += x',
  }),
  (p) => ({
    nome: 'Menor de cada lote', icone: '🔻',
    desc: 'Os números vêm em lotes separados por <code>0</code>. Entregue o <b>menor de cada lote</b>.',
    gen: (r) => groups(r), solve: (i) => { const o = []; let m = null; for (const x of i) { if (x === 0) { o.push(m); m = null; } else m = m === null ? x : Math.min(m, x); } return o; },
    ref: 'm = 999\nwhile True:\n    x = pegar()\n    if x == 0:\n        entregar(m)\n        m = 999\n    elif x < m:\n        m = x',
    _p: p,
  }),
  (p) => ({
    nome: `Maiores que ${p.t}`, icone: '📈',
    desc: `Entregue os números <b>maiores que ${p.t}</b> e, no fim, <b>quantos</b> foram entregues.`,
    gen: (r) => nums(r, 9, 13, 1, 80), solve: (i) => { const f = i.filter((x) => x > p.t); return [...f, f.length]; },
    ref: `n = 0\nwhile tem_mais():\n    x = pegar()\n    if x > ${p.t}:\n        entregar(x)\n        n += 1\nentregar(n)`,
  }),
  (p) => ({
    nome: 'Fornalha de cabeça', icone: '🔥',
    desc: 'Chegam minérios. Entregue o que a fornalha faria: <code>minerio_ferro</code> → <code>"lingote_ferro"</code>, <code>minerio_cobre</code> → <code>"lingote_cobre"</code>, <code>quartzo</code> → <code>"silicio"</code>.',
    gen: (r) => Array.from({ length: int(r, 8, 12) }, () => pickR(r, ORES3)),
    solve: (i) => i.map((x) => ({ minerio_ferro: 'lingote_ferro', minerio_cobre: 'lingote_cobre', quartzo: 'silicio' })[x]),
    ref: 'f = {"minerio_ferro": "lingote_ferro", "minerio_cobre": "lingote_cobre", "quartzo": "silicio"}\nwhile True:\n    entregar(f[pegar()])',
  }),
  (p) => ({
    nome: 'Total acumulado', icone: '📊',
    desc: 'Depois de cada número, entregue a <b>soma de tudo que chegou até agora</b>.',
    gen: (r) => nums(r, 7, 11, 1, 30), solve: (i) => { let s = 0; return i.map((x) => (s += x)); },
    ref: 's = 0\nwhile True:\n    s += pegar()\n    entregar(s)',
  }),
  (p) => ({
    nome: 'Par pra esquerda', icone: '↔️', lados: true,
    desc: 'Números <b>pares</b> vão pra <code>"esquerda"</code>, ímpares pra <code>"direita"</code>: <code>entregar(x, lado)</code>.',
    gen: (r) => nums(r, 9, 13, 1, 99), solve: (i) => i.map((x) => [x, x % 2 === 0 ? 'esquerda' : 'direita']),
    ref: 'while True:\n    x = pegar()\n    if x % 2 == 0:\n        entregar(x, "esquerda")\n    else:\n        entregar(x, "direita")',
  }),
  (p) => ({
    nome: 'Esteira ao contrário', icone: '🔄',
    desc: 'Guarde tudo e entregue na <b>ordem inversa</b> (o último que chegou sai primeiro).',
    gen: (r) => nums(r, 6, 9, 1, 99), solve: (i) => [...i].reverse(),
    ref: 'l = []\nwhile tem_mais():\n    l.append(pegar())\nwhile len(l) > 0:\n    entregar(l.pop())',
  }),
  (p) => ({
    nome: `Contagem de ${p.item === 'quartzo' ? 'quartzo' : p.item === 'minerio_ferro' ? 'ferro' : 'cobre'} por lote`, icone: '🔢',
    desc: `Os itens vêm em lotes separados por <code>"fim"</code>. Pra cada lote, entregue <b>quantos <code>"${p.item}"</code></b> tinha.`,
    gen: (r) => { const o = []; for (let n = int(r, 3, 4); n > 0; n--) { for (let k = int(r, 2, 5); k > 0; k--) o.push(pickR(r, ORES3)); o.push('fim'); } return o; },
    solve: (i) => { const o = []; let c = 0; for (const x of i) { if (x === 'fim') { o.push(c); c = 0; } else if (x === p.item) c++; } return o; },
    ref: `n = 0\nwhile True:\n    x = pegar()\n    if x == "fim":\n        entregar(n)\n        n = 0\n    elif x == "${p.item}":\n        n += 1`,
  }),
];

const cache = new Map();
export function weeklyChallenge(week = weekKey()) {
  if (cache.has(week)) return cache.get(week);
  const r = rng(hashStr('automaton:' + week));
  const t = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
  const p = { k: int(r, 3, 7), a: int(r, 2, 9), b: int(r, 1, 20), t: int(r, 25, 55), item: pickR(r, ORES3) };
  const base = t(p);
  const seeds = [int(r, 1, 1e6), int(r, 1, 1e6), int(r, 1, 1e6)];
  const ch = { id: 'semana:' + week, week, seeds, ...base, exemplo: null };
  // metas a partir da solução de referência: ouro = a referência, prata = um pouco pior
  const res = evaluate(base.ref, ch);
  const s = res.ok ? res.score : { instr: 100, linhas: 8, vars: 3 };
  ch.metas = { instr: [Math.ceil(s.instr * 1.35), s.instr], linhas: [s.linhas + 2, s.linhas], vars: [s.vars + 1, s.vars] };
  const ex = base.gen(rng(7));
  const want = base.solve(ex.slice(0, 6));
  ch.exemplo = [JSON.stringify(ex.slice(0, 6)), ch.lados ? want.map(([v, l]) => `${l}: ${v}`).join(', ') : JSON.stringify(want)];
  ch.premio = { dinheiro: 1500, fichas: 3 };
  ch.inicial = '# 📅 desafio da semana\n# pegar() lê a entrada · entregar(x) responde · tem_mais()\n\nwhile True:\n    x = pegar()\n';
  cache.set(week, ch);
  return ch;
}

// ─── código de placar (pra mandar pros amigos) ───
const PREFIX = 'AUTOMATON-SEMANA:';
const sign = (d) => hashStr(`${d.s}|${d.n}|${d.i}|${d.l}|${d.v}|${d.c}|jiboia`).toString(36);
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s) => decodeURIComponent(escape(atob(s)));
export function encodeScore(week, nome, score, code) {
  const d = { s: week, n: String(nome).slice(0, 24), i: score.instr, l: score.linhas, v: score.vars, c: code.slice(0, 4000) };
  d.h = sign(d);
  return PREFIX + b64(JSON.stringify(d));
}
export function decodeScore(text) {
  const t = String(text).trim();
  if (!t.startsWith(PREFIX)) throw new Error('Esse código não é de um desafio da semana (começa com AUTOMATON-SEMANA:)');
  let d;
  try { d = JSON.parse(unb64(t.slice(PREFIX.length).replace(/\s+/g, ''))); } catch { throw new Error('Código quebrado: confira se copiou inteiro'); }
  if (!d || typeof d.s !== 'string' || ![d.i, d.l, d.v].every((x) => Number.isInteger(x) && x >= 0) || typeof d.c !== 'string') throw new Error('Código inválido');
  if (d.h !== sign(d)) throw new Error('Esse código foi alterado 🤨');
  return { week: d.s, nome: String(d.n || 'Amigo').slice(0, 24), instr: d.i, linhas: d.l, vars: d.v, code: d.c };
}
