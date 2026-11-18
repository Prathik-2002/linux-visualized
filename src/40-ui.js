/* ================= UI ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UI = { level: 'beginner', lesson: null, sandbox: false, unlockAll: false, theme: 'dark', done: {}, quiz: {}, chal: {}, chalProg: {}, lastLesson: {}, hIdx: null, lastCtx: null, tabCount: 0 };
const STORE_KEY = 'linux-visualized-v1';
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ level: UI.level, lesson: UI.lesson, unlockAll: UI.unlockAll, theme: UI.theme, done: UI.done, quiz: UI.quiz, chal: UI.chal, chalProg: UI.chalProg, lastLesson: UI.lastLesson })); } catch (e) { } }
function load() { try { const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (d) Object.assign(UI, d); } catch (e) { } }
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const lessonsOf = lvl => MODULES.filter(m => LEVELS.indexOf(m.level) <= LEVELS.indexOf(lvl));
const ownModules = lvl => MODULES.filter(m => m.level === lvl);
const modOf = id => MODULES.find(m => m.ids.includes(id));
const L_ = id => LESSONS[id];

/* ---------- terminal output ---------- */
const OUT = () => $('#out');
function ansi(s) {
  let html = '', open = 0;
  const parts = String(s).split(/(\x1b\[[0-9;]*m)/);
  const map = { 31: 'c-err', 32: 'c-ex', 33: 'c-y', 34: 'c-dir', 35: 'c-mag', 36: 'c-ln', 1: 'c-b', 2: 'c-dim', 7: 'c-inv' };
  for (const p of parts) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(p);
    if (!m) { html += esc(p); continue; }
    if (m[1] === '0' || m[1] === '') { html += '</span>'.repeat(open); open = 0; continue; }
    const cls = m[1].split(';').map(c => map[c]).filter(Boolean);
    if (m[1].split(';').includes('7')) { html += '<span style="background:#d7dde8;color:#0a0d12">'; open++; continue; }
    html += `<span class="${cls.join(' ')}">`; open++;
  }
  return html + '</span>'.repeat(open);
}
let pendingLine = null;
function termWrite(s, cls) {
  const out = OUT(); const parts = String(s).split('\n');
  parts.forEach((p, i) => {
    if (i === 0 && pendingLine) { pendingLine.innerHTML += cls ? `<span class="${cls}">${ansi(p)}</span>` : ansi(p); }
    else { const d = document.createElement('div'); d.className = 'ln'; d.innerHTML = cls ? `<span class="${cls}">${ansi(p)}</span>` : ansi(p); out.appendChild(d); pendingLine = d; }
    if (i < parts.length - 1) pendingLine = null;
  });
  if (String(s).endsWith('\n')) pendingLine = null;
  scrollTerm();
}
termErr = s => termWrite(s, 'err');
function scrollTerm() { const t = $('#term'); t.scrollTop = t.scrollHeight; }
function promptHTML() {
  const u = curUser(); const h = S.cwd === home() ? '~' : S.cwd.startsWith(home() + '/') ? '~' + S.cwd.slice(home().length) : S.cwd;
  return `<span class="p-u">${esc(u)}@${esc(S.host)}</span>:<span class="p-p">${esc(h)}</span>${S.uid === 0 ? '#' : '$'}`;
}
function updatePrompt() { $('#prompt').innerHTML = promptHTML(); }
function clearTerm() { OUT().innerHTML = ''; pendingLine = null; }

