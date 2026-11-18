/* ================= COMMANDS (part A) ================= */
const CMDS = {};
function go(a, bools = '', vals = '', longs = {}) {
  const f = {}, rest = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--') { rest.push(...a.slice(i + 1)); break; }
    if (x.startsWith('--') && x.length > 2) {
      const eq = x.indexOf('='); const k = eq > 0 ? x.slice(2, eq) : x.slice(2); const v = eq > 0 ? x.slice(eq + 1) : undefined;
      const m = longs[k];
      if (m && vals.includes(m)) f[m] = v ?? a[++i]; else if (m) f[m] = true; else f[k] = v ?? true;
      continue;
    }
    if (x[0] === '-' && x.length > 1) {
      for (let j = 1; j < x.length; j++) {
        const ch = x[j];
        if (vals.includes(ch)) { f[ch] = x.slice(j + 1) || a[++i]; break; }
        f[ch] = true;
        if (!bools.includes(ch)) f._bad = f._bad || ch;
      }
      continue;
    }
    rest.push(x);
  }
  return { f, rest };
}
const fail = (io, c, m, code = 1) => { io.err(`${c}: ${m}\n`); return code; };
const C = (io, code, s) => io.tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const lines = t => { const a = String(t).split('\n'); if (a[a.length - 1] === '') a.pop(); return a; };
const joinL = a => a.length ? a.join('\n') + '\n' : '';
const badOpt = (io, c, ch) => fail(io, c, `invalid option -- '${ch}'\nTry '${c} --help' for more information.`, 2);
function inputOf(files, io, cmd) {
  if (!files.length) {
    if (io.stdin == null) { io.err(`\x1b[33m(${cmd} is waiting for keyboard input on stdin. In the simulator, give it a file name or pipe text in: echo hello | ${cmd})\x1b[0m\n`); return { text: '', code: 0 }; }
    return { text: io.stdin, code: 0 };
  }
  let text = '', code = 0;
  for (const f of files) {
    if (f === '-') { text += io.stdin || ''; continue; }
    const r = readFile(f);
    if (r.err) { io.err(`${cmd}: ${f}: ${r.err}\n`); code = 1; } else { text += r.data; ev('read', { path: f }); }
  }
  return { text, code };
}
function nameColor(io, nm, n) {
  if (!io.tty || !n) return nm;
  if (n.t === 'd') return `\x1b[34;1m${nm}\x1b[0m`;
  if (n.t === 'l') return `\x1b[36;1m${nm}\x1b[0m`;
  if (/\.(tar|gz|tgz|zip|bz2|xz)$/.test(nm)) return `\x1b[31;1m${nm}\x1b[0m`;
  if (n.mode & 0o111) return `\x1b[32;1m${nm}\x1b[0m`;
  return nm;
}

