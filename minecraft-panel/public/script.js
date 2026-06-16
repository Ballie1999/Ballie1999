/* gkku panel — frontend status polling + bot controls */
(function () {
  'use strict';

  var POLL_INTERVAL = 5000; // ms

  var STATUS_LABELS = {
    offline:       { text: 'Offline',       cls: 'status-offline' },
    connecting:    { text: 'Connecting…',   cls: 'status-connecting' },
    auth_required: { text: 'Auth Required', cls: 'status-auth' },
    connected:     { text: 'Connected',     cls: 'status-active' },
    queued:        { text: 'Queued',        cls: 'status-queued' },
    disconnected:  { text: 'Disconnected',  cls: 'status-inactive' },
    error:         { text: 'Error',         cls: 'status-banned' },
  };

  // ── Apply a status update to a single card ──────────────────────────────
  function applyStatus(id, data) {
    var status   = data.status   || 'offline';
    var queuePos = data.queuePos || null;
    var lastError = data.lastError || null;
    var authCode = data.authCode || null;
    var authUrl  = data.authUrl  || null;

    var pill  = document.getElementById('pill-' + id);
    var info  = STATUS_LABELS[status] || { text: status, cls: 'status-unknown' };
    if (pill) {
      pill.textContent = info.text;
      pill.className = 'status-pill ' + info.cls;
    }

    // Queue notice
    var queueEl = document.getElementById('queue-' + id);
    var qposEl  = document.getElementById('qpos-' + id);
    if (queueEl) {
      if (status === 'queued' && queuePos !== null) {
        queueEl.style.display = 'flex';
        if (qposEl) qposEl.textContent = queuePos;
      } else {
        queueEl.style.display = 'none';
      }
    }

    // Auth notice
    var authEl  = document.getElementById('auth-' + id);
    var authMsg = document.getElementById('auth-msg-' + id);
    if (authEl) {
      if (status === 'auth_required' && authCode) {
        authEl.style.display = 'block';
        if (authMsg) {
          authMsg.innerHTML =
            'Visit <a href="' + authUrl + '" target="_blank" rel="noopener">' + authUrl + '</a>' +
            ' and enter code: <strong>' + authCode + '</strong>';
        }
      } else {
        authEl.style.display = 'none';
      }
    }

    // Error row
    var errRow = document.getElementById('err-' + id);
    var errMsg = document.getElementById('errmsg-' + id);
    if (errRow) {
      if (lastError && (status === 'error' || status === 'disconnected')) {
        errRow.style.display = 'flex';
        if (errMsg) errMsg.textContent = lastError;
      } else {
        errRow.style.display = 'none';
      }
    }

    // MC status label
    var mcEl = document.getElementById('mc-' + id);
    if (mcEl) {
      if (status === 'connected')   { mcEl.style.color = 'var(--neon)';    mcEl.textContent = '2b2t.org — Connected'; }
      else if (status === 'queued') { mcEl.style.color = 'var(--warning)'; mcEl.textContent = '2b2t.org — In Queue'; }
      else                          { mcEl.style.color = '';               mcEl.textContent = '2b2t.org'; }
    }

    // Proxy indicator
    var proxyEl = document.getElementById('proxy-' + id);
    if (proxyEl) {
      if (status === 'error' && lastError && /proxy|socks|connect/i.test(lastError)) {
        proxyEl.textContent = '✗';
        proxyEl.className = 'proxy-status proxy-bad';
      } else if (status === 'connected' || status === 'queued') {
        proxyEl.textContent = '✓';
        proxyEl.className = 'proxy-status proxy-ok';
      } else {
        proxyEl.textContent = '';
        proxyEl.className = 'proxy-status';
      }
    }

    // Command bar visibility (connected + queued)
    var cmdBar = document.getElementById('cmd-' + id);
    if (cmdBar) {
      cmdBar.style.display = (status === 'connected' || status === 'queued') ? 'flex' : 'none';
    }

    // Button states
    var btnConnect    = document.querySelector('.btn-connect[data-id="' + id + '"]');
    var btnDisconnect = document.querySelector('.btn-disconnect[data-id="' + id + '"]');
    var btnReconnect  = document.querySelector('.btn-reconnect[data-id="' + id + '"]');
    var busy = ['connecting', 'auth_required'].includes(status);

    if (btnConnect) {
      btnConnect.disabled = ['connecting', 'connected', 'queued', 'auth_required'].includes(status);
    }
    if (btnDisconnect) {
      btnDisconnect.disabled = ['offline', 'disconnected'].includes(status);
    }
    if (btnReconnect) {
      btnReconnect.disabled = busy;
    }
  }

  // ── Poll /bots/statuses ─────────────────────────────────────────────────
  function pollStatuses() {
    fetch('/bots/statuses')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var online = 0, queued = 0;
        Object.keys(data).forEach(function (id) {
          applyStatus(parseInt(id, 10), data[id]);
          if (data[id].status === 'connected') online++;
          if (data[id].status === 'queued')    queued++;
        });
        var statOnline = document.getElementById('stat-online');
        var statQueue  = document.getElementById('stat-queue');
        if (statOnline) statOnline.textContent = online;
        if (statQueue)  statQueue.textContent  = queued;
      })
      .catch(function () {}); // silent — offline / not logged in
  }

  // ── Bot control buttons ─────────────────────────────────────────────────
  function botAction(id, action) {
    fetch('/bots/' + id + '/' + action, { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) console.warn('Bot action error:', data.error);
        // Immediate visual feedback; next poll will correct it
        setTimeout(pollStatuses, 600);
      })
      .catch(function () {});
  }

  document.addEventListener('click', function (e) {
    var el = e.target;

    if (el.classList.contains('btn-connect')) {
      e.preventDefault();
      botAction(el.dataset.id, 'connect');
    } else if (el.classList.contains('btn-disconnect')) {
      e.preventDefault();
      botAction(el.dataset.id, 'disconnect');
    } else if (el.classList.contains('btn-reconnect')) {
      e.preventDefault();
      botAction(el.dataset.id, 'reconnect');
    } else if (el.classList.contains('cmd-send')) {
      e.preventDefault();
      var inputEl = document.getElementById('cmdinput-' + el.dataset.id);
      if (!inputEl || !inputEl.value.trim()) return;
      fetch('/bots/' + el.dataset.id + '/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: inputEl.value.trim() }),
      }).then(function () { inputEl.value = ''; }).catch(function () {});
    }
  });

  // Allow Enter to send command
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList.contains('cmd-input')) {
      var btn = document.querySelector('.cmd-send[data-id="' + e.target.dataset.id + '"]');
      if (btn) btn.click();
    }
  });

  // ── Search / filter ─────────────────────────────────────────────────────
  var searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = this.value.toLowerCase();
      document.querySelectorAll('.bot-card').forEach(function (card) {
        card.style.display = card.dataset.username.includes(q) ? '' : 'none';
      });
    });
  }

  // Start polling
  pollStatuses();
  setInterval(pollStatuses, POLL_INTERVAL);
})();
