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

let serverUrl = localStorage.getItem('serverUrl') || 'https://server-esp32-xog3-production.up.railway.app/';
if (serverUrlInput) serverUrlInput.value = serverUrl;

function toWsUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url;
  if (url.startsWith('http://')) return 'ws://' + url.slice('http://'.length);
  if (url.startsWith('https://')) return 'wss://' + url.slice('https://'.length);
  return 'wss://' + url;
}

function addLog(text) {
  if (!logEl) return;
  const p = document.createElement('p');
  const time = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
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

// expose for console / buttons
window.sendLED = sendLED;
window.changeServer = changeServer;
