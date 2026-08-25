let ws = null;
const status = document.getElementById('status');
const log = document.getElementById('log');
const serverUrlInput = document.getElementById('serverUrl');
        
        // Récupère l'URL sauvegardée ou par défaut
        let serverUrl = localStorage.getItem('serverUrl') || 'https://app-amour.replit.dev';
        serverUrlInput.value = serverUrl;
        
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
            const protocol = serverUrl.startsWith('https') ? 'wss:' : 'ws:';
            const url = serverUrl.replace('https://', '').replace('http://', '');
            const wsUrl = `${protocol}//${url}`;
            
            console.log('Connexion à:', wsUrl);
            addLog('Connexion...');
            
            try {
                ws = new WebSocket(wsUrl);
            } catch(e) {
                addLog('✗ Erreur URL');
                return;
            }
            
            ws.onopen = () => {
                updateStatus(true);
                addLog('✓ Connecté!');
                
                // S'identifier
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
