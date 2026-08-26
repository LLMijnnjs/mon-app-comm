let ws = null;
const status = document.getElementById('status');
const log = document.getElementById('log');
const serverUrlInput = document.getElementById('serverUrl');
        
        // Récupère l'URL sauvegardée ou par défaut
        let serverUrl = localStorage.getItem('serverUrl') || 'https://esp-32-web-socket-relay--collleopter06.replit.app/api?id=PHONE';
if (serverUrlInput) {
    serverUrlInput.value = serverUrl;
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
        
        // Connexion WebSocket
function connect() {
    const wsUrl = 'wss://esp-32-web-socket-relay--collleopter06.replit.app/api?id=PHONE';
    
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
        
        ws.send(JSON.stringify({
            id: 'PHONE'
        }));
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
            
            ws.send(JSON.stringify({
                from: 'PHONE',
                action: action
            }));
            
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
        
        // Lancer la connexion au démarrage
        connect();
