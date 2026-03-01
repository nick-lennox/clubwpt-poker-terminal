// ClubWPT Poker Terminal - Isolated World Bridge
// Runs in ISOLATED world with chrome.* API access
// Communicates with MAIN world scripts via window.postMessage
'use strict';

(function() {
  var BRIDGE_ID = 'wpt-bridge';

  // Provide the worker URL to the MAIN world
  var workerUrl = chrome.runtime.getURL('src/workers/equity-worker.js');

  // Post the worker URL so MAIN world can create the Worker
  window.postMessage({
    source: BRIDGE_ID,
    type: 'WORKER_URL',
    url: workerUrl,
  }, '*');

  // Listen for messages from MAIN world
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'wpt-main') return;

    var msg = event.data;

    switch (msg.type) {
      case 'STORAGE_GET':
        chrome.storage.local.get(msg.key, function(result) {
          window.postMessage({
            source: BRIDGE_ID,
            type: 'STORAGE_RESULT',
            requestId: msg.requestId,
            data: msg.key ? result[msg.key] : result,
          }, '*');
        });
        break;

      case 'STORAGE_GET_ALL':
        chrome.storage.local.get(null, function(result) {
          window.postMessage({
            source: BRIDGE_ID,
            type: 'STORAGE_RESULT',
            requestId: msg.requestId,
            data: result,
          }, '*');
        });
        break;

      case 'STORAGE_SET':
        chrome.storage.local.set(msg.data, function() {
          window.postMessage({
            source: BRIDGE_ID,
            type: 'STORAGE_RESULT',
            requestId: msg.requestId,
            data: { success: !chrome.runtime.lastError },
          }, '*');
        });
        break;

      case 'STORAGE_CLEAR':
        chrome.storage.local.clear(function() {
          window.postMessage({
            source: BRIDGE_ID,
            type: 'STORAGE_RESULT',
            requestId: msg.requestId,
            data: { success: true },
          }, '*');
        });
        break;
    }
  });

  console.log('[WPT] Isolated bridge ready');
})();
