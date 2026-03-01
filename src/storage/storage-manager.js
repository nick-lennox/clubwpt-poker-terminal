// ClubWPT Poker Terminal - Storage Manager
// Runs in MAIN world - uses postMessage bridge to ISOLATED world for chrome.storage
'use strict';

var StorageManager = (function() {

  var BRIDGE_ID = 'wpt-bridge';
  var MAIN_ID = 'wpt-main';

  function StorageManager() {
    this._cache = {};
    this._dirty = {};
    this._flushTimer = null;
    this._initialized = false;
    this._pendingRequests = {};
    this._requestCounter = 0;
  }

  // Initialize - load all player data into cache via bridge
  StorageManager.prototype.init = function(callback) {
    var self = this;

    // Listen for bridge responses
    window.addEventListener('message', function(event) {
      if (event.source !== window) return;
      if (!event.data || event.data.source !== BRIDGE_ID) return;

      var msg = event.data;

      if (msg.type === 'STORAGE_RESULT' && self._pendingRequests[msg.requestId]) {
        self._pendingRequests[msg.requestId](msg.data);
        delete self._pendingRequests[msg.requestId];
      }

      if (msg.type === 'WORKER_URL') {
        // Store worker URL for equity bridge to use
        window._wptWorkerUrl = msg.url;
        console.log('[WPT] Worker URL received from bridge');
      }
    });

    // Request all stored data
    this._bridgeRequest('STORAGE_GET_ALL', {}, function(data) {
      if (data) {
        Object.keys(data).forEach(function(key) {
          if (key.startsWith('player_')) {
            self._cache[key] = data[key];
          }
        });
      }
      self._initialized = true;

      // Flush dirty data every 30 seconds
      self._flushTimer = setInterval(function() { self.flush(); }, 30000);

      console.log('[WPT] Storage loaded: ' + Object.keys(self._cache).length + ' players');
      if (callback) callback();
    });

    // Fallback if bridge doesn't respond in 3 seconds
    setTimeout(function() {
      if (!self._initialized) {
        console.warn('[WPT] Storage bridge timeout, starting with empty cache');
        self._initialized = true;
        self._flushTimer = setInterval(function() { self.flush(); }, 30000);
        if (callback) callback();
      }
    }, 3000);
  };

  // Send a request via postMessage bridge
  StorageManager.prototype._bridgeRequest = function(type, extra, callback) {
    var requestId = ++this._requestCounter;
    this._pendingRequests[requestId] = callback;

    var msg = {
      source: MAIN_ID,
      type: type,
      requestId: requestId,
    };
    // Merge extra fields
    if (extra) {
      Object.keys(extra).forEach(function(k) { msg[k] = extra[k]; });
    }

    window.postMessage(msg, '*');

    // Timeout after 5 seconds
    var self = this;
    setTimeout(function() {
      if (self._pendingRequests[requestId]) {
        console.warn('[WPT] Bridge request ' + type + ' timed out');
        self._pendingRequests[requestId](null);
        delete self._pendingRequests[requestId];
      }
    }, 5000);
  };

  // Get a player record (sync from cache)
  StorageManager.prototype.getPlayer = function(normalizedName) {
    var key = 'player_' + normalizedName;
    return this._cache[key] || null;
  };

  // Save a player record (cache + mark dirty)
  StorageManager.prototype.savePlayer = function(normalizedName, record) {
    var key = 'player_' + normalizedName;
    this._cache[key] = record;
    this._dirty[key] = true;
  };

  // Get all player records
  StorageManager.prototype.getAllPlayers = function() {
    var players = {};
    var self = this;
    Object.keys(this._cache).forEach(function(key) {
      if (key.startsWith('player_')) {
        players[key.substring(7)] = self._cache[key];
      }
    });
    return players;
  };

  // Flush dirty records via bridge
  StorageManager.prototype.flush = function() {
    var dirtyKeys = Object.keys(this._dirty);
    if (dirtyKeys.length === 0) return;

    var toWrite = {};
    for (var i = 0; i < dirtyKeys.length; i++) {
      toWrite[dirtyKeys[i]] = this._cache[dirtyKeys[i]];
    }
    this._dirty = {};

    this._bridgeRequest('STORAGE_SET', { data: toWrite }, function(result) {
      if (!result || !result.success) {
        console.warn('[WPT] Storage flush may have failed');
      }
    });
  };

  // Destroy - flush and stop timers
  StorageManager.prototype.destroy = function() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this.flush();
  };

  return StorageManager;

})();

window.StorageManager = StorageManager;
