// ClubWPT Poker Terminal - Session P&L Tracker
// Persists daily session data to localStorage so page reloads don't reset stats
'use strict';

var SessionTracker = (function() {

  var STORAGE_KEY_PREFIX = 'wpt_session_';

  function todayKey() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return STORAGE_KEY_PREFIX + yyyy + '-' + mm + '-' + dd;
  }

  function SessionTracker() {
    this._startTime = Date.now();
    this._startStack = 0;
    this._currentStack = 0;
    this._handsPlayed = 0;
    this._handsWon = 0;
    this._bigBlind = 0.02; // Default, will be detected
    this._vpipHands = 0;   // Hands we voluntarily put money in
    this._pfRaiseHands = 0;
    this._history = [];    // Last N hand results
    this._maxHistory = 50;
    this._heroName = '';
    this._lastHandNum = 0;
    this._initialBuyIn = 0;
    this._peakStack = 0;
    this._valleyStack = Infinity;
    this._buyInDetected = false;
    this._lastTotalBuyin = 0;  // Track buy-in changes for rebuy detection
    this._saveTimer = 0;   // Throttle saves

    // Restore today's session from localStorage if available
    this._restore();
  }

  // ═══ PERSISTENCE ═══

  // Restore session state from localStorage (same day only)
  SessionTracker.prototype._restore = function() {
    try {
      var key = todayKey();
      var raw = localStorage.getItem(key);
      if (!raw) return;

      var saved = JSON.parse(raw);
      if (!saved || !saved.startStack) return;

      this._startTime = saved.startTime || this._startTime;
      this._startStack = saved.startStack;
      this._currentStack = saved.currentStack || saved.startStack;
      this._handsPlayed = saved.handsPlayed || 0;
      this._vpipHands = saved.vpipHands || 0;
      this._pfRaiseHands = saved.pfRaiseHands || 0;
      this._history = saved.history || [];
      this._heroName = saved.heroName || '';
      this._lastHandNum = saved.lastHandNum || 0;
      this._initialBuyIn = saved.initialBuyIn || saved.startStack;
      this._peakStack = saved.peakStack || saved.startStack;
      this._valleyStack = saved.valleyStack || saved.startStack;
      this._bigBlind = saved.bigBlind || 0.02;
      this._buyInDetected = saved.buyInDetected || false;
      this._lastTotalBuyin = saved.lastTotalBuyin || 0;

      console.log('[WPT] Session restored: start=$' + this._startStack.toFixed(2) +
        ' current=$' + this._currentStack.toFixed(2) +
        ' hands=' + this._handsPlayed +
        ' P&L=$' + (this._currentStack - this._startStack).toFixed(2));
    } catch (e) {
      console.warn('[WPT] Failed to restore session:', e);
    }
  };

  // Save session state to localStorage
  SessionTracker.prototype._save = function() {
    try {
      var key = todayKey();
      var data = {
        startTime: this._startTime,
        startStack: this._startStack,
        currentStack: this._currentStack,
        handsPlayed: this._handsPlayed,
        vpipHands: this._vpipHands,
        pfRaiseHands: this._pfRaiseHands,
        history: this._history,
        heroName: this._heroName,
        lastHandNum: this._lastHandNum,
        initialBuyIn: this._initialBuyIn,
        peakStack: this._peakStack,
        valleyStack: this._valleyStack === Infinity ? 0 : this._valleyStack,
        bigBlind: this._bigBlind,
        buyInDetected: this._buyInDetected,
        lastTotalBuyin: this._lastTotalBuyin,
        savedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      // localStorage might be full or unavailable — fail silently
    }
  };

  // Throttled save: at most once per 5 seconds on stack updates
  SessionTracker.prototype._throttledSave = function() {
    var now = Date.now();
    if (now - this._saveTimer < 5000) return;
    this._saveTimer = now;
    this._save();
  };

  // Clean up old session keys (keep last 7 days)
  SessionTracker.prototype._cleanOldSessions = function() {
    try {
      var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(STORAGE_KEY_PREFIX) === 0) {
          var dateStr = k.substring(STORAGE_KEY_PREFIX.length);
          var d = new Date(dateStr);
          if (!isNaN(d.getTime()) && d.getTime() < cutoff) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch (e) {}
  };

  // ═══ PUBLIC API ═══

  // Set initial stack when we first sit down
  SessionTracker.prototype.setStartStack = function(stack) {
    if (this._startStack === 0 && stack > 0) {
      this._startStack = stack;
      this._currentStack = stack;
      this._initialBuyIn = stack;
      this._peakStack = stack;
      this._valleyStack = stack;
      this._save(); // Persist immediately on first detection
      this._cleanOldSessions();
    }
  };

  // Update current stack from game state (called every tick with effective stack)
  // Does NOT update peak/valley — those are only updated at hand boundaries
  SessionTracker.prototype.updateStack = function(stack) {
    if (stack > 0) {
      this._currentStack = stack;
      this._throttledSave();
    }
  };

  // Snapshot stack at hand boundaries (newHand / handComplete) for accurate peak/valley
  SessionTracker.prototype.snapshotHandBoundary = function(stack) {
    if (stack > 0) {
      this._currentStack = stack;
      if (stack > this._peakStack) this._peakStack = stack;
      if (stack < this._valleyStack) this._valleyStack = stack;
      this._save();
    }
  };

  // Update buy-in from game's buyinInfos (handles rebuys)
  // totalBuyin: total amount bought in this session (accumulates on rebuy)
  SessionTracker.prototype.updateBuyIn = function(totalBuyin) {
    if (totalBuyin <= 0) return;
    if (totalBuyin === this._lastTotalBuyin) return; // No change

    var isRebuy = this._lastTotalBuyin > 0 && totalBuyin > this._lastTotalBuyin;
    this._lastTotalBuyin = totalBuyin;
    this._startStack = totalBuyin;
    this._initialBuyIn = totalBuyin;
    this._buyInDetected = true;

    if (isRebuy) {
      // On rebuy, peak might need to be relative to new total investment
      console.log('[WPT] Rebuy detected: total buy-in now $' + totalBuyin.toFixed(2));
    }

    if (totalBuyin > this._peakStack) this._peakStack = totalBuyin;
    this._save();
  };

  // Reset session — restart tracking from current stack
  SessionTracker.prototype.reset = function() {
    var stack = this._currentStack;
    this._startTime = Date.now();
    this._startStack = stack;
    this._initialBuyIn = stack;
    this._peakStack = stack;
    this._valleyStack = stack;
    this._handsPlayed = 0;
    this._handsWon = 0;
    this._vpipHands = 0;
    this._pfRaiseHands = 0;
    this._history = [];
    this._lastHandNum = 0;
    this._lastTotalBuyin = 0;
    this._buyInDetected = false;
    this._save();
    console.log('[WPT] Session reset at stack=$' + stack.toFixed(2));
  };

  // Update big blind from game state
  SessionTracker.prototype.setBigBlind = function(bb) {
    if (bb > 0) this._bigBlind = bb;
  };

  // Set hero name
  SessionTracker.prototype.setHeroName = function(name) {
    if (name && name !== 'Name') this._heroName = name;
  };

  // Record a completed hand
  SessionTracker.prototype.recordHand = function(handData) {
    if (!handData || handData.handId == null) return;
    if (handData.handId === this._lastHandNum) return; // Duplicate
    this._lastHandNum = handData.handId;

    this._handsPlayed++;

    var entry = {
      handId: handData.handId,
      time: Date.now(),
      stack: this._currentStack,
    };

    if (handData.heroVPIP) this._vpipHands++;
    if (handData.heroPFR) this._pfRaiseHands++;

    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    this._save(); // Persist after every hand
  };

  // Get session stats
  SessionTracker.prototype.getStats = function() {
    var elapsed = Date.now() - this._startTime;
    var hours = elapsed / (1000 * 60 * 60);
    var profit = this._currentStack - this._startStack;
    var bbProfit = this._bigBlind > 0 ? profit / this._bigBlind : 0;
    var bbPerHour = hours > 0 ? bbProfit / hours : 0;
    var bb100 = this._handsPlayed > 0 ? (bbProfit / this._handsPlayed) * 100 : 0;

    return {
      profit: profit,
      profitBB: bbProfit,
      startStack: this._startStack,
      currentStack: this._currentStack,
      peakStack: this._peakStack,
      valleyStack: this._valleyStack === Infinity ? this._startStack : this._valleyStack,
      handsPlayed: this._handsPlayed,
      duration: this._formatDuration(elapsed),
      durationMs: elapsed,
      bbPerHour: bbPerHour,
      bb100: bb100,
      vpipPct: this._handsPlayed > 0 ? (this._vpipHands / this._handsPlayed) * 100 : 0,
      pfrPct: this._handsPlayed > 0 ? (this._pfRaiseHands / this._handsPlayed) * 100 : 0,
      bigBlind: this._bigBlind,
      heroName: this._heroName,
      graphData: this._buildGraphData(),
    };
  };

  // Build mini graph data (stack over time)
  SessionTracker.prototype._buildGraphData = function() {
    if (this._history.length === 0) return [];
    return this._history.map(function(h) {
      return { hand: h.handId, stack: h.stack };
    });
  };

  // Format duration
  SessionTracker.prototype._formatDuration = function(ms) {
    var totalSec = Math.floor(ms / 1000);
    var hrs = Math.floor(totalSec / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;
    if (hrs > 0) return hrs + 'h ' + mins + 'm';
    return mins + 'm ' + secs + 's';
  };

  return SessionTracker;

})();

window.SessionTracker = SessionTracker;
