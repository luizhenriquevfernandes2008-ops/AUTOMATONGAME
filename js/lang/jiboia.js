// Jiboia — uma linguagem parecida com Python que roda devagarinho, linha por linha.
// Lexer -> Parser (AST) -> Interpretador baseado em generators (cada instrução = 1 "tick" de CPU).

export class JiboiaError extends Error {
  constructor(msg, line) { super(msg); this.line = line; }
}

const KEYWORDS = new Set(['if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'break',
  'continue', 'pass', 'and', 'or', 'not', 'True', 'False', 'None', 'global', 'is']);

// Apelidos em português — a Jiboia entende os dois jeitos.
const ALIASES = {
  se: 'if', senaose: 'elif', senao: 'else', enquanto: 'while', para: 'for', em: 'in',
  funcao: 'def', retorne: 'return', pare: 'break', continuar: 'continue', passe: 'pass',
  Verdadeiro: 'True', Falso: 'False', Nada: 'None', nao: 'not',
};

// ───────────────────────────── LEXER ─────────────────────────────
export function lex(src, lineOffset = 0) {
  const tokens = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const indents = [0];
  let depth = 0;
  const push = (t, v, line) => tokens.push({ t, v, line: line + lineOffset });

  for (let li = 0; li < lines.length; li++) {
    const ln = li + 1;
    const line = lines[li];
    let i = 0;
    let produced = false;
    if (depth === 0) {
      let col = 0;
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) { col += line[i] === '\t' ? 4 : 1; i++; }
      if (i >= line.length || line[i] === '#') continue;
      if (col > indents[indents.length - 1]) { indents.push(col); push('INDENT', null, ln); }
      else {
        while (col < indents[indents.length - 1]) { indents.pop(); push('DEDENT', null, ln); }
        if (col !== indents[indents.length - 1]) throw new JiboiaError('Indentação não bate com nenhum bloco acima (use sempre 4 espaços)', ln + lineOffset);
      }
    }
    while (i < line.length) {
      const c = line[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '#') break;
      produced = true;
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(line[i + 1] || ''))) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(line.slice(i));
        push('NUMBER', parseFloat(m[0]), ln); i += m[0].length; continue;
      }
      const isF = (c === 'f' || c === 'F') && (line[i + 1] === '"' || line[i + 1] === "'");
      if (c === '"' || c === "'" || isF) {
        if (isF) i++;
        const q = line[i]; i++;
        let s = '';
        for (;;) {
          if (i >= line.length) throw new JiboiaError('Texto sem fechar as aspas ' + q, ln + lineOffset);
          const ch = line[i];
          if (ch === '\\') {
            const n = line[i + 1];
            s += n === 'n' ? '\n' : n === 't' ? '\t' : n === undefined ? '' : n;
            i += 2; continue;
          }
          if (ch === q) { i++; break; }
          s += ch; i++;
        }
        push(isF ? 'FSTRING' : 'STRING', s, ln); continue;
      }
      if (/[A-Za-z_À-ɏ]/.test(c)) {
        const m = /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*/.exec(line.slice(i));
        let w = m[0]; i += w.length;
        if (ALIASES[w]) w = ALIASES[w];
        push(KEYWORDS.has(w) ? 'KW' : 'NAME', w, ln); continue;
      }
      const three = line.substr(i, 3), two = line.substr(i, 2);
      if (three === '**=' || three === '//=') { push('OP', three, ln); i += 3; continue; }
      if (['==', '!=', '<=', '>=', '**', '//', '+=', '-=', '*=', '/=', '%=', '->'].includes(two)) { push('OP', two, ln); i += 2; continue; }
      if ('+-*/%<>=()[]{},:.'.includes(c)) {
        if ('([{'.includes(c)) depth++;
        if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
        push('OP', c, ln); i++; continue;
      }
      throw new JiboiaError(`Caractere estranho '${c}'`, ln + lineOffset);
    }
    if (depth === 0 && produced) push('NEWLINE', null, ln);
  }
  if (depth > 0) throw new JiboiaError('Tem parêntese/colchete aberto que não foi fechado', lines.length + lineOffset);
  while (indents.length > 1) { indents.pop(); push('DEDENT', null, lines.length); }
  push('EOF', null, lines.length);
  return tokens;
}

// ───────────────────────────── PARSER ─────────────────────────────
function describe(tok) {
  if (!tok) return 'o fim';
  switch (tok.t) {
    case 'NEWLINE': return 'o fim da linha';
    case 'EOF': return 'o fim do código';
    case 'INDENT': return 'uma indentação';
    case 'DEDENT': return 'o fim do bloco';
    case 'STRING': return 'um texto';
    case 'NUMBER': return 'o número ' + tok.v;
    default: return `'${tok.v}'`;
  }
}

