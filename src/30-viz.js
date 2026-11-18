/* ================= VISUALIZATION ENGINE ================= */
const NS = 'http://www.w3.org/2000/svg';
const V = { svg: null, g: null, steps: [], i: -1, playing: false, timer: null, speed: 1, ctx: null, instant: false, gen: 0 };
function E(tag, at, par, txt) { const e = document.createElementNS(NS, tag); for (const k in at) if (at[k] != null) e.setAttribute(k, at[k]); if (txt != null) e.textContent = txt; (par || V.g).appendChild(e); return e; }
const tw = s => Math.max(8, String(s).length * 7.25);
const trunc = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function later(ms, fn) { if (V.instant) return fn(); const g = V.gen; setTimeout(() => { if (g === V.gen) fn(); }, ms / V.speed); }
function tween(ms, fn, done) {
  if (V.instant) { fn(1); done && done(); return; }
  const g = V.gen, t0 = performance.now(), d = ms / V.speed;
  const step = t => { if (g !== V.gen) return; const k = Math.min(1, (t - t0) / d); fn(k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); if (k < 1) requestAnimationFrame(step); else done && done(); };
  requestAnimationFrame(step);
}
function pos(g, x, y) { g.style.transform = `translate(${x}px,${y}px)`; g._x = x; g._y = y; }
/* node: rounded box with label */
function node(par, x, y, label, kind = 'plain', opt = {}) {
  const g = E('g', { class: 'n-' + kind + (opt.cls ? ' ' + opt.cls : '') }, par);
  const w = opt.w || Math.max(opt.min || 40, tw(label) + 16), h = opt.h || 24;
  g.r = E('rect', { x: 0, y: 0, width: w, height: h, rx: 6 }, g);
  g.t = E('text', { x: w / 2, y: h / 2 + 4, 'text-anchor': 'middle' }, g, label);
  if (opt.sub) g.s = E('text', { x: w / 2, y: h / 2 + 17, 'text-anchor': 'middle', class: 'lbl-m' }, g, opt.sub);
  g.w = w; g.h = h; pos(g, x, y); g.classList.add('mv');
  g.cx = () => g._x + w / 2; g.cy = () => g._y + h / 2;
  return g;
}
function txt(par, x, y, s, cls, anchor) { return E('text', { x, y, class: cls || '', 'text-anchor': anchor || 'start' }, par, s); }
function line(par, x1, y1, x2, y2, cls) { return E('path', { d: `M${x1},${y1} L${x2},${y2}`, class: cls || 'wire' }, par); }
function curve(par, x1, y1, x2, y2, cls, bend = -60, mk) { return E('path', { d: `M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) + bend} ${x2},${y2}`, class: cls || 'arr', 'marker-end': mk ? `url(#${mk})` : null }, par); }
/* moving packet along a path element or straight line */
function packet(par, path, label, cls = 'pk', ms = 700, keep = false, done) {
  let g;
  if (label) { g = E('g', { class: 'pkt' }, par); const w = Math.min(tw(label) * 0.9 + 8, 150); E('rect', { x: -w / 2, y: -8, width: w, height: 16, rx: 4, class: cls === 'pk' ? '' : cls }, g); E('text', { x: 0, y: 4, 'text-anchor': 'middle' }, g, trunc(label, 20)); }
  else g = E('circle', { r: 5, class: cls }, par);
  const L = path.getTotalLength();
  const set = k => { const p = path.getPointAtLength(L * k); g.setAttribute('transform', `translate(${p.x},${p.y})`); };
  set(0);
  tween(ms, set, () => { if (!keep) g.remove(); done && done(); });
  return g;
}
function stagger(items, ms, fn) { items.forEach((it, i) => later(i * ms, () => fn(it, i))); }
const show = el => el && el.classList.remove('hid');
const hide = el => el && el.classList.add('hid');
const cl = (el, c, on = true) => el && el.classList.toggle(c, on);

