// Desafios de programação (estilo Zachtronics): quebra-cabeças isolados em Jiboia.
// O programa lê a entrada com pegar() e responde com entregar(). Quando a entrada acaba, pegar() encerra o programa.
// Três notas: instruções executadas, linhas de código e memória (pico de variáveis). Cada uma ganha 🥉/🥈/🥇.
// Este arquivo não mexe em tela nem em 3D: dá pra testar no Node (tests/challenges.test.mjs).
import { parse, Interpreter, Builtin, Blocking, JiboiaError, STEP, WAIT, repr, jEq } from './lang/jiboia.js';

const MAX_INSTR = 20000;
const SEEDS = [11, 22, 33];

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
const ORES3 = ['minerio_ferro', 'minerio_cobre', 'quartzo'];
const fib = (n) => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; };

// metas: [prata, ouro] (menor ou igual ganha a medalha)
export const CHALLENGES = [
  {
    id: 'entrega', nome: 'Primeira entrega', icone: '📦',
    desc: 'Pegue cada item da entrada com <code>pegar()</code> e entregue do jeitinho que veio com <code>entregar(item)</code>.',
    exemplo: ['["minerio_ferro", "quartzo"]', '["minerio_ferro", "quartzo"]'],
    gen: (r) => Array.from({ length: int(r, 6, 10) }, () => pickR(r, ORES3)),
    solve: (inp) => inp,
    metas: { instr: [28, 19], linhas: [4, 2], vars: [1, 0] },
    premio: { dinheiro: 150, fichas: 1 }, libera: ['anunciar', 'anunciar(texto): mostra um aviso na tela do jogo'],
    inicial: '# pegar() tira o próximo item da entrada\n# entregar(x) manda x pra saída\n\nwhile True:\n    item = pegar()\n    entregar(item)\n',
  },
  {
    id: 'separar', nome: 'Separador esperto', icone: '🔀', lados: true,
    desc: 'Minério de ferro vai pra <code>"esquerda"</code>, todo o resto vai pra <code>"direita"</code>. Use <code>entregar(item, "esquerda")</code>.',
    exemplo: ['["minerio_ferro", "quartzo"]', '[esquerda: minerio_ferro, direita: quartzo]'],
    gen: (r) => Array.from({ length: int(r, 8, 12) }, () => pickR(r, ORES3)),
    solve: (inp) => inp.map((x) => [x, x === 'minerio_ferro' ? 'esquerda' : 'direita']),
    metas: { instr: [58, 43], linhas: [8, 6], vars: [2, 1] },
    premio: { dinheiro: 250, fichas: 1 }, libera: ['contar', 'contar(lista, x): quantas vezes x aparece na lista'],
  },
  {
    id: 'contador', nome: 'Contador de quartzo', icone: '🔢',
    desc: 'Conte quantos <code>"quartzo"</code> passaram e, no fim, entregue só o número. <code>tem_mais()</code> diz se ainda tem itens na entrada.',
    exemplo: ['["quartzo", "minerio_ferro", "quartzo"]', '[2]'],
    gen: (r) => Array.from({ length: int(r, 8, 14) }, () => pickR(r, ORES3)),
    solve: (inp) => [inp.filter((x) => x === 'quartzo').length],
    metas: { instr: [40, 29], linhas: [7, 5], vars: [2, 1] },
    premio: { dinheiro: 300, fichas: 1 }, libera: ['media', 'media(lista): a média dos números'],
  },
  {
    id: 'pares', nome: 'Só os pares', icone: '⚖️',
    desc: 'A entrada tem números. Entregue só os <b>pares</b>, na mesma ordem. Dica: <code>x % 2 == 0</code>.',
    exemplo: ['[3, 8, 5, 12]', '[8, 12]'],
    gen: (r) => Array.from({ length: int(r, 8, 12) }, () => int(r, 1, 60)),
    solve: (inp) => inp.filter((x) => x % 2 === 0),
    metas: { instr: [52, 38], linhas: [6, 4], vars: [2, 1] },
    premio: { dinheiro: 350, fichas: 1 }, libera: ['unicos', 'unicos(lista): a lista sem repetidos'],
  },
  {
    id: 'somar', nome: 'Pares de lingotes', icone: '➕',
    desc: 'Os números chegam em duplas. Entregue a <b>soma de cada dupla</b>.',
    exemplo: ['[2, 5, 10, 1]', '[7, 11]'],
    gen: (r) => Array.from({ length: 2 * int(r, 4, 6) }, () => int(r, 1, 30)),
    solve: (inp) => inp.flatMap((x, i) => (i % 2 ? [inp[i - 1] + x] : [])),
    metas: { instr: [18, 12], linhas: [4, 2], vars: [2, 0] },
    premio: { dinheiro: 400, fichas: 2 }, libera: ['mais_caro', 'mais_caro(lista): o item da lista com o maior preço agora'],
  },
  {
    id: 'maior', nome: 'Maior de cada lote', icone: '🏔️',
    desc: 'Os números vêm em lotes separados por <code>0</code>. Entregue o <b>maior número de cada lote</b>. A entrada sempre termina com 0.',
    exemplo: ['[3, 9, 2, 0, 4, 1, 0]', '[9, 4]'],
    gen: (r) => { const out = []; const n = int(r, 3, 4); for (let i = 0; i < n; i++) { const k = int(r, 2, 4); for (let j = 0; j < k; j++) out.push(int(r, 1, 50)); out.push(0); } return out; },
    solve: (inp) => { const out = []; let m = 0; for (const x of inp) { if (x === 0) { out.push(m); m = 0; } else m = Math.max(m, x); } return out; },
    metas: { instr: [110, 83], linhas: [10, 8], vars: [3, 2] },
    premio: { dinheiro: 500, fichas: 2 }, libera: ['maior_chave', 'maior_chave(dicionario): a chave com o maior valor'],
  },
  {
    id: 'montadora', nome: 'Montadora de cabeça', icone: '⚙️',
    desc: 'Chegam lingotes. A cada <b>2 lingotes de ferro</b> (contando todos), entregue <code>"engrenagem"</code>. Cada <b>lingote de cobre</b> vira 2 fios: entregue <code>"fio"</code> duas vezes.',
    exemplo: ['["lingote_ferro", "lingote_cobre", "lingote_ferro"]', '["fio", "fio", "engrenagem"]'],
    gen: (r) => Array.from({ length: int(r, 8, 12) }, () => pickR(r, ['lingote_ferro', 'lingote_ferro', 'lingote_cobre'])),
    solve: (inp) => { const out = []; let f = 0; for (const x of inp) { if (x === 'lingote_cobre') out.push('fio', 'fio'); else if (++f % 2 === 0) out.push('engrenagem'); } return out; },
    metas: { instr: [78, 58], linhas: [12, 10], vars: [3, 2] },
    premio: { dinheiro: 600, fichas: 2 }, libera: ['faltando', 'faltando(): dicionário com tudo que os contratos aceitos ainda pedem'],
  },
  {
    id: 'compressao', nome: 'Compressão de esteira', icone: '🗜️',
    desc: 'Itens iguais chegam em sequência. Entregue um texto por sequência, tipo <code>"3xferro"</code> (use f-string: <code>f"{n}x{item}"</code>).',
    exemplo: ['["ferro", "ferro", "cobre"]', '["2xferro", "1xcobre"]'],
    gen: (r) => { const out = []; const n = int(r, 3, 5); let last = null; for (let i = 0; i < n; i++) { let it; do it = pickR(r, ['ferro', 'cobre', 'quartzo']); while (it === last); last = it; for (let k = int(r, 1, 4); k > 0; k--) out.push(it); } return out; },
    solve: (inp) => { const out = []; let cur = null, n = 0; for (const x of inp) { if (x === cur) n++; else { if (cur) out.push(`${n}x${cur}`); cur = x; n = 1; } } if (cur) out.push(`${n}x${cur}`); return out; },
    metas: { instr: [65, 47], linhas: [13, 11], vars: [4, 3] },
    premio: { dinheiro: 700, fichas: 3 }, libera: ['relatorio', 'relatorio(): dicionário com dinheiro, nível, fichas, estrelas e contratos'],
  },
  {
    id: 'ordenar', nome: 'Fila de pedidos', icone: '📊',
    desc: 'Guarde todos os números e entregue em <b>ordem crescente</b>.',
    exemplo: ['[5, 1, 4]', '[1, 4, 5]'],
    gen: (r) => Array.from({ length: int(r, 5, 8) }, () => int(r, 1, 99)),
    solve: (inp) => [...inp].sort((a, b) => a - b),
    metas: { instr: [42, 30], linhas: [7, 5], vars: [3, 2] },
    premio: { dinheiro: 800, fichas: 3 }, libera: ['inverter', 'inverter(lista): a lista de trás pra frente'],
  },
  {
    id: 'fibonacci', nome: 'Espiral de Fibonacci', icone: '🌀',
    desc: 'Pra cada número <code>n</code> da entrada, entregue o <b>n-ésimo número de Fibonacci</b> (1, 1, 2, 3, 5, 8…: fib(1)=1, fib(2)=1).',
    exemplo: ['[1, 5, 7]', '[1, 5, 13]'],
    gen: (r) => Array.from({ length: int(r, 4, 6) }, () => int(r, 1, 18)),
    solve: (inp) => inp.map(fib),
    metas: { instr: [170, 120], linhas: [8, 6], vars: [5, 4] },
    premio: { dinheiro: 1200, fichas: 4 }, libera: ['chance', 'chance(p): True com probabilidade p (0 a 1)'],
  },
];
export const byId = (id) => CHALLENGES.find((c) => c.id === id);

