// ClubWPT Poker Terminal - GTO Preflop Range Charts
// Explicit hand-by-hand lookup with range notation parser
'use strict';

var GTORanges = (function() {

  // Rank order for range notation: 2=0 ... A=12 (matches CardUtils.rankIndex)
  var RANK_CHARS = '23456789TJQKA';

  // ═══════════════════════════════════════
  // RANGE NOTATION PARSER
  // ═══════════════════════════════════════

  // Parse compact range string into {hand: true} lookup object.
  // Supports: "55+", "A9s+", "A2s-A5s", "AJo+", "T9s", comma-separated, whitespace-insensitive
  function parseRange(str) {
    if (!str) return {};
    var set = {};
    var tokens = str.replace(/\s/g, '').split(',');
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (!tok) continue;
      parseToken(tok, set);
    }
    return set;
  }

  function rankIdx(ch) {
    return RANK_CHARS.indexOf(ch);
  }

  function parseToken(tok, set) {
    // Pair range: "55-99" or "55+" or "55"
    if (tok.length >= 2 && tok[0] === tok[1] && RANK_CHARS.indexOf(tok[0]) >= 0) {
      var pairRank = rankIdx(tok[0]);
      if (tok.length === 2) {
        // Single pair
        set[tok] = true;
      } else if (tok[2] === '+') {
        // Pair+: e.g., "55+" means 55 through AA
        for (var r = pairRank; r <= 12; r++) {
          set[RANK_CHARS[r] + RANK_CHARS[r]] = true;
        }
      } else if (tok[2] === '-') {
        // Pair range: e.g., "22-JJ"
        var endPair = rankIdx(tok[3]);
        var lo = Math.min(pairRank, endPair);
        var hi = Math.max(pairRank, endPair);
        for (var r2 = lo; r2 <= hi; r2++) {
          set[RANK_CHARS[r2] + RANK_CHARS[r2]] = true;
        }
      }
      return;
    }

    // Non-pair hands (suited/offsuit): "A9s+", "A2s-A5s", "AJo+", "T9s"
    // Check for dash range first: "A2s-A5s" or "K2s-K5s"
    var dashMatch = tok.match(/^([AKQJT2-9])([AKQJT2-9])([so])-([AKQJT2-9])([AKQJT2-9])([so])$/);
    if (dashMatch) {
      var hi1 = rankIdx(dashMatch[1]);
      var lo1 = rankIdx(dashMatch[2]);
      var suffix1 = dashMatch[3];
      var lo2 = rankIdx(dashMatch[5]);
      // Expand from lo1 to lo2 (keeping high card fixed)
      var loMin = Math.min(lo1, lo2);
      var loMax = Math.max(lo1, lo2);
      for (var k = loMin; k <= loMax; k++) {
        if (k === hi1) continue; // skip pairs
        set[RANK_CHARS[hi1] + RANK_CHARS[k] + suffix1] = true;
      }
      return;
    }

    // Single hand or plus notation: "A9s+", "AJo+", "T9s"
    var handMatch = tok.match(/^([AKQJT2-9])([AKQJT2-9])([so])(\+)?$/);
    if (handMatch) {
      var highR = rankIdx(handMatch[1]);
      var lowR = rankIdx(handMatch[2]);
      var suf = handMatch[3];
      var plus = handMatch[4] === '+';

      // Ensure high > low
      if (highR < lowR) { var tmp = highR; highR = lowR; lowR = tmp; }

      if (plus) {
        // Plus means increment the kicker up to highRank-1
        for (var j = lowR; j < highR; j++) {
          set[RANK_CHARS[highR] + RANK_CHARS[j] + suf] = true;
        }
      } else {
        set[RANK_CHARS[highR] + RANK_CHARS[lowR] + suf] = true;
      }
      return;
    }

    // Bare pair or hand without suit (e.g., "AA", "AK" — treat as both suited and offsuit)
    if (tok.length === 2 && RANK_CHARS.indexOf(tok[0]) >= 0 && RANK_CHARS.indexOf(tok[1]) >= 0) {
      if (tok[0] === tok[1]) {
        set[tok] = true;
      } else {
        var h = rankIdx(tok[0]);
        var l = rankIdx(tok[1]);
        if (h < l) { var t2 = h; h = l; l = t2; }
        set[RANK_CHARS[h] + RANK_CHARS[l] + 's'] = true;
        set[RANK_CHARS[h] + RANK_CHARS[l] + 'o'] = true;
      }
    }
  }

  // ═══════════════════════════════════════
  // RFI RANGES (raise-first-in, raise-or-fold)
  // ═══════════════════════════════════════

  var RFI = {
    UTG: parseRange('55+,A2s-A5s,A9s+,KTs+,QTs+,JTs,T9s,AJo+,KQo'),
    MP:  parseRange('44+,A2s-A5s,A8s+,K9s+,Q9s+,J9s+,T9s,98s,ATo+,KJo+,QJo'),
    HJ:  parseRange('33+,A2s+,K8s+,Q9s+,J9s+,T8s+,98s,87s,A9o+,KTo+,QTo+,JTo'),
    CO:  parseRange('22+,A2s+,K5s+,Q7s+,J8s+,T8s+,97s+,87s,76s,65s,A7o+,K9o+,QTo+,JTo'),
    BTN: parseRange('22+,A2s+,K2s+,Q4s+,J7s+,T7s+,96s+,86s+,75s+,65s,54s,A2o+,K7o+,Q9o+,J9o+,T9o'),
    SB:  parseRange('22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A2o+,K8o+,Q9o+,J9o+,T9o')
    // BB has no RFI
  };

  // ═══════════════════════════════════════
  // FACING OPEN RANGES (3-bet and call sets per hero position)
  // ═══════════════════════════════════════

  var FACING_OPEN = {
    // 3-bet ranges by hero position (regardless of opener — adjusted below by opener group)
    threeBet: {
      EP:  parseRange('QQ+,AKs,AKo,A5s'),
      MP:  parseRange('QQ+,AKs,AKo,A5s'),
      HJ:  parseRange('QQ+,AKs,AKo,JJ,TT,AQs,AQo,A4s-A5s'),
      CO:  parseRange('QQ+,AKs,AKo,JJ,TT,AQs,AQo,A2s-A5s,76s'),
      BTN: parseRange('QQ+,AKs,AKo,JJ,TT,AQs,AQo,A2s-A5s,87s,76s,K2s-K5s'),
      SB:  parseRange('QQ+,AKs,AKo,JJ,TT,AQs,AQo,A2s-A5s,87s,76s,K2s-K5s')
    },
    // Call ranges (IP spots: CO, BTN; SB is mostly 3-bet-or-fold OOP)
    call: {
      CO:  parseRange('99-66,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,AJo'),
      BTN: parseRange('99-66,AJs,ATs,A9s,KQs,KJs,QJs,JTs,T9s,98s,87s,76s,AQo,AJo,KQo'),
      SB:  parseRange('JJ,AQs')
    }
  };

  // ═══════════════════════════════════════
  // BB DEFENSE RANGES (keyed by opener group)
  // ═══════════════════════════════════════

  var BB_DEFENSE = {
    EP: {
      threeBet: parseRange('QQ+,AKs,AKo,A5s,A4s'),
      call:     parseRange('22-JJ,AQs-A2s,KQs,KJs,QJs,JTs,T9s,98s,87s')
    },
    MP: {
      threeBet: parseRange('QQ+,AKs,AKo,JJ,AQs,A4s-A5s'),
      call:     parseRange('22-TT,AQs-A2s,KQs,KJs,KTs,QJs,Q9s+,J9s+,JTs,T9s,98s,87s,ATo+,KJo+')
    },
    CO: {
      threeBet: parseRange('QQ+,AKs,AKo,JJ,AQs,AQo,A2s-A5s,K5s'),
      call:     parseRange('22-TT,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,ATo+,KTo+,QTo+,JTo')
    },
    BTN: {
      threeBet: parseRange('QQ+,AKs,AKo,JJ,TT,AQs,AQo,A2s-A5s,K4s-K5s,87s'),
      call:     parseRange('22-99,A2s+,K7s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,A2o+,K9o+,QTo+,JTo')
    },
    SB: {
      threeBet: parseRange('QQ+,AKs,AKo,JJ,TT,AQs,AQo,A2s-A5s,K2s-K5s,87s,76s'),
      call:     parseRange('22-99,A2s+,K5s+,Q7s+,J8s+,T8s+,97s+,86s+,76s,65s,A2o+,K8o+,Q9o+,J9o+,T9o')
    }
  };

  // ═══════════════════════════════════════
  // FACING 3-BET RANGES (keyed by hero's open position)
  // ═══════════════════════════════════════

  var FACING_3BET = {
    UTG: { fourBet: parseRange('AA,KK,QQ,AKs,A5s'),          call: parseRange('JJ,TT,AQs') },
    MP:  { fourBet: parseRange('AA,KK,QQ,AKs,A5s'),          call: parseRange('JJ,TT,AQs,AQo') },
    HJ:  { fourBet: parseRange('AA,KK,QQ,AKs,A5s'),          call: parseRange('JJ,TT,AQs,AQo') },
    CO:  { fourBet: parseRange('AA,KK,QQ,AKs,JJ,A5s,A4s'),   call: parseRange('TT,AQs,AQo,KQs') },
    BTN: { fourBet: parseRange('AA,KK,QQ,AKs,AKo,JJ,A5s,A4s'), call: parseRange('TT,AQs,AQo,KQs,98s,87s') },
    SB:  { fourBet: parseRange('AA,KK,QQ,AKs,A5s,A4s'),      call: parseRange('JJ,TT,AQs,AQo,KQs') }
  };

  // ═══════════════════════════════════════
  // FACING 4-BET RANGE (same for all positions)
  // ═══════════════════════════════════════

  var FACING_4BET = {
    fiveBet: parseRange('AA,KK'),
    call:    parseRange('QQ,AKs')
  };

  // ═══════════════════════════════════════
  // POSITION MAPPING
  // ═══════════════════════════════════════

  // Map game position labels to GTO range keys (UTG/MP/HJ/CO/BTN/SB/BB)
  function mapPosition(gamePosition, tableSize) {
    if (!gamePosition) return null;
    var pos = gamePosition;
    var size = tableSize || 9;

    if (size >= 8) {
      // 8-9 max: UTG/UTG+1/UTG+2 → UTG, MP/MP+1 → MP, HJ handled below
      if (pos === 'UTG' || pos === 'UTG+1' || pos === 'UTG+2') return 'UTG';
      if (pos === 'MP') return 'MP';
      if (pos === 'MP+1') return 'HJ';
      // CO, BTN, SB, BB as-is
      return pos;
    }

    if (size === 7) {
      // 7-max: UTG/UTG+1 → UTG, MP → HJ
      if (pos === 'UTG' || pos === 'UTG+1') return 'UTG';
      if (pos === 'MP') return 'HJ';
      return pos;
    }

    if (size === 6) {
      // 6-max: UTG → UTG, MP → HJ
      if (pos === 'UTG') return 'UTG';
      if (pos === 'MP') return 'HJ';
      return pos;
    }

    if (size === 5) {
      // 5 players: UTG → HJ (widened)
      if (pos === 'UTG') return 'HJ';
      return pos;
    }

    if (size === 4) {
      // 4 players: UTG → CO (widened)
      if (pos === 'UTG') return 'CO';
      return pos;
    }

    // 3 or fewer: everyone is late position
    if (size <= 3) {
      if (pos === 'BTN') return 'BTN';
      return pos;
    }

    return pos;
  }

  // Map opener position to opener group key for BB defense / facing-open
  function openerGroup(pos) {
    if (pos === 'UTG' || pos === 'UTG+1' || pos === 'UTG+2') return 'EP';
    if (pos === 'MP' || pos === 'HJ') return 'MP';
    return pos; // CO, BTN, SB
  }

  // ═══════════════════════════════════════
  // SCENARIO DETECTION
  // ═══════════════════════════════════════

  function detectScenario(handData) {
    if (!handData || !handData.heroPosition) return 'UNKNOWN';

    var raises = handData.raisesCount || 0;
    var heroActed = handData.heroActed || false;

    // Hero already acted (raised) — facing re-raises
    if (heroActed && raises >= 3) return 'FACING_4BET';
    if (heroActed && raises >= 2) return 'FACING_3BET';

    // Hero hasn't acted yet
    if (!heroActed && raises >= 1) return 'FACING_OPEN';

    // No raises — raise first in (includes limped pots)
    if (!heroActed && raises === 0) {
      if (handData.limperCount > 0) return 'LIMPED';
      return 'RFI';
    }

    return 'UNKNOWN';
  }

  // ═══════════════════════════════════════
  // MAIN API: getAction
  // ═══════════════════════════════════════

  function getAction(card1, card2, handData) {
    var notation = CardUtils.handNotation(card1, card2);
    var scenario = detectScenario(handData);
    var heroPos = handData ? handData.heroPosition : null;
    var tableSize = handData ? (handData.tableSize || 9) : 9;
    var position = mapPosition(heroPos, tableSize);
    var stackBB = handData ? (handData.heroStackBB || 100) : 100;
    var limperCount = handData ? (handData.limperCount || 0) : 0;
    var activePlayers = handData ? (handData.activePlayers || 2) : 2;

    // Opener position mapped to group
    var openerPos = handData ? handData.openerPosition : null;
    var openerMapped = openerPos ? mapPosition(openerPos, tableSize) : null;
    var opGroup = openerMapped ? openerGroup(openerMapped) : 'MP';

    var result = {
      action: 'FOLD',
      scenario: scenario,
      handNotation: notation,
      position: position,
      inRange: false,
      sizing: null
    };

    if (!position) {
      result.action = null;
      return result;
    }

    // ═══ Push/fold mode: < 20 BB ═══
    if (stackBB < 20) {
      return pushFoldAction(notation, position, scenario, result);
    }

    // ═══ Determine action by scenario ═══
    if (scenario === 'RFI' || scenario === 'LIMPED') {
      result = rfiAction(notation, position, scenario, result, limperCount, stackBB);
    } else if (scenario === 'FACING_OPEN') {
      result = facingOpenAction(notation, position, opGroup, openerMapped, scenario, result, activePlayers, stackBB);
    } else if (scenario === 'FACING_3BET') {
      result = facing3BetAction(notation, position, scenario, result, stackBB);
    } else if (scenario === 'FACING_4BET') {
      result = facing4BetAction(notation, scenario, result);
    } else {
      // UNKNOWN — return null action to fall through to legacy
      result.action = null;
    }

    return result;
  }

  // ═══ RFI action ═══
  function rfiAction(notation, position, scenario, result, limperCount, stackBB) {
    var range = RFI[position];
    if (!range) {
      // BB has no RFI — this is a check scenario
      if (position === 'BB') {
        result.action = 'CHECK';
        result.scenario = scenario;
        return result;
      }
      range = RFI['CO']; // fallback
    }

    if (range[notation]) {
      result.action = 'RAISE';
      result.inRange = true;
      // Sizing: 2.5x BB + 1 BB per limper
      var openSize = 2.5 + limperCount;
      result.sizing = { type: 'open', amount: openSize + 'x' };
    } else {
      result.action = 'FOLD';
    }
    return result;
  }

  // ═══ Facing open action ═══
  function facingOpenAction(notation, position, opGroup, openerMapped, scenario, result, activePlayers, stackBB) {
    // BB defends differently
    if (position === 'BB') {
      return bbDefenseAction(notation, opGroup, openerMapped, scenario, result, activePlayers, stackBB);
    }

    // 3-bet range for hero's position
    var threeBetRange = FACING_OPEN.threeBet[position];
    var callRange = FACING_OPEN.call[position];

    // Tighten vs EP opens (~20% fewer combos: only keep value 3-bets)
    var vsEP = opGroup === 'EP';
    // Widen vs BTN opens (use full range)
    var vsBTN = opGroup === 'BTN';

    if (threeBetRange && threeBetRange[notation]) {
      // In 3-bet range — but vs EP, only 3-bet the tightest value hands
      if (vsEP && !parseRange('QQ+,AKs,AKo')[notation]) {
        // Demote to call if we have a call range
        if (callRange && callRange[notation]) {
          result.action = 'CALL';
          result.inRange = true;
        } else {
          result.action = 'FOLD';
        }
      } else {
        result.action = '3BET';
        result.inRange = true;
        // 3-bet sizing: 3x open IP, 4x open OOP
        var ip = position === 'BTN' || position === 'CO';
        var threeBetMult = ip ? '3x' : '4x';
        result.sizing = { type: '3bet', amount: threeBetMult + ' open' };
      }
    } else if (callRange && callRange[notation]) {
      // Multiway tightening: with 3+ active, only call with top of call range
      if (activePlayers > 3) {
        // Tighten — only call with pairs 77+ and suited broadways
        var tightCall = parseRange('77+,AJs+,KQs');
        if (tightCall[notation]) {
          result.action = 'CALL';
          result.inRange = true;
        } else {
          result.action = 'FOLD';
        }
      } else {
        result.action = 'CALL';
        result.inRange = true;
      }
      // Widen call range vs BTN: also add some extra hands
      if (vsBTN && !callRange[notation]) {
        var btnExtra = parseRange('55-44,K9s,Q9s,J9s,T9s,98s,ATo,KJo');
        if (btnExtra[notation]) {
          result.action = 'CALL';
          result.inRange = true;
        }
      }
    } else {
      // Check BTN-widening for hands not in base ranges
      if (vsBTN) {
        var btnWiden = parseRange('55-44,K9s,Q9s,J9s,T9s,98s,ATo,KJo');
        if (btnWiden[notation]) {
          result.action = 'CALL';
          result.inRange = true;
        } else {
          result.action = 'FOLD';
        }
      } else {
        result.action = 'FOLD';
      }
    }

    // Stack depth: 150+ BB widens suited connectors in call range
    if (stackBB >= 150 && result.action === 'FOLD') {
      var deepCall = parseRange('54s,65s,76s,87s,98s,T9s,55-22');
      if (deepCall[notation]) {
        result.action = 'CALL';
        result.inRange = true;
      }
    }

    // Stack depth: < 40 BB tighten calls, favor shove-or-fold
    if (stackBB < 40 && result.action === 'CALL') {
      var shallowKeep = parseRange('77+,ATs+,KQs,AJo+');
      if (!shallowKeep[notation]) {
        result.action = 'FOLD';
        result.inRange = false;
      }
    }

    return result;
  }

  // ═══ BB defense action ═══
  function bbDefenseAction(notation, opGroup, openerMapped, scenario, result, activePlayers, stackBB) {
    var defense = BB_DEFENSE[opGroup];
    if (!defense) defense = BB_DEFENSE['CO']; // fallback

    if (defense.threeBet[notation]) {
      result.action = '3BET';
      result.inRange = true;
      result.sizing = { type: '3bet', amount: '4x open' }; // BB is always OOP
    } else if (defense.call[notation]) {
      if (activePlayers > 3) {
        var tightBBCall = parseRange('77+,A9s+,KQs,ATo+');
        if (tightBBCall[notation]) {
          result.action = 'CALL';
          result.inRange = true;
        } else {
          result.action = 'FOLD';
        }
      } else {
        result.action = 'CALL';
        result.inRange = true;
      }
    } else {
      result.action = 'FOLD';
    }

    // Stack depth: < 40 BB tighten calls
    if (stackBB < 40 && result.action === 'CALL') {
      var shallowBB = parseRange('77+,A9s+,KQs,ATo+');
      if (!shallowBB[notation]) {
        result.action = 'FOLD';
        result.inRange = false;
      }
    }

    // Stack depth: 150+ BB widen calls
    if (stackBB >= 150 && result.action === 'FOLD') {
      var deepBB = parseRange('22+,A2s+,K5s+,Q7s+,J8s+,T8s+,97s+,87s,76s,65s,A7o+,K9o+,QTo+,JTo');
      if (deepBB[notation]) {
        result.action = 'CALL';
        result.inRange = true;
      }
    }

    return result;
  }

  // ═══ Facing 3-bet action ═══
  function facing3BetAction(notation, position, scenario, result, stackBB) {
    var ranges = FACING_3BET[position];
    if (!ranges) ranges = FACING_3BET['CO']; // fallback

    if (ranges.fourBet[notation]) {
      result.action = '4BET';
      result.inRange = true;
      // 4-bet sizing: 2.2-2.5x the 3-bet
      result.sizing = { type: '4bet', amount: '2.3x 3bet' };
    } else if (ranges.call[notation]) {
      result.action = 'CALL';
      result.inRange = true;
    } else {
      result.action = 'FOLD';
    }

    // Stack depth: < 40 BB — shove the 4-bet range instead of sizing
    if (stackBB < 40 && result.action === '4BET') {
      result.action = 'ALL-IN';
      result.sizing = { type: 'shove', amount: 'all-in' };
    }

    // Stack depth: < 40 BB — tighten calls
    if (stackBB < 40 && result.action === 'CALL') {
      var shallowCall3B = parseRange('JJ+,AKs,AQs');
      if (!shallowCall3B[notation]) {
        result.action = 'FOLD';
        result.inRange = false;
      }
    }

    return result;
  }

  // ═══ Facing 4-bet action ═══
  function facing4BetAction(notation, scenario, result) {
    if (FACING_4BET.fiveBet[notation]) {
      result.action = '5BET';
      result.inRange = true;
      result.sizing = { type: '5bet', amount: 'all-in' };
    } else if (FACING_4BET.call[notation]) {
      result.action = 'CALL';
      result.inRange = true;
    } else {
      result.action = 'FOLD';
    }
    return result;
  }

  // ═══ Push/fold mode (< 20 BB) ═══
  function pushFoldAction(notation, position, scenario, result) {
    if (scenario === 'RFI' || scenario === 'LIMPED') {
      // Use RFI range but action is ALL-IN
      var range = RFI[position];
      if (!range && position === 'BB') {
        // BB with no raise: check
        result.action = 'CHECK';
        return result;
      }
      if (!range) range = RFI['CO'];

      if (range[notation]) {
        result.action = 'ALL-IN';
        result.inRange = true;
        result.sizing = { type: 'shove', amount: 'all-in' };
      } else {
        result.action = 'FOLD';
      }
    } else if (scenario === 'FACING_OPEN') {
      // Only shove with premium+strong 3-bet range
      var shoveRange = parseRange('QQ+,AKs,AKo,JJ,TT,AQs,A5s');
      if (shoveRange[notation]) {
        result.action = 'ALL-IN';
        result.inRange = true;
        result.sizing = { type: 'shove', amount: 'all-in' };
      } else {
        result.action = 'FOLD';
      }
    } else if (scenario === 'FACING_3BET' || scenario === 'FACING_4BET') {
      var jamRange = parseRange('AA,KK,QQ,AKs');
      if (jamRange[notation]) {
        result.action = 'ALL-IN';
        result.inRange = true;
        result.sizing = { type: 'shove', amount: 'all-in' };
      } else {
        result.action = 'FOLD';
      }
    } else {
      result.action = null;
    }
    return result;
  }

  // ═══════════════════════════════════════
  // PERCENTILE (kept for toHandTier badge compatibility)
  // ═══════════════════════════════════════

  // 169 starting hands ranked by all-in equity (best to worst)
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

  var RANGE_PCT = [];
  (function() {
    var r, c;
    for (r = 0; r < 13; r++) {
      RANGE_PCT[r] = [];
      for (c = 0; c < 13; c++) RANGE_PCT[r][c] = 100;
    }
    var cumCombos = 0;
    var TOTAL_COMBOS = 1326;
    for (var i = 0; i < HAND_ORDER.length; i++) {
      var h = HAND_ORDER[i];
      var hi = h[0], lo = h[1], type = h[2];
      var combos = type === 2 ? 6 : type === 1 ? 4 : 12;
      cumCombos += combos;
      var pct = Math.round((cumCombos / TOTAL_COMBOS) * 1000) / 10;
      if (type === 2) RANGE_PCT[hi][lo] = pct;
      else if (type === 1) RANGE_PCT[lo][hi] = pct;
      else RANGE_PCT[hi][lo] = pct;
    }
  })();

  function getPercentile(card1, card2) {
    var r1 = CardUtils.rankIndex(card1);
    var r2 = CardUtils.rankIndex(card2);
    var suited = CardUtils.isSuited(card1, card2);
    if (r1 === r2) return RANGE_PCT[r1][r2];
    var hi = r1 > r2 ? r1 : r2;
    var lo = r1 > r2 ? r2 : r1;
    if (suited) return RANGE_PCT[lo][hi];
    return RANGE_PCT[hi][lo];
  }

  // ═══════════════════════════════════════
  // HAND TIER (for UI badge)
  // ═══════════════════════════════════════

  function toHandTier(gtoResult) {
    if (!gtoResult || !gtoResult.action) return null;

    var pct = getPercentile_fromNotation(gtoResult.handNotation);

    if (pct <= 3)  return WPT.HAND_TIERS.PREMIUM;
    if (pct <= 10) return WPT.HAND_TIERS.STRONG;
    if (pct <= 25) return WPT.HAND_TIERS.PLAYABLE;
    if (pct <= 50) return WPT.HAND_TIERS.MARGINAL;
    return WPT.HAND_TIERS.WEAK;
  }

  // Get percentile from hand notation string (e.g., "AKs" → percentile)
  function getPercentile_fromNotation(notation) {
    if (!notation || notation.length < 2) return 100;
    var hi = RANK_CHARS.indexOf(notation[0]);
    var lo = RANK_CHARS.indexOf(notation[1]);
    if (hi < 0 || lo < 0) return 100;
    if (hi === lo) return RANGE_PCT[hi][lo];
    if (notation.length === 3 && notation[2] === 's') return RANGE_PCT[lo][hi];
    return RANGE_PCT[hi][lo]; // offsuit or pair
  }

  // ═══════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════

  return {
    parseRange: parseRange,
    mapPosition: mapPosition,
    detectScenario: detectScenario,
    getAction: getAction,
    getPercentile: getPercentile,
    toHandTier: toHandTier,
    RFI: RFI,
    FACING_OPEN: FACING_OPEN,
    BB_DEFENSE: BB_DEFENSE,
    FACING_3BET: FACING_3BET,
    FACING_4BET: FACING_4BET,
    RANGE_PCT: RANGE_PCT
  };

})();

window.GTORanges = GTORanges;
