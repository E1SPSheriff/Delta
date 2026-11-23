// Static fallback config. When the Node server runs, it serves its own /config.js pointing at itself.
// Empty string = offline single-player mode (everything runs on this device).
// To use a separately hosted server, set e.g. window.SKIPPIES_SERVER = 'https://your-server.example.com';
window.SKIPPIES_SERVER = window.SKIPPIES_SERVER || '';
window.MAMASHOP_REWARDS_URL = window.MAMASHOP_REWARDS_URL || './rewards/';