// roda o programa numa entrada
export function runCase(code, ch, input) {
  let ast;
  try { ast = parse(code); } catch (e) { return { error: e.message, line: e.line }; }
  const out = [], logs = [];
  let idx = 0, ended = false;
  const never = new Blocking();
  never.label = 'fim da entrada';
  const builtins = {
    pegar: new Builtin('pegar', () => { if (idx >= input.length) { ended = true; return never; } return input[idx++]; }, 0, 0),
    tem_mais: new Builtin('tem_mais', () => idx < input.length, 0, 0),
    entregar: new Builtin('entregar', ([v, lado]) => {
      if (ch.lados) {
        if (lado !== 'esquerda' && lado !== 'direita') throw new JiboiaError('Neste desafio use entregar(item, "esquerda") ou entregar(item, "direita")');
        out.push([v, lado]);
      } else {
        if (lado !== undefined) throw new JiboiaError('Neste desafio é só entregar(x), sem lado');
        out.push(v);
      }
      return null;
    }, 1, 2),
  };
  const I = new Interpreter(ast, { print: (s) => logs.push(s), builtins });
  const gen = I.run();
  let instr = 0, vars = 0;
  try {
    for (;;) {
      const r = gen.next();
      if (r.done) break;
      if (r.value === STEP) {
        instr++;
        vars = Math.max(vars, I.varCount(I.frame));
        if (instr > MAX_INSTR) return { error: `O programa passou de ${MAX_INSTR} instruções (laço infinito?)`, line: I.line, out, logs };
      } else if (r.value === WAIT) {
        if (ended) break;
        return { error: 'O programa ficou esperando algo que nunca chega', line: I.line, out, logs };
      }
    }
  } catch (e) {
    return { error: e instanceof JiboiaError ? e.message : String(e.message || e), line: e.line ?? I.line, out, logs };
  }
  return { out, instr, vars, logs };
}
const same = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  try { return jEq(a, b); } catch { return a === b; }
};
export const countLines = (code) => code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
const show = (v) => (Array.isArray(v) ? `[${v.map(show).join(', ')}]` : repr(v));