function initViz() {
  V.svg = document.getElementById('viz');
  const defs = E('defs', {}, V.svg);
  for (const [id, col] of [['ah', 'var(--muted)'], ['ahb', 'var(--blue)'], ['ahr', 'var(--red)'], ['ahg', 'var(--green)'], ['aho', 'var(--orange)'], ['ahp', 'var(--purple)'], ['ahy', 'var(--yellow)']]) {
    const m = E('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    E('path', { d: 'M0,0 L10,5 L0,10 z', style: `fill:${col};stroke:none` }, m);
  }
  V.g = E('g', {}, V.svg);
  welcomeViz();
}
function welcomeViz() {
  V.g.innerHTML = '';
  txt(V.g, 320, 150, 'Type a command in the terminal and press Enter', 'ttl', 'middle');
  txt(V.g, 320, 175, 'This panel animates what Linux does behind the scenes,', 'lbl-m', 'middle');
  txt(V.g, 320, 192, 'step by step: parsing, finding the program, fork/exec, system calls, output.', 'lbl-m', 'middle');
  const b = node(V.g, 268, 215, 'user@linux:~$ _', 'ok');
}

/* ---------- header strip: tokens, program path, PID, exit code ---------- */
function header(ctx) {
  const H = { toks: [] };
  const hg = E('g', {}, V.g);
  let toks = [];
  try { toks = lex(ctx.line); } catch (e) { toks = [{ w: ctx.line }]; }
  let x = 8; const row = E('g', {}, hg);
  for (const t of toks) { const s = t.w ?? t.op; const g = node(row, x, 6, trunc(s, 26), 'plain', { cls: 'tk', h: 22, min: 18 }); g.classList.add('tk'); g.raw = s; H.toks.push(g); x += g.w + 5; }
  if (x > 470) row.setAttribute('transform', `scale(${Math.max(0.45, 470 / x)})`);
  H.path = txt(hg, 10, 46, '', 'lbl-m'); hide(H.path); H.path.classList.add('fade');
  H.pid = node(hg, 482, 6, 'PID ' + (ctx.mainPid || '—'), 'proc', { w: 76, h: 22 }); H.pid.classList.add('grow', 'hid');
  H.exit = node(hg, 564, 6, 'exit ?', 'plain', { w: 68, h: 22 }); H.exit.classList.add('grow', 'hid');
  H.out = E('g', {}, hg); hide(H.out); H.out.classList.add('fade');
  E('rect', { x: 6, y: 334, width: 628, height: 22, rx: 5, style: 'fill:var(--term);stroke:var(--border)' }, H.out);
  H.outT = txt(H.out, 14, 349, '', '');
  return H;
}
function mainRec(ctx) {
  const p = ctx.pipes[ctx.pipes.length - 1]; if (!p) return null;
  return p.cmds[0];
}
function innerRec(r) { while (r && r.inner && r.inner.name) r = r.inner; return r; }

const VIZMAP = { cd: 'tree', ls: 'tree', mkdir: 'tree', rmdir: 'tree', rm: 'tree', touch: 'tree', pwd: 'tree', tree: 'tree', cp: 'copy', mv: 'copy', rsync: 'copy', chmod: 'perm', chown: 'perm', chgrp: 'perm', umask: 'perm', getfacl: 'perm', setfacl: 'perm', ps: 'proc', top: 'proc', htop: 'proc', kill: 'proc', pkill: 'proc', killall: 'proc', jobs: 'proc', bg: 'proc', fg: 'proc', nohup: 'proc', sleep: 'proc', sudo: 'gate', su: 'gate', awk: 'text', sed: 'text', cut: 'text', tr: 'text', grep: 'text', egrep: 'text', sort: 'text', uniq: 'text', wc: 'text', head: 'text', tail: 'text', xargs: 'split', tee: 'split', ln: 'link', stat: 'link', strace: 'strace', lsof: 'lsof', nice: 'sched', renice: 'sched', systemctl: 'boot', journalctl: 'boot', 'systemd-analyze': 'boot', dmesg: 'boot', crontab: 'cron', at: 'cron', atq: 'cron', mount: 'mount', umount: 'mount', lsblk: 'mount', ufw: 'fw', iptables: 'fw', ping: 'net', curl: 'net', wget: 'net', traceroute: 'net', ssh: 'net', scp: 'net', dig: 'dns', docker: 'container', lsns: 'container', unshare: 'container', 'systemd-cgls': 'container', tar: 'archive', gzip: 'archive', gunzip: 'archive', zip: 'archive', unzip: 'archive', bash: 'script', sh: 'script', source: 'script', '.': 'script', ss: 'lsof', ip: 'net' };
function pickScene(ctx) {
  if (ctx.trace && ctx.trace.length) return 'script';
  const p = ctx.pipes[ctx.pipes.length - 1]; if (!p) return 'generic';
  if (p.bg || ctx.events.some(e => e.type === 'spawn')) return 'proc';
  if (p.cmds.length > 1) return 'pipe';
  const r = p.cmds[0];
  if (r.code === 127 && r.kind !== 'script') return 'none';
  if (r.redir && r.redir.some(x => x.op !== '2>&1')) return 'redirect';
  if (r.name === 'sudo') { const inn = innerRec(r); const s = inn !== r && VIZMAP[inn.name]; return s && s !== 'gate' ? s : 'gate'; }
  if (r.name === 'su') return 'gate';
  if (r.name === 'ls' && !ctx.events.some(e => e.type === 'list')) return 'generic';
  if (r.name === 'find' || r.name === 'locate') return ctx.events.some(e => e.type === 'delete') ? 'tree' : 'search';
  if (r.name === 'ss') return 'lsof';
  return VIZMAP[r.name] || (r.kind === 'script' ? 'script' : 'generic');
}

/* ---------- build steps for a run ---------- */
function buildSteps(ctx) {
  V.g.innerHTML = '';
  const lvl = UI.level, beg = lvl === 'beginner';
  const r = mainRec(ctx);
  if (!r) { welcomeViz(); return []; }
  const p = ctx.pipes[ctx.pipes.length - 1];
  ctx.mainPid = r.pid;
  const H = header(ctx); V.H = H;
  const steps = [];
  const words = (() => { try { return lex(ctx.line).map(t => t.w ?? t.op); } catch (e) { return [ctx.line]; } })();
  steps.push({ t: 'Shell parses input', d: `Splits the line into ${words.length} word${words.length === 1 ? '' : 's'}: ${words.map(w => `「${trunc(w, 18)}」`).join(' ')}`, a: () => stagger(H.toks, 90, g => cl(g, 'hl')) });
  if (!beg) {
    const ex = ctx.exp;
    steps.push({ t: 'Expansion', d: ex.length ? ex.map(e => `${e.from} → ${trunc(e.to, 60)}`).join('; ') : 'Nothing to expand (no ~, $VAR, *, or $(…) in this line).', a: () => { H.toks.forEach(g => { const e = ex.find(e => e.from === g.raw); if (e) { g.t.textContent = trunc(e.to, 26); cl(g, 'hl'); } }); } });
  }
  const sc = pickScene(ctx);
  const isB = r.kind === 'builtin' || r.kind === 'function';
  const lookD = r.code === 127 && !r.path ? `“${r.name}” is not an alias, builtin, function, or a file in any $PATH directory → “command not found”.` : r.alias ? `Alias expanded first (${r.alias}). Then: ${r.path || 'builtin'}` : isB ? `“${r.name}” is a shell ${r.kind} — it runs inside bash itself.` : r.kind === 'script' ? `Path given directly: ${r.path} (a script — the #! line names /bin/bash as its interpreter)` : `Not a builtin → searched $PATH directories in order → found ${r.path}`;
  steps.push({ t: isB ? 'Shell finds a builtin' : 'Finds program in $PATH', d: lookD, a: () => { H.path.textContent = r.code === 127 && !r.path ? '✗ command not found' : isB ? `⚙ ${r.name}: shell ${r.kind}` : `→ ${r.path || r.name}`; cl(H.path, 't-red', r.code === 127 && !r.path); show(H.path); } });
  if (sc === 'none') {
    steps.push({ t: 'Output to stderr', d: (r.err || '').split('\n')[0], a: () => { H.outT.textContent = trunc((r.err || '').split('\n')[0], 82); H.outT.setAttribute('class', 't-red'); show(H.out); } });
    steps.push({ t: 'Exit code 127', d: '127 = command not found. Check spelling, or install the package.', a: () => { H.exit.t.textContent = 'exit 127'; H.exit.setAttribute('class', 'n-root grow mv'); show(H.exit); } });
    return steps;
  }
  if (!beg && !isB && r.path) { const pr = lookup(r.path); steps.push({ t: 'Permission check', d: pr.n ? `${r.path} is ${modeStr(pr.n)} — the x (execute) bit is set, so ${curUser()} may run it.` : 'Execute permission checked by the kernel in execve().', a: () => { H.path.textContent += pr.n ? `   ${modeStr(pr.n)} ✓x` : ''; } }); }
  const n = p.cmds.length;
  if (isB) steps.push({ t: 'Runs inside the shell (no fork)', d: r.name === 'cd' ? 'cd must be a builtin: a child process changing its own directory would not affect the shell that started it.' : `Builtins skip fork()/exec() — faster, and they can change the shell's own state.`, a: () => { H.pid.t.textContent = 'bash 1200'; show(H.pid); } });
  else steps.push({ t: 'Kernel creates process (fork/exec)', d: n > 1 ? `fork() ×${n}: one child process per command in the pipeline, all running at the same time.` : `fork() clones the shell → child PID ${r.pid || '?'}; execve("${r.path}") replaces it with the ${r.name} program.`, a: () => show(H.pid) });
  const sr = r.name === 'sudo' && sc !== 'gate' ? innerRec(r) : r;
  if (sr !== r) steps.push({ t: `sudo → run ${sr.name} as root`, d: `sudo checked /etc/sudoers, then executed ${sr.path || sr.name} with UID 0 — every permission check below passes as root.`, a: () => { H.pid.t.textContent = 'UID 0'; cl(H.pid, 'n-root'); } });
  const scene = (SC[sc] || SC.generic)(ctx, sr, H) || [];
  steps.push(...scene);
  const outLine = (r.out || p.cmds[n - 1].out || '').split('\n').find(Boolean);
  const errLine = (p.cmds.map(c => c.err).join('') || '').split('\n').find(Boolean);
  const redirTo = (p.cmds[n - 1].redir || []).find(x => x.op === '>' || x.op === '>>');
  steps.push({ t: 'Output to stdout/stderr', d: redirTo ? `stdout went into the file “${redirTo.f}” instead of the screen.` + (errLine ? ` stderr (fd 2) still went to the terminal: ${errLine}` : '') : outLine || errLine ? `${outLine ? 'stdout (fd 1): “' + trunc(strip(outLine), 70) + '”' : 'nothing on stdout'}${errLine ? '. stderr (fd 2): “' + trunc(strip(errLine), 70) + '”' : ''}` : 'No output — many commands print nothing on success ("no news is good news").', a: () => { H.outT.textContent = trunc(strip(redirTo ? `→ written to ${redirTo.f}` : (outLine || errLine || '(no output)')), 84); H.outT.setAttribute('class', !outLine && errLine && !redirTo ? 't-red' : ''); show(H.out); } });
  const code = ctx.code;
  steps.push({ t: `Process exits (exit code ${code})`, d: code === 0 ? 'Exit code 0 = success. Check it with: echo $?' : `Non-zero = failure (${code}). ${{ 1: '1 = general error', 2: '2 = misuse / serious trouble', 126: '126 = found but not executable', 127: '127 = command not found', 130: '130 = killed by Ctrl+C' }[code] || ''}. See it with: echo $?`, a: () => { H.exit.t.textContent = 'exit ' + code; H.exit.setAttribute('class', (code === 0 ? 'n-ok' : 'n-root') + ' grow mv'); show(H.exit); if (!isB) later(400, () => cl(H.pid, 'dim')); } });
  return steps;
}

/* ================= SCENES ================= */
const SC = {};
const AREA = { x: 8, y: 62, w: 624, h: 266 };
SC.generic = (ctx, r) => {
  const steps = [];
  const reads = ctx.events.filter(e => e.type === 'read').slice(0, 4);
  const prog = node(V.g, 250, 150, r.name, r.kind === 'builtin' ? 'plain' : 'proc', { w: 140, h: 44, sub: r.kind === 'builtin' ? 'inside bash' : 'PID ' + (r.pid || '') });
  const term = node(V.g, 470, 140, 'terminal', 'plain', { w: 150, h: 64, sub: '/dev/pts/0' });
  const files = reads.map((e, i) => node(V.g, 20, 90 + i * 50, trunc(baseName(e.path), 18), 'file'));
  const outW = curve(V.g, 390, 172, 470, 172, 'arr', 0, 'ahb'); hide(outW); outW.classList.add('fade');
  txt(V.g, 430, 162, 'fd 1', 'lbl-m', 'middle');
  if (reads.length) steps.push({ t: 'open() + read() input files', d: `The kernel opens ${reads.map(e => e.path).join(', ')} and returns a file descriptor; read() copies bytes into the program's memory.`, a: () => files.forEach(f => { const pth = curve(V.g, f._x + f.w, f.cy(), 250, 172, 'wire', -10); packet(V.g, pth, null, 'pk-g', 600); cl(f, 'hl'); }) });
  const outs = lines(r.out || '').slice(0, 4);
  steps.push({ t: 'write() to stdout', d: outs.length ? `${r.name} calls write(1, …) — fd 1 is your terminal.` : 'The program has nothing to print.', a: () => { show(outW); if (outs.length) stagger(outs, 160, (o) => packet(V.g, outW, trunc(o, 18), 'pk', 650)); } });
  return steps;
};
/* ---- file tree ---- */
SC.tree = (ctx, r) => {
  const evs = ctx.events, steps = [];
  const created = evs.filter(e => e.type === 'create').slice(0, 6), deleted = evs.filter(e => e.type === 'delete').slice(0, 6);
  const cd = evs.find(e => e.type === 'cd'), list = evs.find(e => e.type === 'list'), pwdE = evs.find(e => e.type === 'pwd'), touched = evs.filter(e => e.type === 'touch');
  const focus = list ? list.path : cd ? cd.to : created[0] ? parentPath(created[0].path) : deleted[0] ? parentPath(deleted[0].path) : (touched[0] ? parentPath(touched[0].path) : S.cwd);
  const show_ = new Map(); show_.set('/', { k: 'd' });
  const chain = p => { let acc = ''; for (const c of p.split('/').filter(Boolean)) { acc += '/' + c; if (!show_.has(acc)) show_.set(acc, { k: (lookup(acc, false).n || { t: 'd' }).t }); } };
  chain(ctx.cwd0); chain(focus); if (cd) chain(cd.to);
  const fr = lookup(focus);
  let kids = fr.n && fr.n.t === 'd' ? Object.keys(dirOf(fr.n).ent).sort() : [];
  if (!(list && list.names.some(n => n.startsWith('.') && n !== '.' && n !== '..'))) kids = kids.filter(k => !k.startsWith('.'));
  kids.slice(0, 9).forEach(k => { const p = (focus === '/' ? '' : focus) + '/' + k; if (!show_.has(p)) show_.set(p, { k: (lookup(p, false).n || {}).t || 'f' }); });
  for (const e of created) { chain(parentPath(e.path)); show_.set(e.path, { k: e.kind, st: 'new' }); }
  for (const e of deleted) { chain(parentPath(e.path)); show_.set(e.path, { k: e.kind || 'f', st: 'del' }); }
  const kidsOf = p => [...show_.keys()].filter(q => q !== p && parentPath(q) === p).sort((a, b) => { const da = show_.get(a).k === 'd', db = show_.get(b).k === 'd'; return da !== db ? (da ? -1 : 1) : a.localeCompare(b); });
  const rows = []; const walk = (p, d) => { rows.push({ p, d }); for (const c of kidsOf(p)) walk(c, d + 1); }; walk('/', 0);
  const rh = Math.min(22, 262 / rows.length), N = {};
  rows.forEach((row, i) => {
    const info = show_.get(row.p); const nm = row.p === '/' ? '/' : baseName(row.p) + (info.k === 'd' ? '/' : '');
    const x = 14 + row.d * 22, y = AREA.y + i * rh;
    if (row.p !== '/') { const pr = N[parentPath(row.p)]; if (pr) E('path', { d: `M${pr._x + 8},${pr._y + rh - 2} V${y + rh / 2} H${x}`, class: 'wire-s', style: 'opacity:.5' }); }
    const g = node(V.g, x, y, nm, info.k === 'd' ? 'dir' : info.k === 'l' ? 'link' : 'file', { h: Math.max(14, rh - 3) });
    g.t.setAttribute('y', Math.max(14, rh - 3) / 2 + 4);
    if (info.st === 'new') g.classList.add('grow', 'hid');
    N[row.p] = g;
  });
  const markAt = p => { const g = N[p]; return g ? [g._x + g.w + 8, g._y] : [400, 70]; };
  const mk = node(V.g, ...markAt(ctx.cwd0), '◀ you are here', 'ok', { h: Math.max(14, rh - 3) }); mk.t.setAttribute('y', Math.max(14, rh - 3) / 2 + 4);
  cl(N[ctx.cwd0], 'cur');
  if (cd) {
    steps.push({ t: 'stat(): is the target a directory?', d: `The shell checks that ${cd.to} exists, is a directory, and that you have x (search) permission on it.`, a: () => cl(N[cd.to], 'hl') });
    steps.push({ t: 'chdir(): update current directory', d: `The shell process's working directory changes from ${cd.from} to ${cd.to} (and $PWD / $OLDPWD are updated).`, a: () => { cl(N[cd.from], 'cur', false); cl(N[cd.to], 'cur'); const [x, y] = markAt(cd.to); pos(mk, x, y); } });
  }
  if (list) {
    const kg = kidsOf(focus).map(p => N[p]).filter(Boolean);
    steps.push({ t: 'openat() the directory', d: `ls opens ${focus} with O_DIRECTORY and gets a file descriptor.`, a: () => cl(N[focus], 'hl') });
    steps.push({ t: 'getdents64(): read directory entries', d: `A directory is just a table of name → inode number. ls reads ${list.names.length} entr${list.names.length === 1 ? 'y' : 'ies'}${r.words && r.words.some(w => /^-\w*l/.test(w)) ? ', then calls stat() on each one to get size, owner and permissions' : ''}.`, a: () => stagger(kg, 110, g => { cl(g, 'hl'); later(500, () => cl(g, 'hl', false)); }) });
  }
  if (pwdE && !cd && !list) {
    const ch = ['/'].concat((() => { let a = '', o = []; for (const c of S.cwd.split('/').filter(Boolean)) { a += '/' + c; o.push(a); } return o; })());
    steps.push({ t: 'Read the shell\'s working directory', d: 'pwd is a builtin: bash just prints the directory it keeps in $PWD (the kernel tracks it too — see /proc/self/cwd).', a: () => stagger(ch.map(p => N[p]).filter(Boolean), 150, g => cl(g, 'hl')) });
  }
  created.forEach(e => {
    const ino = lookup(e.path, false).ino;
    steps.push({ t: e.kind === 'd' ? `mkdir("${baseName(e.path)}")` : `openat(…O_CREAT) “${baseName(e.path)}”`, d: `The kernel allocates a new inode${ino ? ' (#' + ino + ')' : ''}, then adds a “${baseName(e.path)}” → inode entry to ${parentPath(e.path)}.`, a: () => { show(N[e.path]); cl(N[e.path], 'hl'); } });
  });
  touched.forEach(e => steps.push({ t: 'utimensat(): update timestamps', d: `${baseName(e.path)} already existed, so touch only changes its modification time to “now”.`, a: () => cl(N[e.path], 'hl') }));
  deleted.forEach(e => steps.push({ t: `unlink${e.kind === 'd' ? 'at(AT_REMOVEDIR)' : '()'}: remove “${baseName(e.path)}”`, d: `The directory entry is deleted. ${e.kind === 'd' ? 'For -r, rm first empties the folder, deepest files first.' : 'When no names and no open handles remain, the inode and its data blocks are marked free (not wiped!).'}`, a: () => { cl(N[e.path], 'del'); later(700, () => cl(N[e.path], 'gone')); } }));
  if (!steps.length) steps.push({ t: 'Look at the tree', d: `Current directory: ${S.cwd}`, a: () => cl(N[S.cwd], 'hl') });
  return steps;
};
/* ---- copy / move ---- */
SC.copy = (ctx, r) => {
  const evs = ctx.events.filter(e => e.type === 'copy' || e.type === 'move').slice(0, 4);
  if (!evs.length) return SC.generic(ctx, r);
  const steps = []; const mv = evs[0].type === 'move';
  const sd = parentPath(evs[0].src), dd = parentPath(evs[0].dst);
  const L = node(V.g, 16, 70, trunc(sd + '/', 30), 'dir', { w: 230, h: 250 }); L.t.setAttribute('y', 18);
  const R = node(V.g, 394, 70, trunc(dd + '/', 30), 'dir', { w: 230, h: 250 }); R.t.setAttribute('y', 18);
  const items = evs.map((e, i) => {
    const y = 110 + i * 52, kind = e.kind === 'd' ? 'dir' : 'file';
    const s = node(V.g, 40, y, trunc(baseName(e.src) + (e.kind === 'd' ? '/' : ''), 22), kind, { sub: 'inode #' + e.ino, h: 34, min: 150 });
    const d = node(V.g, 418, y, trunc(baseName(e.dst) + (e.kind === 'd' ? '/' : ''), 22), kind, { sub: 'inode #' + e.newIno + (mv && e.samefs ? ' (same)' : ' (new)'), h: 34, min: 150, cls: 'ghost' });
    hide(d); d.classList.add('fade');
    const path = curve(V.g, 40 + s.w, y + 17, 418, y + 17, 'wire', -40);
    return { e, s, d, path };
  });
  steps.push({ t: 'stat() the destination', d: parentPath(evs[0].dst) !== parentPath(evs[0].src) ? `Is “${baseName(parentPath(evs[0].dst))}/” an existing directory? Yes → the file keeps its name inside it: ${evs[0].dst}.` : `“${baseName(evs[0].dst)}” is not an existing directory → it becomes the new name.`, a: () => cl(R, 'hl') });
  if (mv && evs[0].samefs) {
    steps.push({ t: 'renameat2(): move the directory entry', d: 'Same filesystem → no data is copied! The kernel removes the name from the old directory and adds it to the new one. The inode (and all data) stays put — that is why mv is instant even for huge files.', a: () => items.forEach(it => { const g = it.s; tween(900, k => { const p = it.path.getPointAtLength(it.path.getTotalLength() * k); pos(g, p.x - g.w / 2, p.y - 17); }); }) });
    steps.push({ t: 'Source name is gone, inode unchanged', d: `Inode #${evs[0].ino} now has the name ${evs[0].dst}.`, a: () => items.forEach(it => { cl(it.s, 'hl'); if (it.s.s) it.s.s.textContent = 'inode #' + it.e.ino + ' (same!)'; }) });
    return steps;
  }
  steps.push({ t: 'open() source → fd 3', d: 'The source is opened read-only. Its inode is untouched — the original stays exactly as it was.', a: () => items.forEach(it => cl(it.s, 'hl')) });
  steps.push({ t: 'create destination → new inode (fd 4)', d: `open(…, O_WRONLY|O_CREAT) makes a brand-new inode (#${evs[0].newIno}). Different inode number = a real, independent copy.`, a: () => items.forEach(it => show(it.d)) });
  steps.push({ t: 'read() / write() loop', d: 'Chunks are read from fd 3 and written to fd 4 until end-of-file (modern cp may use copy_file_range so the kernel copies without user-space buffers).', a: () => items.forEach(it => stagger([0, 1, 2], 220, () => packet(V.g, it.path, null, 'pk', 700))) });
  steps.push({ t: 'close() both; copy mode bits', d: 'Permission bits are copied; owner becomes you and timestamps become “now” unless you use -p or -a.', a: () => items.forEach(it => { cl(it.d, 'ghost', false); cl(it.d, 'hl'); }) });
  if (mv) steps.push({ t: 'unlink() the source (cross-filesystem move)', d: 'Different filesystems cannot share inodes, so mv copied the data and now deletes the original.', a: () => items.forEach(it => { cl(it.s, 'del'); later(600, () => cl(it.s, 'gone')); }) });
  return steps;
};
/* ---- permissions ---- */
function permGrid(par, x, y, mode, opt = {}) {
  const G = { cells: {}, oct: [] };
  const rowsL = ['Owner (u)', 'Group (g)', 'Others (o)'];
  ['r', 'w', 'x'].forEach((c, i) => txt(par, x + 118 + i * 46, y - 8, c + ' = ' + [4, 2, 1][i], 'lbl-m', 'middle'));
  txt(par, x + 268, y - 8, 'octal', 'lbl-m', 'middle');
  rowsL.forEach((lbl, ri) => {
    txt(par, x, y + ri * 38 + 20, lbl, '');
    ['r', 'w', 'x'].forEach((c, ci) => { const on = (mode >> ((2 - ri) * 3)) & (4 >> ci); const g = node(par, x + 96 + ci * 46, y + ri * 38, c, on ? 'perm' : 'plain', { w: 42, h: 30 }); g.setAttribute('class', (on ? 'on-bit' : 'off-bit') + ' mv'); G.cells[ri + c] = g; });
    G.oct[ri] = txt(par, x + 268, y + ri * 38 + 21, String((mode >> ((2 - ri) * 3)) & 7), 'ttl t-purple', 'middle');
  });
  G.str = txt(par, x, y + 132, modeStr({ t: opt.t || 'f', mode }) + '   (' + (mode & 0o7777).toString(8).padStart(4, '0') + ')', 'ttl');
  G.set = (m) => { rowsL.forEach((l, ri) => { ['r', 'w', 'x'].forEach((c, ci) => { const on = (m >> ((2 - ri) * 3)) & (4 >> ci); G.cells[ri + c].setAttribute('class', (on ? 'on-bit' : 'off-bit') + ' mv'); }); G.oct[ri].textContent = String((m >> ((2 - ri) * 3)) & 7); }); G.str.textContent = modeStr({ t: opt.t || 'f', mode: m }) + '   (' + (m & 0o7777).toString(8).padStart(4, '0') + ')'; };
  G.flipRow = (old, m, ri) => { ['r', 'w', 'x'].forEach((c, ci) => { const b = 4 >> ci, sh = (2 - ri) * 3; if (((old >> sh) & b) !== ((m >> sh) & b)) { const g = G.cells[ri + c]; g.setAttribute('class', (((m >> sh) & b) ? 'on-bit' : 'off-bit') + ' mv flip'); } }); G.oct[ri].textContent = String((m >> ((2 - ri) * 3)) & 7); };
  return G;
}
SC.perm = (ctx, r) => {
  const e = ctx.events.find(e => ['chmod', 'chown', 'umask', 'acl'].includes(e.type));
  const steps = [];
  if (!e) return SC.generic(ctx, r);
  if (e.type === 'umask') {
    const m = e.mask; const fileM = 0o666 & ~m, dirM = 0o777 & ~m;
    txt(V.g, 20, 84, `umask = ${m.toString(8).padStart(4, '0')}  →  bits to REMOVE from new files`, 'ttl t-purple');
    const G = permGrid(V.g, 20, 120, 0o666);
    const side = E('g', {}, V.g); side.classList.add('fade');
    txt(side, 360, 140, `files:  666 − ${m.toString(8).padStart(3, '0')} → ${fileM.toString(8)}`, 'ttl'); txt(side, 360, 170, `dirs:   777 − ${m.toString(8).padStart(3, '0')} → ${dirM.toString(8)}`, 'ttl'); txt(side, 360, 200, '(really a bitwise AND NOT, not subtraction)', 'lbl-m'); hide(side);
    steps.push({ t: 'Start from the default 666 (files)', d: 'Programs ask for rw-rw-rw- (666) for new files and rwxrwxrwx (777) for directories; nobody gets x on files by default.', a: () => {} });
    steps.push({ t: `Apply mask ${m.toString(8).padStart(3, '0')}`, d: 'Every bit that is 1 in the umask is switched off in the new file\'s mode.', a: () => { [0, 1, 2].forEach(ri => G.flipRow(0o666, fileM, ri)); G.str.textContent = modeStr({ t: 'f', mode: fileM }) + `   (${fileM.toString(8)})`; show(side); } });
    if (e.old !== e.mask) steps.push({ t: 'Shell stores the new umask', d: `umask is a builtin: it changes the shell process\'s mask (inherited by every child). Old: ${e.old.toString(8).padStart(4, '0')}, new: ${e.mask.toString(8).padStart(4, '0')}. Put it in ~/.bashrc to make it permanent.`, a: () => {} });
    return steps;
  }
  if (e.type === 'chown') {
    const G = permGrid(V.g, 20, 140, e.mode);
    txt(V.g, 20, 84, baseName(e.path), 'ttl');
    const ow = node(V.g, 360, 120, 'owner: ' + e.old.u, 'perm', { w: 210 }), gr = node(V.g, 360, 160, 'group: ' + e.old.g, 'perm', { w: 210 });
    steps.push({ t: 'Only root may give files away', d: 'Changing the owner needs root (otherwise users could dodge disk quotas or plant files on others). Changing the group is allowed for the owner if they are in the new group.', a: () => {} });
    steps.push({ t: 'fchownat(): update the inode\'s UID/GID', d: `Owner ${e.old.u} → ${e.now.u}, group ${e.old.g} → ${e.now.g}. The rwx bits do not change; who they apply to does.`, a: () => { ow.t.textContent = 'owner: ' + e.now.u; gr.t.textContent = 'group: ' + e.now.g; cl(ow, 'hl', e.old.u !== e.now.u); cl(gr, 'hl', e.old.g !== e.now.g); } });
    return steps;
  }
  if (e.type === 'acl') {
    const G = permGrid(V.g, 20, 120, e.mode);
    txt(V.g, 20, 84, baseName(e.path) + '  — classic bits + ACL entries', 'ttl');
    const acls = Object.entries(e.acl || {});
    const gs = acls.map(([k, v], i) => { const g = node(V.g, 380, 110 + i * 36, `${k.startsWith('u') ? 'user' : 'group'}:${k.slice(2)}:${v}`, 'perm', { w: 210 }); g.classList.add('grow', 'hid'); return g; });
    if (!acls.length) txt(V.g, 380, 130, 'no extra ACL entries', 'lbl-m');
    steps.push({ t: e.show ? 'getxattr("system.posix_acl_access")' : 'setxattr(): store ACL in extended attributes', d: 'ACLs live in an extended attribute of the inode. They add per-user / per-group entries beyond owner/group/others; ls -l shows a “+”.', a: () => gs.forEach(g => { show(g); cl(g, 'hl'); }) });
    return steps;
  }
  const G = permGrid(V.g, 20, 120, e.old, { t: e.kind });
  txt(V.g, 20, 84, `chmod ${e.spec}  ${baseName(e.path)}`, 'ttl');
  const special = (e.mode & 0o7000) | (e.old & 0o7000);
  const sp = node(V.g, 380, 120, [e.mode & 0o4000 ? 'setuid' : '', e.mode & 0o2000 ? 'setgid' : '', e.mode & 0o1000 ? 'sticky' : ''].filter(Boolean).join(' + ') || 'special bits off', 'perm', { w: 220 }); hide(sp); sp.classList.add('fade');
  steps.push({ t: 'stat(): read the current mode', d: `Current: ${modeStr({ t: e.kind, mode: e.old })} = ${(e.old & 0o7777).toString(8).padStart(4, '0')}. Only the owner (or root) may change it.`, a: () => {} });
  steps.push({ t: /^[0-7]+$/.test(e.spec) ? 'Octal: each digit = r(4)+w(2)+x(1)' : `Symbolic: ${e.spec}`, d: /^[0-7]+$/.test(e.spec) ? `${e.spec.padStart(3, '0').slice(-3).split('').map((d, i) => `${['owner', 'group', 'others'][i]} ${d} = ${['r', 'w', 'x'].filter((c, k) => +d & (4 >> k)).join('+') || 'nothing'}`).join(', ')}` : 'u/g/o/a pick WHO; + adds, - removes, = sets exactly; r/w/x pick WHICH bits. Untouched bits keep their old value.', a: () => {} });
  [0, 1, 2].forEach(ri => { const sh = (2 - ri) * 3; if (((e.old >> sh) & 7) !== ((e.mode >> sh) & 7)) steps.push({ t: `Flip ${['owner', 'group', 'others'][ri]} bits`, d: `${['owner', 'group', 'others'][ri]}: ${(e.old >> sh) & 7} → ${(e.mode >> sh) & 7}`, a: () => G.flipRow(e.old, e.mode, ri) }); });
  steps.push({ t: 'fchmodat(): write mode into the inode', d: `New mode ${modeStr({ t: e.kind, mode: e.mode })} (${(e.mode & 0o7777).toString(8).padStart(4, '0')}). Only metadata changes — file content is untouched.`, a: () => { G.set(e.mode); if (special) show(sp); } });
  return steps;
};
/* ---- processes & signals ---- */
SC.proc = (ctx, r) => {
  const evs = ctx.events, steps = [];
  const sig = evs.filter(e => e.type === 'signal'), spawn = evs.filter(e => e.type === 'spawn'), ps = evs.find(e => e.type === 'ps' || e.type === 'jobs'), fgbg = evs.find(e => e.type === 'fg' || e.type === 'bg');
  const shell = node(V.g, 16, 160, 'bash', 'proc', { w: 100, h: 44, sub: 'PID 1200 (shell)' });
  let pids = [];
  if (ps) pids = ps.pids.filter(p => p !== 1200);
  sig.forEach(s => pids.includes(s.pid) || pids.unshift(s.pid));
  spawn.forEach(s => pids.includes(s.pid) || pids.push(s.pid));
  if (fgbg && !pids.includes(fgbg.pid)) pids.push(fgbg.pid);
  if (pids.length < 4) for (const p of S.procs) if (pids.length < 6 && p.pid !== 1200 && !pids.includes(p.pid) && p.pid > 300) pids.push(p.pid);
  pids = pids.slice(0, 9);
  const B = {};
  pids.forEach((pid, i) => {
    const p = procBy(pid) || { comm: (sig.find(s => s.pid === pid) || spawn.find(s => s.pid === pid) || {}).name || '?', st: 'S', ni: 0 };
    const x = 170 + (i % 3) * 152, y = 70 + Math.floor(i / 3) * 86;
    const g = node(V.g, x, y, trunc(p.comm || '?', 14), 'proc', { w: 140, h: 50, sub: `PID ${pid}` });
    g.badge = txt(g, 128, 15, p.st || 'S', 'ttl t-orange', 'end');
    if (spawn.some(s => s.pid === pid)) g.classList.add('grow', 'hid');
    B[pid] = g;
  });
  txt(V.g, 170, 340 - 10, 'States: R running · S sleeping · T stopped · Z zombie', 'lbl-m');
  const toShell = g => curve(V.g, shell._x + shell.w, shell.cy(), g._x, g.cy(), 'wire', -30);
  if (ps && !sig.length) steps.push({ t: ps.type === 'jobs' ? 'Shell lists its job table' : 'Read /proc/<PID>/ for each process', d: ps.type === 'jobs' ? 'jobs is a builtin: bash keeps its own list of background/stopped children.' : `${r.name} walks the numbered folders in /proc (one per process) and reads status, cmdline and stat files.`, a: () => stagger(Object.values(B), 120, g => cl(g, 'hl')) });
  spawn.forEach(s => {
    const g = B[s.pid]; if (!g) return;
    steps.push({ t: 'fork(): the shell clones itself', d: `The kernel creates child PID ${s.pid} (parent = 1200). It inherits the shell's environment, open files and working directory.`, a: () => { show(g); const pth = toShell(g); packet(V.g, pth, null, 'pk-b', 600); } });
    steps.push({ t: `exec(): child becomes ${s.name}`, d: `& means: do NOT wait. The shell prints [${s.job}] ${s.pid} and gives you the prompt back immediately while ${s.name} runs in the background.${s.done ? ' (This one finished at once → “Done”.)' : ''}`, a: () => { txt(V.g, g._x + 4, g._y - 4, `job [${s.job}] &`, 'lbl-m'); if (s.done) later(500, () => cl(g, 'dim')); } });
  });
  sig.forEach(s => {
    const g = B[s.pid]; if (!g) return;
    const pth = toShell(g);
    steps.push({ t: `kill(${s.pid}, SIG${s.sig})`, d: `A signal is a tiny notification delivered by the kernel. SIG${s.sig} = ${{ TERM: '15: please terminate (can be caught for cleanup)', KILL: '9: kill now (cannot be caught or ignored)', INT: '2: interrupt (what Ctrl+C sends)', HUP: '1: hang-up (terminal closed / reload config)', STOP: '19: pause (cannot be caught)', CONT: '18: continue a stopped process', TSTP: '20: terminal stop (Ctrl+Z)', QUIT: '3: quit with core dump' }[s.sig] || s.sig}.`, a: () => packet(V.g, pth, 'SIG' + s.sig, s.sig === 'KILL' ? 'pk-r' : 'pk', 800) });
    const R = {
      term: ['Process cleans up, then exits', 'SIGTERM is polite: the program runs its handler (flush files, remove temp files, close connections) and exits. Parent collects the exit status.', () => { g.badge.textContent = '…'; if (g.s) g.s.textContent = 'cleaning up…'; later(700, () => { cl(g, 'dim'); g.badge.textContent = 'X'; }); }],
      kill: ['Kernel destroys it instantly', 'SIGKILL never reaches the program: the kernel frees its memory and closes its files immediately. No cleanup → temp/lock files may be left behind.', () => { cl(g, 'del'); const x = g._x + 70, y = g.cy(); E('path', { d: `M${x - 14},${y - 14} L${x + 14},${y + 14} M${x + 14},${y - 14} L${x - 14},${y + 14}`, class: 'bigx' }); later(500, () => cl(g, 'gone')); }],
      ignored: ['Signal ignored!', 'This program catches/ignores SIGTERM and keeps running. Escalate with kill -9 (SIGKILL), which cannot be ignored.', () => { cl(g, 'hl'); if (g.s) g.s.textContent = 'ignored SIGTERM'; }],
      stop: ['Process paused (state T)', 'SIGSTOP/SIGTSTP freezes the process; it keeps its memory but gets no CPU. Resume with SIGCONT, fg or bg.', () => { g.badge.textContent = 'T'; cl(g, 'dim'); }],
      cont: ['Process resumes', 'SIGCONT puts it back in the run queue.', () => { g.badge.textContent = 'S'; cl(g, 'dim', false); }],
      denied: ['EPERM: not your process', 'Ordinary users may only signal their own processes. Use sudo for others.', () => { cl(g, 'hl'); packet(V.g, pth, 'EPERM', 'pk-r', 500); }],
      handled: ['Signal delivered', 'The program\'s signal handler decides what to do.', () => cl(g, 'hl')],
    }[s.result] || ['Delivered', '', () => {}];
    steps.push({ t: R[0], d: R[1], a: R[2] });
  });
  if (fgbg) { const g = B[fgbg.pid]; if (g) steps.push({ t: fgbg.type === 'fg' ? 'fg: job moves to the foreground' : 'bg: stopped job continues in background', d: fgbg.type === 'fg' ? 'The shell gives the terminal to the job (it can read your keyboard now) and waits for it. Ctrl+Z would stop it again.' : 'bg sends SIGCONT; the job runs but the terminal stays yours.', a: () => { g.badge.textContent = 'S'; cl(g, 'dim', false); if (fgbg.type === 'fg') pos(g, 20, 240); } }); }
  if (!steps.length) steps.push({ t: 'Processes', d: 'Each box is a running program with its own PID.', a: () => {} });
  return steps;
};
/* ---- pipes ---- */
SC.pipe = (ctx) => {
  const p = ctx.pipes[ctx.pipes.length - 1]; const cmds = p.cmds.slice(0, 4); const n = cmds.length, steps = [];
  const gap = 32, w = Math.min(130, (600 - gap * (n - 1)) / n);
  const B = cmds.map((c, i) => { const g = node(V.g, 16 + i * (w + gap), 110, trunc(c.name || '?', 14), 'proc', { w, h: 50, sub: 'PID ' + (c.pid || '?') }); g.classList.add('grow', 'hid'); return g; });
  const pipes = B.slice(0, -1).map((b, i) => { const x1 = b._x + w, x2 = B[i + 1]._x; const pr = E('g', { class: 'fade' }); E('rect', { x: x1 + 3, y: 126, width: x2 - x1 - 6, height: 18, rx: 4, style: 'fill:color-mix(in srgb,var(--purple) 25%,var(--panel));stroke:var(--purple)' }, pr); hide(pr); return { pr, path: E('path', { d: `M${x1},135 L${x2},135`, class: 'wire', style: 'opacity:0' }) }; });
  const term = node(V.g, B[n - 1]._x, 250, 'terminal', 'plain', { w: Math.max(w, 120), h: 46 }); hide(term); term.classList.add('fade');
  const down = E('path', { d: `M${B[n - 1].cx()},160 L${B[n - 1].cx()},250`, class: 'arr', 'marker-end': 'url(#ahb)' }); hide(down); down.classList.add('fade');
  txt(V.g, 16, 92, 'fd 1 (stdout) of each command → kernel pipe buffer → fd 0 (stdin) of the next', 'lbl-m');
  steps.push({ t: 'pipe(): kernel creates the buffers', d: `${n - 1} pipe${n > 2 ? 's' : ''}: each is a small in-kernel buffer (64 KiB by default) with a write end and a read end.`, a: () => pipes.forEach(x => show(x.pr)) });
  steps.push({ t: `fork() ×${n}: all start at once`, d: 'Every command in a pipeline is its own process and they run concurrently. A reader blocks when the pipe is empty; a writer blocks when it is full.', a: () => B.forEach(show) });
  cmds.slice(0, -1).forEach((c, i) => {
    const ls = lines(c.out || '').slice(0, 3);
    steps.push({ t: `${c.name} → pipe → ${cmds[i + 1].name}`, d: `${c.name} wrote ${lines(c.out || '').length} line(s) to its stdout; ${cmds[i + 1].name} reads them from its stdin. Nothing touches the disk.`, a: () => stagger(ls.length ? ls : ['(empty)'], 200, l => packet(V.g, pipes[i].path, trunc(l, 16), 'pk', 800)) });
  });
  const last = cmds[n - 1];
  steps.push({ t: `${last.name} writes to the terminal`, d: `Only the LAST command's stdout reaches your screen: ${lines(last.out || '').length} line(s).`, a: () => { show(term); show(down); stagger(lines(last.out || '').slice(0, 3), 200, l => packet(V.g, down, trunc(l, 16), 'pk-g', 600)); } });
  return steps;
};
/* ---- redirection ---- */
SC.redirect = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'redir'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  const prog = node(V.g, 30, 150, trunc(r.name, 14), 'proc', { w: 130, h: 50, sub: 'PID ' + (r.pid || '?') });
  const fileG = E('g', {}); const fx = 430, fy = 80;
  E('path', { d: `M${fx},${fy} h130 l26,26 v210 h-156 z`, style: 'fill:color-mix(in srgb,var(--teal) 10%,var(--panel));stroke:var(--teal)' }, fileG);
  txt(fileG, fx + 10, fy + 20, trunc(e.file, 18), 'ttl');
  const termB = node(V.g, 250, 290, 'terminal (screen)', 'plain', { w: 150 });
  const oldL = lines(e.before || '').slice(0, 7), newL = lines(e.data || '').slice(0, 7);
  const bars = (arr, start, cls) => arr.map((l, i) => { const g = E('g', { class: 'fade' }, fileG); E('rect', { x: fx + 10, y: fy + 34 + (start + i) * 24, width: 150, height: 18, rx: 3, style: `fill:${cls}` }, g); txt(g, fx + 14, fy + 47 + (start + i) * 24, trunc(l, 19), ''); return g; });
  if (e.op === '<') {
    const B = bars(newL, 0, 'color-mix(in srgb,var(--teal) 25%,var(--panel))');
    const pth = curve(V.g, fx, 160, 160, 175, 'arr', -30, 'ahb');
    steps.push({ t: 'open(file, O_RDONLY) → dup2() onto fd 0', d: `The SHELL opens ${e.file} before starting ${r.name} and makes it the program's stdin. ${r.name} never sees the file name — it just reads fd 0.`, a: () => cl(prog, 'hl') });
    steps.push({ t: `${r.name} reads stdin`, d: 'Data flows from the file into the program.', a: () => stagger(newL.slice(0, 3), 200, l => packet(V.g, pth, trunc(l, 14), 'pk', 700)) });
    return steps;
  }
  const isErr = e.op.startsWith('2'), app = e.op.endsWith('>>');
  const O = bars(oldL, 0, 'color-mix(in srgb,var(--muted) 25%,var(--panel))');
  const N = bars(newL, app ? oldL.length : 0, app ? 'color-mix(in srgb,var(--green) 28%,var(--panel))' : 'color-mix(in srgb,var(--yellow) 28%,var(--panel))'); N.forEach(hide);
  const toTerm = curve(V.g, 95, 200, 325, 290, 'wire', 60); const toFile = curve(V.g, 160, 170, fx, 160, 'arr', -40, isErr ? 'ahr' : 'ahb'); hide(toFile); toFile.classList.add('fade');
  txt(V.g, 170, 140, isErr ? 'fd 2 (stderr)' : 'fd 1 (stdout)', 'lbl-m');
  steps.push({ t: `open("${trunc(e.file, 16)}", O_WRONLY|O_CREAT|${app ? 'O_APPEND' : 'O_TRUNC'})`, d: app ? '>> opens the file in APPEND mode: every write goes to the end, existing content is kept.' : `> TRUNCATES the file to 0 bytes — before ${r.name} even starts. Old content is gone instantly (that's why “sort f > f” leaves f empty!).`, a: () => { if (!app) O.forEach(g => { g.querySelector('rect').style.fill = 'var(--red)'; later(450, () => cl(g, 'gone')); }); if (e.before == null) txt(fileG, fx + 10, fy + 34 + 14, '(new file created)', 'lbl-m'); } });
  steps.push({ t: `dup2(): ${isErr ? 'fd 2' : 'fd 1'} now points to the file`, d: `The shell rewires the child's ${isErr ? 'stderr' : 'stdout'} from the terminal to the file, then exec()s ${r.name}. The program doesn't know — it just writes to fd ${isErr ? 2 : 1}.`, a: () => { toTerm.style.opacity = .15; show(toFile); } });
  steps.push({ t: `${r.name} writes → bytes land in the file`, d: `${newL.length} line(s) ${app ? 'appended to the end' : 'written'}.`, a: () => { stagger(newL.slice(0, 3), 180, l => packet(V.g, toFile, trunc(l, 14), isErr ? 'pk-r' : 'pk', 700)); later(600, () => N.forEach(show)); } });
  return steps;
};
/* ---- sudo / su gate ---- */
SC.gate = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'sudo' || e.type === 'su'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  const su = e.type === 'su';
  const u = node(V.g, 16, 150, e.user, 'ok', { w: 120, h: 50, sub: `UID ${(S.users[e.user] || {}).uid}` });
  const gate = E('g', {}); E('rect', { x: 220, y: 100, width: 70, height: 150, rx: 8, style: 'fill:color-mix(in srgb,var(--purple) 18%,var(--panel));stroke:var(--purple)' }, gate); txt(gate, 255, 120, su ? 'password' : '/etc/', 'lbl-m', 'middle'); txt(gate, 255, 134, su ? 'check' : 'sudoers', 'lbl-m', 'middle');
  const lock = txt(gate, 255, 185, '🔒', 'ttl', 'middle');
  const tu = e.target || 'root';
  const root = node(V.g, 370, 150, tu, tu === 'root' ? 'root' : 'ok', { w: 120, h: 50, sub: `UID ${(S.users[tu] || { uid: 0 }).uid}` });
  const cmdB = node(V.g, 520, 155, trunc(e.cmd || (su ? 'new shell' : '…'), 12), 'proc', { w: 106, h: 40 }); hide(cmdB); cmdB.classList.add('fade');
  const p1 = E('path', { d: 'M136,175 L370,175', class: 'wire' }), p2 = E('path', { d: 'M490,175 L520,175', class: 'arr', 'marker-end': 'url(#ahb)' });
  if (su) {
    steps.push({ t: 'su is setuid-root', d: '/usr/bin/su has the s bit (-rwsr-xr-x), so it starts with root powers no matter who runs it.', a: () => cl(gate, 'hl') });
    steps.push({ t: `Ask for ${tu}'s password (PAM)`, d: `su asks for the TARGET user's password (not yours). On Ubuntu root has no password, so “su -” fails — use “sudo -i” instead.`, a: () => { lock.textContent = '🔓'; } });
    steps.push({ t: `setuid(${(S.users[tu] || { uid: 0 }).uid}) → start a shell as ${tu}`, d: e.login ? '“su -” starts a LOGIN shell: environment reset, cd to the target\'s home, profile files read.' : 'Without “-”, you keep your current environment and directory — a common source of confusion.', a: () => { packet(V.g, p1, e.user, 'pk', 800); later(700, () => { cl(root, 'hl'); show(cmdB); }); } });
    return steps;
  }
  steps.push({ t: 'sudo starts with root powers', d: '/usr/bin/sudo has the setuid bit and is owned by root, so the kernel runs it with effective UID 0.', a: () => cl(gate, 'hl') });
  steps.push({ t: `Check /etc/sudoers for “${e.user}”`, d: e.ok ? `Allowed: the rule “%sudo ALL=(ALL:ALL) ALL” matches because ${e.user} is in group sudo.` : `${e.user} is not in the sudo group and has no rule in /etc/sudoers → refused, and the attempt is logged to /var/log/auth.log.`, a: () => { lock.textContent = e.ok ? '✅' : '⛔'; if (!e.ok) packet(V.g, p1, e.user, 'pk-r', 700); } });
  if (!e.ok) return steps;
  steps.push({ t: 'Authenticate with YOUR password', d: 'sudo asks for your own password (not root\'s) and caches it for ~15 minutes per terminal.', a: () => {} });
  steps.push({ t: 'setuid(0) + execve() the command', d: `The command “${trunc(e.cmd, 40)}” runs as UID 0 (root) — it can now bypass every permission check. Logged in /var/log/auth.log.`, a: () => { packet(V.g, p1, e.cmd ? trunc(e.cmd.split(' ')[0], 10) : 'cmd', 'pk', 800); later(700, () => { cl(root, 'hl'); show(cmdB); }); } });
  return steps;
};
/* ---- text processing ---- */
SC.text = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'text');
  const tool = r.name; const steps = [];
  let input = e ? e.input : (r.stdin != null ? r.stdin : '');
  if (!input) { const rd = ctx.events.find(e => e.type === 'read'); if (rd) input = readFile(rd.path).data || ''; }
  const out = e ? e.output : (r.out || '');
  const inL = lines(input).slice(0, 7), outL = lines(out).slice(0, 7);
  if (!inL.length) return SC.generic(ctx, r);
  const words = r.words || [];
  const delim = tool === 'cut' ? (e && e.delim) || '\t' : tool === 'awk' && e && e.fs && e.fs !== ' ' ? e.fs : null;
  const split = l => delim ? l.split(delim) : l.split(/(?<=\S)(?=\s)|(?<=\s)(?=\S)/).filter(x => x.trim()).slice(0, 6);
  let selF = [];
  if (tool === 'cut' && e && e.fields) selF = (parseList(e.fields) || []).flatMap(([a, b]) => Array.from({ length: Math.min(b, 8) - a + 1 }, (_, k) => a + k));
  if (tool === 'awk' && e) selF = [...e.prog.matchAll(/\$(\d+)/g)].map(m => +m[1]).filter(Boolean);
  if (tool === 'sort' && words.some(w => w === '-k')) { const k = +words[words.indexOf('-k') + 1]; if (k) selF = [k]; }
  const outSet = outL.map(o => o.trim());
  const kept = inL.map(l => outSet.some(o => o === l.trim() || (o && (l.includes(o) || o.split(/\s+/).every(tk => l.includes(tk))))));
  let re = null;
  const pat = tool === 'grep' ? words.slice(1).find(w => !w.startsWith('-')) : tool === 'sed' && e ? (/s(.)(.*?)\1/.exec(e.prog) || [])[2] : null;
  try { if (pat) re = new RegExp(pat, words.includes('-i') ? 'gi' : 'g'); } catch (x) { re = null; }
  const rh = Math.min(30, 230 / inL.length);
  txt(V.g, 16, 80, 'input (stdin / file)', 'lbl-m'); txt(V.g, 400, 80, 'output (stdout)', 'lbl-m');
  const rows = inL.map((l, i) => {
    const g = E('g', { class: 'fade' }); hide(g); let x = 16; const cells = [];
    split(l).forEach((f, k) => { const c = node(g, x, 88 + i * rh, trunc(f, 16), 'plain', { h: rh - 4, min: 14 }); c.setAttribute('class', 'cell mv'); c.t.setAttribute('y', (rh - 4) / 2 + 4); cells.push(c); x += c.w + 3; });
    return { g, cells, l };
  });
  const outs = outL.map((l, i) => { const g = node(V.g, 400, 88 + i * rh, trunc(l, 30), 'ok', { h: rh - 4, min: 60 }); g.t.setAttribute('y', (rh - 4) / 2 + 4); hide(g); g.classList.add('fade'); return g; });
  steps.push({ t: 'Read input line by line', d: `${tool} processes a stream: it reads one line, handles it, writes the result, then moves to the next. It never needs the whole file in memory.`, a: () => stagger(rows, 90, r => show(r.g)) });
  if (['awk', 'cut'].includes(tool) || (tool === 'sort' && selF.length)) steps.push({ t: 'Split each line into fields', d: delim ? `Field separator: “${delim === '\t' ? 'TAB' : delim}”. Fields are numbered $1, $2, … (awk) / -f1, -f2 (cut).` : 'awk splits on runs of spaces/tabs by default. $0 is the whole line, $1 the first field, NF the number of fields.', a: () => rows.forEach(r => r.cells.forEach((c, k) => { c.t.textContent = `$${k + 1} ${c.t.textContent}`.slice(0, 18); })) });
  if (selF.length) steps.push({ t: `Select field${selF.length > 1 ? 's' : ''} ${selF.join(', ')}`, d: 'Only the chosen columns go to the output.', a: () => rows.forEach(r => r.cells.forEach((c, k) => { if (selF.includes(k + 1)) c.setAttribute('class', 'cell sel mv'); else cl(c, 'dim'); })) });
  if (re && tool === 'sed') steps.push({ t: `Find matches of /${pat}/`, d: 'sed applies its script to every line: s/old/new/ replaces the first match per line (add g for all).', a: () => rows.forEach(r => r.cells.forEach(c => { re.lastIndex = 0; if (re.test(c.t.textContent)) c.setAttribute('class', 'cell mat mv'); })) });
  else if (['grep', 'awk', 'head', 'tail', 'uniq'].includes(tool) || (tool === 'sed' && words.includes('-n'))) steps.push({ t: tool === 'grep' ? `Test each line against /${pat || ''}/` : tool === 'head' ? 'Keep the first N lines' : tool === 'tail' ? 'Keep the last N lines' : tool === 'uniq' ? 'Collapse ADJACENT duplicates' : 'Test the pattern on each line', d: tool === 'grep' ? `Matching lines are printed${words.includes('-v') ? ' (-v inverts: NON-matching lines)' : ''}; the rest are dropped.` : tool === 'uniq' ? 'uniq only compares each line with the one before it — sort first to group duplicates.' : 'Lines that pass go on; others are dropped.', a: () => rows.forEach((r, i) => { if (!kept[i]) cl(r.g, 'dim'); else if (re) r.cells.forEach(c => { re.lastIndex = 0; if (re.test(c.t.textContent)) c.setAttribute('class', 'cell mat mv'); }); }) });
  if (tool === 'tr') steps.push({ t: `Translate characters ${e ? e.from : ''} → ${e ? (e.to || '(delete)') : ''}`, d: 'tr works character by character: each char in SET1 is replaced by the char at the same position in SET2 (or deleted with -d).', a: () => rows.forEach(r => r.cells.forEach(c => c.setAttribute('class', 'cell mat mv'))) });
  if (tool === 'sort') steps.push({ t: 'Compare & reorder lines', d: `sort reads ALL input first (it must see the last line before printing the first), then orders it ${words.some(w => /^-\w*n/.test(w)) ? 'numerically' : 'as text (character by character — so “10” < “9” unless you use -n)'}${words.some(w => /^-\w*r/.test(w)) ? ', reversed' : ''}.`, a: () => {} });
  if (tool === 'wc') { const c = txt(V.g, 400, 120, '0 lines', 'ttl t-blue'); steps.push({ t: 'Count newlines, words and bytes', d: 'wc -l counts newline characters, -w counts whitespace-separated words, -c counts bytes.', a: () => { let k = 0; stagger(rows, 120, r => { k++; c.textContent = `${k} line${k > 1 ? 's' : ''}…`; cl(r.g, 'hl'); }); } }); }
  steps.push({ t: 'Write result to stdout', d: `${lines(out).length} line(s) of output.${e && e.inplace ? ' With -i, sed writes to a temp file and renames it over the original.' : ''}`, a: () => stagger(outs, 110, g => show(g)) });
  return steps;
};
/* ---- tee / xargs ---- */
SC.split = (ctx, r) => {
  const steps = [];
  const te = ctx.events.find(e => e.type === 'tee'), xa = ctx.events.find(e => e.type === 'xargs');
  if (te) {
    const src = node(V.g, 16, 160, 'stdin', 'plain', { w: 90 });
    const t = node(V.g, 210, 150, 'tee', 'proc', { w: 100, h: 44 });
    const outs = [node(V.g, 470, 90, 'stdout → screen / next cmd', 'plain', { w: 160 })].concat(te.files.slice(0, 3).map((f, i) => node(V.g, 470, 160 + i * 50, (te.append ? '>> ' : '> ') + trunc(f, 16), 'file', { w: 160 })));
    const pin = E('path', { d: 'M106,172 L210,172', class: 'arr' });
    const pouts = outs.map(o => curve(V.g, 310, 172, 470, o.cy(), 'arr', 0, 'ahb'));
    const ls = lines(te.data).slice(0, 2);
    steps.push({ t: 'tee reads its stdin', d: 'Like a T-shaped plumbing joint: one stream in…', a: () => stagger(ls.length ? ls : ['…'], 200, l => packet(V.g, pin, trunc(l, 12), 'pk', 500)) });
    steps.push({ t: 'write() each chunk to every output', d: `…several out. Every chunk is written to ${te.files.join(', ') || '(no files)'} ${te.append ? '(append mode, -a)' : '(truncated first)'} AND to stdout.`, a: () => pouts.forEach(p => packet(V.g, p, null, 'pk', 600)) });
    return steps;
  }
  if (xa) {
    const items = xa.items.slice(0, 6);
    const chips = items.map((it, i) => node(V.g, 16, 76 + i * 34, trunc(it, 16), 'file'));
    const cmdB = xa.batches.slice(0, 3).map((b, i) => { const g = node(V.g, 300, 90 + i * 70, trunc(b, 38), 'proc', { h: 40, min: 200 }); g.classList.add('grow', 'hid'); return g; });
    steps.push({ t: 'xargs reads items from stdin', d: `It splits the incoming text on whitespace/newlines: ${xa.items.length} item(s).`, a: () => stagger(chips, 90, c => cl(c, 'hl')) });
    steps.push({ t: 'Build command line(s)', d: `Items are appended as ARGUMENTS (not stdin!) to the command → ${xa.batches.length} command line(s)${xa.batches.length > 1 ? ' (-n / -I limit how many per run)' : ''}.`, a: () => { chips.forEach((c, i) => { const tgt = cmdB[Math.min(cmdB.length - 1, Math.floor(i / Math.max(1, Math.ceil(items.length / cmdB.length))))]; if (tgt) pos(c, tgt._x + 10 + (i % 3) * 30, tgt._y + 8); cl(c, 'dim'); }); } });
    steps.push({ t: 'fork() + exec() for each command line', d: 'Each batch runs as its own process.', a: () => cmdB.forEach(show) });
    return steps;
  }
  return SC.generic(ctx, r);
};
/* ---- links & inodes ---- */
SC.link = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'link' || e.type === 'stat'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  txt(V.g, 20, 80, 'directory entries (names)', 'lbl-m'); txt(V.g, 250, 80, 'inodes (metadata)', 'lbl-m'); txt(V.g, 470, 80, 'data blocks', 'lbl-m');
  if (e.type === 'stat') {
    const nm = node(V.g, 20, 150, trunc(baseName(e.path), 16), e.kind === 'd' ? 'dir' : e.kind === 'l' ? 'link' : 'file');
    const ino = node(V.g, 250, 110, 'inode #' + e.ino, 'perm', { w: 170, h: 130 }); ino.t.setAttribute('y', 18);
    [`mode ${modeStr({ t: e.kind, mode: e.mode })}`, `links ${e.nlink}`, `size ${e.size} B`, 'uid/gid, timestamps', 'pointers → blocks'].forEach((s, i) => txt(ino, 10, 42 + i * 18, s, 'lbl-m'));
    const data = node(V.g, 470, 150, e.kind === 'l' ? `"${trunc(e.tgt, 14)}"` : '▤ ▤ ▤ ▤', 'file', { w: 140 });
    const a1 = curve(V.g, nm._x + nm.w, nm.cy(), 250, 175, 'arr', -20, 'ahp'), a2 = curve(V.g, 420, 175, 470, data.cy(), 'arr', -10, 'ahb');
    steps.push({ t: 'statx(): look up the name → inode', d: `The directory maps “${baseName(e.path)}” to inode #${e.ino}. The NAME is not stored in the inode.`, a: () => packet(V.g, a1, null, 'pk', 600) });
    steps.push({ t: 'Read the inode\'s metadata', d: 'Size, owner, permissions, link count and timestamps all live in the inode.', a: () => cl(ino, 'hl') });
    return steps;
  }
  const t = node(V.g, 20, 120, trunc(baseName(e.target), 16), 'file');
  const L = node(V.g, 20, 210, trunc(baseName(e.link), 16), e.kind === 'sym' ? 'link' : 'file'); L.classList.add('grow', 'hid');
  const ino = node(V.g, 250, 110, 'inode #' + (e.tIno ?? '?'), 'perm', { w: 150, h: 46, sub: `links: ${e.kind === 'hard' ? e.nlink - 1 : e.nlink}` });
  const data = node(V.g, 470, 116, '▤ ▤ ▤  file data', 'file', { w: 150 });
  E('path', { d: `M400,133 L470,128`, class: 'arr', 'marker-end': 'url(#ahb)' });
  const a1 = E('path', { d: `M${t._x + t.w},132 L250,133`, class: 'arr', 'marker-end': 'url(#ahp)' });
  if (e.broken) { cl(t, 'del'); t.t.textContent = baseName(e.target) + ' (missing)'; cl(ino, 'dim'); }
  if (e.kind === 'hard') {
    const a2 = E('path', { d: `M${L._x + 120},222 Q200,200 250,140`, class: 'arr', 'marker-end': 'url(#ahp)' }); hide(a2); a2.classList.add('fade');
    steps.push({ t: 'link(): add a second name', d: `A hard link is just another directory entry pointing at the SAME inode #${e.ino}. Neither name is “the original”.`, a: () => { show(L); show(a2); } });
    steps.push({ t: 'Link count goes up', d: `nlink is now ${e.nlink}. Data is only freed when the count reaches 0 (and no process has it open) — deleting one name leaves the other working.`, a: () => { ino.s.textContent = 'links: ' + e.nlink; cl(ino, 'hl'); } });
  } else {
    const sIno = node(V.g, 250, 210, 'inode #' + e.ino + ' (symlink)', 'link', { w: 170, h: 40 }); sIno.classList.add('grow', 'hid');
    const sData = node(V.g, 470, 214, `"${trunc(e.target, 14)}"`, 'link', { w: 150 }); sData.classList.add('grow', 'hid');
    const back = E('path', { d: `M545,214 Q300,170 ${t._x + t.w},140`, class: e.broken ? 'arr-r' : 'arr', 'stroke-dasharray': '5 4', 'marker-end': `url(#${e.broken ? 'ahr' : 'ahb'})` }); hide(back); back.classList.add('fade');
    steps.push({ t: 'symlink(): create a NEW inode', d: `A symbolic link gets its own inode #${e.ino} of type “link”. Its content is just the text “${e.target}”.`, a: () => { show(L); show(sIno); show(sData); } });
    steps.push({ t: e.broken ? 'Target missing → dangling link!' : 'Following the link: resolve the path text', d: e.broken ? 'The link is created anyway — the kernel stores text, not a reference. Opening it fails with “No such file or directory” until the target exists.' : 'When a program opens the link, the kernel reads the stored path and looks THAT name up. Rename or delete the target and the link breaks; the target\'s link count is unchanged.', a: () => show(back) });
  }
  return steps;
};
/* ---- strace ---- */
SC.strace = (ctx) => {
  const e = ctx.events.find(e => e.type === 'strace'); const steps = [];
  if (!e) return [];
  E('rect', { x: 8, y: 66, width: 624, height: 120, class: 'lane' }); E('rect', { x: 8, y: 196, width: 624, height: 128, class: 'lane-k' });
  E('path', { d: 'M8,191 L632,191', class: 'sep' });
  txt(V.g, 14, 82, 'USER SPACE — ' + trunc(e.cmd, 40), 'lbl-m'); txt(V.g, 14, 318, 'KERNEL SPACE (syscall handlers, VFS, drivers)', 'lbl-m');
  const calls = e.calls.filter(c => !['lib', 'mem'].includes(c[2])).slice(0, 8);
  const w = 616 / Math.max(1, calls.length);
  const items = calls.map((c, i) => { const x = 12 + i * w + w / 2; const nm = c[0].split('(')[0]; const g = E('g', { class: 'fade' }); hide(g); txt(g, x, 100 + (i % 2) * 14, nm, 'ttl', 'middle'); const down = E('path', { d: `M${x - 8},120 L${x - 8},250`, class: 'arr', 'marker-end': 'url(#ahb)' }, g); const up = E('path', { d: `M${x + 8},250 L${x + 8},128`, class: c[1].startsWith('-1') ? 'arr-r' : 'arr-g', 'marker-end': `url(#${c[1].startsWith('-1') ? 'ahr' : 'ahg'})` }, g); txt(g, x, 270 + (i % 2) * 14, '= ' + trunc(c[1], 12), c[1].startsWith('-1') ? 't-red' : 'lbl-m', 'middle'); return { c, g, down, up }; });
  const chunk = 2;
  for (let i = 0; i < items.length; i += chunk) {
    const part = items.slice(i, i + chunk);
    steps.push({ t: part.map(p => p.c[0].split('(')[0]).join(' → '), d: part.map(p => `${trunc(p.c[0], 70)} = ${p.c[1]}`).join('\n'), a: () => part.forEach(p => { show(p.g); packet(V.g, p.down, null, 'pk-b', 450, false, () => packet(V.g, p.up, null, p.c[1].startsWith('-1') ? 'pk-r' : 'pk-g', 450)); }) });
  }
  return steps;
};
/* ---- lsof / ss ---- */
SC.lsof = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'lsof' || e.type === 'ss'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  if (e.type === 'ss') {
    const k = node(V.g, 250, 180, 'kernel socket table', 'perm', { w: 150, h: 40 });
    const items = e.rows.slice(0, 6).map((s, i) => { const a = (i / Math.max(1, Math.min(6, e.rows.length))) * Math.PI * 2 - Math.PI / 2; const g = node(V.g, 325 + Math.cos(a) * 230 - 70, 200 + Math.sin(a) * 110 - 12, `:${s.port} ${s.proc}`, 'proc', { w: 140 }); hide(g); g.classList.add('fade'); return g; });
    steps.push({ t: 'Ask the kernel via netlink (sock_diag)', d: 'ss queries the kernel directly for every socket: listening ports, established connections, and (with -p) which process owns each.', a: () => stagger(items, 120, g => show(g)) });
    return steps;
  }
  const rows = e.rows; const pid = rows[0] && rows[0].pid; const byPid = rows.filter(x => x.pid === pid).slice(0, 9);
  const pg = node(V.g, 250, 180, `${rows[0] ? rows[0].comm : '?'}`, 'proc', { w: 140, h: 44, sub: 'PID ' + pid });
  const items = byPid.map((x, i) => { const a = (i / byPid.length) * Math.PI * 2 - Math.PI / 2; const nx = 320 + Math.cos(a) * 240 - 75, ny = 202 + Math.sin(a) * 112 - 12; const kind = x.type === 'DIR' ? 'dir' : x.type === 'REG' ? 'file' : x.type.startsWith('IPv') ? 'proc' : 'plain'; const g = node(V.g, nx, ny, trunc(`${x.fd}: ${baseName(x.name)}`, 22), kind, { w: 150 }); hide(g); g.classList.add('fade'); const ln = line(V.g, 320, 202, nx + 75, ny + 12, 'wire'); hide(ln); ln.classList.add('fade'); return { g, ln }; });
  steps.push({ t: `Read /proc/${pid}/fd/`, d: 'Every open file, pipe, terminal and network socket of a process appears as a numbered link in /proc/PID/fd. lsof reads them all (plus cwd and the program text, “txt”).', a: () => stagger(items, 120, it => { show(it.g); show(it.ln); }) });
  steps.push({ t: 'Classify: files, dirs, sockets, terminals', d: 'FD column: number + mode (r/w/u). TYPE: REG file, DIR directory, IPv4/IPv6 socket, CHR character device (terminal). 0/1/2 are stdin/stdout/stderr.', a: () => items.forEach(it => cl(it.g, 'hl')) });
  return steps;
};
/* ---- scheduler / nice ---- */
SC.sched = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'nice'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  const list = S.procs.filter(p => p.cpu > 0.2 || p.pid === e.pid).slice(0, 5);
  if (!list.find(p => p.pid === e.pid)) list.push({ pid: e.pid, comm: e.name, ni: e.ni });
  const weight = n => 1024 / Math.pow(1.25, n);
  const order = ni => list.slice().sort((a, b) => ((a.pid === e.pid ? ni : a.ni) - (b.pid === e.pid ? ni : b.ni)));
  const cpu = node(V.g, 520, 150, 'CPU', 'ok', { w: 100, h: 60, sub: 'time slices' });
  txt(V.g, 16, 80, 'run queue (lower nice = higher priority = bigger CPU share)', 'lbl-m');
  const B = {}; const bars = {};
  const lay = ni => { const o = order(ni); const tot = o.reduce((s, p) => s + weight(p.pid === e.pid ? ni : p.ni), 0); o.forEach((p, i) => { pos(B[p.pid], 16, 92 + i * 46); const wv = weight(p.pid === e.pid ? ni : p.ni) / tot; bars[p.pid].setAttribute('width', Math.max(4, wv * 220)); bars[p.pid].setAttribute('y', 92 + i * 46 + 30); B[p.pid].t.textContent = `${p.comm} · nice ${p.pid === e.pid ? ni : p.ni}`; }); };
  list.forEach(p => { B[p.pid] = node(V.g, 16, 92, `${p.comm} · nice ${p.ni}`, 'proc', { w: 200, h: 26 }); bars[p.pid] = E('rect', { x: 230, y: 0, width: 10, height: 8, rx: 3, class: 'meter', style: 'transition:all var(--dur)' }); });
  lay(e.old); cl(B[e.pid], 'hl');
  steps.push({ t: 'Scheduler picks tasks by weighted runtime', d: 'Linux CFS/EEVDF gives each runnable task a weight from its nice value (-20 … 19). Each nice step ≈ 10% more or less CPU.', a: () => {} });
  steps.push({ t: e.denied ? 'Permission denied' : `setpriority(): nice ${e.old} → ${e.ni}`, d: e.denied ? 'Ordinary users may only make their processes NICER (raise the number). Lowering it (more priority) needs root.' : 'The kernel updates the task\'s weight; its place in the queue and its share of CPU change immediately.', a: () => { if (!e.denied) lay(e.ni); } });
  return steps;
};
/* ---- services & boot ---- */
SC.boot = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'service' || e.type === 'boot'); const steps = [];
  const chain = ['UEFI/BIOS', 'GRUB', 'kernel', 'initramfs', 'systemd'];
  const C_ = chain.map((c, i) => node(V.g, 12 + i * 126, 80, c, i === 4 ? 'proc' : 'perm', { w: 110, h: 40, sub: ['firmware', 'bootloader', 'vmlinuz', 'temp root fs', 'PID 1'][i] }));
  chain.slice(0, -1).forEach((c, i) => E('path', { d: `M${12 + i * 126 + 110},100 L${12 + (i + 1) * 126},100`, class: 'arr', 'marker-end': 'url(#ahb)' }));
  const svcs = Object.entries(S.services).slice(0, 6);
  const SV = {}; svcs.forEach(([k, v], i) => { SV[k] = node(V.g, 40 + (i % 3) * 200, 190 + Math.floor(i / 3) * 60, k + '.service', v.active ? 'ok' : 'plain', { w: 170, h: 40, sub: v.active ? 'active (running)' : 'inactive' }); E('path', { d: `M${C_[4].cx()},120 L${SV[k].cx()},${SV[k]._y}`, class: 'wire', style: 'opacity:.4' }); });
  if (e && e.type === 'service' && e.svc && SV[e.svc]) {
    const s = SV[e.svc];
    steps.push({ t: 'systemctl talks to systemd over D-Bus', d: 'systemctl itself starts nothing: it sends a request to systemd (PID 1), which owns every service.', a: () => cl(C_[4], 'hl') });
    if (e.denied) { steps.push({ t: 'polkit: authentication required', d: 'Changing services is a system-wide action → run with sudo.', a: () => cl(s, 'del') }); return steps; }
    const verb = e.action;
    steps.push({ t: verb === 'status' ? 'Read unit state + recent journal lines' : verb === 'enable' || verb === 'disable' ? `${verb}: create/remove a symlink in multi-user.target.wants/` : `systemd ${verb}s ${e.svc}.service`, d: verb === 'status' ? 'Loaded (unit file path, enabled?), Active (running since…), Main PID, CGroup (all its processes) and the last log lines.' : verb === 'enable' || verb === 'disable' ? 'enable = start automatically at boot. It does NOT start it now (use --now for both).' : `systemd ${verb === 'stop' ? 'sends SIGTERM to the service\'s cgroup (SIGKILL after a timeout)' : 'fork()s and exec()s the service program (ExecStart=) inside its own cgroup'}.`, a: () => { s.setAttribute('class', (e.active ? 'n-ok' : 'n-plain') + ' mv hl'); if (s.s) s.s.textContent = e.active ? 'active (running)' : 'inactive'; } });
    return steps;
  }
  if (e && e.type === 'service' && e.action === 'journal') {
    const j = node(V.g, 470, 300, 'journald', 'perm', { w: 150 });
    steps.push({ t: 'Services log to journald', d: 'stdout/stderr of every service plus syslog and kernel messages are collected by systemd-journald into a binary, indexed journal (/var/log/journal). journalctl filters it: -u unit, -p priority, -b boot, -f follow.', a: () => Object.values(SV).forEach(s => { const p = line(V.g, s.cx(), s._y + 40, 545, 300, 'wire'); packet(V.g, p, null, 'pk', 700); }) });
    return steps;
  }
  chain.forEach((c, i) => steps.push({ t: ['Firmware runs POST, finds a boot disk', 'Bootloader loads the kernel + initramfs', 'Kernel initialises CPU, memory, drivers', 'initramfs mounts the real root filesystem', 'systemd (PID 1) starts all services'][i], d: ['UEFI (or legacy BIOS) checks hardware and reads the EFI system partition.', 'GRUB shows the menu, reads /boot/vmlinuz-* and passes the kernel command line (root=UUID=…).', 'The kernel decompresses itself, detects hardware and starts PID 1.', 'A tiny temporary root with just enough drivers to reach the real disk, then switch_root.', 'systemd reads unit files and starts services in parallel, according to dependencies, until the default target is reached.'][i], a: () => { cl(C_[i], 'hl'); if (i === 4) stagger(Object.values(SV), 120, s => cl(s, 'hl')); } }));
  return steps;
};
/* ---- cron / at ---- */
SC.cron = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'cron' || e.type === 'at'); const steps = [];
  const cx = 170, cy = 200, R = 110;
  E('circle', { cx, cy, r: R, style: 'fill:var(--panel);stroke:var(--border)' });
  for (let h = 0; h < 24; h++) { const a = h / 24 * Math.PI * 2 - Math.PI / 2; E('line', { x1: cx + Math.cos(a) * (R - 6), y1: cy + Math.sin(a) * (R - 6), x2: cx + Math.cos(a) * R, y2: cy + Math.sin(a) * R, class: 'wire-s' }); if (h % 3 === 0) txt(V.g, cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20) + 4, String(h), 'lbl-m', 'middle'); }
  txt(V.g, cx, cy + R + 22, '24-hour day', 'lbl-m', 'middle');
  const hand = E('line', { x1: cx, y1: cy, x2: cx, y2: cy - R + 14, style: 'stroke:var(--blue);stroke-width:3;transform-origin:' + cx + 'px ' + cy + 'px;transition:transform calc(var(--dur)*3) linear' });
  const jobs = [];
  if (e && e.type === 'cron') for (const l of lines(e.entries || '')) { const p = l.trim().split(/\s+/); if (p.length < 6 || l.trim().startsWith('#')) continue; const hrs = p[1] === '*' ? [0, 3, 6, 9, 12, 15, 18, 21] : p[1].includes('/') ? Array.from({ length: Math.ceil(24 / +p[1].split('/')[1]) }, (_, k) => k * +p[1].split('/')[1]) : p[1].split(',').map(Number); jobs.push({ hrs, cmd: p.slice(5).join(' '), spec: p.slice(0, 5).join(' ') }); }
  if (e && e.type === 'at' && e.job) { const d = new Date(e.job.when); jobs.push({ hrs: [d.getHours() + d.getMinutes() / 60], cmd: e.job.cmd, spec: 'at (once)' }); }
  const marks = [];
  jobs.slice(0, 4).forEach((j, ji) => { j.hrs.forEach(h => { const a = h / 24 * Math.PI * 2 - Math.PI / 2; marks.push(E('circle', { cx: cx + Math.cos(a) * (R + 10), cy: cy + Math.sin(a) * (R + 10), r: 6, class: 'pk-g' })); }); node(V.g, 330, 90 + ji * 52, trunc(`${j.spec}  ${j.cmd}`, 36), 'proc', { w: 290, h: 40, sub: j.spec === 'at (once)' ? 'runs once' : 'min hour day month weekday' }); });
  if (!jobs.length) txt(V.g, 330, 120, e && e.list ? 'atq: pending one-time jobs' : 'no jobs scheduled', 'lbl-m');
  steps.push({ t: e && e.type === 'at' ? 'atd stores a one-time job' : 'crontab saved to /var/spool/cron/crontabs/' + curUser(), d: e && e.type === 'at' ? 'at queues the commands (with your environment) and atd runs them once at that time.' : 'Each line: minute hour day-of-month month day-of-week command. crontab -e edits it safely and validates the syntax.', a: () => marks.forEach(m => cl(m, 'hl')) });
  steps.push({ t: 'cron wakes up every minute', d: 'The cron daemon (PID 412) checks all crontabs once a minute. When the time matches, it fork()s + exec()s the job with a MINIMAL environment (short PATH, no aliases) — use full paths in jobs! Output is mailed or lost unless you redirect it.', a: () => { hand.style.transform = 'rotate(360deg)'; later(1000, () => marks.forEach(m => { m.setAttribute('r', 10); later(300, () => m.setAttribute('r', 6)); })); } });
  return steps;
};
/* ---- mount ---- */
SC.mount = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'mount' || e.type === 'umount'); const steps = [];
  if (!e || e.list) {
    const disks = [['sda', '60G', [['sda1', '/', 50], ['sda2', '/boot', 1], ['sda3', 'swap', 2]]], ['sdb', '14.9G', [['sdb1', (S.mounts.find(m => m.dev === '/dev/sdb1') || {}).mp || '(not mounted)', 14.9]]]];
    disks.forEach(([d, sz, parts], i) => { node(V.g, 16, 90 + i * 110, `/dev/${d}  ${sz}`, 'plain', { w: 150, h: 30 }); let x = 180; parts.forEach(([p, mp, s]) => { const w = Math.max(90, s / 60 * 420); node(V.g, x, 86 + i * 110, p, 'dir', { w, h: 40, sub: mp }); x += w + 6; }); });
    steps.push({ t: 'Read block devices from /sys/block', d: 'Disks (sda, sdb, nvme0n1…) are split into partitions; each partition holds a filesystem that can be mounted on a directory.', a: () => {} });
    return steps;
  }
  const dev = node(V.g, 16, 100, e.dev, 'perm', { w: 150, h: 40, sub: e.fs || '' });
  const files = (e.files || []).slice(0, 4).map((f, i) => node(V.g, 30, 160 + i * 34, f, 'file', { w: 130 }));
  const root = node(V.g, 380, 80, '/', 'dir'); const mp = node(V.g, 420, 130, e.mp + '/', 'dir', { cls: 'cur' });
  E('path', { d: 'M392,104 V142 H420', class: 'wire-s' });
  const hidden = (e.hidden || []).slice(0, 2).map((h, i) => node(V.g, 460, 170 + i * 30, h + ' (hidden)', 'file'));
  const slot = files.map((f, i) => [460, 170 + i * 34]);
  if (e.type === 'umount' && e.busy) { steps.push({ t: 'umount refused: target is busy', d: `Something is still using ${e.mp} — here, your own shell's current directory is inside it. cd out (or find the culprit with lsof +D ${e.mp}) and retry.`, a: () => cl(mp, 'del') }); return steps; }
  if (e.type === 'mount') {
    steps.push({ t: 'Kernel reads the filesystem superblock', d: `The ${e.fs} driver reads the partition's superblock (size, block layout, root directory inode).`, a: () => cl(dev, 'hl') });
    steps.push({ t: `Attach at ${e.mp}`, d: `From now on, paths under ${e.mp} lead into the device. Anything that was in ${e.mp} before is hidden (not deleted) until umount.`, a: () => { hidden.forEach(h => cl(h, 'dim')); files.forEach((f, i) => pos(f, slot[i][0] + 10, slot[i][1] + 40)); cl(mp, 'hl'); } });
  } else {
    files.forEach((f, i) => pos(f, slot[i][0] + 10, slot[i][1] + 40));
    steps.push({ t: 'Flush pending writes (sync)', d: 'Cached data is written to the device first — that is why you must umount before unplugging a USB stick.', a: () => cl(dev, 'hl') });
    steps.push({ t: `Detach from ${e.mp}`, d: 'The directory goes back to showing its own (previously hidden) content.', a: () => files.forEach((f, i) => pos(f, 30, 160 + i * 34)) });
  }
  return steps;
};
/* ---- firewall ---- */
SC.fw = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'fw'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  node(V.g, 12, 170, 'Internet', 'plain', { w: 80, h: 36 });
  const srv = node(V.g, 552, 160, 'this server', 'ok', { w: 80, h: 56 });
  const rules = e.rules.slice(0, 4); const pol = e.tool === 'ufw' ? (e.enabled ? 'DENY' : 'ACCEPT') : (e.policy || 'ACCEPT');
  const gates = rules.map((rl, i) => node(V.g, 120 + i * 100, 140, `${rl.port}`, /ACCEPT|ALLOW/.test(rl.action) ? 'ok' : 'root', { w: 90, h: 50, sub: rl.action }));
  const def = node(V.g, 120 + rules.length * 100, 140, 'default', /ACCEPT/.test(pol) ? 'ok' : 'root', { w: 90, h: 50, sub: 'policy ' + pol });
  if (e.tool === 'ufw' && !e.enabled) txt(V.g, 120, 120, 'ufw is INACTIVE — every packet passes', 't-y');
  const lane = E('path', { d: 'M92,188 L552,188', class: 'wire' });
  const tests = ['22/tcp', '80/tcp', '3306/tcp', '8080/tcp'];
  tests.forEach(pt => {
    const port = pt.split('/')[0];
    let idx = rules.findIndex(rl => String(rl.port).split('/')[0] === port || rl.port === 'all');
    const act = idx >= 0 ? rules[idx].action : pol;
    const ok = !(e.tool === 'ufw' ? e.enabled : true) || /ACCEPT|ALLOW/.test(act);
    const stopX = idx >= 0 ? gates[idx].cx() : def.cx();
    steps.push({ t: `Packet to port ${port}: ${ok ? 'ACCEPT' : 'DROP'}`, d: idx >= 0 ? `Rules are checked top to bottom; first match wins → rule “${rules[idx].port} ${act}”.` : `No rule matched → default policy (${pol}).`, a: () => { const p = E('path', { d: `M92,188 L${ok ? 552 : stopX},188`, style: 'opacity:0' }); packet(V.g, p, ':' + port, ok ? 'pk' : 'pk-r', 900, !ok, () => { if (!ok) { const x = stopX; E('path', { d: `M${x - 9},179 L${x + 9},197 M${x + 9},179 L${x - 9},197`, class: 'bigx' }); } else cl(srv, 'hl'); }); } });
  });
  return steps;
};
/* ---- networking ---- */
SC.net = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'net'); const steps = [];
  if (!e) { if (r.name === 'ip') { node(V.g, 40, 120, 'lo 127.0.0.1', 'plain', { w: 160 }); node(V.g, 40, 170, 'eth0 10.0.0.5/24', 'ok', { w: 160 }); node(V.g, 40, 220, 'docker0 172.17.0.1', 'plain', { w: 160 }); node(V.g, 400, 170, 'gateway 10.0.0.1', 'perm', { w: 170 }); E('path', { d: 'M200,182 L400,182', class: 'arr', 'marker-end': 'url(#ahb)' }); steps.push({ t: 'Query the kernel over netlink', d: 'ip talks to the kernel\'s networking stack: interfaces (link), their addresses (addr) and where packets go (route). “default via” is the gateway for everything not on a local network.', a: () => {} }); return steps; } return SC.generic(ctx, r); }
  const hops = (e.hops || []).slice(0, 4); const n = hops.length + 2;
  const xs = i => 12 + i * (616 - 100) / (n - 1);
  const you = node(V.g, xs(0), 170, 'you', 'ok', { w: 100, h: 44, sub: '10.0.0.5' });
  const H = hops.map((h, i) => i === hops.length - 1 && h === e.ip ? null : node(V.g, xs(i + 1), 170, i === 0 ? 'gateway' : 'router', 'perm', { w: 100, h: 44, sub: h })).filter(Boolean);
  const dst = node(V.g, xs(n - 1), 170, trunc(e.host, 12), 'proc', { w: 100, h: 44, sub: e.ip });
  const all = [you, ...H, dst];
  const fwd = E('path', { d: `M${you.cx()},165 L${dst.cx()},165`, class: 'wire' }), back = E('path', { d: `M${dst.cx()},222 L${you.cx()},222`, class: 'wire' });
  const hopPath = (a, b, y) => E('path', { d: `M${a.cx()},${y} L${b.cx()},${y}`, style: 'opacity:0' });
  const isName = !/^\d/.test(e.host);
  if (isName && e.kind !== 'traceroute') steps.push({ t: `DNS: resolve ${e.host}`, d: `Names are for humans; packets need an IP address. The resolver (/etc/resolv.conf) answers ${e.host} → ${e.ip}.`, a: () => { const d = node(V.g, 250, 80, `DNS: ${trunc(e.host, 14)} → ${e.ip}`, 'perm', { w: 230 }); cl(d, 'hl'); } });
  if (e.kind === 'ping') {
    steps.push({ t: 'ICMP echo request', d: 'ping sends a small ICMP “are you there?” packet. Each router decrements its TTL and forwards it.', a: () => packet(V.g, fwd, 'echo req', 'pk', 1100) });
    steps.push({ t: e.ok ? 'ICMP echo reply' : 'No reply (timeout)', d: e.ok ? `The target answers; ping measures the round-trip time (~${e.ms} ms).` : 'The host is down or a firewall drops ICMP → 100% packet loss.', a: () => e.ok ? packet(V.g, back, `${e.ms} ms`, 'pk-g', 1100) : cl(dst, 'del') });
  } else if (e.kind === 'traceroute') {
    all.slice(1).forEach((h, i) => steps.push({ t: `TTL=${i + 1}: discover hop ${i + 1}`, d: `A packet with TTL ${i + 1} expires at hop ${i + 1}; that router sends back “ICMP Time Exceeded”, revealing its address and the delay.`, a: () => { const p = hopPath(you, h, 165); packet(V.g, p, 'TTL ' + (i + 1), 'pk', 700, false, () => { cl(h, 'hl'); packet(V.g, hopPath(h, you, 222), 'time exceeded', 'pk-g', 700); }); } }));
  } else {
    const port = e.kind === 'ssh' || e.kind === 'scp' ? 22 : e.https ? 443 : 80;
    steps.push({ t: `TCP handshake to port ${port}`, d: 'connect(): SYN → SYN-ACK → ACK. Now both sides have a reliable, ordered byte stream.', a: () => { packet(V.g, fwd, 'SYN', 'pk', 700, false, () => packet(V.g, back, 'SYN-ACK', 'pk-g', 700, false, () => packet(V.g, fwd, 'ACK', 'pk', 500))); } });
    if (e.https || port === 22) steps.push({ t: port === 22 ? 'SSH key exchange + authentication' : 'TLS handshake', d: port === 22 ? 'Both sides agree on encryption keys (Diffie-Hellman), the server proves its identity (host key, ~/.ssh/known_hosts), then you prove yours (key in ~/.ssh/authorized_keys or password).' : 'The server proves its identity with a certificate; both sides derive encryption keys. Everything after this is encrypted.', a: () => { E('path', { d: `M${you.cx()},194 L${dst.cx()},194`, style: 'stroke:var(--green);stroke-width:4;opacity:.5' }); } });
    if (e.kind === 'curl' || e.kind === 'wget') {
      steps.push({ t: `HTTP ${e.method || 'GET'} request`, d: `${e.method || 'GET'} / HTTP/1.1 + headers (Host, User-Agent…).`, a: () => packet(V.g, fwd, e.method || 'GET', 'pk', 900) });
      steps.push({ t: `HTTP response ${e.status || 200}`, d: e.kind === 'wget' ? `The body is saved to the file “${e.file}”.` : 'curl prints the response body to stdout (use -o file to save, -I for headers only).', a: () => packet(V.g, back, String(e.status || 200) + ' OK', 'pk-g', 900) });
    } else if (e.kind === 'scp') steps.push({ t: e.dir === 'down' ? 'Download file over SSH' : 'Upload file over SSH', d: 'scp/rsync run over the encrypted SSH channel.', a: () => packet(V.g, e.dir === 'down' ? back : fwd, trunc(e.file, 12), 'pk', 1000) });
    else steps.push({ t: 'Encrypted session', d: 'Every keystroke and output is encrypted end-to-end.', a: () => { packet(V.g, fwd, 'cmd', 'pk', 700); later(500, () => packet(V.g, back, 'output', 'pk-g', 700)); } });
  }
  return steps;
};
SC.dns = (ctx) => {
  const e = ctx.events.find(e => e.type === 'dns'); const steps = []; if (!e) return [];
  const you = node(V.g, 16, 160, 'you (dig)', 'ok', { w: 100 }), res = node(V.g, 170, 160, 'resolver', 'perm', { w: 110, sub: '127.0.0.53' });
  const rt = node(V.g, 400, 72, 'root  .', 'plain', { w: 130 }), tld = node(V.g, 400, 160, 'TLD  .' + e.tld, 'plain', { w: 130 }), au = node(V.g, 400, 248, e.nx ? 'authoritative?' : 'authoritative', 'proc', { w: 160, sub: e.name });
  const P = (a, b) => E('path', { d: `M${a._x + a.w},${a.cy()} L${b._x},${b.cy()}`, class: 'wire' });
  const B = (a, b) => E('path', { d: `M${b._x},${b.cy() + 6} L${a._x + a.w},${a.cy() + 6}`, style: 'opacity:0' });
  steps.push({ t: 'Ask the local resolver', d: 'dig sends a UDP query (port 53) to the resolver from /etc/resolv.conf. If the answer is cached, it replies at once.', a: () => packet(V.g, P(you, res), e.name, 'pk', 700) });
  steps.push({ t: 'Root server: “ask the .' + e.tld + ' servers”', d: 'The 13 root server identities know who runs each top-level domain.', a: () => { packet(V.g, P(res, rt), '?', 'pk', 600, false, () => packet(V.g, B(res, rt), 'NS .' + e.tld, 'pk-g', 600)); } });
  steps.push({ t: 'TLD server: “ask ' + e.name + "'s nameserver”", d: 'The .' + e.tld + ' registry servers know the authoritative nameservers for each domain.', a: () => { packet(V.g, P(res, tld), '?', 'pk', 600, false, () => packet(V.g, B(res, tld), 'NS', 'pk-g', 600)); } });
  steps.push({ t: e.nx ? 'NXDOMAIN — name does not exist' : `Authoritative answer: ${e.rtype} ${trunc(e.answer.join(', '), 30)}`, d: e.nx ? 'No such domain. The resolver caches this negative answer too.' : `The domain's own nameserver gives the final record, with a TTL saying how long it may be cached.`, a: () => { packet(V.g, P(res, au), '?', 'pk', 600, false, () => packet(V.g, B(res, au), e.nx ? 'NXDOMAIN' : trunc(e.answer[0] || '-', 14), e.nx ? 'pk-r' : 'pk-g', 600, false, () => packet(V.g, B(you, res), e.nx ? 'NX' : trunc(e.answer[0] || '-', 14), 'pk-g', 600))); } });
  return steps;
};
/* ---- script flowchart ---- */
SC.script = (ctx) => {
  const steps = []; const tr = (ctx.trace || []).slice(0, 40);
  const src = ctx.script ? ctx.script.lines : ctx.line.split('\n');
  const lineTexts = ctx.script ? src : ctx.compoundLines || src;
  const shown = lineTexts.slice(0, 13);
  txt(V.g, 16, 80, ctx.script ? ctx.script.path : 'compound command', 'lbl-m'); txt(V.g, 440, 80, 'variables', 'lbl-m');
  const rows = shown.map((l, i) => { const g = node(V.g, 16, 86 + i * 20, trunc(`${String(i + 1).padStart(2)}  ${l}`, 52), 'plain', { w: 400, h: 18 }); g.t.setAttribute('x', 6); g.t.setAttribute('text-anchor', 'start'); g.t.setAttribute('y', 13); return g; });
  const varBox = E('g', {}); E('rect', { x: 432, y: 86, width: 196, height: 238, rx: 8, style: 'fill:var(--panel);stroke:var(--border)' }, varBox);
  const vt = []; for (let i = 0; i < 10; i++) vt.push(txt(varBox, 442, 106 + i * 20, '', ''));
  const setVars = (vars, code) => { const ent = Object.entries(vars).slice(0, 9); vt.forEach((t, i) => { t.textContent = i < ent.length ? trunc(`${ent[i][0]} = "${ent[i][1]}"`, 26) : (i === ent.length ? `$? = ${code}` : ''); t.setAttribute('class', i === ent.length ? 't-orange' : 't-purple'); }); };
  const base = tr.length ? Object.keys(tr[0].vars) : [];
  tr.forEach((s, k) => steps.push({ t: `Line ${s.line + 1}: ${trunc((lineTexts[s.line] || '').trim(), 34)}`, d: `Run line ${s.line + 1}. Variables: ${Object.entries(s.vars).filter(([n]) => !base.includes(n) || k > 0).slice(0, 4).map(([n, v]) => `${n}=${trunc(v, 12)}`).join(', ') || '(none yet)'}.`, a: () => { rows.forEach(r => cl(r, 'hl', false)); cl(rows[s.line], 'hl'); setVars(s.vars, s.code); } }));
  if (!steps.length) steps.push({ t: 'Script parsed', d: 'Nothing executed.', a: () => {} });
  return steps;
};
/* ---- containers ---- */
SC.container = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'docker' || e.type === 'ns' || e.type === 'cgroup'); const steps = [];
  E('rect', { x: 10, y: 68, width: 620, height: 260, rx: 10, style: 'fill:none;stroke:var(--border)' }); txt(V.g, 20, 86, `host: ${S.host}`, 'lbl-m');
  E('rect', { x: 20, y: 296, width: 600, height: 24, rx: 6, style: 'fill:color-mix(in srgb,var(--purple) 20%,var(--panel));stroke:var(--purple)' }); txt(V.g, 320, 312, 'ONE shared Linux kernel (namespaces + cgroups)', '', 'middle');
  const hostP = node(V.g, 24, 100, 'host processes', 'proc', { w: 130, h: 40, sub: 'PID 1 = systemd' });
  let list = S.containers.filter(c => c.up).slice(0, 3);
  if (e && e.c && !list.find(c => c.id === e.c.id)) list = [e.c].concat(list).slice(0, 3);
  const B = {};
  list.forEach((c, i) => {
    const x = 180 + i * 148; const g = E('g', { class: 'grow' });
    E('rect', { x, y: 96, width: 140, height: 190, rx: 8, style: 'fill:color-mix(in srgb,var(--blue) 8%,var(--panel));stroke:var(--blue);stroke-dasharray:5 3' }, g);
    txt(g, x + 70, 112, trunc(c.name, 16), 'ttl', 'middle'); txt(g, x + 70, 126, trunc(c.image, 18), 'lbl-m', 'middle');
    ['pid', 'net', 'mnt', 'uts'].forEach((ns, k) => { const n_ = node(g, x + 6 + (k % 2) * 66, 134 + Math.floor(k / 2) * 26, ns + ' ns', 'perm', { w: 62, h: 22 }); });
    const p1 = node(g, x + 10, 190, `PID 1: ${trunc(c.cmd.split(' ')[0], 7)}`, 'proc', { w: 120, h: 22 });
    txt(g, x + 10, 228, 'cpu', 'lbl-m'); txt(g, x + 10, 250, 'mem', 'lbl-m');
    E('rect', { x: x + 40, y: 220, width: 90, height: 9, rx: 4, class: 'meter-bg' }, g); E('rect', { x: x + 40, y: 242, width: 90, height: 9, rx: 4, class: 'meter-bg' }, g);
    const mc = E('rect', { x: x + 40, y: 220, width: 0, height: 9, rx: 4, class: 'meter', style: 'transition:width var(--dur)' }, g), mm = E('rect', { x: x + 40, y: 242, width: 0, height: 9, rx: 4, class: 'meter', style: 'transition:width var(--dur)' }, g);
    txt(g, x + 70, 272, c.mem ? `limit ${c.mem}` : 'no mem limit', 'lbl-m', 'middle');
    if (e && e.c && e.c.id === c.id && e.action === 'run') g.classList.add('hid');
    B[c.id] = { g, mc, mm, p1, c, x };
  });
  const fill = b => { b.mc.setAttribute('width', Math.min(90, (+b.c.usage.cpu || 1) * 12)); b.mm.setAttribute('width', Math.min(90, b.c.usage.mem * (b.c.mem ? 90 / parseInt(b.c.mem) : 0.8))); };
  if (e && e.type === 'docker') {
    const b = e.c && B[e.c.id];
    if (e.action === 'run' && b) {
      steps.push({ t: 'Image: read-only layers', d: `${e.c.image} is a stack of read-only filesystem layers; the container gets a thin writable layer on top.`, a: () => cl(hostP, 'hl') });
      steps.push({ t: 'clone(): new namespaces', d: 'The runtime creates PID, network, mount, UTS (hostname) and IPC namespaces: the process will see its own process list, network card, filesystem and hostname.', a: () => show(b.g) });
      steps.push({ t: 'cgroup: apply resource limits', d: `A control group limits and accounts CPU, memory and I/O${e.c.mem ? ` (memory.max = ${e.c.mem})` : ''}${e.c.cpus ? `, cpus ${e.c.cpus}` : ''}. Exceed the memory limit and the kernel OOM-kills the container.`, a: () => fill(b) });
      steps.push({ t: `exec(): ${trunc(e.c.cmd, 24)} becomes PID 1 inside`, d: `Inside the container it is PID 1; on the host the same process has PID ${e.c.hostPid}. It's an ordinary Linux process — not a VM.`, a: () => cl(b.p1, 'hl') });
    } else if (e.action === 'exec' && b) {
      const np = node(b.g, b.x + 10, 162 + 0, `${trunc(e.cmd, 12)}`, 'proc', { w: 120, h: 22 }); np.classList.add('grow', 'hid');
      steps.push({ t: 'setns(): join the container\'s namespaces', d: 'docker exec starts a NEW process and moves it into the existing namespaces + cgroup of the container, so it sees the container\'s files, network and processes.', a: () => { show(np); cl(np, 'hl'); } });
    } else if (e.action === 'stats') steps.push({ t: 'Read cgroup counters', d: 'docker stats reads each container\'s cgroup files (cpu.stat, memory.current) — that is how per-container usage is measured.', a: () => Object.values(B).forEach(fill) });
    else steps.push({ t: e.action === 'ps' ? 'List running containers' : `${e.action} container`, d: e.action === 'stop' ? 'docker stop sends SIGTERM to PID 1 in the container, then SIGKILL after 10 s.' : 'The Docker daemon tracks every container it created.', a: () => Object.values(B).forEach(b => { cl(b.g, 'dim', !b.c.up && e.action !== 'ps'); fill(b); }) });
  } else if (e && e.type === 'ns') steps.push({ t: e.unshare ? `unshare: new ${e.unshare.join(', ')} namespace(s)` : 'List namespaces (/proc/*/ns)', d: e.unshare ? 'unshare runs a program in fresh namespaces — the same building block containers use. With a new PID namespace + --mount-proc, ps shows only PID 1.' : 'Every process belongs to one namespace of each type; lsns groups processes by namespace ID.', a: () => { cl(hostP, 'hl'); Object.values(B).forEach(b => cl(b.g, 'hl')); } });
  else steps.push({ t: 'cgroup tree', d: 'systemd puts every service, user session and container in its own cgroup; limits apply to the whole group.', a: () => Object.values(B).forEach(fill) });
  if (!list.length) txt(V.g, 220, 190, 'no running containers — try: docker run -d --name web nginx', 'lbl-m');
  return steps;
};
/* ---- archives ---- */
SC.archive = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'archive'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  if (e.tool === 'gzip') {
    const mx = Math.max(e.before, e.after);
    txt(V.g, 20, 100, (e.mode === 'gzip' ? e.from : e.out), 'ttl');
    const b1 = E('rect', { x: 20, y: 110, width: 560 * e.before / mx, height: 34, rx: 6, style: 'fill:color-mix(in srgb,var(--teal) 35%,var(--panel));stroke:var(--teal)' }); txt(V.g, 26, 132, human(e.before) + 'B', '');
    txt(V.g, 20, 200, (e.mode === 'gzip' ? e.out : e.from), 'ttl');
    const b2 = E('rect', { x: 20, y: 210, width: 560 * e.before / mx, height: 34, rx: 6, style: 'fill:color-mix(in srgb,var(--orange) 35%,var(--panel));stroke:var(--orange);transition:width calc(var(--dur)*2)' }); const t2 = txt(V.g, 26, 232, '', '');
    steps.push({ t: e.mode === 'gzip' ? 'DEFLATE: replace repeats with back-references' : 'Inflate: rebuild the original bytes', d: e.mode === 'gzip' ? 'gzip finds repeated byte sequences and Huffman-codes them. Text shrinks a lot; JPEG/MP3/ZIP barely shrink (already compressed).' : 'Decompression reverses it exactly — gzip is lossless.', a: () => { b2.setAttribute('width', 560 * e.after / mx); t2.textContent = human(e.after) + 'B'; } });
    steps.push({ t: e.mode === 'gzip' ? 'Replace original with .gz' : 'Replace .gz with original', d: 'By default gzip/gunzip DELETE the input file after success. Keep it with -k.', a: () => { b1.style.opacity = .25; } });
    return steps;
  }
  const files = e.files.slice(0, 6);
  const chips = files.map((f, i) => node(V.g, 20, 80 + i * 36, trunc(f, 22), f.endsWith('/') ? 'dir' : 'file'));
  const box = node(V.g, 400, 130, trunc(baseName(e.out), 18), 'perm', { w: 200, h: 90, sub: e.mode === 'create' ? (e.z ? 'archive + compressed' : 'archive (not compressed)') : e.mode });
  if (e.mode === 'create') {
    steps.push({ t: 'Walk the files (recursively)', d: `${e.files.length} entr${e.files.length === 1 ? 'y' : 'ies'}: each gets a header (name, mode, owner, size, mtime) followed by its bytes.`, a: () => stagger(chips, 90, c => cl(c, 'hl')) });
    steps.push({ t: e.tool === 'zip' ? 'Compress each file into the .zip' : 'Concatenate into one tar stream', d: e.tool === 'zip' ? 'zip compresses every file separately and keeps an index at the end (random access).' : 'tar = “tape archive”: one long stream of headers + data. Directories become paths like docs/report.txt.', a: () => chips.forEach((c, i) => tween(800, k => pos(c, 20 + (400 - 20) * k, 80 + i * 36 + (140 - 80 - i * 36) * k))) });
    if (e.z) steps.push({ t: 'gzip the stream (z)', d: '-z pipes the tar stream through gzip → .tar.gz / .tgz. One compressed blob: better ratio, but no random access.', a: () => { cl(box, 'hl'); chips.forEach(c => cl(c, 'gone')); } });
  } else {
    chips.forEach(c => { pos(c, 400, 160); hide(c); c.classList.add('fade'); });
    steps.push({ t: e.mode === 'list' ? 'Read headers only' : 'Read archive entries', d: e.mode === 'list' ? '-t lists what is inside without extracting.' : 'Each header is read, then the path is created relative to the current directory (or -C dir).', a: () => cl(box, 'hl') });
    if (e.mode !== 'list') steps.push({ t: 'Recreate files & folders', d: 'mkdir for directories, open+write for files, then restore permissions and timestamps. Existing files with the same name are overwritten!', a: () => chips.forEach((c, i) => { show(c); pos(c, 20, 80 + i * 36); }) });
    else steps.push({ t: 'Print the table of contents', d: '', a: () => chips.forEach((c, i) => { show(c); pos(c, 20, 80 + i * 36); }) });
  }
  return steps;
};
/* ---- search (find / locate) ---- */
SC.search = (ctx, r) => {
  const e = ctx.events.find(e => e.type === 'find' || e.type === 'locate'); const steps = [];
  if (!e) return SC.generic(ctx, r);
  const hits = (e.hits || []).slice(0, 7);
  if (e.type === 'locate') {
    const db = node(V.g, 30, 150, 'plocate.db', 'perm', { w: 140, h: 50, sub: 'built by updatedb' });
    const hs = hits.map((h, i) => { const g = node(V.g, 300, 80 + i * 32, trunc(h, 40), 'file'); hide(g); g.classList.add('fade'); return g; });
    steps.push({ t: 'Search a pre-built index, not the disk', d: 'locate looks names up in a database made by updatedb (usually nightly via cron). Super fast — but files created since the last update are missing, and deleted ones may still show.', a: () => cl(db, 'hl') });
    steps.push({ t: `${(e.hits || []).length} match(es)`, d: 'Any path containing the pattern matches (use -b for basename only, -i to ignore case).', a: () => stagger(hs, 90, show) });
    return steps;
  }
  const root = node(V.g, 20, 80, trunc(r.words.slice(1).find(w => !w.startsWith('-')) || '.', 18), 'dir');
  const hs = hits.map((h, i) => { const g = node(V.g, 250, 80 + i * 32, trunc(h, 46), lookup(h, false).n && lookup(h, false).n.t === 'd' ? 'dir' : 'file'); hide(g); g.classList.add('fade'); return g; });
  const walker = E('circle', { cx: 60, cy: 92, r: 6, class: 'pk' });
  steps.push({ t: 'Walk the tree: getdents64() + stat()', d: 'find visits every directory under the start point and calls stat() on each entry to test it (-name, -type, -size, -mtime, -user…). Thorough and always up to date, but slow on huge trees.', a: () => tween(1000, k => walker.setAttribute('cy', 92 + k * 220)) });
  steps.push({ t: `${(e.hits || []).length} entr${(e.hits || []).length === 1 ? 'y' : 'ies'} matched every test`, d: 'Tests are ANDed together by default. Actions (-print default, -delete, -exec) run on each match.', a: () => stagger(hs, 90, g => { show(g); cl(g, 'hl'); }) });
  return steps;
};

