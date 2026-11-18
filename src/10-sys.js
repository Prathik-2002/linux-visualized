'use strict';
/* ================= SIMULATED SYSTEM STATE ================= */
let S;
const PATHDIRS = ['/usr/local/sbin','/usr/local/bin','/usr/sbin','/usr/bin','/sbin','/bin'];
const BUILTINS = new Set(['cd','pwd','echo','history','export','alias','unalias','type','exit','jobs','bg','fg','kill','umask','source','.','read','test','[','set','unset','true','false','help','let','declare','local','return','wait','printf','shift','logout']);
const BASE_T = new Date(2026, 10, 18, 9, 30).getTime();
const now = () => S ? (S.clock += 1000) : BASE_T;
const I = n => S.inodes[n];
const KB = 1024, MB = 1024 * 1024;

function mkIno(t, mode, uid, gid, extra) {
  const n = S.nextIno++;
  S.inodes[n] = Object.assign({ t, mode, uid, gid, nlink: t === 'd' ? 2 : 1, mtime: now(), ino: n }, t === 'd' ? { ent: {} } : t === 'f' ? { data: '' } : {}, extra || {});
  return n;
}
/* Build a path, creating missing parent dirs (owned by root, 755). Used only at setup. */
function put(path, t, opt = {}) {
  const comps = path.split('/').filter(Boolean);
  let cur = S.root;
  for (let i = 0; i < comps.length; i++) {
    const d = I(cur), last = i === comps.length - 1;
    if (d.ent[comps[i]] == null) {
      const typ = last ? t : 'd';
      const ino = mkIno(typ, last ? (opt.mode ?? (typ === 'd' ? 0o755 : 0o644)) : 0o755, last ? (opt.uid ?? 0) : 0, last ? (opt.gid ?? opt.uid ?? 0) : 0);
      const n = I(ino);
      if (last) { if (opt.data != null) n.data = opt.data; if (opt.sz != null) n.sz = opt.sz; if (opt.tgt) n.tgt = opt.tgt; if (opt.mt) n.mtime = BASE_T - opt.mt * 864e5; }
      d.ent[comps[i]] = ino;
      if (typ === 'd') d.nlink++;
    }
    cur = d.ent[comps[i]];
  }
  return cur;
}

const HOME_FILES = {
  'notes.txt': 'Linux notes\n- everything is a file\n- the shell is a program\n- use man to read manuals\nTODO: learn pipes\n',
  'script.sh': '#!/bin/bash\n# A tiny demo script\nname="Linux"\necho "Hello, $name!"\nfor i in 1 2 3; do\n  echo "Counting: $i"\ndone\nif [ -d docs ]; then\n  echo "docs folder exists"\nelse\n  echo "no docs folder"\nfi\n',
  'fruits.txt': 'banana\napple\ncherry\napple\nbanana\napple\ndate\n',
  'data.csv': 'name,dept,salary,city\nalice,eng,95000,Berlin\nbob,sales,62000,Paris\ncarol,eng,105000,Berlin\ndave,ops,58000,Madrid\nerin,sales,71000,Paris\n',
  'servers.txt': 'web01 10.0.0.11 up\nweb02 10.0.0.12 down\ndb01 10.0.0.21 up\ncache01 10.0.0.31 up\n',
  '.bashrc': '# ~/.bashrc: executed by bash for interactive shells\nexport EDITOR=nano\nalias ll="ls -la"\nalias la="ls -A"\nPS1="\\u@\\h:\\w\\$ "\n',
  '.profile': '# ~/.profile: executed by login shells\nif [ -f ~/.bashrc ]; then . ~/.bashrc; fi\nPATH="$HOME/bin:$PATH"\n',
};
const LOG_APP = Array.from({ length: 30 }, (_, i) => `2026-11-18 09:${String(i).padStart(2, '0')}:12 ${['INFO', 'INFO', 'WARN', 'INFO', 'ERROR'][i % 5]} ${['request served in 12ms', 'user login ok', 'disk 81% full', 'cache refreshed', 'database timeout after 30s'][i % 5]}`).join('\n') + '\n';