/* ---------- basics ---------- */
CMDS.pwd = (a, io) => { const { f } = go(a, 'PL'); io.out((f.P ? (lookup(S.cwd).path || S.cwd) : S.cwd) + '\n'); ev('pwd', { path: S.cwd }); return 0; };
CMDS.cd = (a, io) => {
  let t = a[0] ?? home();
  if (a.length > 1) return fail(io, 'bash: cd', 'too many arguments');
  if (t === '-') { t = S.env.OLDPWD || S.cwd; io.out(t + '\n'); }
  const r = lookup(t);
  if (r.err) return fail(io, 'bash: cd', `${t}: ${r.err}`);
  if (r.n.t !== 'd') return fail(io, 'bash: cd', `${t}: Not a directory`);
  if (!can(r.n, 'x')) return fail(io, 'bash: cd', `${t}: Permission denied`);
  const to = norm(t);
  ev('cd', { from: S.cwd, to });
  S.env.OLDPWD = S.cwd; S.cwd = to; S.env.PWD = to; return 0;
};
CMDS.ls = (a, io) => {
  const { f, rest } = go(a, 'laAhRtrS1diFGn', '', { all: 'a', 'almost-all': 'A', 'human-readable': 'h', recursive: 'R', reverse: 'r', directory: 'd', inode: 'i', classify: 'F', color: 'G' });
  if (f._bad) return badOpt(io, 'ls', f._bad);
  const targets = rest.length ? rest : ['.']; let code = 0, out = '';
  const files = [], dirs = [];
  for (const t of targets) {
    const r = lookup(t, !(f.l || f.d) || /\/$/.test(t));
    if (r.err) { io.err(`ls: cannot access '${t}': ${r.err}\n`); code = 2; continue; }
    if (r.n.t === 'd' && !f.d) dirs.push([t, r]); else files.push({ nm: t, n: r.n, ino: r.ino });
  }
  const sortE = es => {
    es.sort((x, y) => x.nm.replace(/^\./, '').toLowerCase().localeCompare(y.nm.replace(/^\./, '').toLowerCase()));
    if (f.t) es.sort((x, y) => y.n.mtime - x.n.mtime);
    if (f.S) es.sort((x, y) => fsize(y.n) - fsize(x.n));
    if (f.r) es.reverse(); return es;
  };
  const fmt = (es, total) => {
    if (!es.length) return '';
    if (f.l || f.n) {
      const rows = es.map(e => [f.i ? String(e.ino) : null, modeStr(e.n), String(e.n.nlink), f.n ? String(e.n.uid) : uname(e.n.uid), f.n ? String(e.n.gid) : gname(e.n.gid), f.h ? human(fsize(e.n)) : String(fsize(e.n)), fdate(e.n.mtime), nameColor(io, e.nm, e.n) + (f.F ? suffix(e.n) : '') + (e.n.t === 'l' ? ' -> ' + e.n.tgt : '')]);
      const w = [0, 1, 2, 3, 4, 5].map(c => Math.max(...rows.map(r => (r[c] || '').length)));
      return (total ? `total ${Math.ceil(es.reduce((s, e) => s + Math.ceil(fsize(e.n) / 4096) * 4, 0))}\n` : '') + rows.map(r => [r[0] != null ? r[0].padStart(w[0]) : null, r[1].padEnd(w[1]), r[2].padStart(w[2]), r[3].padEnd(w[3]), r[4].padEnd(w[4]), r[5].padStart(w[5]), r[6], r[7]].filter(x => x != null).join(' ')).join('\n') + '\n';
    }
    const items = es.map(e => (f.i ? e.ino + ' ' : '') + nameColor(io, e.nm, e.n) + (f.F ? suffix(e.n) : ''));
    return (io.tty && !f['1']) ? items.join('  ') + '\n' : items.join('\n') + '\n';
  };
  const suffix = n => n.t === 'd' ? '/' : n.t === 'l' ? '@' : (n.mode & 0o111) ? '*' : '';
  out += fmt(sortE(files), false);
  const listDir = (label, r, header) => {
    if (!can(r.n, 'r')) { io.err(`ls: cannot open directory '${label}': Permission denied\n`); code = 2; return; }
    let names = readdirNames(r.n, r.path);
    if (!f.a && !f.A) names = names.filter(n => !n.startsWith('.'));
    let es = names.map(nm => { const lr = lookup((r.path === '/' ? '' : r.path) + '/' + nm, false); return lr.n ? { nm, n: lr.n, ino: lr.ino } : null; }).filter(Boolean);
    sortE(es);
    if (f.a) { const pr = lookup(r.path + '/..'); es = [{ nm: '.', n: r.n, ino: r.ino }, { nm: '..', n: pr.n, ino: pr.ino }].concat(es); }
    ev('list', { path: r.path, names: es.map(e => e.nm) });
    if (header) out += (out ? '\n' : '') + label + ':\n';
    out += fmt(es, true);
    if (f.R) for (const e of es) if (e.n.t === 'd' && e.nm !== '.' && e.nm !== '..') listDir((label === '.' ? '.' : label.replace(/\/$/, '')) + '/' + e.nm, lookup(r.path + '/' + e.nm), true);
  };
  for (const [t, r] of dirs) listDir(t, r, targets.length > 1 || f.R || files.length > 0);
  io.out(out); return code;
};
CMDS.clear = (a, io) => { if (CTX) CTX.clear = true; return 0; };
CMDS.echo = (a, io) => {
  let n = false, e = false, i = 0;
  for (; i < a.length && /^-[neE]+$/.test(a[i]); i++) { if (a[i].includes('n')) n = true; if (a[i].includes('e')) e = true; if (a[i].includes('E')) e = false; }
  let s = a.slice(i).join(' ');
  if (e) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\').replace(/\\e\[/g, '\x1b[');
  io.out(s + (n ? '' : '\n')); return 0;
};
CMDS.printf = (a, io) => {
  if (!a.length) return fail(io, 'printf', 'usage: printf format [arguments]', 2);
  let fmt = a[0].replace(/\\n/g, '\n').replace(/\\t/g, '\t'), args = a.slice(1), out = '';
  do { let k = 0; out += fmt.replace(/%(-?\d*)(\.\d+)?([sdf%])/g, (m, w, p, t) => { if (t === '%') return '%'; let v = args[k++] ?? ''; if (t === 'd') v = String(parseInt(v) || 0); if (t === 'f') v = (parseFloat(v) || 0).toFixed(p ? +p.slice(1) : 6); const wd = parseInt(w) || 0; return w.startsWith('-') ? v.padEnd(-wd) : v.padStart(wd); }); args = args.slice(k || args.length); } while (args.length);
  io.out(out); return 0;
};
CMDS.man = (a, io) => {
  const t = a.filter(x => !x.startsWith('-')).pop();
  if (!t) { io.out('What manual page do you want?\nFor example, try \'man ls\'.\n'); return 1; }
  const L = (typeof LESSONS !== 'undefined') && (LESSONS[t] || Object.values(LESSONS).find(l => l.n === t));
  if (!L) return fail(io, 'man', `No manual entry for ${t}`, 16);
  const B = s => C(io, '1', s);
  let o = `${t.toUpperCase()}(1)                 User Commands                 ${t.toUpperCase()}(1)\n\n${B('NAME')}\n       ${t} - ${L.s}\n\n${B('SYNOPSIS')}\n       ${L.sx}\n\n${B('DESCRIPTION')}\n       ${strip(L.s)} ${L.nm ? '(' + L.nm.replace(/<[^>]+>/g, '') + ')' : ''}\n\n`;
  if (L.f && L.f.length) { o += B('OPTIONS') + '\n'; for (const x of L.f) o += `       ${C(io, '1', x[0])}${x[1] ? ', ' + x[1] : ''}\n              ${x[2]}\n\n`; }
  if (L.r && L.r.length) o += `${B('SEE ALSO')}\n       ${L.r.map(r => r[0] + '(1)').join(', ')}\n\n`;
  io.out(o + `\x1b[2m(The real man opens in a pager: arrows scroll, / searches, q quits.)\x1b[0m\n`); return 0;
};
CMDS.help = (a, io) => { io.out('Commands known to this simulator:\n' + Object.keys(CMDS).sort().join('  ') + '\n\nTip: man <command> shows a manual page. Tab completes commands and paths.\n'); return 0; };
CMDS.history = (a, io) => {
  if (a[0] === '-c') { S.history = []; return 0; }
  const n = parseInt(a[0]) || S.history.length;
  const start = S.history.length - n;
  io.out(S.history.slice(-n).map((h, i) => `${String(start + i + 1).padStart(5)}  ${h}`).join('\n') + (S.history.length ? '\n' : ''));
  return 0;
};

/* ---------- files & folders ---------- */
CMDS.touch = (a, io) => {
  const { f, rest } = go(a, 'acm');
  if (!rest.length) return fail(io, 'touch', 'missing file operand');
  let code = 0;
  for (const p of rest) {
    const r = lookup(p);
    if (r.n) { if (!can(r.n, 'w') && r.n.uid !== S.uid) { code = fail(io, 'touch', `cannot touch '${p}': Permission denied`); continue; } r.n.mtime = now(); ev('touch', { path: r.path }); continue; }
    if (f.c) continue;
    const c = fsCreate(p, 'f');
    if (c.err) code = fail(io, 'touch', `cannot touch '${p}': ${c.err}`); else ev('create', { path: c.path, kind: 'f' });
  }
  return code;
};
CMDS.mkdir = (a, io) => {
  const { f, rest } = go(a, 'pv', 'm', { parents: 'p', verbose: 'v', mode: 'm' });
  if (f._bad) return badOpt(io, 'mkdir', f._bad);
  if (!rest.length) return fail(io, 'mkdir', 'missing operand');
  let code = 0;
  for (const p of rest) {
    const targets = [];
    if (f.p) { const parts = norm(p).split('/').filter(Boolean); let acc = ''; for (const c of parts) { acc += '/' + c; targets.push(acc); } } else targets.push(p);
    for (const t of targets) {
      const ex = lookup(t);
      if (ex.n) { if (!f.p) code = fail(io, 'mkdir', `cannot create directory '${p}': File exists`); else if (ex.n.t !== 'd') code = fail(io, 'mkdir', `cannot create directory '${t}': Not a directory`); continue; }
      const c = fsCreate(t, 'd', f.m ? parseInt(f.m, 8) : undefined);
      if (c.err) { code = fail(io, 'mkdir', `cannot create directory '${p}': ${c.err}`); break; }
      ev('create', { path: c.path, kind: 'd' });
      if (f.v) io.out(`mkdir: created directory '${f.p ? t : p}'\n`);
    }
  }
  return code;
};
CMDS.rmdir = (a, io) => {
  const { rest } = go(a, 'pv'); let code = 0;
  if (!rest.length) return fail(io, 'rmdir', 'missing operand');
  for (const p of rest) {
    const r = lookup(p, false);
    if (r.err) { code = fail(io, 'rmdir', `failed to remove '${p}': ${r.err}`); continue; }
    if (r.n.t !== 'd') { code = fail(io, 'rmdir', `failed to remove '${p}': Not a directory`); continue; }
    if (Object.keys(r.n.ent).length) { code = fail(io, 'rmdir', `failed to remove '${p}': Directory not empty`); continue; }
    const u = fsUnlink(p); if (u.err) code = fail(io, 'rmdir', `failed to remove '${p}': ${u.err}`); else ev('delete', { path: r.path, kind: 'd' });
  }
  return code;
};
function cpOne(src, dst, f, io, cmd) {
  const s = lookup(src, !f.P && !(f.a || f.d) || false);
  if (s.err) return fail(io, cmd, `cannot stat '${src}': ${s.err}`);
  if (s.n.t === 'd' && !(f.r || f.R || f.a)) return fail(io, cmd, `-r not specified; omitting directory '${src}'`);
  if (!can(s.n, 'r')) return fail(io, cmd, `cannot open '${src}' for reading: Permission denied`);
  let d = lookup(dst), target = dst, shown = dst;
  if (d.n && d.n.t === 'd') { target = norm(dst) + '/' + baseName(src); shown = dst.replace(/\/+$/, '') + '/' + baseName(src); d = lookup(target); }
  if (s.n.t === 'd' && norm(target).startsWith(s.path + '/')) return fail(io, cmd, `cannot copy a directory, '${src}', into itself, '${dst}'`);
  if (d.n) {
    if (d.ino === s.ino) return fail(io, cmd, `'${src}' and '${target}' are the same file`);
    if (f.n) return 0;
    if (f.i) { io.out(`${cmd}: overwrite '${target}'? \x1b[2m(simulated: answered "n" — use -f or remove -i to overwrite)\x1b[0m\n`); return 0; }
    if (f.u && d.n.mtime >= s.n.mtime) return 0;
    if (s.n.t === 'd') { // merge into existing dir
      for (const nm of Object.keys(dirOf(s.n).ent)) cpOne(s.path + '/' + nm, target, f, io, cmd);
      return 0;
    }
    if (!can(d.n, 'w')) return fail(io, cmd, `cannot create regular file '${target}': Permission denied`);
    d.n.data = s.n.data; if (s.n.sz != null) d.n.sz = s.n.sz; else delete d.n.sz; d.n.mtime = f.p || f.a ? s.n.mtime : now();
    ev('copy', { src: s.path, dst: norm(target), ino: s.ino, newIno: d.ino, kind: s.n.t, overwrite: true });
  } else {
    const pr = lookup(parentPath(target));
    if (pr.err) return fail(io, cmd, `cannot create regular file '${target}': No such file or directory`);
    if (!can(dirOf(pr.n), 'w')) return fail(io, cmd, `cannot create regular file '${target}': Permission denied`);
    const ino = deepCopy(s.ino, f.p || f.a);
    const pd = dirOf(pr.n); pd.ent[baseName(target)] = ino; if (I(ino).t === 'd') pd.nlink++;
    ev('copy', { src: s.path, dst: norm(target), ino: s.ino, newIno: ino, kind: s.n.t });
  }
  if (f.v) io.out(`'${src}' -> '${shown}'\n`);
  return 0;
}
CMDS.cp = (a, io) => {
  const { f, rest } = go(a, 'rRivpnfuaPdl', '', { recursive: 'r', interactive: 'i', verbose: 'v', preserve: 'p', 'no-clobber': 'n', force: 'f', update: 'u', archive: 'a' });
  if (f._bad) return badOpt(io, 'cp', f._bad);
  if (rest.length < 2) return fail(io, 'cp', rest.length ? `missing destination file operand after '${rest[0]}'` : 'missing file operand');
  const dst = rest.pop(); const d = lookup(dst);
  if (rest.length > 1 && !(d.n && d.n.t === 'd')) return fail(io, 'cp', `target '${dst}' is not a directory`);
  let code = 0; for (const s of rest) code = cpOne(s, dst, f, io, 'cp') || code; return code;
};
const devOf = p => { let best = ''; for (const m of S.mounts) if (m.devRoot && (norm(p) === m.mp || norm(p).startsWith(m.mp + '/')) && m.mp.length > best.length) best = m.mp; return best; };
CMDS.mv = (a, io) => {
  const { f, rest } = go(a, 'ivnfu', '', { interactive: 'i', verbose: 'v', 'no-clobber': 'n', force: 'f', update: 'u' });
  if (f._bad) return badOpt(io, 'mv', f._bad);
  if (rest.length < 2) return fail(io, 'mv', rest.length ? `missing destination file operand after '${rest[0]}'` : 'missing file operand');
  const dst = rest.pop(); const d0 = lookup(dst);
  if (rest.length > 1 && !(d0.n && d0.n.t === 'd')) return fail(io, 'mv', `target '${dst}' is not a directory`);
  let code = 0;
  for (const src of rest) {
    const s = lookup(src, false);
    if (s.err) { code = fail(io, 'mv', `cannot stat '${src}': ${s.err}`); continue; }
    let target = dst, d = d0;
    if (d.n && d.n.t === 'd') { target = norm(dst) + '/' + baseName(src); d = lookup(target, false); }
    if (s.n.t === 'd' && norm(target).startsWith(s.path + '/')) { code = fail(io, 'mv', `cannot move '${src}' to a subdirectory of itself, '${target}'`); continue; }
    if (d.n) {
      if (d.ino === s.ino) { code = fail(io, 'mv', `'${src}' and '${target}' are the same file`); continue; }
      if (f.n) continue;
      if (f.i) { io.out(`mv: overwrite '${target}'? \x1b[2m(simulated: answered "n")\x1b[0m\n`); continue; }
      if (d.n.t === 'd') { if (Object.keys(d.n.ent).length) { code = fail(io, 'mv', `cannot move '${src}' to '${target}': Directory not empty`); continue; } }
      fsUnlink(target);
    }
    const pr = lookup(parentPath(target));
    if (pr.err || pr.n.t !== 'd') { code = fail(io, 'mv', `cannot move '${src}' to '${target}': No such file or directory`); continue; }
    const spd = dirOf(I(s.par)), dpd = dirOf(pr.n);
    if (!can(spd, 'w') || !can(dpd, 'w')) { code = fail(io, 'mv', `cannot move '${src}' to '${target}': Permission denied`); continue; }
    const same = devOf(s.path) === devOf(target);
    if (same) { delete spd.ent[baseName(s.path)]; dpd.ent[baseName(target)] = s.ino; if (s.n.t === 'd') { spd.nlink--; dpd.nlink++; } ev('move', { src: s.path, dst: norm(target), ino: s.ino, newIno: s.ino, kind: s.n.t, samefs: true }); }
    else { const ino = deepCopy(s.ino, true); dpd.ent[baseName(target)] = ino; fsUnlinkTree(s.path); ev('move', { src: s.path, dst: norm(target), ino: s.ino, newIno: ino, kind: s.n.t, samefs: false }); }
    spd.mtime = dpd.mtime = now();
    if (f.v) io.out(`renamed '${src}' -> '${target}'\n`);
  }
  return code;
};
function fsUnlinkTree(p) { const r = lookup(p, false); if (r.n && r.n.t === 'd') for (const nm of Object.keys(r.n.ent)) fsUnlinkTree(r.path + '/' + nm); return fsUnlink(p); }
CMDS.rm = (a, io) => {
  const { f, rest } = go(a, 'rRfivdI', '', { recursive: 'r', force: 'f', interactive: 'i', verbose: 'v', dir: 'd', 'no-preserve-root': 'NPR' });
  if (f._bad) return badOpt(io, 'rm', f._bad);
  if (!rest.length) return f.f ? 0 : fail(io, 'rm', 'missing operand');
  let code = 0;
  for (const p of rest) {
    if (norm(p) === '/' && (f.r || f.R)) { code = fail(io, 'rm', "it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe"); continue; }
    const r = lookup(p, false);
    if (r.err) { if (!f.f) code = fail(io, 'rm', `cannot remove '${p}': ${r.err}`); continue; }
    if (r.n.t === 'd' && !(f.r || f.R || f.d)) { code = fail(io, 'rm', `cannot remove '${p}': Is a directory`); continue; }
    if (r.n.t === 'd' && f.d && !f.r && !f.R && Object.keys(r.n.ent).length) { code = fail(io, 'rm', `cannot remove '${p}': Directory not empty`); continue; }
    if (f.i) { io.out(`rm: remove ${r.n.t === 'd' ? 'directory' : 'regular file'} '${p}'? \x1b[2m(simulated: answered "n" — nothing deleted)\x1b[0m\n`); continue; }
    if (norm(S.cwd).startsWith(r.path + '/') || norm(S.cwd) === r.path) { /* allowed in Linux; cwd becomes a deleted dir */ }
    const doDel = path => {
      const x = lookup(path, false);
      if (x.n.t === 'd') for (const nm of Object.keys(x.n.ent)) { const e = doDel(path.replace(/\/$/, '') + '/' + nm); if (e) return e; }
      const u = fsUnlink(path);
      if (u.err) return `cannot remove '${path}': ${u.err}`;
      if (f.v) io.out(`removed ${x.n.t === 'd' ? 'directory ' : ''}'${path}'\n`);
      return null;
    };
    const e = doDel(p);
    if (e) code = fail(io, 'rm', e); else ev('delete', { path: r.path, kind: r.n.t, ino: r.ino, nlinkLeft: r.n.nlink });
  }
  return code;
};
CMDS.cat = (a, io) => {
  const { f, rest } = go(a, 'nbAEsT', '', { number: 'n', 'number-nonblank': 'b', 'show-all': 'A', squeeze: 's' });
  if (f._bad) return badOpt(io, 'cat', f._bad);
  for (const p of rest) { const r = lookup(p); if (r.n && r.n.t === 'd') { io.err(`cat: ${p}: Is a directory\n`); return 1; } }
  const { text, code } = inputOf(rest, io, 'cat');
  let ls = lines(text);
  if (f.s) ls = ls.filter((l, i) => !(l === '' && ls[i - 1] === ''));
  if (f.A || f.E) ls = ls.map(l => l.replace(/\t/g, f.A ? '^I' : '\t') + '$');
  let k = 0;
  if (f.n || f.b) ls = ls.map(l => (f.b && !l) ? l : `${String(++k).padStart(6)}\t${l}`);
  io.out(joinL(ls) + (text && !text.endsWith('\n') ? '' : '')); return code;
};
CMDS.less = CMDS.more = (a, io) => {
  const files = a.filter(x => !x.startsWith('-'));
  const { text, code } = inputOf(files, io, 'less');
  io.out(text);
  if (io.tty) io.out(`\x1b[7m${files[0] || '(stdin)'} (END)\x1b[0m \x1b[2m— simulated pager: in real less use ↑/↓/Space to scroll, /word to search, q to quit\x1b[0m\n`);
  return code;
};
function headTail(a, io, which) {
  const b = a.map(x => /^-\d+$/.test(x) ? ['-n', x.slice(1)] : [x]).flat();
  const { f, rest } = go(b, 'fqv', 'nc', { lines: 'n', bytes: 'c', follow: 'f' });
  const files = rest.length ? rest : [null];
  let out = '', code = 0;
  files.forEach((p, i) => {
    let text;
    if (p == null) { const r = inputOf([], io, which); text = r.text; }
    else { const r = readFile(p); if (r.err) { code = fail(io, which, `cannot open '${p}' for reading: ${r.err}`); return; } text = r.data; ev('read', { path: p }); }
    if (files.length > 1 && !f.q) out += (i ? '\n' : '') + `==> ${p} <==\n`;
    if (f.c) { const c = parseInt(f.c); out += which === 'head' ? text.slice(0, c) : text.slice(-c); return; }
    const ls = lines(text); const ns = String(f.n ?? '10');
    let sel;
    if (which === 'head') sel = ns.startsWith('-') ? ls.slice(0, ls.length - +ns.slice(1)) : ls.slice(0, +ns);
    else sel = ns.startsWith('+') ? ls.slice(+ns.slice(1) - 1) : ls.slice(Math.max(0, ls.length - +ns));
    out += joinL(sel);
  });
  io.out(out);
  if (f.f && which === 'tail') io.out('\x1b[2m(tail -f keeps waiting for new lines; press Ctrl+C to stop — simulated, so it stops here)\x1b[0m\n');
  return code;
}
CMDS.head = (a, io) => headTail(a, io, 'head');
CMDS.tail = (a, io) => headTail(a, io, 'tail');

/* ---------- permissions ---------- */
function applyMode(spec, cur, isDir) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let m = cur;
  for (const part of spec.split(',')) {
    const mm = /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(part); if (!mm) return null;
    let who = mm[1] || 'a'; if (who.includes('a')) who = 'ugo';
    let bits = 0;
    for (const ch of mm[3]) for (const w of who) {
      const sh = w === 'u' ? 6 : w === 'g' ? 3 : 0;
      if (ch === 'r') bits |= 4 << sh; if (ch === 'w') bits |= 2 << sh;
      if (ch === 'x' || (ch === 'X' && (isDir || cur & 0o111))) bits |= 1 << sh;
      if (ch === 's') { if (w === 'u') bits |= 0o4000; if (w === 'g') bits |= 0o2000; }
      if (ch === 't') bits |= 0o1000;
    }
    if (mm[2] === '+') m |= bits; else if (mm[2] === '-') m &= ~bits;
    else { let mask = 0; for (const w of who) { mask |= 7 << (w === 'u' ? 6 : w === 'g' ? 3 : 0); mask |= w === 'u' ? 0o4000 : w === 'g' ? 0o2000 : 0o1000; } m = (m & ~mask) | bits; }
  }
  return m;
}
CMDS.chmod = (a, io) => {
  const { f, rest } = go(a.map(x => /^-[rwxst]+$/.test(x) ? '\0' + x : x), 'Rvcf', '', { recursive: 'R', verbose: 'v', changes: 'c' });
  const args = rest.map(x => x.replace(/^\0/, ''));
  if (args.length < 2) return fail(io, 'chmod', args.length ? `missing operand after '${args[0]}'` : 'missing operand');
  const spec = args[0]; let code = 0;
  const one = (p) => {
    const r = lookup(p);
    if (r.err) { code = fail(io, 'chmod', `cannot access '${p}': ${r.err}`); return; }
    if (S.uid !== 0 && r.n.uid !== S.uid) { code = fail(io, 'chmod', `changing permissions of '${p}': Operation not permitted`); return; }
    const old = r.n.mode, nm = applyMode(spec, old, r.n.t === 'd');
    if (nm == null) { code = fail(io, 'chmod', `invalid mode: '${spec}'`); return; }
    r.n.mode = nm;
    ev('chmod', { path: r.path, old, mode: nm, spec, kind: r.n.t });
    if (f.v || (f.c && old !== nm)) io.out(`mode of '${p}' ${old === nm ? 'retained as' : 'changed from'} ${(old & 0o7777).toString(8).padStart(4, '0')} (${modeStr(Object.assign({}, r.n, { mode: old })).slice(1)})${old === nm ? '' : ` to ${(nm & 0o7777).toString(8).padStart(4, '0')} (${modeStr(r.n).slice(1)})`}\n`);
    if (f.R && r.n.t === 'd') for (const nm2 of Object.keys(r.n.ent)) one(r.path + '/' + nm2);
  };
  for (const p of args.slice(1)) one(p);
  return code;
};
function chownLike(a, io, cmd) {
  const { f, rest } = go(a, 'Rvch', '', { recursive: 'R', verbose: 'v' });
  if (rest.length < 2) return fail(io, cmd, 'missing operand');
  let [spec, ...paths] = rest; let u = null, g = null;
  if (cmd === 'chgrp') g = spec; else { [u, g] = spec.split(/[:.]/); if (spec.endsWith(':') && u) g = (S.users[u] ? gname(S.users[u].gid) : null); }
  if (u && !S.users[u]) return fail(io, cmd, `invalid user: '${spec}'`);
  if (g && !S.groups[g]) return fail(io, cmd, `invalid group: '${spec}'`);
  let code = 0;
  const one = p => {
    const r = lookup(p);
    if (r.err) { code = fail(io, cmd, `cannot access '${p}': ${r.err}`); return; }
    const okGroupOnly = !u && r.n.uid === S.uid && userGroups(curUser()).includes(g);
    if (S.uid !== 0 && !okGroupOnly) { code = fail(io, cmd, `changing ${u ? 'ownership' : 'group'} of '${p}': Operation not permitted`); return; }
    const old = { u: uname(r.n.uid), g: gname(r.n.gid) };
    if (u) r.n.uid = S.users[u].uid; if (g) r.n.gid = S.groups[g].gid;
    if (u && r.n.t === 'f') r.n.mode &= ~0o6000;
    ev('chown', { path: r.path, old, now: { u: uname(r.n.uid), g: gname(r.n.gid) }, mode: r.n.mode });
    if (f.v) io.out(`ownership of '${p}' changed from ${old.u}:${old.g} to ${uname(r.n.uid)}:${gname(r.n.gid)}\n`);
    if (f.R && r.n.t === 'd') for (const nm of Object.keys(r.n.ent)) one(r.path + '/' + nm);
  };
  paths.forEach(one); return code;
}
CMDS.chown = (a, io) => chownLike(a, io, 'chown');
CMDS.chgrp = (a, io) => chownLike(a, io, 'chgrp');
CMDS.whoami = (a, io) => { io.out(curUser() + '\n'); ev('whoami', { user: curUser(), uid: S.uid }); return 0; };
CMDS.id = (a, io) => {
  const u = a.find(x => !x.startsWith('-')) || curUser(); const x = S.users[u];
  if (!x) return fail(io, 'id', `'${u}': no such user`);
  if (a.includes('-u')) { io.out(x.uid + '\n'); return 0; }
  if (a.includes('-un')) { io.out(u + '\n'); return 0; }
  const gs = userGroups(u).map(g => `${S.groups[g].gid}(${g})`);
  io.out(`uid=${x.uid}(${u}) gid=${x.gid}(${gname(x.gid)}) groups=${gs.join(',')}\n`); return 0;
};
CMDS.groups = (a, io) => {
  const us = a.length ? a : [curUser()]; let code = 0;
  for (const u of us) { if (!S.users[u]) { code = fail(io, 'groups', `'${u}': no such user`); continue; } io.out((a.length ? u + ' : ' : '') + userGroups(u).join(' ') + '\n'); }
  ev('groups', { user: us[0] }); return code;
};
CMDS.sudo = (a, io, rec) => {
  const f = {}; let i = 0;
  while (i < a.length && a[i].startsWith('-')) { if (a[i] === '-u') f.u = a[++i]; else for (const ch of a[i].slice(1)) f[ch] = true; i++; }
  const inner = a.slice(i);
  const me = curUser();
  const allowed = S.uid === 0 || userGroups(me).includes('sudo');
  ev('sudo', { user: me, ok: allowed, target: f.u || 'root', cmd: inner.join(' ') });
  if (!allowed) { io.err(`${me} is not in the sudoers file.  This incident will be reported.\n`); return 1; }
  if (f.l) { io.out(`User ${me} may run the following commands on linux:\n    (ALL : ALL) ALL\n`); return 0; }
  if (f.k) return 0;
  if (f.i || f.s) { S.userStack.push({ uid: S.uid, cwd: S.cwd }); S.uid = 0; if (f.i) S.cwd = '/root'; io.out('\x1b[2m(simulated: you are now root — type exit to go back)\x1b[0m\n'); return 0; }
  if (!inner.length) { io.err('usage: sudo -h | -K | -k | -V\nusage: sudo [-u user] command\n'); return 1; }
  if (!S.sudoCached && S.uid !== 0) { io.err(`[sudo] password for ${me}: \x1b[2m(simulated — accepted; cached for 15 minutes)\x1b[0m\n`); S.sudoCached = true; }
  const save = S.uid; S.uid = f.u ? (S.users[f.u] || { uid: 0 }).uid : 0;
  const sub = {}; let code;
  try { code = execWords(inner, io, sub); } finally { S.uid = save; }
  if (rec) rec.inner = sub;
  return code;
};

