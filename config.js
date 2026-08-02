/* ============================================================
   UNBOUND FRONTEND CONFIG
   ------------------------------------------------------------
   Set this to wherever you deployed unbound-server (see its
   README for Render/Railway steps). Everything else in the
   frontend reads from this one constant — checkout, success,
   admin, and dev pages all import this file.
   ============================================================ */
const UB_API_BASE = 'http://localhost:4000'; // TODO: replace with your deployed backend URL, e.g. https://unbound-server.onrender.com

// Fails loudly instead of silently breaking checkout if this file
// was never updated after deploying — a blank cart/checkout error
// with no explanation is a much worse debugging experience than
// this console warning.
if(UB_API_BASE.includes('localhost') && !['localhost', '127.0.0.1'].includes(window.location.hostname)){
  console.warn(
    '[UNBOUND] UB_API_BASE in config.js is still set to localhost, but this site is not running on localhost. ' +
    'Update config.js with your deployed backend URL before going live — checkout, cart persistence, and both dashboards will not work otherwise.'
  );
}