/* ---------- token explanations (hover tooltips) ---------- */
const OP_TIPS = { '|': 'Pipe: the left command\'s stdout becomes the right command\'s stdin.', '>': 'Redirect stdout into a file — OVERWRITES it (the file is emptied first).', '>>': 'Redirect stdout and APPEND to the end of the file.', '<': 'Feed a file into the command\'s stdin.', '2>': 'Redirect stderr (error messages, fd 2) into a file.', '2>>': 'Append stderr to a file.', '2>&1': 'Send stderr to wherever stdout currently goes.', '&>': 'Redirect BOTH stdout and stderr into a file.', '&&': 'AND: run the next command only if this one succeeded (exit code 0).', '||': 'OR: run the next command only if this one failed (non-zero exit).', ';': 'Separator: run the next command afterwards, whatever happened.', '&': 'Run in the background: the shell does not wait; you get the prompt back.' };
function flagTip(L, tok) {
  if (!L || !L.f) return null;
  const hit = L.f.find(f => f[0] === tok || f[1] === tok || (f[1] && tok.startsWith(f[1] + '=')));
  if (hit) return `<b>${esc(tok)}</b> ${esc(hit[2])}`;
  if (/^-[A-Za-z]{2,}$/.test(tok)) { const parts = tok.slice(1).split('').map(c => { const f = L.f.find(f => f[0] === '-' + c); return f ? `<b>-${c}</b> ${esc(f[2])}` : `<b>-${c}</b> option`; }); return `Combined flags (${esc(tok)} = ${tok.slice(1).split('').map(c => '-' + c).join(' ')}):<br>` + parts.join('<br>'); }
  return null;
}
function lessonForCmd(name) { return LESSONS[name] || Object.values(LESSONS).find(l => l.k === name || l.n === name); }
function explainToken(tokens, i) {
  const t = tokens[i];
  if (t.op) return `<b>${esc(t.op)}</b> ${OP_TIPS[t.op] || 'operator'}`;
  const prev = tokens[i - 1];
  if (prev && prev.op && /[<>]/.test(prev.op) && prev.op !== '2>&1') return `<b>${esc(t.w)}</b> the file used by the ${esc(prev.op)} redirection.`;
  let j = i; while (j > 0 && !(tokens[j - 1].op && ['|', '&&', '||', ';', '&'].includes(tokens[j - 1].op))) j--;
  let cmdIdx = j; while (tokens[cmdIdx] && tokens[cmdIdx].w && /^[A-Za-z_]\w*=/.test(tokens[cmdIdx].w)) cmdIdx++;
  if (tokens[cmdIdx] && ['sudo', 'nohup', 'time', 'nice', 'strace', 'xargs'].includes(tokens[cmdIdx].w) && i > cmdIdx) { let k = cmdIdx + 1; while (tokens[k] && tokens[k].w && tokens[k].w.startsWith('-')) k += (tokens[k].w === '-n' || tokens[k].w === '-u') ? 2 : 1; if (i >= k) cmdIdx = k; }
  const w = t.w;
  if (/^[A-Za-z_]\w*=/.test(w) && i < cmdIdx + 1 && i <= cmdIdx) return `<b>${esc(w.split('=')[0])}</b> variable assignment — no spaces around = in bash.`;
  if (i === cmdIdx) { const L = lessonForCmd(w); if (S.aliases[w]) return `<b>${esc(w)}</b> alias for “${esc(S.aliases[w])}”.`; return L ? `<b>${esc(w)}</b> ${esc(L.s)}` : BUILTINS.has(w) ? `<b>${esc(w)}</b> a shell builtin command.` : CMDS[w] ? `<b>${esc(w)}</b> the command (program) to run.` : `<b>${esc(w)}</b> the command name.`; }
  const L = lessonForCmd(tokens[cmdIdx] && tokens[cmdIdx].w);
  if (/^-/.test(w)) return flagTip(L, w) || `<b>${esc(w)}</b> an option (flag) that changes how ${esc(tokens[cmdIdx] ? tokens[cmdIdx].w : 'the command')} behaves.`;
  if (/^['"]/.test(w)) return `<b>${esc(trunc(w, 30))}</b> quoted text — ${w[0] === "'" ? 'single quotes keep everything literal' : 'double quotes still expand $variables'}; spaces inside stay one argument.`;
  if (w.includes('$')) return `<b>${esc(w)}</b> contains an expansion — the shell replaces it before the command runs.`;
  if (/[*?]/.test(w)) { const g = globExpand(w); return `<b>${esc(w)}</b> a glob (wildcard). The shell expands it to: ${esc(g.slice(0, 6).join(' ') || '(no match — passed literally)')}`; }
  if (w === '{}' || w === '\\;') return `<b>${esc(w)}</b> part of find -exec: {} = each found file, \\; ends the command.`;
  const r = lookup(w.replace(/^~/, home()));
  if (r.n) return `<b>${esc(w)}</b> argument: an existing ${r.n.t === 'd' ? 'directory' : r.n.t === 'l' ? 'symbolic link' : 'file'} (${modeStr(r.n)} ${uname(r.n.uid)}).`;
  return `<b>${esc(w)}</b> an argument passed to ${esc(tokens[cmdIdx] ? tokens[cmdIdx].w : 'the command')}.`;
}
function echoCommand(line) {
  const d = document.createElement('div'); d.className = 'ln';
  let toks = []; try { toks = lex(line); } catch (e) { toks = []; }
  let html = promptHTML() + ' ', pos_ = 0;
  toks.forEach((t, i) => { html += esc(line.slice(pos_, t.s)); html += `<span class="tok" data-i="${i}">${esc(line.slice(t.s, t.e))}</span>`; pos_ = t.e; });
  html += esc(line.slice(pos_));
  d.innerHTML = html; d._toks = toks;
  d.querySelectorAll('.tok').forEach(sp => { sp.dataset.tipHtml = explainToken(toks, +sp.dataset.i); });
  OUT().appendChild(d); pendingLine = null;
}

/* ---------- running a command ---------- */
let LAST_CTX = null;
function submit(raw) {
  let line = raw;
  echoCommand(raw);
  if (/(^|\s)!(!|\d+)/.test(line)) { line = line.replace(/!!/g, S.history[S.history.length - 1] || '').replace(/(^|\s)!(\d+)/g, (m, sp, n) => sp + (S.history[+n - 1] || m)); termWrite(line + '\n'); }
  if (!line.trim()) { updatePrompt(); scrollTerm(); return; }
  S.history.push(line); UI.hIdx = null;
  CTX = newCtx(line); CTX.raw = raw; SH.exit = null; SH.ret = null; SH.brk = 0;
  const sink = { out: s => termWrite(s), err: s => termWrite(s, 'err'), tty: true };
  let code;
  try {
    if (isCompound(line)) { CTX.compoundLines = splitStmts(line).map(s => s.trim()).filter(Boolean); CTX.trace = []; code = runScript_text(CTX.compoundLines.join('\n'), sink); }
    else code = runText(line, sink);
  } catch (e) { console.error(e); termWrite(`bash: ${e.message || e}\n`, 'err'); code = 1; }
  S.lastExit = code; CTX.code = code;
  const ctx = CTX; CTX = null; LAST_CTX = ctx;
  if (ctx.clear) clearTerm();
  updatePrompt();
  $('#vizCmd').textContent = '$ ' + line;
  vizLoad(ctx);
  checkChallenge(ctx);
  if (S.fg) startFg();
  scrollTerm();
}
let fgTimer = null;
function startFg() {
  $('.inrow').style.visibility = 'hidden';
  termWrite(`\x1b[2m(${S.fg.cmd} is running in the foreground — press Ctrl+C to stop it or Ctrl+Z to suspend it)\x1b[0m\n`);
  clearInterval(fgTimer);
  fgTimer = setInterval(() => { if (!S.fg) return endFg(); if (Date.now() > S.fg.until) { const p = procBy(S.fg.pid); if (p) S.procs = S.procs.filter(x => x !== p); S.fg = null; endFg(); } }, 250);
}
function endFg() { clearInterval(fgTimer); $('.inrow').style.visibility = ''; updatePrompt(); scrollTerm(); $('#cmd').focus(); }
function fgKey(e) {
  if (!S.fg) return false;
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); termWrite('^C\n'); const p = procBy(S.fg.pid); if (p) S.procs = S.procs.filter(x => x !== p); S.fg = null; S.lastExit = 130; endFg(); return true; }
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); const p = procBy(S.fg.pid); const n = (S.jobs.reduce((m, j) => Math.max(m, j.n), 0)) + 1; if (p) { p.st = 'T'; p.job = n; S.jobs.push({ n, pid: p.pid, cmd: S.fg.cmd, st: 'Stopped' }); } termWrite(`^Z\n[${n}]+  Stopped                 ${S.fg.cmd}\n`); S.fg = null; S.lastExit = 148; endFg(); return true; }
  e.preventDefault(); return true;
}
function typeAndRun(cmd, run = true) {
  const inp = $('#cmd'); if (S.fg) return;
  inp.value = ''; inp.focus();
  if (window.innerWidth < 900) $('#term').scrollIntoView({ behavior: 'smooth', block: 'center' });
  let i = 0; const step = () => { inp.value = cmd.slice(0, ++i); if (i < cmd.length) setTimeout(step, 14); else if (run) { setTimeout(() => { inp.value = ''; submit(cmd); }, 160); } };
  step();
}

