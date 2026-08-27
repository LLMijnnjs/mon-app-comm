let ws = null;
const status = document.getElementById('status');
const log = document.getElementById('log');
const serverUrlInput = document.getElementById('serverUrl');

// Récupère l'URL sauvegardée ou par défaut
let serverUrl = localStorage.getItem('serverUrl') || 'https://server-esp32-xog3-production.up.railway.app/';
if (serverUrlInput) {
    serverUrlInput.value = serverUrl;
}

// Récupère un token d'authentification si fourni (input#authToken, input#token, variable globale ou localStorage)
function getAuthToken() {
    const el = document.getElementById('authToken') || document.getElementById('token');
    if (el && el.value && el.value.trim()) return el.value.trim();
    if (typeof window !== 'undefined' && window.authToken) return window.authToken;
    return localStorage.getItem('authToken') || localStorage.getItem('token') || null;
}

// Change l'URL du serveur
function changeServer() {
        serverUrl = serverUrlInput.value.trim();
        if (!serverUrl) {
                alert('Entre une URL!');
        return;
        }
        localStorage.setItem('serverUrl', serverUrl);
        addLog('✓ URL sauvegardée');
        location.reload();
}

// Convertit une URL HTTP/HTTPS en WS/WSS si nécessaire
function toWsUrl(url) {
    if (!url) return null;
    url = url.trim();
    if (url.startsWith('ws://') || url.startsWith('wss://')) return url;
    if (url.startsWith('http://')) return 'ws://' + url.slice('http://'.length);
    if (url.startsWith('https://')) return 'wss://' + url.slice('https://'.length);
    // si l'utilisateur a fourni seulement hostname, on suppose wss
    return 'wss://' + url;
}

// Connexion WebSocket
function connect() {
    const wsUrl = toWsUrl(serverUrl);
    if (!wsUrl) {
        addLog('✗ URL serveur invalide');
        return;
    }

    console.log('Connexion à:', wsUrl);
    addLog('Connexion...');

    try {
        ws = new WebSocket(wsUrl);
    } catch(e) {
        console.error('Erreur:', e);
        addLog('✗ Erreur URL');
        return;
    }

    ws.onopen = () => {
        updateStatus(true);
        addLog('✓ Connecté!');

        const token = getAuthToken();
        const identify = { id: 'PHONE' };
        if (token) identify.token = token;

        // Envoi d'une identification sécurisée si disponible
        ws.send(JSON.stringify(identify));
    };

    ws.onerror = (error) => {
        console.error(error);
        addLog('✗ Erreur de connexion');
        updateStatus(false);
    };

    ws.onclose = () => {
        updateStatus(false);
        addLog('⚠️ Reconnexion...');
        setTimeout(connect, 3000);
    };
}

// Mettre à jour le statut
function updateStatus(connected) {
        if (connected) {
                status.textContent = '🟢 Connecté';
                status.className = 'status on';
        } else {
                status.textContent = '🔴 Déconnecté';
                status.className = 'status off';
        }
}

// Envoyer l'ordre LED
function sendLED(state) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
                addLog('✗ Non connecté');
                return;
        }

        const action = state === 'on' ? 'ledOn' : 'ledOff';
        const token = getAuthToken();

        const payload = {
                from: 'PHONE',
                action: action
        };
        if (token) payload.token = token;

        ws.send(JSON.stringify(payload));

        addLog(`→ LED ${state.toUpperCase()}`);
}

// Ajouter un log
function addLog(text) {
        const p = document.createElement('p');
        const time = new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
        });
        p.textContent = `${time} - ${text}`;
        log.appendChild(p);
        log.scrollTop = log.scrollHeight;
}

// Expose les fonctions pour debug depuis la console
window.connect = connect;
window.sendLED = sendLED;

// Lancer la connexion au démarrage
connect();
