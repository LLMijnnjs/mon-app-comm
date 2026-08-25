const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// ⚠️ IMPORTANT: Config WebSocket pour HTTPS
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false
});

let esp32_A = null;
let esp32_B = null;
let phones = [];

// Ajouter les headers CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Route de health check
app.get('/', (req, res) => {
    res.send('Serveur WebSocket actif');
});

wss.on('connection', (ws) => {
    console.log('📡 Nouvelle connexion WebSocket');
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('📨 Message reçu:', msg);
            
            // Identification
            if (msg.id === 'ESP32_A') {
                esp32_A = ws;
                console.log('✓ ESP32_A connecté');
            } 
            else if (msg.id === 'ESP32_B') {
                esp32_B = ws;
                console.log('✓ ESP32_B connecté');
            }
            else if (msg.id === 'PHONE') {
                if (!phones.includes(ws)) {
                    phones.push(ws);
                    console.log(`📱 PHONE connecté (Total: ${phones.length})`);
                }
            }
            
            // Relayer les messages
            if (msg.from === 'ESP32_A' && esp32_B) {
                console.log(`📨 A → B`);
                esp32_B.send(JSON.stringify(msg));
            }
            
            if (msg.from === 'ESP32_B' && esp32_A) {
                console.log(`📨 B → A`);
                esp32_A.send(JSON.stringify(msg));
            }
            
            if (msg.from === 'PHONE') {
                console.log(`📱 PHONE → ESP32`);
                if (esp32_A) esp32_A.send(JSON.stringify(msg));
                if (esp32_B) esp32_B.send(JSON.stringify(msg));
            }
            
        } catch(e) {
            console.error('❌ Erreur parse JSON:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('❌ Connexion fermée');
        if (ws === esp32_A) esp32_A = null;
        if (ws === esp32_B) esp32_B = null;
        phones = phones.filter(p => p !== ws);
    });
    
    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur WebSocket démarré sur port ${PORT}`);
    console.log(`📡 En attente de connexions...`);
    console.log(`URL: https://serveur-web-socket-esp-32--leoserver.replit.app`);
});
