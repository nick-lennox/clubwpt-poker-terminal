// ClubWPT Poker Terminal - Outs & Draw Analyzer
// Identifies draws, counts outs, calculates improvement odds
'use strict';

var OutsAnalyzer = (function() {

  function OutsAnalyzer() {}

  // Analyze hero's drawing potential given hole cards and community cards
  OutsAnalyzer.prototype.analyze = function(heroCards, communityCards) {
    if (!heroCards || heroCards.length !== 2 || !communityCards || communityCards.length < 3) {
      return null;
    }

    var allCards = heroCards.concat(communityCards);
    var result = {
      draws: [],       // Array of { name, outs, cards }
      totalOuts: 0,    // Deduplicated total
      oneCard: 0,      // % to hit on next card
      twoCard: 0,      // % to hit by river (if applicable)
      outCards: [],     // The actual out cards
    };

    var outSet = {}; // Track unique outs by card string

    // Check for flush draw
    var flushInfo = this._checkFlushDraw(heroCards, communityCards);
    if (flushInfo) {
      result.draws.push(flushInfo);
      for (var i = 0; i < flushInfo.outCards.length; i++) {
        outSet[flushInfo.outCards[i]] = true;
      }
    }

    // Check for straight draws
    var straightInfo = this._checkStraightDraw(heroCards, communityCards);
    if (straightInfo) {
      result.draws.push(straightInfo);
      for (var j = 0; j < straightInfo.outCards.length; j++) {
        outSet[straightInfo.outCards[j]] = true;
      }
    }

    // Check for overcards (preflop-style outs on flop)
    var overcardInfo = this._checkOvercards(heroCards, communityCards);
    if (overcardInfo) {
      result.draws.push(overcardInfo);
      for (var k = 0; k < overcardInfo.outCards.length; k++) {
        outSet[overcardInfo.outCards[k]] = true;
      }
    }

    // Check for pair improvement (trips, two pair)
    var pairInfo = this._checkPairImprovement(heroCards, communityCards);
    if (pairInfo) {
      result.draws.push(pairInfo);
      for (var m = 0; m < pairInfo.outCards.length; m++) {
        outSet[pairInfo.outCards[m]] = true;
      }
    }

    // Check for set draw (pocket pair to trips)
    var setInfo = this._checkSetDraw(heroCards, communityCards);
    if (setInfo) {
      result.draws.push(setInfo);
      for (var s = 0; s < setInfo.outCards.length; s++) {
        outSet[setInfo.outCards[s]] = true;
      }
    }

    // Calculate totals
    result.outCards = Object.keys(outSet);
    result.totalOuts = result.outCards.length;

    var cardsRemaining = 52 - allCards.length;
    result.oneCard = (result.totalOuts / cardsRemaining) * 100;
    if (communityCards.length === 3) {
      // Flop - two cards to come
      result.twoCard = (1 - ((cardsRemaining - result.totalOuts) / cardsRemaining) *
        ((cardsRemaining - 1 - result.totalOuts) / (cardsRemaining - 1))) * 100;
    } else if (communityCards.length === 4) {
      // Turn - one card to come
      result.twoCard = result.oneCard;
    } else {
      result.twoCard = 0;
    }

    return result;
  };

  // Check for flush draw
  OutsAnalyzer.prototype._checkFlushDraw = function(heroCards, communityCards) {
    var allCards = heroCards.concat(communityCards);
    var suits = { s: [], h: [], d: [], c: [] };

    for (var i = 0; i < allCards.length; i++) {
      suits[allCards[i][1]].push(allCards[i]);
    }

    for (var s in suits) {
      var suitCards = suits[s];
      if (suitCards.length === 4) {
        // 4 to a flush = flush draw (9 outs)
        var heroHasSuit = (heroCards[0][1] === s || heroCards[1][1] === s);
        if (!heroHasSuit) continue;

        var outs = [];
        var ranks = CardUtils.RANKS;
        var suitChars = CardUtils.SUITS;
        var existing = {};
        for (var j = 0; j < allCards.length; j++) existing[allCards[j]] = true;

        for (var r = 0; r < ranks.length; r++) {
          var card = ranks[r] + s;
          if (!existing[card]) outs.push(card);
        }

        return { name: 'Flush Draw', outs: outs.length, outCards: outs, suit: s };
      } else if (suitCards.length === 3) {
        // 3 to a flush - backdoor flush draw
        var heroCount = 0;
        if (heroCards[0][1] === s) heroCount++;
        if (heroCards[1][1] === s) heroCount++;
        if (heroCount >= 1 && communityCards.length === 3) {
          return { name: 'Backdoor Flush', outs: 1, outCards: [], suit: s }; // ~1 effective out
        }
      }
    }
    return null;
  };

  // Check for straight draws
  OutsAnalyzer.prototype._checkStraightDraw = function(heroCards, communityCards) {
    var allCards = heroCards.concat(communityCards);
    var rankSet = {};
    for (var i = 0; i < allCards.length; i++) {
      rankSet[CardUtils.rankIndex(allCards[i])] = true;
    }
    // Also handle Ace as low (index -1 for wheel)
    if (rankSet[12]) rankSet[-1] = true;

    var existing = {};
    for (var j = 0; j < allCards.length; j++) existing[allCards[j]] = true;

    // Check all possible 5-card straight windows
    var bestDraw = null;

    for (var start = -1; start <= 8; start++) {
      var count = 0;
      var missing = [];
      for (var ri = start; ri < start + 5; ri++) {
        if (rankSet[ri]) {
          count++;
        } else {
          missing.push(ri < 0 ? 12 : ri); // Map -1 back to Ace
        }
      }

      if (count === 4 && missing.length === 1) {
        // 4 to a straight
        var missRank = missing[0];
        var heroRanks = [CardUtils.rankIndex(heroCards[0]), CardUtils.rankIndex(heroCards[1])];

        // Check if it's open-ended or gutshot
        var isGutshot = (missing[0] !== start && missing[0] !== start + 4);
        var outs = [];
        var ranks = CardUtils.RANKS;
        var suits = CardUtils.SUITS;

        for (var si = 0; si < suits.length; si++) {
          var card = ranks[missRank] + suits[si];
          if (!existing[card]) outs.push(card);
        }

        // Only count if hero card contributes
        var heroInWindow = false;
        for (var hi = 0; hi < heroRanks.length; hi++) {
          var hr = heroRanks[hi];
          if (hr === 12 && start === -1) hr = -1; // Ace-low
          if (hr >= start && hr < start + 5) { heroInWindow = true; break; }
        }
        if (!heroInWindow) continue;

        var name = isGutshot ? 'Gutshot Straight' : 'Open-Ended Straight';
        var outsCount = isGutshot ? outs.length : outs.length;

        // Keep best draw (OESD > gutshot)
        if (!bestDraw || (!isGutshot && bestDraw.name.indexOf('Gutshot') >= 0) ||
            outs.length > bestDraw.outs) {
          bestDraw = { name: name, outs: outsCount, outCards: outs };
        }
      }
    }

    return bestDraw;
  };

  // Check for overcards
  OutsAnalyzer.prototype._checkOvercards = function(heroCards, communityCards) {
    if (communityCards.length < 3) return null;

    var boardHigh = 0;
    for (var i = 0; i < communityCards.length; i++) {
      boardHigh = Math.max(boardHigh, CardUtils.rankIndex(communityCards[i]));
    }

    var overcards = [];
    var existing = {};
    var allCards = heroCards.concat(communityCards);
    for (var j = 0; j < allCards.length; j++) existing[allCards[j]] = true;

    for (var k = 0; k < heroCards.length; k++) {
      if (CardUtils.rankIndex(heroCards[k]) > boardHigh) {
        overcards.push(heroCards[k]);
      }
    }

    if (overcards.length === 0) return null;

    // Each overcard has ~3 outs (pair up)
    var outs = [];
    var ranks = CardUtils.RANKS;
    var suits = CardUtils.SUITS;
    for (var oi = 0; oi < overcards.length; oi++) {
      var rank = overcards[oi][0];
      for (var si = 0; si < suits.length; si++) {
        var card = rank + suits[si];
        if (!existing[card]) outs.push(card);
      }
    }

    var name = overcards.length === 2 ? '2 Overcards' : '1 Overcard';
    return { name: name, outs: outs.length, outCards: outs };
  };

  // Check if a made pair can improve to two pair or trips
  OutsAnalyzer.prototype._checkPairImprovement = function(heroCards, communityCards) {
    if (communityCards.length < 3) return null;

    var r1 = CardUtils.rankIndex(heroCards[0]);
    var r2 = CardUtils.rankIndex(heroCards[1]);
    if (r1 === r2) return null; // Pocket pair handled separately

    var boardRanks = {};
    for (var i = 0; i < communityCards.length; i++) {
      boardRanks[CardUtils.rankIndex(communityCards[i])] = true;
    }

    // Check if one hero card pairs the board
    var paired = null;
    var unpaired = null;
    if (boardRanks[r1]) {
      paired = heroCards[0];
      unpaired = heroCards[1];
    } else if (boardRanks[r2]) {
      paired = heroCards[1];
      unpaired = heroCards[0];
    }

    if (!paired) return null;

    // Outs to improve: trips (2 outs for paired card) + two pair (3 outs for unpaired kicker)
    var outs = [];
    var existing = {};
    var allCards = heroCards.concat(communityCards);
    for (var j = 0; j < allCards.length; j++) existing[allCards[j]] = true;

    var suits = CardUtils.SUITS;
    // Two pair outs (pair up the kicker)
    for (var si = 0; si < suits.length; si++) {
      var card = unpaired[0] + suits[si];
      if (!existing[card]) outs.push(card);
    }
    // Trips outs
    for (var si2 = 0; si2 < suits.length; si2++) {
      var card2 = paired[0] + suits[si2];
      if (!existing[card2]) outs.push(card2);
    }

    return { name: 'Two Pair/Trips', outs: outs.length, outCards: outs };
  };

  // Check for set draw (pocket pair needing to hit trips)
  OutsAnalyzer.prototype._checkSetDraw = function(heroCards, communityCards) {
    var r1 = CardUtils.rankIndex(heroCards[0]);
    var r2 = CardUtils.rankIndex(heroCards[1]);
    if (r1 !== r2) return null;

    // Check if we already have a set
    var boardRanks = {};
    for (var i = 0; i < communityCards.length; i++) {
      boardRanks[CardUtils.rankIndex(communityCards[i])] = true;
    }
    if (boardRanks[r1]) return null; // Already have set

    // 2 outs to make a set
    var outs = [];
    var existing = {};
    var allCards = heroCards.concat(communityCards);
    for (var j = 0; j < allCards.length; j++) existing[allCards[j]] = true;

    var suits = CardUtils.SUITS;
    for (var si = 0; si < suits.length; si++) {
      var card = heroCards[0][0] + suits[si];
      if (!existing[card]) outs.push(card);
    }

    return { name: 'Set Draw', outs: outs.length, outCards: outs };
  };

  return OutsAnalyzer;

})();

window.OutsAnalyzer = OutsAnalyzer;