// testa o programa em 3 entradas (sempre as mesmas, pra nota ser justa)
export function evaluate(code, ch) {
  const results = [];
  let instr = 0, vars = 0;
  const seeds = ch.seeds || SEEDS;
  for (const seed of seeds) {
    const input = ch.gen(rng(seed));
    const want = ch.solve(input);
    const r = runCase(code, ch, input);
    const fmtOut = (o) => (ch.lados ? o.map(([v, l]) => `${l}: ${repr(v)}`).join(', ') : o.map(show).join(', '));
    if (r.error) return { ok: false, error: r.error, line: r.line, input: show(input), want: fmtOut(want), got: fmtOut(r.out || []), logs: r.logs || [] };
    if (!same(r.out, want)) {
      const i = r.out.findIndex((x, k) => !same(x, want[k]));
      return { ok: false, error: i >= 0 ? `A saída ${i + 1} deveria ser ${fmtOut([want[i]])}, mas foi ${fmtOut([r.out[i]])}` : `Entregou ${r.out.length} coisa(s), mas eram ${want.length}`, input: show(input), want: fmtOut(want), got: fmtOut(r.out), logs: r.logs };
    }
    instr += r.instr; vars = Math.max(vars, r.vars);
    results.push(r);
  }
  return { ok: true, score: { instr: Math.round(instr / seeds.length), linhas: countLines(code), vars } };
}
export function medal(ch, k, v) {
  const [prata, ouro] = ch.metas[k];
  return v <= ouro ? 'ouro' : v <= prata ? 'prata' : 'bronze';
}
export const MEDAL_ICON = { ouro: '🥇', prata: '🥈', bronze: '🥉' };
