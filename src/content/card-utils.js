// ClubWPT Poker Terminal - Card Utilities
'use strict';

var CardUtils = (function() {

  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  var SUITS = ['s', 'h', 'd', 'c'];
  var PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];

  // Convert Cocos eCardNum/eCardSuit to standard notation (e.g. "Ah", "Ts")
  function fromCocos(eCardNum, eCardSuit) {
    var rank = WPT.CARD_NUM_MAP[eCardNum];
    var suit = WPT.CARD_SUIT_MAP[eCardSuit];
    if (!rank || !suit) return null;
    return rank + suit;
  }

  // Get rank index (0=2, 1=3, ..., 12=A) from standard notation
  function rankIndex(card) {
    return RANKS.indexOf(card[0]);
  }

  // Get suit char from standard notation
  function suit(card) {
    return card[1];
  }

  // Get suit index (0=s, 1=h, 2=d, 3=c)
  function suitIndex(card) {
    return SUITS.indexOf(card[1]);
  }

  // Encode a card as a 32-bit integer for fast hand evaluation
  // Format: |xxxbbbbb|bbbbbbbb|cdhsrrrr|xxpppppp|
  // p = prime of rank, r = rank (0-12), cdhs = suit bits, b = rank bit
  function encode(card) {
    var ri = rankIndex(card);
    var si = suitIndex(card);
    var prime = PRIMES[ri];
    var rankBit = 1 << (16 + ri);
    var suitBit = [0x8000, 0x4000, 0x2000, 0x1000][si];
    return rankBit | suitBit | (ri << 8) | prime;
  }

  // Encode from string notation
  function encodeString(str) {
    if (!str || str.length !== 2) return 0;
    return encode(str);
  }

  // Build full 52-card deck as encoded integers
  function buildDeck() {
    var deck = [];
    for (var r = 0; r < 13; r++) {
      for (var s = 0; s < 4; s++) {
        deck.push(encode(RANKS[r] + SUITS[s]));
      }
    }
    return deck;
  }

  // Display card with suit symbol
  function display(card) {
    if (!card) return '--';
    var r = card[0];
    var s = card[1];
    return r + (WPT.CARD_SUIT_SYMBOLS[s] || s);
  }

  // Display with HTML color
  function displayHTML(card) {
    if (!card) return '<span class="card-empty">--</span>';
    var r = card[0];
    var s = card[1];
    var color = WPT.CARD_SUIT_COLORS[s] || '#ffffff';
    return '<span style="color:' + color + '">' + r + WPT.CARD_SUIT_SYMBOLS[s] + '</span>';
  }

  // Check if two cards are suited
  function isSuited(card1, card2) {
    return card1[1] === card2[1];
  }

  // Check if two cards are a pair
  function isPair(card1, card2) {
    return card1[0] === card2[0];
  }

  // Get gap between two cards (0 = connected)
  function gap(card1, card2) {
    var r1 = rankIndex(card1);
    var r2 = rankIndex(card2);
    return Math.abs(r1 - r2) - 1;
  }

  // Get hand notation (e.g. "AKs", "QJo", "TT")
  function handNotation(card1, card2) {
    var r1 = rankIndex(card1);
    var r2 = rankIndex(card2);
    var high, low;
    if (r1 >= r2) {
      high = card1[0];
      low = card2[0];
    } else {
      high = card2[0];
      low = card1[0];
    }
    if (high === low) return high + low;
    return high + low + (isSuited(card1, card2) ? 's' : 'o');
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    PRIMES: PRIMES,
    fromCocos: fromCocos,
    rankIndex: rankIndex,
    suit: suit,
    suitIndex: suitIndex,
    encode: encode,
    encodeString: encodeString,
    buildDeck: buildDeck,
    display: display,
    displayHTML: displayHTML,
    isSuited: isSuited,
    isPair: isPair,
    gap: gap,
    handNotation: handNotation,
  };

})();

window.CardUtils = CardUtils;
