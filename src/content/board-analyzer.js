// ClubWPT Poker Terminal - Board Texture & SPR & Bet Sizing Analyzer
'use strict';

var BoardAnalyzer = (function() {

  function BoardAnalyzer() {}

  // Full board analysis
  BoardAnalyzer.prototype.analyze = function(heroCards, communityCards, gameState) {
    var result = {
      texture: null,
      spr: null,
      betSizing: null,
      ev: null,
    };

    if (communityCards && communityCards.length >= 3) {
      result.texture = this.analyzeTexture(communityCards);
    }

    if (gameState) {
      result.spr = this.calculateSPR(gameState);
      result.betSizing = this.suggestBetSizing(gameState, result.spr, result.texture);
    }

    return result;
  };

  // ============ BOARD TEXTURE ============

  BoardAnalyzer.prototype.analyzeTexture = function(communityCards) {
    if (!communityCards || communityCards.length < 3) return null;

    var ranks = [];
    var suits = {};
    var rankCounts = {};

    for (var i = 0; i < communityCards.length; i++) {
      var r = CardUtils.rankIndex(communityCards[i]);
      var s = communityCards[i][1];
      ranks.push(r);
      suits[s] = (suits[s] || 0) + 1;
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }

    ranks.sort(function(a, b) { return a - b; });

    // Flush analysis
    var maxSuit = 0;
    var flushSuit = '';
    for (var suit in suits) {
      if (suits[suit] > maxSuit) {
        maxSuit = suits[suit];
        flushSuit = suit;
      }
    }
    var isMonotone = maxSuit >= 3;
    var isTwoTone = maxSuit === 2 && communityCards.length >= 3;
    var isRainbow = maxSuit === 1;

    // Connectedness analysis
    var gaps = [];
    for (var g = 1; g < ranks.length; g++) {
      gaps.push(ranks[g] - ranks[g - 1]);
    }
    var maxGap = Math.max.apply(null, gaps);
    var isConnected = maxGap <= 2 && gaps.every(function(g2) { return g2 <= 2; });
    var isDisconnected = maxGap >= 4;

    // Pairing
    var hasPair = false;
    var hasTrips = false;
    for (var rc in rankCounts) {
      if (rankCounts[rc] >= 3) hasTrips = true;
      else if (rankCounts[rc] >= 2) hasPair = true;
    }

    // High card presence
    var highCards = ranks.filter(function(r2) { return r2 >= 8; }); // T+
    var isHighBoard = highCards.length >= 2;

    // Straight possible
    var straightPossible = false;
    var uniqueRanks = Object.keys(rankCounts).map(Number);
    if (uniqueRanks[12]) uniqueRanks.push(-1); // Ace low
    for (var start = -1; start <= 8; start++) {
      var count = 0;
      for (var si = start; si < start + 5; si++) {
        if (rankCounts[si] || (si === -1 && rankCounts[12])) count++;
      }
      if (count >= 3) { straightPossible = true; break; }
    }

    // Overall wetness score (0 = bone dry, 10 = soaking wet)
    var wetness = 0;
    if (isMonotone) wetness += 4;
    else if (isTwoTone) wetness += 2;
    if (isConnected) wetness += 3;
    else if (!isDisconnected) wetness += 1;
    if (straightPossible) wetness += 1;
    if (hasPair) wetness -= 1; // Paired boards are slightly drier
    if (hasTrips) wetness -= 2;
    wetness = Math.max(0, Math.min(10, wetness));

    var textureLabel;
    if (wetness >= 7) textureLabel = 'VERY WET';
    else if (wetness >= 5) textureLabel = 'WET';
    else if (wetness >= 3) textureLabel = 'MEDIUM';
    else if (wetness >= 1) textureLabel = 'DRY';
    else textureLabel = 'BONE DRY';

    // Description parts
    var desc = [];
    if (isMonotone) desc.push('Monotone (' + flushSuit + ')');
    else if (isTwoTone) desc.push('Two-tone');
    else if (isRainbow) desc.push('Rainbow');

    if (isConnected) desc.push('Connected');
    else if (isDisconnected) desc.push('Disconnected');

    if (hasPair) desc.push('Paired');
    if (hasTrips) desc.push('Trips');
    if (isHighBoard) desc.push('High');
    if (straightPossible) desc.push('Str8-possible');

    return {
      label: textureLabel,
      wetness: wetness,
      description: desc.join(', '),
      isMonotone: isMonotone,
      isTwoTone: isTwoTone,
      isRainbow: isRainbow,
      isConnected: isConnected,
      hasPair: hasPair,
      straightPossible: straightPossible,
    };
  };

  // ============ SPR (Stack-to-Pot Ratio) ============

  BoardAnalyzer.prototype.calculateSPR = function(gameState) {
    if (!gameState || !gameState.pot || gameState.pot <= 0) return null;

    var heroStack = 0;
    for (var i = 0; i < gameState.players.length; i++) {
      var p = gameState.players[i];
      if (p.isOwner || p.seatIndex === gameState.heroSeatIndex) {
        heroStack = parseFloat(String(p.chips).replace(/[^0-9.]/g, '')) || 0;
        break;
      }
    }

    if (heroStack <= 0) return null;

    var spr = heroStack / gameState.pot;

    var label, advice;
    if (spr <= 2) {
      label = 'VERY LOW';
      advice = 'Commit with any top pair+. Push or fold.';
    } else if (spr <= 4) {
      label = 'LOW';
      advice = 'Commit with top pair good kicker+. One bet left.';
    } else if (spr <= 7) {
      label = 'MEDIUM';
      advice = 'Need two pair+ to stack off comfortably.';
    } else if (spr <= 13) {
      label = 'HIGH';
      advice = 'Need strong hands to commit. Sets, straights, flushes.';
    } else {
      label = 'VERY HIGH';
      advice = 'Deep stacked. Premium hands and implied odds matter most.';
    }

    return {
      value: spr,
      label: label,
      advice: advice,
      heroStack: heroStack,
    };
  };

  // ============ BET SIZING ============

  BoardAnalyzer.prototype.suggestBetSizing = function(gameState, spr, texture) {
    if (!gameState || !gameState.pot || gameState.pot <= 0) return null;

    var pot = gameState.pot;
    var suggestions = [];

    // Standard sizing
    var small = pot * 0.33;
    var medium = pot * 0.5;
    var large = pot * 0.75;
    var overbet = pot * 1.25;

    if (texture) {
      if (texture.wetness >= 5) {
        // Wet board: bet larger to deny draws proper odds
        suggestions.push({ label: 'Value/Protection', size: large, pct: '75%', reason: 'Wet board — deny draw odds' });
        suggestions.push({ label: 'Overbet Bluff', size: overbet, pct: '125%', reason: 'Max pressure on draws' });
      } else if (texture.wetness >= 3) {
        // Medium: standard sizing
        suggestions.push({ label: 'Value', size: medium, pct: '50%', reason: 'Standard on medium texture' });
        suggestions.push({ label: 'Thin Value', size: small, pct: '33%', reason: 'Keep worse hands calling' });
      } else {
        // Dry board: bet smaller
        suggestions.push({ label: 'Value', size: small, pct: '33%', reason: 'Dry board — small sizing extracts more' });
        suggestions.push({ label: 'Bluff', size: small, pct: '33%', reason: 'Cheap bluff on dry board' });
      }
    } else {
      // No texture info (preflop or unknown)
      suggestions.push({ label: 'Standard', size: medium, pct: '50%', reason: 'Standard pot-sized fraction' });
    }

    // SPR-based adjustment
    if (spr && spr.value <= 4) {
      suggestions.push({ label: 'All-In', size: spr.heroStack, pct: 'ALL', reason: 'Low SPR — commit or fold' });
    }

    return suggestions;
  };

  // ============ EV CALCULATOR ============

  BoardAnalyzer.prototype.calculateEV = function(equity, potSize, toCall, heroStack) {
    if (!equity || potSize <= 0) return null;

    var eq = parseFloat(equity.equity) / 100;

    var result = {};

    // FOLD EV: Always 0 — you lose nothing more, gain nothing
    result.foldEV = 0;

    // CALL EV: What you expect to gain/lose by calling
    // You risk `toCall` to win `pot + toCall`
    // EV(call) = equity * (pot) - (1 - equity) * toCall
    // (pot here is what's already in — you either win it or you don't, minus what you risk)
    if (toCall > 0) {
      result.callEV = (eq * potSize) - ((1 - eq) * toCall);
    } else {
      result.callEV = null; // Nothing to call
    }

    // CHECK EV: Free card, your expected share of current pot
    // Simplified: equity * pot - (1-equity) * 0 = equity * pot
    // But since you risk nothing, relative to folding:
    // EV(check) = eq * pot (you stand to win pot with eq% chance, risk nothing)
    // Actually this should be compared to fold which is 0
    // So check EV = equity * pot (always >= 0, always >= fold)
    if (toCall <= 0) {
      result.checkEV = eq * potSize;
    } else {
      result.checkEV = null; // Can't check when facing a bet
    }

    // RAISE EV: More complex — factor in fold equity and risk
    // Model: Raise to 75% pot. Opponents fold X% of the time.
    // Fold equity estimate based on equity (if we have strong hand, less fold equity needed)
    var raiseSize = Math.min(potSize * 0.75, heroStack);
    var foldEquity;
    if (eq > 0.65) {
      foldEquity = 0.30; // Strong hand — opponents fold less (we want calls)
    } else if (eq > 0.45) {
      foldEquity = 0.40; // Medium — moderate fold equity
    } else {
      foldEquity = 0.50; // Weak — betting as bluff, need more folds
    }

    // When opponent folds: we win the current pot
    // When opponent calls: we play for (pot + raiseSize + their call) with our equity
    var potAfterRaise = potSize + raiseSize * 2; // Simplified: our raise + their call
    var raiseEV = (foldEquity * potSize) +
      ((1 - foldEquity) * ((eq * potAfterRaise) - ((1 - eq) * raiseSize)));
    result.raiseEV = raiseEV;
    result.raiseSize = raiseSize;

    // Build sorted action list
    var evs = [];
    evs.push({ action: 'FOLD', ev: result.foldEV });
    if (result.callEV !== null) evs.push({ action: 'CALL', ev: result.callEV });
    if (result.checkEV !== null) evs.push({ action: 'CHECK', ev: result.checkEV });
    evs.push({ action: 'RAISE', ev: result.raiseEV });

    evs.sort(function(a, b) { return b.ev - a.ev; });
    result.best = evs[0];
    result.all = evs;

    return result;
  };

  return BoardAnalyzer;

})();

window.BoardAnalyzer = BoardAnalyzer;