class Parser {
  constructor(tokens) { this.toks = tokens; this.p = 0; }
  peek(o = 0) { return this.toks[Math.min(this.p + o, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  is(t, v) { const k = this.peek(); return k.t === t && (v === undefined || k.v === v); }
  isOp(v) { return this.is('OP', v); }
  isKw(v) { return this.is('KW', v); }
  accept(t, v) { return this.is(t, v) ? this.next() : null; }
  expect(t, v, msg) {
    if (this.is(t, v)) return this.next();
    const k = this.peek();
    throw new JiboiaError(msg || `Esperava '${v || t}' mas encontrei ${describe(k)}`, k.line);
  }

  program() {
    const body = [];
    while (!this.is('EOF')) {
      if (this.accept('NEWLINE')) continue;
      body.push(this.stmt());
    }
    return body;
  }

  stmt() {
    const k = this.peek();
    if (k.t === 'INDENT') throw new JiboiaError('Indentação inesperada aqui', k.line);
    if (k.t === 'KW') {
      if (k.v === 'if') return this.ifStmt();
      if (k.v === 'while') return this.whileStmt();
      if (k.v === 'for') return this.forStmt();
      if (k.v === 'def') return this.defStmt();
      if (k.v === 'elif' || k.v === 'else') throw new JiboiaError(`'${k.v}' sem um 'if' antes (confira a indentação)`, k.line);
    }
    const s = this.simple();
    if (!this.accept('NEWLINE') && !this.is('EOF') && !this.is('DEDENT')) {
      throw new JiboiaError(`Esperava o fim da linha mas encontrei ${describe(this.peek())}`, this.peek().line);
    }
    return s;
  }

  block() {
    this.expect('OP', ':', "Faltou ':' no fim da linha");
    if (this.accept('NEWLINE')) {
      if (!this.accept('INDENT')) throw new JiboiaError('Esperava um bloco indentado aqui (4 espaços pra dentro)', this.peek().line);
      const body = [];
      while (!this.accept('DEDENT')) {
        if (this.is('EOF')) break;
        if (this.accept('NEWLINE')) continue;
        body.push(this.stmt());
      }
      return body;
    }
    const s = this.simple();
    this.accept('NEWLINE');
    return [s];
  }

  ifStmt() {
    const line = this.next().line;
    const test = this.expr();
    const body = this.block();
    let orelse = null;
    if (this.isKw('elif')) orelse = [this.ifStmt()];
    else if (this.accept('KW', 'else')) orelse = this.block();
    return { type: 'If', line, test, body, orelse };
  }

  whileStmt() {
    const line = this.next().line;
    const test = this.expr();
    return { type: 'While', line, test, body: this.block() };
  }

  forStmt() {
    const line = this.next().line;
    const targets = [this.expect('NAME', undefined, 'Esperava o nome de uma variável depois do for').v];
    while (this.accept('OP', ',')) targets.push(this.expect('NAME').v);
    this.expect('KW', 'in', "Faltou o 'in' no for (ex: for i in range(10):)");
    const iter = this.expr();
    return { type: 'For', line, targets, iter, body: this.block() };
  }

  defStmt() {
    const line = this.next().line;
    const name = this.expect('NAME', undefined, 'Esperava o nome da função').v;
    this.expect('OP', '(');
    const params = [], defaults = [];
    while (!this.isOp(')')) {
      params.push(this.expect('NAME', undefined, 'Esperava o nome de um parâmetro').v);
      if (this.accept('OP', '=')) defaults.push(this.expr());
      else if (defaults.length) throw new JiboiaError('Parâmetro sem valor padrão depois de um com valor padrão', line);
      if (!this.accept('OP', ',')) break;
    }
    this.expect('OP', ')');
    return { type: 'Def', line, name, params, defaults, body: this.block() };
  }

  simple() {
    const k = this.peek();
    const line = k.line;
    if (k.t === 'KW') {
      switch (k.v) {
        case 'pass': this.next(); return { type: 'Pass', line };
        case 'break': this.next(); return { type: 'Break', line };
        case 'continue': this.next(); return { type: 'Continue', line };
        case 'return': {
          this.next();
          const value = (this.is('NEWLINE') || this.is('EOF') || this.is('DEDENT')) ? null : this.exprList();
          return { type: 'Return', line, value };
        }
        case 'global': {
          this.next();
          const names = [this.expect('NAME').v];
          while (this.accept('OP', ',')) names.push(this.expect('NAME').v);
          return { type: 'Global', line, names };
        }
      }
    }
    const e = this.exprList();
    const op = this.peek();
    if (op.t === 'OP' && ['=', '+=', '-=', '*=', '/=', '//=', '%=', '**='].includes(op.v)) {
      this.next();
      this.checkTarget(e, op.v !== '=');
      const value = this.exprList();
      if (op.v === '=') {
        // encadeado: a = b = 0
        if (this.isOp('=')) {
          const targets = [e]; let v = value;
          while (this.accept('OP', '=')) { this.checkTarget(v, false); targets.push(v); v = this.exprList(); }
          return { type: 'Assign', line, targets, value: v };
        }
        return { type: 'Assign', line, targets: [e], value };
      }
      return { type: 'AugAssign', line, target: e, op: op.v.slice(0, -1), value };
    }
    return { type: 'Expr', line, expr: e };
  }

  checkTarget(e, aug) {
    if (e.type === 'Name' || e.type === 'Index') return;
    if (!aug && e.type === 'List' && e.tuple && e.items.every(x => x.type === 'Name' || x.type === 'Index')) return;
    throw new JiboiaError('Não dá pra atribuir um valor a isso (só a variáveis ou posições de lista)', e.line);
  }

  exprList() {
    const first = this.expr();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.accept('OP', ',')) {
      if (this.is('NEWLINE') || this.isOp('=') || this.is('EOF')) break;
      items.push(this.expr());
    }
    return { type: 'List', line: first.line, items, tuple: true };
  }

  expr() {
    const e = this.orExpr();
    if (this.isKw('if')) {
      this.next();
      const test = this.orExpr();
      this.expect('KW', 'else', "Esperava 'else' na expressão condicional");
      const alt = this.expr();
      return { type: 'IfExp', line: e.line, test, body: e, alt };
    }
    return e;
  }
  orExpr() {
    let l = this.andExpr();
    while (this.isKw('or')) { const line = this.next().line; l = { type: 'Bool', op: 'or', l, r: this.andExpr(), line }; }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.isKw('and')) { const line = this.next().line; l = { type: 'Bool', op: 'and', l, r: this.notExpr(), line }; }
    return l;
  }
  notExpr() {
    if (this.isKw('not')) { const line = this.next().line; return { type: 'Unary', op: 'not', v: this.notExpr(), line }; }
    return this.compare();
  }
  compare() {
    let l = this.add();
    const ops = [], rights = [];
    for (;;) {
      const k = this.peek();
      let op = null;
      if (k.t === 'OP' && ['==', '!=', '<', '>', '<=', '>='].includes(k.v)) { this.next(); op = k.v; }
      else if (k.t === 'KW' && k.v === 'in') { this.next(); op = 'in'; }
      else if (k.t === 'KW' && k.v === 'not' && this.peek(1).t === 'KW' && this.peek(1).v === 'in') { this.next(); this.next(); op = 'not in'; }
      else if (k.t === 'KW' && k.v === 'is') {
        this.next();
        op = this.accept('KW', 'not') ? 'is not' : 'is';
      }
      if (!op) break;
      ops.push(op); rights.push(this.add());
    }
    if (!ops.length) return l;
    return { type: 'Compare', line: l.line, l, ops, rights };
  }
  add() {
    let l = this.mul();
    while (this.isOp('+') || this.isOp('-')) { const t = this.next(); l = { type: 'Bin', op: t.v, l, r: this.mul(), line: t.line }; }
    return l;
  }
  mul() {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) { const t = this.next(); l = { type: 'Bin', op: t.v, l, r: this.unary(), line: t.line }; }
    return l;
  }
  unary() {
    if (this.isOp('-') || this.isOp('+')) { const t = this.next(); return { type: 'Unary', op: t.v, v: this.unary(), line: t.line }; }
    return this.power();
  }
  power() {
    const b = this.postfix();
    if (this.isOp('**')) { const t = this.next(); return { type: 'Bin', op: '**', l: b, r: this.unary(), line: t.line }; }
    return b;
  }
  postfix() {
    let e = this.atom();
    for (;;) {
      if (this.isOp('(')) {
        const line = this.next().line;
        const args = [];
        while (!this.isOp(')')) {
          args.push(this.expr());
          if (!this.accept('OP', ',')) break;
        }
        this.expect('OP', ')', "Faltou fechar o parêntese ')' da chamada");
        e = { type: 'Call', fn: e, args, line };
      } else if (this.isOp('[')) {
        const line = this.next().line;
        const idx = this.expr();
        this.expect('OP', ']', "Faltou fechar o colchete ']'");
        e = { type: 'Index', obj: e, idx, line };
      } else if (this.isOp('.')) {
        const line = this.next().line;
        const name = this.expect('NAME', undefined, "Esperava um nome depois do '.'").v;
        e = { type: 'Attr', obj: e, name, line };
      } else break;
    }
    return e;
  }
  atom() {
    const k = this.next();
    const line = k.line;
    switch (k.t) {
      case 'NUMBER': return { type: 'Const', v: k.v, line };
      case 'STRING': {
        let s = k.v;
        while (this.is('STRING')) s += this.next().v;
        return { type: 'Const', v: s, line };
      }
      case 'FSTRING': return this.fstring(k.v, line);
      case 'NAME': return { type: 'Name', name: k.v, line };
      case 'KW':
        if (k.v === 'True') return { type: 'Const', v: true, line };
        if (k.v === 'False') return { type: 'Const', v: false, line };
        if (k.v === 'None') return { type: 'Const', v: null, line };
        break;
      case 'OP':
        if (k.v === '(') {
          if (this.accept('OP', ')')) return { type: 'List', items: [], tuple: true, line };
          const e = this.expr();
          if (this.isOp(',')) {
            const items = [e];
            while (this.accept('OP', ',')) { if (this.isOp(')')) break; items.push(this.expr()); }
            this.expect('OP', ')');
            return { type: 'List', items, tuple: true, line };
          }
          this.expect('OP', ')', "Faltou fechar o parêntese ')'");
          return e;
        }
        if (k.v === '[') {
          const items = [];
          while (!this.isOp(']')) { items.push(this.expr()); if (!this.accept('OP', ',')) break; }
          this.expect('OP', ']', "Faltou fechar a lista com ']'");
          return { type: 'List', items, line };
        }
        if (k.v === '{') {
          const keys = [], vals = [];
          while (!this.isOp('}')) {
            keys.push(this.expr()); this.expect('OP', ':', "Esperava ':' entre chave e valor do dicionário");
            vals.push(this.expr());
            if (!this.accept('OP', ',')) break;
          }
          this.expect('OP', '}', "Faltou fechar o dicionário com '}'");
          return { type: 'Dict', keys, vals, line };
        }
        break;
    }
    throw new JiboiaError(`Não esperava ${describe(k)} aqui`, line);
  }

