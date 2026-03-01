// ClubWPT Poker Terminal - Hand Tracker State Machine
'use strict';

var HandTracker = (function() {

  function HandTracker() {
    this._listeners = {};
    this.state = 'WAITING';
    this.currentHand = null;
    this.handHistory = [];
    this._lastHandNum = 0;
    this._lastPhase = 'unknown';
    this._lastPlayerStatuses = {};
    this._actionQueue = []; // Buffer to detect new actions
    // Fallback hand detection (when handNum is unavailable)
    this._fallbackHeroCards = '';
    this._fallbackHandCounter = 100000;
  }

  // Event emitter
  HandTracker.prototype.on = function(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  };

  HandTracker.prototype.emit = function(event, data) {
    var fns = this._listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](data); } catch (e) { console.error('[WPT] HandTracker event error:', e); }
    }
  };

  // Process a new game state from the scraper
  HandTracker.prototype.processState = function(gameState) {
    var handNum = gameState.handNum;

    // Detect new hand via handNum change
    var handNumChanged = false;
    if (handNum > 0 && handNum !== this._lastHandNum) {
      handNumChanged = true;
      if (this.currentHand) {
        this._finalizeHand(gameState);
      }
      this._startNewHand(gameState);
      this._lastHandNum = handNum;
    }

    // Fallback hand detection when handNum is unavailable (always 0)
    // Detect hand boundaries by monitoring hero hole card transitions
    var _fbHero = [];
    for (var _fbi = 0; _fbi < gameState.players.length; _fbi++) {
      var _fbp = gameState.players[_fbi];
      if ((_fbp.seatIndex === gameState.heroSeatIndex || _fbp.isOwner) && _fbp.cards.length === 2) {
        _fbHero = _fbp.cards;
        break;
      }
    }
    var _fbStr = _fbHero.join(',');
    var _fbNeedNew = false;

    // Signal 1: hero cards appeared after being absent (sentinel values between hands)
    if (_fbStr && !this._fallbackHeroCards) {
      _fbNeedNew = true;
    }
    // Signal 2: hero card values changed during preflop (stale cards persisted)
    if (_fbStr && this._fallbackHeroCards && _fbStr !== this._fallbackHeroCards && gameState.communityCards.length === 0) {
      _fbNeedNew = true;
    }

    if (!handNumChanged && _fbNeedNew) {
      if (this.currentHand) {
        this._finalizeHand(gameState);
      }
      this._fallbackHandCounter++;
      this._startNewHand(gameState);
      this.currentHand.handId = this._fallbackHandCounter;
      console.log('[WPT] Fallback hand detection: hand #' + this._fallbackHandCounter);
    }
    this._fallbackHeroCards = _fbStr;

    // If no current hand, nothing to track
    if (!this.currentHand) return;

    // Detect phase changes
    if (gameState.phase !== 'unknown' && gameState.phase !== this._lastPhase) {
      this._onPhaseChange(this._lastPhase, gameState.phase, gameState);
      this._lastPhase = gameState.phase;
    }

    // Detect player actions by status changes
    this._detectActions(gameState);

    // Update community cards
    if (gameState.communityCards.length > 0) {
      this.currentHand.communityCards = gameState.communityCards.slice();
    }

    // Update hero cards
    var heroSeat = gameState.heroSeatIndex;
    if (heroSeat >= 0) {
      var hero = gameState.players.find(function(p) { return p.seatIndex === heroSeat; });
      if (hero && hero.cards.length === 2) {
        this.currentHand.heroCards = hero.cards.slice();
      }
    }

    // Update pot
    this.currentHand.pot = gameState.pot;
  };

  // Start tracking a new hand
  HandTracker.prototype._startNewHand = function(gameState) {
    this.state = 'PREFLOP';
    this._lastPhase = 'preflop';
    this._lastPlayerStatuses = {};

    var activePlayers = gameState.players.filter(function(p) {
      return !p.isEmpty && p.name && p.name !== 'Name';
    });

    this.currentHand = {
      handId: gameState.handNum,
      startTime: Date.now(),
      heroCards: [],
      communityCards: [],
      heroSeatIndex: gameState.heroSeatIndex,
      dealerSeatIndex: gameState.dealerSeatIndex,
      blinds: gameState.blinds,
      pot: gameState.pot,
      players: activePlayers.map(function(p) {
        return {
          name: p.name,
          seatIndex: p.seatIndex,
          startingStack: p.chips,
          position: null,
          actions: { preflop: [], flop: [], turn: [], river: [] },
          vpip: false,
          pfr: false,
          threeBet: false,
          wentToShowdown: false,
          sawFlop: false,
          isFolded: false,
          isAllIn: false,
        };
      }),
      phases: {
        preflop: { potAtStart: gameState.pot, raisesCount: 0 },
        flop: { potAtStart: 0, raisesCount: 0 },
        turn: { potAtStart: 0, raisesCount: 0 },
        river: { potAtStart: 0, raisesCount: 0 },
      },
    };

    // Assign positions
    this._assignPositions(gameState);

    // Initialize status tracking
    for (var i = 0; i < gameState.players.length; i++) {
      var p = gameState.players[i];
      if (p.name) this._lastPlayerStatuses[p.name] = '';
    }

    console.log('[WPT] New hand #' + gameState.handNum + ' with ' + activePlayers.length + ' players');
    this.emit('newHand', this.currentHand);
  };

  // Assign table positions based on dealer seat
  HandTracker.prototype._assignPositions = function(gameState) {
    if (!this.currentHand || this.currentHand.players.length === 0) return;

    var playerCount = this.currentHand.players.length;
    var positions = WPT.POSITIONS[playerCount] || WPT.POSITIONS[9];
    var dealerSeat = gameState.dealerSeatIndex;

    if (dealerSeat < 0) return;

    // Find dealer in our player list
    var dealerIdx = -1;
    for (var i = 0; i < this.currentHand.players.length; i++) {
      if (this.currentHand.players[i].seatIndex === dealerSeat) {
        dealerIdx = i;
        break;
      }
    }
    if (dealerIdx < 0) return;

    for (var j = 0; j < this.currentHand.players.length; j++) {
      var rotated = (j - dealerIdx + playerCount) % playerCount;
      this.currentHand.players[j].position = positions[rotated] || 'Seat' + rotated;
    }
  };

  // Handle phase transition
  HandTracker.prototype._onPhaseChange = function(fromPhase, toPhase, gameState) {
    this.state = toPhase.toUpperCase();

    if (this.currentHand.phases[toPhase]) {
      this.currentHand.phases[toPhase].potAtStart = gameState.pot;
    }

    // Mark players who saw the flop
    if (toPhase === 'flop') {
      for (var i = 0; i < this.currentHand.players.length; i++) {
        if (!this.currentHand.players[i].isFolded) {
          this.currentHand.players[i].sawFlop = true;
        }
      }
    }

    console.log('[WPT] Phase: ' + fromPhase + ' -> ' + toPhase + ' (pot: ' + gameState.pot + ')');
    this.emit('phaseChange', { from: fromPhase, to: toPhase, hand: this.currentHand });
  };

  // Detect player actions from status text changes
  HandTracker.prototype._detectActions = function(gameState) {
    var phase = this._lastPhase || 'preflop';

    for (var i = 0; i < gameState.players.length; i++) {
      var p = gameState.players[i];
      if (!p.name || p.isEmpty) continue;

      var prevStatus = this._lastPlayerStatuses[p.name] || '';
      var curStatus = p.status;

      // Status changed - this is a new action
      if (curStatus && curStatus !== prevStatus && curStatus !== 'Waiting' && curStatus !== 'Open seat') {
        var action = WPT.ACTION_MAP[curStatus] || curStatus.toLowerCase();

        var trackedPlayer = this._findPlayer(p.name);
        if (trackedPlayer && !trackedPlayer.isFolded) {
          var actionRecord = {
            action: action,
            phase: phase,
            timestamp: Date.now(),
          };

          trackedPlayer.actions[phase] = trackedPlayer.actions[phase] || [];
          trackedPlayer.actions[phase].push(actionRecord);

          // Update flags
          if (action === 'fold') {
            trackedPlayer.isFolded = true;
          } else if (action === 'allin') {
            trackedPlayer.isAllIn = true;
          }

          // Preflop stats
          if (phase === 'preflop') {
            if (action === 'call' || action === 'raise' || action === 'allin') {
              trackedPlayer.vpip = true;
            }
            if (action === 'raise' || action === 'allin') {
              trackedPlayer.pfr = true;
              this.currentHand.phases.preflop.raisesCount++;
              if (this.currentHand.phases.preflop.raisesCount >= 2) {
                trackedPlayer.threeBet = true;
              }
            }
          }

          this.emit('action', {
            player: trackedPlayer,
            action: actionRecord,
            phase: phase,
            gameState: gameState,
          });
        }
      }

      this._lastPlayerStatuses[p.name] = curStatus;
    }
  };

  // Find tracked player by name
  HandTracker.prototype._findPlayer = function(name) {
    if (!this.currentHand) return null;
    for (var i = 0; i < this.currentHand.players.length; i++) {
      if (this.currentHand.players[i].name === name) return this.currentHand.players[i];
    }
    return null;
  };

  // Finalize current hand
  HandTracker.prototype._finalizeHand = function(gameState) {
    if (!this.currentHand) return;

    this.currentHand.endTime = Date.now();
    this.currentHand.finalPot = gameState.pot;

    // Detect showdown - players who didn't fold and reached river
    var activePlayers = this.currentHand.players.filter(function(p) { return !p.isFolded; });
    if (activePlayers.length >= 2 && this.currentHand.communityCards.length === 5) {
      for (var i = 0; i < activePlayers.length; i++) {
        activePlayers[i].wentToShowdown = true;
      }
    }

    this.handHistory.push(this.currentHand);
    // Keep last 200 hands in memory
    if (this.handHistory.length > 200) this.handHistory.shift();

    console.log('[WPT] Hand #' + this.currentHand.handId + ' complete');
    this.emit('handComplete', this.currentHand);
  };

  // Get hero position for current hand
  HandTracker.prototype.getHeroPosition = function() {
    if (!this.currentHand) return null;
    var heroSeat = this.currentHand.heroSeatIndex;
    if (heroSeat < 0) return null;
    var hero = this._findPlayerBySeat(heroSeat);
    return hero ? hero.position : null;
  };

  HandTracker.prototype._findPlayerBySeat = function(seatIndex) {
    if (!this.currentHand) return null;
    for (var i = 0; i < this.currentHand.players.length; i++) {
      if (this.currentHand.players[i].seatIndex === seatIndex) return this.currentHand.players[i];
    }
    return null;
  };

  // Get count of active (non-folded) players
  HandTracker.prototype.getActivePlayers = function() {
    if (!this.currentHand) return 0;
    return this.currentHand.players.filter(function(p) { return !p.isFolded; }).length;
  };

  return HandTracker;

})();

window.HandTracker = HandTracker;
