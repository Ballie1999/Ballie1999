'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../database');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// ── Settings page ────────────────────────────────────────────────────────────

router.get('/settings', requireLogin, (req, res) => {
  const user = db.prepare('SELECT id, username, email FROM users WHERE id=?').get(req.session.userId);
  res.render('settings', { user, error: null, success: null, username: req.session.username });
});

// POST /settings/password — change panel password
router.post('/settings/password', requireLogin, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  const render = (error, success = null) =>
    res.render('settings', {
      user: { id: user.id, username: user.username, email: user.email },
      error, success, username: req.session.username,
    });

  if (!current_password || !new_password || !confirm_password) {
    return render('All password fields are required.');
  }
  if (!bcrypt.compareSync(current_password, user.password)) {
    return render('Current password is incorrect.');
  }
  if (new_password.length < 8) {
    return render('New password must be at least 8 characters.');
  }
  if (new_password !== confirm_password) {
    return render('New passwords do not match.');
  }

  const hashed = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
  return render(null, 'Password changed successfully.');
});

// POST /settings/email — update recovery email
router.post('/settings/email', requireLogin, (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT id, username, email FROM users WHERE id=?').get(req.session.userId);
  const render = (error, success = null) =>
    res.render('settings', { user, error, success, username: req.session.username });

  if (!email || !email.includes('@')) {
    return render('Please enter a valid email address.');
  }

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.trim().toLowerCase(), user.id);
  const updated = db.prepare('SELECT id, username, email FROM users WHERE id=?').get(req.session.userId);
  return res.render('settings', {
    user: updated, error: null, success: 'Recovery email updated.', username: req.session.username,
  });
});

// ── Forgot password ──────────────────────────────────────────────────────────

router.get('/forgot-password', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('forgot-password', { error: null, success: null });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const render = (error, success = null) => res.render('forgot-password', { error, success });
  const SAFE_RESPONSE = 'If that email is registered, a reset link has been sent.';

  if (!email) return render('Please enter your email address.');

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(
    email.trim().toLowerCase()
  );
  if (!user) return render(null, SAFE_RESPONSE);

  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(
    token, expires, user.id
  );

  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    // SMTP not configured — surface the link locally for dev use
    return render(null, `SMTP not configured. Reset link: /reset-password/${token}`);
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password/${token}`;

  transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: 'gkku — Password Reset',
    text: `Click the link below to reset your gkku panel password (valid 1 hour):\n\n${resetUrl}\n\nIgnore this email if you did not request a reset.`,
  }).catch(() => {}); // fire-and-forget — never expose mail errors to the user

  return render(null, SAFE_RESPONSE);
});

// ── Reset password ───────────────────────────────────────────────────────────

router.get('/reset-password/:token', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  const { token } = req.params;
  const user = db.prepare(
    'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?'
  ).get(token, Date.now());
  if (!user) {
    return res.render('reset-password', { token, error: 'Reset link is invalid or has expired.', success: null });
  }
  res.render('reset-password', { token, error: null, success: null });
});

router.post('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  const { new_password, confirm_password } = req.body;
  const render = (error, success = null) => res.render('reset-password', { token, error, success });

  if (!new_password || !confirm_password) return render('Both fields are required.');
  if (new_password.length < 8) return render('Password must be at least 8 characters.');
  if (new_password !== confirm_password) return render('Passwords do not match.');

  const user = db.prepare(
    'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?'
  ).get(token, Date.now());
  if (!user) return render('Reset link is invalid or has expired.');

  const hashed = bcrypt.hashSync(new_password, 12);
  db.prepare(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
  ).run(hashed, user.id);

  return render(null, 'Password reset! You can now log in.');
});

module.exports = router;
