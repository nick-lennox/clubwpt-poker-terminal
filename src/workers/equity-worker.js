// ClubWPT Poker Terminal - Equity Calculator Web Worker
// Monte Carlo simulation for hand equity
'use strict';

importScripts('hand-evaluator.js');

// Build full 52-card deck
var FULL_DECK = [];
for (var r = 0; r < 13; r++) {
  for (var s = 0; s < 4; s++) {
    FULL_DECK.push(HandEvaluator.encodeCard(r, s));
  }
}

// Card string to encoded int map
var CARD_MAP = {};
for (var ri = 0; ri < 13; ri++) {
  for (var si = 0; si < 4; si++) {
    var str = HandEvaluator.RANKS[ri] + HandEvaluator.SUITS[si];
    CARD_MAP[str] = HandEvaluator.encodeCard(ri, si);
  }
}

// Fisher-Yates shuffle (in-place, partial)
function shufflePartial(arr, count) {
  for (var i = arr.length - 1; i > 0 && i >= arr.length - count; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ═══ VPIP-WEIGHTED OPPONENT RANGE TABLE ═══
// 169 starting hands ranked by all-in equity vs a random hand (best to worst).
// Format: [highRank, lowRank, type] where type: 0=offsuit, 1=suited, 2=pair
// Ranks: 0=2, 1=3, 2=4, 3=5, 4=6, 5=7, 6=8, 7=9, 8=T, 9=J, 10=Q, 11=K, 12=A
var HAND_ORDER = [
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

// Build RANGE_PCT: 13x13 cumulative percentile table.
// RANGE_PCT[r][r] = pair, RANGE_PCT[high][low] = offsuit, RANGE_PCT[low][high] = suited
// Value = cumulative % of hands at or above this hand in the ranking.
var RANGE_PCT = [];
(function() {
  var i, r, c;
  for (r = 0; r < 13; r++) {
    RANGE_PCT[r] = [];
    for (c = 0; c < 13; c++) RANGE_PCT[r][c] = 100;
  }
  var cumCombos = 0;
  var TOTAL_COMBOS = 1326;
  for (i = 0; i < HAND_ORDER.length; i++) {
    var h = HAND_ORDER[i];
    var hi = h[0], lo = h[1], type = h[2];
    var combos = type === 2 ? 6 : type === 1 ? 4 : 12;
    cumCombos += combos;
    var pct = (cumCombos / TOTAL_COMBOS) * 100;
    if (type === 2) RANGE_PCT[hi][lo] = pct;       // pair: [r][r]
    else if (type === 1) RANGE_PCT[lo][hi] = pct;   // suited: [low][high]
    else RANGE_PCT[hi][lo] = pct;                    // offsuit: [high][low]
  }
})();

// O(1) lookup: given two encoded cards, return percentile (0-100)
function getHandPercentile(card1, card2) {
  var r1 = (card1 >> 8) & 0xF;
  var r2 = (card2 >> 8) & 0xF;
  var s1 = card1 & 0xF000;
  var s2 = card2 & 0xF000;
  if (r1 === r2) return RANGE_PCT[r1][r2]; // pair
  var hi = r1 > r2 ? r1 : r2;
  var lo = r1 > r2 ? r2 : r1;
  if (s1 === s2) return RANGE_PCT[lo][hi]; // suited
  return RANGE_PCT[hi][lo];                // offsuit
}

// Handle messages from main thread
self.onmessage = function(event) {
  var data = event.data;

  switch (data.type) {
    case 'CALC_EQUITY':
      var result = calculateEquity(data.payload);
      self.postMessage({ type: 'EQUITY_RESULT', result: result, requestId: data.requestId });
      break;
  }
};

function calculateEquity(params) {
  var heroCards = params.heroCards;       // ['Ah', 'Kd']
  var communityCards = params.communityCards || [];  // ['Ts', '7h', '2c']
  var numOpponents = params.numOpponents || 1;
  var iterations = params.iterations || 20000;
  var opponentVpips = params.opponentVpips || [];

  // Encode known cards
  var heroEncoded = [];
  for (var i = 0; i < heroCards.length; i++) {
    heroEncoded.push(CARD_MAP[heroCards[i]]);
  }

  var boardEncoded = [];
  for (var j = 0; j < communityCards.length; j++) {
    boardEncoded.push(CARD_MAP[communityCards[j]]);
  }

  // Build set of dead cards (known cards that can't appear again)
  var deadSet = {};
  for (var d = 0; d < heroEncoded.length; d++) {
    deadSet[heroEncoded[d]] = true;
  }
  for (var b = 0; b < boardEncoded.length; b++) {
    deadSet[boardEncoded[b]] = true;
  }

  // Available deck (remove dead cards)
  var available = [];
  for (var k = 0; k < FULL_DECK.length; k++) {
    if (!deadSet[FULL_DECK[k]]) {
      available.push(FULL_DECK[k]);
    }
  }

  // Check if any opponent has VPIP filtering active
  var hasVpipFilter = false;
  for (var vi = 0; vi < numOpponents; vi++) {
    var v = vi < opponentVpips.length ? opponentVpips[vi] : 0;
    if (v > 0 && v < 100) { hasVpipFilter = true; break; }
  }

  var wins = 0;
  var ties = 0;
  var losses = 0;

  var cardsNeeded = 5 - boardEncoded.length;  // Community cards to deal
  var oppCardsNeeded = numOpponents * 2;        // Opponent hole cards
  var totalCardsNeeded = cardsNeeded + oppCardsNeeded;

  for (var iter = 0; iter < iterations; iter++) {
    // Full shuffle when VPIP filtering is active (need to scan ahead),
    // otherwise partial shuffle for performance
    shufflePartial(available, hasVpipFilter ? available.length : totalCardsNeeded);
    var pickIdx = available.length - 1;

    // Deal remaining community cards
    var fullBoard = boardEncoded.slice();
    for (var c = 0; c < cardsNeeded; c++) {
      fullBoard.push(available[pickIdx--]);
    }

    // Evaluate hero hand (2 hole + 5 board = 7 cards)
    var heroAll = [heroEncoded[0], heroEncoded[1], fullBoard[0], fullBoard[1], fullBoard[2], fullBoard[3], fullBoard[4]];
    var heroRank = HandEvaluator.evaluate7(heroAll);

    // Evaluate each opponent
    var heroBest = true;
    var tiedWithHero = false;

    for (var opp = 0; opp < numOpponents; opp++) {
      var oppCard1 = available[pickIdx];
      var oppCard2 = available[pickIdx - 1];

      // VPIP range filtering: reject hands outside opponent's range
      var vpipLimit = opp < opponentVpips.length ? opponentVpips[opp] : 0;
      if (vpipLimit > 0 && vpipLimit < 100) {
        if (getHandPercentile(oppCard1, oppCard2) > vpipLimit) {
          // Scan remaining undealt cards for an in-range pair
          var found = false;
          for (var scan = pickIdx - 2; scan >= 1; scan -= 2) {
            if (getHandPercentile(available[scan], available[scan - 1]) <= vpipLimit) {
              // Swap the found pair into position
              var tmp1 = available[pickIdx];
              available[pickIdx] = available[scan];
              available[scan] = tmp1;
              var tmp2 = available[pickIdx - 1];
              available[pickIdx - 1] = available[scan - 1];
              available[scan - 1] = tmp2;
              oppCard1 = available[pickIdx];
              oppCard2 = available[pickIdx - 1];
              found = true;
              break;
            }
          }
          // If no in-range pair found, accept original (graceful degradation)
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

    if (!heroBest) {
      losses++;
    } else if (tiedWithHero) {
      ties++;
    } else {
      wins++;
    }
  }

  var equity = ((wins + ties * 0.5) / iterations * 100);

  return {
    equity: equity.toFixed(1),
    winPct: (wins / iterations * 100).toFixed(1),
    tiePct: (ties / iterations * 100).toFixed(1),
    lossPct: (losses / iterations * 100).toFixed(1),
    iterations: iterations,
    heroCards: heroCards,
    communityCards: communityCards,
    numOpponents: numOpponents,
  };
}
