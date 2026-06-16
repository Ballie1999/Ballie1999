'use strict';

const express = require('express');
const botManager = require('../bot-manager');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /bots/statuses — returns live status for all accounts as JSON
router.get('/bots/statuses', requireLogin, (req, res) => {
  res.json(botManager.getAllStatuses());
});

// GET /bots/:id/status — single account status
router.get('/bots/:id/status', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  res.json(botManager.getStatus(id));
});

// POST /bots/:id/connect
router.post('/bots/:id/connect', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    botManager.connect(id);
    res.json({ ok: true, message: 'Connecting…' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /bots/:id/disconnect
router.post('/bots/:id/disconnect', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    botManager.disconnect(id);
    res.json({ ok: true, message: 'Disconnected' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /bots/:id/reconnect
router.post('/bots/:id/reconnect', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    botManager.disconnect(id);
    // Short delay so the disconnect event can flush before reconnecting
    setTimeout(() => {
      try { botManager.connect(id); } catch (_) {}
    }, 1500);
    res.json({ ok: true, message: 'Reconnecting…' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /bots/:id/command — send a chat command to the connected bot
router.post('/bots/:id/command', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { command } = req.body;
  if (!command || !command.trim()) {
    return res.status(400).json({ error: 'Command is required' });
  }
  try {
    botManager.sendCommand(id, command.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /bots/:id/logs — last 100 log entries for an account
router.get('/bots/:id/logs', requireLogin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = require('../database');
  const logs = db.prepare(
    'SELECT event, message, created_at FROM bot_logs WHERE account_id=? ORDER BY id DESC LIMIT 100'
  ).all(id);
  res.json(logs.reverse());
});

module.exports = router;
