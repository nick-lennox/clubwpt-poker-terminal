// ClubWPT Poker Terminal - Background Service Worker
'use strict';

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      settings: {
        hudEnabled: true,
        equityIterations: 20000,
        minHandsForDisplay: 5,
        pollInterval: 500,
      }
    });
    console.log('[WPT] Extension installed');
  }
});

// Update badge when on ClubWPT Gold
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (tab.url && tab.url.includes('clubwptgold.com/game') && changeInfo.status === 'complete') {
    chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#00ff41', tabId: tabId });
  }
});

// Message handling
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get('settings', function(result) {
        sendResponse(result.settings || {});
      });
      return true;

    case 'EXPORT_DATA':
      chrome.storage.local.get(null, function(data) {
        sendResponse(data);
      });
      return true;

    case 'CLEAR_DATA':
      chrome.storage.local.clear(function() {
        sendResponse({ success: true });
      });
      return true;
  }
});
