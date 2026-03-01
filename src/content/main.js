// ClubWPT Poker Terminal - Main Entry Point v1.2
// Bootstraps all modules and wires event flow
'use strict';

(function() {
  console.log('[WPT] ========================================');
  console.log('[WPT] ClubWPT Poker Terminal v1.2.0');
  console.log('[WPT] ========================================');

  // Module instances
  var storage = new StorageManager();
  var statsEngine = null;
  var equityBridge = new EquityBridge();
  var advisor = new ActionAdvisor();
  var outsAnalyzer = new OutsAnalyzer();
  var boardAnalyzer = new BoardAnalyzer();
  var vulnAnalyzer = new VulnerabilityAnalyzer();
  var sessionTracker = new SessionTracker();
  var terminalUI = new TerminalUI();
  var handTracker = new HandTracker();
  var scraper = new CocosScraper();

  // State tracking
  var lastEquity = null;
  var lastHandTier = null;
  var lastHeroCardStr = '';
  var lastCommunityCardStr = '';
  var lastNumOpponents = -1;
  var debugLogTimer = 0;
  var sessionUpdateTimer = 0;
  var lastEquityRequestTime = 0;   // Throttle: min ms between requests

  function init() {
    storage.init(function() {
      console.log('[WPT] Storage ready');

      statsEngine = new PlayerStats(storage);
      equityBridge.init();
      terminalUI.init();
      terminalUI.updateStatus('INITIALIZING...');
      terminalUI._onSessionReset = function() {
        sessionTracker.reset();
        terminalUI.updateSession(sessionTracker.getStats());
      };

      wireEvents();
      scraper.start();

      console.log('[WPT] All modules initialized');
    });
  }

  function wireEvents() {

    // ═══════════════════════════════════════
    // SCRAPER STATE CHANGE (every 500ms)
    // ═══════════════════════════════════════
    scraper.on('stateChange', function(gameState) {
      debugLogTimer++;
      sessionUpdateTimer++;

      // Feed to hand tracker
      handTracker.processState(gameState);

      // Update player badges
      if (statsEngine) {
        for (var i = 0; i < gameState.players.length; i++) {
          var p = gameState.players[i];
          if (p.name && !p.isEmpty) {
            statsEngine.ensurePlayer(p.name);
          }
        }
        terminalUI.updatePlayerBadges(gameState.players, statsEngine);
      }

      // Basic info panel
      var activePlayers = gameState.players.filter(function(p) { return !p.isEmpty; }).length;
      var trackedActive = handTracker.getActivePlayers();
      var numOpponents = Math.max(1, (trackedActive > 0 ? trackedActive : activePlayers) - 1);

      // Compute effective pot
      // The scraped pot value from the center display already includes collected bets
      // Only add currentBet amounts if they're reliably scraped (non-zero and reasonable)
      var effectivePot = gameState.pot;
      var totalCurrentBets = 0;
      for (var epi = 0; epi < gameState.players.length; epi++) {
        if (gameState.players[epi].currentBet > 0) {
          totalCurrentBets += gameState.players[epi].currentBet;
        }
      }
      // Only add current bets if total seems reasonable (< 10x the pot to avoid stale data)
      if (totalCurrentBets > 0 && totalCurrentBets < effectivePot * 10 + 1) {
        effectivePot += totalCurrentBets;
      }

      terminalUI.updateInfo({
        phase: gameState.phase,
        pot: effectivePot,
        players: activePlayers,
        handNum: gameState.handNum,
      });

      // Board cards — filter stale cards during preflop
      // TableCenter nodes retain eCardNum from previous hand, so ignore board during preflop
      var boardCards = gameState.communityCards;
      if (gameState.phase === 'preflop' || gameState.phase === 'unknown') {
        boardCards = [];
      }
      terminalUI.updateBoard(boardCards);

      // ═══ Session tracker: update hero stack ═══
      // Use effective stack (chips + currentBet) to prevent PnL swings mid-hand.
      // When hero bets, displayed chips drop but currentBet rises — effective stays stable.
      for (var si = 0; si < gameState.players.length; si++) {
        var sp = gameState.players[si];
        if (sp.isOwner || sp.seatIndex === gameState.heroSeatIndex) {
          var rawChips = parseFloat(String(sp.chips).replace(/[^0-9.]/g, '')) || 0;
          var heroBetOut = sp.currentBet || 0;
          var effectiveHeroStack = rawChips + heroBetOut;
          sessionTracker.setStartStack(effectiveHeroStack);
          sessionTracker.updateStack(effectiveHeroStack);
          sessionTracker.setHeroName(sp.name);
          break;
        }
      }

      // Use game's buyinInfos to get the true session buy-in amount
      // Internal values are in cents (1/100 SC), convert: value / 100
      // Checked continuously to detect rebuys (total_buyin increases on rebuy)
      if (sessionTracker._heroName) {
        try {
          var rd = scraper._room && scraper._room._roomData;
          if (rd && rd.buyinInfos) {
            var heroNameLower = sessionTracker._heroName.toLowerCase();
            for (var bi = 0; bi < rd.buyinInfos.length; bi++) {
              var entry = rd.buyinInfos[bi];
              if (entry && entry.playername && entry.playername.toLowerCase() === heroNameLower) {
                var buyInSC = entry.total_buyin / 100;
                sessionTracker.updateBuyIn(buyInSC);
                break;
              }
            }
          }
        } catch(e2) {}
      }

      // Detect big blind (blinds is an object {text, sb, bb})
      if (gameState.blinds && gameState.blinds.bb > 0) {
        sessionTracker.setBigBlind(gameState.blinds.bb);
      }

      // Session display (every ~5s)
      if (sessionUpdateTimer % 10 === 0) {
        terminalUI.updateSession(sessionTracker.getStats());
      }

      // ═══ Hero cards from game state ═══
      var heroCards = findHeroCards(gameState);

      // Update hero cards display when they change
      var heroCardStr = heroCards.join(',');
      if (heroCardStr !== lastHeroCardStr) {
        console.log('[WPT] Hero cards: ' + heroCardStr);
        lastHeroCardStr = heroCardStr;
        terminalUI.updateHeroCards(heroCards);

        if (heroCards.length === 2) {
          // Try GTO classification when position is available, fall back to legacy
          var handData = buildHandData(gameState);
          var tier;
          if (handData) {
            tier = advisor.classifyPreflopGTO(heroCards[0], heroCards[1], handData);
          }
          if (!tier) {
            tier = advisor.classifyPreflop(heroCards[0], heroCards[1]);
          }
          lastHandTier = tier;
          terminalUI.updateHandTier(tier);
          // Immediate equity calc on card change
          requestEquity(heroCards, boardCards, numOpponents);
        }
      }

      // Detect community card changes (using filtered boardCards, not raw)
      var ccStr = boardCards.join(',');
      if (ccStr !== lastCommunityCardStr) {
        if (ccStr !== '') {
          console.log('[WPT] Board: ' + ccStr);
        }
        lastCommunityCardStr = ccStr;

        if (heroCards.length === 2 && ccStr !== '') {
          // Immediate equity calc on board change
          requestEquity(heroCards, boardCards, numOpponents);

          // Postflop hand classification
          if (boardCards.length >= 3) {
            var postflop = advisor.classifyPostflop(heroCards, boardCards);
            if (postflop) {
              terminalUI.updateHandTier({
                label: postflop.category,
                color: postflopColor(postflop.categoryNum),
              });
            }
          }
        }
      }

      // ═══ EQUITY REFRESH on opponent count change ═══
      // Only recalculate when numOpponents actually changes, not on a timer
      if (heroCards.length === 2 && numOpponents !== lastNumOpponents) {
        lastNumOpponents = numOpponents;
        requestEquity(heroCards, boardCards, numOpponents);
      }

      // ═══ OUTS & DRAWS (every tick, cheap computation) ═══
      if (heroCards.length === 2 && boardCards.length >= 3) {
        var outsData = outsAnalyzer.analyze(heroCards, boardCards);
        terminalUI.updateOuts(outsData);
      } else {
        terminalUI.updateOuts(null);
      }

      // ═══ BOARD TEXTURE + SPR + BET SIZING (every tick) ═══
      // Use effective pot for all analysis
      var gsEffective = {};
      var _gsKeys = Object.keys(gameState);
      for (var gsi = 0; gsi < _gsKeys.length; gsi++) { gsEffective[_gsKeys[gsi]] = gameState[_gsKeys[gsi]]; }
      gsEffective.pot = effectivePot;

      // Compute toCall fallback from player bets (reliable even when action UI isn't scraped)
      var maxBet = 0;
      var heroBet = 0;
      for (var bfi = 0; bfi < gameState.players.length; bfi++) {
        var bfp = gameState.players[bfi];
        if (bfp.currentBet > maxBet) maxBet = bfp.currentBet;
        if (bfp.isOwner || bfp.seatIndex === gameState.heroSeatIndex) {
          heroBet = bfp.currentBet || 0;
        }
      }
      if (maxBet > heroBet) {
        gsEffective.toCallFallback = maxBet - heroBet;
      }

      var boardResult = boardAnalyzer.analyze(heroCards, boardCards, gsEffective);
      terminalUI.updateBoardTexture(boardResult.texture, boardResult.spr);
      terminalUI.updateBetSizing(boardResult.betSizing);

      // ═══ VULNERABILITY ANALYSIS (every tick, postflop) ═══
      var vulnerability = null;
      if (heroCards.length === 2 && boardCards.length >= 3) {
        var postflopClass = advisor.classifyPostflop(heroCards, boardCards);
        if (postflopClass) {
          vulnerability = vulnAnalyzer.analyze(heroCards, boardCards, postflopClass);
        }
        terminalUI.updateVulnerability(vulnerability);
      } else {
        terminalUI.updateVulnerability(null);
      }

      // ═══ POT ODDS + RECOMMENDATION (every tick) ═══
      if (lastEquity && heroCards.length === 2) {
        var potOdds = advisor.getPotOdds(gsEffective, lastEquity);
        terminalUI.updatePotOdds(potOdds);

        var rec = advisor.recommend(
          lastEquity, potOdds, lastHandTier,
          gameState.phase,
          handTracker.getHeroPosition(),
          handTracker.getActivePlayers(),
          vulnerability
        );
        terminalUI.updateRecommendation(rec);
      }

      // Position
      var heroPos = handTracker.getHeroPosition();
      if (heroPos) terminalUI.updateInfo({ position: heroPos });

      // Status
      terminalUI.updateStatus((gameState.handNum > 0 || handTracker.currentHand) ? 'LIVE' : 'SCANNING');

      // ═══ DEBUG ═══
      try {
        var debugLines = [];
        debugLines.push('heroSeat=' + gameState.heroSeatIndex);
        debugLines.push('pot=' + gameState.pot + ' ePot=' + effectivePot.toFixed(2));
        debugLines.push('board=[' + boardCards.join(',') + '] phase=' + gameState.phase);
        debugLines.push('eq=' + (lastEquity ? lastEquity.equity + '%' : 'n/a') + ' opp=' + numOpponents);
        for (var d = 0; d < gameState.players.length; d++) {
          var dp = gameState.players[d];
          if (dp.isOwner || dp.seatIndex === gameState.heroSeatIndex) {
            debugLines.push('hero:seat' + dp.seatIndex + ' cards=[' + dp.cards.join(',') + '] bet=' + (dp.currentBet || 0));
          }
        }
        if (scraper._lastCardDebug) debugLines.push('raw: ' + scraper._lastCardDebug);
        if (scraper._lastBoardDebug) {
          debugLines.push('scraper: ' + scraper._lastBoardDebug);
          if (scraper._lastBoardDebug.indexOf('INTROSPECT') >= 0 && debugLogTimer % 20 === 0) {
            console.log('[WPT] Board introspect:', scraper._lastBoardDebug);
          }
        }
        terminalUI.updateDebug(debugLines.join(' | '));
      } catch(e) {}
    });

    // ═══ HAND TRACKER EVENTS ═══

    handTracker.on('newHand', function(hand) {
      console.log('[WPT] === NEW HAND #' + hand.handId + ' ===');
      lastHeroCardStr = '';
      lastCommunityCardStr = '';
      lastEquity = null;
      lastHandTier = null;
      lastNumOpponents = -1;

      // Snapshot stack at hand boundary for accurate peak/valley tracking.
      // At newHand, the previous hand's pot has been awarded — stack is clean.
      var gs = scraper.getLastState();
      if (gs) {
        for (var nhi = 0; nhi < gs.players.length; nhi++) {
          var nhp = gs.players[nhi];
          if (nhp.isOwner || nhp.seatIndex === gs.heroSeatIndex) {
            var nhStack = parseFloat(String(nhp.chips).replace(/[^0-9.]/g, '')) || 0;
            sessionTracker.snapshotHandBoundary(nhStack + (nhp.currentBet || 0));
            break;
          }
        }
      }

      terminalUI.updateInfo({ pot: 0 });
      terminalUI.updateEquity(null);
      terminalUI.updatePotOdds(null);
      terminalUI.updateRecommendation(null);
      terminalUI.updateHeroCards(null);
      terminalUI.updateHandTier(null);
      terminalUI.updateOuts(null);
      terminalUI.updateBetSizing(null);
      terminalUI.updateVulnerability(null);
    });

    handTracker.on('handComplete', function(hand) {
      console.log('[WPT] Hand #' + hand.handId + ' complete');
      if (statsEngine) statsEngine.updateFromHand(hand);

      // Find hero player to get their VPIP/PFR flags
      var heroPlayer = null;
      if (hand.heroSeatIndex >= 0) {
        for (var hp = 0; hp < hand.players.length; hp++) {
          if (hand.players[hp].seatIndex === hand.heroSeatIndex) {
            heroPlayer = hand.players[hp];
            break;
          }
        }
      }

      sessionTracker.recordHand({
        handId: hand.handId,
        heroVPIP: heroPlayer ? heroPlayer.vpip : false,
        heroPFR: heroPlayer ? heroPlayer.pfr : false,
      });
      terminalUI.updateSession(sessionTracker.getStats());
    });

    handTracker.on('action', function(data) {
      var gs = scraper.getLastState();

      // Reclassify preflop GTO when scenario changes (e.g., opponent raises → RFI becomes FACING_OPEN)
      if (data.phase === 'preflop' && gs) {
        var hc = findHeroCards(gs);
        if (hc.length === 2) {
          var handData = buildHandData(gs);
          if (handData) {
            var newTier = advisor.classifyPreflopGTO(hc[0], hc[1], handData);
            if (newTier) {
              lastHandTier = newTier;
              terminalUI.updateHandTier(newTier);
            }
          }
        }
      }

      // Recalculate equity immediately when a fold changes opponent count
      if (data.action.action === 'fold') {
        if (gs) {
          var hcFold = findHeroCards(gs);
          if (hcFold.length === 2) {
            var bc = gs.communityCards;
            if (gs.phase === 'preflop' || gs.phase === 'unknown') bc = [];
            var newOpp = Math.max(1, handTracker.getActivePlayers() - 1);
            lastNumOpponents = newOpp;
            lastEquityRequestTime = 0;
            requestEquity(hcFold, bc, newOpp);
          }
        }
      }
    });
  }

  // ═══ HELPERS ═══

  // Build handData object for GTO range lookup from current hand state
  function buildHandData(gameState) {
    if (!handTracker.currentHand) return null;
    var hand = handTracker.currentHand;
    var heroPos = handTracker.getHeroPosition();
    if (!heroPos) return null;

    var bigBlind = 0;
    if (hand.blinds && hand.blinds.bb > 0) {
      bigBlind = hand.blinds.bb;
    }

    // Find hero stack in chips
    var heroStackChips = 0;
    if (gameState.players) {
      for (var i = 0; i < gameState.players.length; i++) {
        var p = gameState.players[i];
        if (p.isOwner || p.seatIndex === gameState.heroSeatIndex) {
          heroStackChips = parseFloat(String(p.chips).replace(/[^0-9.]/g, '')) || 0;
          break;
        }
      }
    }

    return {
      heroPosition: heroPos,
      raisesCount: hand.phases.preflop.raisesCount || 0,
      toCall: gameState.toCallFallback || 0,
      tableSize: hand.players.length,
      bigBlind: bigBlind,
      heroActed: hasHeroActed(),
      openerPosition: getOpenerPosition(),
      activePlayers: handTracker.getActivePlayers(),
      heroStack: heroStackChips,
      heroStackBB: bigBlind > 0 ? heroStackChips / bigBlind : 100,
      limperCount: countLimpers()
    };
  }

  // Count players who called but didn't raise preflop (vpip=true, pfr=false, not hero)
  function countLimpers() {
    if (!handTracker.currentHand) return 0;
    var hand = handTracker.currentHand;
    var heroSeat = hand.heroSeatIndex;
    var count = 0;
    for (var i = 0; i < hand.players.length; i++) {
      var p = hand.players[i];
      if (p.seatIndex === heroSeat) continue;
      if (p.vpip && !p.pfr) count++;
    }
    return count;
  }

  // Find the position of the first player who raised preflop (not hero)
  function getOpenerPosition() {
    if (!handTracker.currentHand) return null;
    var hand = handTracker.currentHand;
    var heroSeat = hand.heroSeatIndex;

    for (var i = 0; i < hand.players.length; i++) {
      var p = hand.players[i];
      if (p.seatIndex === heroSeat) continue;
      if (p.pfr) return p.position;
    }
    return null;
  }

  // Check if hero has already acted in the current preflop
  function hasHeroActed() {
    if (!handTracker.currentHand) return false;
    var hand = handTracker.currentHand;
    var heroSeat = hand.heroSeatIndex;

    for (var i = 0; i < hand.players.length; i++) {
      var p = hand.players[i];
      if (p.seatIndex === heroSeat) {
        return p.actions.preflop && p.actions.preflop.length > 0;
      }
    }
    return false;
  }

  function getOpponentVpips() {
    if (!handTracker.currentHand || !statsEngine) return [];
    var hand = handTracker.currentHand;
    var vpips = [];
    for (var i = 0; i < hand.players.length; i++) {
      var p = hand.players[i];
      if (p.seatIndex === hand.heroSeatIndex || p.isFolded) continue;
      var stats = statsEngine.getDisplayStats(p.name);
      if (stats && stats.hands >= WPT.MIN_HANDS_FOR_DISPLAY) {
        var v = parseFloat(stats.vpip);
        vpips.push(isNaN(v) ? 0 : v);
      } else {
        vpips.push(0);
      }
    }
    return vpips;
  }

  function findHeroCards(gameState) {
    var heroCards = [];
    var heroSeat = gameState.heroSeatIndex;

    if (heroSeat >= 0) {
      for (var j = 0; j < gameState.players.length; j++) {
        if (gameState.players[j].seatIndex === heroSeat && gameState.players[j].cards.length > 0) {
          heroCards = gameState.players[j].cards;
          break;
        }
      }
    }
    if (heroCards.length === 0) {
      for (var k = 0; k < gameState.players.length; k++) {
        if (gameState.players[k].isOwner && gameState.players[k].cards.length > 0) {
          heroCards = gameState.players[k].cards;
          break;
        }
      }
    }
    if (heroCards.length === 0 && handTracker.currentHand && handTracker.currentHand.heroCards.length === 2) {
      heroCards = handTracker.currentHand.heroCards;
    }
    return heroCards;
  }

  function requestEquity(heroCards, communityCards, numOpponents) {
    var now = Date.now();
    // Throttle: at least 1 second between requests
    if (now - lastEquityRequestTime < 1000) return;
    lastEquityRequestTime = now;

    var oppVpips = getOpponentVpips();

    console.log('[WPT] Equity request: hero=' + heroCards.join(',') + ' board=' + (communityCards || []).join(',') + ' opp=' + numOpponents + ' vpips=[' + oppVpips.join(',') + ']');

    equityBridge.calculateEquity(heroCards, communityCards || [], numOpponents, oppVpips)
      .then(function(result) {
        if (result && !result.cancelled && !result.timedOut && result.equity !== '-') {
          console.log('[WPT] Equity result: ' + result.equity + '% (W:' + result.winPct + ' T:' + result.tiePct + ' L:' + result.lossPct + ' iters:' + result.iterations + ')');
          lastEquity = result;
          terminalUI.updateEquity(result);
        }
      })
      .catch(function(err) {
        console.error('[WPT] Equity error:', err);
      });
  }

  function postflopColor(categoryNum) {
    switch (categoryNum) {
      case 1: return '#ff00ff';
      case 2: return '#ff00ff';
      case 3: return '#00ff41';
      case 4: return '#00ff41';
      case 5: return '#88ff00';
      case 6: return '#88ff00';
      case 7: return '#ffff00';
      case 8: return '#ff8800';
      case 9: return '#ff4141';
      default: return '#888';
    }
  }

  window.addEventListener('beforeunload', function() {
    scraper.stop();
    equityBridge.destroy();
    terminalUI.destroy();
    storage.destroy();
  });

  if (document.readyState === 'complete') {
    setTimeout(init, 2000);
  } else {
    window.addEventListener('load', function() {
      setTimeout(init, 2000);
    });
  }

})();
