// ClubWPT Poker Terminal - Popup Script
'use strict';

document.addEventListener('DOMContentLoaded', function() {
  // Count players in storage
  chrome.storage.local.get(null, function(data) {
    var playerCount = Object.keys(data).filter(function(k) {
      return k.startsWith('player_');
    }).length;
    document.getElementById('player-count').textContent = playerCount + ' players tracked';
  });

  // Check if we're on a game tab
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    if (tab && tab.url && tab.url.includes('clubwptgold.com/game')) {
      document.getElementById('status').textContent = 'Active on table.';
      document.getElementById('status').style.color = '#00ff41';
    }
  });

  // Export button
  document.getElementById('export-btn').addEventListener('click', function() {
    chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, function(data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wpt-terminal-data-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Clear button
  document.getElementById('clear-btn').addEventListener('click', function() {
    if (confirm('Clear all tracked player data? This cannot be undone.')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, function() {
        document.getElementById('player-count').textContent = '0 players tracked';
      });
    }
  });
});