/* ---------- tab completion ---------- */
function complete(inp) {
  const v = inp.value.slice(0, inp.selectionStart), after = inp.value.slice(inp.selectionStart);
  const m = /(\S*)$/.exec(v); const word = m[1]; const before = v.slice(0, v.length - word.length);
  const isCmd = !before.trim() || /(\||&&|;|\|\||sudo)\s*$/.test(before);
  let cands = [];
  if (isCmd && !word.includes('/')) cands = [...new Set([...Object.keys(CMDS), ...Object.keys(S.aliases), ...Object.keys(S.funcs)])].filter(c => c.startsWith(word)).sort().map(c => c + ' ');
  else {
    const exp = word.replace(/^~/, home()); const slash = exp.lastIndexOf('/');
    const dir = slash >= 0 ? exp.slice(0, slash + 1) : ''; const pre = slash >= 0 ? exp.slice(slash + 1) : exp;
    const r = lookup(dir || '.');
    if (r.n && r.n.t === 'd' && can(r.n, 'r')) cands = readdirNames(r.n, r.path).filter(n => n.startsWith(pre) && (pre.startsWith('.') || !n.startsWith('.'))).sort().map(n => { const c = lookup((dir || './') + n); return word.slice(0, word.length - pre.length) + n + (c.n && c.n.t === 'd' ? '/' : ' '); });
  }
  if (!cands.length) return;
  if (cands.length === 1) { inp.value = before + cands[0] + after; UI.tabCount = 0; return; }
  let cp = cands[0]; for (const c of cands) while (!c.startsWith(cp)) cp = cp.slice(0, -1);
  if (cp.length > word.length) { inp.value = before + cp + after; UI.tabCount = 0; return; }
  if (++UI.tabCount >= 2) { echoCommand(inp.value); termWrite(cands.map(c => c.trim().split('/').filter(Boolean).pop() + (c.endsWith('/') ? '/' : '')).join('  ') + '\n'); UI.tabCount = 0; }
}

