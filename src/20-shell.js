/* ================= SHELL ENGINE ================= */
const strip = s => String(s).replace(/\x1b\[[0-9;]*m/g, '');
let CTX = null, DEPTH = 0;
const SH = { args: [['bash']], exit: null, ret: null, brk: 0 };
function newCtx(line) { return { line, events: [], exp: [], pipes: [], code: 0, cwd0: S.cwd, uid0: S.uid, trace: null, script: null }; }
function ev(type, data) { if (CTX && DEPTH === 0) CTX.events.push(Object.assign({ type }, data || {})); }

/* ---- lexer: words keep their raw quoting; operators separate ---- */
const OPS = ['2>&1', '2>>', '2>', '&&', '&>', '||', '>>', '|', '>', '<', ';', '&'];
function lex(line) {
  const toks = []; let i = 0, cur = '', has = false, st = 0;
  const push = () => { if (has) toks.push({ w: cur, s: st, e: i }); cur = ''; has = false; };
  const begin = () => { if (!has) { st = i; has = true; } };
  while (i < line.length) {
    const c = line[i];
    if (c === "'") { begin(); const j = line.indexOf("'", i + 1); if (j < 0) throw 'unexpected EOF while looking for matching `\''; cur += line.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"') { begin(); let j = i + 1; while (j < line.length && line[j] !== '"') { if (line[j] === '\\') j++; j++; } if (j >= line.length) throw 'unexpected EOF while looking for matching `"\''; cur += line.slice(i, j + 1); i = j + 1; continue; }
    if (c === '\\') { begin(); cur += line.slice(i, i + 2); i += 2; continue; }
    if (c === '$' && (line[i + 1] === '(' || line[i + 1] === '{')) {
      begin(); const open = line[i + 1], close = open === '(' ? ')' : '}'; let d = 0, j = i + 1;
      for (; j < line.length; j++) { if (line[j] === open) d++; else if (line[j] === close && --d === 0) break; }
      cur += line.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '#' && !has) break;
    if (/\s/.test(c)) { push(); i++; continue; }
    let m = null;
    for (const o of OPS) if (line.startsWith(o, i) && (!o.startsWith('2') || !has)) { m = o; break; }
    if (m) { push(); toks.push({ op: m, s: i, e: i + m.length }); i += m.length; continue; }
    begin(); cur += c; i++;
  }
  push(); return toks;
}
function parse(toks) {
  const list = []; let pipe = [], cmd = { words: [], redir: [] };
  const syn = t => { throw `syntax error near unexpected token \`${t}'`; };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.w != null) { cmd.words.push(t.w); continue; }
    if (['>', '>>', '<', '2>', '2>>', '&>'].includes(t.op)) { const f = toks[++k]; if (!f || f.w == null) syn(f ? f.op : 'newline'); cmd.redir.push({ op: t.op, f: f.w }); continue; }
    if (t.op === '2>&1') { cmd.redir.push({ op: '2>&1' }); continue; }
    if (t.op === '|') { if (!cmd.words.length) syn('|'); pipe.push(cmd); cmd = { words: [], redir: [] }; continue; }
    if (cmd.words.length || cmd.redir.length) pipe.push(cmd); else if (pipe.length) syn(t.op); else if (t.op !== ';' || list.length === 0) syn(t.op);
    if (pipe.length) list.push({ pipe, sep: t.op });
    pipe = []; cmd = { words: [], redir: [] };
  }
  if (cmd.words.length || cmd.redir.length) pipe.push(cmd); else if (pipe.length) syn('newline');
  if (pipe.length) list.push({ pipe, sep: ';' });
  return list;
}
/* ---- variables ---- */
function getVar(n) {
  const fr = SH.args[SH.args.length - 1];
  if (n === '?') return String(S.lastExit);
  if (n === '$') return '1200';
  if (n === '!') return String(S.lastBg || '');
  if (n === '#') return String(fr.length - 1);
  if (n === '@' || n === '*') return fr.slice(1).join(' ');
  if (/^\d+$/.test(n)) return fr[+n] ?? '';
  if (n === 'RANDOM') return String(Math.floor(Math.random() * 32768));
  if (n === 'PWD') return S.cwd;
  if (n === 'UID') return String(S.uid);
  return S.vars[n] ?? S.env[n] ?? '';
}
function setVar(n, v) { if (n in S.env) S.env[n] = v; else S.vars[n] = v; }
function arith(expr) {
  const e = expr.replace(/\$?([A-Za-z_]\w*)/g, (m, v) => String(+getVar(v) || 0));
  if (!/^[\d\s+\-*/%()<>=!&|]+$/.test(e)) throw 'arithmetic syntax error';
  const r = Function('"use strict";return (' + e.replace(/\//g, '/') + ')')();
  return String(typeof r === 'boolean' ? +r : Math.trunc(r));
}
/* ---- expansion of one raw word → list of fields ---- */
function expandWord(raw, rec, noSplit, dry) {
  let out = '', glob = false, split = false, q = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (q === "'") { if (c === "'") q = null; else out += c; continue; }
    if (c === "'" && !q) { q = "'"; continue; }
    if (c === '"') { q = q === '"' ? null : '"'; continue; }
    if (c === '\\') { i++; if (i < raw.length) out += (q === '"' && !'$`"\\'.includes(raw[i])) ? '\\' + raw[i] : raw[i]; continue; }
    if (c === '~' && i === 0 && !q && (raw.length === 1 || raw[1] === '/')) { out += home(); continue; }
    if (c === '$') {
      if (raw.startsWith('$((', i)) { const j = raw.indexOf('))', i); out += dry ? '<math>' : arith(raw.slice(i + 3, j)); i = j + 1; continue; }
      if (raw[i + 1] === '(') {
        let d = 0, j = i + 1; for (; j < raw.length; j++) { if (raw[j] === '(') d++; else if (raw[j] === ')' && --d === 0) break; }
        const sub = raw.slice(i + 2, j);
        out += dry ? `<output of ${sub}>` : captureRun(sub).replace(/\n+$/, '');
        if (!q) split = true; i = j; continue;
      }
      if (raw[i + 1] === '{') { const j = raw.indexOf('}', i); const nm = raw.slice(i + 2, j); out += nm.startsWith('#') ? String(getVar(nm.slice(1)).length) : getVar(nm); i = j; if (!q) split = true; continue; }
      const m = /^([A-Za-z_]\w*|[?$#@*!0-9])/.exec(raw.slice(i + 1));
      if (m) { out += getVar(m[1]); i += m[1].length; if (!q) split = true; continue; }
      out += '$'; continue;
    }
    if (!q && (c === '*' || c === '?' || (c === '[' && raw.indexOf(']', i) > i + 1))) glob = true;
    out += c;
  }
  let res = [out];
  if (split && !noSplit) res = out.split(/\s+/).filter(Boolean);
  if (glob && !noSplit) { const g = globExpand(out); if (g.length) res = g; }
  if (rec && raw !== res.join(' ')) rec.push({ from: raw, to: res.join(' ') || '(empty)' });
  return res;
}
function globRe(p) { return new RegExp('^' + p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$'); }
function globExpand(pat) {
  const abs = pat.startsWith('/'); const parts = pat.split('/').filter((x, i) => x || i === 0);
  let paths = [abs ? '/' : ''];
  for (const part of parts) {
    if (part === '') continue;
    const next = [];
    for (const base of paths) {
      if (!/[*?[]/.test(part)) { next.push(base + (base && !base.endsWith('/') ? '/' : '') + part); continue; }
      const r = lookup(base || '.'); if (!r.n || r.n.t !== 'd') continue;
      const re = globRe(part);
      for (const nm of readdirNames(r.n, r.path).sort()) if (re.test(nm) && (part.startsWith('.') || !nm.startsWith('.'))) next.push(base + (base && !base.endsWith('/') ? '/' : '') + nm);
    }
    paths = next;
  }
  return paths.filter(p => !lookup(p, false).err);
}
function captureRun(src) {
  let buf = ''; DEPTH++;
  try { runText(src, { out: s => buf += s, err: s => termErr(s), tty: false }); } finally { DEPTH--; }
  return strip(buf);
}
let termErr = () => {};

/* ---- running ---- */
function runText(text, sink) {
  let list;
  try { list = parse(lex(text)); } catch (e) { sink.err(`bash: ${e}\n`); return 2; }
  return runList(list, sink);
}
function runList(list, sink) {
  let code = S.lastExit;
  for (let i = 0; i < list.length; i++) {
    if (SH.exit != null || SH.ret != null || SH.brk) break;
    const prev = i ? list[i - 1].sep : ';';
    if ((prev === '&&' && code !== 0) || (prev === '||' && code === 0)) continue;
    const { pipe, sep } = list[i];
    if (sep === '&') code = runBg(pipe, sink);
    else code = runPipe(pipe, sink);
    S.lastExit = code;
  }
  return code;
}
function runBg(pipe, sink) {
  const jn = (S.jobs.reduce((m, j) => Math.max(m, j.n), 0)) + 1;
  const before = S.procs.length;
  const code = runPipe(pipe, Object.assign({}, sink, { bg: jn }), true);
  const sp = S.procs.slice(before).find(p => p.job === jn);
  const raw = pipe.map(c => c.words.join(' ')).join(' | ');
  if (sp) { S.jobs.push({ n: jn, pid: sp.pid, cmd: raw, st: 'Running' }); sink.out(`[${jn}] ${sp.pid}\n`); S.lastBg = sp.pid; ev('spawn', { pid: sp.pid, name: sp.comm, job: jn }); }
  else { const pid = S.nextPid++; S.lastBg = pid; sink.out(`[${jn}] ${pid}\n[${jn}]+  Done                    ${raw}\n`); ev('spawn', { pid, name: pipe[0].words[0], job: jn, done: true }); }
  return 0;
}
function runPipe(pipe, sink, bg) {
  let input = sink.stdin ?? null, code = 0; const recs = [];
  for (let k = 0; k < pipe.length; k++) {
    const c = pipe[k], last = k === pipe.length - 1;
    const rec = { raw: c.words.join(' '), redir: [], exp: [] };
    let ws = c.words.slice();
    const assigns = [];
    while (ws.length && /^[A-Za-z_]\w*=/.test(ws[0])) assigns.push(ws.shift());
    if (!ws.length && assigns.length) {
      for (const a of assigns) { const i = a.indexOf('='); setVar(a.slice(0, i), expandWord(a.slice(i + 1), rec.exp, true).join(' ')); ev('assign', { name: a.slice(0, i), value: getVar(a.slice(0, i)) }); }
      rec.name = '(assignment)'; rec.words = assigns; rec.code = 0; rec.builtin = true; recs.push(rec); code = 0; continue;
    }
    let words = [];
    try { for (const w of ws) words.push(...expandWord(w, rec.exp)); }
    catch (e) { sink.err(`bash: ${e}\n`); code = 1; recs.push(rec); continue; }
    if (CTX && DEPTH === 0) CTX.exp.push(...rec.exp);
    let stdin = input, ok = true; const outs = [];
    for (const r of c.redir) {
      const f = r.f != null ? expandWord(r.f)[0] : null;
      rec.redir.push({ op: r.op, f });
      if (r.op === '<') { const x = readFile(f); if (x.err) { sink.err(`bash: ${f}: ${x.err}\n`); ok = false; break; } stdin = x.data; ev('redir', { op: '<', file: f, data: x.data, cmd: words[0] }); }
      else if (r.op === '2>&1') outs.push({ op: r.op });
      else {
        const before = readFile(f);
        const w = writeFile(f, '', r.op === '>>' || r.op === '2>>');
        if (w.err) { sink.err(`bash: ${f}: ${w.err}\n`); ok = false; break; }
        outs.push({ op: r.op, f, before: before.data ?? null });
      }
    }
    if (!ok) { code = 1; input = ''; rec.code = 1; recs.push(rec); continue; }
    let outBuf = '', errBuf = '';
    const hasOut = outs.some(o => o.op === '>' || o.op === '>>' || o.op === '&>');
    const io = { stdin, tty: last && !hasOut && !!sink.tty, out: s => outBuf += s, err: s => errBuf += s, bg: sink.bg, sink };
    try { code = execWords(words, io, rec); }
    catch (e) { errBuf += `bash: internal simulator error in ${words[0]}: ${e.message || e}\n`; code = 1; console.error(e); }
    if (outs.some(o => o.op === '2>&1')) { outBuf += errBuf; errBuf = ''; }
    for (const o of outs) {
      if (o.op === '>' || o.op === '>>' || o.op === '&>') { const d = strip(outBuf + (o.op === '&>' ? errBuf : '')); writeFile(o.f, d, true); ev('redir', { op: o.op, file: o.f, before: o.before, data: d, cmd: words[0] }); outBuf = ''; if (o.op === '&>') errBuf = ''; }
      else if (o.op === '2>' || o.op === '2>>') { writeFile(o.f, strip(errBuf), true); ev('redir', { op: o.op, file: o.f, before: o.before, data: strip(errBuf), cmd: words[0] }); errBuf = ''; }
    }
    Object.assign(rec, { name: words[0], words, code, out: strip(outBuf), err: strip(errBuf), stdin });
    if (errBuf) sink.err(errBuf);
    if (last) sink.out(outBuf); else input = strip(outBuf);
    recs.push(rec);
  }
  if (CTX && DEPTH === 0 && recs.length) CTX.pipes.push({ cmds: recs, bg: !!bg });
  return code;
}
function findInPath(name) {
  for (const d of (S.env.PATH || '').split(':')) {
    if (!d) continue;
    const r = lookup(d + '/' + name);
    if (r.n && r.n.t === 'f' && (r.n.mode & 0o111)) return r.path;
  }
  return null;
}
function execWords(words, io, rec = {}) {
  if (!words.length) return 0;
  let name = words[0], args = words.slice(1);
  if (S.aliases[name] && !rec.alias) {
    const ex = parse(lex(S.aliases[name]))[0].pipe[0].words.flatMap(w => expandWord(w));
    rec.alias = `${name} → ${S.aliases[name]}`; words = ex.concat(args); name = words[0]; args = words.slice(1);
  }
  rec.name = name;
  if (S.funcs[name]) {
    rec.kind = 'function';
    SH.args.push([name, ...args]);
    const code = execNodes(S.funcs[name], io);
    SH.args.pop();
    const r = SH.ret; SH.ret = null; return r ?? code;
  }
  if (BUILTINS.has(name) && CMDS[name]) { rec.kind = 'builtin'; rec.builtin = true; return CMDS[name](args, io, rec) ?? 0; }
  let path = null;
  if (name.includes('/')) {
    const r = lookup(name);
    if (r.err) { io.err(`bash: ${name}: ${r.err}\n`); return 127; }
    if (r.n.t === 'd') { io.err(`bash: ${name}: Is a directory\n`); return 126; }
    if (!can(r.n, 'x')) { io.err(`bash: ${name}: Permission denied\n`); return 126; }
    path = r.path;
    if ((r.n.data || '').startsWith('#!')) { rec.path = path; rec.kind = 'script'; return runScript(path, args, io); }
  } else {
    path = findInPath(name);
    if (!path) { notFound(name, io); return 127; }
  }
  rec.path = path; rec.kind = 'program'; rec.pid = S.nextPid++;
  const fn = CMDS[baseName(path)];
  if (!fn) { io.err(`${name}: (simulated program — no behaviour defined)\n`); return 0; }
  return fn(args, io, rec) ?? 0;
}
const PKG_CMDS = { tree: 'tree', htop: 'htop', cowsay: 'cowsay', jq: 'jq', neofetch: 'neofetch', git: 'git', python: 'python-is-python3', node: 'nodejs' };
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function notFound(name, io) {
  if (PKG_CMDS[name]) { io.err(`Command '${name}' not found, but can be installed with:\n  sudo apt install ${PKG_CMDS[name]}\n`); return; }
  io.err(`bash: ${name}: command not found\n`);
  const all = [...new Set([...Object.keys(CMDS), ...Object.keys(S.aliases)])];
  let best = null, bd = 9;
  for (const c of all) { const d = lev(name.toLowerCase(), c); if (d < bd) { bd = d; best = c; } }
  if (best && bd <= Math.max(1, Math.min(2, name.length - 1))) io.err(`\x1b[33mHint: did you mean '${best}'?\x1b[0m\n`);
  else io.err(`\x1b[33mHint: type 'help' to see the commands this simulator knows.\x1b[0m\n`);
}

/* ---- tiny bash interpreter for scripts & compound statements ---- */
function splitStmts(line) {
  const out = []; let cur = '', q = null, d = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') { cur += c + (line[i + 1] || ''); i++; continue; }
    if (q) { if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(') d++; if (c === ')') d--;
    if (c === '#' && !d && (!cur || /\s$/.test(cur))) break;
    if (c === ';' && !d && line[i + 1] !== ';') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur); return out;
}
function parseScript(src) {
  const items = [];
  src.split('\n').forEach((ln, li) => {
    for (const p of splitStmts(ln)) {
      let t = p.trim(), m;
      while (t) {
        if ((m = /^(then|do|else|\{)(?:\s+(.*))?$/.exec(t))) { items.push({ k: m[1], line: li }); t = (m[2] || '').trim(); continue; }
        if ((m = /^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*(\{)?\s*(.*)$/.exec(t)) || (m = /^function\s+([A-Za-z_][\w-]*)\s*(\{)?\s*(.*)$/.exec(t))) { items.push({ k: 'func', name: m[1], line: li }); if (m[2]) items.push({ k: '{', line: li }); t = (m[3] || '').trim(); continue; }
        if ((m = /^(if|elif|while|until)\s+(.*)$/.exec(t))) { items.push({ k: m[1], cond: m[2], line: li }); break; }
        if ((m = /^for\s+([A-Za-z_]\w*)\s+in\s+(.*)$/.exec(t))) { items.push({ k: 'for', v: m[1], list: m[2], line: li }); break; }
        if ((m = /^(fi|done|\})\s*(.*)$/.exec(t))) { items.push({ k: m[1], line: li }); t = (m[2] || '').replace(/^;/, '').trim(); continue; }
        if (t === 'break' || t === 'continue') { items.push({ k: t, line: li }); break; }
        items.push({ k: 'cmd', text: t, line: li }); break;
      }
    }
  });
  const [nodes, i] = block(items, 0, []);
  if (i < items.length) throw `syntax error near unexpected token \`${items[i].k}'`;
  return nodes;
}
function block(items, i, ends) {
  const out = [];
  const expect = (k) => { if (!items[i] || items[i].k !== k) throw `syntax error: expected '${k}'`; i++; };
  while (i < items.length) {
    const it = items[i];
    if (ends.includes(it.k)) return [out, i];
    if (it.k === 'if') {
      const node = { k: 'if', arms: [], els: null, line: it.line }; let cond = it.cond, cl = it.line; i++;
      for (;;) {
        expect('then'); let body; [body, i] = block(items, i, ['elif', 'else', 'fi']); node.arms.push({ cond, line: cl, body });
        const t = items[i]; if (!t) throw "syntax error: missing 'fi'";
        if (t.k === 'elif') { cond = t.cond; cl = t.line; i++; continue; }
        if (t.k === 'else') { [node.els, i] = block(items, i + 1, ['fi']); if (!items[i]) throw "syntax error: missing 'fi'"; }
        i++; break;
      }
      out.push(node); continue;
    }
    if (it.k === 'while' || it.k === 'until' || it.k === 'for') {
      i++; expect('do'); let body; [body, i] = block(items, i, ['done']); if (!items[i]) throw "syntax error: missing 'done'"; i++;
      out.push(Object.assign({}, it, { body })); continue;
    }
    if (it.k === 'func') {
      i++; expect('{'); let body; [body, i] = block(items, i, ['}']); if (!items[i]) throw "syntax error: missing '}'"; i++;
      out.push({ k: 'func', name: it.name, body, line: it.line }); continue;
    }
    if (['then', 'do', 'else', 'elif', 'fi', 'done', '}', '{'].includes(it.k)) throw `syntax error near unexpected token \`${it.k}'`;
    out.push(it); i++;
  }
  return [out, i];
}
function traceAt(line) {
  if (!CTX || !CTX.trace || CTX.trace.length > 120) return;
  const fr = SH.args[SH.args.length - 1];
  const vars = Object.assign({}, S.vars); fr.slice(1).forEach((v, i) => vars['$' + (i + 1)] = v);
  CTX.trace.push({ line, vars, code: S.lastExit });
}
function execNodes(nodes, sink) {
  let code = 0;
  for (const n of nodes) {
    if (SH.exit != null || SH.ret != null || SH.brk) break;
    code = execNode(n, sink); S.lastExit = code;
  }
  return code;
}
function execNode(n, sink) {
  switch (n.k) {
    case 'cmd': traceAt(n.line); return runText(n.text, sink);
    case 'break': case 'continue': SH.brk = n.k; return 0;
    case 'func': traceAt(n.line); S.funcs[n.name] = n.body; return 0;
    case 'if':
      for (const a of n.arms) { traceAt(a.line); if (runText(a.cond, sink) === 0) return execNodes(a.body, sink); }
      return n.els ? execNodes(n.els, sink) : 0;
    case 'while': case 'until': {
      let g = 0;
      for (;;) {
        if (++g > 200) { sink.err('(simulator stopped the loop after 200 iterations)\n'); break; }
        traceAt(n.line); const c = runText(n.cond, sink);
        if ((c === 0) !== (n.k === 'while')) break;
        execNodes(n.body, sink); if (SH.brk === 'break') { SH.brk = 0; break; } SH.brk = 0;
        if (SH.exit != null || SH.ret != null) break;
      }
      return 0;
    }
    case 'for': {
      const ws = []; for (const t of lex(n.list)) if (t.w != null) ws.push(...expandWord(t.w));
      for (const w of ws) {
        setVar(n.v, w); traceAt(n.line);
        execNodes(n.body, sink); if (SH.brk === 'break') { SH.brk = 0; break; } SH.brk = 0;
        if (SH.exit != null || SH.ret != null) break;
      }
      return 0;
    }
  }
  return 0;
}
function isCompound(src) { return src.includes('\n') || splitStmts(src).some(x => /^\s*(if|for|while|until|function)\s|^\s*[A-Za-z_][\w-]*\s*\(\)/.test(x)); }
function runScript(path, args, io, same) {
  const r = readFile(path);
  if (r.err) { io.err(`bash: ${path}: ${r.err}\n`); return 127; }
  let nodes;
  try { nodes = parseScript(r.data); } catch (e) { io.err(`${path}: ${e}\n`); return 2; }
  if (CTX && DEPTH === 0 && !CTX.script) { CTX.script = { path, lines: r.data.split('\n') }; CTX.trace = []; }
  const saved = same ? null : { vars: Object.assign({}, S.vars), env: Object.assign({}, S.env), cwd: S.cwd, funcs: Object.assign({}, S.funcs) };
  SH.args.push([path, ...args]); SH.sd = (SH.sd || 0) + 1;
  let code = execNodes(nodes, Object.assign({}, io, { out: io.out, err: io.err }));
  SH.args.pop(); SH.sd--;
  if (SH.exit != null) { code = SH.exit; SH.exit = null; }
  if (saved) Object.assign(S, { vars: saved.vars, env: saved.env, cwd: saved.cwd, funcs: saved.funcs });
  return code;
}