  fstring(raw, line) {
    const parts = [];
    let buf = '', i = 0;
    while (i < raw.length) {
      const c = raw[i];
      if (c === '{' && raw[i + 1] === '{') { buf += '{'; i += 2; continue; }
      if (c === '}' && raw[i + 1] === '}') { buf += '}'; i += 2; continue; }
      if (c === '{') {
        const end = raw.indexOf('}', i);
        if (end < 0) throw new JiboiaError("f-string com '{' sem '}'", line);
        let inner = raw.slice(i + 1, end), spec = null;
        const colon = inner.lastIndexOf(':');
        if (colon > 0 && /^[.\d]*[fd%]?$/.test(inner.slice(colon + 1))) { spec = inner.slice(colon + 1); inner = inner.slice(0, colon); }
        if (buf) { parts.push({ type: 'Const', v: buf, line }); buf = ''; }
        const sub = new Parser(lex(inner, line - 1));
        const e = sub.expr();
        sub.accept('NEWLINE');
        if (!sub.is('EOF')) throw new JiboiaError('Expressão estranha dentro da f-string', line);
        parts.push({ type: 'Format', v: e, spec, line });
        i = end + 1; continue;
      }
      buf += c; i++;
    }
    if (buf || !parts.length) parts.push({ type: 'Const', v: buf, line });
    return { type: 'FString', parts, line };
  }
}