/* ---------- sidebar ---------- */
function modDone(m) { return m.ids.every(id => UI.done[id]); }
function isLocked(id) {
  if (UI.sandbox || UI.unlockAll) return false;
  const idx = MODULES.indexOf(modOf(id));
  return MODULES.slice(0, idx).some(x => !modDone(x));
}
function renderSidebar() {
  const nav = $('#lessonNav'); nav.innerHTML = '';
  let lastLvl = null;
  for (const m of lessonsOf(UI.level)) {
    if (m.level !== lastLvl && UI.level !== 'beginner') { const h = document.createElement('div'); h.className = 'side-head'; h.style.paddingTop = '10px'; h.innerHTML = `<span>— ${m.level.toUpperCase()} —</span>`; nav.appendChild(h); lastLvl = m.level; }
    const done = m.ids.filter(id => UI.done[id]).length;
    const sec = document.createElement('div'); sec.className = 'mod';
    sec.innerHTML = `<h3><span>${esc(m.title)}</span><span>${done}/${m.ids.length}</span></h3><div class="bar"><i style="width:${done / m.ids.length * 100}%"></i></div><ul></ul>`;
    for (const id of m.ids) {
      const L = L_(id); const li = document.createElement('li'); const b = document.createElement('button');
      const locked = isLocked(id);
      b.className = (id === UI.lesson ? 'cur' : '') + (locked ? ' locked' : '');
      b.innerHTML = `<span class="st ${UI.done[id] ? 'ok' : ''}">${UI.done[id] ? '✓' : locked ? '🔒' : id === UI.lesson ? '●' : '○'}</span><span>${esc(L.n)}</span>`;
      b.setAttribute('aria-label', `${L.n}${UI.done[id] ? ' (completed)' : locked ? ' (locked)' : ''}`);
      if (id === UI.lesson) b.setAttribute('aria-current', 'true');
      b.onclick = () => { if (locked) { toast('🔒 Finish the earlier modules first — or tick “Unlock all”.'); return; } openLesson(id); closeDrawer(); };
      li.appendChild(b); sec.querySelector('ul').appendChild(li);
    }
    nav.appendChild(sec);
  }
}
function openLesson(id, keepLevel) {
  const L = L_(id); if (!L) return;
  const m = modOf(id);
  if (LEVELS.indexOf(m.level) > LEVELS.indexOf(UI.level) && !keepLevel) { UI.level = m.level; renderLevel(); }
  UI.lesson = id; UI.lastLesson[UI.level] = id; save();
  $('#lessonTitle').textContent = L.n;
  $('#lessonSub').textContent = `${m.title} · ${m.level[0].toUpperCase() + m.level.slice(1)}`;
  const tryCmd = L.c && L.c.try || (L.e && L.e[0] && L.e[0][0]) || L.n;
  $('#tryChip').textContent = 'Try: ' + tryCmd; $('#tryChip').onclick = () => { const i = $('#cmd'); i.value = tryCmd; i.focus(); };
  renderChallenge(); renderSidebar(); renderExplain();
  $('#right').scrollTop = 0;
}
function renderLevel() { document.querySelectorAll('.levels button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === UI.level))); }

/* ---------- challenges ---------- */
function ran(ctx, name) { return ctx.pipes.some(p => p.cmds.some(c => { let r = c; while (r) { if (r.name === name) return true; r = r.inner; } return false; })); }
function chalOf(L) {
  if (L.c && (L.c.chk || L.c.steps)) return L.c;
  const k = L.k || L.n;
  return { t: (L.c && L.c.t) || `Run ${L.n} successfully at least once (try the suggestion chip or a “Run it” example).`, try: (L.c && L.c.try) || (L.e && L.e[0][0]), chk: ctx => (ran(ctx, k) || ctx.line.includes(k)) && ctx.code === 0 };
}
function renderChallenge() {
  const box = $('#challenge'); const L = L_(UI.lesson);
  $('#resetBtn').hidden = !UI.sandbox;
  if (UI.sandbox) { box.hidden = true; return; }
  box.hidden = false;
  const c = chalOf(L); const ok = UI.chal[L.id]; const qok = (UI.quiz[L.id] || {}).pass;
  box.className = 'challenge' + (ok ? ' ok' : '');
  let html = `<b>${ok ? '✓ Challenge complete' : 'Challenge'}:</b> ${c.t}`;
  if (c.steps) html += `<ol class="steps">${c.steps.map((s, i) => `<li class="${(UI.chalProg[L.id] || [])[i] ? 'ok' : ''}">${(UI.chalProg[L.id] || [])[i] ? '✓ ' : ''}${s[0]}</li>`).join('')}</ol>`;
  html += `<div style="margin-top:4px;font-size:12px;color:var(--muted)">${ok ? '' : 'The app checks the simulated system after each command.'} ${UI.done[L.id] ? '<span style="color:var(--green)">Lesson complete ✓</span>' : qok ? 'Quiz passed ✓' : 'Also pass the quiz (bottom of the right panel) to complete the lesson.'}</div>`;
  box.innerHTML = html;
}
function checkChallenge(ctx) {
  if (UI.sandbox) return;
  const L = L_(UI.lesson); if (!L || UI.chal[L.id]) return;
  ctx.raw = ctx.raw || ctx.line;
  const c = chalOf(L); let ok = false;
  try {
    if (c.steps) { const pr = UI.chalProg[L.id] = UI.chalProg[L.id] || []; c.steps.forEach((s, i) => { if (!pr[i] && s[1](ctx)) pr[i] = true; }); ok = c.steps.every((s, i) => pr[i]); }
    else ok = !!c.chk(ctx);
  } catch (e) { console.error(e); }
  if (ok) { UI.chal[L.id] = true; termWrite(`\x1b[32m✔ Challenge complete: ${strip(c.t).replace(/<[^>]+>/g, '')}\x1b[0m\n`); toast('🎉 Challenge complete!'); markDone(L.id); }
  save(); renderChallenge();
}
function markDone(id) {
  if (UI.chal[id] && (UI.quiz[id] || {}).pass && !UI.done[id]) { UI.done[id] = true; toast(`✅ Lesson “${L_(id).n}” complete!`); save(); renderSidebar(); }
  renderChallenge();
}

/* ---------- explanation ---------- */
const SECS = ['What it does', 'Syntax breakdown', 'Step-by-step execution', 'Options / flags', 'Examples', 'Under the hood', 'Common mistakes & gotchas', '⚠ Safety', 'Related commands', 'Cheat sheet', 'Quick quiz'];
const LEVEL_SECS = { beginner: [1, 2, 3, 4, 5, 7, 8, 10, 11], intermediate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], advanced: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
function sec(n, body) { return `<details class="sec" open><summary><span class="n">${n}.</span> ${SECS[n - 1]}</summary><div class="sec-b">${body}</div></details>`; }
function codeChip(s) { return `<code>${esc(s)}</code>`; }
function execStepsHTML(L) {
  const lvl = UI.level, beg = lvl === 'beginner';
  const ex = L.ex1 || (L.c && L.c.try) || (L.e && L.e[0][0]) || L.n;
  let toks = []; try { toks = lex(ex); } catch (e) { }
  const first = (toks.find(t => t.w && !/^[A-Za-z_]\w*=/.test(t.w)) || {}).w || L.n;
  const name = first === 'sudo' ? ((toks.filter(t => t.w)[1] || {}).w || 'sudo') : first;
  const items = [];
  items.push(['a', `<b>Tokenize:</b> the shell reads <code>${esc(ex)}</code> and splits it on spaces (respecting quotes) into words and operators:<div class="toks">${toks.map(t => codeChip(t.w ?? t.op)).join('')}</div>`]);
  if (!beg) {
    const rec = []; toks.forEach(t => { if (t.w) try { expandWord(t.w, rec, false, true); } catch (e) { } });
    items.push(['b', `<b>Expansion:</b> ${rec.length ? rec.map(r => `${codeChip(r.from)} → ${codeChip(r.to)}`).join(', ') : 'nothing to expand here — no <code>~</code>, <code>$VARIABLES</code>, <code>*.txt</code> globs or <code>$(command)</code>.'} <span style="color:var(--muted)">Order: brace → tilde → variables/arithmetic/command substitution → word splitting → globbing → quote removal.</span>`]);
  }
  const isB = BUILTINS.has(name), path = findInPath(name), al = S.aliases[name];
  items.push(['c', `<b>Find the command:</b> ${al ? `alias? <b>yes</b> → “${esc(al)}”. ` : 'alias? no. '}builtin? <b>${isB ? 'yes' : 'no'}</b>. function? no.${!isB ? ` Search each directory in <code>$PATH</code> → found <code>${esc(path || '(not found)')}</code>.` : ` ${name} runs inside bash${path ? ` (there is also ${esc(path)}, but the builtin wins)` : ''}.`}`]);
  if (!beg) {
    const pr = path ? lookup(path) : null;
    items.push(['d', `<b>Permission check:</b> ${isB ? 'builtins need no exec permission.' : pr && pr.n ? `<code>${esc(path)}</code> is <code>${modeStr(pr.n)}</code> — “x” for others means every user may run it.${pr.n.mode & 0o4000 ? ' The <b>s</b> (setuid) bit makes it run with the OWNER\'s (root\'s) privileges.' : ''}` : 'the kernel checks the x bit during execve().'}`]);
    items.push(['e', isB ? `<b>No fork/exec:</b> ${name} is executed by the shell process itself. ${L.bw || (name === 'cd' ? '<b>Why cd must be a builtin:</b> every process has its OWN current directory. If cd were a separate program, it would change its own directory and exit — the shell\'s directory would stay the same.' : 'Builtins exist for speed or because they must change the shell\'s own state.')}` : `<b>fork() + exec():</b> bash calls fork() to clone itself (the child gets a new PID, e.g. 2143), then the child calls execve("${esc(path || name)}", …) which replaces its memory with the ${esc(name)} program. The parent shell waits (wait4) unless you used &.`]);
  }
  if (!beg && L.sc && L.sc.length) items.push(['f', `<b>System calls (in order):</b><ol class="sys">${L.sc.map(s => `<li><b>${esc(lvl === 'advanced' && s[2] ? s[2] : s[0])}</b> — ${s[1]}</li>`).join('')}</ol>`]);
  items.push(['g', `<b>What changes:</b> ${L.ch || 'nothing on disk — it only reads information.'}`]);
  items.push(['h', `<b>Output:</b> ${L.out || 'results go to stdout (fd 1); error messages go to stderr (fd 2).'}`]);
  if (!beg) items.push(['i', `<b>Exit code:</b> ${L.ec || '0 = success, non-zero = error.'} Check it with <code>echo $?</code>.`]);
  return `<p style="color:var(--muted)">What happens when you press Enter on <code>${esc(ex)}</code>. The live diagram above animates the command <i>you</i> actually ran.</p><ol class="exec">${items.map(([k, h]) => `<li data-k="${k}" style="list-style:none">${h}</li>`).join('')}</ol>`;
}
function renderExplain() {
  const L = L_(UI.lesson); const lvl = UI.level; const show_ = LEVEL_SECS[lvl];
  let h = '';
  const S1 = `<p style="font-size:15px"><b>${esc(L.n)}</b> — ${L.s}</p><div class="analogy">💡 <b>Analogy:</b> ${L.an}</div><p><b>Name:</b> ${L.nm}</p>`;
  const parts = (L.p || []);
  const S2 = `<div class="syn">${parts.map(p => `<span class="${p[1]}">${esc(p[0])}</span>`).join('')}</div><div class="tbl-wrap"><table><tr><th>Part</th><th>Type</th><th>Meaning</th><th></th></tr>${parts.map(p => `<tr><td><code>${esc(p[0])}</code></td><td>${{ cmd: 'command', opt: 'option(s)', arg: 'argument' }[p[1]]}</td><td>${p[2]}</td><td>${p[3] ? '<span class="req">required</span>' : '<span class="optl">optional</span>'}</td></tr>`).join('')}</table></div><p style="font-size:13px;color:var(--muted)">Notation: <code>[ ]</code> optional · <code>...</code> may repeat · <code>a|b</code> one or the other · CAPITALS = replace with your value. <a href="#" data-gloss="syntax notation">More on syntax notation</a></p>`;
  const S3 = execStepsHTML(L);
  const flags = lvl === 'beginner' ? (L.f || []).filter(f => f[4]) : (L.f || []);
  const S4 = flags.length ? `<div class="tbl-wrap"><table><tr><th>Flag</th><th>Long form</th><th>Meaning</th><th>Example</th></tr>${flags.map(f => `<tr><td><code>${esc(f[0])}</code>${f[4] ? ' ⭐' : ''}</td><td>${f[1] ? `<code>${esc(f[1])}</code>` : '—'}</td><td>${f[2]}</td><td><code>${esc(f[3] || '')}</code></td></tr>`).join('')}</table></div><p style="font-size:13px;color:var(--muted)">⭐ = most used. ${lvl === 'beginner' && (L.f || []).length > flags.length ? `Showing the top flags — switch to Intermediate to see all ${L.f.length}. ` : ''}Short flags can be combined: <code>-la</code> = <code>-l -a</code>. Long flags use two dashes and can't be combined.</p>` : '<p>This has no flags of its own — its behaviour is controlled by its arguments or syntax.</p>';
  const S5 = (L.e || []).map(e => `<div class="ex"><div class="ex-h"><code>$ ${esc(e[0])}</code><button class="run" data-run="${esc(e[0])}" aria-label="Run ${esc(e[0])} in the terminal">▶ Run it</button></div>${e[1] ? `<pre>${esc(e[1])}</pre>` : ''}<p>${e[2]}</p></div>`).join('');
  const S6 = (L.u || '') + (lvl === 'advanced' && L.adv ? `<div class="adv"><h4>🔬 Advanced: kernel view</h4>${L.adv}</div>` : '');
  const S7 = (L.mi || []).map(m => `<div class="mistake"><div>✗ <span class="w">${esc(m[0])}</span></div><div style="margin:4px 0">${m[1]}</div><div>✓ <span class="r">${esc(m[2])}</span></div></div>`).join('');
  const S8 = L.w ? `<div class="warn"><b>⚠ Warning:</b> ${L.w}</div>` : `<div class="calm">✓ <b>Low risk.</b> ${L.safe || 'This command does not delete or overwrite data on its own. (Combining it with > redirection or sudo can still change files — see those lessons.)'}</div>`;
  const S9 = `<div class="rel">${(L.r || []).map(r => { const R = LESSONS[r[0]]; return `<button data-lesson="${esc(r[0])}"><b>${esc(R ? R.n : r[0])}</b><span>${r[1]}</span></button>`; }).join('')}</div>`;
  const S10 = `<div class="cheat"><ol>${(L.cs || []).map(c => `<li>${c}</li>`).join('')}</ol></div><button class="btn" style="margin-top:8px" data-copy>📋 Copy cheat sheet</button>`;
  const qs = UI.quiz[L.id] || {};
  const S11 = (L.q || []).map((q, qi) => { const a = (qs.ans || [])[qi]; return `<div class="quiz-q" data-q="${qi}"><b>Q${qi + 1}. ${q[0]}</b><div class="opts">${q[1].map((o, oi) => `<button data-o="${oi}" class="${a != null ? (oi === q[2] ? 'right' : oi === a ? 'wrong' : '') : ''}" ${a != null ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>${a != null ? `<div class="expl">${a === q[2] ? '✅ Correct!' : '❌ Not quite.'} ${q[3]}</div>` : ''}</div>`; }).join('') + `<div class="score">${qs.ans && qs.ans.filter(x => x != null).length === (L.q || []).length ? `Score: ${qs.score}/${L.q.length} ${qs.pass ? '— passed ✓' : '— need 2 of 3 to pass.'} <button class="btn" data-retry>Retry quiz</button>` : 'Answer all 3 questions (2 correct to pass).'}</div>`;
  const BODY = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11];
  for (const n of show_) h += sec(n, BODY[n - 1]);
  const ex = $('#explain'); ex.innerHTML = h;
  linkGlossary(ex);
  ex.querySelectorAll('[data-calc]').forEach(mountCalc);
}
function quizAnswer(qi, oi) {
  const L = L_(UI.lesson); const qs = UI.quiz[L.id] = UI.quiz[L.id] || { ans: [] };
  if (qs.ans[qi] != null) return;
  qs.ans[qi] = oi;
  const answered = qs.ans.filter(x => x != null).length;
  if (answered === L.q.length) { qs.score = L.q.filter((q, i) => qs.ans[i] === q[2]).length; qs.pass = qs.pass || qs.score >= 2; if (qs.pass) { toast(qs.score === 3 ? '🧠 Perfect quiz!' : '👍 Quiz passed'); markDone(L.id); } }
  save(); renderExplain(); renderChallenge();
  const el = document.querySelector(`.quiz-q[data-q="${qi}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
}
function mountCalc(el) {
  let m = parseInt(el.dataset.calc || '644', 8);
  const draw = () => {
    const rows = ['Owner', 'Group', 'Others'];
    el.innerHTML = `<div class="calc"><span></span><b style="text-align:center">r (4)</b><b style="text-align:center">w (2)</b><b style="text-align:center">x (1)</b><b style="text-align:center">octal</b>${rows.map((r, ri) => `<span>${r}</span>${[4, 2, 1].map(b => `<button aria-pressed="${!!(m >> ((2 - ri) * 3) & b)}" class="${(m >> ((2 - ri) * 3)) & b ? 'on' : ''}" data-b="${b << ((2 - ri) * 3)}">${(m >> ((2 - ri) * 3)) & b ? 'rwx'[[4, 2, 1].indexOf(b)] : '-'}</button>`).join('')}<span class="o">${(m >> ((2 - ri) * 3)) & 7}</span>`).join('')}</div><div class="calc-out">${modeStr({ t: 'f', mode: m })} &nbsp;=&nbsp; <span style="color:var(--purple)">chmod ${m.toString(8).padStart(3, '0')} file</span></div>`;
    el.querySelectorAll('button').forEach(b => b.onclick = () => { m ^= +b.dataset.b; draw(); });
  };
  draw();
}

/* ---------- glossary ---------- */
let GL_RE = null;
function glossTerms() { const out = []; for (const [k, g] of Object.entries(GLOSSARY)) { out.push([k, k]); (g.aka || []).forEach(a => out.push([a, k])); } return out.sort((a, b) => b[0].length - a[0].length); }
function linkGlossary(root) {
  const terms = glossTerms(); const map = new Map(terms.map(([t, k]) => [t.toLowerCase(), k]));
  if (!GL_RE) GL_RE = new RegExp(`(?<![\\w$/.-])(${terms.map(t => t[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`, 'i');
  root.querySelectorAll('details.sec').forEach(sec => {
    const used = new Set();
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('code,pre,button,summary,.gl,a,.syn,.cheat,b.k') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let tn of nodes) {
      let guard = 0;
      while (tn && guard++ < 20) {
        const m = GL_RE.exec(tn.nodeValue); if (!m) break;
        const key = map.get(m[1].toLowerCase());
        if (used.has(key)) { // skip this occurrence, continue after it
          const rest = tn.splitText(m.index + m[1].length); tn = rest; continue;
        }
        used.add(key);
        const mid = tn.splitText(m.index); const after = mid.splitText(m[1].length);
        const sp = document.createElement('span'); sp.className = 'gl'; sp.dataset.term = key; sp.textContent = mid.nodeValue; sp.tabIndex = 0;
        mid.replaceWith(sp); tn = after;
      }
    }
  });
}
function openGlossary(term) {
  $('#glossModal').hidden = false; $('#glossSearch').value = ''; renderGlossList('');
  showGloss(term || Object.keys(GLOSSARY).sort()[0]);
  $('#glossSearch').focus();
}
function renderGlossList(q) {
  const list = $('#glossList'); list.innerHTML = '';
  Object.keys(GLOSSARY).sort((a, b) => a.localeCompare(b)).filter(k => !q || k.toLowerCase().includes(q.toLowerCase()) || GLOSSARY[k].d.toLowerCase().includes(q.toLowerCase()) || (GLOSSARY[k].aka || []).some(a => a.toLowerCase().includes(q.toLowerCase()))).forEach(k => { const b = document.createElement('button'); b.textContent = k; b.dataset.g = k; b.onclick = () => showGloss(k); list.appendChild(b); });
}
function showGloss(k) {
  const g = GLOSSARY[k]; if (!g) return;
  document.querySelectorAll('#glossList button').forEach(b => b.classList.toggle('cur', b.dataset.g === k));
  $('#glossEntry').innerHTML = `<h2>${esc(k)}</h2>${g.aka ? `<p style="color:var(--muted)">Also: ${g.aka.map(esc).join(', ')}</p>` : ''}<p><b>${g.s}</b></p><p>${g.d}</p>${g.see ? `<div class="see">See also: ${g.see.map(s => GLOSSARY[s] ? `<button data-g2="${esc(s)}">${esc(s)}</button>` : LESSONS[s] ? `<button data-lesson="${esc(s)}">lesson: ${esc(LESSONS[s].n)}</button>` : '').join('')}</div>` : ''}${g.lesson ? `<p><button class="btn" data-lesson="${esc(g.lesson)}">Open lesson: ${esc(LESSONS[g.lesson] ? LESSONS[g.lesson].n : g.lesson)}</button></p>` : ''}`;
  $('#glossEntry').querySelectorAll('[data-g2]').forEach(b => b.onclick = () => showGloss(b.dataset.g2));
}

/* ---------- tooltip ---------- */
function showTip(el, html) { const t = $('#tip'); t.innerHTML = html; const r = el.getBoundingClientRect(); t.classList.add('on'); const tw_ = t.offsetWidth; t.style.left = Math.max(8, Math.min(window.innerWidth - tw_ - 8, r.left)) + 'px'; const below = r.bottom + 6; t.style.top = (below + t.offsetHeight > window.innerHeight ? r.top - t.offsetHeight - 6 : below) + 'px'; }
function hideTip() { $('#tip').classList.remove('on'); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#shade').classList.remove('on'); }

/* ---------- boot ---------- */
function banner() {
  termWrite('\x1b[1mWelcome to Linux Visualized\x1b[0m — a simulated Ubuntu 24.04 system running entirely in your browser.\n');
  termWrite('\x1b[2mNothing here touches your real computer. Type commands, press Tab to autocomplete, ↑/↓ for history.\nHover any part of a command you ran to see what it means. Type help for all commands.\x1b[0m\n\n');
}
function setTheme(t) { UI.theme = t; document.documentElement.dataset.theme = t; $('#themeBtn').textContent = t === 'dark' ? '☾' : '☀'; save(); }
function init() {
  load(); newSystem();
  setTheme(UI.theme || 'dark');
  initViz(); renderLevel();
  $('#unlockAll').checked = !!UI.unlockAll;
  const startId = (UI.lesson && LESSONS[UI.lesson]) ? UI.lesson : ownModules(UI.level)[0].ids[0];
  openLesson(startId);
  banner(); updatePrompt();
  const inp = $('#cmd');
  inp.addEventListener('keydown', e => {
    if (fgKey(e)) return;
    if (e.key === 'Enter') { const v = inp.value; inp.value = ''; submit(v); return; }
    if (e.key === 'Tab') { e.preventDefault(); complete(inp); return; }
    UI.tabCount = 0;
    if (e.key === 'ArrowUp') { e.preventDefault(); if (!S.history.length) return; UI.hIdx = UI.hIdx == null ? S.history.length - 1 : Math.max(0, UI.hIdx - 1); inp.value = S.history[UI.hIdx]; setTimeout(() => inp.setSelectionRange(inp.value.length, inp.value.length)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (UI.hIdx == null) return; UI.hIdx++; if (UI.hIdx >= S.history.length) { UI.hIdx = null; inp.value = ''; } else inp.value = S.history[UI.hIdx]; return; }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); clearTerm(); return; }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && inp.selectionStart === inp.selectionEnd) { e.preventDefault(); echoCommand(inp.value + '^C'); inp.value = ''; S.lastExit = 130; return; }
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); inp.value = inp.value.slice(inp.selectionStart); return; }
  });
  document.addEventListener('keydown', e => { if (S.fg && document.activeElement !== inp) fgKey(e); if (e.key === 'Escape') { if (!$('#glossModal').hidden) $('#glossModal').hidden = true; closeDrawer(); } });
  $('#term').addEventListener('mouseup', () => { if (!window.getSelection().toString()) inp.focus(); });
  document.addEventListener('mouseover', e => { const t = e.target.closest('.tok,.gl'); if (!t) return; if (t.classList.contains('tok')) showTip(t, t.dataset.tipHtml); else { const g = GLOSSARY[t.dataset.term]; if (g) showTip(t, `<b>${esc(t.dataset.term)}</b> ${g.s}<br><span style="color:var(--muted);font-size:11px">click for the full entry</span>`); } });
  document.addEventListener('mouseout', e => { if (e.target.closest('.tok,.gl')) hideTip(); });
  document.addEventListener('focusin', e => { const t = e.target.closest('.gl'); if (t && GLOSSARY[t.dataset.term]) showTip(t, `<b>${esc(t.dataset.term)}</b> ${GLOSSARY[t.dataset.term].s}`); });
  document.addEventListener('focusout', e => { if (e.target.closest('.gl')) hideTip(); });
  document.addEventListener('click', e => {
    const gl = e.target.closest('.gl'); if (gl) { hideTip(); openGlossary(gl.dataset.term); return; }
    const gd = e.target.closest('[data-gloss]'); if (gd) { e.preventDefault(); openGlossary(gd.dataset.gloss); return; }
    const run = e.target.closest('[data-run]'); if (run) { typeAndRun(run.dataset.run); return; }
    const ls = e.target.closest('[data-lesson]'); if (ls) { const id = ls.dataset.lesson; if (!LESSONS[id]) return; $('#glossModal').hidden = true; if (isLocked(id)) { toast('🔒 That lesson is locked — tick “Unlock all” to jump ahead.'); return; } openLesson(id); return; }
    const q = e.target.closest('.quiz-q button'); if (q) { quizAnswer(+q.closest('.quiz-q').dataset.q, +q.dataset.o); return; }
    if (e.target.closest('[data-retry]')) { const L = L_(UI.lesson); const pass = (UI.quiz[L.id] || {}).pass; UI.quiz[L.id] = { ans: [], pass }; save(); renderExplain(); return; }
    if (e.target.closest('[data-copy]')) { const L = L_(UI.lesson); const text = `${L.n} — cheat sheet\n` + (L.cs || []).map((c, i) => `${i + 1}. ${c.replace(/<[^>]+>/g, '')}`).join('\n'); const done = () => toast('📋 Cheat sheet copied'); try { navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); } catch (er) { fallbackCopy(text, done); } }
  });
  document.querySelectorAll('.levels button').forEach(b => b.onclick = () => { UI.level = b.dataset.level; renderLevel(); const id = UI.lastLesson[UI.level] && LESSONS[UI.lastLesson[UI.level]] ? UI.lastLesson[UI.level] : ownModules(UI.level)[0].ids[0]; openLesson(id); if (V.ctx) vizLoad(V.ctx); save(); });
  $('#sandboxBtn').onclick = () => { UI.sandbox = !UI.sandbox; $('#sandboxBtn').setAttribute('aria-pressed', String(UI.sandbox)); renderChallenge(); renderSidebar(); toast(UI.sandbox ? '🧪 Sandbox: everything unlocked, no challenges. Reset any time.' : 'Lesson mode'); };
  $('#resetBtn').onclick = () => { newSystem(); SH.args = [['bash']]; clearTerm(); banner(); termWrite('\x1b[32mSystem reset to its starting state.\x1b[0m\n'); updatePrompt(); welcomeViz(); V.steps = []; V.ctx = null; renderTimeline(); };
  $('#unlockAll').onchange = e => { UI.unlockAll = e.target.checked; save(); renderSidebar(); };
  $('#glossBtn').onclick = () => openGlossary();
  $('#glossClose').onclick = () => { $('#glossModal').hidden = true; };
  $('#glossModal').onclick = e => { if (e.target.id === 'glossModal') $('#glossModal').hidden = true; };
  $('#glossSearch').oninput = e => { renderGlossList(e.target.value); const f = document.querySelector('#glossList button'); if (f) showGloss(f.dataset.g); };
  $('#themeBtn').onclick = () => setTheme(UI.theme === 'dark' ? 'light' : 'dark');
  $('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#shade').classList.add('on'); };
  $('#shade').onclick = closeDrawer;
  $('#vReplay').onclick = () => { if (!V.ctx) return; vizJump(-1); vizPlay(true); };
  $('#vPlay').onclick = () => { if (!V.steps.length) return; if (!V.playing && V.i >= V.steps.length - 1) vizJump(-1); vizPlay(!V.playing); };
  $('#vFwd').onclick = () => { vizPlay(false); if (V.i < V.steps.length - 1) vizApply(V.i + 1); };
  $('#vBack').onclick = () => { vizPlay(false); vizJump(Math.max(-1, V.i - 1)); };
  $('#vSpeed').oninput = e => { V.speed = +e.target.value; V.svg.style.setProperty('--dur', Math.round(450 / V.speed) + 'ms'); if (V.playing) vizPlay(true); };
  inp.focus();
}
function fallbackCopy(text, done) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the text manually'); } ta.remove(); }
