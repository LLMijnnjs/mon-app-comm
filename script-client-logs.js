// client log forwarding: override console methods and POST to server /client-logs
(function(){
  // avoid double-inject
  if (window.__CLIENT_LOG_FORWARDER) return;
  window.__CLIENT_LOG_FORWARDER = true;

  const endpoint = (function(){
    try {
      const base = localStorage.getItem('serverUrl') || 'https://server-esp32-xog3-production.up.railway.app/';
      return base.replace(/^https?:/,'') ? (new URL(base)).origin + '/client-logs' : '/client-logs';
    } catch(e){ return '/client-logs'; }
  })();

  function sendLog(level, args) {
    try {
      const msg = args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch(e){ return String(a); }
      }).join(' ');
      // fire-and-forget; use keepalive for navigator unload
      navigator.sendBeacon && navigator.sendBeacon(endpoint, JSON.stringify({ level, msg, ts: new Date().toISOString() }));
      // also try fetch (non-blocking)
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, msg, ts: new Date().toISOString() }), keepalive: true }).catch(()=>{});
    } catch(e) {}
  }

  ['log','info','warn','error'].forEach(name => {
    const orig = console[name] || console.log;
    console[name] = function(...args){
      try { sendLog(name, args); } catch(e) {}
      try { orig.apply(console, args); } catch(e) {}
    };
  });
})();
