// ClubWPT Poker Terminal - Hand Evaluator
// Fast 5-card and 7-card poker hand evaluation
// Uses prime product + lookup table approach
'use strict';

var HandEvaluator = (function() {

  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  var SUITS = ['s','h','d','c'];
  var PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];

  // Hand rank categories (lower = better)
  var STRAIGHT_FLUSH = 1;
  var FOUR_OF_A_KIND = 2;
  var FULL_HOUSE = 3;
  var FLUSH = 4;
  var STRAIGHT = 5;
  var THREE_OF_A_KIND = 6;
  var TWO_PAIR = 7;
  var ONE_PAIR = 8;
  var HIGH_CARD = 9;

  // Encode card as 32-bit integer
  function encodeCard(rankIdx, suitIdx) {
    var prime = PRIMES[rankIdx];
    var rankBit = 1 << (16 + rankIdx);
    var suitBit = [0x8000, 0x4000, 0x2000, 0x1000][suitIdx];
    return rankBit | suitBit | (rankIdx << 8) | prime;
  }

  function cardFromString(str) {
    var ri = RANKS.indexOf(str[0]);
    var si = SUITS.indexOf(str[1]);
    if (ri < 0 || si < 0) return 0;
    return encodeCard(ri, si);
  }

  // --- Straight and Flush lookup tables ---

  // All unique 5-card rank patterns for straights
  var STRAIGHTS = {};
  // A2345 (wheel)
  STRAIGHTS[0x100F] = true; // A,2,3,4,5
  for (var i = 0; i <= 8; i++) {
    var bits = 0x1F << i; // 5 consecutive bits
    STRAIGHTS[bits] = true;
  }

  // Evaluate 5 cards
  function evaluate5(c0, c1, c2, c3, c4) {
    // Extract suit bits and rank bits
    var suitAnd = (c0 & 0xF000) & (c1 & 0xF000) & (c2 & 0xF000) & (c3 & 0xF000) & (c4 & 0xF000);
    var isFlush = suitAnd !== 0;

    var rankBits = ((c0 | c1 | c2 | c3 | c4) >> 16) & 0x1FFF;
    var isStraight = !!STRAIGHTS[rankBits];

    // Count bits set (number of unique ranks)
    var uniqueRanks = bitCount(rankBits);

    // Get individual ranks
    var r0 = (c0 >> 8) & 0xF;
    var r1 = (c1 >> 8) & 0xF;
    var r2 = (c2 >> 8) & 0xF;
    var r3 = (c3 >> 8) & 0xF;
    var r4 = (c4 >> 8) & 0xF;
    var ranks = [r0, r1, r2, r3, r4].sort(function(a, b) { return b - a; });

    // Count rank occurrences
    var counts = {};
    for (var idx = 0; idx < 5; idx++) {
      counts[ranks[idx]] = (counts[ranks[idx]] || 0) + 1;
    }
    var countValues = Object.values(counts).sort(function(a, b) { return b - a; });

    // Determine hand category and compute rank value
    // Lower rank value = better hand
    var category, value;

    if (isFlush && isStraight) {
      category = STRAIGHT_FLUSH;
      value = highCardOfStraight(rankBits);
    } else if (countValues[0] === 4) {
      category = FOUR_OF_A_KIND;
      value = quadsValue(counts);
    } else if (countValues[0] === 3 && countValues[1] === 2) {
      category = FULL_HOUSE;
      value = fullHouseValue(counts);
    } else if (isFlush) {
      category = FLUSH;
      value = kickerValue(ranks);
    } else if (isStraight) {
      category = STRAIGHT;
      value = highCardOfStraight(rankBits);
    } else if (countValues[0] === 3) {
      category = THREE_OF_A_KIND;
      value = tripsValue(counts);
    } else if (countValues[0] === 2 && countValues[1] === 2) {
      category = TWO_PAIR;
      value = twoPairValue(counts);
    } else if (countValues[0] === 2) {
      category = ONE_PAIR;
      value = onePairValue(counts);
    } else {
      category = HIGH_CARD;
      value = kickerValue(ranks);
    }

    // Combined score: category * 1000000 + value
    // Lower = better
    return category * 1000000 + value;
  }

  function bitCount(n) {
    var count = 0;
    while (n) { count += n & 1; n >>= 1; }
    return count;
  }

  function highCardOfStraight(rankBits) {
    // Wheel (A2345) special case
    if (rankBits === 0x100F) return 100000 - 3; // 5-high straight (worst straight)
    // Find highest bit
    for (var i = 12; i >= 0; i--) {
      if (rankBits & (1 << i)) return 100000 - i;
    }
    return 100000;
  }

  function kickerValue(sortedRanks) {
    // 5 kickers, each weighted by position
    return 100000 - (sortedRanks[0] * 28561 + sortedRanks[1] * 2197 + sortedRanks[2] * 169 + sortedRanks[3] * 13 + sortedRanks[4]);
  }

  function quadsValue(counts) {
    var quadRank = 0, kicker = 0;
    for (var r in counts) {
      if (counts[r] === 4) quadRank = parseInt(r);
      else kicker = parseInt(r);
    }
    return 100000 - (quadRank * 13 + kicker);
  }

  function fullHouseValue(counts) {
    var tripRank = 0, pairRank = 0;
    for (var r in counts) {
      if (counts[r] === 3) tripRank = parseInt(r);
      else pairRank = parseInt(r);
    }
    return 100000 - (tripRank * 13 + pairRank);
  }

  function tripsValue(counts) {
    var tripRank = 0;
    var kickers = [];
    for (var r in counts) {
      if (counts[r] === 3) tripRank = parseInt(r);
      else kickers.push(parseInt(r));
    }
    kickers.sort(function(a, b) { return b - a; });
    return 100000 - (tripRank * 169 + kickers[0] * 13 + kickers[1]);
  }

  function twoPairValue(counts) {
    var pairs = [];
    var kicker = 0;
    for (var r in counts) {
      if (counts[r] === 2) pairs.push(parseInt(r));
      else kicker = parseInt(r);
    }
    pairs.sort(function(a, b) { return b - a; });
    return 100000 - (pairs[0] * 169 + pairs[1] * 13 + kicker);
  }

  function onePairValue(counts) {
    var pairRank = 0;
    var kickers = [];
    for (var r in counts) {
      if (counts[r] === 2) pairRank = parseInt(r);
      else kickers.push(parseInt(r));
    }
    kickers.sort(function(a, b) { return b - a; });
    return 100000 - (pairRank * 2197 + kickers[0] * 169 + kickers[1] * 13 + kickers[2]);
  }

  // Evaluate best 5-card hand from 7 cards
  // Try all C(7,5) = 21 combinations
  var COMBOS_7_5 = [
    [0,1,2,3,4],[0,1,2,3,5],[0,1,2,3,6],[0,1,2,4,5],[0,1,2,4,6],
    [0,1,2,5,6],[0,1,3,4,5],[0,1,3,4,6],[0,1,3,5,6],[0,1,4,5,6],
    [0,2,3,4,5],[0,2,3,4,6],[0,2,3,5,6],[0,2,4,5,6],[0,3,4,5,6],
    [1,2,3,4,5],[1,2,3,4,6],[1,2,3,5,6],[1,2,4,5,6],[1,3,4,5,6],
    [2,3,4,5,6]
  ];

  function evaluate7(cards) {
    var best = Infinity;
    for (var i = 0; i < 21; i++) {
      var c = COMBOS_7_5[i];
      var score = evaluate5(cards[c[0]], cards[c[1]], cards[c[2]], cards[c[3]], cards[c[4]]);
      if (score < best) best = score;
    }
    return best;
  }

  // Get hand category name from score
  function categoryName(score) {
    var cat = Math.floor(score / 1000000);
    switch (cat) {
      case STRAIGHT_FLUSH: return score < 1100000 ? 'Royal Flush' : 'Straight Flush';
      case FOUR_OF_A_KIND: return 'Four of a Kind';
      case FULL_HOUSE: return 'Full House';
      case FLUSH: return 'Flush';
      case STRAIGHT: return 'Straight';
      case THREE_OF_A_KIND: return 'Three of a Kind';
      case TWO_PAIR: return 'Two Pair';
      case ONE_PAIR: return 'One Pair';
      case HIGH_CARD: return 'High Card';
      default: return 'Unknown';
    }
  }

  // Get category number (1-9, lower = better)
  function categoryNum(score) {
    return Math.floor(score / 1000000);
  }

  return {
    encodeCard: encodeCard,
    cardFromString: cardFromString,
    evaluate5: evaluate5,
    evaluate7: evaluate7,
    categoryName: categoryName,
    categoryNum: categoryNum,
    RANKS: RANKS,
    SUITS: SUITS,
  };

})();

// Export for Web Worker context
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.HandEvaluator = HandEvaluator;
}

// Export for page context (content script)
if (typeof window !== 'undefined') {
  window.HandEvaluator = HandEvaluator;
}
