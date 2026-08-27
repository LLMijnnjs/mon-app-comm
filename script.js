/* script.js — Auth overlay au démarrage (utilise le HTML existant dans index.html)
   - Le HTML contient #auth (overlay) et #app (wrapper de l'app)
   - Le script montre/masque #auth et #app, gère la WS et envoie {id, password, action}
*/

let ws = null;
let clientId = null; // id mis à jour après authentification
let password = null; // password mis à jour après authentification

const authEl = document.getElementById('auth');
const authIdEl = document.getElementById('authId');
const authPwdEl = document.getElementById('authPassword');
const authSubmit = document.getElementById('authSubmit');
const authCancel = document.getElementById('authCancel');
const authError = document.getElementById('authError');

const appEl = document.getElementById('app');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const serverUrlInput = document.getElementById('serverUrl');

// NEW: éléments pour l'envoi de message utilisateur
const messageInput = document.getElementById('messageInput');
const messageSend = document.getElementById('messageSend');

// default server URL (Railway)
const DEFAULT_SERVER_URL = 'https://server-esp32-xog3-production.up.railway.app/';

// read from localStorage but migrate old Replit URLs to the new Railway URL
let serverUrl = localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL;
try {
  const stored = localStorage.getItem('serverUrl');
  if (stored) {
    const s = stored.toLowerCase();
    if (s.includes('repl') || s.includes('replit')) {
      // replace old Replit URL with the Railway default
      serverUrl = DEFAULT_SERVER_URL;
      localStorage.setItem('serverUrl', serverUrl);
    }
  }
} catch (e) {
  // ignore storage errors
}

if (serverUrlInput) serverUrlInput.value = serverUrl;

function toWsUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url;
  if (url.startsWith('http://')) return 'ws://' + url.slice('http://'.length);
  if (url.startsWith('https://')) return 'wss://' + url.slice('https://'.length);
  return 'wss://' + url;
}

function nowTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function addLog(text) {
  if (!logEl) return;
  const p = document.createElement('p');
  const time = nowTime();
  p.textContent = `${time} - ${text}`;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(connected) {
  if (!statusEl) return;
  statusEl.textContent = connected ? '🟢 Connecté' : '🔴 Déconnecté';
  statusEl.className = connected ? 'status on' : 'status off';
}

// auth timeout settings
const AUTH_TIMEOUT_MS = 10000; // milliseconds (increased from 5000)
let authTimer = null;

function clearAuthTimer() {
  if (authTimer) {
    clearTimeout(authTimer);
    authTimer = null;
  }
}

// pending messages map: msgId -> { el, timeout }
const pendingMessages = new Map();
const ACK_TIMEOUT_MS = 7000; // attendre 7s pour un ack avant d'afficher échec

function markMessageDelivered(msgId, info) {
  const rec = pendingMessages.get(msgId);
  if (!rec) return false;
  clearTimeout(rec.timeout);
  const el = rec.el;
  const time = nowTime();
  el.textContent = `${time} - ✓ Message envoyé${info ? ' (' + info + ')' : ''}`;
  el.classList.remove('pending');
  el.classList.add('delivered');
  pendingMessages.delete(msgId);
  return true;
}

function markMessageFailed(msgId, info) {
  const rec = pendingMessages.get(msgId);
  if (!rec) return false;
  clearTimeout(rec.timeout);
  const el = rec.el;
  const time = nowTime();
  el.textContent = `${time} - ✖ Envoi échoué${info ? ' (' + info + ')' : ''}`;
  el.classList.remove('pending');
  el.classList.add('failed');
  pendingMessages.delete(msgId);
  return true;
}

// connect returns a Promise resolved when ws is open
function connect() {
  return new Promise((resolve, reject) => {
    const wsUrl = toWsUrl(serverUrl);
    if (!wsUrl) { addLog('✗ URL serveur invalide'); return reject(new Error('invalid url')); }

    try {
      // prevent opening multiple websocket if one is already open/connecting
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        addLog('⚠️ WS déjà en cours');
        return resolve();
      }
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error(e);
      addLog('✗ Erreur URL');
      return reject(e);
    }

    let opened = false;

    ws.onopen = () => {
      opened = true;
      updateStatus(true);
      addLog('✓ Connecté !');
      // send identification (id + password may be null)
      const identify = { id: clientId || 'PHONE1', password: password };
      try { ws.send(JSON.stringify(identify)); } catch (e) { console.error('send identify failed', e); }
      console.log('WS onopen — envoi identify:', identify);

      // start auth timeout: if server doesn't confirm within AUTH_TIMEOUT_MS, show error and re-enable button
      clearAuthTimer();
      authTimer = setTimeout(() => {
        addLog('✖ Pas de réponse du serveur (timeout)');
        if (authError) { authError.style.display = 'block'; authError.textContent = 'Pas de réponse du serveur (timeout)'; }
        try { if (ws) ws.close(); } catch (e) {}
        if (authSubmit) { authSubmit.disabled = false; authSubmit.textContent = 'Se connecter'; }
      }, AUTH_TIMEOUT_MS);

      resolve();
    };

    ws.onmessage = (e) => {
      try {
        // log raw frame for diagnsotics
        console.log('WS onmessage raw:', e.data);
        const msg = JSON.parse(e.data);
        // clear auth timeout as soon as we receive any message (and particularly auth)
        clearAuthTimer();
        if (msg && msg.type === 'auth') {
          if (msg.status === 'ok' || msg.status === 'accepted') {
            addLog('✓ Authentification acceptée');
            if (authEl) authEl.style.display = 'none';
            if (appEl) appEl.style.display = '';
          } else {
            addLog('✖ Authentification refusée');
            if (authError) { authError.style.display = 'block'; authError.textContent = 'Authentification refusée'; }
            try { ws.close(); } catch (e) {}
            if (authSubmit) { authSubmit.disabled = false; authSubmit.textContent = 'Se connecter'; }
          }
          return;
        }

        // handle incoming user messages from server
        if (msg && msg.type === 'message' && typeof msg.message === 'string') {
          // if message carries msgId it may correspond to one we sent -> mark delivered
          if (msg.msgId && pendingMessages.has(msg.msgId)) {
            markMessageDelivered(msg.msgId, 'serveur a renvoyé le message');
            return;
          }
          addLog('← Message: ' + msg.message);
          return;
        }

        // handle ack messages (server may send {type:'ack', msgId: '...'} or {type:'ack', id: '...'} )
        if (msg && msg.type === 'ack') {
          const ackId = msg.msgId || msg.id || msg.messageId;
          if (ackId && pendingMessages.has(ackId)) {
            const info = msg.status ? msg.status : (msg.info || 'ACK reçu');
            markMessageDelivered(ackId, info);
            return;
          }
        }

        // generic
        addLog('← ' + (typeof e.data === 'string' ? e.data : JSON.stringify(e.data)));
      } catch (err) {
        addLog('← ' + e.data);
      }
    };

    ws.onerror = (err) => {
      console.error(err);
      addLog('✗ Erreur de connexion');
      updateStatus(false);
      clearAuthTimer();
      if (authSubmit && authEl && authEl.style.display !== 'none') {
        authSubmit.disabled = false;
        authSubmit.textContent = 'Se connecter';
      }
      if (!opened) reject(err);
    };

    ws.onclose = () => {
      updateStatus(false);
      addLog('⚠️ Déconnecté — tentative de reconnexion dans 3s');
      clearAuthTimer();
      if (authSubmit && authEl && authEl.style.display !== 'none') {
        authSubmit.disabled = false;
        authSubmit.textContent = 'Se connecter';
      }
      setTimeout(() => {
        if (authEl && authEl.style.display !== 'none') return;
        connect().catch(() => {});
      }, 3000);
    };
  });
}