/* ---------- playback ---------- */
function vizLoad(ctx) {
  V.gen++; clearInterval(V.timer); V.ctx = ctx; V.instant = true;
  V.svg.classList.add('noanim');
  try { V.steps = buildSteps(ctx); } catch (err) { console.error(err); V.g.innerHTML = ''; V.steps = []; txt(V.g, 320, 180, 'visualization unavailable for this command', 'lbl-m', 'middle'); }
  V.instant = false; V.svg.getBoundingClientRect(); V.svg.classList.remove('noanim');
  V.i = -1; renderTimeline(); vizPlay(true);
}
function vizApply(i) {
  const s = V.steps[i]; if (!s) return;
  try { s.a && s.a(); } catch (err) { console.error(err); }
  V.i = i; renderTimeline();
}
function vizJump(i) {
  if (!V.ctx) return;
  V.gen++; V.instant = true; V.svg.classList.add('noanim');
  V.steps = buildSteps(V.ctx);
  for (let k = 0; k <= i && k < V.steps.length; k++) { try { V.steps[k].a && V.steps[k].a(); } catch (e) { console.error(e); } }
  V.i = Math.min(i, V.steps.length - 1);
  V.svg.getBoundingClientRect(); V.svg.classList.remove('noanim'); V.instant = false;
  renderTimeline();
}
function vizPlay(on) {
  V.playing = on; clearInterval(V.timer);
  document.getElementById('vPlay').textContent = on ? '⏸' : '▶';
  if (!on) return;
  const tick = () => { if (V.i >= V.steps.length - 1) { vizPlay(false); return; } vizApply(V.i + 1); };
  tick(); V.timer = setInterval(tick, 1350 / V.speed);
}
function renderTimeline() {
  const ol = document.getElementById('timeline');
  ol.innerHTML = '';
  V.steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = i < V.i ? 'done' : i === V.i ? 'now done' : '';
    if (i === V.i) li.classList.remove('done');
    li.innerHTML = `<span></span><small></small>`; li.firstChild.textContent = s.t; li.lastChild.textContent = i <= V.i ? s.d : '';
    li.tabIndex = 0; li.setAttribute('role', 'button');
    li.onclick = () => { vizPlay(false); vizJump(i); };
    li.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); li.onclick(); } };
    ol.appendChild(li);
  });
  document.getElementById('stepLbl').textContent = V.steps.length ? `step ${V.i + 1} / ${V.steps.length}` : '';
  document.querySelectorAll('ol.exec>li').forEach(li => li.classList.remove('now'));
}
