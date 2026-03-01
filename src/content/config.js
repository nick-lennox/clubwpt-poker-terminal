// ClubWPT Poker Terminal - Configuration & Constants
'use strict';

var WPT = window.WPT || {};

// Cocos scene graph paths
WPT.PATHS = {
  SCENE: 'Scene',
  GAME_MAIN: 'gameMain_panel',
  SEAT_PANEL: 'seatPanel',
  CARD_PANEL: 'card_panel',
  POT_NODE: 'potNode',
  D_IMG: 'D_img',
  ACTION_PANEL: 'actionButton_panel',
};

// Seat status enum (from Cocos Seat component)
WPT.SEAT_STATUS = {
  PLAYING: 0,
  SITTING_OUT: 1,
  WAITING: 2,
  EMPTY: 3,
  FOLDED: 4,
  // Additional observed values
  BETWEEN_HANDS: 4,
};

// Card encoding from Cocos Card component (zero-indexed)
// eCardNum: 0=2, 1=3, 2=4, 3=5, 4=6, 5=7, 6=8, 7=9, 8=T, 9=J, 10=Q, 11=K, 12=A
// eCardSuit: 0=Diamonds, 1=Clubs, 2=Hearts, 3=Spades
WPT.CARD_NUM_MAP = {
  0: '2', 1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8',
  7: '9', 8: 'T', 9: 'J', 10: 'Q', 11: 'K', 12: 'A',
};

WPT.CARD_SUIT_MAP = {
  0: 'd', // Diamonds
  1: 'c', // Clubs
  2: 'h', // Hearts
  3: 's', // Spades
};

WPT.CARD_SUIT_SYMBOLS = {
  's': '\u2660', // ♠
  'h': '\u2665', // ♥
  'd': '\u2666', // ♦
  'c': '\u2663', // ♣
};

WPT.CARD_SUIT_COLORS = {
  's': '#ffffff',
  'h': '#ff4444',
  'd': '#4488ff',
  'c': '#44cc44',
};

// Hand strength tiers for preflop
WPT.HAND_TIERS = {
  PREMIUM: { tier: 1, label: 'PREMIUM', color: '#00ff41' },
  STRONG: { tier: 2, label: 'STRONG', color: '#88ff00' },
  PLAYABLE: { tier: 3, label: 'PLAYABLE', color: '#ffff00' },
  MARGINAL: { tier: 4, label: 'MARGINAL', color: '#ff8800' },
  WEAK: { tier: 5, label: 'WEAK', color: '#ff4141' },
};

// Postflop hand categories
WPT.HAND_CATEGORIES = {
  ROYAL_FLUSH: 'Royal Flush',
  STRAIGHT_FLUSH: 'Straight Flush',
  FOUR_OF_A_KIND: 'Four of a Kind',
  FULL_HOUSE: 'Full House',
  FLUSH: 'Flush',
  STRAIGHT: 'Straight',
  THREE_OF_A_KIND: 'Three of a Kind',
  TWO_PAIR: 'Two Pair',
  ONE_PAIR: 'One Pair',
  HIGH_CARD: 'High Card',
};

// Position names by table size
WPT.POSITIONS = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'CO'],
};

// Polling interval in ms
WPT.POLL_INTERVAL = 500;

// Minimum hands before showing stats
WPT.MIN_HANDS_FOR_DISPLAY = 5;

// Equity Monte Carlo iterations (50k gives ~0.5% standard deviation)
WPT.EQUITY_ITERATIONS = 50000;

// Action normalization
WPT.ACTION_MAP = {
  'fold': 'fold',
  'FOLD': 'fold',
  'check': 'check',
  'CHECK': 'check',
  'call': 'call',
  'CALL': 'call',
  'raise': 'raise',
  'RAISE': 'raise',
  'bet': 'raise',
  'BET': 'raise',
  'all in': 'allin',
  'ALL IN': 'allin',
  'All In': 'allin',
  'ALLIN': 'allin',
  'Waiting': 'waiting',
  'Sit Out': 'sitout',
  'Open seat': 'empty',
};

window.WPT = WPT;