export function parse(src, lib = null) {
  const ast = new Parser(lex(src)).program();
  if (lib) markLib(ast, lib);
  return ast;
}

// marca os nós de uma biblioteca (pra mensagens de erro dizerem de onde veio)
function markLib(node, lib) {
  if (Array.isArray(node)) { node.forEach((n) => markLib(n, lib)); return; }
  if (!node || typeof node !== 'object') return;
  if (node.type && node.line) node.lib = lib;
  for (const k of Object.keys(node)) if (k !== 'lib' && node[k] && typeof node[k] === 'object') markLib(node[k], lib);
}

// ─────────────────────────── VALORES ───────────────────────────
export class JDict {
  constructor(entries) { this.m = new Map(entries || []); }
}
export class JRange {
  constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; }
  get length() { return Math.max(0, Math.ceil((this.stop - this.start) / this.step)); }
  at(i) { return this.start + i * this.step; }
}
export class Builtin {
  // isGen: fn é um generator que roda dentro do interpretador (pode chamar funções Jiboia e gastar tempo)
  constructor(name, fn, minArgs = 0, maxArgs = Infinity, isGen = false) { this.name = name; this.fn = fn; this.minArgs = minArgs; this.maxArgs = maxArgs; this.isGen = isGen; }
}
export class Blocking {
  constructor() { this.done = false; this.value = null; this.error = null; this.label = ''; }
  resolve(v = null) { if (!this.done) { this.done = true; this.value = v; } }
  fail(msg) { if (!this.done) { this.done = true; this.error = msg; } }
}
class JFunc {
  constructor(node, closure) { this.node = node; this.name = node.name; this.closure = closure; }
}

export const STEP = 'step';
export const WAIT = 'wait';

class BreakSig { }
class ContinueSig { }
class ReturnSig { constructor(v) { this.v = v; } }

export function typeName(v) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return 'booleano';
  if (typeof v === 'number') return 'número';
  if (typeof v === 'string') return 'texto';
  if (Array.isArray(v)) return 'lista';
  if (v instanceof JDict) return 'dicionário';
  if (v instanceof JRange) return 'range';
  if (v instanceof JFunc || v instanceof Builtin) return 'função';
  if (v && v.jTypeName) return v.jTypeName;
  return 'objeto';
}

export function fmtNum(n) {
  if (!isFinite(n)) return n > 0 ? 'inf' : n < 0 ? '-inf' : 'nan';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e6) / 1e6);
}

export function repr(v) {
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  return str(v);
}

export function str(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']';
  if (v instanceof JDict) return '{' + [...v.m].map(([k, x]) => repr(k) + ': ' + repr(x)).join(', ') + '}';
  if (v instanceof JRange) return `range(${v.start}, ${v.stop}${v.step !== 1 ? ', ' + v.step : ''})`;
  if (v instanceof JFunc) return `<função ${v.name}>`;
  if (v instanceof Builtin) return `<função ${v.name}>`;
  if (v && v.jStr) return v.jStr();
  return String(v);
}

export function truthy(v) {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string' || Array.isArray(v)) return v.length > 0;
  if (v instanceof JDict) return v.m.size > 0;
  if (v instanceof JRange) return v.length > 0;
  return true;
}

export function jEq(a, b) {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => jEq(x, b[i]));
  if (a instanceof JDict && b instanceof JDict) {
    if (a.m.size !== b.m.size) return false;
    for (const [k, v] of a.m) if (!b.m.has(k) || !jEq(v, b.m.get(k))) return false;
    return true;
  }
  if (a && a.jEq) return a.jEq(b);
  return false;
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
export function suggest(name, candidates) {
  let best = null, bd = 3;
  for (const c of candidates) {
    const dd = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (dd < bd) { bd = dd; best = c; }
  }
  return best;
}

function toIter(v, line) {
  if (Array.isArray(v)) return v.slice();
  if (typeof v === 'string') return [...v];
  if (v instanceof JDict) return [...v.m.keys()];
  if (v instanceof JRange) return v;
  throw new JiboiaError(`Não dá pra percorrer ${typeName(v)} com for`, line);
}

// ───────────────────────── INTERPRETADOR ─────────────────────────
export class Interpreter {
  constructor(ast, opts = {}) {
    this.ast = ast;
    this.globals = new Map();
    this.builtins = new Map();
    this.print = opts.print || ((s) => console.log(s));
    this.limits = opts.limits || null; // () => { vars, lista } (memória do computador)
    this.line = 0;
    this.depth = 0;
    this.waitLabel = '';
    installStdlib(this);
    if (opts.builtins) for (const [k, v] of Object.entries(opts.builtins)) this.builtins.set(k, v);
    this.globalFrame = { vars: this.globals, globalNames: new Set(), isGlobal: true };
  }

  *run() {
    yield* this.execBlock(this.ast, this.globalFrame);
  }

  err(msg, line) { const e = new JiboiaError(msg, line ?? this.line); e.lib = this.lib; return e; }

  lookup(name, f, line) {
    if (!f.isGlobal && f.vars.has(name)) return f.vars.get(name);
    if (f.closure && f.closure.has(name)) return f.closure.get(name);
    if (this.globals.has(name)) return this.globals.get(name);
    if (this.builtins.has(name)) return this.builtins.get(name);
    const cands = [...this.globals.keys(), ...this.builtins.keys(), ...(f.isGlobal ? [] : f.vars.keys())];
    const s = suggest(name, cands);
    throw this.err(`A variável '${name}' não existe` + (s ? `. Você quis dizer '${s}'?` : ''), line);
  }