/* ---------- text: grep wc sort uniq ---------- */
function mkRe(p, f) {
  let src = f.F ? p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : (f.E ? p : p.replace(/\\([|()+?{}])/g, '\u0000$1').replace(/([|()+?{}])/g, '\\$1').replace(/\u0000\\?([|()+?{}])/g, '$1'));
  if (f.w) src = `\\b(?:${src})\\b`;
  if (f.x) src = `^(?:${src})$`;
  try { return new RegExp(src, f.i ? 'gi' : 'g'); } catch (e) { return null; }
}
CMDS.grep = CMDS.egrep = (a, io, rec) => {
  const { f, rest } = go(a, 'ivncrRlLwEFoHhqsx', 'eABC', { 'ignore-case': 'i', 'invert-match': 'v', 'line-number': 'n', count: 'c', recursive: 'r', 'files-with-matches': 'l', 'word-regexp': 'w', 'extended-regexp': 'E', 'only-matching': 'o', include: 'INC', color: 'COLOR' });
  if (f._bad) return badOpt(io, 'grep', f._bad);
  if (rec && rec.name === 'egrep') f.E = true;
  const pat = f.e ?? rest.shift();
  if (pat == null) return fail(io, 'grep', 'usage: grep [OPTION]... PATTERNS [FILE]...', 2);
  const re = mkRe(pat, f); if (!re) return fail(io, 'grep', 'Invalid regular expression', 2);
  let files = rest; const rec_ = f.r || f.R;
  if (rec_ && !files.length) files = ['.'];
  const list = [];
  for (const p of files) {
    const r = lookup(p);
    if (r.err) { io.err(`grep: ${p}: ${r.err}\n`); continue; }
    if (r.n.t === 'd') {
      if (!rec_) { io.err(`grep: ${p}: Is a directory\n`); continue; }
      const walk = (pp, rr) => { for (const nm of Object.keys(dirOf(rr.n).ent).sort()) { const cp = pp.replace(/\/$/, '') + '/' + nm; const cr = lookup(cp); if (!cr.n) continue; if (cr.n.t === 'd') { if (can(cr.n, 'r')) walk(cp, cr); } else if (!f.INC || globRe(f.INC).test(nm)) list.push(cp); } };
      walk(p === '.' ? '.' : p, r);
    } else list.push(p);
  }
  const multi = list.length > 1 || rec_; let any = false, out = '', err = false;
  const src = files.length ? list.map(p => ({ p, r: readFile(p) })) : [{ p: '(standard input)', r: { data: inputOf([], io, 'grep').text } }];
  for (const { p, r } of src) {
    if (r.err) { if (!f.s) io.err(`grep: ${p}: ${r.err}\n`); err = true; continue; }
    if (files.length) ev('read', { path: p });
    let cnt = 0;
    lines(r.data).forEach((l, i) => {
      re.lastIndex = 0; const hit = re.test(l) !== !!f.v; re.lastIndex = 0;
      if (!hit) return; cnt++; any = true;
      if (f.c || f.l || f.L || f.q) return;
      const pre = (multi && !f.h ? C(io, '35', p) + C(io, '36', ':') : '') + (f.n ? C(io, '32', String(i + 1)) + C(io, '36', ':') : '');
      if (f.o && !f.v) { for (const m of l.matchAll(re)) out += pre + C(io, '1;31', m[0]) + '\n'; }
      else out += pre + (f.v ? l : l.replace(re, m => C(io, '1;31', m))) + '\n';
    });
    if (f.c) out += (multi && !f.h ? C(io, '35', p) + ':' : '') + cnt + '\n';
    if (f.l && cnt) out += C(io, '35', p) + '\n';
    if (f.L && !cnt) out += p + '\n';
  }
  if (!f.q) io.out(out);
  ev('grep', { pattern: pat, flags: f });
  return err && !any ? 2 : any ? 0 : 1;
};
CMDS.wc = (a, io) => {
  const { f, rest } = go(a, 'lwcmL', '', { lines: 'l', words: 'w', bytes: 'c', chars: 'm' });
  if (f._bad) return badOpt(io, 'wc', f._bad);
  const sel = (f.l || f.w || f.c || f.m) ? ['l', 'w', 'c', 'm'].filter(k => f[k]) : ['l', 'w', 'c'];
  const cnt = t => ({ l: (t.match(/\n/g) || []).length, w: t.split(/\s+/).filter(Boolean).length, c: new TextEncoder().encode(t).length, m: t.length });
  const rows = []; let code = 0;
  if (!rest.length) rows.push([cnt(inputOf([], io, 'wc').text), '']);
  for (const p of rest) { const r = readFile(p); if (r.err) { code = fail(io, 'wc', `${p}: ${r.err}`); continue; } ev('read', { path: p }); const c = cnt(r.data); if (r.n && r.n.sz != null) { const k = r.n.sz / Math.max(1, c.c); c.l = Math.round(c.l * k); c.w = Math.round(c.w * k); c.c = Math.round(r.n.sz); } rows.push([c, p]); }
  if (rest.length > 1) { const t = { l: 0, w: 0, c: 0, m: 0 }; rows.forEach(([c]) => { for (const k in t) t[k] += c[k]; }); rows.push([t, 'total']); }
  const w = !rest.length ? 7 : (sel.length === 1 && rows.length === 1 ? 0 : Math.max(...rows.flatMap(([c]) => sel.map(k => String(c[k]).length))));
  io.out(rows.map(([c, p]) => sel.map(k => String(c[k]).padStart(w)).join(' ') + (p ? ' ' + p : '')).join('\n') + '\n');
  return code;
};
CMDS.sort = (a, io) => {
  const { f, rest } = go(a, 'rnufhRbc', 'kto', { reverse: 'r', 'numeric-sort': 'n', unique: 'u', 'ignore-case': 'f', 'human-numeric-sort': 'h', key: 'k', 'field-separator': 't', output: 'o' });
  if (f._bad) return badOpt(io, 'sort', f._bad);
  const { text, code } = inputOf(rest, io, 'sort');
  let ls = lines(text);
  const key = l => { if (!f.k) return l; const k = parseInt(f.k); const parts = f.t ? l.split(f.t) : l.trim().split(/\s+/); return f.k.includes(',') ? (parts[k - 1] ?? '') : parts.slice(k - 1).join(f.t || ' '); };
  const hnum = s => { const m = /^([\d.]+)\s*([KMGT]?)/i.exec(s.trim()); return m ? parseFloat(m[1]) * Math.pow(1024, 'KMGT'.indexOf((m[2] || '').toUpperCase()) + 1) : 0; };
  const cmp = (x, y) => {
    const kx = key(x), ky = key(y);
    if (f.n) return (parseFloat(kx) || 0) - (parseFloat(ky) || 0) || x.localeCompare(y);
    if (f.h) return hnum(kx) - hnum(ky);
    return f.f ? kx.toLowerCase().localeCompare(ky.toLowerCase()) : (kx < ky ? -1 : kx > ky ? 1 : 0);
  };
  ls.sort(cmp); if (f.r) ls.reverse();
  if (f.u) ls = ls.filter((l, i) => i === 0 || cmp(l, ls[i - 1]) !== 0);
  if (f.o) { writeFile(f.o, joinL(ls)); return code; }
  io.out(joinL(ls)); return code;
};
CMDS.uniq = (a, io) => {
  const { f, rest } = go(a, 'cdui', '', { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' });
  const { text, code } = inputOf(rest.slice(0, 1), io, 'uniq');
  const groups = [];
  for (const l of lines(text)) { const g = groups[groups.length - 1]; if (g && (f.i ? g[0].toLowerCase() === l.toLowerCase() : g[0] === l)) g[1]++; else groups.push([l, 1]); }
  let sel = groups; if (f.d) sel = sel.filter(g => g[1] > 1); if (f.u) sel = sel.filter(g => g[1] === 1);
  const out = joinL(sel.map(([l, n]) => f.c ? `${String(n).padStart(7)} ${l}` : l));
  if (rest[1]) writeFile(rest[1], out); else io.out(out);
  return code;
};
