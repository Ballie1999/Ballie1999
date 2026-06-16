'use strict';

/**
 * Bot Manager — manages mineflayer bot sessions per MC account.
 *
 * Microsoft auth notes
 * ---------------------
 * 2b2t.org is an online-mode Java Edition server.  Modern Minecraft accounts
 * are all Microsoft accounts and require OAuth 2.0 (device-code flow).
 *
 * The first time you connect an account the panel will show a device-auth
 * code + URL.  Open that URL, enter the code, then log in with your Microsoft
 * account.  The token is cached in data/profiles/<accountId>/ so future
 * connects are fully automatic.
 *
 * Proxy
 * -----
 * SOCKS5 proxies (as used on DigitalOcean droplets) are automatically routed
 * through when proxy_host / proxy_port are set on the MC account.
 */

const mineflayer = require('mineflayer');
const { SocksClient } = require('socks');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// Live bot sessions Map<accountId, BotSession>
// BotSession: { bot, status, queuePos, lastError, authCode, authUrl }
const sessions = new Map();

const STATUS = {
  OFFLINE:       'offline',
  CONNECTING:    'connecting',
  AUTH_REQUIRED: 'auth_required',
  CONNECTED:     'connected',
  QUEUED:        'queued',
  DISCONNECTED:  'disconnected',
  ERROR:         'error',
};

