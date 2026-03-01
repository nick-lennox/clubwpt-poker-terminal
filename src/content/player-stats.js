// ClubWPT Poker Terminal - Player Stats Engine
// Tracks VPIP, PFR, AF, 3-Bet%, WTSD%, C-Bet%, Fold-to-CBet%
'use strict';

var PlayerStats = (function() {

  function PlayerStats(storageManager) {
    this._storage = storageManager;
    this._records = {}; // name -> record
  }

  // Normalize player name for storage key
  PlayerStats.prototype._normalize = function(name) {
    return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  };

  // Create empty player record
  PlayerStats.prototype._createRecord = function(name) {
    return {
      name: name,
      lastSeen: Date.now(),
      totalHands: 0,
      // VPIP
      vpipCount: 0,
      vpipOpps: 0,
      // PFR
      pfrCount: 0,
      pfrOpps: 0,
      // AF (postflop)
      aggressiveActions: 0,
      passiveActions: 0,
      // 3-Bet
      threeBetCount: 0,
      threeBetOpps: 0,
      // WTSD
      wtsdCount: 0,
      sawFlopCount: 0,
      // C-Bet
      cBetCount: 0,
      cBetOpps: 0,
      // Fold to C-Bet
      foldToCBetCount: 0,
      foldToCBetOpps: 0,
    };
  };

  // Load or create a player record
  PlayerStats.prototype.ensurePlayer = function(name) {
    var key = this._normalize(name);
    if (this._records[key]) return this._records[key];

    var stored = this._storage.getPlayer(key);
    if (stored) {
      this._records[key] = stored;
      return stored;
    }

    var record = this._createRecord(name);
    this._records[key] = record;
    return record;
  };

  // Update stats after a completed hand
  PlayerStats.prototype.updateFromHand = function(handData) {
    if (!handData || !handData.players) return;

    // Find the preflop raiser (first raiser)
    var pfRaiserName = null;
    var preflopActions = [];
    for (var i = 0; i < handData.players.length; i++) {
      var pa = handData.players[i].actions.preflop || [];
      for (var j = 0; j < pa.length; j++) {
        preflopActions.push({ name: handData.players[i].name, action: pa[j].action });
        if (!pfRaiserName && (pa[j].action === 'raise' || pa[j].action === 'allin')) {
          pfRaiserName = handData.players[i].name;
        }
      }
    }

    for (var p = 0; p < handData.players.length; p++) {
      var player = handData.players[p];
      var record = this.ensurePlayer(player.name);

      record.totalHands++;
      record.lastSeen = Date.now();

      // VPIP
      record.vpipOpps++;
      if (player.vpip) record.vpipCount++;

      // PFR
      record.pfrOpps++;
      if (player.pfr) record.pfrCount++;

      // 3-Bet - only if there was an open raise before this player acted
      var playerPreflopIdx = -1;
      var firstRaiseIdx = -1;
      for (var k = 0; k < preflopActions.length; k++) {
        if (firstRaiseIdx < 0 && (preflopActions[k].action === 'raise' || preflopActions[k].action === 'allin')) {
          firstRaiseIdx = k;
        }
        if (playerPreflopIdx < 0 && preflopActions[k].name === player.name) {
          playerPreflopIdx = k;
        }
      }
      if (firstRaiseIdx >= 0 && playerPreflopIdx > firstRaiseIdx) {
        record.threeBetOpps++;
        if (player.threeBet) record.threeBetCount++;
      }

      // Postflop AF
      var streets = ['flop', 'turn', 'river'];
      for (var s = 0; s < streets.length; s++) {
        var actions = player.actions[streets[s]] || [];
        for (var a = 0; a < actions.length; a++) {
          if (actions[a].action === 'raise' || actions[a].action === 'allin') {
            record.aggressiveActions++;
          } else if (actions[a].action === 'call') {
            record.passiveActions++;
          }
        }
      }

      // WTSD
      if (player.sawFlop) {
        record.sawFlopCount++;
        if (player.wentToShowdown) record.wtsdCount++;
      }

      // C-Bet (player was PFR and saw flop)
      if (player.pfr && player.sawFlop) {
        record.cBetOpps++;
        var flopActions = player.actions.flop || [];
        var didCBet = flopActions.some(function(act) {
          return act.action === 'raise' || act.action === 'allin';
        });
        if (didCBet) record.cBetCount++;
      }

      // Fold to C-Bet
      if (player.sawFlop && !player.pfr && pfRaiserName && pfRaiserName !== player.name) {
        // Check if the PFR bet the flop
        var pfRaiserPlayer = handData.players.find(function(pp) { return pp.name === pfRaiserName; });
        if (pfRaiserPlayer) {
          var pfRaiserFlopBet = (pfRaiserPlayer.actions.flop || []).some(function(act) {
            return act.action === 'raise' || act.action === 'allin';
          });
          if (pfRaiserFlopBet) {
            record.foldToCBetOpps++;
            var didFoldToCBet = (player.actions.flop || []).some(function(act) {
              return act.action === 'fold';
            });
            if (didFoldToCBet) record.foldToCBetCount++;
          }
        }
      }

      // Persist
      this._storage.savePlayer(this._normalize(player.name), record);
    }
  };

  // Get formatted display stats for a player
  PlayerStats.prototype.getDisplayStats = function(name) {
    var record = this.ensurePlayer(name);
    if (!record || record.totalHands === 0) return null;

    return {
      name: record.name,
      hands: record.totalHands,
      vpip: this._pct(record.vpipCount, record.vpipOpps),
      pfr: this._pct(record.pfrCount, record.pfrOpps),
      af: record.passiveActions > 0
        ? (record.aggressiveActions / record.passiveActions).toFixed(1)
        : record.aggressiveActions > 0 ? 'Inf' : '-',
      threeBet: this._pct(record.threeBetCount, record.threeBetOpps),
      wtsd: this._pct(record.wtsdCount, record.sawFlopCount),
      cBet: this._pct(record.cBetCount, record.cBetOpps),
      foldToCBet: this._pct(record.foldToCBetCount, record.foldToCBetOpps),
    };
  };

  // Get player type classification based on stats
  PlayerStats.prototype.getPlayerType = function(name) {
    var stats = this.getDisplayStats(name);
    if (!stats || stats.hands < WPT.MIN_HANDS_FOR_DISPLAY) return 'Unknown';

    var vpip = parseFloat(stats.vpip);
    var pfr = parseFloat(stats.pfr);
    if (isNaN(vpip) || isNaN(pfr)) return 'Unknown';

    if (vpip < 18 && pfr < 14) return 'Nit';
    if (vpip < 25 && pfr > 15) return 'TAG';
    if (vpip > 30 && pfr > 20) return 'LAG';
    if (vpip > 30 && pfr < 15) return 'Fish';
    return 'Reg';
  };

  PlayerStats.prototype._pct = function(num, den) {
    if (den === 0) return '-';
    return ((num / den) * 100).toFixed(1);
  };

  return PlayerStats;

})();

window.PlayerStats = PlayerStats;
