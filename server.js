// Server: Moi j'aime mon pays / شوف أنا نحب الطبيعة
// Version portable (SQLite) — pour hébergement externe
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- DB ----------
const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password TEXT NOT NULL,
  device_id TEXT,
  ip TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text_fr TEXT,
  text_ar TEXT,
  photo1 TEXT NOT NULL,
  photo2 TEXT NOT NULL,
  selfie TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  month TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(post_id) REFERENCES posts(id)
);
`);

// Migrations
try {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('email')) db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  if (!cols.includes('ip'))    db.exec("ALTER TABLE users ADD COLUMN ip TEXT");
} catch(_) {}

// Seed admin
const adminExists = db.prepare('SELECT id FROM users WHERE is_admin=1').get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 8);
  db.prepare('INSERT OR IGNORE INTO users (pseudo, password, is_admin) VALUES (?,?,1)').run('admin', hash);
  console.log('Admin créé -> pseudo: admin  /  mot de passe: admin123');
  console.log('⚠️  CHANGEZ LE MOT DE PASSE ADMIN dans le panneau admin > Paramètres');
}

// ---------- Rate Limiting ----------
const rateMaps = { register: new Map(), login: new Map(), vote: new Map() };
function rateLimit(mapKey, ip, maxReqs, windowMs) {
  const now = Date.now();
  const map = rateMaps[mapKey];
  const times = (map.get(ip) || []).filter(t => now - t < windowMs);
  if (times.length >= maxReqs) return false;
  times.push(now);
  map.set(ip, times);
  return true;
}
function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

// ---------- Middlewares ----------
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Format image non supporté'));
  }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'auth_required' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ error: 'admin_required' });
  next();
}
function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const ip = getIp(req);
  if (!rateLimit('register', ip, 3, 60 * 60 * 1000))
    return res.status(429).json({ error: 'too_many_requests' });
  const { pseudo, email, password, deviceId } = req.body;
  const emailTrim = (email || '').trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim);
  if (!pseudo || !password || pseudo.length < 3 || password.length < 4 || !emailOk)
    return res.status(400).json({ error: 'invalid_input' });
  try {
    if (deviceId) {
      const existing = db.prepare('SELECT id FROM users WHERE device_id=?').get(deviceId);
      if (existing) return res.status(400).json({ error: 'device_already_registered' });
    }
    const hash = bcrypt.hashSync(password, 8);
    const info = db.prepare('INSERT INTO users (pseudo, email, password, device_id, ip) VALUES (?,?,?,?,?)').run(pseudo.trim(), emailTrim, hash, deviceId || null, ip);
    req.session.userId = info.lastInsertRowid;
    req.session.pseudo = pseudo.trim();
    req.session.isAdmin = false;
    res.json({ ok: true, pseudo: pseudo.trim() });
  } catch (e) {
    if (String(e).includes('UNIQUE') && String(e).includes('email'))
      return res.status(400).json({ error: 'email_taken' });
    if (String(e).includes('UNIQUE'))
      return res.status(400).json({ error: 'pseudo_taken' });
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/login', (req, res) => {
  const ip = getIp(req);
  if (!rateLimit('login', ip, 8, 15 * 60 * 1000))
    return res.status(429).json({ error: 'too_many_requests' });
  const { pseudo, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE pseudo=?').get((pseudo || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password))
    return res.status(400).json({ error: 'invalid_credentials' });
  req.session.userId = user.id;
  req.session.pseudo = user.pseudo;
  req.session.isAdmin = !!user.is_admin;
  res.json({ ok: true, pseudo: user.pseudo, isAdmin: !!user.is_admin });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, pseudo: req.session.pseudo, isAdmin: !!req.session.isAdmin } });
});

// ---------- Posts ----------
app.post('/api/posts', requireAuth, upload.fields([{name:'photo1',maxCount:1},{name:'photo2',maxCount:1},{name:'selfie',maxCount:1}]), (req, res) => {
  const month = currentMonth();
  const existing = db.prepare("SELECT id FROM posts WHERE user_id=? AND month=? AND status != 'rejected'").get(req.session.userId, month);
  if (existing) return res.status(400).json({ error: 'already_posted_this_month' });
  const { text_fr, text_ar } = req.body;
  const files = req.files || {};
  if (!files.photo1 || !files.photo2 || !files.selfie)
    return res.status(400).json({ error: 'photos_required' });
  const info = db.prepare('INSERT INTO posts (user_id, text_fr, text_ar, photo1, photo2, selfie, month) VALUES (?,?,?,?,?,?,?)').run(
    req.session.userId, (text_fr||'').slice(0,500), (text_ar||'').slice(0,500),
    '/uploads/'+files.photo1[0].filename, '/uploads/'+files.photo2[0].filename, '/uploads/'+files.selfie[0].filename, month
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get('/api/posts', (req, res) => {
  const month = req.query.month || currentMonth();
  const status = req.query.status || 'approved';
  const rows = db.prepare('SELECT p.*, u.pseudo, (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) AS votes_count FROM posts p JOIN users u ON u.id=p.user_id WHERE p.month=? AND p.status=? ORDER BY votes_count DESC, p.created_at DESC').all(month, status);
  const userId = req.session.userId;
  const voted = userId ? new Set(db.prepare('SELECT post_id FROM votes WHERE user_id=?').all(userId).map(v=>v.post_id)) : new Set();
  res.json({ month, posts: rows.map(r=>({...r, has_voted: voted.has(r.id)})) });
});

app.get('/api/posts/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) AS votes_count FROM posts p WHERE user_id=? ORDER BY created_at DESC').all(req.session.userId);
  res.json({ posts: rows });
});

// ---------- Vote ----------
app.post('/api/posts/:id/vote', requireAuth, (req, res) => {
  const ip = getIp(req);
  if (!rateLimit('vote', ip, 20, 60*60*1000)) return res.status(429).json({ error: 'too_many_requests' });
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(postId);
  if (!post) return res.status(404).json({ error: 'not_found' });
  if (post.status !== 'approved') return res.status(400).json({ error: 'not_approved' });
  if (post.user_id === req.session.userId) return res.status(400).json({ error: 'cannot_vote_own' });
  try {
    db.prepare('INSERT INTO votes (user_id, post_id) VALUES (?,?)').run(req.session.userId, postId);
    const total = db.prepare('SELECT COUNT(*) c FROM votes WHERE post_id=?').get(postId).c;
    const points = Math.min(total * 2, 100);
    db.prepare('UPDATE posts SET points=? WHERE id=?').run(points, postId);
    res.json({ ok: true, votes: total, points });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'already_voted' });
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- Winner ----------
app.get('/api/winner', (req, res) => {
  const month = req.query.month || currentMonth();
  const row = db.prepare("SELECT p.*, u.pseudo, (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) AS votes_count FROM posts p JOIN users u ON u.id=p.user_id WHERE p.month=? AND p.status IN ('approved','winner') ORDER BY votes_count DESC LIMIT 1").get(month);
  res.json({ winner: row||null, month });
});

// ---------- Admin ----------
app.get('/api/admin/posts', requireAdmin, (req, res) => {
  const status = req.query.status || null;
  let sql = 'SELECT p.*, u.pseudo, u.email, u.ip as user_ip, (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) AS votes_count FROM posts p JOIN users u ON u.id=p.user_id';
  const args = [];
  if (status) { sql += ' WHERE p.status=?'; args.push(status); }
  sql += ' ORDER BY p.created_at DESC';
  res.json({ posts: db.prepare(sql).all(...args) });
});

app.post('/api/admin/posts/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['pending','approved','rejected','winner'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
  db.prepare('UPDATE posts SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (post) {
    for (const f of [post.photo1, post.photo2, post.selfie]) {
      const p = path.join(__dirname, 'public', f);
      if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch(_) {}
    }
    db.prepare('DELETE FROM votes WHERE post_id=?').run(req.params.id);
    db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  }
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT u.id, u.pseudo, u.email, u.ip, u.device_id, u.is_admin, u.created_at, (SELECT COUNT(*) FROM users u2 WHERE u2.ip=u.ip AND u2.is_admin=0) AS accounts_from_ip FROM users u ORDER BY u.created_at DESC').all();
  res.json({ users: rows });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const posts = db.prepare('SELECT COUNT(*) c FROM posts').get().c;
  const pending = db.prepare("SELECT COUNT(*) c FROM posts WHERE status='pending'").get().c;
  const votes = db.prepare('SELECT COUNT(*) c FROM votes').get().c;
  const suspectIps = db.prepare("SELECT ip, COUNT(*) cnt FROM users WHERE is_admin=0 AND ip IS NOT NULL GROUP BY ip HAVING cnt > 1").all().length;
  res.json({ users, posts, pending, votes, suspectIps });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  const hash = bcrypt.hashSync(newPassword, 8);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.session.userId);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log('🌿 App lancée sur http://localhost:' + PORT));
