/* ================= COMMANDS (part C: advanced) ================= */
/* ---------- awk: translated to JS ---------- */
const AWK_FN = { match: '__m', RE: '__re', length: '__len', substr: '__substr', tolower: '__lower', toupper: '__upper', index: '__index', split: '__split', sprintf: '__sprintf', int: '__int', gsub: '__gsub', sub: '__sub', printf: null, print: null };
const AWK_KW = new Set(['if', 'else', 'for', 'while', 'do', 'in', 'break', 'continue', 'return', 'delete']);
function awkTokens(src) {
  const t = []; let i = 0;
  const valEnd = () => { const p = t[t.length - 1]; return p && (p.k === 'str' || p.k === 'num' || p.k === 'fld' || (p.k === 'id' && !AWK_KW.has(p.v) && !(p.v in AWK_FN)) || p.v === ')' || p.v === ']'); };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { t.push({ k: 'nl', v: ';' }); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++; } t.push({ k: 'str', v: src.slice(i, j + 1) }); i = j + 1; continue; }
    if (c === '/' && !valEnd()) { let j = i + 1; while (j < src.length && src[j] !== '/') { if (src[j] === '\\') j++; j++; } t.push({ k: 're', v: src.slice(i, j + 1) }); i = j + 1; continue; }
    if (c === '$') { const m = /^\$(\d+|[A-Za-z_]\w*)/.exec(src.slice(i)); if (m) { t.push({ k: 'fld', v: /^\d/.test(m[1]) ? m[1] : 'V.' + m[1] }); i += m[0].length; } else { t.push({ k: 'fldx', v: '$' }); i++; } continue; }
    let m;
    if ((m = /^\d+(\.\d+)?/.exec(src.slice(i)))) { t.push({ k: 'num', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_]\w*/.exec(src.slice(i)))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(\+\+|--|\+=|-=|\*=|\/=|%=|==|!=|<=|>=|&&|\|\||!~|\*\*|[-+*/%<>=!~?:;,(){}[\]^])/.exec(src.slice(i)))) { t.push({ k: 'op', v: m[0] }); i += m[0].length; continue; }
    throw `syntax error at '${c}'`;
  }
  return t;
}
function awkJS(src) {
  src = src.replace(/(\$\d+|\$NF|\$\([^)]*\)|[A-Za-z_]\w*|"[^"]*")\s*(!?)~\s*(\/(?:[^/\\]|\\.)*\/|"[^"]*"|[A-Za-z_]\w*)/g, (m, l, n, r) => `${n}match(${l},${r[0] === '/' ? r : 'RE(' + r + ')'})`);
  const t = awkTokens(src); let out = '', pDepth = 0, printOpen = false, prev = null; const stack = [];
  const isValStart = x => x.k === 'str' || x.k === 'num' || x.k === 'fld' || x.k === 'fldx' || x.k === 're' || (x.k === 'id' && !AWK_KW.has(x.v)) || x.v === '(' || (x.k === 'op' && (x.v === '!' ));
  const isValEnd = x => x && (x.k === 'str' || x.k === 'num' || x.k === 'fld' || x.k === 're' || (x.k === 'id' && !AWK_KW.has(x.v) && !(x.v in AWK_FN)) || x.v === ')' || x.v === ']' || x.v === '++' || x.v === '--');
  const closePrint = () => { if (printOpen) { out += '])'; printOpen = false; } };
  for (let i = 0; i < t.length; i++) {
    const x = t[i], nx = t[i + 1];
    if (prev && isValEnd(prev) && isValStart(x) && x.v !== '!' && !(prev.k === 'id' && nx && x.v === '(' && false)) {
      if (!(prev.k === 'id' && x.v === '[')) out += ' +""+ ';
    }
    if ((x.k === 'nl' || x.v === ';' || x.v === '}') && pDepth === 0) closePrint();
    if (x.k === 'nl') { out += ';\n'; prev = null; continue; }
    if (x.v === '(') { pDepth++; stack.push(!!(t[i - 1] && t[i - 1].k === 'id' && t[i - 1].v in AWK_FN)); } if (x.v === ')') { pDepth--; stack.pop(); }
    if (x.k === 'id' && (x.v === 'print' || x.v === 'printf')) { out += x.v === 'print' ? '__p([' : '__pf(['; printOpen = true; if (!nx || nx.v === ';' || nx.v === '}' || nx.k === 'nl') out += '$F(0)'; prev = null; continue; }
    if (x.k === 're') { const top = stack[stack.length - 1]; out += (top && (prev && (prev.v === '(' || prev.v === ','))) ? x.v : `__m($F(0),${x.v})`; prev = x; continue; }
    if (x.k === 'fld') { out += `$F(${x.v})`; prev = x; continue; }
    if (x.k === 'fldx') { out += '$F'; prev = null; continue; }
    if (x.k === 'id') {
      if (x.v === 'next') { out += 'throw __NEXT'; prev = null; continue; }
      if (x.v === 'exit') { out += 'throw __EXIT'; prev = null; continue; }
      if (AWK_KW.has(x.v)) { out += ' ' + x.v + ' '; prev = x; continue; }
      if (x.v in AWK_FN) { out += AWK_FN[x.v]; if (x.v === 'length' && (!nx || nx.v !== '(')) out += '($F(0))'; prev = x.v === 'length' && (!nx || nx.v !== '(') ? { k: 'num' } : x; continue; }
      out += 'V.' + x.v; prev = x; continue;
    }
    if (x.v === '^' || x.v === '**') { out += '**'; prev = x; continue; }
    // awk arithmetic is numeric; JS '+' would concatenate strings
    if (x.v === '+=') { out += '-= -'; prev = x; continue; }
    if (x.v === '+' && isValEnd(prev)) { out += '- -'; prev = x; continue; }
    out += x.v; prev = x;
  }
  closePrint();
  return out;
}
function splitAwkProgram(prog) {
  const blocks = []; let i = 0;
  while (i < prog.length) {
    while (i < prog.length && /[\s;]/.test(prog[i])) i++;
    if (i >= prog.length) break;
    let pat = '';
    while (i < prog.length && prog[i] !== '{') { if (prog[i] === '/') { const j = prog.indexOf('/', i + 1); pat += prog.slice(i, j + 1); i = j + 1; continue; } if (prog[i] === '\n' && pat.trim()) break; pat += prog[i++]; }
    let act = null;
    if (prog[i] === '{') { let d = 0, j = i; for (; j < prog.length; j++) { if (prog[j] === '"') { j++; while (j < prog.length && prog[j] !== '"') { if (prog[j] === '\\') j++; j++; } continue; } if (prog[j] === '{') d++; else if (prog[j] === '}' && --d === 0) break; } act = prog.slice(i + 1, j); i = j + 1; }
    blocks.push({ pat: pat.trim(), act });
  }
  return blocks;
}
function awkSprintf(args) { const fmt = String(args[0]); let k = 1; return fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/%(-?)(\d*)(?:\.(\d+))?([sdfi%c])/g, (m, l, w, p, ty) => { if (ty === '%') return '%'; let v = args[k++]; v = ty === 'd' || ty === 'i' ? String(Math.trunc(+v || 0)) : ty === 'f' ? (+v || 0).toFixed(p ? +p : 6) : String(v ?? ''); if (ty === 's' && p) v = v.slice(0, +p); return l ? v.padEnd(+w || 0) : v.padStart(+w || 0); }); }
CMDS.awk = (a, io) => {
  const { f, rest } = go(a, '', 'Fvf');
  const vs = []; for (let i = 0; i < a.length; i++) if (a[i] === '-v') vs.push(a[i + 1]); else if (a[i].startsWith('-v') && a[i].length > 2) vs.push(a[i].slice(2));
  const prog = rest.shift(); if (prog == null) return fail(io, 'usage', "awk [-F fs][-v var=value][prog | -f progfile][file ...]", 2);
  const { text, code } = inputOf(rest, io, 'awk');
  let blocks;
  try { blocks = splitAwkProgram(prog).map(b => ({ pat: b.pat, act: b.act, pj: b.pat && b.pat !== 'BEGIN' && b.pat !== 'END' ? awkJS(b.pat) : '', aj: b.act != null ? awkJS(b.act) : null })); }
  catch (e) { return fail(io, 'awk', `${e}\n awk: cmd. line:1: ${prog}`, 2); }
  const arrNames = new Set(); for (const b of blocks) for (const m of (b.act || '').matchAll(/([A-Za-z_]\w*)\s*\[/g)) arrNames.add(m[1]);
  const base = { FS: f.F != null ? f.F.replace(/^\\t$/, '\t') : ' ', OFS: ' ', NR: 0, NF: 0, FILENAME: rest[0] || '' };
  for (const n of arrNames) base[n] = new Proxy({}, { get: (o, k) => k in o ? o[k] : (typeof k === 'string' ? 0 : undefined) });
  for (const v of vs) { const i = v.indexOf('='); base[v.slice(0, i)] = isNaN(v.slice(i + 1)) ? v.slice(i + 1) : +v.slice(i + 1); }
  const V = new Proxy(base, { get: (o, k) => k in o ? o[k] : 0 });
  let rec = '', fields = [], out = '';
  const num = s => (s !== '' && String(Number(s)) === String(s).trim()) ? Number(s) : s;
  const split = () => { fields = V.FS === ' ' ? rec.trim().split(/\s+/).filter(Boolean) : rec.split(V.FS.length === 1 ? V.FS : new RegExp(V.FS)); if (rec === '') fields = []; V.NF = fields.length; };
  const $F = n => n === 0 ? num(rec) : num(fields[n - 1] ?? '');
  const NEXT = {}, EXIT = {};
  const H = {
    __p: arr => { out += arr.map(x => typeof x === 'number' && !Number.isInteger(x) ? String(+x.toFixed(6)) : x).join(V.OFS) + '\n'; },
    __pf: arr => { out += awkSprintf(arr); }, __sprintf: (...a) => awkSprintf(a),
    __m: (s, re) => re.test(String(s)), __re: s => new RegExp(s), __len: s => String(s).length, __substr: (s, st, l) => String(s).substr(Math.max(0, st - 1), l ?? Infinity),
    __lower: s => String(s).toLowerCase(), __upper: s => String(s).toUpperCase(), __index: (s, x) => String(s).indexOf(x) + 1, __int: x => Math.trunc(+x || 0),
    __split: (s, arr, sep) => { const p = String(s).split(sep ? (sep.length === 1 ? sep : new RegExp(sep)) : /\s+/); p.forEach((v, i) => arr[i + 1] = v); return p.length; },
    __gsub: (re, rep) => { let n = 0; rec = rec.replace(new RegExp(re.source || re, 'g'), m => { n++; return String(rep).replace(/&/g, m); }); split(); return n; },
    __sub: (re, rep) => { let n = 0; rec = rec.replace(new RegExp(re.source || re), m => { n++; return String(rep).replace(/&/g, m); }); split(); return n; },
  };
  const mk = js => Function('V', '$F', '__NEXT', '__EXIT', ...Object.keys(H), `"use strict";${js}`);
  let compiled;
  try { compiled = blocks.map(b => ({ pat: b.pat, test: b.pj ? mk(`return (${b.pj});`) : null, run: b.aj != null ? mk(b.aj) : null })); }
  catch (e) { return fail(io, 'awk', `syntax error in program: ${prog}\n\x1b[2m(simulator awk supports patterns, {actions}, print/printf, $N, NR, NF, -F, BEGIN/END, arrays and common functions)\x1b[0m`, 2); }
  const call = fn => fn(V, $F, NEXT, EXIT, ...Object.values(H));
  try {
    for (const b of compiled) if (b.pat === 'BEGIN' && b.run) call(b.run);
    for (const l of lines(text)) {
      rec = l; V.NR++; split();
      try { for (const b of compiled) { if (b.pat === 'BEGIN' || b.pat === 'END') continue; if (b.test && !call(b.test)) continue; if (b.run) call(b.run); else H.__p([$F(0)]); } }
      catch (e) { if (e !== NEXT) throw e; }
    }
    for (const b of compiled) if (b.pat === 'END' && b.run) call(b.run);
  } catch (e) { if (e !== EXIT) return fail(io, 'awk', `runtime error: ${e.message || e}`, 2); }
  ev('text', { tool: 'awk', prog, input: text, output: out, fs: base.FS });
  io.out(out); return code;
};
/* ---------- sed ---------- */
function sedParse(script) {
  const cmds = []; let i = 0; const s = script;
  const addr = () => { if (s[i] === '/') { const j = s.indexOf('/', i + 1); const re = s.slice(i + 1, j); i = j + 1; return { re: new RegExp(re) }; } const m = /^(\d+|\$)/.exec(s.slice(i)); if (m) { i += m[0].length; return { n: m[0] === '$' ? '$' : +m[0] }; } return null; };
  while (i < s.length) {
    while (/[\s;]/.test(s[i] || '')) i++; if (i >= s.length) break;
    const a1 = addr(); let a2 = null; if (a1 && s[i] === ',') { i++; a2 = addr(); }
    let neg = false; if (s[i] === '!') { neg = true; i++; }
    const c = s[i++]; const cmd = { a1, a2, neg, c };
    if (c === 's' || c === 'y') { const d = s[i++]; const parts = []; let cur = ''; while (i < s.length && parts.length < 2) { if (s[i] === '\\' && s[i + 1] === d) { cur += d; i += 2; continue; } if (s[i] === d) { parts.push(cur); cur = ''; i++; continue; } cur += s[i++]; } const fl = /^[gIip0-9]*/.exec(s.slice(i))[0]; i += fl.length; cmd.from = parts[0]; cmd.to = parts[1]; cmd.fl = fl; }
    else if ('aic'.includes(c)) { const m = /^\\?\s*([^;]*)/.exec(s.slice(i)); cmd.text = m[1]; i += m[0].length; }
    else if (!'dpqn='.includes(c)) throw `-e expression #1, char ${i}: unknown command: \`${c}'`;
    cmds.push(cmd);
  }
  return cmds;
}
CMDS.sed = (a, io) => {
  const { f, rest } = go(a, 'nEri', 'e', { quiet: 'n', 'in-place': 'i', 'regexp-extended': 'E' });
  const script = f.e ?? rest.shift(); if (script == null) return fail(io, 'Usage', 'sed [OPTION]... {script-only-if-no-other-script} [input-file]...', 1);
  let cmds; try { cmds = sedParse(script); } catch (e) { return fail(io, 'sed', e, 1); }
  const run = text => {
    const ls = lines(text); let out = ''; const range = new Map();
    for (let li = 0; li < ls.length; li++) {
      let l = ls[li], del = false, printed = '', after = '';
      const lastLine = li === ls.length - 1;
      for (const [ci, c] of cmds.entries()) {
        const hit1 = x => x.n === '$' ? lastLine : x.n != null ? li + 1 === x.n : x.re.test(l);
        let m = true;
        if (c.a1 && !c.a2) m = hit1(c.a1);
        else if (c.a1 && c.a2) { if (range.get(ci)) { m = true; if (hit1(c.a2) || (c.a2.n != null && c.a2.n !== '$' && li + 1 >= c.a2.n)) range.set(ci, false); } else if (hit1(c.a1)) { m = true; range.set(ci, !(c.a2.n != null && c.a2.n !== '$' && li + 1 >= c.a2.n)); } else m = false; }
        if (c.neg) m = !m; if (!m) continue;
        if (c.c === 's') { const fl = c.fl; const src = (f.E || f.r) ? c.from : c.from.replace(/\\([(){}|+?])/g, '\u0000$1').replace(/([(){}|+?])/g, '\\$1').replace(/\u0000\\?/g, ''); const re = new RegExp(src, (fl.includes('g') ? 'g' : '') + (/[Ii]/.test(fl) ? 'i' : '')); const to = c.to.replace(/\\(\d)/g, '$$$1').replace(/(^|[^\\])&/g, '$1$$&').replace(/\\&/g, '&').replace(/\\n/g, '\n'); const nl = l.replace(re, to); if (nl !== l && fl.includes('p')) printed += nl + '\n'; l = nl; }
        else if (c.c === 'y') { l = l.split('').map(ch => { const k = c.from.indexOf(ch); return k >= 0 ? c.to[k] : ch; }).join(''); }
        else if (c.c === 'd') { del = true; break; }
        else if (c.c === 'p') printed += l + '\n';
        else if (c.c === '=') printed += (li + 1) + '\n';
        else if (c.c === 'a') after += c.text + '\n';
        else if (c.c === 'i') printed += c.text + '\n';
        else if (c.c === 'c') { l = c.text; }
        else if (c.c === 'q') { out += printed + (f.n ? '' : l + '\n'); return out; }
      }
      out += printed + (del || f.n ? '' : l + '\n') + after;
    }
    return out;
  };
  if (f.i) { let code = 0; for (const p of rest) { const r = readFile(p); if (r.err) { code = fail(io, 'sed', `can't read ${p}: ${r.err}`, 2); continue; } const o = run(r.data); writeFile(p, o); ev('text', { tool: 'sed', prog: script, input: r.data, output: o, inplace: p }); } return code; }
  const { text, code } = inputOf(rest, io, 'sed');
  const o = run(text); ev('text', { tool: 'sed', prog: script, input: text, output: o });
  io.out(o); return code;
};
/* ---------- cut / tr / xargs / tee ---------- */
function parseList(spec) { const out = []; for (const p of String(spec).split(',')) { const m = /^(\d*)-?(\d*)$/.exec(p); if (!m) return null; if (!p.includes('-')) out.push([+m[1], +m[1]]); else out.push([m[1] ? +m[1] : 1, m[2] ? +m[2] : Infinity]); } return out; }
CMDS.cut = (a, io) => {
  const { f, rest } = go(a, 's', 'dfcb', { delimiter: 'd', fields: 'f', characters: 'c', complement: 'X', 'output-delimiter': 'O' });
  if (!f.f && !f.c && !f.b) return fail(io, 'cut', 'you must specify a list of bytes, characters, or fields\nTry \'cut --help\' for more information.');
  const lst = parseList(f.f || f.c || f.b); if (!lst) return fail(io, 'cut', 'invalid field range');
  const inR = n => lst.some(([x, y]) => n >= x && n <= y) !== !!f.X;
  const d = f.d ?? '\t'; if (d.length > 1) return fail(io, 'cut', 'the delimiter must be a single character');
  const { text, code } = inputOf(rest, io, 'cut');
  const out = lines(text).map(l => {
    if (f.c || f.b) return l.split('').filter((_, i) => inR(i + 1)).join('');
    if (!l.includes(d)) return f.s ? null : l;
    return l.split(d).filter((_, i) => inR(i + 1)).join(f.O ?? d);
  }).filter(x => x != null);
  ev('text', { tool: 'cut', input: text, output: joinL(out), fields: f.f, delim: d, chars: f.c });
  io.out(joinL(out)); return code;
};
function trSet(s) {
  s = s.replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z').replace(/\[:digit:\]/g, '0-9').replace(/\[:alpha:\]/g, 'A-Za-z').replace(/\[:alnum:\]/g, 'A-Za-z0-9').replace(/\[:space:\]/g, ' \t\n\r').replace(/\[:punct:\]/g, '!-/:-@[-`{-~');
  s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  const out = []; for (let i = 0; i < s.length; i++) { if (s[i + 1] === '-' && i + 2 < s.length) { for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c)); i += 2; } else out.push(s[i]); }
  return out;
}
CMDS.tr = (a, io) => {
  const { f, rest } = go(a, 'dscC', '', { delete: 'd', 'squeeze-repeats': 's', complement: 'c' });
  if (!rest.length) return fail(io, 'tr', 'missing operand');
  if (io.stdin == null) { io.err("\x1b[33m(tr only reads stdin — it never takes a file name. Use: tr 'a-z' 'A-Z' < file   or   cat file | tr ...)\x1b[0m\n"); return 1; }
  const A = trSet(rest[0]), B = rest[1] != null ? trSet(rest[1]) : null;
  const inA = ch => A.includes(ch) !== !!(f.c || f.C);
  let out = '', prev = null;
  for (const ch of io.stdin) {
    if (f.d) { if (inA(ch)) continue; out += ch; continue; }
    let o = ch;
    if (B && inA(ch)) { const k = A.indexOf(ch); o = B[Math.min(k < 0 ? B.length - 1 : k, B.length - 1)]; }
    if (f.s && o === prev && (B ? B.includes(o) : inA(o))) continue;
    out += o; prev = o;
  }
  ev('text', { tool: 'tr', input: io.stdin, output: out, from: rest[0], to: rest[1] });
  io.out(out); return 0;
};
CMDS.xargs = (a, io) => {
  const { f, rest } = go(a, 'trp0', 'nIdL', { 'max-args': 'n', verbose: 't', 'no-run-if-empty': 'r', null: '0', delimiter: 'd' });
  let items = (io.stdin || '').split(f[0] ? '\0' : f.d ? (f.d === '\\n' ? '\n' : f.d) : f.I ? '\n' : /\s+/).filter(x => x.length);
  const cmd = rest.length ? rest : ['echo'];
  const batches = [];
  if (f.I) for (const it of items) batches.push(cmd.map(w => w.split(f.I).join(it)));
  else { const n = f.n ? +f.n : f.L ? +f.L : Infinity; if (!items.length && !f.r) batches.push(cmd.slice()); for (let i = 0; i < items.length; i += n) batches.push(cmd.concat(items.slice(i, i + n))); }
  let code = 0;
  ev('xargs', { items, batches: batches.map(b => b.join(' ')) });
  for (const b of batches) { if (f.t) io.err(b.join(' ') + '\n'); const c = execWords(b, Object.assign({}, io, { stdin: null }), {}); if (c) code = c === 127 ? 127 : 123; }
  return code;
};
CMDS.tee = (a, io) => {
  const { f, rest } = go(a, 'ai', '', { append: 'a' });
  const data = io.stdin ?? ''; let code = 0;
  if (io.stdin == null) io.err('\x1b[33m(tee copies its stdin — pipe something into it: echo hi | tee file.txt)\x1b[0m\n');
  for (const p of rest) { const w = writeFile(p, data, !!f.a); if (w.err) code = fail(io, 'tee', `${p}: ${w.err}`); }
  ev('tee', { files: rest, append: !!f.a, data });
  io.out(data); return code;
};
/* ---------- permissions deep dive ---------- */
CMDS.umask = (a, io) => {
  if (!a.length) { io.out(S.umask.toString(8).padStart(4, '0') + '\n'); ev('umask', { old: S.umask, mask: S.umask }); return 0; }
  if (a[0] === '-S') { const p = 0o777 & ~S.umask; const s = sh => ['r', 'w', 'x'].filter((c, i) => (p >> sh) & (4 >> i)).join(''); io.out(`u=${s(6)},g=${s(3)},o=${s(0)}\n`); ev('umask', { old: S.umask, mask: S.umask }); return 0; }
  if (!/^[0-7]{1,4}$/.test(a[0])) return fail(io, 'bash: umask', `${a[0]}: octal number out of range`);
  const old = S.umask; S.umask = parseInt(a[0], 8); ev('umask', { old, mask: S.umask }); return 0;
};
CMDS.getfacl = (a, io) => {
  let code = 0;
  for (const p of a.filter(x => !x.startsWith('-'))) {
    const r = lookup(p); if (r.err) { code = fail(io, 'getfacl', `${p}: ${r.err}`); continue; }
    const n = r.n, rwx = b => (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-');
    let o = `# file: ${p.replace(/^\//, '')}\n# owner: ${uname(n.uid)}\n# group: ${gname(n.gid)}\n${n.mode & 0o7000 ? `# flags: ${n.mode & 0o4000 ? 's' : '-'}${n.mode & 0o2000 ? 's' : '-'}${n.mode & 0o1000 ? 't' : '-'}\n` : ''}user::${rwx(n.mode >> 6)}\n`;
    const acl = n.acl || {};
    for (const [k, v] of Object.entries(acl)) if (k.startsWith('u:')) o += `user:${k.slice(2)}:${v}\n`;
    o += `group::${rwx(n.mode >> 3)}\n`;
    for (const [k, v] of Object.entries(acl)) if (k.startsWith('g:')) o += `group:${k.slice(2)}:${v}\n`;
    if (Object.keys(acl).length) o += `mask::${rwx((n.mode >> 3) | Object.values(acl).reduce((m, v) => m | (v.includes('r') ? 4 : 0) | (v.includes('w') ? 2 : 0) | (v.includes('x') ? 1 : 0), 0))}\n`;
    o += `other::${rwx(n.mode)}\n\n`;
    io.out(o); ev('acl', { path: r.path, mode: n.mode, acl, show: true });
  }
  return code;
};
CMDS.setfacl = (a, io) => {
  const { f, rest } = go(a, 'bkR', 'mx', { modify: 'm', remove: 'x', 'remove-all': 'b' });
  if (!rest.length) return fail(io, 'setfacl', 'Option -m: Invalid argument near character 1', 2);
  let code = 0;
  for (const p of rest) {
    const r = lookup(p); if (r.err) { code = fail(io, 'setfacl', `${p}: ${r.err}`); continue; }
    if (S.uid !== 0 && r.n.uid !== S.uid) { code = fail(io, 'setfacl', `${p}: Operation not permitted`); continue; }
    r.n.acl = r.n.acl || {};
    if (f.b) r.n.acl = {};
    if (f.m) for (const e of f.m.split(',')) { const m = /^(u|user|g|group):([\w-]+):([rwx-]{1,3})$/.exec(e); if (!m) return fail(io, 'setfacl', `Option -m: Invalid argument near character 3`, 2); const who = m[1][0]; if (who === 'u' && !S.users[m[2]]) return fail(io, 'setfacl', `Option -m: Invalid argument near character 3`, 2); const perm = ['r', 'w', 'x'].map(c => m[3].includes(c) ? c : '-').join(''); r.n.acl[who + ':' + m[2]] = perm; }
    if (f.x) for (const e of f.x.split(',')) { const m = /^(u|user|g|group):([\w-]+)$/.exec(e); if (m) delete r.n.acl[m[1][0] + ':' + m[2]]; }
    ev('acl', { path: r.path, mode: r.n.mode, acl: Object.assign({}, r.n.acl), spec: f.m || f.x || '-b' });
  }
  return code;
};
/* ---------- process internals ---------- */
function synthSyscalls(words, rec, evs, code) {
  const [name, ...args] = words; const path = rec.path || '/usr/bin/' + name;
  const L = [[`execve("${path}", [${words.map(w => JSON.stringify(w)).join(', ')}], 0x7ffc1e0 /* 24 vars */)`, '0', 'exec'], ['brk(NULL)', '0x55d0c2a4f000', 'mem'], ['openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY|O_CLOEXEC)', '3', 'lib'], ['openat(AT_FDCWD, "/lib/x86_64-linux-gnu/libc.so.6", O_RDONLY|O_CLOEXEC)', '3', 'lib'], ['mmap(NULL, 2170256, PROT_READ, MAP_PRIVATE|MAP_DENYWRITE, 3, 0)', '0x7f2a1c000000', 'mem'], ['close(3)', '0', 'lib']];
  const out = (rec.out || '').length;
  const errFor = p => { const r = lookup(p); return r.err ? `-1 ${r.err === 'Permission denied' ? 'EACCES' : 'ENOENT'} (${r.err})` : null; };
  let fd = 3;
  if (name === 'ls') { L.push([`openat(AT_FDCWD, "${args.find(x => !x.startsWith('-')) || '.'}", O_RDONLY|O_NONBLOCK|O_CLOEXEC|O_DIRECTORY)`, '3', 'file'], ['getdents64(3, 0x55d0c2a51c90 /* entries */, 32768)', '312', 'file'], ['getdents64(3, 0x55d0c2a51c90 /* 0 entries */, 32768)', '0', 'file'], ['close(3)', '0', 'file']); }
  else if (['mkdir'].includes(name)) for (const p of args.filter(x => !x.startsWith('-'))) L.push([`mkdir("${p}", 0777)`, '0', 'file']);
  else if (['rm', 'unlink'].includes(name)) for (const p of args.filter(x => !x.startsWith('-'))) L.push([`unlinkat(AT_FDCWD, "${p}", 0)`, '0', 'file']);
  else if (name === 'mv') { const p = args.filter(x => !x.startsWith('-')); L.push([`renameat2(AT_FDCWD, "${p[0]}", AT_FDCWD, "${p[1]}", 0)`, '0', 'file']); }
  else if (name === 'chmod') { const p = args.filter(x => !x.startsWith('-')); L.push([`fchmodat(AT_FDCWD, "${p[1]}", 0${p[0]})`, '0', 'file']); }
  else if (name === 'touch') for (const p of args) L.push([`openat(AT_FDCWD, "${p}", O_WRONLY|O_CREAT|O_NOCTTY|O_NONBLOCK, 0666)`, '3', 'file'], [`utimensat(3, NULL, NULL, 0)`, '0', 'file'], ['close(3)', '0', 'file']);
  else if (name === 'cp') { const p = args.filter(x => !x.startsWith('-')); L.push([`newfstatat(AT_FDCWD, "${p[1]}", ...)`, '0', 'file'], [`openat(AT_FDCWD, "${p[0]}", O_RDONLY)`, '3', 'file'], [`openat(AT_FDCWD, "${p[1]}", O_WRONLY|O_CREAT|O_EXCL, 0644)`, '4', 'file'], ['copy_file_range(3, NULL, 4, NULL, 9223372035781033984, 0)', '120', 'file'], ['close(4)', '0', 'file'], ['close(3)', '0', 'file']); }
  else if (name === 'sleep') L.push(['clock_nanosleep(CLOCK_REALTIME, 0, {tv_sec=' + (args[0] || 1) + ', tv_nsec=0}, 0x7ffd)', '0', 'time']);
  else if (['curl', 'wget', 'ping'].includes(name)) L.push(['socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)', '3', 'net'], ['connect(3, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("93.184.215.14")}, 16)', '-1 EINPROGRESS', 'net'], ['sendto(3, "GET / HTTP/1.1\\r\\nHost: …", 78, MSG_NOSIGNAL, NULL, 0)', '78', 'net'], ['recvfrom(3, "HTTP/1.1 200 OK\\r\\n…", 102400, 0, NULL, NULL)', '1256', 'net'], ['close(3)', '0', 'net']);
  else if (name === 'whoami' || name === 'id') L.push(['geteuid()', String(S.uid), 'id'], ['openat(AT_FDCWD, "/etc/passwd", O_RDONLY|O_CLOEXEC)', '3', 'file'], ['read(3, "root:x:0:0:root:/root:/bin/bash\\n"..., 4096)', '1123', 'file'], ['close(3)', '0', 'file']);
  else {
    for (const p of args.filter(x => !x.startsWith('-') && !/[|'"{}$]/.test(x))) { if (lookup(p).n && lookup(p).n.t === 'd') continue; const e = errFor(p); if (e && !lookup(p).n) { if (/^[\w./~-]+\.\w+$|\//.test(p)) L.push([`openat(AT_FDCWD, "${p}", O_RDONLY)`, e, 'file']); continue; } if (!lookup(p).n) continue; const sz = fsize(lookup(p).n); L.push([`openat(AT_FDCWD, "${p}", O_RDONLY)`, String(fd), 'file'], [`fstat(${fd}, {st_mode=S_IFREG|0644, st_size=${sz}, ...})`, '0', 'file'], [`read(${fd}, "${(lookup(p).n.data || '').slice(0, 14).replace(/\n/g, '\\n')}"..., 131072)`, String(Math.min(sz, 131072)), 'file'], [`read(${fd}, "", 131072)`, '0', 'file'], [`close(${fd})`, '0', 'file']); }
  }
  if (out) L.push([`write(1, "${(rec.out || '').slice(0, 18).replace(/\n/g, '\\n')}"..., ${out})`, String(out), 'out']);
  if (rec.err) L.push([`write(2, "${rec.err.slice(0, 18).replace(/\n/g, '\\n')}"..., ${rec.err.length})`, String(rec.err.length), 'out']);
  L.push(['close(1)', '0', 'out'], [`exit_group(${code})`, '?', 'exit']);
  return L;
}
CMDS.strace = (a, io) => {
  const { f, rest } = go(a, 'cfFTt', 'eop');
  if (f.p) { const p = procBy(+f.p); if (!p) return fail(io, 'strace', `attach: ptrace(PTRACE_SEIZE, ${f.p}): No such process`); if (S.uid !== 0 && p.uid !== S.uid) return fail(io, 'strace', `attach: ptrace(PTRACE_SEIZE, ${f.p}): Operation not permitted`); const calls = [['epoll_wait(5, [], 512, 1000)', '0', 'wait'], ['read(3, "GET / HTTP/1.1\\r\\n"..., 1024)', '78', 'net'], ['write(3, "HTTP/1.1 200 OK\\r\\n"..., 512)', '512', 'net'], ['epoll_wait(5, [], 512, 1000)', '0', 'wait']]; io.err(`strace: Process ${f.p} attached\n` + calls.map(c => `${c[0]} = ${c[1]}`).join('\n') + `\n^Cstrace: Process ${f.p} detached\n`); ev('strace', { calls, cmd: p.comm }); return 0; }
  if (!rest.length) return fail(io, 'strace', 'must have PROG [ARGS] or -p PID\nTry \'strace -h\' for more information.');
  let pout = '', perr = ''; const sub = {};
  const code = execWords(rest, Object.assign({}, io, { out: s => pout += s, err: s => perr += s, tty: io.tty }), sub);
  sub.out = strip(pout); sub.err = strip(perr);
  let calls = synthSyscalls(rest, sub, null, code);
  if (f.e) { const want = f.e.replace(/^trace=/, '').split(','); calls = calls.filter(c => want.some(w => c[0].startsWith(w + '(') || (w === 'file' && c[2] === 'file') || (w === 'network' && c[2] === 'net'))); }
  ev('strace', { calls, cmd: rest.join(' ') });
  if (f.c) {
    const cnt = {}; for (const c of calls) { const n = c[0].split('(')[0]; cnt[n] = cnt[n] || { n: 0, e: 0 }; cnt[n].n++; if (c[1].startsWith('-1')) cnt[n].e++; }
    const rows = Object.entries(cnt).sort((x, y) => y[1].n - x[1].n);
    io.out(pout); io.err(perr);
    io.err(`% time     seconds  usecs/call     calls    errors syscall\n------ ----------- ----------- --------- --------- ----------------\n` + rows.map(([n, v], i) => `${(i === 0 ? 38.2 : 61.8 / rows.length).toFixed(2).padStart(6)}    0.0000${String(12 + i).padStart(2, '0')}          ${String(3 + i).padStart(2)} ${String(v.n).padStart(9)} ${v.e ? String(v.e).padStart(9) : '         '} ${n}`).join('\n') + `\n------ ----------- ----------- --------- --------- ----------------\n100.00    0.000134               ${String(calls.length).padStart(9)}           total\n`);
    return code;
  }
  io.err(calls.map(c => `${c[0]} = ${c[1]}`).join('\n') + '\n');
  io.out(pout); if (perr) io.err(perr);
  io.err(code === 0 ? '+++ exited with 0 +++\n' : `+++ exited with ${code} +++\n`);
  return code;
};
CMDS.lsof = (a, io) => {
  const { f, rest } = go(a, 'nPt', 'piuc');
  const iIdx = a.indexOf('-i'); const iArg = iIdx >= 0 && a[iIdx + 1] && !a[iIdx + 1].startsWith('-') ? a[iIdx + 1] : null;
  let procs = S.procs.filter(p => S.uid === 0 || p.uid === S.uid);
  if (f.p) procs = procs.filter(p => p.pid === +f.p);
  if (f.u) procs = procs.filter(p => uname(p.uid) === f.u);
  if (f.c) procs = procs.filter(p => p.comm.startsWith(f.c));
  let rows = [];
  for (const p of procs) {
    const fds = [{ fd: 'cwd', type: 'DIR', name: p.pid === 1200 ? S.cwd : '/' }, { fd: 'txt', type: 'REG', name: '/usr/bin/' + p.comm }].concat(openFds(p).map(x => ({ fd: x.fd + (x.fd === 0 ? 'r' : 'u'), type: x.type, name: x.name })));
    for (const x of fds) rows.push({ p, ...x });
  }
  if (iIdx >= 0) { rows = rows.filter(r => r.type.startsWith('IPv')); if (iArg) { const port = (/:(\d+)/.exec(iArg) || [])[1]; if (port) rows = rows.filter(r => r.name.includes(':' + port)); } }
  const pathArg = rest.find(x => x.startsWith('/') || lookup(x).n);
  if (pathArg) { const ap = norm(pathArg); rows = rows.filter(r => r.name === ap || (r.fd === 'cwd' && r.name.startsWith(ap))); }
  if (!rows.length) { if (S.uid !== 0 && iIdx >= 0) io.err('\x1b[2m(hint: other users\' sockets are only visible with sudo)\x1b[0m\n'); return 1; }
  if (f.t) { io.out(joinL([...new Set(rows.map(r => r.p.pid))])); return 0; }
  io.out('COMMAND     PID     USER   FD      TYPE DEVICE SIZE/OFF    NODE NAME\n' + rows.map(r => `${r.p.comm.padEnd(9).slice(0, 9)} ${String(r.p.pid).padStart(5)} ${uname(r.p.uid).padStart(8).slice(-8)} ${String(r.fd).padStart(4)}    ${r.type.padEnd(6)}  8,1  ${String(r.type === 'REG' ? 4096 : '0t0').padStart(8)} ${String(1300 + r.name.length * 7).padStart(7)} ${r.name}`).join('\n') + '\n');
  ev('lsof', { rows: rows.map(r => ({ pid: r.p.pid, comm: r.p.comm, fd: String(r.fd), type: r.type, name: r.name })) });
  return 0;
};
CMDS.nice = (a, io, rec) => {
  if (!a.length) { io.out('0\n'); return 0; }
  let n = 10, i = 0;
  if (a[0] === '-n') { n = +a[1]; i = 2; } else if (/^-\d+$/.test(a[0])) { n = +a[0].slice(1); i = 1; } else if (/^--\d+$/.test(a[0])) { n = -a[0].slice(2); i = 1; } else if (a[0].startsWith('--adjustment=')) { n = +a[0].split('=')[1]; i = 1; }
  if (n < 0 && S.uid !== 0) { io.err('nice: cannot set niceness: Permission denied\n'); n = 0; }
  const before = S.procs.length;
  const code = execWords(a.slice(i), io, {});
  const sp = S.procs.slice(before); sp.forEach(p => p.ni = n);
  const p = sp[0] || { pid: rec.pid, comm: a[i], ni: n };
  ev('nice', { pid: p.pid, name: p.comm, old: 0, ni: n });
  return code;
};
CMDS.renice = (a, io) => {
  let n = null; const pids = []; let mode = 'p';
  for (let i = 0; i < a.length; i++) { const x = a[i]; if (x === '-n') n = +a[++i]; else if (x === '-p') mode = 'p'; else if (x === '-u') mode = 'u'; else if (n == null && /^[+-]?\d+$/.test(x)) n = +x; else pids.push([mode, x]); }
  let code = 0;
  for (const [m, t] of pids) {
    const ps = m === 'u' ? S.procs.filter(p => uname(p.uid) === t) : [procBy(+t)].filter(Boolean);
    if (!ps.length) { code = fail(io, 'renice', `failed to get priority for ${t} (process ID): No such process`); continue; }
    for (const p of ps) {
      if (S.uid !== 0 && (p.uid !== S.uid || n < p.ni)) { code = fail(io, 'renice', `failed to set priority for ${p.pid} (process ID): Permission denied`); ev('nice', { pid: p.pid, name: p.comm, old: p.ni, ni: p.ni, denied: true }); continue; }
      const old = p.ni; p.ni = Math.max(-20, Math.min(19, n));
      io.out(`${p.pid} (process ID) old priority ${old}, new priority ${p.ni}\n`);
      ev('nice', { pid: p.pid, name: p.comm, old, ni: p.ni });
    }
  }
  return code;
};
/* ---------- services & boot ---------- */
let JOURNAL = null;
function journal() {
  if (!JOURNAL || JOURNAL.sys !== S) JOURNAL = { sys: S, l: [['nginx', 'Nov 18 05:19:05 linux systemd[1]: Starting nginx.service - A high performance web server...', 6], ['nginx', 'Nov 18 05:19:05 linux systemd[1]: Started nginx.service - A high performance web server.', 6], ['ssh', 'Nov 18 05:19:04 linux sshd[345]: Server listening on 0.0.0.0 port 22.', 6], ['ssh', 'Nov 18 09:10:44 linux sshd[2101]: Accepted publickey for user from 10.0.0.5 port 51122 ssh2', 6], ['ssh', 'Nov 18 09:12:31 linux sshd[2110]: Failed password for invalid user admin from 203.0.113.9 port 40022 ssh2', 4], ['mysql', 'Nov 18 05:19:07 linux systemd[1]: Started mysql.service - MySQL Community Server.', 6], ['mysql', 'Nov 18 08:41:00 linux mysqld[601]: [Warning] Aborted connection 12 to db: \'app\' (Got timeout reading communication packets)', 4], ['cron', 'Nov 18 09:00:01 linux CRON[2050]: (root) CMD (run-parts /etc/cron.hourly)', 6], ['kernel', 'Nov 18 05:19:01 linux kernel: Linux version 6.8.0-49-generic', 6], ['kernel', 'Nov 18 09:12:02 linux kernel: usb 1-1: new high-speed USB device number 2 using xhci_hcd', 6], ['app', 'Nov 18 09:04:00 linux python3[888]: ERROR database timeout after 30s', 3]] };
  return JOURNAL.l;
}
CMDS.systemctl = (a, io) => {
  const args = a.filter(x => !x.startsWith('-'));
  const [act, unitRaw] = args; const svc = (unitRaw || '').replace(/\.service$/, '');
  const S_ = S.services[svc];
  const authFail = () => { io.err(`Failed to ${act} ${svc}.service: Interactive authentication required.\nSee system logs and 'systemctl status ${svc}.service' for details.\n`); return 1; };
  const dot = s => s.active ? C(io, '32;1', '●') : '○';
  if (!act || act === 'list-units') {
    io.out('  UNIT                     LOAD   ACTIVE   SUB     DESCRIPTION\n' + Object.entries(S.services).map(([k, v]) => `  ${(k + '.service').padEnd(24)} loaded ${v.active ? 'active  ' : 'inactive'} ${v.active ? 'running' : 'dead   '} ${v.desc}`).join('\n') + `\n\nLOAD   = Reflects whether the unit definition was properly loaded.\nACTIVE = The high-level unit activation state.\n${Object.keys(S.services).length} loaded units listed.\n`);
    ev('service', { action: 'list' }); return 0;
  }
  if (act === 'daemon-reload') { if (S.uid !== 0) return authFail(); ev('service', { action: 'reload' }); return 0; }
  if (!S_) return fail(io, 'Unit', `${svc}.service could not be found.`, act === 'status' ? 4 : 5);
  const log = (m, pr = 6) => journal().push([svc, `Nov 18 09:34:${String(10 + journal().length % 50).padStart(2, '0')} linux systemd[1]: ${m}`, pr]);
  switch (act) {
    case 'status': {
      const lg = journal().filter(l => l[0] === svc).slice(-3).map(l => l[1]).join('\n');
      io.out(`${dot(S_)} ${svc}.service - ${S_.desc}\n     Loaded: loaded (/usr/lib/systemd/system/${svc}.service; ${S_.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n     Active: ${S_.active ? C(io, '32;1', 'active (running)') + ' since Wed 2026-11-18 05:19:05 UTC; 4h 15min ago' : 'inactive (dead)'}\n${S_.active ? `   Main PID: ${S_.pid} (${svc === 'ssh' ? 'sshd' : svc === 'mysql' ? 'mysqld' : svc})\n      Tasks: ${svc === 'nginx' ? 2 : 1} (limit: 9367)\n     Memory: ${svc === 'mysql' ? '362.4M' : '6.1M'} (peak: 7.0M)\n        CPU: 182ms\n     CGroup: /system.slice/${svc}.service\n             └─${S_.pid} ${(procBy(S_.pid) || { cmd: svc }).cmd}\n` : ''}\n${lg}\n`);
      ev('service', { svc, action: 'status', active: S_.active }); return S_.active ? 0 : 3;
    }
    case 'is-active': io.out((S_.active ? 'active' : 'inactive') + '\n'); return S_.active ? 0 : 3;
    case 'is-enabled': io.out((S_.enabled ? 'enabled' : 'disabled') + '\n'); return S_.enabled ? 0 : 1;
    case 'start': case 'stop': case 'restart': case 'reload': {
      if (S.uid !== 0) { ev('service', { svc, action: act, denied: true, active: S_.active }); return authFail(); }
      if (act !== 'start' && S_.active) { const p = procBy(S_.pid); if (p) endProc(p, 'Done'); S.procs = S.procs.filter(x => x.ppid !== S_.pid || x.pid === S_.pid); S_.active = false; log(`Stopped ${svc}.service - ${S_.desc}.`); }
      if (act !== 'stop' && !S_.active) { const p = spawnProc(({ ssh: '/usr/sbin/sshd -D', nginx: 'nginx: master process /usr/sbin/nginx', mysql: '/usr/sbin/mysqld', cron: '/usr/sbin/cron -f', docker: '/usr/bin/dockerd', bluetooth: '/usr/libexec/bluetooth/bluetoothd' })[svc] || svc, { ppid: 1, uid: 0, tty: '?', comm: svc === 'ssh' ? 'sshd' : svc === 'mysql' ? 'mysqld' : svc }); S_.pid = p.pid; S_.active = true; log(`Started ${svc}.service - ${S_.desc}.`); }
      ev('service', { svc, action: act, active: S_.active }); return 0;
    }
    case 'enable': case 'disable': {
      if (S.uid !== 0) return authFail();
      S_.enabled = act === 'enable';
      io.err(act === 'enable' ? `Created symlink /etc/systemd/system/multi-user.target.wants/${svc}.service → /usr/lib/systemd/system/${svc}.service.\n` : `Removed "/etc/systemd/system/multi-user.target.wants/${svc}.service".\n`);
      if (a.includes('--now')) return CMDS.systemctl([act === 'enable' ? 'start' : 'stop', svc], io);
      ev('service', { svc, action: act, active: S_.active, enabled: S_.enabled }); return 0;
    }
  }
  return fail(io, 'systemctl', `Unknown command verb '${act}'.`);
};
CMDS.journalctl = (a, io) => {
  const { f } = go(a, 'fxebrk', 'unp', { unit: 'u', lines: 'n', priority: 'p', since: 'SINCE', follow: 'f', boot: 'b' });
  if (S.uid !== 0 && !userGroups(curUser()).some(g => g === 'adm' || g === 'systemd-journal')) { io.err('Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n'); }
  let l = journal().slice();
  if (f.u) l = l.filter(x => x[0] === f.u.replace(/\.service$/, ''));
  if (f.k) l = l.filter(x => x[0] === 'kernel');
  if (f.p) { const lvl = { emerg: 0, alert: 1, crit: 2, err: 3, warning: 4, notice: 5, info: 6, debug: 7 }[f.p] ?? +f.p; l = l.filter(x => x[2] <= lvl); }
  l.sort((x, y) => x[1].slice(7, 15) < y[1].slice(7, 15) ? -1 : 1);
  if (f.n) l = l.slice(-+f.n); if (f.r) l.reverse();
  io.out(l.length ? l.map(x => x[2] <= 3 ? C(io, '31;1', x[1]) : x[2] === 4 ? C(io, '33', x[1]) : x[1]).join('\n') + '\n' : '-- No entries --\n');
  if (f.f) io.out('\x1b[2m(-f keeps following new log lines until Ctrl+C — simulated)\x1b[0m\n');
  ev('service', { svc: f.u, action: 'journal' }); return 0;
};
CMDS['systemd-analyze'] = (a, io) => {
  if (a[0] === 'blame') io.out('4.012s mysql.service\n1.204s docker.service\n 812ms snapd.service\n 433ms nginx.service\n 211ms systemd-journald.service\n 120ms ssh.service\n  64ms cron.service\n');
  else if (a[0] === 'critical-chain') io.out('graphical.target @4.501s\n└─multi-user.target @4.500s\n  └─mysql.service @0.488s +4.012s\n    └─network.target @0.480s\n      └─systemd-networkd.service @0.301s +178ms\n        └─sysinit.target @0.290s\n');
  else io.out('Startup finished in 3.218s (firmware) + 2.105s (loader) + 1.822s (kernel) + 4.501s (userspace) = 11.646s\ngraphical.target reached after 4.501s in userspace.\n');
  ev('boot', { what: a[0] || 'time' }); return 0;
};
CMDS['systemd-cgls'] = (a, io) => { io.out(`Control group /:\n-.slice\n├─user.slice\n│ └─user-1000.slice\n│   └─session-3.scope\n│     ├─1200 -bash\n│     └─${S.nextPid} systemd-cgls\n├─init.scope\n│ └─1 /sbin/init splash\n└─system.slice\n${Object.entries(S.services).filter(([, v]) => v.active).map(([k, v]) => `  ├─${k}.service\n  │ └─${v.pid} ${(procBy(v.pid) || { cmd: k }).cmd}`).join('\n')}\n${S.containers.filter(c => c.up).map(c => `  └─docker-${c.id}.scope\n    └─${c.hostPid} ${c.cmd}`).join('\n')}\n`); ev('cgroup'); return 0; };
/* ---------- scheduling ---------- */
function cronCheck(line) {
  const t = line.trim(); if (!t || t.startsWith('#') || /^\w+=/.test(t)) return null;
  if (/^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)\s+\S/.test(t)) return null;
  const p = t.split(/\s+/); if (p.length < 6) return 'bad command';
  const lim = [[0, 59, 'minute'], [0, 23, 'hour'], [1, 31, 'day-of-month'], [1, 12, 'month'], [0, 7, 'day-of-week']];
  for (let i = 0; i < 5; i++) for (const part of p[i].split(',')) { const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part); if (!m || (m[1] !== '*' && (+m[1] < lim[i][0] || +m[1] > lim[i][1])) || (m[2] && +m[2] > lim[i][1])) return `bad ${lim[i][2]}`; }
  return null;
}
CMDS.crontab = (a, io) => {
  const { f, rest } = go(a, 'lerl', 'u');
  const u = f.u || curUser(); if (f.u && S.uid !== 0) return fail(io, 'crontab', 'must be privileged to use -u');
  if (f.l) { const c = S.crontab[u]; if (!c) { io.err(`no crontab for ${u}\n`); return 1; } io.out(c); ev('cron', { entries: c }); return 0; }
  if (f.r) { delete S.crontab[u]; ev('cron', { entries: '' }); return 0; }
  if (f.e) { io.err(`\x1b[33m(crontab -e opens an editor — not available in the simulator. Instead, add a line with:\n   (crontab -l 2>/dev/null; echo "0 2 * * * /home/user/backup.sh") | crontab -\x1b[0m\n`); return 0; }
  const src = rest[0] && rest[0] !== '-' ? readFile(rest[0]) : { data: io.stdin };
  if (src.err) return fail(io, 'crontab', `${rest[0]}: ${src.err}`);
  if (src.data == null) return fail(io, 'crontab', 'usage error: file name must be specified for replace');
  const ls = lines(src.data);
  for (let i = 0; i < ls.length; i++) { const e = cronCheck(ls[i]); if (e) { io.err(`"-":${i + 1}: ${e}\nerrors in crontab file, can't install.\n`); return 1; } }
  S.crontab[u] = joinL(ls);
  const save = S.uid; S.uid = 0; writeFile('/var/spool/cron/crontabs/' + u, S.crontab[u]); S.uid = save;
  ev('cron', { entries: S.crontab[u] }); return 0;
};
CMDS.at = (a, io) => {
  if (a[0] === '-l') return CMDS.atq([], io);
  const spec = a.join(' ');
  if (!spec) return fail(io, 'Garbled time', '', 1);
  let when = new Date(S.clock), m;
  if ((m = /^now\s*\+\s*(\d+)\s*(min|minute|minutes|hour|hours|day|days)$/.exec(spec))) when = new Date(S.clock + (+m[1]) * (m[2].startsWith('min') ? 6e4 : m[2].startsWith('hour') ? 36e5 : 864e5));
  else if ((m = /^(\d{1,2}):(\d{2})(?:\s+(tomorrow))?$/.exec(spec))) { when.setHours(+m[1], +m[2], 0); if (m[3] || when < new Date(S.clock)) when = new Date(+when + 864e5); }
  else if (spec === 'noon') { when.setHours(12, 0, 0); } else if (spec === 'midnight') { when = new Date(+when + 864e5); when.setHours(0, 0, 0); }
  else if (spec === 'now') { /* immediately */ }
  else return fail(io, 'syntax error. Last token seen', spec.split(' ').pop() + '\nGarbled time');
  if (io.stdin == null) io.err('\x1b[33m(at reads the commands from stdin — e.g.  echo "tar czf /tmp/b.tgz ~/docs" | at now + 5 minutes)\x1b[0m\n');
  const job = { n: S.atNext++, when: +when, cmd: (io.stdin || '').trim() || '(empty)', user: curUser() };
  S.atq.push(job);
  io.err(`warning: commands will be executed using /bin/sh\njob ${job.n} at ${when.toDateString()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}:00 ${when.getFullYear()}\n`);
  ev('at', { job }); return 0;
};
CMDS.atq = (a, io) => { io.out(joinL(S.atq.map(j => { const d = new Date(j.when); return `${j.n}\t${d.toDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00 ${d.getFullYear()} a ${j.user}`; }))); ev('at', { list: true }); return 0; };
CMDS.atrm = (a, io) => { for (const n of a) { const before = S.atq.length; S.atq = S.atq.filter(j => j.n !== +n); if (S.atq.length === before) return fail(io, 'Cannot find jobid', n); } return 0; };
/* ---------- links & inodes ---------- */
CMDS.ln = (a, io) => {
  const { f, rest } = go(a, 'sfvnri', '', { symbolic: 's', force: 'f', verbose: 'v', relative: 'r' });
  if (f._bad) return badOpt(io, 'ln', f._bad);
  if (!rest.length) return fail(io, 'ln', 'missing file operand');
  const target = rest[0]; let link = rest[1] ?? baseName(target);
  const L = lookup(link, false);
  if (L.n && L.n.t === 'd' && !f.n) link = norm(link) + '/' + baseName(target);
  if (lookup(link, false).n) { if (!f.f) return fail(io, 'ln', `failed to create ${f.s ? 'symbolic' : 'hard'} link '${link}': File exists`); fsUnlink(link); }
  if (f.s) {
    const c = fsCreate(link, 'l', 0o777, { tgt: target }); if (c.err) return fail(io, 'ln', `failed to create symbolic link '${link}': ${c.err}`);
    const t = lookup(norm(target, parentPath(link)));
    ev('link', { kind: 'sym', target, link: norm(link), ino: c.ino, tIno: t.ino, broken: !t.n, nlink: t.n ? t.n.nlink : 0 });
  } else {
    const t = lookup(target);
    if (t.err) return fail(io, 'ln', `failed to access '${target}': ${t.err}`);
    if (t.n.t === 'd') return fail(io, 'ln', `${target}: hard link not allowed for directory`);
    if (devOf(t.path) !== devOf(norm(link))) return fail(io, 'ln', `failed to create hard link '${link}' => '${target}': Invalid cross-device link`);
    const pr = lookup(parentPath(link)); if (pr.err) return fail(io, 'ln', `failed to create hard link '${link}': No such file or directory`);
    if (!can(dirOf(pr.n), 'w')) return fail(io, 'ln', `failed to create hard link '${link}': Permission denied`);
    dirOf(pr.n).ent[baseName(link)] = t.ino; t.n.nlink++;
    ev('link', { kind: 'hard', target, link: norm(link), ino: t.ino, tIno: t.ino, nlink: t.n.nlink });
  }
  if (f.v) io.out(`'${link}' ${f.s ? '->' : '=>'} '${target}'\n`);
  return 0;
};
CMDS.stat = (a, io) => {
  const { f, rest } = go(a, 'Lt', 'c', { format: 'c', dereference: 'L' });
  if (!rest.length) return fail(io, 'stat', 'missing operand');
  let code = 0;
  for (const p of rest) {
    const r = lookup(p, !!f.L); if (r.err) { code = fail(io, 'stat', `cannot statx '${p}': ${r.err}`); continue; }
    const n = r.n; const kind = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : fsize(n) ? 'regular file' : 'regular empty file';
    const ts = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.000000000 +0000`; };
    if (f.c) io.out(f.c.replace(/%([aAUGsinhFuXY])/g, (m, c) => ({ a: (n.mode & 0o7777).toString(8), A: modeStr(n), U: uname(n.uid), G: gname(n.gid), s: fsize(n), i: r.ino, n: p, h: n.nlink, F: kind, u: n.uid, Y: Math.floor(n.mtime / 1000), X: Math.floor(n.mtime / 1000) }[c])) + '\n');
    else io.out(`  File: ${p}${n.t === 'l' ? ' -> ' + n.tgt : ''}\n  Size: ${String(fsize(n)).padEnd(10)}\tBlocks: ${String(Math.ceil(fsize(n) / 4096) * 8).padEnd(10)} IO Block: 4096   ${kind}\nDevice: 8,1\tInode: ${String(r.ino).padEnd(11)} Links: ${n.nlink}\nAccess: (${(n.mode & 0o7777).toString(8).padStart(4, '0')}/${modeStr(n)})  Uid: (${String(n.uid).padStart(5)}/${uname(n.uid).padStart(8)})   Gid: (${String(n.gid).padStart(5)}/${gname(n.gid).padStart(8)})\nAccess: ${ts(n.mtime)}\nModify: ${ts(n.mtime)}\nChange: ${ts(n.mtime)}\n Birth: ${ts(n.mtime - 3600e3)}\n`);
    ev('stat', { path: r.path, ino: r.ino, nlink: n.nlink, kind: n.t, tgt: n.tgt, size: fsize(n), mode: n.mode });
  }
  return code;
};
/* ---------- disks & mounts ---------- */
CMDS.mount = (a, io) => {
  const { f, rest } = go(a, 'alrv', 'to');
  if (!rest.length) { io.out(joinL(S.mounts.map(m => `${m.dev} on ${m.mp} type ${m.fs} (${m.opt})`))); ev('mount', { list: true }); return 0; }
  if (S.uid !== 0) return fail(io, 'mount', `${rest[rest.length - 1]}: must be superuser to use mount.`, 32);
  let [dev, mp] = rest; if (!mp) { const fl = (readFile('/etc/fstab').data || '').split('\n').find(l => l.split(/\s+/)[1] === dev); if (!fl) return fail(io, 'mount', `${dev}: can't find in /etc/fstab.`, 1); [dev, mp] = fl.split(/\s+/); }
  const d = S.dev[dev]; if (!d) return fail(io, 'mount', `${mp}: special device ${dev} does not exist.`, 32);
  const r = lookup(mp); if (r.err) return fail(io, 'mount', `${mp}: mount point does not exist.`, 32);
  if (r.n.t !== 'd') return fail(io, 'mount', `${mp}: mount point is not a directory.`, 32);
  if (S.mounts.some(m => m.dev === dev)) return fail(io, 'mount', `${mp}: ${dev} already mounted on ${S.mounts.find(m => m.dev === dev).mp}.`, 32);
  const hidden = Object.keys(r.n.ent);
  r.n.mnt = d.root; const opt = f.o || 'rw,relatime';
  S.mounts.push({ dev, mp: r.path, fs: f.t || d.fs, opt, devRoot: d.root, ro: /(^|,)ro(,|$)/.test(opt) });
  ev('mount', { dev, mp: r.path, fs: d.fs, files: Object.keys(I(d.root).ent), hidden });
  return 0;
};
CMDS.umount = (a, io) => {
  const t = a.filter(x => !x.startsWith('-'))[0]; if (!t) return fail(io, 'umount', 'bad usage');
  const m = S.mounts.find(m => (m.mp === norm(t) || m.dev === t) && m.devRoot);
  if (!m) return fail(io, 'umount', `${t}: not mounted.`, 32);
  if (S.uid !== 0) return fail(io, 'umount', `${m.mp}: must be superuser to unmount.`, 32);
  if (S.cwd === m.mp || S.cwd.startsWith(m.mp + '/')) { ev('umount', { dev: m.dev, mp: m.mp, busy: true }); return fail(io, 'umount', `${m.mp}: target is busy.`, 32); }
  delete I(lookup(m.mp).ino).mnt; S.mounts = S.mounts.filter(x => x !== m);
  ev('umount', { dev: m.dev, mp: m.mp, files: Object.keys(I(m.devRoot).ent) });
  return 0;
};
CMDS.lsblk = (a, io) => {
  const fsMode = a.includes('-f');
  const mp = dev => (S.mounts.find(m => m.dev === dev) || {}).mp || '';
  if (fsMode) io.out(`NAME   FSTYPE FSVER LABEL     UUID                                 FSAVAIL FSUSE% MOUNTPOINTS\nsda                                                                           \n├─sda1 ext4   1.0             3f1c-a9e2                              28.1G    43% /\n├─sda2 ext4   1.0             77b0-12cd                             744.3M    25% /boot\n└─sda3 swap   1               9a1e-0c11                                            [SWAP]\nsdb                                                                           \n└─sdb1 vfat   FAT32 USB_STICK A1B2-C3D4                            ${mp('/dev/sdb1') ? '   14.8G     1% ' + mp('/dev/sdb1') : ''}\n`);
  else io.out(`NAME   MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS\nsda      8:0    0    60G  0 disk \n├─sda1   8:1    0    50G  0 part /\n├─sda2   8:2    0     1G  0 part /boot\n└─sda3   8:3    0     2G  0 part [SWAP]\nsdb      8:16   1  14.9G  0 disk \n└─sdb1   8:17   1  14.9G  0 part ${mp('/dev/sdb1')}\n`);
  ev('mount', { list: true, lsblk: true }); return 0;
};
/* ---------- advanced networking ---------- */
CMDS.ip = (a, io) => {
  const br = a.includes('-br'); const args = a.filter(x => !x.startsWith('-'));
  const obj = args[0] || '';
  if (/^(a|addr|address)$/.test(obj)) {
    io.out(br ? `lo               UNKNOWN        127.0.0.1/8 ::1/128\neth0             UP             10.0.0.5/24 fe80::a00:27ff:fe4e:66a1/64\ndocker0          DOWN           172.17.0.1/16\n` : `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    link/ether 08:00:27:4e:66:a1 brd ff:ff:ff:ff:ff:ff\n    inet ${C(io, '35', '10.0.0.5/24')} brd 10.0.0.255 scope global dynamic eth0\n       valid_lft 85744sec preferred_lft 85744sec\n    inet6 fe80::a00:27ff:fe4e:66a1/64 scope link\n3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default\n    link/ether 02:42:9b:1c:22:7e brd ff:ff:ff:ff:ff:ff\n    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0\n`);
  } else if (/^(r|route)$/.test(obj)) io.out('default via 10.0.0.1 dev eth0 proto dhcp src 10.0.0.5 metric 100\n10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.5 metric 100\n172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown\n');
  else if (/^(l|link)$/.test(obj)) io.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT\n    link/ether 08:00:27:4e:66:a1 brd ff:ff:ff:ff:ff:ff\n');
  else if (/^(n|neigh)$/.test(obj)) io.out('10.0.0.1 dev eth0 lladdr 52:54:00:12:35:02 REACHABLE\n10.0.0.11 dev eth0 lladdr 08:00:27:aa:10:11 STALE\n');
  else { io.out('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | route | neigh | ... }\n'); return obj ? 1 : 0; }
  ev('ipinfo', { obj }); return 0;
};
CMDS.ss = (a, io) => {
  const fl = a.join('');
  const socks = [['tcp', 'LISTEN', '0.0.0.0:22', 'sshd', 345, 3, 0, 'ssh'], ['tcp', 'LISTEN', '0.0.0.0:80', 'nginx', 520, 6, 33, 'nginx'], ['tcp', 'LISTEN', '127.0.0.1:3306', 'mysqld', 601, 21, 112, 'mysql'], ['tcp', 'LISTEN', '0.0.0.0:8000', 'python3', 888, 3, 1000, null], ['tcp', 'ESTAB', '10.0.0.5:22', 'sshd', 2101, 4, 0, 'ssh', '10.0.0.7:51122'], ['udp', 'UNCONN', '127.0.0.53%lo:53', 'systemd-resolve', 410, 13, 101, null]]
    .filter(s => !s[7] || S.services[s[7]].active).filter(s => procBy(s[4]) || !['python3'].includes(s[3]));
  let rows = socks;
  if (/t/.test(fl) && !/u/.test(fl)) rows = rows.filter(s => s[0] === 'tcp'); if (/u/.test(fl) && !/t/.test(fl)) rows = rows.filter(s => s[0] === 'udp');
  if (/l/.test(fl)) rows = rows.filter(s => s[1] !== 'ESTAB'); else if (!/a/.test(fl)) rows = rows.filter(s => s[1] === 'ESTAB');
  const showP = /p/.test(fl);
  io.out('Netid State  Recv-Q Send-Q  Local Address:Port   Peer Address:Port Process\n' + rows.map(s => `${s[0].padEnd(5)} ${s[1].padEnd(6)} 0      ${s[1] === 'LISTEN' ? '4096' : '0   '}   ${(/n/.test(fl) ? s[2] : s[2].replace(':22', ':ssh').replace(':80', ':http')).padStart(18)}   ${(s[8] || '0.0.0.0:*').padStart(17)} ${showP && (S.uid === 0 || s[6] === S.uid) ? `users:(("${s[3]}",pid=${s[4]},fd=${s[5]}))` : ''}`).join('\n') + '\n');
  if (showP && S.uid !== 0) io.err('\x1b[2m(hint: process names for other users\' sockets need sudo)\x1b[0m\n');
  ev('ss', { rows: rows.map(s => ({ port: s[2].split(':').pop(), proc: s[3], state: s[1] })) }); return 0;
};
const DNS = { 'google.com': { A: ['142.250.185.78'], MX: ['10 smtp.google.com.'], NS: ['ns1.google.com.', 'ns2.google.com.'], tld: 'com' }, 'example.com': { A: ['93.184.215.14'], MX: ['0 .'], NS: ['a.iana-servers.net.'], tld: 'com' }, 'github.com': { A: ['140.82.121.4'], MX: ['1 aspmx.l.google.com.'], NS: ['dns1.p08.nsone.net.'], tld: 'com' }, 'linux.org': { A: ['104.21.32.1', '172.67.152.10'], MX: ['10 mail.linux.org.'], NS: ['ns1.cloudflare.com.'], tld: 'org' }, 'www.example.com': { CNAME: ['example.com.'], A: ['93.184.215.14'], tld: 'com' } };
CMDS.dig = (a, io) => {
  const short = a.includes('+short'); const trace = a.includes('+trace');
  const srv = (a.find(x => x.startsWith('@')) || '@127.0.0.53').slice(1);
  const args = a.filter(x => !x.startsWith('+') && !x.startsWith('@'));
  const name = (args.find(x => !/^(A|AAAA|MX|NS|TXT|CNAME|ANY)$/i.test(x)) || '.').replace(/\.$/, '');
  const type = (args.find(x => /^(A|AAAA|MX|NS|TXT|CNAME|ANY)$/i.test(x)) || 'A').toUpperCase();
  const rec = DNS[name]; const ans = rec ? (rec[type] || []) : [];
  const ttl = type === 'A' ? 300 : 3600;
  ev('dns', { name, rtype: type, answer: ans, tld: rec ? rec.tld : name.split('.').pop(), nx: !rec });
  if (short) { io.out(joinL(rec && rec.CNAME && type === 'A' ? rec.CNAME.concat(ans) : ans)); return 0; }
  const status = rec ? 'NOERROR' : 'NXDOMAIN';
  io.out(`\n; <<>> DiG 9.18.28-0ubuntu0.24.04.1 <<>> ${a.join(' ')}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: 41827\n;; flags: qr rd ra; QUERY: 1, ANSWER: ${ans.length}, AUTHORITY: 0, ADDITIONAL: 1\n\n;; QUESTION SECTION:\n;${name}.\t\t\tIN\t${type}\n` + (ans.length ? `\n;; ANSWER SECTION:\n${(rec.CNAME && type === 'A' ? rec.CNAME.map(c => `${name}.\t\t${ttl}\tIN\tCNAME\t${c}`) : []).concat(ans.map(x => `${rec.CNAME && type === 'A' ? rec.CNAME[0] : name + '.'}\t\t${ttl}\tIN\t${type}\t${x}`)).join('\n')}\n` : '') + `\n;; Query time: ${rec ? 24 : 61} msec\n;; SERVER: ${srv}#53(${srv}) (UDP)\n;; WHEN: Wed Nov 18 09:34:12 UTC 2026\n;; MSG SIZE  rcvd: ${56 + ans.length * 16}\n\n`);
  return 0;
};
CMDS.traceroute = (a, io) => {
  const h = a.filter(x => !x.startsWith('-'))[0]; if (!h) return fail(io, 'Usage', 'traceroute [ -46dFITnreAUDV ] host', 2);
  const x = resolveHost(h); if (!x) return fail(io, h, 'Name or service not known\nCannot handle "host" cmdline arg `' + h + "' on position 1 (argc 1)", 2);
  const hops = x.hops.length ? x.hops : [x.ip];
  io.out(`traceroute to ${h} (${x.ip}), 30 hops max, 60 byte packets\n` + hops.map((ip, i) => { const base = (i + 1) * (x.ms / hops.length || 0.3); if (i === 1 && hops.length > 3) return ` ${String(i + 1).padStart(2)}  * * *`; return ` ${String(i + 1).padStart(2)}  ${i === 0 ? '_gateway' : ip} (${ip})  ${[0, 1, 2].map(k => (base + k * 0.11).toFixed(3) + ' ms').join('  ')}`; }).join('\n') + '\n');
  ev('net', { kind: 'traceroute', host: h, ip: x.ip, hops }); return 0;
};
CMDS.ufw = (a, io) => {
  if (S.uid !== 0) return fail(io, 'ERROR', 'You need to be root to run this script');
  const [act, ...r] = a; const F = S.firewall;
  const parseRule = (x, verb) => { const m = /^(\d+)(?:\/(tcp|udp))?$/.exec(x) || []; const named = { ssh: '22/tcp', http: '80/tcp', https: '443/tcp', mysql: '3306/tcp' }[x]; return { port: named || (m[1] ? m[1] + (m[2] ? '/' + m[2] : '') : x), action: verb.toUpperCase() }; };
  switch (act) {
    case 'status': io.out(F.enabled ? `Status: active\n${a[1] === 'verbose' ? 'Logging: on (low)\nDefault: deny (incoming), allow (outgoing), disabled (routed)\n' : ''}\nTo                         Action      From\n--                         ------      ----\n${F.rules.map(r => `${r.port.padEnd(26)} ${r.action === 'ALLOW' ? 'ALLOW IN' : 'DENY IN '}    Anywhere`).join('\n')}\n` : 'Status: inactive\n'); ev('fw', { rules: F.rules, enabled: F.enabled, tool: 'ufw' }); return 0;
    case 'enable': F.enabled = true; io.out(`${F.rules.some(r => r.port.startsWith('22') && r.action === 'ALLOW') ? '' : '\x1b[33mCommand may disrupt existing ssh connections. Proceed with operation (y|n)? (simulated: y)\x1b[0m\n'}Firewall is active and enabled on system startup\n`); ev('fw', { rules: F.rules, enabled: true, tool: 'ufw', action: 'enable' }); return 0;
    case 'disable': F.enabled = false; io.out('Firewall stopped and disabled on system startup\n'); ev('fw', { rules: F.rules, enabled: false, tool: 'ufw' }); return 0;
    case 'allow': case 'deny': case 'reject': { const rule = parseRule(r[0] || '', act === 'allow' ? 'ALLOW' : 'DENY'); if (F.rules.some(x => x.port === rule.port && x.action === rule.action)) { io.out('Skipping adding existing rule\n'); return 0; } F.rules.push(rule); io.out('Rule added\nRule added (v6)\n'); ev('fw', { rules: F.rules, enabled: F.enabled, tool: 'ufw', added: rule }); return 0; }
    case 'delete': { const rule = parseRule(r[1] || r[0], r[0] === 'deny' ? 'DENY' : 'ALLOW'); const n = F.rules.length; F.rules = F.rules.filter(x => !(x.port === rule.port && x.action === rule.action)); io.out(n === F.rules.length ? 'Could not delete non-existent rule\n' : 'Rule deleted\nRule deleted (v6)\n'); ev('fw', { rules: F.rules, enabled: F.enabled, tool: 'ufw' }); return 0; }
    case 'default': io.out(`Default ${r[2] || 'incoming'} policy changed to '${r[0]}'\n(be sure to update your rules accordingly)\n`); return 0;
    case 'reset': F.rules = []; F.enabled = false; io.out('Resetting all rules to installed defaults. Proceed with operation (y|n)? (simulated: y)\n'); return 0;
  }
  io.out('Usage: ufw COMMAND\n\nCommands:\n enable | disable | status [verbose]\n allow|deny ARGS | delete RULE | default ARG | reset\n'); return act ? 1 : 0;
};
CMDS.iptables = (a, io) => {
  if (S.uid !== 0) return fail(io, 'iptables v1.8.10 (nf_tables)', 'Could not fetch rule set generation id: Permission denied (you must be root)', 4);
  const g = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('-L') || a.includes('-S')) {
    const chains = ['INPUT', 'FORWARD', 'OUTPUT']; S.iptPol = S.iptPol || { INPUT: 'ACCEPT', FORWARD: 'ACCEPT', OUTPUT: 'ACCEPT' };
    io.out(chains.map(c => `Chain ${c} (policy ${S.iptPol[c]})\ntarget     prot opt source               destination\n${S.ipt.filter(r => r.chain === c).map(r => `${r.target.padEnd(10)} ${r.p.padEnd(4)} --  ${(r.s || 'anywhere').padEnd(20)} anywhere             ${r.dport ? r.p + ' dpt:' + r.dport : ''}`).join('\n')}`).join('\n\n') + '\n');
    ev('fw', { rules: S.ipt.filter(r => r.chain === 'INPUT').map(r => ({ port: r.dport ? r.dport + '/' + r.p : 'all', action: r.target, src: r.s })), enabled: true, tool: 'iptables', policy: S.iptPol.INPUT }); return 0;
  }
  if (a.includes('-F')) { S.ipt = []; return 0; }
  if (a.includes('-P')) { S.iptPol = S.iptPol || { INPUT: 'ACCEPT', FORWARD: 'ACCEPT', OUTPUT: 'ACCEPT' }; const i = a.indexOf('-P'); S.iptPol[a[i + 1]] = a[i + 2]; ev('fw', { rules: S.ipt.map(r => ({ port: r.dport ? r.dport + '/' + r.p : 'all', action: r.target })), enabled: true, tool: 'iptables', policy: a[i + 2] }); return 0; }
  const chain = g('-A') || g('-I') || g('-D'); if (!chain) return fail(io, 'iptables v1.8.10 (nf_tables)', 'no command specified\nTry `iptables -h\' for more information.', 2);
  const rule = { chain, p: g('-p') || 'all', dport: g('--dport'), s: g('-s'), target: g('-j') || 'ACCEPT' };
  if (a.includes('-D')) S.ipt = S.ipt.filter(r => !(r.chain === rule.chain && r.dport === rule.dport && r.target === rule.target));
  else if (a.includes('-I')) S.ipt.unshift(rule); else S.ipt.push(rule);
  ev('fw', { rules: S.ipt.filter(r => r.chain === 'INPUT').map(r => ({ port: r.dport ? r.dport + '/' + r.p : 'all', action: r.target, src: r.s })), enabled: true, tool: 'iptables', added: { port: rule.dport ? rule.dport + '/' + rule.p : 'all', action: rule.target }, policy: (S.iptPol || {}).INPUT || 'ACCEPT' });
  return 0;
};
CMDS.rsync = (a, io) => {
  const { f, rest } = go(a, 'avzrnhPpu', 'e', { archive: 'a', verbose: 'v', compress: 'z', recursive: 'r', 'dry-run': 'n', delete: 'DEL', progress: 'P', 'human-readable': 'h' });
  if (rest.length < 2) return fail(io, 'rsync', 'missing source or destination\nrsync error: syntax or usage error (code 1)', 1);
  const dst = rest.pop(); const dry = f.n || f['dry-run'];
  if (/^[^/]+:/.test(dst)) { const h = dst.split(':')[0].split('@').pop(); const x = resolveHost(h); if (!x || !x.ssh) return fail(io, 'ssh', `connect to host ${h} port 22: Connection refused\nrsync: connection unexpectedly closed (0 bytes received so far) [sender]\nrsync error: unexplained error (code 255)`, 255); io.out(`sending incremental file list\n${rest.map(s => baseName(s) + '/').join('\n')}\n\nsent 1,204 bytes  received 35 bytes  2,478.00 bytes/sec\ntotal size is 3,120  speedup is 2.52${dry ? ' (DRY RUN)' : ''}\n`); ev('net', { kind: 'scp', host: h, ip: x.ip, hops: x.hops, dir: 'up', file: 'rsync' }); return 0; }
  let sent = [], deleted = [];
  for (const src of rest) {
    const s = lookup(src); if (s.err) { io.err(`rsync: [sender] link_stat "${norm(src)}" failed: ${s.err} (2)\n`); continue; }
    const into = /\/$/.test(src) ? norm(dst) : norm(dst) + '/' + baseName(src);
    if (s.n.t === 'd' && !(f.a || f.r)) { io.out(`skipping directory ${src}\n`); continue; }
    const walk = (sp, dp, rel) => {
      const sr = lookup(sp, false), dr = lookup(dp, false);
      if (sr.n.t === 'd') {
        if (!dr.n) { sent.push(rel + '/'); if (!dry) fsCreate(dp, 'd'); }
        for (const nm of Object.keys(sr.n.ent).sort()) walk(sp + '/' + nm, dp + '/' + nm, (rel ? rel + '/' : '') + nm);
        if (f.DEL && dr.n && dr.n.t === 'd') for (const nm of Object.keys(dr.n.ent)) if (!(nm in sr.n.ent)) { deleted.push((rel ? rel + '/' : '') + nm); if (!dry) fsUnlinkTree(dp + '/' + nm); }
      } else {
        if (dr.n && dr.n.data === sr.n.data && (dr.n.sz ?? null) === (sr.n.sz ?? null)) return;
        sent.push(rel || baseName(sp));
        if (!dry) { const w = writeFile(dp, sr.n.data || ''); if (!w.err) { if (sr.n.sz != null) w.n.sz = sr.n.sz; if (f.a) { w.n.mode = sr.n.mode; w.n.mtime = sr.n.mtime; } ev('copy', { src: sr.path, dst: dp, ino: sr.ino, newIno: lookup(dp).ino, kind: 'f' }); } }
      }
    };
    if (s.n.t === 'd' && !/\/$/.test(src) && !lookup(into).n && !dry) { /* created in walk */ }
    walk(s.path, into, s.n.t === 'd' && !/\/$/.test(src) ? baseName(src) : '');
  }
  const total = sent.length * 412;
  io.out(`${f.v || dry ? 'sending incremental file list\n' + deleted.map(d => 'deleting ' + d + '\n').join('') + joinL(sent.map(s => s.replace(/^\//, '')).filter(Boolean)) : ''}${f.v || dry ? '\n' : ''}${f.v || dry ? `sent ${total + 120} bytes  received ${sent.length * 19 + 20} bytes  ${(total * 2.1).toFixed(2)} bytes/sec\ntotal size is ${total * 3}  speedup is ${(3 / 1.1).toFixed(2)}${dry ? ' (DRY RUN)' : ''}\n` : ''}`);
  ev('rsync', { sent, deleted, dry: !!dry });
  return 0;
};
/* ---------- containers ---------- */
const hex = n => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
CMDS.docker = (a, io) => {
  if (S.uid !== 0 && !userGroups(curUser()).includes('docker')) return fail(io, 'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock', 'Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.45/containers/json": dial unix /var/run/docker.sock: connect: permission denied', 1);
  if (!S.services.docker.active) return fail(io, 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock', 'Is the docker daemon running?', 1);
  const [sub, ...r] = a; const byName = n => S.containers.find(c => c.name === n || c.id.startsWith(n));
  switch (sub) {
    case 'run': {
      const { f, rest } = go(r, 'ditP', 'pmeNv', { name: 'N', memory: 'm', detach: 'd', publish: 'p', cpus: 'CPU', rm: 'RM', env: 'e', interactive: 'i', tty: 't', volume: 'v' });
      const img = rest[0]; if (!img) return fail(io, 'docker', '"docker run" requires at least 1 argument.', 1);
      const im = img.includes(':') ? img : img + ':latest';
      let pull = '';
      if (!S.images.includes(im)) { if (!/^(nginx|ubuntu|alpine|redis|postgres|python|node|busybox|hello-world)(:|$)/.test(img)) return fail(io, 'docker', `Error response from daemon: pull access denied for ${img}, repository does not exist`, 125); pull = `Unable to find image '${im}' locally\n${im.split(':')[1]}: Pulling from library/${im.split(':')[0]}\na2318d6c47ec: Pull complete\nDigest: sha256:${hex(64)}\nStatus: Downloaded newer image for ${im}\n`; S.images.push(im); }
      const name = f.N || ['eager_turing', 'quirky_lovelace', 'brave_hopper', 'jolly_ritchie'][S.containers.length % 4] + (S.containers.length > 3 ? S.containers.length : '');
      if (S.containers.some(c => c.name === name)) return fail(io, 'docker', `Error response from daemon: Conflict. The container name "/${name}" is already in use.`, 125);
      const cmd = rest.slice(1).join(' ') || ({ nginx: 'nginx -g daemon off;', redis: 'redis-server', ubuntu: 'bash', alpine: '/bin/sh', python: 'python3', 'hello-world': '/hello' }[im.split(':')[0]] || 'sh');
      const longRun = /^nginx|^redis|^postgres/.test(im) && !rest[1] || /sleep|tail -f/.test(cmd);
      const hostPid = S.nextPid++; const c = { id: hex(12), name, image: im, cmd, ports: f.p || '', mem: f.m || '', cpus: f.CPU || '', up: longRun, hostPid, created: 'Less than a second ago', usage: { cpu: (Math.random() * 3).toFixed(2), mem: Math.round(8 + Math.random() * 20) } };
      if (!(f.RM && !longRun)) S.containers.push(c);
      if (longRun) S.procs.push({ pid: hostPid, ppid: 950, uid: 0, cmd: cmd.split(';')[0], comm: cmd.split(' ')[0], st: 'S', cpu: 0.1, mem: 0.3, ni: 0, tty: '?', start: '09:34', container: c.id });
      ev('docker', { action: 'run', c: Object.assign({}, c), detach: !!f.d });
      if (pull) io.err(pull);
      if (f.d) { io.out(c.id + hex(52) + '\n'); return 0; }
      if (im.startsWith('hello-world')) io.out('\nHello from Docker!\nThis message shows that your installation appears to be working correctly.\n');
      else if (!longRun) { const inner = rest.slice(1); if (inner[0] === 'echo') io.out(inner.slice(1).join(' ') + '\n'); else if (inner[0] === 'hostname') io.out(c.id + '\n'); else if (inner[0] === 'ps') io.out('    PID TTY          TIME CMD\n      1 pts/0    00:00:00 ps\n'); else if (inner[0] === 'whoami') io.out('root\n'); else if (inner[0] === 'cat' && inner[1] === '/etc/os-release') io.out(im.startsWith('alpine') ? 'NAME="Alpine Linux"\nVERSION_ID=3.20.3\n' : 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\n'); else if (inner.length) io.out(`\x1b[2m(simulated: "${inner.join(' ')}" ran inside the container)\x1b[0m\n`); else if (f.i || f.t) io.out(`root@${c.id}:/# \x1b[2m(simulated: interactive container shells aren't supported — try: docker run ubuntu cat /etc/os-release)\x1b[0m\nexit\n`); }
      else io.out(`\x1b[2m(${name} is running in the foreground — add -d to run it in the background. Simulator returns now.)\x1b[0m\n`);
      return 0;
    }
    case 'ps': { const all = r.includes('-a'); io.out('CONTAINER ID   IMAGE          COMMAND                  CREATED          STATUS                     PORTS                  NAMES\n' + S.containers.filter(c => all || c.up).map(c => `${c.id}   ${c.image.padEnd(14).slice(0, 14)} "${c.cmd.slice(0, 20)}…"  ${'2 minutes ago'.padEnd(16)} ${(c.up ? 'Up 2 minutes' : 'Exited (0) 2 minutes ago').padEnd(26)} ${(c.ports ? '0.0.0.0:' + c.ports.replace(':', '->') + '/tcp' : '').padEnd(22)} ${c.name}`).join('\n') + '\n'); ev('docker', { action: 'ps', list: S.containers.filter(c => all || c.up).map(c => Object.assign({}, c)) }); return 0; }
    case 'images': io.out('REPOSITORY    TAG       IMAGE ID       CREATED       SIZE\n' + S.images.map(i => `${i.split(':')[0].padEnd(13)} ${i.split(':')[1].padEnd(9)} ${hex(12)}   2 weeks ago   ${({ nginx: '192MB', ubuntu: '78.1MB', alpine: '7.8MB' })[i.split(':')[0]] || '120MB'}`).join('\n') + '\n'); return 0;
    case 'exec': {
      const i = r.findIndex(x => !x.startsWith('-')); const c = byName(r[i]); const inner = r.slice(i + 1);
      if (!c) return fail(io, 'Error response from daemon', `No such container: ${r[i]}`, 1);
      if (!c.up) return fail(io, 'Error response from daemon', `container ${c.id} is not running`, 1);
      ev('docker', { action: 'exec', c: Object.assign({}, c), cmd: inner.join(' ') });
      const map = { ps: `    PID TTY          TIME CMD\n      1 ?        00:00:00 ${c.cmd.split(' ')[0]}\n     29 pts/0    00:00:00 ps`, hostname: c.id, whoami: 'root', 'ls /': 'bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var', ls: 'bin  boot  dev  etc  home  lib  proc  root  usr  var', 'cat /etc/os-release': 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"', 'ps aux': `USER  PID %CPU %MEM COMMAND\nroot    1  0.0  0.1 ${c.cmd}\nroot   29  0.0  0.0 ps aux`, 'ip a': '1: lo: <LOOPBACK,UP> ...\n    inet 127.0.0.1/8\n42: eth0@if43: <BROADCAST,UP>\n    inet 172.17.0.2/16' };
      io.out((map[inner.join(' ')] ?? (inner[0] === 'echo' ? inner.slice(1).join(' ') : (inner[0] === 'bash' || inner[0] === 'sh') ? `root@${c.id}:/# \x1b[2m(simulated — interactive shells aren't supported; try: docker exec ${c.name} ps)\x1b[0m` : `\x1b[2m(simulated: "${inner.join(' ')}" ran inside ${c.name})\x1b[0m`)) + '\n'); return 0;
    }
    case 'stop': case 'kill': case 'start': case 'restart': {
      for (const n of r.filter(x => !x.startsWith('-'))) { const c = byName(n); if (!c) return fail(io, 'Error response from daemon', `No such container: ${n}`, 1); const up = sub !== 'stop' && sub !== 'kill'; if (c.up && !up) S.procs = S.procs.filter(p => p.pid !== c.hostPid); if (!c.up && up) { c.hostPid = S.nextPid++; S.procs.push({ pid: c.hostPid, ppid: 950, uid: 0, cmd: c.cmd, comm: c.cmd.split(' ')[0], st: 'S', cpu: 0.1, mem: 0.3, ni: 0, tty: '?', start: '09:34', container: c.id }); } c.up = up; io.out(n + '\n'); ev('docker', { action: sub, c: Object.assign({}, c) }); }
      return 0;
    }
    case 'rm': { for (const n of r.filter(x => !x.startsWith('-'))) { const c = byName(n); if (!c) return fail(io, 'Error response from daemon', `No such container: ${n}`, 1); if (c.up && !r.includes('-f')) return fail(io, 'Error response from daemon', `cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`, 1); S.containers = S.containers.filter(x => x !== c); S.procs = S.procs.filter(p => p.pid !== c.hostPid); io.out(n + '\n'); ev('docker', { action: 'rm', c }); } return 0; }
    case 'stats': { const up = S.containers.filter(c => c.up); io.out('CONTAINER ID   NAME             CPU %     MEM USAGE / LIMIT     MEM %     NET I/O         PIDS\n' + up.map(c => `${c.id}   ${c.name.padEnd(16)} ${(c.usage.cpu + '%').padEnd(9)} ${(c.usage.mem + 'MiB / ' + (c.mem ? c.mem.replace(/m$/i, 'MiB').replace(/g$/i, 'GiB') : '7.67GiB')).padEnd(21)} ${(c.usage.mem / (c.mem ? parseInt(c.mem) * (/g$/i.test(c.mem) ? 1024 : 1) : 7853) * 100).toFixed(2).padStart(5)}%    1.2kB / 0B      2`).join('\n') + '\n' + (r.includes('--no-stream') ? '' : '\x1b[2m(docker stats refreshes live; showing one snapshot)\x1b[0m\n')); ev('docker', { action: 'stats', list: up.map(c => Object.assign({}, c)) }); return 0; }
    case 'logs': { const c = byName(r.filter(x => !x.startsWith('-'))[0] || ''); if (!c) return fail(io, 'Error response from daemon', 'No such container', 1); io.out(c.image.startsWith('nginx') ? `/docker-entrypoint.sh: Configuration complete; ready for start up\n2026/11/18 09:34:13 [notice] 1#1: nginx/1.27.2\n2026/11/18 09:34:13 [notice] 1#1: start worker processes\n` : '(no output)\n'); return 0; }
    case 'pull': { const im = r[0].includes(':') ? r[0] : r[0] + ':latest'; if (!S.images.includes(im)) S.images.push(im); io.out(`${im.split(':')[1]}: Pulling from library/${im.split(':')[0]}\na2318d6c47ec: Pull complete\nStatus: Downloaded newer image for ${im}\ndocker.io/library/${im}\n`); return 0; }
    case 'inspect': { const c = byName(r[0] || ''); if (!c) return fail(io, 'Error', 'No such object', 1); io.out(JSON.stringify([{ Id: c.id, Name: '/' + c.name, State: { Running: c.up, Pid: c.up ? c.hostPid : 0 }, HostConfig: { Memory: c.mem ? parseInt(c.mem) * 1048576 : 0, NanoCpus: c.cpus ? +c.cpus * 1e9 : 0 }, Config: { Image: c.image, Cmd: c.cmd.split(' ') } }], null, 2) + '\n'); return 0; }
  }
  io.out('Usage:  docker [OPTIONS] COMMAND\n\nCommon Commands:\n  run      Create and run a new container from an image\n  exec     Execute a command in a running container\n  ps       List containers\n  images   List images\n  stop     Stop one or more running containers\n  rm       Remove one or more containers\n  stats    Display a live stream of container resource usage\n  logs     Fetch the logs of a container\n'); return sub ? 1 : 0;
};
CMDS.lsns = (a, io) => {
  const base = [['4026531834', 'time'], ['4026531835', 'cgroup'], ['4026531836', 'pid'], ['4026531837', 'user'], ['4026531838', 'uts'], ['4026531839', 'ipc'], ['4026531840', 'net'], ['4026531841', 'mnt']];
  let out = '        NS TYPE   NPROCS   PID USER COMMAND\n' + base.map(([n, t]) => `${n} ${t.padEnd(6)} ${String(S.uid === 0 ? S.procs.length : S.procs.filter(p => p.uid === S.uid).length).padStart(6)} ${String(S.uid === 0 ? 1 : 1200).padStart(5)} ${curUser().padEnd(4)} ${S.uid === 0 ? '/sbin/init splash' : '-bash'}`).join('\n') + '\n';
  if (S.uid === 0) S.containers.filter(c => c.up).forEach((c, k) => { ['mnt', 'uts', 'ipc', 'pid', 'net', 'cgroup'].forEach((t, i) => { out += `${4026532200 + k * 10 + i} ${t.padEnd(6)} ${'1'.padStart(6)} ${String(c.hostPid).padStart(5)} root ${c.cmd}\n`; }); });
  else if (S.containers.some(c => c.up)) io.err('\x1b[2m(hint: run with sudo to see the namespaces of containers owned by root)\x1b[0m\n');
  io.out(out); ev('ns', { list: true, containers: S.containers.filter(c => c.up).map(c => Object.assign({}, c)) }); return 0;
};
CMDS.unshare = (a, io) => {
  const { f, rest } = go(a, 'pfrunmiUC', '', { pid: 'p', fork: 'f', 'map-root-user': 'r', uts: 'u', net: 'n', mount: 'm', 'mount-proc': 'MP', ipc: 'i', user: 'U' });
  if (S.uid !== 0 && !f.r) return fail(io, 'unshare', 'unshare failed: Operation not permitted');
  const types = ['p', 'u', 'n', 'm', 'i', 'U'].filter(k => f[k] || (k === 'm' && f.MP) || (k === 'U' && f.r));
  const cmd = rest.length ? rest : ['bash'];
  ev('ns', { unshare: types.map(t => ({ p: 'pid', u: 'uts', n: 'net', m: 'mnt', i: 'ipc', U: 'user' }[t])), cmd: cmd.join(' ') });
  if (cmd[0] === 'ps' && f.p && f.MP) { io.out(`    PID TTY          TIME CMD\n      1 pts/0    00:00:00 ${f.f ? 'ps' : 'ps'}\n`); return 0; }
  if (cmd[0] === 'ps' && f.p) { io.err('\x1b[33m(without --mount-proc, ps still reads the host /proc and shows host processes!)\x1b[0m\n'); return CMDS.ps(cmd.slice(1), io, {}); }
  if (cmd[0] === 'whoami' && f.r) { io.out('root\n'); return 0; }
  if (cmd[0] === 'id' && f.r) { io.out('uid=0(root) gid=0(root) groups=0(root),65534(nogroup)\n'); return 0; }
  if (cmd[0] === 'ip' && f.n) { io.out('1: lo: <LOOPBACK> mtu 65536 qdisc noop state DOWN mode DEFAULT\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n'); return 0; }
  if (cmd[0] === 'hostname' && f.u) { if (cmd[1]) return 0; io.out(S.host + '\n'); return 0; }
  if (cmd[0] === 'bash' || cmd[0] === 'sh') { io.out('\x1b[2m(simulated: a shell inside the new namespaces would start here)\x1b[0m\n'); return 0; }
  return execWords(cmd, io, {});
};