function profileDir(accountId) {
  const dir = path.join(__dirname, 'data', 'profiles', String(accountId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function persistStatus(accountId, status, { lastError = null, queuePos = null } = {}) {
  db.prepare(
    'UPDATE mc_accounts SET bot_status=?, bot_last_error=?, bot_queue_pos=? WHERE id=?'
  ).run(status, lastError, queuePos, accountId);
}

function patchSession(accountId, patch) {
  const prev = sessions.get(accountId) || {};
  sessions.set(accountId, { ...prev, ...patch });
  persistStatus(accountId, sessions.get(accountId).status, sessions.get(accountId));
}

function logEvent(accountId, event, message) {
  try {
    db.prepare('INSERT INTO bot_logs (account_id, event, message) VALUES (?,?,?)').run(
      accountId, event, String(message).slice(0, 512)
    );
  } catch (_) { /* never crash the bot loop over a log write */ }
}

/**
 * Start a mineflayer bot for the given MC account ID.
 */
function connect(accountId) {
  const account = db.prepare('SELECT * FROM mc_accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('Account not found');

  const current = sessions.get(accountId);
  if (current && ['connecting', 'connected', 'queued', 'auth_required'].includes(current.status)) {
    throw new Error('Bot is already running for this account');
  }

  // Initialise session record
  sessions.set(accountId, {
    bot: null,
    status: STATUS.CONNECTING,
    queuePos: null,
    lastError: null,
    authCode: null,
    authUrl: null,
  });
  persistStatus(accountId, STATUS.CONNECTING);

  const botOptions = {
    host: '2b2t.org',
    port: 25565,
    username: account.email || account.username, // Microsoft login uses email
    auth: 'microsoft',
    profilesFolder: profileDir(accountId),
    version: '1.12.2', // 2b2t runs on 1.12.2
    // Called when Microsoft needs device-code auth
    onMsaCode(data) {
      patchSession(accountId, {
        status: STATUS.AUTH_REQUIRED,
        authCode: data.user_code,
        authUrl: data.verification_uri,
        lastError: null,
      });
      logEvent(accountId, 'auth_required',
        `Visit ${data.verification_uri} and enter code: ${data.user_code}`);
    },
  };

  // Wire up SOCKS5 proxy if the account has one configured
  if (account.proxy_host && account.proxy_port) {
    const proxyType = 5; // SOCKS5
    const socksProxy = {
      host: account.proxy_host,
      port: parseInt(account.proxy_port, 10) || 1080,
      type: proxyType,
    };
    if (account.proxy_user) {
      socksProxy.userId = account.proxy_user;
      socksProxy.password = account.proxy_pass || '';
    }

    botOptions.connect = (client) => {
      SocksClient.createConnection({
        proxy: socksProxy,
        command: 'connect',
        destination: { host: '2b2t.org', port: 25565 },
      }, (err, info) => {
        if (err) {
          client.emit('error', err);
          return;
        }
        client.setSocket(info.socket);
        client.emit('connect');
      });
    };
  }

  let bot;
  try {
    bot = mineflayer.createBot(botOptions);
  } catch (err) {
    sessions.delete(accountId);
    persistStatus(accountId, STATUS.ERROR, { lastError: err.message });
    logEvent(accountId, 'error', err.message);
    throw err;
  }

  patchSession(accountId, { bot });

  // ── Bot events ───────────────────────────────────────────────────────────

  bot.once('login', () => {
    patchSession(accountId, {
      status: STATUS.CONNECTED,
      queuePos: null,
      lastError: null,
      authCode: null,
      authUrl: null,
    });
    db.prepare('UPDATE mc_accounts SET bot_connected_at=CURRENT_TIMESTAMP WHERE id=?').run(accountId);
    logEvent(accountId, 'connected', 'Logged in to 2b2t.org');
  });

  bot.on('message', (msgObj) => {
    const text = msgObj.toString();

    // 2b2t queue position messages
    const queueMatch = text.match(/Position in queue:\s*(\d+)/i);
    if (queueMatch) {
      const pos = parseInt(queueMatch[1], 10);
      patchSession(accountId, { status: STATUS.QUEUED, queuePos: pos });
      logEvent(accountId, 'queued', `Queue position: ${pos}`);
      return;
    }

    // Connected to main game
    if (/Connecting to the server\.|Welcome to 2b2t/i.test(text)) {
      patchSession(accountId, { status: STATUS.CONNECTED, queuePos: null });
      logEvent(accountId, 'connected', 'Entered 2b2t.org main world');
    }
  });

  bot.on('end', (reason) => {
    const msg = reason || 'Disconnected';
    patchSession(accountId, { status: STATUS.DISCONNECTED, lastError: msg, queuePos: null });
    logEvent(accountId, 'disconnected', msg);
    sessions.delete(accountId);
  });

  bot.on('error', (err) => {
    const msg = err && err.message ? err.message : String(err);
    patchSession(accountId, { status: STATUS.ERROR, lastError: msg, queuePos: null });
    logEvent(accountId, 'error', msg);
    sessions.delete(accountId);
  });
}

/**
 * Stop / kick the bot for the given account ID.
 */
function disconnect(accountId) {
  const session = sessions.get(accountId);
  if (session && session.bot) {
    try { session.bot.quit('Disconnected via panel'); } catch (_) {}
  }
  sessions.delete(accountId);
  persistStatus(accountId, STATUS.OFFLINE);
  logEvent(accountId, 'disconnected', 'Disconnected by user via panel');
}

/**
 * Send a raw chat message / command to the connected bot.
 */
function sendCommand(accountId, text) {
  const session = sessions.get(accountId);
  if (!session || !session.bot) throw new Error('Bot is not connected');
  if (!['connected', 'queued'].includes(session.status)) {
    throw new Error('Bot is not in a state that can send commands');
  }
  session.bot.chat(text);
  logEvent(accountId, 'command', text);
}

/**
 * Returns live status for a single account.
 */
function getStatus(accountId) {
  const session = sessions.get(accountId);
  if (!session) {
    const row = db.prepare(
      'SELECT bot_status, bot_last_error, bot_queue_pos FROM mc_accounts WHERE id=?'
    ).get(accountId);
    return {
      status: (row && row.bot_status) || STATUS.OFFLINE,
      queuePos: (row && row.bot_queue_pos) || null,
      lastError: (row && row.bot_last_error) || null,
      authCode: null,
      authUrl: null,
    };
  }
  return {
    status:   session.status,
    queuePos: session.queuePos  || null,
    lastError: session.lastError || null,
    authCode:  session.authCode  || null,
    authUrl:   session.authUrl   || null,
  };
}

/**
 * Returns a map of all account statuses keyed by account ID.
 */
function getAllStatuses() {
  const accounts = db.prepare(
    'SELECT id, bot_status, bot_last_error, bot_queue_pos FROM mc_accounts'
  ).all();

  const result = {};
  for (const acc of accounts) {
    const live = sessions.get(acc.id);
    result[acc.id] = live
      ? {
          status:    live.status,
          queuePos:  live.queuePos  || null,
          lastError: live.lastError || null,
          authCode:  live.authCode  || null,
          authUrl:   live.authUrl   || null,
        }
      : {
          status:    acc.bot_status  || STATUS.OFFLINE,
          queuePos:  acc.bot_queue_pos || null,
          lastError: acc.bot_last_error || null,
          authCode:  null,
          authUrl:   null,
        };
  }
  return result;
}

module.exports = { connect, disconnect, sendCommand, getStatus, getAllStatuses, STATUS };
