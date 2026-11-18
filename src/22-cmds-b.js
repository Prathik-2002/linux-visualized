/* ================= COMMANDS (part B) ================= */
const SIGS = { 1: 'HUP', 2: 'INT', 3: 'QUIT', 6: 'ABRT', 9: 'KILL', 10: 'USR1', 12: 'USR2', 13: 'PIPE', 14: 'ALRM', 15: 'TERM', 17: 'CHLD', 18: 'CONT', 19: 'STOP', 20: 'TSTP' };
const SIGNUM = Object.fromEntries(Object.entries(SIGS).map(([k, v]) => [v, +k]));
const procBy = pid => S.procs.find(p => p.pid === pid);
function spawnProc(cmd, extra) {
  const pid = S.nextPid++;
  const p = Object.assign({ pid, ppid: 1200, uid: S.uid, cmd, comm: cmd.split(' ')[0].split('/').pop(), st: 'S', cpu: 0.0, mem: 0.1, ni: 0, tty: 'pts/0', start: '09:34' }, extra || {});
  S.procs.push(p); return p;
}
function endProc(p, how) {
  S.procs = S.procs.filter(x => x !== p);
  S.procs.forEach(c => { if (c.ppid === p.pid) c.ppid = 1; }); // orphans are adopted by PID 1
  const j = S.jobs.find(j => j.pid === p.pid);
  if (j) { S.jobs = S.jobs.filter(x => x !== j); return `[${j.n}]+  ${how.padEnd(22)}${j.cmd}\n`; }
  return '';
}
function sendSignal(p, sig, io) {
  const name = SIGS[sig] || String(sig);
  if (S.uid !== 0 && p.uid !== S.uid) { io.err(`bash: kill: (${p.pid}) - Operation not permitted\n`); ev('signal', { pid: p.pid, name: p.comm, sig: name, result: 'denied' }); return 1; }
  if (p.pid === 1) { ev('signal', { pid: 1, name: 'systemd', sig: name, result: 'ignored' }); if (S.uid !== 0) { io.err('bash: kill: (1) - Operation not permitted\n'); return 1; } return 0; }
  if (p.pid === 1200) { io.out(`\x1b[33m(simulated: SIG${name} to your own shell would close this terminal — skipped)\x1b[0m\n`); return 0; }
  let result;
  if (name === 'STOP' || name === 'TSTP') { p.st = 'T'; const j = S.jobs.find(j => j.pid === p.pid); if (j) { j.st = 'Stopped'; io.out(`[${j.n}]+  Stopped                 ${j.cmd}\n`); } result = 'stop'; }
  else if (name === 'CONT') { p.st = 'S'; const j = S.jobs.find(j => j.pid === p.pid); if (j) j.st = 'Running'; result = 'cont'; }
  else if (name === 'KILL') { io.out(endProc(p, 'Killed')); result = 'kill'; }
  else if (['TERM', 'INT', 'HUP', 'QUIT'].includes(name)) {
    if ((p.ignTERM && name === 'TERM') || (p.hup && name === 'HUP')) result = 'ignored';
    else { io.out(endProc(p, name === 'INT' ? 'Interrupt' : name === 'HUP' ? 'Hangup' : 'Terminated')); result = 'term'; }
  } else result = 'handled';
  ev('signal', { pid: p.pid, name: p.comm, sig: name, result });
  return 0;
}
function parseSig(a) {
  let sig = 15, i = 0;
  if (a[0] === '-s' || a[0] === '-n') { sig = SIGNUM[a[1].replace(/^SIG/, '').toUpperCase()] ?? +a[1]; i = 2; }
  else if (a[0] && /^-/.test(a[0]) && a[0] !== '-l' && a[0] !== '-L') { const s = a[0].slice(1).replace(/^SIG/i, '').toUpperCase(); sig = /^\d+$/.test(s) ? +s : SIGNUM[s]; i = 1; }
  return { sig, rest: a.slice(i) };
}
CMDS.kill = (a, io) => {
  if (!a.length) return fail(io, 'kill', 'usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', 2);
  if (a[0] === '-l' || a[0] === '-L') { io.out(Object.entries(SIGS).map(([n, s]) => `${String(n).padStart(2)}) SIG${s}`).join('\n') + '\n'); ev('siglist'); return 0; }
  const { sig, rest } = parseSig(a);
  if (sig == null) return fail(io, 'bash: kill', `${a[0].slice(1)}: invalid signal specification`);
  let code = 0;
  for (const t of rest) {
    let pid;
    if (t.startsWith('%')) { const j = S.jobs.find(j => j.n === +t.slice(1) || (t === '%+' || t === '%%')); if (!j) { code = fail(io, 'bash: kill', `${t}: no such job`); continue; } pid = j.pid; }
    else pid = +t;
    const p = procBy(pid);
    if (!p) { code = fail(io, 'bash: kill', `(${t}) - No such process`); continue; }
    code = sendSignal(p, sig, io) || code;
  }
  return code;
};
CMDS.pkill = CMDS.killall = (a, io, rec) => {
  const { sig, rest } = parseSig(a);
  const name = rest[0]; if (!name) return fail(io, rec.name, 'no process name specified', 2);
  const ms = S.procs.filter(p => p.pid !== 1200 && (rec.name === 'killall' ? p.comm === name : (p.comm.includes(name) || (a.includes('-f') && p.cmd.includes(name)))));
  if (!ms.length) { if (rec.name === 'killall') io.err(`${name}: no process found\n`); return 1; }
  let code = 0; for (const p of ms) code = sendSignal(p, sig, io) || code; return code;
};
CMDS.ps = (a, io, rec) => {
  const s = a.join(' ');
  const me = spawnProc('ps ' + s, { comm: 'ps', st: 'R', pid: rec.pid || S.nextPid });
  let out = '', list = S.procs;
  const tcpu = p => `00:00:${String(Math.floor(p.cpu * 1.7) % 60).padStart(2, '0')}`;
  const fields = (/-[eA]?o\s*(\S+)/.exec(s) || [])[1];
  if (fields) {
    const F = fields.split(','); const H = { pid: 'PID', ppid: 'PPID', user: 'USER', ni: 'NI', stat: 'STAT', comm: 'COMMAND', cmd: 'CMD', args: 'COMMAND', '%cpu': '%CPU', '%mem': '%MEM', pri: 'PRI' };
    const val = (p, f) => ({ pid: p.pid, ppid: p.ppid, user: uname(p.uid), ni: p.ni, stat: p.st, comm: p.comm, cmd: p.cmd, args: p.cmd, '%cpu': p.cpu.toFixed(1), '%mem': p.mem.toFixed(1), pri: 20 + p.ni }[f] ?? '?');
    out = F.map(f => (H[f] || f.toUpperCase()).padStart(f === 'comm' || f === 'cmd' || f === 'user' ? 0 : 5)).join(' ') + '\n' + list.map(p => F.map(f => String(val(p, f)).padStart(f === 'comm' || f === 'cmd' || f === 'user' ? 0 : 5)).join(' ')).join('\n') + '\n';
  } else if (/aux|-aux|ax/.test(s)) {
    out = 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' + list.map(p => `${uname(p.uid).padEnd(8).slice(0, 8)} ${String(p.pid).padStart(7)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(Math.round(p.mem * 9000 + 7000)).padStart(6)} ${String(Math.round(p.mem * 1600 + 900)).padStart(5)} ${p.tty.padEnd(8)} ${(p.st + (p.ni < 0 ? '<' : p.ni > 0 ? 'N' : '') + (p.pid === 1200 ? 's' : '')).padEnd(4)} ${p.start}   ${tcpu(p).slice(3)} ${p.cmd}`).join('\n') + '\n';
  } else if (/-e|-A/.test(s)) {
    const full = /f/.test(s);
    out = (full ? 'UID          PID    PPID  C STIME TTY          TIME CMD\n' : '    PID TTY          TIME CMD\n') + list.map(p => full ? `${uname(p.uid).padEnd(8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)}  ${Math.round(p.cpu) % 10} ${p.start} ${p.tty.padEnd(8)} ${tcpu(p)} ${p.cmd}` : `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${tcpu(p)} ${p.comm}`).join('\n') + '\n';
  } else {
    list = list.filter(p => p.tty === 'pts/0' && (p.ppid === 1200 || p.pid === 1200 || p.job));
    out = '    PID TTY          TIME CMD\n' + list.map(p => `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${tcpu(p)} ${p.comm}`).join('\n') + '\n';
  }
  ev('ps', { pids: list.map(p => p.pid) });
  S.procs = S.procs.filter(p => p !== me);
  io.out(out); return 0;
};
CMDS.top = CMDS.htop = (a, io, rec) => {
  const ps = S.procs.slice().sort((x, y) => y.cpu - x.cpu);
  const run = ps.filter(p => p.st === 'R').length;
  io.out(`top - 09:34:12 up  4:15,  1 user,  load average: 0.42, 0.37, 0.31\nTasks: ${ps.length + 400} total,   ${run} running, ${ps.length + 399 - run} sleeping,   ${ps.filter(p => p.st === 'T').length} stopped,   0 zombie\n%Cpu(s): 41.2 us,  2.1 sy,  0.0 ni, 55.9 id,  0.3 wa,  0.0 hi,  0.5 si,  0.0 st\nMiB Mem :   7853.0 total,   3047.3 free,   2421.6 used,   2384.1 buff/cache\nMiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   5430.0 avail Mem\n\n${C(io, '7', '    PID USER      PR  NI    VIRT    RES  S  %CPU  %MEM     TIME+ COMMAND')}\n` +
    ps.map(p => `${String(p.pid).padStart(7)} ${uname(p.uid).padEnd(8).slice(0, 8)}  ${String(20 + p.ni).padStart(2)} ${String(p.ni).padStart(3)} ${String(Math.round(p.mem * 9000 + 7000)).padStart(7)} ${String(Math.round(p.mem * 1600 + 900)).padStart(6)}  ${p.st}  ${p.cpu.toFixed(1).padStart(4)}  ${p.mem.toFixed(1).padStart(4)}   0:0${Math.floor(p.cpu / 10)}.${String(Math.round(p.cpu * 7) % 100).padStart(2, '0')} ${p.comm}`).join('\n') + '\n' +
    (io.tty ? '\x1b[2m(snapshot — real top refreshes every 3 s; keys: q quit, k kill, r renice, M sort by memory, P by CPU)\x1b[0m\n' : ''));
  ev('ps', { pids: ps.map(p => p.pid), top: true }); return 0;
};
CMDS.jobs = (a, io) => {
  const l = a.includes('-l') || a.includes('-p');
  io.out(S.jobs.map((j, i) => a.includes('-p') ? j.pid : `[${j.n}]${i === S.jobs.length - 1 ? '+' : i === S.jobs.length - 2 ? '-' : ' '}  ${l ? j.pid + ' ' : ''}${j.st.padEnd(24)}${j.cmd}${j.st === 'Running' ? ' &' : ''}`).join('\n') + (S.jobs.length ? '\n' : ''));
  ev('jobs', { pids: S.jobs.map(j => j.pid) }); return 0;
};
function pickJob(a, io, b) {
  const t = a[0]; const j = t ? S.jobs.find(j => j.n === +String(t).replace('%', '')) : S.jobs[S.jobs.length - 1];
  if (!j) { io.err(`bash: ${b}: ${t || 'current'}: no such job\n`); return null; }
  return j;
}
CMDS.bg = (a, io) => {
  const j = pickJob(a, io, 'bg'); if (!j) return 1;
  if (j.st === 'Running') { io.err(`bash: bg: job ${j.n} already in background\n`); return 0; }
  j.st = 'Running'; const p = procBy(j.pid); if (p) p.st = 'S';
  io.out(`[${j.n}]+ ${j.cmd} &\n`); ev('bg', { pid: j.pid, name: p && p.comm }); return 0;
};
CMDS.fg = (a, io) => {
  const j = pickJob(a, io, 'fg'); if (!j) return 1;
  const p = procBy(j.pid); io.out(j.cmd + '\n');
  ev('fg', { pid: j.pid, name: p && p.comm });
  if (p) { p.st = 'S'; S.jobs = S.jobs.filter(x => x !== j); S.fg = { pid: p.pid, cmd: j.cmd, until: Date.now() + 8000 }; }
  return 0;
};
CMDS.sleep = (a, io, rec) => {
  const n = parseFloat(a[0]); if (isNaN(n)) return fail(io, 'sleep', 'missing operand');
  if (io.bg) { spawnProc('sleep ' + a[0], { job: io.bg, pid: rec.pid || S.nextPid++ }); return 0; }
  if (CTX && DEPTH === 0 && io.tty !== undefined && n >= 2 && !SH.sd) { const p = spawnProc('sleep ' + a[0], { pid: rec.pid || S.nextPid++ }); S.fg = { pid: p.pid, cmd: 'sleep ' + a[0], until: Date.now() + Math.min(n, 30) * 1000 }; }
  return 0;
};
CMDS.python3 = CMDS.python = (a, io, rec) => {
  if (!a.length || a[0] === '--version' || a[0] === '-V') { io.out('Python 3.12.3\n'); return 0; }
  if (io.bg) { spawnProc('python3 ' + a.join(' '), { job: io.bg, pid: rec.pid || S.nextPid++, comm: 'python3', cpu: 1.5, mem: 2 }); return 0; }
  io.out(`\x1b[2m(simulated: python3 would run ${a[0]} here)\x1b[0m\n`); return 0;
};
CMDS.yes = (a, io) => { io.out(Array(6).fill(a.join(' ') || 'y').join('\n') + '\n' + (io.tty ? '\x1b[2m(yes prints forever until killed — simulator stops after 6 lines)\x1b[0m\n' : '')); return 0; };
CMDS.nohup = (a, io, rec) => {
  if (!a.length) return fail(io, 'nohup', 'missing operand', 125);
  const before = S.procs.length;
  let out = '';
  io.err("nohup: ignoring input and appending output to 'nohup.out'\n");
  const code = execWords(a, Object.assign({}, io, { out: s => out += s, tty: false }), {});
  writeFile('nohup.out', strip(out), true);
  S.procs.slice(before).forEach(p => { p.hup = true; p.cmd = a.join(' '); });
  ev('nohup', { cmd: a.join(' ') });
  return code;
};
CMDS.wait = () => { S.procs = S.procs.filter(p => !p.job || p.st === 'T'); S.jobs = S.jobs.filter(j => j.st === 'Stopped'); return 0; };