  setVar(name, v, f) {
    const map = f.isGlobal || f.globalNames.has(name) ? this.globals : f.vars;
    if (this.limits && !map.has(name) && !(v && v.node)) {
      const lim = this.limits().vars;
      if (this.varCount(f) >= lim) throw this.err(`Memória cheia: este computador guarda só ${lim} variáveis. Melhore a memória no ⚙ Hardware do editor (ou reaproveite variáveis)`);
    }
    map.set(name, v);
  }
  // variáveis de dados em uso (funções não contam)
  varCount(f) {
    let n = 0;
    const count = (m) => { for (const v of m.values()) if (!(v && v.node) && !(v instanceof Builtin)) n++; };
    count(this.globals);
    if (f && !f.isGlobal) count(f.vars);
    return n;
  }
  checkListRoom(obj, add, line) {
    if (!this.limits) return;
    const lim = this.limits().lista;
    if (obj.length + add > lim) throw this.err(`Lista cheia: a memória deste computador aguenta ${lim} itens por lista. Tire itens velhos com .pop(0) ou melhore a memória no ⚙ Hardware`, line);
  }

  *execBlock(stmts, f) {
    for (const s of stmts) yield* this.exec(s, f);
  }

  *exec(s, f) {
    this.line = s.line;
    this.lib = s.lib || null;
    this.frame = f;
    yield STEP;
    this.lib = s.lib || null;
    this.frame = f;
    switch (s.type) {
      case 'Expr': yield* this.ev(s.expr, f); return;
      case 'Assign': {
        const v = yield* this.ev(s.value, f);
        for (const t of s.targets) yield* this.assignTo(t, v, f);
        return;
      }
      case 'AugAssign': {
        const cur = yield* this.ev(s.target, f);
        const r = yield* this.ev(s.value, f);
        const v = this.binop(s.op, cur, r, s.line);
        yield* this.assignTo(s.target, v, f);
        return;
      }
      case 'If': {
        const t = yield* this.ev(s.test, f);
        if (truthy(t)) yield* this.execBlock(s.body, f);
        else if (s.orelse) yield* this.execBlock(s.orelse, f);
        return;
      }
      case 'While': {
        for (;;) {
          this.line = s.line;
          const t = yield* this.ev(s.test, f);
          if (!truthy(t)) break;
          try { yield* this.execBlock(s.body, f); }
          catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) { this.line = s.line; yield STEP; continue; }
            throw e;
          }
          this.line = s.line;
          yield STEP;
        }
        return;
      }
      case 'For': {
        const it = toIter(yield* this.ev(s.iter, f), s.line);
        const n = it.length;
        for (let i = 0; i < n; i++) {
          const v = it instanceof JRange ? it.at(i) : it[i];
          if (s.targets.length === 1) this.setVar(s.targets[0], v, f);
          else {
            const parts = toIter(v, s.line);
            if (parts.length !== s.targets.length) throw this.err(`Esperava ${s.targets.length} valores pra desempacotar, veio ${parts.length}`, s.line);
            s.targets.forEach((nm, j) => this.setVar(nm, parts[j], f));
          }
          try { yield* this.execBlock(s.body, f); }
          catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
          if (i < n - 1) { this.line = s.line; yield STEP; }
        }
        return;
      }
      case 'Def': {
        const defaults = [];
        for (const d of s.defaults) defaults.push(yield* this.ev(d, f));
        const fn = new JFunc(s, f.isGlobal ? null : new Map([...(f.closure || []), ...f.vars]));
        fn.defaults = defaults;
        this.setVar(s.name, fn, f);
        return;
      }
      case 'Return': {
        if (f.isGlobal) throw this.err("'return' fora de uma função", s.line);
        const v = s.value ? yield* this.ev(s.value, f) : null;
        throw new ReturnSig(v);
      }
      case 'Break': throw new BreakSig();
      case 'Continue': throw new ContinueSig();
      case 'Pass': return;
      case 'Global': for (const n of s.names) f.globalNames.add(n); return;
    }
    throw this.err('Instrução desconhecida: ' + s.type, s.line);
  }

  *assignTo(t, v, f) {
    if (t.type === 'Name') { this.setVar(t.name, v, f); return; }
    if (t.type === 'Index') {
      const obj = yield* this.ev(t.obj, f);
      const idx = yield* this.ev(t.idx, f);
      if (Array.isArray(obj)) {
        const i = this.listIndex(obj, idx, t.line);
        obj[i] = v; return;
      }
      if (obj instanceof JDict) { obj.m.set(this.dictKey(idx, t.line), v); return; }
      throw this.err(`Não dá pra mudar itens de ${typeName(obj)}`, t.line);
    }
    if (t.type === 'List') {
      const parts = toIter(v, t.line);
      const arr = parts instanceof JRange ? Array.from({ length: parts.length }, (_, i) => parts.at(i)) : parts;
      if (arr.length !== t.items.length) throw this.err(`Esperava ${t.items.length} valores pra desempacotar, veio ${arr.length}`, t.line);
      for (let i = 0; i < arr.length; i++) yield* this.assignTo(t.items[i], arr[i], f);
    }
  }

  listIndex(arr, idx, line) {
    if (typeof idx !== 'number' || !Number.isInteger(idx)) throw this.err(`Índice de lista precisa ser número inteiro, não ${typeName(idx)}`, line);
    const i = idx < 0 ? arr.length + idx : idx;
    if (i < 0 || i >= arr.length) throw this.err(`Índice ${idx} fora da lista (tamanho ${arr.length})`, line);
    return i;
  }
  dictKey(k, line) {
    if (typeof k === 'string' || typeof k === 'number' || typeof k === 'boolean' || k === null) return k;
    throw this.err(`Chave de dicionário não pode ser ${typeName(k)}`, line);
  }

  *ev(e, f) {
    switch (e.type) {
      case 'Const': return e.v;
      case 'Name': return this.lookup(e.name, f, e.line);
      case 'List': {
        const out = [];
        for (const it of e.items) out.push(yield* this.ev(it, f));
        return out;
      }
      case 'Dict': {
        const d = new JDict();
        for (let i = 0; i < e.keys.length; i++) {
          const k = yield* this.ev(e.keys[i], f);
          d.m.set(this.dictKey(k, e.line), yield* this.ev(e.vals[i], f));
        }
        return d;
      }
      case 'FString': {
        let s = '';
        for (const p of e.parts) {
          if (p.type === 'Const') s += p.v;
          else {
            const v = yield* this.ev(p.v, f);
            s += formatSpec(v, p.spec);
          }
        }
        return s;
      }
      case 'Bin': {
        const l = yield* this.ev(e.l, f);
        const r = yield* this.ev(e.r, f);
        return this.binop(e.op, l, r, e.line);
      }
      case 'Unary': {
        const v = yield* this.ev(e.v, f);
        if (e.op === 'not') return !truthy(v);
        if (typeof v !== 'number') throw this.err(`Não dá pra usar '${e.op}' em ${typeName(v)}`, e.line);
        return e.op === '-' ? -v : v;
      }
      case 'Bool': {
        const l = yield* this.ev(e.l, f);
        if (e.op === 'and') return truthy(l) ? yield* this.ev(e.r, f) : l;
        return truthy(l) ? l : yield* this.ev(e.r, f);
      }
      case 'Compare': {
        let l = yield* this.ev(e.l, f);
        for (let i = 0; i < e.ops.length; i++) {
          const r = yield* this.ev(e.rights[i], f);
          if (!this.cmp(e.ops[i], l, r, e.line)) return false;
          l = r;
        }
        return true;
      }
      case 'IfExp': {
        const t = yield* this.ev(e.test, f);
        return truthy(t) ? yield* this.ev(e.body, f) : yield* this.ev(e.alt, f);
      }
      case 'Index': {
        const obj = yield* this.ev(e.obj, f);
        const idx = yield* this.ev(e.idx, f);
        if (Array.isArray(obj)) return obj[this.listIndex(obj, idx, e.line)];
        if (typeof obj === 'string') return obj[this.listIndex(obj, idx, e.line)];
        if (obj instanceof JRange) return obj.at(this.listIndex({ length: obj.length }, idx, e.line));
        if (obj instanceof JDict) {
          const k = this.dictKey(idx, e.line);
          if (!obj.m.has(k)) throw this.err(`A chave ${repr(k)} não existe no dicionário`, e.line);
          return obj.m.get(k);
        }
        throw this.err(`Não dá pra usar [ ] em ${typeName(obj)}`, e.line);
      }
      case 'Attr': {
        const obj = yield* this.ev(e.obj, f);
        return this.getAttr(obj, e.name, e.line);
      }
      case 'Call': {
        const fn = yield* this.ev(e.fn, f);
        const args = [];
        for (const a of e.args) args.push(yield* this.ev(a, f));
        return yield* this.call(fn, args, e.line);
      }
    }
    throw this.err('Expressão desconhecida: ' + e.type, e.line);
  }

  *call(fn, args, line) {
    if (fn instanceof Builtin && fn.isGen) {
      if (args.length < fn.minArgs || args.length > fn.maxArgs) throw this.err(`() recebeu  argumento(s), o que não é aceito`, line);
      try { const r = yield* fn.fn(args, this, line); return r === undefined ? null : r; }
      catch (err) {
        if (err instanceof JiboiaError) { if (err.line == null) err.line = line; throw err; }
        if (err instanceof ReturnSig || err instanceof BreakSig || err instanceof ContinueSig) throw err;
        throw this.err(String(err.message || err), line);
      }
    }
    if (fn instanceof Builtin) {
      if (args.length < fn.minArgs || args.length > fn.maxArgs) {
        const exp = fn.minArgs === fn.maxArgs ? fn.minArgs : fn.maxArgs === Infinity ? `pelo menos ${fn.minArgs}` : `de ${fn.minArgs} a ${fn.maxArgs}`;
        throw this.err(`${fn.name}() recebe ${exp} argumento(s), mas recebeu ${args.length}`, line);
      }
      let r;
      try { r = fn.fn(args, this, line); }
      catch (err) {
        if (err instanceof JiboiaError) { if (err.line == null) err.line = line; throw err; }
        throw this.err(String(err.message || err), line);
      }
      if (r instanceof Blocking) {
        this.waitLabel = r.label || fn.name;
        this.currentBlocking = r;
        while (!r.done) yield WAIT;
        this.currentBlocking = null;
        this.waitLabel = '';
        if (r.error) throw this.err(r.error, line);
        return r.value;
      }
      return r === undefined ? null : r;
    }
    if (fn instanceof JFunc) {
      const n = fn.node;
      const nReq = n.params.length - fn.defaults.length;
      if (args.length < nReq || args.length > n.params.length) {
        throw this.err(`${fn.name}() recebe ${nReq === n.params.length ? nReq : `de ${nReq} a ${n.params.length}`} argumento(s), mas recebeu ${args.length}`, line);
      }
      if (this.depth > 150) throw this.err('Recursão profunda demais (função chamando a si mesma sem parar?)', line);
      const vars = new Map();
      n.params.forEach((p, i) => vars.set(p, i < args.length ? args[i] : fn.defaults[i - nReq]));
      const frame = { vars, globalNames: new Set(), isGlobal: false, closure: fn.closure };
      // detecta 'global' declarado no corpo
      this.depth++;
      const saveLine = this.line;
      try {
        yield* this.execBlock(n.body, frame);
      } catch (e) {
        if (e instanceof ReturnSig) return e.v;
        if (e instanceof BreakSig || e instanceof ContinueSig) throw this.err("'break'/'continue' fora de um laço", this.line);
        throw e;
      } finally {
        this.depth--;
        this.line = saveLine;
      }
      return null;
    }
    throw this.err(`${typeName(fn)} não é uma função, não dá pra chamar com ( )`, line);
  }

  binop(op, l, r, line) {
    const num = typeof l === 'number' && typeof r === 'number';
    const numb = (x) => typeof x === 'number' || typeof x === 'boolean';
    if (numb(l) && numb(r)) { l = +l; r = +r; }
    switch (op) {
      case '+':
        if (typeof l === 'number' && typeof r === 'number') return l + r;
        if (typeof l === 'string' && typeof r === 'string') return l + r;
        if (Array.isArray(l) && Array.isArray(r)) return l.concat(r);
        if (typeof l === 'string' || typeof r === 'string') throw this.err(`Não dá pra somar ${typeName(l)} com ${typeName(r)}. Dica: use str(x) pra virar texto`, line);
        break;
      case '-': if (typeof l === 'number' && typeof r === 'number') return l - r; break;
      case '*':
        if (typeof l === 'number' && typeof r === 'number') return l * r;
        if (typeof l === 'string' && typeof r === 'number') return l.repeat(Math.max(0, r | 0));
        if (typeof r === 'string' && typeof l === 'number') return r.repeat(Math.max(0, l | 0));
        if (Array.isArray(l) && typeof r === 'number') { let o = []; for (let i = 0; i < r; i++) o = o.concat(l); return o; }
        break;
      case '/':
        if (typeof l === 'number' && typeof r === 'number') { if (r === 0) throw this.err('Divisão por zero!', line); return l / r; }
        break;
      case '//':
        if (typeof l === 'number' && typeof r === 'number') { if (r === 0) throw this.err('Divisão por zero!', line); return Math.floor(l / r); }
        break;
      case '%':
        if (typeof l === 'number' && typeof r === 'number') { if (r === 0) throw this.err('Divisão por zero!', line); return ((l % r) + r) % r; }
        break;
      case '**': if (typeof l === 'number' && typeof r === 'number') return Math.pow(l, r); break;
    }
    void num;
    throw this.err(`Não dá pra fazer ${typeName(l)} ${op} ${typeName(r)}`, line);
  }

  cmp(op, l, r, line) {
    switch (op) {
      case '==': return jEq(l, r);
      case '!=': return !jEq(l, r);
      case 'is': return l === r || (l == null && r == null);
      case 'is not': return !(l === r || (l == null && r == null));
      case 'in': case 'not in': {
        let res;
        if (Array.isArray(r)) res = r.some(x => jEq(x, l));
        else if (typeof r === 'string') { if (typeof l !== 'string') throw this.err("'in' com texto precisa de texto dos dois lados", line); res = r.includes(l); }
        else if (r instanceof JDict) res = r.m.has(l);
        else if (r instanceof JRange) res = typeof l === 'number' && Number.isInteger(l) && (r.step > 0 ? l >= r.start && l < r.stop : l <= r.start && l > r.stop) && (l - r.start) % r.step === 0;
        else throw this.err(`Não dá pra usar 'in' com ${typeName(r)}`, line);
        return op === 'in' ? res : !res;
      }
    }
    const ok = (typeof l === 'number' || typeof l === 'boolean') && (typeof r === 'number' || typeof r === 'boolean') || (typeof l === 'string' && typeof r === 'string');
    if (!ok) throw this.err(`Não dá pra comparar ${typeName(l)} com ${typeName(r)} usando '${op}'`, line);
    switch (op) {
      case '<': return l < r;
      case '>': return l > r;
      case '<=': return l <= r;
      case '>=': return l >= r;
    }
    return false;
  }

  getAttr(obj, name, line) {
    const B = (fn, min = 0, max = min) => new Builtin(name, fn, min, max);
    if (Array.isArray(obj)) {
      switch (name) {
        case 'append': case 'adicionar': return B(([x]) => { this.checkListRoom(obj, 1, line); obj.push(x); return null; }, 1);
        case 'pop': case 'tirar': return B((a) => {
          if (!obj.length) throw this.err('pop() numa lista vazia', line);
          if (!a.length) return obj.pop();
          return obj.splice(this.listIndex(obj, a[0], line), 1)[0];
        }, 0, 1);
        case 'insert': return B(([i, x]) => { this.checkListRoom(obj, 1, line); obj.splice(i < 0 ? Math.max(0, obj.length + i) : i, 0, x); return null; }, 2);
        case 'remove': return B(([x]) => {
          const i = obj.findIndex(y => jEq(x, y));
          if (i < 0) throw this.err(`${repr(x)} não está na lista`, line);
          obj.splice(i, 1); return null;
        }, 1);
        case 'index': return B(([x]) => {
          const i = obj.findIndex(y => jEq(x, y));
          if (i < 0) throw this.err(`${repr(x)} não está na lista`, line);
          return i;
        }, 1);
        case 'count': return B(([x]) => obj.filter(y => jEq(x, y)).length, 1);
        case 'clear': return B(() => { obj.length = 0; return null; });
        case 'reverse': return B(() => { obj.reverse(); return null; });
        case 'sort': return B(() => { obj.sort(sortCmp); return null; });
        case 'copy': return B(() => obj.slice());
      }
    } else if (typeof obj === 'string') {
      switch (name) {
        case 'upper': return B(() => obj.toUpperCase());
        case 'lower': return B(() => obj.toLowerCase());
        case 'strip': return B(() => obj.trim());
        case 'split': return B((a) => a.length ? obj.split(a[0]) : obj.trim().split(/\s+/).filter(Boolean), 0, 1);
        case 'replace': return B(([a, b]) => obj.split(a).join(b), 2);
        case 'startswith': return B(([a]) => obj.startsWith(a), 1);
        case 'endswith': return B(([a]) => obj.endsWith(a), 1);
        case 'find': return B(([a]) => obj.indexOf(a), 1);
        case 'join': return B(([l]) => toIter(l, line).map(str).join(obj), 1);
        case 'count': return B(([a]) => obj.split(a).length - 1, 1);
        case 'isdigit': return B(() => /^\d+$/.test(obj));
      }
    } else if (obj instanceof JDict) {
      switch (name) {
        case 'keys': return B(() => [...obj.m.keys()]);
        case 'values': return B(() => [...obj.m.values()]);
        case 'items': return B(() => [...obj.m].map(([k, v]) => [k, v]));
        case 'get': return B((a) => obj.m.has(a[0]) ? obj.m.get(a[0]) : (a.length > 1 ? a[1] : null), 1, 2);
        case 'pop': return B((a) => { const v = obj.m.has(a[0]) ? obj.m.get(a[0]) : (a.length > 1 ? a[1] : null); obj.m.delete(a[0]); return v; }, 1, 2);
        case 'clear': return B(() => { obj.m.clear(); return null; });
      }
    } else if (obj && obj.jGetAttr) {
      return obj.jGetAttr(name, line, this);
    }
    throw this.err(`${typeName(obj)} não tem '.${name}'`, line);
  }
}