function sendLED(state) {
  if (!ws || ws.readyState !== WebSocket.OPEN) { addLog('✗ Non connecté'); return; }
  const action = state === 'on' ? 'ledOn' : 'ledOff';
  const payload = { id: clientId || 'PHONE1', password: password, action: action };
  try { ws.send(JSON.stringify(payload)); } catch (e) { console.error('send failed', e); addLog('✗ Envoi échoué'); }
  addLog(`→ LED ${state.toUpperCase()}`);
}

// NEW: envoie d'un message saisi par l'utilisateur
function sendMessage(text) {
  if (!text || !text.trim()) { addLog('✗ Message vide'); return; }
  if (!ws || ws.readyState !== WebSocket.OPEN) { addLog('✗ Non connecté'); return; }

  const msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
  const payload = { id: clientId || 'PHONE1', password: password, action: 'message', message: String(text), msgId: msgId };

  // create pending log entry
  if (logEl) {
    const p = document.createElement('p');
    p.dataset.msgId = msgId;
    p.classList.add('pending');
    p.textContent = `${nowTime()} - → Message (en attente): ${text}`;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;

    // start ack timeout
    const t = setTimeout(() => {
      // mark failed
      if (pendingMessages.has(msgId)) {
        markMessageFailed(msgId, 'timeout');
      }
    }, ACK_TIMEOUT_MS);

    pendingMessages.set(msgId, { el: p, timeout: t });
  }

  try { ws.send(JSON.stringify(payload)); } catch (e) { console.error('send failed', e); addLog('✗ Envoi échoué'); if (pendingMessages.has(msgId)) markMessageFailed(msgId, 'send error'); }
}

function changeServer() {
  serverUrl = serverUrlInput.value.trim();
  if (!serverUrl) { alert('Entre une URL!'); return; }
  localStorage.setItem('serverUrl', serverUrl);
  addLog('✓ URL sauvegardée');
  location.reload();
}

// Auth handlers (submit/cancel)
if (authSubmit) authSubmit.addEventListener('click', () => {
  if (authError) { authError.style.display = 'none'; authError.textContent = ''; }
  clientId = (authIdEl.value || 'PHONE1').trim();
  password = (authPwdEl.value || '').trim() || null;
  authSubmit.disabled = true;
  authSubmit.textContent = 'Connexion...';
  connect()
    .then(() => {
      // wait server auth message to hide overlay; auth timeout will handle if no response
    })
    .catch((err) => {
      console.error(err);
      if (authError) { authError.style.display = 'block'; authError.textContent = 'Impossible de se connecter au serveur'; }
      authSubmit.disabled = false;
      authSubmit.textContent = 'Se connecter';
    });
});

if (authCancel) authCancel.addEventListener('click', () => {
  try { window.close(); } catch (e) {}
});

// wire message send button if present
if (messageSend) {
  messageSend.addEventListener('click', () => {
    const text = messageInput ? (messageInput.value || '').trim() : '';
    if (!text) { addLog('✗ Message vide'); return; }
    sendMessage(text);
    if (messageInput) messageInput.value = '';
  });
}

// expose for console / buttons
window.sendLED = sendLED;
window.changeServer = changeServer;
window.sendMessage = sendMessage;
