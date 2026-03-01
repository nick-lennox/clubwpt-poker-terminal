// ClubWPT Poker Terminal - Action Advisor
// Pot odds, equity comparison, and recommendations
'use strict';

var ActionAdvisor = (function() {

  function ActionAdvisor() {}

  // Calculate pot odds
  ActionAdvisor.prototype.calculatePotOdds = function(potSize, amountToCall) {
    if (amountToCall <= 0) return Infinity;
    return potSize / amountToCall;
  };

  // Required equity to call profitably
  ActionAdvisor.prototype.requiredEquity = function(potSize, amountToCall) {
    if (amountToCall <= 0) return 0;
    return (amountToCall / (potSize + amountToCall)) * 100;
  };

  // Build pot odds object from game state
  ActionAdvisor.prototype.getPotOdds = function(gameState, equity) {
    var pot = gameState.pot || 0;
    var toCall = 0;

    // Try to get call amount from action buttons
    if (gameState.actionState && gameState.actionState.active) {
      var callStr = gameState.actionState.callAmount || '';
      toCall = parseFloat(callStr.replace(/[^0-9.]/g, '')) || 0;
    }
    // Fallback: use toCall computed from player bet differences
    if (toCall <= 0 && gameState.toCallFallback > 0) {
      toCall = gameState.toCallFallback;
    }

    // Find hero stack
    var heroStack = 0;
    if (gameState.players) {
      for (var i = 0; i < gameState.players.length; i++) {
        var p = gameState.players[i];
        if (p.isOwner || p.seatIndex === gameState.heroSeatIndex) {
          heroStack = parseFloat(String(p.chips).replace(/[^0-9.]/g, '')) || 0;
          break;
        }
      }
    }

    var ratio = this.calculatePotOdds(pot, toCall);
    var reqEq = this.requiredEquity(pot, toCall);

    return {
      pot: pot,
      toCall: toCall,
      ratio: ratio,
      requiredEquity: reqEq,
      equity: equity ? equity.equity : null,
      heroStack: heroStack,
    };
  };

  // Classify preflop hand strength
  ActionAdvisor.prototype.classifyPreflop = function(card1, card2) {
    if (!card1 || !card2) return null;

    var r1 = CardUtils.rankIndex(card1);
    var r2 = CardUtils.rankIndex(card2);
    var suited = CardUtils.isSuited(card1, card2);
    var pair = CardUtils.isPair(card1, card2);
    var highRank = Math.max(r1, r2);
    var lowRank = Math.min(r1, r2);
    var g = CardUtils.gap(card1, card2);

    // Premium: AA, KK, QQ, AKs, AKo
    if (pair && highRank >= 10) return WPT.HAND_TIERS.PREMIUM; // QQ+
    if (highRank === 12 && lowRank === 11) return WPT.HAND_TIERS.PREMIUM; // AK

    // Strong: JJ, TT, AQs, AJs, KQs
    if (pair && highRank >= 8) return WPT.HAND_TIERS.STRONG; // TT, JJ
    if (highRank === 12 && lowRank >= 9 && suited) return WPT.HAND_TIERS.STRONG; // ATs+s
    if (highRank === 12 && lowRank === 10) return WPT.HAND_TIERS.STRONG; // AQ
    if (highRank === 11 && lowRank === 10 && suited) return WPT.HAND_TIERS.STRONG; // KQs

    // Playable: medium pairs, suited connectors, suited aces
    if (pair && highRank >= 4) return WPT.HAND_TIERS.PLAYABLE; // 66-99
    if (suited && g <= 1 && lowRank >= 5) return WPT.HAND_TIERS.PLAYABLE; // suited connectors 7+
    if (highRank === 12 && suited) return WPT.HAND_TIERS.PLAYABLE; // Axs
    if (highRank === 11 && lowRank >= 8 && suited) return WPT.HAND_TIERS.PLAYABLE; // KTs+s
    if (highRank === 10 && lowRank >= 8 && suited) return WPT.HAND_TIERS.PLAYABLE; // QTs+s

    // Marginal: small pairs, suited gappers, broadways
    if (pair) return WPT.HAND_TIERS.MARGINAL; // 22-55
    if (suited && g <= 2 && lowRank >= 3) return WPT.HAND_TIERS.MARGINAL;
    if (highRank >= 9 && lowRank >= 8) return WPT.HAND_TIERS.MARGINAL; // broadway combos
    if (highRank === 12 && lowRank >= 6) return WPT.HAND_TIERS.MARGINAL; // A8o+

    // Weak: everything else
    return WPT.HAND_TIERS.WEAK;
  };

  // Classify preflop hand using GTO position-specific ranges
  // handData: {heroPosition, raisesCount, toCall, tableSize, bigBlind, heroActed, openerPosition, activePlayers, heroStackBB, limperCount}
  ActionAdvisor.prototype.classifyPreflopGTO = function(card1, card2, handData) {
    if (!card1 || !card2 || typeof GTORanges === 'undefined') return null;

    var gtoResult = GTORanges.getAction(card1, card2, handData);
    var tier = GTORanges.toHandTier(gtoResult);

    if (!tier || !gtoResult.action) return null;

    return {
      tier: tier.tier,
      label: tier.label,
      color: tier.color,
      gtoAction: gtoResult.action,
      gtoScenario: gtoResult.scenario,
      handNotation: gtoResult.handNotation,
      position: gtoResult.position,
      sizing: gtoResult.sizing,
      inRange: gtoResult.inRange
    };
  };

  // Classify postflop hand using evaluator
  ActionAdvisor.prototype.classifyPostflop = function(heroCards, communityCards) {
    if (!heroCards || heroCards.length !== 2 || !communityCards || communityCards.length < 3) return null;

    var allCards = heroCards.concat(communityCards);
    var encoded = allCards.map(function(c) { return CardUtils.encode(c); });

    // Pad to 7 if needed (for turn/river)
    while (encoded.length < 7) {
      // Can't evaluate less than 5 cards properly through evaluate7
      // Use evaluate5 for flop (5 cards total)
      break;
    }

    var score, categoryName;
    if (encoded.length === 5) {
      score = HandEvaluator.evaluate5(encoded[0], encoded[1], encoded[2], encoded[3], encoded[4]);
      categoryName = HandEvaluator.categoryName(score);
    } else if (encoded.length >= 6) {
      // For 6 cards, evaluate all C(6,5)=6 combos
      if (encoded.length === 6) {
        var best = Infinity;
        for (var i = 0; i < 6; i++) {
          var five = encoded.filter(function(_, idx) { return idx !== i; });
          var s = HandEvaluator.evaluate5(five[0], five[1], five[2], five[3], five[4]);
          if (s < best) best = s;
        }
        score = best;
        categoryName = HandEvaluator.categoryName(score);
      } else {
        score = HandEvaluator.evaluate7(encoded);
        categoryName = HandEvaluator.categoryName(score);
      }
    }

    return {
      score: score,
      category: categoryName,
      categoryNum: HandEvaluator.categoryNum(score),
    };
  };

  // Generate action recommendation
  // handTier: preflop tier object {tier: 1-5, label: 'PREMIUM'|...|'WEAK'} or null
  ActionAdvisor.prototype.recommend = function(equity, potOdds, handTier, phase, position, numPlayers, vulnerability) {
    if (!equity || equity.equity === '-') {
      return { action: '--', reasoning: 'No equity data', confidence: 'NONE' };
    }

    var eq = parseFloat(equity.equity);
    var reqEq = potOdds.requiredEquity;
    var toCall = potOdds.toCall;
    var heroStack = potOdds.heroStack || 0;

    // Stack commitment: what % of stack this call costs
    var commitPct = (heroStack > 0 && toCall > 0) ? (toCall / heroStack) * 100 : 0;

    var rec = { action: '', reasoning: '', confidence: '' };

    // ═══ GTO-DRIVEN PREFLOP ═══
    if (phase === 'preflop' && handTier && handTier.gtoAction) {
      var gtoAction = handTier.gtoAction;

      // Map GTO sub-actions to display actions
      var isRaiseType = gtoAction === 'RAISE' || gtoAction === '3BET' || gtoAction === '4BET';
      var isAllIn = gtoAction === 'ALL-IN' || gtoAction === '5BET';

      // Short-stack override: SPR ≤ 2 with decent equity → ALL-IN
      var sprGto = heroStack > 0 ? heroStack / potOdds.pot : 99;
      if (sprGto <= 2 && eq > 40) {
        rec.action = 'ALL-IN';
        rec.confidence = 'HIGH';
      } else if (isAllIn) {
        rec.action = 'ALL-IN';
        rec.confidence = 'HIGH';
      } else if (toCall <= 0) {
        // No bet facing
        if (isRaiseType) {
          rec.action = 'BET / RAISE';
          rec.confidence = 'HIGH';
        } else if (gtoAction === 'CHECK') {
          rec.action = 'CHECK';
          rec.confidence = 'MEDIUM';
        } else {
          rec.action = 'CHECK';
          rec.confidence = 'MEDIUM';
        }
      } else {
        // Facing a bet
        if (isRaiseType) {
          rec.action = 'RAISE';
          rec.confidence = 'HIGH';
        } else if (gtoAction === 'CALL') {
          rec.action = 'CALL';
          rec.confidence = 'HIGH';
        } else {
          // GTO says FOLD — safety net: if equity exceeds reqEq by 10+, downgrade to medium CALL
          if (eq - reqEq >= 10) {
            rec.action = 'CALL';
            rec.confidence = 'MEDIUM';
          } else {
            rec.action = 'FOLD';
            rec.confidence = 'HIGH';
          }
        }
      }

      rec.reasoning = this._buildGTORationale(rec.action, handTier, position);
      return rec;
    }

    // ═══ LEGACY EQUITY-BASED LOGIC (postflop or when GTO unavailable) ═══
    var gapAdjust = 0;
    if (phase === 'preflop' && handTier && handTier.tier) {
      if (handTier.tier === 5)      gapAdjust = -15;  // WEAK: almost always fold
      else if (handTier.tier === 4) gapAdjust = -5;   // MARGINAL: need clear edge
      else if (handTier.tier === 2) gapAdjust = 5;    // STRONG: can play thinner
      else if (handTier.tier === 1) gapAdjust = 10;   // PREMIUM: play aggressively
    }

    // Stack pressure: penalize when call is a large portion of stack
    if (commitPct > 50) {
      gapAdjust -= 10;
    } else if (commitPct > 25) {
      gapAdjust -= 5;
    }

    // Vulnerability adjustment: penalize when board threatens hero's hand
    if (phase !== 'preflop' && vulnerability && vulnerability.recommendAdjust) {
      gapAdjust += vulnerability.recommendAdjust;
    }

    if (toCall <= 0) {
      var adjEq = eq + gapAdjust;
      if (adjEq > 70) {
        rec.action = 'BET / RAISE';
        rec.confidence = 'HIGH';
      } else if (adjEq > 50) {
        rec.action = 'BET SMALL';
        rec.confidence = 'MEDIUM';
      } else if (adjEq > 35) {
        rec.action = 'CHECK';
        rec.confidence = 'MEDIUM';
      } else {
        rec.action = 'CHECK';
        rec.confidence = 'HIGH';
      }
    } else {
      var gap = eq - reqEq + gapAdjust;
      var spr = heroStack > 0 ? heroStack / potOdds.pot : 99;
      if (spr <= 2 && eq > 40) {
        rec.action = 'ALL-IN';
        rec.confidence = 'HIGH';
      } else if (gap > 25) {
        rec.action = 'RAISE';
        rec.confidence = 'HIGH';
      } else if (gap > 10) {
        rec.action = 'CALL';
        rec.confidence = 'HIGH';
      } else if (gap > 0) {
        rec.action = 'CALL';
        rec.confidence = 'MEDIUM';
      } else {
        rec.action = 'FOLD';
        rec.confidence = gap > -10 ? 'MEDIUM' : 'HIGH';
      }
    }

    // Downgrade confidence when vulnerability is HIGH/CRITICAL and action is aggressive
    if (vulnerability && (vulnerability.level === 'HIGH' || vulnerability.level === 'CRITICAL')) {
      if (rec.confidence === 'HIGH') rec.confidence = 'MEDIUM';
    }

    // Build human-readable rationale
    rec.reasoning = this._buildRationale(rec.action, eq, reqEq, toCall, phase, handTier, position, numPlayers, commitPct);

    // Append top threat to rationale
    if (vulnerability && vulnerability.threats.length > 0) {
      rec.reasoning += ' -- Watch: ' + vulnerability.threats[0].description;
    }

    return rec;
  };

  // Build a plain-English one-liner explaining the recommendation
  ActionAdvisor.prototype._buildRationale = function(action, eq, reqEq, toCall, phase, handTier, position, numPlayers, commitPct) {
    var tierLabel = handTier ? handTier.label.toLowerCase() : '';
    var isEarly = position === 'UTG' || position === 'UTG+1' || position === 'UTG+2';
    var isLate = position === 'BTN' || position === 'CO';
    var isMultiway = numPlayers && numPlayers > 4;
    var posDesc = isEarly ? 'early position' : isLate ? 'late position' : '';

    // Preflop reasoning
    if (phase === 'preflop') {
      var tierAdj = tierLabel;
      if (tierAdj === 'premium') tierAdj = 'premium';
      else if (tierAdj === 'strong') tierAdj = 'strong';
      else if (tierAdj === 'playable') tierAdj = 'playable';
      else if (tierAdj === 'marginal') tierAdj = 'marginal';
      else if (tierAdj === 'weak') tierAdj = 'weak';

      if (action === 'FOLD') {
        if (tierAdj === 'weak' && isEarly) return 'Too weak to play from ' + posDesc;
        if (tierAdj === 'weak' && isMultiway) return 'Weak hand in a multiway pot, not worth the risk';
        if (tierAdj === 'weak') return 'Weak hand, save chips for a better spot';
        if (tierAdj === 'marginal' && isEarly) return 'Marginal hand out of position, fold and wait';
        if (commitPct > 25) return 'Not strong enough to risk ' + commitPct.toFixed(0) + '% of your stack';
        return 'Not enough equity to call (' + eq.toFixed(0) + '% vs ' + reqEq.toFixed(0) + '% needed)';
      }
      if (action === 'ALL-IN') return 'Short stacked with a ' + tierAdj + ' hand, push or fold';
      if (action === 'RAISE') {
        if (tierAdj === 'premium') return 'Premium hand, raise for value';
        if (isLate) return 'Good hand in ' + posDesc + ', raise to take initiative';
        return 'Strong hand, raise for value and protection';
      }
      if (action === 'CALL') {
        if (isLate) return 'Playable hand in position, call and see a flop';
        if (isMultiway) return 'Decent hand getting good odds in a multiway pot';
        return 'Getting the right price to call (' + eq.toFixed(0) + '% vs ' + reqEq.toFixed(0) + '% needed)';
      }
      if (action === 'BET / RAISE') return 'Strong hand, open-raise for value';
      if (action === 'BET SMALL') return 'Playable hand, put in a standard raise';
      if (action === 'CHECK') {
        if (tierAdj === 'weak') return 'Weak hand, check and fold to any aggression';
        return 'Check from the big blind, see a free flop';
      }
    }

    // Postflop reasoning
    if (action === 'FOLD') {
      if (isMultiway) return 'Low equity against multiple opponents, let it go';
      if (commitPct > 25) return 'Too much to risk with only ' + eq.toFixed(0) + '% equity';
      return 'Not enough equity to continue (' + eq.toFixed(0) + '% vs ' + reqEq.toFixed(0) + '% needed)';
    }
    if (action === 'ALL-IN') return 'Short stacked, commit now with ' + eq.toFixed(0) + '% equity';
    if (action === 'RAISE') {
      if (eq > 75) return 'Very strong hand, raise for maximum value';
      return 'Strong equity edge, raise for value and protection';
    }
    if (action === 'CALL') {
      if (eq - reqEq < 5) return 'Borderline call, barely getting the right odds';
      if (isLate) return 'Good odds to call in position (' + eq.toFixed(0) + '% vs ' + reqEq.toFixed(0) + '% needed)';
      return 'Getting the right price to call (' + eq.toFixed(0) + '% vs ' + reqEq.toFixed(0) + '% needed)';
    }
    if (action === 'BET / RAISE') {
      if (eq > 75) return 'Strong hand, bet for value';
      if (isMultiway) return 'Good equity, bet to thin the field';
      return 'Solid equity edge, bet for value and protection';
    }
    if (action === 'BET SMALL') return 'Moderate edge, bet small to extract thin value';
    if (action === 'CHECK') {
      if (eq < 30) return 'Low equity, check and fold to aggression';
      if (isMultiway) return 'Tricky spot multiway, check and re-evaluate';
      return 'Medium equity, check and re-evaluate on the next card';
    }

    return '';
  };

  // Build GTO-specific preflop rationale using hand notation
  ActionAdvisor.prototype._buildGTORationale = function(action, handTier, position) {
    var hand = handTier.handNotation || '??';
    var scenario = handTier.gtoScenario;
    var pos = handTier.position || position || '?';
    var sizing = handTier.sizing;
    var sizingStr = sizing ? ' — ' + sizing.type + ' ' + sizing.amount : '';

    if (action === 'ALL-IN') {
      return 'Short stacked — shove or fold with ' + hand;
    }

    if (scenario === 'RFI' || scenario === 'LIMPED') {
      if (action === 'BET / RAISE' || action === 'RAISE') {
        var extra = scenario === 'LIMPED' ? ' over limpers' : '';
        return hand + ' is in the ' + pos + ' opening range — raise' + (sizing ? ' to ' + sizing.amount : '') + extra;
      }
      if (action === 'CHECK') {
        return hand + ': check from the big blind';
      }
      if (action === 'CALL') {
        return hand + ' from ' + pos + ': outside GTO range but equity supports a call';
      }
      return hand + ' is not in the ' + pos + ' opening range — fold';
    }

    if (scenario === 'FACING_OPEN') {
      if (action === 'RAISE') {
        return hand + ': 3-bet from ' + pos + (sizing ? ' (' + sizing.amount + ')' : '');
      }
      if (action === 'CALL') {
        var ipNote = (pos === 'BTN' || pos === 'CO') ? ', see a flop in position' : ', see a flop';
        return hand + ': call the open from ' + pos + ipNote;
      }
      return hand + ' is not in the ' + pos + ' calling or 3-bet range — fold';
    }

    if (scenario === 'FACING_3BET') {
      if (action === 'RAISE') {
        return hand + ': 4-bet for value' + (sizing ? ' (' + sizing.amount + ')' : '');
      }
      if (action === 'CALL') {
        return hand + ': call the 3-bet from ' + pos;
      }
      return 'Fold to 3-bet — ' + hand + ' is not strong enough to continue';
    }

    if (scenario === 'FACING_4BET') {
      if (action === 'ALL-IN') {
        return hand + ': 5-bet all-in for value';
      }
      if (action === 'CALL') {
        return hand + ': call the 4-bet';
      }
      return 'Fold to 4-bet — ' + hand + ' is not strong enough';
    }

    // Fallback
    if (action === 'FOLD') return hand + ' is outside the GTO range — fold';
    if (action === 'CALL') return hand + ': borderline call, equity supports continuing';
    return hand + ': play aggressively from ' + pos;
  };

  return ActionAdvisor;

})();

window.ActionAdvisor = ActionAdvisor;