function newSystem() {
  S = { inodes: {}, nextIno: 2, clock: BASE_T, uid: 1000, cwd: '/home/user', host: 'linux' };
  S.root = mkIno('d', 0o755, 0, 0);
  S.users = {
    root: { uid: 0, gid: 0, home: '/root', shell: '/bin/bash', name: 'root' },
    daemon: { uid: 1, gid: 1, home: '/usr/sbin', shell: '/usr/sbin/nologin', name: 'daemon' },
    'www-data': { uid: 33, gid: 33, home: '/var/www', shell: '/usr/sbin/nologin', name: 'www-data' },
    user: { uid: 1000, gid: 1000, home: '/home/user', shell: '/bin/bash', name: 'User' },
    alice: { uid: 1001, gid: 1001, home: '/home/alice', shell: '/bin/bash', name: 'Alice' },
  };
  S.groups = { root: { gid: 0, m: [] }, daemon: { gid: 1, m: [] }, adm: { gid: 4, m: ['user'] }, sudo: { gid: 27, m: ['user'] }, 'www-data': { gid: 33, m: [] }, docker: { gid: 999, m: ['user'] }, user: { gid: 1000, m: [] }, alice: { gid: 1001, m: [] }, developers: { gid: 1002, m: ['user', 'alice'] } };
  S.env = { HOME: '/home/user', USER: 'user', LOGNAME: 'user', SHELL: '/bin/bash', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', PWD: '/home/user', LANG: 'en_US.UTF-8', TERM: 'xterm-256color', EDITOR: 'nano', HOSTNAME: 'linux' };
  S.vars = {}; S.aliases = { ll: 'ls -la', la: 'ls -A' }; S.funcs = {};
  S.umask = 0o022; S.lastExit = 0; S.history = []; S.userStack = [];
  // ---- directories
  for (const d of ['bin', 'sbin', 'lib', 'boot', 'dev', 'etc', 'home', 'media', 'mnt', 'opt', 'proc', 'run', 'srv', 'sys', 'usr/bin', 'usr/sbin', 'usr/lib', 'usr/local/bin', 'usr/share/doc', 'var/log', 'var/www/html', 'var/spool/cron/crontabs', 'var/lib/apt', 'var/cache/apt'].map(x => '/' + x)) put(d, 'd');
  put('/tmp', 'd', { mode: 0o1777 });
  put('/root', 'd', { mode: 0o700 });
  put('/root/.bashrc', 'f', { mode: 0o644, data: '# root bashrc\n' });
  put('/root/secret.txt', 'f', { mode: 0o600, data: 'root-only data\n' });
  put('/home/user', 'd', { mode: 0o755, uid: 1000 });
  put('/home/alice', 'd', { mode: 0o750, uid: 1001 });
  put('/home/alice/diary.txt', 'f', { mode: 0o600, uid: 1001, data: 'Dear diary...\n' });
  const H = (p, o) => put('/home/user/' + p, o.t || 'f', Object.assign({ uid: 1000 }, o));
  H('docs', { t: 'd' }); H('backup', { t: 'd' }); H('logs', { t: 'd' }); H('projects', { t: 'd' }); H('projects/website', { t: 'd' }); H('bin', { t: 'd' });
  H('docs/report.txt', { data: 'Quarterly report\nRevenue grew 12%\nCosts fell 3%\nConclusion: good quarter\n', mt: 3 });
  H('docs/todo.md', { data: '# TODO\n- [x] install linux\n- [ ] learn chmod\n- [ ] write a script\n', mt: 1 });
  H('docs/readme.txt', { data: 'This folder holds documents.\n', mt: 10 });
  H('logs/app.log', { data: LOG_APP, sz: 2.4 * MB, mt: 0 });
  H('logs/error.log', { data: LOG_APP.split('\n').filter(l => /ERROR|WARN/.test(l)).join('\n') + '\n', sz: 1.3 * MB, mt: 2 });
  H('logs/access.log', { data: '10.0.0.5 - - [18/Nov/2026:09:01:00] "GET / HTTP/1.1" 200 512\n10.0.0.7 - - [18/Nov/2026:09:02:10] "GET /login HTTP/1.1" 200 1024\n10.0.0.5 - - [18/Nov/2026:09:03:44] "POST /login HTTP/1.1" 302 0\n10.0.0.9 - - [18/Nov/2026:09:04:01] "GET /admin HTTP/1.1" 403 128\n', sz: 300 * KB, mt: 9 });
  H('projects/website/index.html', { data: '<!doctype html>\n<h1>My site</h1>\n' });
  H('projects/website/style.css', { data: 'body { font-family: sans-serif; }\n' });
  for (const [k, v] of Object.entries(HOME_FILES)) H(k, { data: v, mode: k === 'script.sh' ? 0o644 : 0o644 });
  // ---- /etc
  put('/etc/hostname', 'f', { data: 'linux\n' });
  put('/etc/hosts', 'f', { data: '127.0.0.1\tlocalhost\n127.0.1.1\tlinux\n10.0.0.11\tweb01\n10.0.0.21\tdb01\n' });
  put('/etc/os-release', 'f', { data: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n' });
  put('/etc/shadow', 'f', { mode: 0o640, gid: 42, data: 'root:*:19700:0:99999:7:::\nuser:$6$Xy..hash..:19700:0:99999:7:::\n' });
  put('/etc/sudoers', 'f', { mode: 0o440, data: '# /etc/sudoers — edit ONLY with visudo\nDefaults\tenv_reset\nroot\tALL=(ALL:ALL) ALL\n%sudo\tALL=(ALL:ALL) ALL\n' });
  put('/etc/fstab', 'f', { data: '# <file system>  <mount point>  <type>  <options>  <dump>  <pass>\nUUID=3f1c-a9e2  /      ext4  errors=remount-ro  0  1\nUUID=77b0-12cd  /boot  ext4  defaults           0  2\n/swapfile       none   swap  sw                 0  0\n' });
  put('/etc/crontab', 'f', { data: '# m h dom mon dow user  command\n17 *  * * *  root  cd / && run-parts --report /etc/cron.hourly\n25 6  * * *  root  test -x /usr/sbin/anacron || run-parts /etc/cron.daily\n' });
  put('/etc/resolv.conf', 'f', { data: 'nameserver 127.0.0.53\noptions edns0\n' });
  put('/etc/systemd/system', 'd');
  put('/etc/nginx/nginx.conf', 'f', { data: 'user www-data;\nworker_processes auto;\nhttp { server { listen 80; root /var/www/html; } }\n' });
  put('/var/www/html/index.html', 'f', { data: '<h1>Welcome to nginx!</h1>\n' });
  put('/var/log/syslog', 'f', { mode: 0o640, gid: 4, data: 'Nov 18 09:00:01 linux CRON[412]: (root) CMD (run-parts /etc/cron.hourly)\nNov 18 09:10:44 linux sshd[345]: Accepted publickey for user from 10.0.0.5\nNov 18 09:12:02 linux kernel: [ 3021.11] usb 1-1: new high-speed USB device\nNov 18 09:20:13 linux systemd[1]: Started nginx.service.\n' });
  put('/var/log/auth.log', 'f', { mode: 0o640, gid: 4, data: 'Nov 18 09:10:44 linux sshd[345]: Accepted publickey for user\nNov 18 09:11:02 linux sudo: user : TTY=pts/0 ; PWD=/home/user ; USER=root ; COMMAND=/usr/bin/apt update\n' });
  put('/dev/null', 'f', { mode: 0o666, dev: 'null' }); put('/dev/sda', 'f', { mode: 0o660, gid: 6, dev: 'blk' }); put('/dev/sda1', 'f', { mode: 0o660, gid: 6, dev: 'blk' }); put('/dev/sdb1', 'f', { mode: 0o660, gid: 6, dev: 'blk' }); put('/dev/random', 'f', { mode: 0o666, dev: 'rand' });
  put('/media/usb', 'd');
  put('/sys/fs/cgroup/memory.max', 'f', { data: 'max\n' }); put('/sys/fs/cgroup/cpu.max', 'f', { data: 'max 100000\n' });
  put('/swapfile', 'f', { mode: 0o600, sz: 2048 * MB });
  // ---- programs in $PATH
  for (const c of [...PROGRAMS, ...SBIN]) put((SBIN.has(c) ? '/usr/sbin/' : '/usr/bin/') + c, 'f', { mode: 0o755, data: '\x7fELF binary', sz: 40 * KB + c.length * 997 });
  for (const c of ['passwd', 'sudo', 'su', 'mount', 'umount', 'ping']) I(lookup('/usr/bin/' + c).ino).mode = 0o4755;
  I(lookup('/usr/bin/crontab').ino).mode = 0o2755; I(lookup('/usr/bin/crontab').ino).gid = 107;
  put('/bin/bash', 'f', { mode: 0o755, sz: 1.4 * MB, data: '\x7fELF' }); put('/bin/sh', 'l', { mode: 0o777, tgt: 'dash' }); put('/bin/dash', 'f', { mode: 0o755, sz: 125 * KB });
  // ---- USB device (mountable)
  const saveRoot = S.root;
  S.dev = {};
  S.root = mkIno('d', 0o755, 0, 0); put('/photos', 'd'); put('/photos/beach.jpg', 'f', { sz: 3.1 * MB, data: 'JPEG' }); put('/photos/cat.jpg', 'f', { sz: 2.2 * MB, data: 'JPEG' }); put('/music.mp3', 'f', { sz: 5.6 * MB }); put('/README.txt', 'f', { data: 'USB stick contents\n' });
  S.dev['/dev/sdb1'] = { root: S.root, fs: 'vfat', size: '16G', label: 'USB_STICK', uuid: 'A1B2-C3D4' };
  S.root = saveRoot;
  S.mounts = [{ dev: '/dev/sda1', mp: '/', fs: 'ext4', opt: 'rw,relatime' }, { dev: 'proc', mp: '/proc', fs: 'proc', opt: 'rw' }, { dev: 'tmpfs', mp: '/run', fs: 'tmpfs', opt: 'rw' }];
  // ---- processes
  S.nextPid = 2140;
  const P = (pid, ppid, uid, cmd, st, cpu, mem, extra) => Object.assign({ pid, ppid, uid, cmd, st, cpu, mem, ni: 0, tty: '?', start: '09:00' }, extra || {});
  S.procs = [
    P(1, 0, 0, '/sbin/init splash', 'S', 0.0, 0.3, { comm: 'systemd' }),
    P(2, 0, 0, '[kthreadd]', 'S', 0, 0),
    P(345, 1, 0, 'sshd: /usr/sbin/sshd -D', 'S', 0, 0.2, { comm: 'sshd' }),
    P(412, 1, 0, '/usr/sbin/cron -f', 'S', 0, 0.1, { comm: 'cron' }),
    P(520, 1, 0, 'nginx: master process /usr/sbin/nginx', 'S', 0, 0.4, { comm: 'nginx' }),
    P(521, 520, 33, 'nginx: worker process', 'S', 0.3, 0.6, { comm: 'nginx' }),
    P(601, 1, 112, '/usr/sbin/mysqld', 'S', 1.2, 9.8, { comm: 'mysqld' }),
    P(777, 1, 1000, 'python3 stuck_app.py', 'R', 38.5, 4.2, { comm: 'python3', ignTERM: true, tty: 'pts/0' }),
    P(888, 1, 1000, 'python3 server.py', 'S', 2.1, 3.1, { comm: 'python3', tty: 'pts/0' }),
    P(1200, 1190, 1000, '-bash', 'S', 0, 0.1, { comm: 'bash', tty: 'pts/0' }),
  ];
  S.jobs = []; S.fg = null;
  S.services = {
    nginx: { active: true, enabled: true, pid: 520, desc: 'A high performance web server and a reverse proxy server' },
    ssh: { active: true, enabled: true, pid: 345, desc: 'OpenBSD Secure Shell server' },
    cron: { active: true, enabled: true, pid: 412, desc: 'Regular background program processing daemon' },
    mysql: { active: true, enabled: true, pid: 601, desc: 'MySQL Community Server' },
    docker: { active: true, enabled: true, pid: 950, desc: 'Docker Application Container Engine' },
    bluetooth: { active: false, enabled: false, desc: 'Bluetooth service' },
  };
  S.crontab = {}; S.atq = []; S.atNext = 1;
  S.pkgs = { installed: new Set(['coreutils', 'bash', 'nginx', 'curl', 'openssh-server', 'cron', 'docker.io', 'python3']), updated: false };
  S.firewall = { enabled: false, rules: [] };
  S.ipt = [];
  S.containers = []; S.images = ['nginx:latest', 'ubuntu:24.04', 'alpine:3.20'];
  S.locateDb = null; S.locateDb = allPaths(); // snapshot like updatedb
  S.lastLogin = 'Tue Nov 17 18:22:05 2026 from 10.0.0.5';
  syncEtc();
  return S;
}
const SBIN = new Set(['useradd', 'userdel', 'usermod', 'groupadd', 'iptables', 'ufw', 'updatedb', 'mkfs', 'fdisk', 'visudo']);
const PROGRAMS = ['ls', 'cat', 'cp', 'mv', 'rm', 'rmdir', 'mkdir', 'touch', 'less', 'more', 'head', 'tail', 'chmod', 'chown', 'chgrp', 'whoami', 'id', 'groups', 'sudo', 'su', 'grep', 'wc', 'sort', 'uniq', 'clear', 'man', 'ps', 'top', 'kill', 'pkill', 'killall', 'nohup', 'sleep', 'find', 'locate', 'which', 'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'df', 'du', 'free', 'uname', 'uptime', 'hostname', 'ping', 'curl', 'wget', 'ssh', 'scp', 'apt', 'apt-get', 'passwd', 'awk', 'sed', 'cut', 'tr', 'xargs', 'tee', 'getfacl', 'setfacl', 'strace', 'lsof', 'nice', 'renice', 'systemctl', 'journalctl', 'systemd-analyze', 'dmesg', 'crontab', 'at', 'atq', 'atrm', 'ln', 'stat', 'mount', 'umount', 'lsblk', 'ip', 'ss', 'dig', 'traceroute', 'rsync', 'docker', 'lsns', 'unshare', 'env', 'printenv', 'date', 'seq', 'basename', 'dirname', 'file', 'nano', 'vim', 'echo', 'pwd', 'test', 'true', 'false', 'bash', 'diff', 'realpath', 'yes', 'cal', 'w', 'egrep', 'systemd-cgls', 'python3'];

function syncEtc() {
  const pw = Object.entries(S.users).map(([u, x]) => `${u}:x:${x.uid}:${x.gid}:${x.name || u}:${x.home}:${x.shell}`).join('\n') + '\n';
  const gr = Object.entries(S.groups).map(([g, x]) => `${g}:x:${x.gid}:${x.m.join(',')}`).join('\n') + '\n';
  for (const [p, d] of [['/etc/passwd', pw], ['/etc/group', gr]]) {
    const r = lookup(p); if (r.n) r.n.data = d; else put(p, 'f', { data: d });
  }
}
/* ---------- user helpers ---------- */
const uname = uid => (Object.entries(S.users).find(([, u]) => u.uid === uid) || [String(uid)])[0];
const gname = gid => (Object.entries(S.groups).find(([, g]) => g.gid === gid) || [String(gid)])[0];
const curUser = () => uname(S.uid);
const home = () => (S.users[curUser()] || {}).home || '/';
function userGroups(u) { const x = S.users[u]; if (!x) return []; const prim = gname(x.gid); return [prim, ...Object.entries(S.groups).filter(([g, v]) => v.m.includes(u) && g !== prim).map(([g]) => g)]; }
const inGid = gid => S.uid === 0 || userGroups(curUser()).includes(gname(gid));

/* ---------- paths ---------- */
function norm(p, base) {
  if (p === '~' || p.startsWith('~/')) p = home() + p.slice(1);
  if (!p.startsWith('/')) p = (base || S.cwd) + '/' + p;
  const out = [];
  for (const c of p.split('/')) { if (!c || c === '.') continue; if (c === '..') out.pop(); else out.push(c); }
  return '/' + out.join('/');
}
const dirOf = n => (n && n.mnt ? I(n.mnt) : n);
const baseName = p => p.replace(/\/+$/, '').split('/').pop() || '/';
const parentPath = p => { const a = norm(p).split('/'); a.pop(); return a.join('/') || '/'; };

function can(n, op) {
  if (S.uid === 0) return op !== 'x' || n.t === 'd' || (n.mode & 0o111);
  const bit = op === 'r' ? 4 : op === 'w' ? 2 : 1;
  if (n.acl) { const a = n.acl['u:' + curUser()]; if (a != null && n.uid !== S.uid) return a.includes(op === 'r' ? 'r' : op === 'w' ? 'w' : 'x'); }
  const sh = n.uid === S.uid ? 6 : inGid(n.gid) ? 3 : 0;
  return !!((n.mode >> sh) & bit);
}

/* lookup → {ino,n,par,name,path} or {err, par, name, missingLast} */
function lookup(p, follow = true, depth = 0) {
  const path = norm(p);
  const pm = /^\/proc\/(\d+|self)(?:\/(.*))?$/.exec(path);
  if (pm && S.procs) return procNode(pm[1] === 'self' ? 1200 : +pm[1], pm[2] || '', path);
  const comps = path.split('/').filter(Boolean);
  let cur = S.root, par = null, name = '/';
  for (let i = 0; i < comps.length; i++) {
    let d = dirOf(I(cur));
    if (d.t !== 'd') return { err: 'Not a directory', path };
    if (!can(d, 'x')) return { err: 'Permission denied', path };
    const nx = d.ent[comps[i]];
    if (nx == null) return { err: 'No such file or directory', path, par: cur, name: comps[i], missingLast: i === comps.length - 1 };
    const n = I(nx);
    if (n.t === 'l' && (i < comps.length - 1 || follow)) {
      if (depth > 20) return { err: 'Too many levels of symbolic links', path };
      const base = '/' + comps.slice(0, i).join('/');
      const rest = comps.slice(i + 1).join('/');
      const r = lookup(norm(n.tgt, base) + (rest ? '/' + rest : ''), follow, depth + 1);
      if (r.err && r.err.startsWith('No such')) r.dangling = true;
      return r;
    }
    par = cur; cur = nx; name = comps[i];
  }
  return { ino: cur, n: I(cur), par, name, path };
}
function procNode(pid, rest, path) {
  const pr = S.procs.find(p => p.pid === pid);
  if (!pr) return { err: 'No such file or directory', path };
  if (!rest) return { ino: -pid, n: { t: 'd', mode: 0o555, uid: pr.uid, gid: pr.uid, nlink: 9, mtime: BASE_T, ent: {}, virt: ['status', 'cmdline', 'environ', 'fd', 'maps', 'stat'] }, path, name: String(pid) };
  const st = { R: 'R (running)', S: 'S (sleeping)', T: 'T (stopped)', Z: 'Z (zombie)' }[pr.st];
  const files = {
    status: `Name:\t${pr.comm || pr.cmd.split(' ')[0]}\nState:\t${st}\nPid:\t${pid}\nPPid:\t${pr.ppid}\nUid:\t${pr.uid}\t${pr.uid}\t${pr.uid}\t${pr.uid}\nVmRSS:\t${Math.round(pr.mem * 160 + 900)} kB\nThreads:\t1\n`,
    cmdline: pr.cmd.replace(/ /g, '\0') + '\n', environ: pid === 1200 ? Object.entries(S.env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n' : '', maps: '55d0c0a00000-55d0c0a28000 r--p 00000000 08:01 1311  /usr/bin/' + (pr.comm || 'bash') + '\n7f2a1c000000-7f2a1c1d8000 r-xp 00028000 08:01 2022  /usr/lib/x86_64-linux-gnu/libc.so.6\n', stat: `${pid} (${pr.comm || 'bash'}) ${pr.st} ${pr.ppid} ...\n`,
  };
  if (rest === 'fd') return { ino: -pid - 0.5, n: { t: 'd', mode: 0o500, uid: pr.uid, gid: pr.uid, nlink: 2, mtime: BASE_T, ent: {}, virt: openFds(pr).map(f => String(f.fd)), fdOf: pr }, path, name: 'fd' };
  const fdm = /^fd\/(\d+)$/.exec(rest);
  if (fdm) { const f = openFds(pr).find(x => String(x.fd) === fdm[1]); if (f) return { ino: -pid - 0.75, n: { t: 'l', mode: 0o700, uid: pr.uid, gid: pr.uid, nlink: 1, mtime: BASE_T, tgt: f.type === 'IPv4' ? 'socket:[48213]' : f.name }, path, name: fdm[1] }; }
  if (rest in files) return { ino: -pid - 0.25, n: { t: 'f', mode: 0o444, uid: pr.uid, gid: pr.uid, nlink: 1, mtime: BASE_T, data: files[rest], sz: 0 }, path, name: rest };
  return { err: 'No such file or directory', path };
}
function openFds(pr) {
  const base = [{ fd: 0, type: 'CHR', name: '/dev/pts/0' }, { fd: 1, type: 'CHR', name: '/dev/pts/0' }, { fd: 2, type: 'CHR', name: '/dev/pts/0' }];
  const m = {
    nginx: [{ fd: 3, type: 'REG', name: '/var/log/nginx/access.log' }, { fd: 6, type: 'IPv4', name: 'TCP *:80 (LISTEN)' }],
    sshd: [{ fd: 3, type: 'IPv4', name: 'TCP *:22 (LISTEN)' }],
    mysqld: [{ fd: 3, type: 'REG', name: '/var/lib/mysql/ibdata1' }, { fd: 21, type: 'IPv4', name: 'TCP 127.0.0.1:3306 (LISTEN)' }],
    python3: pr.pid === 888 ? [{ fd: 3, type: 'IPv4', name: 'TCP *:8000 (LISTEN)' }, { fd: 4, type: 'REG', name: '/home/user/logs/app.log' }] : [{ fd: 3, type: 'REG', name: '/home/user/logs/app.log' }],
    bash: [{ fd: 255, type: 'CHR', name: '/dev/pts/0' }], cron: [{ fd: 3, type: 'REG', name: '/run/crond.pid' }],
  };
  const extra = m[pr.comm] || (pr.files || []);
  return (pr.tty === '?' ? [{ fd: 0, type: 'CHR', name: '/dev/null' }, { fd: 1, type: 'unix', name: 'socket' }, { fd: 2, type: 'unix', name: 'socket' }] : base).concat(extra);
}
function readdirNames(n, path) {
  if (n.virt) return n.virt.slice();
  const names = Object.keys(dirOf(n).ent);
  return path === '/proc' ? names.concat(S.procs.map(p => String(p.pid)), ['cpuinfo', 'meminfo', 'uptime', 'version', 'loadavg', 'self']) : names;
}
function procFile(path) {
  const m = { '/proc/cpuinfo': 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i7-1165G7 @ 2.80GHz\ncpu MHz\t\t: 2803.200\ncache size\t: 12288 KB\ncpu cores\t: 4\n\nprocessor\t: 1\n...(4 cores)\n', '/proc/meminfo': 'MemTotal:        8041512 kB\nMemFree:         3120440 kB\nMemAvailable:    5560320 kB\nBuffers:          212344 kB\nCached:          2010232 kB\nSwapTotal:       2097148 kB\nSwapFree:        2097148 kB\n', '/proc/uptime': '15342.51 58010.12\n', '/proc/version': 'Linux version 6.8.0-49-generic (buildd@lcy02) (gcc 13.2.0) #49-Ubuntu SMP PREEMPT_DYNAMIC\n', '/proc/loadavg': '0.42 0.37 0.31 2/412 2141\n' };
  return m[path];
}
/* create file or dir; returns {ino} or {err} */
function fsCreate(path, t, mode, extra) {
  const r = lookup(path, false);
  if (r.ino != null) return { err: 'File exists', exists: true, r };
  if (!r.missingLast) return { err: r.err || 'No such file or directory' };
  const pd = dirOf(I(r.par));
  if (!can(pd, 'w')) return { err: 'Permission denied' };
  const u = S.users[curUser()] || { gid: S.uid };
  const ino = mkIno(t, mode ?? ((t === 'd' ? 0o777 : 0o666) & ~S.umask), S.uid, (pd.mode & 0o2000) ? pd.gid : u.gid, extra);
  pd.ent[r.name] = ino; pd.mtime = now(); if (t === 'd') pd.nlink++;
  return { ino, path: r.path };
}
function fsUnlink(path) {
  const r = lookup(path, false);
  if (r.err) return { err: r.err };
  const pd = dirOf(I(r.par));
  if (!can(pd, 'w')) return { err: 'Permission denied' };
  if ((pd.mode & 0o1000) && S.uid !== 0 && r.n.uid !== S.uid && pd.uid !== S.uid) return { err: 'Operation not permitted' };
  delete pd.ent[r.name]; pd.mtime = now();
  r.n.nlink--; if (r.n.t === 'd') pd.nlink--;
  if (r.n.t === 'd' || r.n.nlink <= 0) delete S.inodes[r.ino];
  return { ok: true, ino: r.ino };
}
function readFile(path) {
  const pf = procFile(norm(path)); if (pf) return { data: pf };
  const r = lookup(path);
  if (r.err) return { err: r.err };
  if (r.n.t === 'd') return { err: 'Is a directory' };
  if (!can(r.n, 'r')) return { err: 'Permission denied' };
  if (r.n.dev === 'null') return { data: '' };
  return { data: r.n.data || '', n: r.n };
}
function writeFile(path, data, append) {
  let r = lookup(path);
  if (r.n && r.n.dev === 'null') return { ok: true };
  if (r.err && r.missingLast) { const c = fsCreate(path, 'f'); if (c.err) return c; r = lookup(path); }
  else if (r.err && r.dangling) { const c = fsCreate(r.path, 'f'); if (c.err) return c; r = lookup(path); }
  else if (r.err) return { err: r.err };
  if (r.n.t === 'd') return { err: 'Is a directory' };
  if (!can(r.n, 'w')) return { err: 'Permission denied' };
  r.n.data = append ? (r.n.data || '') + data : data; delete r.n.sz; r.n.mtime = now();
  return { ok: true, n: r.n };
}
const fsize = n => n.t === 'd' ? 4096 : n.t === 'l' ? n.tgt.length : (n.sz != null ? Math.round(n.sz) : (n.data || '').length);
function allPaths(start = '/', out = [], seen = new Set()) {
  const r = lookup(start, false); if (!r.n || r.n.t !== 'd' || seen.has(r.ino)) return out;
  seen.add(r.ino);
  for (const nm of Object.keys(dirOf(r.n).ent)) {
    const p = (start === '/' ? '' : start) + '/' + nm; out.push(p);
    const c = I(dirOf(r.n).ent[nm]); if (c && c.t === 'd' && p !== '/proc') allPaths(p, out, seen);
  }
  return out;
}
function deepCopy(srcIno, preserve) {
  const s = I(srcIno);
  const ino = mkIno(s.t, preserve ? s.mode : (s.mode & 0o777), preserve ? s.uid : S.uid, preserve ? s.gid : ((S.users[curUser()] || {}).gid ?? S.uid));
  const n = I(ino);
  if (preserve) n.mtime = s.mtime;
  if (s.t === 'f') { n.data = s.data; if (s.sz != null) n.sz = s.sz; }
  if (s.t === 'l') n.tgt = s.tgt;
  if (s.t === 'd') for (const [k, v] of Object.entries(dirOf(s).ent)) { n.ent[k] = deepCopy(v, preserve); if (I(n.ent[k]).t === 'd') n.nlink++; }
  return ino;
}
function modeStr(n) {
  const t = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : n.dev === 'blk' ? 'b' : '-';
  const m = n.mode; let s = '';
  for (let i = 2; i >= 0; i--) {
    const b = (m >> (i * 3)) & 7;
    s += b & 4 ? 'r' : '-'; s += b & 2 ? 'w' : '-';
    const sp = i === 2 ? m & 0o4000 : i === 1 ? m & 0o2000 : m & 0o1000;
    const ch = i === 0 ? 't' : 's';
    s += sp ? (b & 1 ? ch : ch.toUpperCase()) : (b & 1 ? 'x' : '-');
  }
  return t + s + (n.acl && Object.keys(n.acl).length ? '+' : '');
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fdate(t) { const d = new Date(t); return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function human(b) { if (b < 1024) return String(b); const u = ['K', 'M', 'G', 'T']; let i = -1; do { b /= 1024; i++; } while (b >= 1024 && i < 3); return (b < 10 ? b.toFixed(1) : Math.round(b)) + u[i]; }
function treeSize(ino, seen = new Set()) { const n = I(ino); if (!n || seen.has(ino)) return 0; seen.add(ino); if (n.t !== 'd') return fsize(n); let s = 4096; for (const v of Object.values(dirOf(n).ent)) s += treeSize(v, seen); return s; }
