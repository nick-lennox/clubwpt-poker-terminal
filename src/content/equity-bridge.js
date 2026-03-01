// ClubWPT Poker Terminal - Equity Bridge
// Tries Web Worker first, falls back to inline calculation
'use strict';

var EquityBridge = (function() {

  function EquityBridge() {
    this._worker = null;
    this._pending = {};
    this._requestCounter = 0;
    this._ready = false;
    this._initAttempts = 0;
  }

  EquityBridge.prototype.init = function() {
    var self = this;

    var tryInit = function() {
      self._initAttempts++;
      var workerUrl = window._wptWorkerUrl;

      if (!workerUrl) {
        if (self._initAttempts < 20) {
          setTimeout(tryInit, 500);
        } else {
          console.warn('[WPT] Worker URL never arrived — using inline equity calculator');
          self._ready = true; // Will use inline fallback
        }
        return;
      }

      try {
        self._worker = new Worker(workerUrl);
        self._worker.onmessage = function(event) {
          self._handleResult(event.data);
        };
        self._worker.onerror = function(err) {
          console.error('[WPT] Equity worker error:', err.message);
          self._worker = null; // Fall back to inline
        };
        self._ready = true;
        console.log('[WPT] Equity worker initialized via Web Worker');
      } catch (e) {
        console.warn('[WPT] Worker creation failed, using inline:', e.message);
        self._worker = null;
        self._ready = true;
      }
    };

    tryInit();
  };

  EquityBridge.prototype.calculateEquity = function(heroCards, communityCards, numOpponents, opponentVpips) {
    var self = this;

    if (!heroCards || heroCards.length !== 2) {
      return Promise.resolve({ equity: '-', winPct: '-', tiePct: '-', lossPct: '-', iterations: 0 });
    }

    if (!this._ready) {
      // Not ready yet, return a placeholder
      return Promise.resolve({
        equity: '50.0', winPct: '50.0', tiePct: '0.0', lossPct: '50.0', iterations: 0,
      });
    }

    // If no worker available, use inline calculation
    if (!this._worker) {
      return Promise.resolve(this._inlineCalculate(heroCards, communityCards, numOpponents, opponentVpips));
    }

    // Use Web Worker
    return new Promise(function(resolve) {
      var requestId = ++self._requestCounter;

      // Cancel stale requests
      var pendingIds = Object.keys(self._pending);
      if (pendingIds.length > 1) {
        var oldest = parseInt(pendingIds[0]);
        if (self._pending[oldest]) {
          self._pending[oldest]({ equity: '-', cancelled: true });
          delete self._pending[oldest];
        }
      }

      self._pending[requestId] = resolve;

      var iterations = WPT.EQUITY_ITERATIONS;

      self._worker.postMessage({
        type: 'CALC_EQUITY',
        requestId: requestId,
        payload: {
          heroCards: heroCards,
          communityCards: communityCards,
          numOpponents: Math.max(1, numOpponents),
          iterations: iterations,
          opponentVpips: opponentVpips || [],
        },
      });

      setTimeout(function() {
        if (self._pending[requestId]) {
          console.warn('[WPT] Worker timed out, using inline fallback');
          self._pending[requestId](self._inlineCalculate(heroCards, communityCards, numOpponents, opponentVpips));
          delete self._pending[requestId];
        }
      }, 3000);
    });
  };

  EquityBridge.prototype._handleResult = function(data) {
    if (!data || !data.requestId) return;
    var resolve = this._pending[data.requestId];
    if (resolve) {
      resolve(data.result);
      delete this._pending[data.requestId];
    }
  };

  // ═══ VPIP-WEIGHTED OPPONENT RANGE TABLE (duplicated from equity-worker.js) ═══
  var _HAND_ORDER = [
    [12,12,2],[11,11,2],[10,10,2],[9,9,2],[8,8,2],
    [12,11,1],[7,7,2],[12,10,1],[12,9,1],[12,11,0],
    [11,10,1],[12,8,1],[6,6,2],[12,7,1],[11,9,1],
    [12,10,0],[11,10,0],[12,6,1],[5,5,2],[10,9,1],
    [12,9,0],[12,5,1],[11,9,0],[12,4,1],[11,8,1],
    [10,8,1],[12,8,0],[12,3,1],[4,4,2],[10,9,0],
    [9,8,1],[12,2,1],[11,7,1],[12,7,0],[11,8,0],
    [10,7,1],[12,6,0],[3,3,2],[9,7,1],[11,6,1],
    [10,8,0],[8,7,1],[12,5,0],[9,8,0],[11,7,0],
    [12,4,0],[11,5,1],[8,6,1],[10,6,1],[2,2,2],
    [7,6,1],[10,7,0],[12,3,0],[9,6,1],[11,4,1],
    [9,7,0],[11,6,0],[8,7,0],[7,5,1],[8,5,1],
    [10,5,1],[12,2,0],[6,5,1],[11,3,1],[10,6,0],
    [11,5,0],[9,5,1],[7,6,0],[8,6,0],[6,4,1],
    [11,2,1],[10,4,1],[5,4,1],[11,4,0],[9,6,0],
    [7,4,1],[10,3,1],[8,4,1],[10,5,0],[5,3,1],
    [7,5,0],[9,4,1],[8,5,0],[6,5,0],[4,3,1],
    [11,3,0],[10,2,1],[6,3,1],[9,3,1],[11,2,0],
    [8,3,1],[9,5,0],[10,4,0],[5,2,1],[3,2,1],
    [7,4,0],[6,4,0],[4,2,1],[10,3,0],[7,3,1],
    [9,2,1],[5,4,0],[8,2,1],[9,4,0],[8,4,0],
    [10,2,0],[4,3,0],[7,2,1],[6,2,1],[9,3,0],
    [5,3,0],[8,3,0],[6,3,0],[3,2,0],[9,2,0],
    [7,3,0],[4,2,0],[8,2,0],[5,2,0],[6,2,0],
    [7,2,0]
  ];

  var _RANGE_PCT = [];
  (function() {
    var i, r, c;
    for (r = 0; r < 13; r++) {
      _RANGE_PCT[r] = [];
      for (c = 0; c < 13; c++) _RANGE_PCT[r][c] = 100;
    }
    var cumCombos = 0;
    var TOTAL_COMBOS = 1326;
    for (i = 0; i < _HAND_ORDER.length; i++) {
      var h = _HAND_ORDER[i];
      var hi = h[0], lo = h[1], type = h[2];
      var combos = type === 2 ? 6 : type === 1 ? 4 : 12;
      cumCombos += combos;
      var pct = (cumCombos / TOTAL_COMBOS) * 100;
      if (type === 2) _RANGE_PCT[hi][lo] = pct;
      else if (type === 1) _RANGE_PCT[lo][hi] = pct;
      else _RANGE_PCT[hi][lo] = pct;
    }
  })();

  function _getHandPercentile(card1, card2) {
    var r1 = (card1 >> 8) & 0xF;
    var r2 = (card2 >> 8) & 0xF;
    var s1 = card1 & 0xF000;
    var s2 = card2 & 0xF000;
    if (r1 === r2) return _RANGE_PCT[r1][r2];
    var hi = r1 > r2 ? r1 : r2;
    var lo = r1 > r2 ? r2 : r1;
    if (s1 === s2) return _RANGE_PCT[lo][hi];
    return _RANGE_PCT[hi][lo];
  }

  // ═══ INLINE MONTE CARLO (runs on main thread) ═══
  EquityBridge.prototype._inlineCalculate = function(heroCards, communityCards, numOpponents, opponentVpips) {
    numOpponents = Math.max(1, numOpponents || 1);
    opponentVpips = opponentVpips || [];
    var iterations = 5000; // Less iterations for main thread to avoid blocking

    // Build deck
    var RANKS = CardUtils.RANKS;
    var SUITS = CardUtils.SUITS;

    // Encode hero cards
    var heroEncoded = [];
    for (var i = 0; i < heroCards.length; i++) {
      heroEncoded.push(CardUtils.encode(heroCards[i]));
    }

    // Encode board
    var boardEncoded = [];
    for (var j = 0; j < communityCards.length; j++) {
      boardEncoded.push(CardUtils.encode(communityCards[j]));
    }

    // Dead cards
    var deadSet = {};
    for (var d = 0; d < heroEncoded.length; d++) deadSet[heroEncoded[d]] = true;
    for (var b = 0; b < boardEncoded.length; b++) deadSet[boardEncoded[b]] = true;

    // Available deck
    var fullDeck = CardUtils.buildDeck();
    var available = [];
    for (var k = 0; k < fullDeck.length; k++) {
      if (!deadSet[fullDeck[k]]) available.push(fullDeck[k]);
    }

    // Check if any opponent has VPIP filtering active
    var hasVpipFilter = false;
    for (var vi = 0; vi < numOpponents; vi++) {
      var v = vi < opponentVpips.length ? opponentVpips[vi] : 0;
      if (v > 0 && v < 100) { hasVpipFilter = true; break; }
    }

    var wins = 0, ties = 0, losses = 0;
    var cardsNeeded = 5 - boardEncoded.length;
    var oppCardsNeeded = numOpponents * 2;

    for (var iter = 0; iter < iterations; iter++) {
      // Full shuffle when VPIP filtering is active, otherwise partial
      var totalNeeded = cardsNeeded + oppCardsNeeded;
      var shuffleCount = hasVpipFilter ? available.length : totalNeeded;
      for (var si = available.length - 1; si > 0 && si >= available.length - shuffleCount; si--) {
        var ri = Math.floor(Math.random() * (si + 1));
        var tmp = available[si];
        available[si] = available[ri];
        available[ri] = tmp;
      }

      var pickIdx = available.length - 1;

      // Deal community
      var fullBoard = boardEncoded.slice();
      for (var c = 0; c < cardsNeeded; c++) {
        fullBoard.push(available[pickIdx--]);
      }

      // Evaluate hero
      var heroAll = [heroEncoded[0], heroEncoded[1], fullBoard[0], fullBoard[1], fullBoard[2], fullBoard[3], fullBoard[4]];
      var heroRank = HandEvaluator.evaluate7(heroAll);

      // Evaluate opponents
      var heroBest = true;
      var tiedWithHero = false;

      for (var opp = 0; opp < numOpponents; opp++) {
        var oppCard1 = available[pickIdx];
        var oppCard2 = available[pickIdx - 1];

        // VPIP range filtering
        var vpipLimit = opp < opponentVpips.length ? opponentVpips[opp] : 0;
        if (vpipLimit > 0 && vpipLimit < 100) {
          if (_getHandPercentile(oppCard1, oppCard2) > vpipLimit) {
            var found = false;
            for (var scan = pickIdx - 2; scan >= 1; scan -= 2) {
              if (_getHandPercentile(available[scan], available[scan - 1]) <= vpipLimit) {
                var sw1 = available[pickIdx];
                available[pickIdx] = available[scan];
                available[scan] = sw1;
                var sw2 = available[pickIdx - 1];
                available[pickIdx - 1] = available[scan - 1];
                available[scan - 1] = sw2;
                oppCard1 = available[pickIdx];
                oppCard2 = available[pickIdx - 1];
                found = true;
                break;
              }
            }
          }
        }

        pickIdx -= 2;
        var oppAll = [oppCard1, oppCard2, fullBoard[0], fullBoard[1], fullBoard[2], fullBoard[3], fullBoard[4]];
        var oppRank = HandEvaluator.evaluate7(oppAll);

        if (oppRank < heroRank) {
          heroBest = false;
          break;
        } else if (oppRank === heroRank) {
          tiedWithHero = true;
        }
      }

      if (!heroBest) losses++;
      else if (tiedWithHero) ties++;
      else wins++;
    }

    var equity = ((wins + ties * 0.5) / iterations) * 100;

    return {
      equity: equity.toFixed(1),
      winPct: (wins / iterations * 100).toFixed(1),
      tiePct: (ties / iterations * 100).toFixed(1),
      lossPct: (losses / iterations * 100).toFixed(1),
      iterations: iterations,
    };
  };

  EquityBridge.prototype.destroy = function() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._pending = {};
    this._ready = false;
  };

  return EquityBridge;

})();

window.EquityBridge = EquityBridge;