function sortCmp(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return str(a) < str(b) ? -1 : str(a) > str(b) ? 1 : 0;
}

function formatSpec(v, spec) {
  if (!spec) return str(v);
  const m = /^\.(\d+)f$/.exec(spec);
  if (m && typeof v === 'number') return v.toFixed(+m[1]);
  if (spec === 'd' && typeof v === 'number') return String(Math.trunc(v));
  if (spec === '%' && typeof v === 'number') return fmtNum(Math.round(v * 1000) / 10) + '%';
  return str(v);
}

function installStdlib(I) {
  const add = (names, fn, min = 0, max = min) => {
    for (const n of [].concat(names)) I.builtins.set(n, new Builtin(n, fn, min, max));
  };
  const num = (v, fname, line) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return +v;
    throw I.err(`${fname}() precisa de um número, recebeu ${typeName(v)}`, line);
  };
  add(['print', 'escrever', 'mostrar'], (a) => { I.print(a.map(str).join(' ')); return null; }, 0, Infinity);
  add(['len', 'tamanho'], ([v], _, line) => {
    if (typeof v === 'string' || Array.isArray(v)) return v.length;
    if (v instanceof JDict) return v.m.size;
    if (v instanceof JRange) return v.length;
    throw I.err(`len() não funciona com ${typeName(v)}`, line);
  }, 1);
  add(['range', 'intervalo'], (a, _, line) => {
    a.forEach(x => num(x, 'range', line));
    let [s, e, st] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1];
    if (st === 0) throw I.err('range() com passo 0', line);
    return new JRange(Math.trunc(s), Math.trunc(e), Math.trunc(st));
  }, 1, 3);
  add(['str', 'texto'], ([v]) => str(v), 1);
  add(['int', 'inteiro'], ([v], _, line) => {
    if (typeof v === 'number') return Math.trunc(v);
    if (typeof v === 'boolean') return +v;
    if (typeof v === 'string' && /^\s*[-+]?\d+\s*$/.test(v)) return parseInt(v, 10);
    throw I.err(`Não dá pra converter ${repr(v)} em inteiro`, line);
  }, 1);
  add(['float', 'decimal'], ([v], _, line) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() && !isNaN(+v)) return +v;
    throw I.err(`Não dá pra converter ${repr(v)} em número`, line);
  }, 1);
  add('bool', ([v]) => truthy(v), 1);
  add('abs', ([v], _, l) => Math.abs(num(v, 'abs', l)), 1);
  add(['round', 'arredondar'], ([v, d], _, l) => {
    num(v, 'round', l);
    const k = Math.pow(10, d || 0);
    return Math.round(v * k) / k;
  }, 1, 2);
  const minmax = (isMax) => (a, _, line) => {
    let arr = a.length === 1 ? toIter(a[0], line) : a;
    if (arr instanceof JRange) arr = Array.from({ length: arr.length }, (_, i) => arr.at(i));
    if (!arr.length) throw I.err((isMax ? 'max' : 'min') + '() de uma lista vazia', line);
    return arr.reduce((m, x) => (isMax ? sortCmp(x, m) > 0 : sortCmp(x, m) < 0) ? x : m);
  };
  add('min', minmax(false), 1, Infinity);
  add('max', minmax(true), 1, Infinity);
  add(['sum', 'soma'], ([v], _, line) => {
    let arr = toIter(v, line);
    if (arr instanceof JRange) arr = Array.from({ length: arr.length }, (_, i) => arr.at(i));
    return arr.reduce((s, x) => s + num(x, 'sum', line), 0);
  }, 1);
  add(['list', 'lista'], (a, _, line) => {
    if (!a.length) return [];
    const it = toIter(a[0], line);
    if (it instanceof JRange) {
      if (it.length > 100000) throw I.err('Lista grande demais', line);
      return Array.from({ length: it.length }, (_, i) => it.at(i));
    }
    return it;
  }, 0, 1);
  add(['dict', 'dicionario'], () => new JDict(), 0);
  add(['sorted', 'ordenado'], ([v], _, line) => {
    let arr = toIter(v, line);
    if (arr instanceof JRange) arr = Array.from({ length: arr.length }, (_, i) => arr.at(i));
    return arr.slice().sort(sortCmp);
  }, 1);
  add(['aleatorio', 'randint'], ([a, b], _, line) => {
    num(a, 'aleatorio', line); num(b, 'aleatorio', line);
    return Math.floor(a + Math.random() * (b - a + 1));
  }, 2);
  add('random', () => Math.random(), 0);
  add(['tipo', 'type'], ([v]) => typeName(v), 1);
  add('chr', ([v]) => String.fromCharCode(v), 1);
  add('ord', ([v]) => v.charCodeAt(0), 1);
}