/* ---------- search ---------- */
CMDS.find = (a, io) => {
  let i = 0; const roots = [];
  while (i < a.length && !/^[-(!]/.test(a[i])) roots.push(a[i++]);
  if (!roots.length) roots.push('.');
  const groups = [[]]; let maxd = Infinity, mind = 0, act = null, neg = false;
  for (; i < a.length; i++) {
    const t = a[i], v = a[i + 1];
    const add = fn => { groups[groups.length - 1].push(neg ? (...x) => !fn(...x) : fn); neg = false; };
    if (t === '!' || t === '-not') { neg = true; continue; }
    if (t === '-o' || t === '-or') { groups.push([]); continue; }
    if (t === '-a' || t === '-and' || t === '(' || t === ')') continue;
    if (t === '-name' || t === '-iname') { const re = globRe(v); const re2 = new RegExp(re.source, t === '-iname' ? 'i' : ''); add((p, n) => re2.test(baseName(p))); i++; continue; }
    if (t === '-path') { const re = new RegExp('^' + v.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); add(p => re.test(p)); i++; continue; }
    if (t === '-type') { const m = { f: 'f', d: 'd', l: 'l' }[v]; add((p, n) => n.t === m); i++; continue; }
    if (t === '-size') { const m = /^([+-]?)(\d+)([ckMGb]?)$/.exec(v); if (!m) return fail(io, 'find', `invalid argument \`${v}' to \`-size'`); const u = { c: 1, k: 1024, M: MB, G: 1024 * MB, b: 512, '': 512 }[m[3]]; const N = +m[2]; add((p, n) => { if (n.t === 'd') return false; const s = Math.ceil(fsize(n) / u); return m[1] === '+' ? s > N : m[1] === '-' ? s < N : s === N; }); i++; continue; }
    if (t === '-mtime' || t === '-mmin') { const m = /^([+-]?)(\d+)$/.exec(v); const unit = t === '-mtime' ? 864e5 : 6e4; add((p, n) => { const d = Math.floor((S.clock - n.mtime) / unit); return m[1] === '+' ? d > +m[2] : m[1] === '-' ? d < +m[2] : d === +m[2]; }); i++; continue; }
    if (t === '-user') { add((p, n) => uname(n.uid) === v); i++; continue; }
    if (t === '-group') { add((p, n) => gname(n.gid) === v); i++; continue; }
    if (t === '-perm') { const m = /^([-/]?)(\d+)$/.exec(v) || []; const want = parseInt(m[2], 8); add((p, n) => m[1] === '-' ? (n.mode & want) === want : m[1] === '/' ? !!(n.mode & want) : (n.mode & 0o7777) === want); i++; continue; }
    if (t === '-empty') { add((p, n) => n.t === 'd' ? !Object.keys(n.ent).length : fsize(n) === 0); continue; }
    if (t === '-newer') { const r = lookup(v); add((p, n) => r.n && n.mtime > r.n.mtime); i++; continue; }
    if (t === '-maxdepth') { maxd = +v; i++; continue; }
    if (t === '-mindepth') { mind = +v; i++; continue; }
    if (t === '-print') continue;
    if (t === '-delete') { act = { k: 'delete' }; continue; }
    if (t === '-ls') { act = { k: 'ls' }; continue; }
    if (t === '-exec' || t === '-ok') { const end = a.findIndex((x, k) => k > i && (x === ';' || x === '+')); if (end < 0) return fail(io, 'find', "missing argument to `-exec'"); act = { k: 'exec', cmd: a.slice(i + 1, end), batch: a[end] === '+' }; i = end; continue; }
    return fail(io, 'find', `unknown predicate \`${t}'`);
  }
  const hits = []; let code = 0;
  const test = (p, n) => groups.some(g => g.every(fn => fn(p, n)));
  const walk = (p, r, d) => {
    if (d >= mind && test(p, r.n)) hits.push([p, r]);
    if (r.n.t === 'd' && d < maxd && p !== '/proc' && !p.startsWith('/proc/')) {
      if (!can(r.n, 'r') || !can(r.n, 'x')) { io.err(`find: '${p}': Permission denied\n`); code = 1; return; }
      for (const nm of Object.keys(dirOf(r.n).ent).sort()) { const cp = (p === '/' ? '' : p.replace(/\/$/, '')) + '/' + nm; const cr = lookup(cp, false); if (cr.n) walk(cp, cr, d + 1); }
    }
  };
  for (const r0 of roots) { const r = lookup(r0); if (r.err) { code = fail(io, 'find', `'${r0}': ${r.err}`); continue; } walk(r0, r, 0); }
  ev('find', { hits: hits.map(h => h[1].path) });
  if (!act) io.out(joinL(hits.map(h => h[0])));
  else if (act.k === 'ls') io.out(joinL(hits.map(([p, r]) => `${String(r.ino).padStart(7)} ${modeStr(r.n)} ${r.n.nlink} ${uname(r.n.uid)} ${gname(r.n.gid)} ${String(fsize(r.n)).padStart(8)} ${fdate(r.n.mtime)} ${p}`)));
  else if (act.k === 'delete') { for (const [p] of hits.slice().reverse()) { const u = fsUnlink(p); if (u.err) code = fail(io, 'find', `cannot delete '${p}': ${u.err}`); else ev('delete', { path: norm(p) }); } }
  else if (act.k === 'exec') {
    const runOne = files => { const w = []; for (const x of act.cmd) { if (x === '{}') w.push(...files); else w.push(x.replace('{}', files[0])); } return execWords(w, io, {}); };
    if (act.batch) { if (hits.length) code = runOne(hits.map(h => h[0])) || code; }
    else for (const [p] of hits) code = runOne([p]) || code;
  }
  return code;
};
CMDS.locate = (a, io) => {
  const { f, rest } = go(a, 'icbA', 'nl');
  if (!rest.length) return fail(io, 'locate', 'no pattern to search for specified');
  const pat = rest[0]; const re = /[*?]/.test(pat) ? new RegExp(globRe(pat).source.slice(1, -1) + '$', f.i ? 'i' : '') : null;
  let hits = S.locateDb.filter(p => re ? re.test(p) : (f.i ? p.toLowerCase().includes(pat.toLowerCase()) : (f.b ? baseName(p).includes(pat) : p.includes(pat))));
  if (f.n || f.l) hits = hits.slice(0, +(f.n || f.l));
  ev('locate', { hits });
  io.out(f.c ? hits.length + '\n' : joinL(hits)); return hits.length ? 0 : 1;
};
CMDS.updatedb = (a, io) => { if (S.uid !== 0) return fail(io, 'updatedb', "can not open a temporary file for `/var/lib/plocate/plocate.db'"); S.locateDb = allPaths(); ev('updatedb'); return 0; };
CMDS.which = (a, io) => {
  const all = a.includes('-a'); let code = 0;
  for (const n of a.filter(x => x !== '-a')) {
    const hits = (S.env.PATH || '').split(':').map(d => d + '/' + n).filter(p => { const r = lookup(p); return r.n && r.n.t === 'f' && (r.n.mode & 0o111); });
    if (!hits.length) code = 1; else io.out(joinL(all ? hits : [hits[0]]));
    ev('which', { name: n, path: hits[0] });
  }
  return code;
};
CMDS.type = (a, io) => {
  const t = a.includes('-t'); let code = 0;
  for (const n of a.filter(x => !x.startsWith('-'))) {
    if (S.aliases[n]) io.out(t ? 'alias\n' : `${n} is aliased to \`${S.aliases[n]}'\n`);
    else if (['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function'].includes(n)) io.out(t ? 'keyword\n' : `${n} is a shell keyword\n`);
    else if (S.funcs[n]) io.out(t ? 'function\n' : `${n} is a function\n`);
    else if (BUILTINS.has(n)) io.out(t ? 'builtin\n' : `${n} is a shell builtin\n`);
    else { const p = findInPath(n); if (p) io.out(t ? 'file\n' : `${n} is ${p}\n`); else { code = fail(io, 'bash: type', `${n}: not found`); } }
  }
  return code;
};

/* ---------- archives ---------- */
function collect(p, out, base) {
  const r = lookup(p, false); if (r.err) return r.err;
  const rel = base ?? p.replace(/\/$/, '');
  out.push({ p: rel + (r.n.t === 'd' ? '/' : ''), t: r.n.t, data: r.n.data, sz: r.n.sz, mode: r.n.mode, tgt: r.n.tgt, mtime: r.n.mtime });
  if (r.n.t === 'd') for (const nm of Object.keys(r.n.ent).sort()) collect(r.path + '/' + nm, out, rel + '/' + nm);
  return null;
}
const pack = (kind, obj) => kind + '\0' + JSON.stringify(obj);
const unpack = (kind, s) => { if (!s || !s.startsWith(kind + '\0')) return null; try { return JSON.parse(s.slice(kind.length + 1)); } catch (e) { return null; } };
const ratio = (name, data) => /\.(jpg|jpeg|png|mp3|mp4|gz|zip)$/i.test(name) || (data || '').startsWith('JPEG') ? 0.98 : 0.32;
function extractEntries(entries, dest, io, verbose, prefixMsg) {
  for (const e of entries) {
    const path = norm(e.p.replace(/\/$/, ''), dest);
    if (e.t === 'd') { const parts = path.split('/').filter(Boolean); let acc = ''; for (const c of parts) { acc += '/' + c; if (!lookup(acc).n) fsCreate(acc, 'd'); } }
    else { const pp = parentPath(path); if (!lookup(pp).n) { const parts = pp.split('/').filter(Boolean); let acc = ''; for (const c of parts) { acc += '/' + c; if (!lookup(acc).n) fsCreate(acc, 'd'); } } const w = writeFile(path, e.data || ''); if (w.err) { io.err(`${path}: ${w.err}\n`); continue; } if (e.sz != null) w.n.sz = e.sz; w.n.mode = e.mode & 0o777; }
    ev('create', { path, kind: e.t });
    if (verbose) io.out((prefixMsg ? prefixMsg + (e.t === 'd' ? '  creating: ' : ' inflating: ') : '') + e.p + '\n');
  }
}
CMDS.tar = (a, io) => {
  if (a[0] && !a[0].startsWith('-')) a = ['-' + a[0], ...a.slice(1)];
  const { f, rest } = go(a, 'cxtzjvJkpr', 'fC', { create: 'c', extract: 'x', list: 't', gzip: 'z', verbose: 'v', file: 'f', directory: 'C' });
  if (f._bad) return badOpt(io, 'tar', f._bad);
  if (!f.c && !f.x && !f.t) return fail(io, 'tar', "You must specify one of the '-Acdtrux', '--delete' or '--test-label' options", 2);
  if (!f.f) return fail(io, 'tar', 'Refusing to read/write archive contents from/to terminal (missing -f option?)', 2);
  if (f.c) {
    if (!rest.length) return fail(io, 'tar', 'Cowardly refusing to create an empty archive', 2);
    const entries = []; let code = 0;
    for (const p of rest) { const e = collect(p, entries); if (e) { io.err(`tar: ${p}: Cannot stat: ${e}\n`); code = 2; } }
    if (f.v) io.out(joinL(entries.map(e => e.p)));
    let size = entries.reduce((s, e) => s + 512 + (e.t === 'f' ? Math.ceil(fsize(e) / 512) * 512 : 0), 1024);
    if (f.z || f.j || f.J) size = Math.round(size * entries.reduce((m, e) => Math.max(m, ratio(e.p, e.data)), 0.3));
    const w = writeFile(f.f, pack('TAR', { z: !!(f.z || f.j || f.J), entries }));
    if (w.err) return fail(io, 'tar', `${f.f}: Cannot open: ${w.err}`, 2);
    w.n.sz = size;
    ev('archive', { mode: 'create', out: f.f, files: entries.map(e => e.p), z: !!f.z, tool: 'tar' });
    if (code) io.err('tar: Exiting with failure status due to previous errors\n');
    return code;
  }
  const r = readFile(f.f); if (r.err) return fail(io, 'tar', `${f.f}: Cannot open: ${r.err}`, 2);
  const ar = unpack('TAR', r.data); if (!ar) return fail(io, 'tar', 'This does not look like a tar archive', 2);
  if (f.t) { io.out(joinL(ar.entries.map(e => f.v ? `${modeStr({ t: e.t === 'd' ? 'd' : 'f', mode: e.mode })} user/user ${String(e.t === 'f' ? fsize(e) : 0).padStart(7)} 2026-11-18 09:30 ${e.p}` : e.p))); ev('archive', { mode: 'list', out: f.f, files: ar.entries.map(e => e.p), tool: 'tar' }); return 0; }
  const dest = f.C ? norm(f.C) : S.cwd;
  if (f.C && !lookup(dest).n) return fail(io, 'tar', `${f.C}: Cannot open: No such file or directory`, 2);
  extractEntries(ar.entries, dest, io, f.v);
  ev('archive', { mode: 'extract', out: f.f, files: ar.entries.map(e => e.p), z: ar.z, tool: 'tar' });
  return 0;
};
CMDS.gzip = CMDS.gunzip = (a, io, rec) => {
  const { f, rest } = go(a, 'dkvlrfc19', '', { decompress: 'd', keep: 'k', verbose: 'v', list: 'l', stdout: 'c' });
  const dec = f.d || rec.name === 'gunzip'; let code = 0;
  if (!rest.length) return fail(io, rec.name, 'compressed data not written to a terminal. Use -f to force compression.');
  for (const p of rest) {
    const r = lookup(p);
    if (r.err) { code = fail(io, 'gzip', `${p}: ${r.err}`); continue; }
    if (r.n.t === 'd') { code = fail(io, 'gzip', `${p} is a directory -- ignored`, 2); continue; }
    if (f.l) { const g = unpack('GZ', r.n.data); if (!g) { code = fail(io, 'gzip', `${p}: not in gzip format`); continue; } io.out(`         compressed        uncompressed  ratio uncompressed_name\n${String(fsize(r.n)).padStart(19)} ${String(g.sz ?? (g.data || '').length).padStart(19)}  ${(100 - fsize(r.n) / Math.max(1, g.sz ?? g.data.length) * 100).toFixed(1)}% ${p.replace(/\.gz$/, '')}\n`); continue; }
    if (dec) {
      if (!p.endsWith('.gz') && !p.endsWith('.tgz')) { code = fail(io, 'gzip', `${p}: unknown suffix -- ignored`, 2); continue; }
      const g = unpack('GZ', r.n.data); if (!g) { code = fail(io, 'gzip', `${p}: not in gzip format`); continue; }
      const out = p.replace(/\.gz$/, '').replace(/\.tgz$/, '.tar');
      if (lookup(out).n && !f.f) { code = fail(io, 'gzip', `${out} already exists; not overwritten`, 2); continue; }
      const w = writeFile(out, g.data); if (g.sz != null) w.n.sz = g.sz; w.n.mode = g.mode;
      if (!f.k) fsUnlink(p);
      ev('archive', { mode: 'gunzip', out, from: p, before: fsize(r.n), after: fsize(w.n), tool: 'gzip' });
      if (f.v) io.out(`${p}:\t ${(100 - fsize(r.n) / fsize(w.n) * 100).toFixed(1)}% -- replaced with ${out}\n`);
    } else {
      if (p.endsWith('.gz')) { code = fail(io, 'gzip', `${p} already has .gz suffix -- unchanged`, 2); continue; }
      const before = fsize(r.n), after = Math.max(30, Math.round(before * ratio(p, r.n.data)));
      if (f.c) { io.out(`\x1b[2m(binary gzip data, ${after} bytes)\x1b[0m\n`); continue; }
      const w = writeFile(p + '.gz', pack('GZ', { data: r.n.data, sz: r.n.sz, mode: r.n.mode }));
      if (w.err) { code = fail(io, 'gzip', `${p}.gz: ${w.err}`); continue; }
      w.n.sz = after; w.n.mode = r.n.mode; w.n.mtime = r.n.mtime;
      if (!f.k) fsUnlink(p);
      ev('archive', { mode: 'gzip', out: p + '.gz', from: p, before, after, tool: 'gzip' });
      if (f.v) io.out(`${p}:\t ${(100 - after / before * 100).toFixed(1)}% -- ${f.k ? 'created' : 'replaced with'} ${p}.gz\n`);
    }
  }
  return code;
};
CMDS.zip = (a, io) => {
  const { f, rest } = go(a, 'rqv9');
  if (rest.length < 2) return fail(io, 'zip', 'error: Nothing to do!', 12);
  let out = rest.shift(); if (!out.endsWith('.zip')) out += '.zip';
  const entries = [];
  for (const p of rest) {
    const r = lookup(p, false);
    if (r.err) { io.err(`\tzip warning: name not matched: ${p}\n`); continue; }
    if (r.n.t === 'd' && !f.r) entries.push({ p: p.replace(/\/$/, '') + '/', t: 'd', mode: r.n.mode });
    else collect(p, entries);
  }
  if (!entries.length) return fail(io, 'zip', 'error: Nothing to do!', 12);
  if (!f.q) io.out(joinL(entries.map(e => `  adding: ${e.p} (${e.t === 'd' ? 'stored 0%' : `deflated ${Math.round((1 - ratio(e.p, e.data)) * 100)}%`})`)));
  const w = writeFile(out, pack('ZIP', { entries })); if (w.err) return fail(io, 'zip', w.err, 15);
  w.n.sz = entries.reduce((s, e) => s + 120 + (e.t === 'f' ? Math.round(fsize(e) * ratio(e.p, e.data)) : 0), 22);
  ev('archive', { mode: 'create', out, files: entries.map(e => e.p), z: true, tool: 'zip' });
  if (entries.length === 1 && entries[0].t === 'd') io.err('\x1b[33mHint: only the empty folder was added. Use zip -r to include its contents.\x1b[0m\n');
  return 0;
};
CMDS.unzip = (a, io) => {
  const { f, rest } = go(a, 'loqn', 'd');
  const p = rest[0]; if (!p) return fail(io, 'unzip', 'missing archive name');
  const r = readFile(p); if (r.err) return fail(io, 'unzip', `cannot find or open ${p}, ${p}.zip or ${p}.ZIP.`, 9);
  const z = unpack('ZIP', r.data); if (!z) return fail(io, 'unzip', `${p}: End-of-central-directory signature not found.`, 9);
  if (f.l) { io.out(`Archive:  ${p}\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n` + z.entries.map(e => `${String(e.t === 'f' ? fsize(e) : 0).padStart(9)}  2026-11-18 09:30   ${e.p}`).join('\n') + `\n---------                     -------\n${String(z.entries.reduce((s, e) => s + (e.t === 'f' ? fsize(e) : 0), 0)).padStart(9)}                     ${z.entries.length} files\n`); ev('archive', { mode: 'list', out: p, files: z.entries.map(e => e.p), tool: 'zip' }); return 0; }
  const dest = f.d ? norm(f.d) : S.cwd;
  if (f.d && !lookup(dest).n) fsCreate(dest, 'd');
  io.out(`Archive:  ${p}\n`);
  extractEntries(z.entries, dest, io, !f.q, ' ');
  ev('archive', { mode: 'extract', out: p, files: z.entries.map(e => e.p), tool: 'zip' });
  return 0;
};

/* ---------- disk & system ---------- */
CMDS.df = (a, io) => {
  const { f, rest } = go(a, 'hTiak');
  const rows = [['/dev/sda1', 'ext4', 51475068, 21896432, '/'], ['tmpfs', 'tmpfs', 804152, 1964, '/run'], ['/dev/sda2', 'ext4', 999320, 254748, '/boot'], ['tmpfs', 'tmpfs', 4020756, 0, '/dev/shm']];
  for (const m of S.mounts) if (m.devRoot) rows.push([m.dev, m.fs, 15625000, 11500, m.mp]);
  let sel = rows; if (rest.length) { sel = rest.map(p => { const mp = devOf(p) || (norm(p).startsWith('/boot') ? '/boot' : '/'); return rows.find(r => r[4] === mp) || rows[0]; }); }
  const H = n => f.h ? human(n * 1024) : String(n);
  io.out(`Filesystem     ${f.T ? 'Type  ' : ''}${f.h ? ' Size  Used Avail' : '1K-blocks     Used Available'} Use% Mounted on\n` + sel.map(r => `${r[0].padEnd(14)} ${f.T ? r[1].padEnd(5) + ' ' : ''}${H(r[2]).padStart(f.h ? 5 : 9)} ${H(r[3]).padStart(f.h ? 5 : 8)} ${H(r[2] - r[3]).padStart(f.h ? 5 : 9)} ${String(Math.ceil(r[3] / r[2] * 100)).padStart(3)}% ${r[4]}`).join('\n') + '\n');
  ev('df'); return 0;
};
CMDS.du = (a, io) => {
  const { f, rest } = go(a, 'shacx', 'd', { summarize: 's', 'human-readable': 'h', all: 'a', total: 'c', 'max-depth': 'd' });
  const paths = rest.length ? rest : ['.']; const maxd = f.s ? 0 : (f.d != null ? +f.d : Infinity);
  const H = b => f.h ? human(b) : String(Math.ceil(b / 1024));
  let out = '', total = 0, code = 0;
  const walk = (p, r, d) => {
    if (r.n.t !== 'd') { const s = Math.ceil(fsize(r.n) / 4096) * 4096; if (f.a && d <= maxd) out += `${H(s)}\t${p}\n`; return s; }
    if (!can(r.n, 'r')) { io.err(`du: cannot read directory '${p}': Permission denied\n`); code = 1; return 4096; }
    let s = 4096;
    for (const nm of Object.keys(r.n.ent).sort()) { const cp = p.replace(/\/$/, '') + '/' + nm; s += walk(cp, lookup(cp, false), d + 1); }
    if (d <= maxd) out += `${H(s)}\t${p}\n`;
    return s;
  };
  for (const p of paths) { const r = lookup(p); if (r.err) { code = fail(io, 'du', `cannot access '${p}': ${r.err}`); continue; } total += walk(p, r, 0); }
  if (f.c) out += `${H(total)}\ttotal\n`;
  io.out(out); ev('du'); return code;
};
CMDS.free = (a, io) => {
  const { f } = go(a, 'hmgkbt');
  const t = [8041512, 2479812, 3120440, 52340, 2441260, 5560320], sw = [2097148, 0, 2097148];
  const F = k => f.h ? human(k * 1024).replace(/([KMGT])$/, '$1i') : f.m ? String(Math.round(k / 1024)) : f.g ? String(Math.round(k / 1048576)) : String(k);
  io.out(`               total        used        free      shared  buff/cache   available\nMem:     ${t.map(F).map(x => x.padStart(11)).join(' ')}\nSwap:    ${sw.map(F).map(x => x.padStart(11)).join(' ')}\n`);
  ev('free'); return 0;
};
CMDS.uname = (a, io) => {
  const { f } = go(a, 'asnrvmpio');
  const v = { s: 'Linux', n: S.host, r: '6.8.0-49-generic', v: '#49-Ubuntu SMP PREEMPT_DYNAMIC Tue Nov 4 2026', m: 'x86_64', o: 'GNU/Linux' };
  io.out((f.a ? [v.s, v.n, v.r, v.v, v.m, v.m, v.m, v.o] : ['s', 'n', 'r', 'v', 'm', 'o'].filter(k => f[k]).map(k => v[k])).join(' ') + (!Object.keys(f).length ? v.s : '') + '\n');
  return 0;
};
CMDS.uptime = (a, io) => { io.out(a.includes('-p') ? 'up 4 hours, 15 minutes\n' : a.includes('-s') ? '2026-11-18 05:19:03\n' : ' 09:34:12 up  4:15,  1 user,  load average: 0.42, 0.37, 0.31\n'); return 0; };
CMDS.hostname = (a, io) => { if (a[0] === '-I') io.out('10.0.0.5 172.17.0.1\n'); else if (a[0] && S.uid !== 0) return fail(io, 'hostname', 'you must be root to change the host name'); else if (a[0]) S.host = a[0]; else io.out(S.host + '\n'); return 0; };
CMDS.date = (a, io) => {
  const d = new Date(S.clock), p2 = n => String(n).padStart(2, '0');
  const fmt = a.find(x => x.startsWith('+'));
  if (fmt) { io.out(fmt.slice(1).replace(/%([YmdHMSsAaBbjFT])/g, (m, c) => ({ Y: d.getFullYear(), m: p2(d.getMonth() + 1), d: p2(d.getDate()), H: p2(d.getHours()), M: p2(d.getMinutes()), S: p2(d.getSeconds()), s: Math.floor(d / 1000), A: 'Wednesday', a: 'Wed', B: 'November', b: 'Nov', j: 322, F: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, T: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` }[c])) + '\n'); return 0; }
  io.out(`Wed Nov 18 ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} UTC 2026\n`); return 0;
};
CMDS.cal = (a, io) => { io.out('   November 2026\nSu Mo Tu We Th Fr Sa\n 1  2  3  4  5  6  7\n 8  9 10 11 12 13 14\n15 16 17 ' + C(io, '7', '18') + ' 19 20 21\n22 23 24 25 26 27 28\n29 30\n'); return 0; };
CMDS.w = (a, io) => { io.out(` 09:34:12 up  4:15,  1 user,  load average: 0.42, 0.37, 0.31\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n${curUser().padEnd(8)} pts/0    10.0.0.5         05:19    0.00s  0.04s  0.00s w\n`); return 0; };
CMDS.dmesg = (a, io) => {
  if (S.uid !== 0) return fail(io, 'dmesg', 'read kernel buffer failed: Operation not permitted');
  io.out('[    0.000000] Linux version 6.8.0-49-generic (buildd@lcy02)\n[    0.000000] Command line: BOOT_IMAGE=/vmlinuz-6.8.0-49-generic root=UUID=3f1c-a9e2 ro quiet splash\n[    0.412345] PCI: Using configuration type 1 for base access\n[    1.203311] EXT4-fs (sda1): mounted filesystem with ordered data mode\n[    2.991002] systemd[1]: systemd 255 running in system mode\n[ 3021.110000] usb 1-1: new high-speed USB device number 2 using xhci_hcd\n[ 3021.400000] sd 2:0:0:0: [sdb] 31277232 512-byte logical blocks: (16.0 GB/14.9 GiB)\n[ 3021.410000]  sdb: sdb1\n');
  ev('boot', { what: 'dmesg' }); return 0;
};

/* ---------- networking ---------- */
const NET = {
  'google.com': { ip: '142.250.185.78', ms: 14, hops: ['192.168.1.1', '10.20.0.1', '72.14.215.85', '142.250.185.78'] },
  'example.com': { ip: '93.184.215.14', ms: 88, hops: ['192.168.1.1', '10.20.0.1', '195.66.224.110', '152.195.38.1', '93.184.215.14'] },
  'github.com': { ip: '140.82.121.4', ms: 23, hops: ['192.168.1.1', '10.20.0.1', '80.249.211.140', '140.82.121.4'] },
  'linux.org': { ip: '104.21.32.1', ms: 19, hops: ['192.168.1.1', '10.20.0.1', '104.21.32.1'] },
  'api.example.com': { ip: '93.184.215.20', ms: 90, hops: ['192.168.1.1', '10.20.0.1', '93.184.215.20'] },
  'web01': { ip: '10.0.0.11', ms: 0.4, ssh: true, hops: ['10.0.0.11'] },
  'db01': { ip: '10.0.0.21', ms: 0.5, ssh: true, hops: ['10.0.0.21'] },
  'web02': { ip: '10.0.0.12', ms: 0, down: true, hops: [] },
  'localhost': { ip: '127.0.0.1', ms: 0.04, hops: [] },
  '8.8.8.8': { ip: '8.8.8.8', ms: 12, hops: ['192.168.1.1', '10.20.0.1', '8.8.8.8'] },
};
const REMOTE_FS = { 'backup.tar.gz': 'remote backup', 'report.pdf': 'PDF', '.bashrc': '# remote bashrc\n' };
function resolveHost(h) { const x = NET[h] || Object.values(NET).find(n => n.ip === h); if (x) return Object.assign({ name: NET[h] ? h : (Object.keys(NET).find(k => NET[k] === x)) }, x); if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return { name: h, ip: h, ms: 30, hops: ['192.168.1.1', h] }; return null; }
CMDS.ping = (a, io) => {
  const { f, rest } = go(a, 'q46', 'ciWw');
  const h = rest[0]; if (!h) return fail(io, 'ping', 'usage error: Destination address required', 2);
  const x = resolveHost(h); if (!x) return fail(io, 'ping', `${h}: Name or service not known`, 2);
  const n = Math.min(+(f.c || 4), 10);
  let out = `PING ${h} (${x.ip}) 56(84) bytes of data.\n`; const rtts = [];
  for (let i = 1; i <= n; i++) { if (x.down) continue; const t = +(x.ms * (0.9 + Math.random() * 0.25)).toFixed(x.ms < 1 ? 3 : 1); rtts.push(t); if (!f.q) out += `64 bytes from ${x.ip}: icmp_seq=${i} ttl=${x.hops.length ? 64 - x.hops.length + 1 : 64} time=${t} ms\n`; }
  out += `\n--- ${h} ping statistics ---\n${n} packets transmitted, ${rtts.length} received, ${Math.round((1 - rtts.length / n) * 100)}% packet loss, time ${n * 1000 - 999}ms\n`;
  if (rtts.length) out += `rtt min/avg/max/mdev = ${Math.min(...rtts).toFixed(3)}/${(rtts.reduce((s, v) => s + v, 0) / rtts.length).toFixed(3)}/${Math.max(...rtts).toFixed(3)}/0.210 ms\n`;
  if (!f.c && io.tty) out += '\x1b[2m(real ping runs until you press Ctrl+C — the simulator sends 4 packets; use -c N)\x1b[0m\n';
  io.out(out); ev('net', { kind: 'ping', host: h, ip: x.ip, hops: x.hops, n, ok: !x.down, ms: x.ms });
  return x.down ? 1 : 0;
};
function httpGet(url) {
  const m = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url); if (!m) return { err: 3 };
  const [, proto = 'http', host, port, path = '/'] = m;
  const x = resolveHost(host); if (!x) return { err: 6, msg: `Could not resolve host: ${host}` };
  if (host === 'localhost' || host === '127.0.0.1') { if (!S.services.nginx.active) return { err: 7, msg: `Failed to connect to ${host} port ${port || 80} after 0 ms: Couldn't connect to server` }; return { x, host, path, status: 200, type: 'text/html', body: readFile('/var/www/html/index.html').data || '<h1>nginx</h1>\n' }; }
  if (x.down) return { err: 28, msg: `Failed to connect to ${host} port 80 after 10001 ms: Timeout was reached` };
  if (host === 'api.example.com') return { x, host, path, status: 200, type: 'application/json', body: path.startsWith('/users') ? '[{"id":1,"name":"alice"},{"id":2,"name":"bob"}]\n' : '{"status":"ok","version":"1.4.2"}\n' };
  if (path !== '/' && !/index|\.html$/.test(path) && host !== 'example.com') return { x, host, path, status: 404, type: 'text/html', body: '<h1>404 Not Found</h1>\n' };
  if (proto === 'http' && host !== 'example.com') return { x, host, path, status: 301, type: 'text/html', location: `https://${host}${path}`, body: '<h1>301 Moved Permanently</h1>\n', proto };
  return { x, host, path, status: 200, type: 'text/html; charset=UTF-8', body: `<!doctype html>\n<html>\n<head><title>${host}</title></head>\n<body><h1>Welcome to ${host}</h1></body>\n</html>\n`, proto };
}
CMDS.curl = (a, io) => {
  const { f, rest } = go(a, 'IsSLvOkfi', 'oXdH', { head: 'I', silent: 's', location: 'L', verbose: 'v', output: 'o', request: 'X', data: 'd', header: 'H', include: 'i' });
  const url = rest[0]; if (!url) return fail(io, 'curl', 'no URL specified\ncurl: try \'curl --help\' for more information', 2);
  let r = httpGet(url);
  if (r.err) { io.err(`curl: (${r.err}) ${r.msg || 'URL using bad/illegal format'}\n`); ev('net', { kind: 'curl', host: url, fail: true }); return r.err; }
  if (r.status === 301 && f.L) r = httpGet(r.location);
  const hdr = `HTTP/${r.proto === 'https' ? '2' : '1.1'} ${r.status} ${{ 200: 'OK', 301: 'Moved Permanently', 404: 'Not Found' }[r.status]}\ncontent-type: ${r.type}\ncontent-length: ${r.body.length}\n${r.location ? 'location: ' + r.location + '\n' : ''}server: ${r.host === 'localhost' ? 'nginx/1.24.0' : 'ECAcc (lac/55B3)'}\n\n`;
  if (f.v) io.err(`*   Trying ${r.x.ip}:${r.proto === 'https' ? 443 : 80}...\n* Connected to ${r.host} (${r.x.ip})\n> ${f.X || (f.I ? 'HEAD' : 'GET')} ${r.path} HTTP/1.1\n> Host: ${r.host}\n> User-Agent: curl/8.5.0\n>\n< ${hdr.split('\n')[0]}\n`);
  ev('net', { kind: 'curl', host: r.host, ip: r.x.ip, hops: r.x.hops, https: r.proto === 'https', status: r.status, method: f.X || (f.d ? 'POST' : f.I ? 'HEAD' : 'GET') });
  const body = f.I ? hdr : (f.i ? hdr : '') + (f.d && f.X !== 'GET' ? '{"created":true,"received":' + JSON.stringify(f.d) + '}\n' : r.body);
  const file = f.o || (f.O ? (baseName(r.path) || 'index.html') : null);
  if (file) { const w = writeFile(file, body); if (w.err) return fail(io, 'curl', `(23) Failure writing output to destination`, 23); if (!f.s) io.err(`  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n                                 Dload  Upload   Total   Spent    Left  Speed\n100  ${String(body.length).padStart(4)}  100  ${String(body.length).padStart(4)}    0     0   9812      0 --:--:-- --:--:-- --:--:--  9844\n`); ev('create', { path: norm(file), kind: 'f' }); return 0; }
  io.out(body); return f.f && r.status >= 400 ? 22 : 0;
};
CMDS.wget = (a, io) => {
  const { f, rest } = go(a, 'qcb', 'OP', { quiet: 'q', 'output-document': 'O' });
  const url = rest[0]; if (!url) return fail(io, 'wget', 'missing URL');
  const r = httpGet(url);
  const ts = '--2026-11-18 09:34:12--  ';
  if (r.err) { io.err(`${ts}${url}\nResolving ${url.replace(/^https?:\/\//, '').split('/')[0]}... failed: Name or service not known.\nwget: unable to resolve host address\n`); return 4; }
  let file = f.O || baseName(r.path === '/' ? 'index.html' : r.path) || 'index.html';
  if (!f.O) { let k = 0, base = file; while (lookup(file).n) file = `${base}.${++k}`; }
  if (f.O === '-') { io.out(r.body); return 0; }
  writeFile(file, r.body);
  if (!f.q) io.err(`${ts}${url}\nResolving ${r.host} (${r.host})... ${r.x.ip}\nConnecting to ${r.host} (${r.host})|${r.x.ip}|:443... connected.\nHTTP request sent, awaiting response... ${r.status} OK\nLength: ${r.body.length} [${r.type.split(';')[0]}]\nSaving to: '${file}'\n\n${file.padEnd(18)} 100%[===================>]  ${r.body.length}  --.-KB/s    in 0s\n\n2026-11-18 09:34:13 (9.8 MB/s) - '${file}' saved [${r.body.length}/${r.body.length}]\n`);
  ev('net', { kind: 'wget', host: r.host, ip: r.x.ip, hops: r.x.hops, https: true, file });
  return 0;
};
CMDS.ssh = (a, io) => {
  const { f, rest } = go(a, 'vtTAN46', 'pilo');
  const tgt = rest[0]; if (!tgt) return fail(io, 'usage', 'ssh [-p port] [user@]hostname [command]', 255);
  const [u, h] = tgt.includes('@') ? tgt.split('@') : [curUser(), tgt];
  const x = resolveHost(h);
  if (!x) return fail(io, 'ssh', `Could not resolve hostname ${h}: Name or service not known`, 255);
  if (x.down) return fail(io, 'ssh', `connect to host ${h} port ${f.p || 22}: Connection timed out`, 255);
  if (!x.ssh) return fail(io, 'ssh', `connect to host ${h} port ${f.p || 22}: Connection refused`, 255);
  ev('net', { kind: 'ssh', host: h, ip: x.ip, hops: x.hops, user: u });
  const cmd = rest.slice(1).join(' ');
  if (cmd) { const rmap = { hostname: h, whoami: u, uptime: ' 09:34:12 up 41 days,  2:03,  0 users,  load average: 0.08, 0.05, 0.01', 'uname -a': `Linux ${h} 6.8.0-49-generic x86_64 GNU/Linux`, ls: Object.keys(REMOTE_FS).filter(k => !k.startsWith('.')).join('\n'), 'df -h': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        80G   31G   46G  41% /' }; io.out((rmap[cmd] ?? `\x1b[2m(simulated: "${cmd}" ran on ${h})\x1b[0m`) + '\n'); return 0; }
  io.out(`Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-49-generic x86_64)\nLast login: ${S.lastLogin}\n${u}@${h}:~$ \x1b[2m(simulated: interactive remote shells aren't supported — try: ssh ${h} hostname)\x1b[0m\nlogout\nConnection to ${h} closed.\n`);
  return 0;
};
CMDS.scp = (a, io) => {
  const { f, rest } = go(a, 'rpqC', 'Pi');
  if (rest.length < 2) return fail(io, 'usage', 'scp [-r] [-P port] source ... target', 1);
  const dst = rest.pop(); const isR = s => /^[^/]*:/.test(s);
  for (const src of rest) {
    if (isR(src)) {
      const [hp, rp] = src.split(':'); const h = hp.split('@').pop(); const x = resolveHost(h);
      if (!x || !x.ssh) return fail(io, 'ssh', `connect to host ${h} port 22: ${x ? 'Connection refused' : 'Name or service not known'}`, 255);
      const nm = baseName(rp); const data = REMOTE_FS[nm]; if (data == null) return fail(io, 'scp', `${rp}: No such file or directory`);
      let target = dst; const d = lookup(dst); if (d.n && d.n.t === 'd') target = norm(dst) + '/' + nm;
      writeFile(target, data); ev('net', { kind: 'scp', host: h, ip: x.ip, hops: x.hops, dir: 'down', file: nm }); ev('create', { path: norm(target), kind: 'f' });
      if (!f.q) io.out(`${nm.padEnd(40)} 100%   ${data.length}     1.2MB/s   00:00\n`);
    } else {
      const r = lookup(src); if (r.err) return fail(io, 'scp', `${src}: ${r.err}`);
      if (r.n.t === 'd' && !f.r) return fail(io, 'scp', `${src}: not a regular file`);
      if (!isR(dst)) return CMDS.cp([...(f.r ? ['-r'] : []), src, dst], io);
      const h = dst.split(':')[0].split('@').pop(); const x = resolveHost(h);
      if (!x || !x.ssh) return fail(io, 'ssh', `connect to host ${h} port 22: ${x ? (x.down ? 'Connection timed out' : 'Connection refused') : 'Name or service not known'}`, 255);
      REMOTE_FS[baseName(src)] = r.n.data || '';
      ev('net', { kind: 'scp', host: h, ip: x.ip, hops: x.hops, dir: 'up', file: baseName(src) });
      if (!f.q) io.out(`${baseName(src).padEnd(40)} 100%  ${String(fsize(r.n)).padStart(5)}   ${human(fsize(r.n) * 40)}B/s   00:00\n`);
    }
  }
  return 0;
};

/* ---------- packages ---------- */
const PKGS = { tree: ['2.1.1-2', '47.9 kB', 'displays an indented directory tree'], htop: ['3.3.0-4', '171 kB', 'interactive processes viewer'], cowsay: ['3.03+dfsg2-8', '18.6 kB', 'configurable talking cow'], jq: ['1.7.1-3', '65.9 kB', 'lightweight command-line JSON processor'], neofetch: ['7.1.0-4', '81.5 kB', 'shows system information with a logo'], git: ['1:2.43.0-1', '3,679 kB', 'fast, scalable, distributed revision control system'], nginx: ['1.24.0-2', '520 kB', 'small, powerful, scalable web/proxy server'], curl: ['8.5.0-2', '226 kB', 'command line tool for transferring data with URL syntax'], 'python-is-python3': ['3.11.4-1', '2.8 kB', 'symlinks /usr/bin/python to python3'], nodejs: ['18.19.1', '12.3 MB', 'evented I/O for V8 javascript'], 'docker.io': ['24.0.7', '28.9 MB', 'Linux container runtime'] };
const PKG_BIN = { 'python-is-python3': 'python', nodejs: 'node', 'docker.io': 'docker' };
CMDS.apt = CMDS['apt-get'] = (a, io, rec) => {
  const { f, rest } = go(a, 'yq', '', { yes: 'y' });
  const [act, ...pk] = rest;
  const lock = () => { io.err(`E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n`); return 100; };
  const hdr = 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n';
  ev('apt', { action: act, pkgs: pk, root: S.uid === 0 });
  switch (act) {
    case 'update': if (S.uid !== 0) return lock(); S.pkgs.updated = true; io.out('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nFetched 252 kB in 1s (241 kB/s)\n' + hdr + '3 packages can be upgraded. Run \'apt list --upgradable\' to see them.\n'); return 0;
    case 'upgrade': if (S.uid !== 0) return lock(); io.out(hdr + 'Calculating upgrade... Done\nThe following packages will be upgraded:\n  curl libcurl4 openssl\n3 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nSetting up openssl (3.0.13-0ubuntu3.4) ...\nSetting up curl (8.5.0-2ubuntu10.5) ...\n'); return 0;
    case 'install': {
      if (S.uid !== 0) return lock(); if (!pk.length) { io.out(hdr + '0 upgraded, 0 newly installed, 0 to remove and 3 not upgraded.\n'); return 0; }
      let out = hdr; const nw = [];
      for (const p of pk) { if (!PKGS[p]) { io.err(hdr + `E: Unable to locate package ${p}\n`); return 100; } if (S.pkgs.installed.has(p)) out += `${p} is already the newest version (${PKGS[p][0]}).\n`; else nw.push(p); }
      if (nw.length) {
        out += `The following NEW packages will be installed:\n  ${nw.join(' ')}\n0 upgraded, ${nw.length} newly installed, 0 to remove and 3 not upgraded.\nNeed to get ${PKGS[nw[0]][1]} of archives.\nAfter this operation, ${PKGS[nw[0]][1].replace('kB', '').trim() * 3 || 120} kB of additional disk space will be used.\n${f.y ? '' : 'Do you want to continue? [Y/n] \x1b[2m(simulated: Y)\x1b[0m\n'}`;
        nw.forEach((p, i) => { out += `Get:${i + 1} http://archive.ubuntu.com/ubuntu noble/universe amd64 ${p} amd64 ${PKGS[p][0]} [${PKGS[p][1]}]\n`; });
        out += 'Fetched ' + PKGS[nw[0]][1] + ' in 0s (412 kB/s)\n';
        nw.forEach(p => { out += `Selecting previously unselected package ${p}.\nUnpacking ${p} (${PKGS[p][0]}) ...\nSetting up ${p} (${PKGS[p][0]}) ...\n`; S.pkgs.installed.add(p); const bin = PKG_BIN[p] || p; if (!lookup('/usr/bin/' + bin).n) { const save = S.uid; S.uid = 0; put('/usr/bin/' + bin, 'f', { mode: 0o755, data: '\x7fELF', sz: 60 * KB }); S.uid = save; } });
        out += 'Processing triggers for man-db (2.12.0-4build2) ...\n';
      }
      io.out(out); return 0;
    }
    case 'remove': case 'purge': {
      if (S.uid !== 0) return lock(); let out = hdr;
      for (const p of pk) { if (!S.pkgs.installed.has(p)) { out += `Package '${p}' is not installed, so not removed\n`; continue; } out += `The following packages will be REMOVED:\n  ${p}${act === 'purge' ? '*' : ''}\n0 upgraded, 0 newly installed, 1 to remove and 3 not upgraded.\nRemoving ${p} (${PKGS[p] ? PKGS[p][0] : '1.0'}) ...\n`; S.pkgs.installed.delete(p); const bin = PKG_BIN[p] || p; if (lookup('/usr/bin/' + bin).n && !['curl'].includes(p)) fsUnlink('/usr/bin/' + bin); if (p === 'nginx') { S.services.nginx.active = false; } }
      io.out(out); return 0;
    }
    case 'list': io.out('Listing... Done\n' + [...S.pkgs.installed].sort().map(p => `${p}/noble,now ${PKGS[p] ? PKGS[p][0] : '1.0-1'} amd64 [installed]`).join('\n') + '\n'); return 0;
    case 'search': io.out('Sorting... Done\nFull Text Search... Done\n' + Object.entries(PKGS).filter(([k, v]) => k.includes(pk[0] || '') || v[2].includes(pk[0] || '')).map(([k, v]) => `${C(io, '32', k)}/noble ${v[0]} amd64\n  ${v[2]}\n`).join('\n')); return 0;
    case 'show': { const p = PKGS[pk[0]]; if (!p) return fail(io, 'E', `No packages found`, 100); io.out(`Package: ${pk[0]}\nVersion: ${p[0]}\nPriority: optional\nSection: utils\nDownload-Size: ${p[1]}\nDescription: ${p[2]}\n`); return 0; }
    default: io.out(`apt 2.7.14 (amd64)\nUsage: apt [options] command\n\nMost used commands:\n  list - list packages based on package names\n  search - search in package descriptions\n  show - show package details\n  install - install packages\n  remove - remove packages\n  update - update list of available packages\n  upgrade - upgrade the system by installing/upgrading packages\n`); return act ? 1 : 0;
  }
};
CMDS.tree = (a, io) => {
  const { f, rest } = go(a, 'adf', 'L');
  const root = rest[0] || '.'; const r = lookup(root); if (r.err) return fail(io, root, `[error opening dir]`, 2);
  let out = C(io, '34;1', root) + '\n', nd = 0, nf = 0;
  const walk = (p, rr, pre, d) => {
    if (f.L && d >= +f.L) return;
    let names = Object.keys(dirOf(rr.n).ent).sort(); if (!f.a) names = names.filter(n => !n.startsWith('.'));
    if (f.d) names = names.filter(n => lookup(p + '/' + n, false).n.t === 'd');
    names.forEach((nm, i) => { const last = i === names.length - 1; const cr = lookup(p + '/' + nm, false); out += pre + (last ? '└── ' : '├── ') + nameColor(io, nm, cr.n) + (cr.n.t === 'l' ? ' -> ' + cr.n.tgt : '') + '\n'; if (cr.n.t === 'd') { nd++; if (can(cr.n, 'r')) walk(p + '/' + nm, cr, pre + (last ? '    ' : '│   '), d + 1); } else nf++; });
  };
  walk(r.path, r, '', 0);
  io.out(out + `\n${nd} director${nd === 1 ? 'y' : 'ies'}${f.d ? '' : `, ${nf} file${nf === 1 ? '' : 's'}`}\n`); ev('list', { path: r.path, names: Object.keys(r.n.ent) }); return 0;
};
CMDS.cowsay = (a, io) => { const t = a.join(' ') || (io.stdin || 'Moo').trim(); io.out(` ${'_'.repeat(t.length + 2)}\n< ${t} >\n ${'-'.repeat(t.length + 2)}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n`); return 0; };
CMDS.jq = (a, io) => { const { text } = inputOf(a.slice(1).filter(x => !x.startsWith('-')), io, 'jq'); try { let v = JSON.parse(text); const q = a[0] || '.'; const m = /^\.\[(\d*)\](?:\.(\w+))?$|^\.(\w+)$/.exec(q); if (m) { if (m[3]) v = v[m[3]]; else { const arr = m[1] !== '' ? [v[+m[1]]] : v; io.out(arr.map(x => JSON.stringify(m[2] ? x[m[2]] : x, null, 2)).join('\n') + '\n'); return 0; } } io.out(JSON.stringify(v, null, 2) + '\n'); return 0; } catch (e) { return fail(io, 'jq', 'error: Cannot parse input as JSON', 2); } };
CMDS.neofetch = (a, io) => { io.out(`${C(io, '31;1', '            .-/+oossssoo+/-.')}        ${C(io, '31;1', curUser())}@${C(io, '31;1', S.host)}\n${C(io, '31;1', '        :+ssssssssssssssssss+:')}      ------------\n${C(io, '31;1', '      -+ssssssssssssssssssyyssss+-')}   OS: Ubuntu 24.04.1 LTS x86_64\n${C(io, '31;1', '    .ossssssssssssssssssdMMMNysssso.')} Kernel: 6.8.0-49-generic\n${C(io, '31;1', '   /ssssssssssshdmmNNmmyNMMMMhssssss/')} Uptime: 4 hours, 15 mins\n${C(io, '31;1', '  +ssssssssshmydMMMMMMMNddddyssssssss+')} Shell: bash 5.2.21\n${C(io, '31;1', ' /sssssssshNMMMyhhyyyyhmNMMMNhssssssss/')} CPU: Intel i7-1165G7 (4) @ 2.80GHz\n${C(io, '31;1', '.ssssssssdMMMNhsssssssssshNMMMdssssssss.')} Memory: 2421MiB / 7853MiB\n`); return 0; };
CMDS.git = (a, io) => { if (a[0] === '--version') io.out('git version 2.43.0\n'); else io.out(`\x1b[2m(simulated: git ${a.join(' ')} — version control is outside this course)\x1b[0m\n`); return 0; };

/* ---------- users & groups ---------- */
const needRoot = (io, c) => { io.err(`${c}: Permission denied.\n${c}: cannot lock /etc/passwd; try again later.\n`); return 1; };
CMDS.useradd = (a, io) => {
  const { f, rest } = go(a, 'mMrD', 'sGdcug', { 'create-home': 'm', shell: 's', groups: 'G', home: 'd', comment: 'c' });
  if (S.uid !== 0) return needRoot(io, 'useradd');
  const u = rest[0]; if (!u) return fail(io, 'useradd', 'missing username', 2);
  if (S.users[u]) return fail(io, 'useradd', `user '${u}' already exists`, 9);
  if (!/^[a-z_][a-z0-9_-]*$/.test(u)) return fail(io, 'useradd', `invalid user name '${u}'`, 3);
  const uid = Math.max(...Object.values(S.users).map(x => x.uid).filter(x => x < 60000)) + 1;
  const gid = Math.max(uid, ...Object.values(S.groups).map(g => g.gid).filter(x => x < 60000)) + (Object.values(S.groups).some(g => g.gid === uid) ? 1 : 0); S.groups[u] = { gid: Object.values(S.groups).some(g => g.gid === uid) ? gid : uid, m: [] };
  S.users[u] = { uid, gid: S.groups[u].gid, home: f.d || '/home/' + u, shell: f.s || '/bin/sh', name: f.c || '' };
  for (const g of (f.G || '').split(',').filter(Boolean)) { if (!S.groups[g]) return fail(io, 'useradd', `group '${g}' does not exist`, 6); S.groups[g].m.push(u); }
  if (f.m) { const save = S.uid; const c = fsCreate(S.users[u].home, 'd', 0o750); if (!c.err) { I(c.ino).uid = uid; I(c.ino).gid = uid; put(S.users[u].home + '/.bashrc', 'f', { uid, data: '# ~/.bashrc copied from /etc/skel\n' }); put(S.users[u].home + '/.profile', 'f', { uid, data: '# ~/.profile copied from /etc/skel\n' }); } S.uid = save; ev('create', { path: S.users[u].home, kind: 'd' }); }
  syncEtc(); ev('user', { action: 'add', user: u, uid, home: f.m }); return 0;
};
CMDS.userdel = (a, io) => {
  const { f, rest } = go(a, 'rf'); if (S.uid !== 0) return needRoot(io, 'userdel');
  const u = rest[0]; if (!S.users[u]) return fail(io, 'userdel', `user '${u}' does not exist`, 6);
  if (u === 'root' || u === 'user') return fail(io, 'userdel', `user ${u} is currently used by process ${u === 'root' ? 1 : 1200}`, 8);
  if (f.r) fsUnlinkTree(S.users[u].home);
  delete S.users[u]; delete S.groups[u]; Object.values(S.groups).forEach(g => g.m = g.m.filter(x => x !== u));
  syncEtc(); ev('user', { action: 'del', user: u }); return 0;
};
CMDS.usermod = (a, io) => {
  const { f, rest } = go(a, 'aL', 'Gsd'); if (S.uid !== 0) return needRoot(io, 'usermod');
  const u = rest[0]; if (!S.users[u]) return fail(io, 'usermod', `user '${u}' does not exist`, 6);
  if (f.G) { const gs = f.G.split(','); for (const g of gs) if (!S.groups[g]) return fail(io, 'usermod', `group '${g}' does not exist`, 6); if (!f.a) Object.values(S.groups).forEach(g => g.m = g.m.filter(x => x !== u)); gs.forEach(g => { if (!S.groups[g].m.includes(u)) S.groups[g].m.push(u); }); }
  if (f.s) S.users[u].shell = f.s;
  syncEtc(); ev('user', { action: 'mod', user: u, groups: f.G, append: !!f.a }); return 0;
};
CMDS.groupadd = (a, io) => { if (S.uid !== 0) return needRoot(io, 'groupadd'); const g = a[a.length - 1]; if (S.groups[g]) return fail(io, 'groupadd', `group '${g}' already exists`, 9); S.groups[g] = { gid: 1000 + Object.keys(S.groups).length * 3, m: [] }; syncEtc(); return 0; };
CMDS.passwd = (a, io) => {
  const t = a.find(x => !x.startsWith('-')) || curUser();
  if (!S.users[t]) return fail(io, 'passwd', `user '${t}' does not exist`);
  if (t !== curUser() && S.uid !== 0) return fail(io, 'passwd', `You may not view or modify password information for ${t}.`);
  if (a.includes('-S')) { io.out(`${t} P 11/18/2026 0 99999 7 -1\n`); return 0; }
  io.out(`${S.uid === 0 ? '' : `Changing password for ${t}.\nCurrent password: \x1b[2m(simulated)\x1b[0m\n`}New password: \x1b[2m(simulated — typing is invisible in a real terminal)\x1b[0m\nRetype new password: \x1b[2m(simulated)\x1b[0m\npasswd: password updated successfully\n`);
  ev('user', { action: 'passwd', user: t }); return 0;
};
CMDS.su = (a, io) => {
  let login = false, c = null; const rest = [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '-' || a[i] === '-l' || a[i] === '--login') login = true; else if (a[i] === '-c') c = a[++i]; else rest.push(a[i]); }
  const t = rest[0] || 'root';
  if (!S.users[t]) return fail(io, 'su', `user ${t} does not exist or the user entry does not contain all the required fields`);
  ev('su', { user: curUser(), target: t, login });
  if (S.uid !== 0) io.err(`Password: \x1b[2m(simulated — accepted. Real su asks for ${t}'s password; on Ubuntu root has no password, so use sudo -i)\x1b[0m\n`);
  if (c) { const save = { uid: S.uid }; S.uid = S.users[t].uid; let code; try { code = runText(c, io); } finally { S.uid = save.uid; } return code; }
  S.userStack.push({ uid: S.uid, cwd: S.cwd, env: Object.assign({}, S.env) });
  S.uid = S.users[t].uid;
  if (login) { S.cwd = S.users[t].home; S.env.HOME = S.users[t].home; S.env.USER = t; S.env.PWD = S.cwd; }
  return 0;
};
CMDS.exit = CMDS.logout = (a, io) => {
  const code = a[0] != null ? (+a[0] & 255) : S.lastExit;
  if (SH.sd) { SH.exit = code; return code; }
  if (S.userStack.length) { const p = S.userStack.pop(); io.out('logout\n'); S.uid = p.uid; S.cwd = p.cwd; if (p.env) S.env = p.env; return 0; }
  io.out('logout\n\x1b[2m(simulated: the session would close here — the simulator keeps it open)\x1b[0m\n'); return code;
};

/* ---------- shell builtins & small utilities ---------- */
CMDS.export = (a, io) => {
  if (!a.length || a[0] === '-p') { io.out(Object.keys(S.env).sort().map(k => `declare -x ${k}="${S.env[k]}"`).join('\n') + '\n'); return 0; }
  for (const x of a) { const i = x.indexOf('='); if (i > 0) { S.env[x.slice(0, i)] = x.slice(i + 1); delete S.vars[x.slice(0, i)]; } else if (x in S.vars) { S.env[x] = S.vars[x]; delete S.vars[x]; } else S.env[x] = S.env[x] ?? ''; ev('export', { name: i > 0 ? x.slice(0, i) : x }); }
  return 0;
};
CMDS.unset = (a) => { for (const x of a.filter(x => !x.startsWith('-'))) { delete S.vars[x]; delete S.env[x]; delete S.funcs[x]; } return 0; };
CMDS.set = (a, io) => { if (!a.length) io.out(Object.entries(Object.assign({}, S.env, S.vars)).sort().map(([k, v]) => `${k}=${/\s/.test(v) ? `'${v}'` : v}`).join('\n') + '\n'); return 0; };
CMDS.declare = CMDS.local = CMDS.let = (a, io, rec) => { for (const x of a.filter(x => !x.startsWith('-'))) { const i = x.indexOf('='); if (i > 0) S.vars[x.slice(0, i)] = rec.name === 'let' ? arith(x.slice(i + 1)) : x.slice(i + 1); else if (rec.name === 'let') return 0; else S.vars[x] = S.vars[x] ?? ''; } return 0; };
CMDS.env = CMDS.printenv = (a, io, rec) => {
  if (rec.name === 'printenv' && a.length) { let code = 0; for (const k of a) { if (S.env[k] != null) io.out(S.env[k] + '\n'); else code = 1; } return code; }
  const assigns = []; let i = 0; while (i < a.length && a[i].includes('=')) assigns.push(a[i++]);
  if (i < a.length) { const save = Object.assign({}, S.env); for (const x of assigns) { const k = x.indexOf('='); S.env[x.slice(0, k)] = x.slice(k + 1); } const code = execWords(a.slice(i), io, {}); S.env = save; return code; }
  io.out(Object.entries(S.env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'); return 0;
};
CMDS.alias = (a, io) => {
  if (!a.length) { io.out(Object.entries(S.aliases).map(([k, v]) => `alias ${k}='${v}'`).join('\n') + '\n'); return 0; }
  let code = 0;
  for (const x of a) { const i = x.indexOf('='); if (i > 0) S.aliases[x.slice(0, i)] = x.slice(i + 1); else if (S.aliases[x]) io.out(`alias ${x}='${S.aliases[x]}'\n`); else code = fail(io, 'bash: alias', `${x}: not found`); }
  return code;
};
CMDS.unalias = (a, io) => { for (const x of a) { if (x === '-a') S.aliases = {}; else if (!S.aliases[x]) return fail(io, 'bash: unalias', `${x}: not found`); else delete S.aliases[x]; } return 0; };
CMDS.true = () => 0; CMDS.false = () => 1;
CMDS.return = (a) => { SH.ret = a[0] != null ? +a[0] : S.lastExit; return SH.ret; };
CMDS.shift = (a) => { const fr = SH.args[SH.args.length - 1]; fr.splice(1, +(a[0] || 1)); return 0; };
CMDS.read = (a, io) => { const names = a.filter(x => !x.startsWith('-')); const line = (io.stdin || '').split('\n')[0]; if (io.stdin == null) io.err('\x1b[2m(read waits for keyboard input — pipe text in: echo "Ada" | { read name; echo $name; })\x1b[0m\n'); const parts = line.split(/\s+/); names.forEach((n, i) => setVar(n, i === names.length - 1 ? parts.slice(i).join(' ') : (parts[i] || ''))); return io.stdin ? 0 : 1; };
CMDS.source = CMDS['.'] = (a, io) => { if (!a[0]) return fail(io, 'bash: source', 'filename argument required', 2); const r = lookup(a[0].includes('/') ? a[0] : (lookup(a[0]).n ? a[0] : a[0])); if (r.err) return fail(io, 'bash', `${a[0]}: ${r.err}`); ev('source', { path: r.path }); return runScript(r.path, a.slice(1), io, true); };
CMDS.bash = CMDS.sh = CMDS.dash = (a, io, rec) => {
  if (a[0] === '-c') return runText(a[1] || '', io);
  if (a[0] === '--version') { io.out('GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)\n'); return 0; }
  const f = a.find(x => !x.startsWith('-'));
  if (!f) { if (io.stdin) return runScript_text(io.stdin, io); io.out('\x1b[2m(simulated: a new interactive shell would start here; type exit to leave it)\x1b[0m\n'); return 0; }
  const r = lookup(f); if (r.err) return fail(io, rec.name, `${f}: ${r.err}`, 127);
  if (!can(r.n, 'r')) return fail(io, rec.name, `${f}: Permission denied`, 126);
  return runScript(r.path, a.slice(a.indexOf(f) + 1), io);
};
function runScript_text(text, io) { try { return execNodes(parseScript(text), io); } catch (e) { io.err(`bash: ${e}\n`); return 2; } }
function testExpr(a) {
  if (!a.length) return false;
  if (a[0] === '!') return !testExpr(a.slice(1));
  const oi = a.findIndex(x => x === '-a' || x === '-o');
  if (oi > 0) return a[oi] === '-a' ? testExpr(a.slice(0, oi)) && testExpr(a.slice(oi + 1)) : testExpr(a.slice(0, oi)) || testExpr(a.slice(oi + 1));
  if (a.length === 1) return a[0] !== '';
  if (a.length === 2) {
    const [op, x] = a; if (op === '-z') return x === ''; if (op === '-n') return x !== '';
    const r = lookup(x, op !== '-L' && op !== '-h');
    switch (op) { case '-e': return !!r.n; case '-f': return !!r.n && r.n.t === 'f'; case '-d': return !!r.n && r.n.t === 'd'; case '-L': case '-h': return !!r.n && r.n.t === 'l'; case '-s': return !!r.n && fsize(r.n) > 0; case '-r': return !!r.n && can(r.n, 'r'); case '-w': return !!r.n && can(r.n, 'w'); case '-x': return !!r.n && can(r.n, 'x'); }
    throw `${op}: unary operator expected`;
  }
  const [x, op, y] = a; const nx = parseInt(x), ny = parseInt(y);
  const numOp = { '-eq': nx === ny, '-ne': nx !== ny, '-lt': nx < ny, '-le': nx <= ny, '-gt': nx > ny, '-ge': nx >= ny };
  if (op in numOp) { if (isNaN(nx) || isNaN(ny)) throw `${isNaN(nx) ? x : y}: integer expression expected`; return numOp[op]; }
  if (op === '=' || op === '==') return x === y; if (op === '!=') return x !== y;
  if (op === '-nt') { const p = lookup(x).n, q = lookup(y).n; return !!p && (!q || p.mtime > q.mtime); }
  throw `${op}: binary operator expected`;
}
CMDS.test = CMDS['['] = (a, io, rec) => {
  if (rec.name === '[') { if (a[a.length - 1] !== ']') return fail(io, 'bash: [', "missing `]'", 2); a = a.slice(0, -1); }
  try { return testExpr(a) ? 0 : 1; } catch (e) { return fail(io, 'bash: test', e, 2); }
};
CMDS.seq = (a, io) => { const n = a.map(Number); const [s, st, e] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n; const out = []; for (let i = s; st > 0 ? i <= e : i >= e; i += st) { out.push(i); if (out.length > 10000) break; } io.out(joinL(out)); return 0; };
CMDS.basename = (a, io) => { let b = baseName(a[0] || ''); if (a[1] && b.endsWith(a[1])) b = b.slice(0, -a[1].length); io.out(b + '\n'); return 0; };
CMDS.dirname = (a, io) => { const p = (a[0] || '.').replace(/\/+$/, ''); const i = p.lastIndexOf('/'); io.out((i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i)) + '\n'); return 0; };
CMDS.realpath = (a, io) => { const r = lookup(a[0] || '.'); if (r.err) return fail(io, 'realpath', `${a[0]}: ${r.err}`); io.out(r.path + '\n'); return 0; };
CMDS.file = (a, io) => {
  for (const p of a) {
    const r = lookup(p, false); if (r.err) { io.out(`${p}: cannot open \`${p}' (${r.err})\n`); continue; }
    const n = r.n, d = n.data || '';
    const t = n.t === 'd' ? 'directory' : n.t === 'l' ? `symbolic link to ${n.tgt}` : n.dev === 'blk' ? 'block special (8/1)' : d.startsWith('\x7fELF') ? 'ELF 64-bit LSB pie executable, x86-64, dynamically linked, stripped' : d.startsWith('GZ\0') || d.startsWith('TAR\0') && p.endsWith('gz') ? 'gzip compressed data, from Unix' : d.startsWith('TAR\0') ? 'POSIX tar archive (GNU)' : d.startsWith('ZIP\0') ? 'Zip archive data, at least v2.0 to extract' : d.startsWith('JPEG') ? 'JPEG image data, JFIF standard 1.01' : d.startsWith('#!/bin/bash') ? 'Bourne-Again shell script, ASCII text executable' : d.startsWith('<') ? 'HTML document, ASCII text' : !d.length && n.sz ? 'data' : !d.length ? 'empty' : 'ASCII text';
    io.out(`${p}: ${t}\n`);
  }
  return 0;
};
CMDS.nano = CMDS.vim = CMDS.vi = (a, io, rec) => { io.err(`\x1b[33m${rec.name} is a full-screen editor, which this simulator can't show.\nUse instead:  echo "text" > ${a[0] || 'file.txt'}   (overwrite)\n         or:  echo "more" >> ${a[0] || 'file.txt'}  (append)\x1b[0m\n`); return 0; };
CMDS.diff = (a, io) => {
  const f = a.filter(x => !x.startsWith('-')); const x = readFile(f[0] || ''), y = readFile(f[1] || '');
  if (x.err || y.err) return fail(io, 'diff', `${x.err ? f[0] : f[1]}: ${x.err || y.err}`, 2);
  const A = lines(x.data), B = lines(y.data); let out = '';
  const m = A.length, n = B.length, L = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0; while (i < m || j < n) { if (i < m && j < n && A[i] === B[j]) { i++; j++; } else if (j < n && (i >= m || L[i][j + 1] >= L[i + 1][j])) { out += `${i}a${j + 1}\n> ${B[j]}\n`; j++; } else { out += `${i + 1}d${j}\n< ${A[i]}\n`; i++; } }
  io.out(out); return out ? 1 : 0;
};
