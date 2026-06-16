const express = require('express');
const db = require('../database');

const router = express.Router();

// Auth guard middleware
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// GET / — Dashboard
router.get('/', requireLogin, (req, res) => {
  const accounts = db.prepare('SELECT * FROM mc_accounts ORDER BY created_at DESC').all();
  res.render('dashboard', { accounts, username: req.session.username });
});

// GET /accounts/add
router.get('/accounts/add', requireLogin, (req, res) => {
  res.render('add-account', { error: null, username: req.session.username });
});

// POST /accounts/add
router.post('/accounts/add', requireLogin, (req, res) => {
  const { mc_username, email, password, proxy_host, proxy_port, proxy_user, proxy_pass, status, notes } = req.body;

  if (!mc_username) {
    return res.render('add-account', { error: 'Minecraft username is required.', username: req.session.username });
  }

  db.prepare(`
    INSERT INTO mc_accounts (username, email, password, proxy_host, proxy_port, proxy_user, proxy_pass, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mc_username, email || '', password || '', proxy_host || '', proxy_port || '', proxy_user || '', proxy_pass || '', status || 'unknown', notes || '');

  res.redirect('/');
});

// GET /accounts/edit/:id
router.get('/accounts/edit/:id', requireLogin, (req, res) => {
  const account = db.prepare('SELECT * FROM mc_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.redirect('/');
  res.render('edit-account', { account, error: null, username: req.session.username });
});

// POST /accounts/edit/:id
router.post('/accounts/edit/:id', requireLogin, (req, res) => {
  const { mc_username, email, password, proxy_host, proxy_port, proxy_user, proxy_pass, status, notes } = req.body;
  const { id } = req.params;

  if (!mc_username) {
    const account = db.prepare('SELECT * FROM mc_accounts WHERE id = ?').get(id);
    return res.render('edit-account', { account, error: 'Minecraft username is required.', username: req.session.username });
  }

  db.prepare(`
    UPDATE mc_accounts
    SET username = ?, email = ?, password = ?, proxy_host = ?, proxy_port = ?,
        proxy_user = ?, proxy_pass = ?, status = ?, notes = ?
    WHERE id = ?
  `).run(mc_username, email || '', password || '', proxy_host || '', proxy_port || '', proxy_user || '', proxy_pass || '', status || 'unknown', notes || '', id);

  res.redirect('/');
});

// POST /accounts/delete/:id
router.post('/accounts/delete/:id', requireLogin, (req, res) => {
  db.prepare('DELETE FROM mc_accounts WHERE id = ?').run(req.params.id);
  res.redirect('/');
});

module.exports = router;
