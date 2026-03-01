// ClubWPT Poker Terminal - Cocos2d Scene Graph Scraper
'use strict';

var CocosScraper = (function() {

  function CocosScraper() {
    this._listeners = {};
    this._lastState = null;
    this._lastStateJSON = '';
    this._pollTimer = null;
    this._gameMain = null;
    this._gameCtrl = null;
    this._seatPanel = null;
    this._room = null;
    this._ready = false;
    this._boardIntrospectDone = false;
    this._boardIntrospectCounter = 0;
  }

  // Event emitter
  CocosScraper.prototype.on = function(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  };

  CocosScraper.prototype.emit = function(event, data) {
    var fns = this._listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](data); } catch (e) { console.error('[WPT] Event handler error:', e); }
    }
  };

  // Initialize - find the Cocos scene graph nodes
  CocosScraper.prototype._initNodes = function() {
    try {
      if (typeof cc === 'undefined' || !cc.director) return false;
      var scene = cc.director.getScene();
      if (!scene) return false;

      var sceneNode = scene.getChildByName(WPT.PATHS.SCENE);
      if (!sceneNode) return false;

      this._gameMain = sceneNode.getChildByName(WPT.PATHS.GAME_MAIN);
      if (!this._gameMain) return false;

      this._gameCtrl = this._gameMain.getComponent('GameControl');
      this._seatPanel = this._gameMain.getChildByName(WPT.PATHS.SEAT_PANEL);

      if (this._gameCtrl && this._gameCtrl._pokerRoom) {
        this._room = this._gameCtrl._pokerRoom;
      }

      this._ready = !!(this._gameCtrl && this._seatPanel);
      return this._ready;
    } catch (e) {
      console.warn('[WPT] Init nodes failed:', e.message);
      return false;
    }
  };

  // Start polling
  CocosScraper.prototype.start = function() {
    var self = this;
    console.log('[WPT] Scraper starting...');

    // Try to init immediately, retry until ready (game may take a while to load)
    var initAttempts = 0;
    var initTimer = setInterval(function() {
      initAttempts++;
      if (self._initNodes()) {
        clearInterval(initTimer);
        console.log('[WPT] Scraper ready after ' + initAttempts + ' attempt(s). Starting poll at ' + WPT.POLL_INTERVAL + 'ms');
        self._startPolling();
      } else if (initAttempts % 30 === 0) {
        console.log('[WPT] Still waiting for Cocos game nodes... (' + initAttempts + ' attempts)');
      }
    }, 1000);
  };

  CocosScraper.prototype._startPolling = function() {
    var self = this;
    this._pollTimer = setInterval(function() {
      self._poll();
    }, WPT.POLL_INTERVAL);
    // Immediate first poll
    this._poll();
  };

  CocosScraper.prototype.stop = function() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  };

  // Main polling function
  CocosScraper.prototype._poll = function() {
    try {
      // Re-check nodes are still valid (scene can reload)
      if (!this._ready || !this._gameMain || !this._gameMain.isValid) {
        this._ready = false;
        this._initNodes();
        if (!this._ready) return;
      }

      var state = this.scrapeState();
      var stateJSON = JSON.stringify(state);

      if (stateJSON !== this._lastStateJSON) {
        this._lastState = state;
        this._lastStateJSON = stateJSON;
        this.emit('stateChange', state);
      }
    } catch (e) {
      console.warn('[WPT] Poll error:', e.message);
      // Try reinit on next poll
      this._ready = false;
    }
  };

  // Scrape full game state
  CocosScraper.prototype.scrapeState = function() {
    var state = {
      timestamp: Date.now(),
      players: this._scrapePlayers(),
      communityCards: this._scrapeCommunityCards(),
      pot: this._scrapePot(),
      blinds: this._scrapeBlinds(),
      handNum: this._scrapeHandNum(),
      dealerSeatIndex: this._scrapeDealerSeat(),
      heroSeatIndex: this._scrapeHeroSeat(),
      phase: 'unknown',
      actionState: this._scrapeActionState(),
    };

    // Derive phase from community card count
    var ccCount = state.communityCards.length;
    if (ccCount === 0) state.phase = 'preflop';
    else if (ccCount === 3) state.phase = 'flop';
    else if (ccCount === 4) state.phase = 'turn';
    else if (ccCount === 5) state.phase = 'river';

    return state;
  };

  // Get current state without re-polling
  CocosScraper.prototype.getLastState = function() {
    return this._lastState;
  };

  // Scrape all player seats
  CocosScraper.prototype._scrapePlayers = function() {
    var players = [];
    if (!this._seatPanel) return players;

    // Build tableStates lookup by seatid for reliable bet fallback
    var tableStateBySeat = {};
    try {
      if (this._room && this._room._roomData && this._room._roomData.pkTableStates) {
        var tsPlayers = this._room._roomData.pkTableStates.players;
        if (tsPlayers) {
          for (var tsi = 0; tsi < tsPlayers.length; tsi++) {
            if (tsPlayers[tsi] && typeof tsPlayers[tsi].seatid === 'number') {
              tableStateBySeat[tsPlayers[tsi].seatid] = tsPlayers[tsi];
            }
          }
        }
      }
    } catch(e) {}

    var seats = this._seatPanel.children;
    for (var i = 0; i < seats.length; i++) {
      var seatNode = seats[i];
      var seatComp = seatNode.getComponent('Seat');
      if (!seatComp) continue;

      var name = seatComp.roleName_text ? seatComp.roleName_text.string : '';
      var status = seatComp.status_text ? seatComp.status_text.string : '';

      // Scrape chip count - try multiple strategies
      var chips = '0';
      // Strategy 1: Direct label property on Seat component
      var chipLabelKeys = ['chouma_text', 'chips_text', 'chipText', 'balance_text',
        'stack_text', 'money_text', 'coin_text', 'gold_text', 'amount_text'];
      for (var ck = 0; ck < chipLabelKeys.length; ck++) {
        var cLabel = seatComp[chipLabelKeys[ck]];
        if (cLabel && cLabel.string) {
          var cv = parseFloat(cLabel.string.replace(/[^0-9.]/g, ''));
          if (cv > 0) { chips = cLabel.string; break; }
        }
      }
      // Strategy 2: Search known child node names for labels
      if (chips === '0') {
        var chipNodeNames = ['chouma', 'chips', 'chipNode', 'balance', 'stack',
          'money', 'coin', 'gold', 'amount', 'currencyValue', 'chipValue'];
        for (var cn = 0; cn < chipNodeNames.length; cn++) {
          var cNode = seatNode.getChildByName(chipNodeNames[cn]);
          if (cNode && cNode.active !== false) {
            var cLbl = cNode.getComponentInChildren ? cNode.getComponentInChildren('cc.Label') : null;
            if (!cLbl) cLbl = cNode.getComponent ? cNode.getComponent('cc.Label') : null;
            if (cLbl && cLbl.string) {
              var cv2 = parseFloat(cLbl.string.replace(/[^0-9.]/g, ''));
              if (cv2 > 0) { chips = cLbl.string; break; }
            }
          }
        }
      }
      // Strategy 3: CurrencyValueControl component (used for pot display)
      if (chips === '0') {
        try {
          var cvc = seatNode.getComponentInChildren ? seatNode.getComponentInChildren('CurrencyValueControl') : null;
          if (cvc) {
            // Try to find the value label inside
            var cvcNode = cvc.node || seatNode;
            var cvcLabels = cvcNode.getComponentsInChildren ? cvcNode.getComponentsInChildren('cc.Label') : [];
            for (var cvl = 0; cvl < cvcLabels.length; cvl++) {
              if (cvcLabels[cvl].string) {
                var cv3 = parseFloat(cvcLabels[cvl].string.replace(/[^0-9.]/g, ''));
                if (cv3 > 0) { chips = cvcLabels[cvl].string; break; }
              }
            }
          }
        } catch(e) {}
      }
      // Strategy 4: Scan ALL labels in the seat node, pick the one that looks like a chip count
      if (chips === '0') {
        try {
          var allLabels = seatNode.getComponentsInChildren ? seatNode.getComponentsInChildren('cc.Label') : [];
          for (var al = 0; al < allLabels.length; al++) {
            var alStr = allLabels[al].string;
            if (alStr && /^\s*[\d,.]+\s*$/.test(alStr)) {
              var av = parseFloat(alStr.replace(/[^0-9.]/g, ''));
              if (av > 0.001) { chips = alStr; break; }
            }
          }
        } catch(e) {}
      }

      // Clean up name (remove newlines from display wrapping)
      name = name.replace(/\n/g, '');

      // Try to scrape current round bet amount in front of player
      var currentBet = 0;
      try {
        var betTextKeys = ['xiazhu_text', 'bet_text', 'betLabel', 'betAmount_text', 'betChips_text', 'stake_text'];
        for (var bt = 0; bt < betTextKeys.length; bt++) {
          var btComp = seatComp[betTextKeys[bt]];
          if (btComp && btComp.string) {
            var bv = parseFloat(btComp.string.replace(/[^0-9.]/g, ''));
            if (bv > 0) { currentBet = bv; break; }
          }
        }
        if (currentBet === 0) {
          var betNodeNames = ['xiazhu', 'bet', 'betNode', 'bet_chips', 'chipBet', 'betAmount', 'stake'];
          for (var bn = 0; bn < betNodeNames.length; bn++) {
            var bNode = seatNode.getChildByName(betNodeNames[bn]);
            if (bNode && bNode.active !== false) {
              var bLabel = bNode.getComponentInChildren ? bNode.getComponentInChildren('cc.Label') : null;
              if (!bLabel) bLabel = bNode.getComponent ? bNode.getComponent('cc.Label') : null;
              if (bLabel && bLabel.string) {
                var bv2 = parseFloat(bLabel.string.replace(/[^0-9.]/g, ''));
                if (bv2 > 0) { currentBet = bv2; break; }
              }
            }
          }
        }
      } catch(e) {}
      // Fallback: use round_bet from pkTableStates (reliable game-internal data, in cents)
      if (currentBet === 0) {
        var tsSeat = tableStateBySeat[i];
        if (tsSeat && typeof tsSeat.round_bet === 'number' && tsSeat.round_bet > 0) {
          currentBet = tsSeat.round_bet / 100;
        }
      }

      var player = {
        seatIndex: i,
        name: name,
        chips: parseFloat(chips.replace(/[^0-9.]/g, '')) || 0,
        chipsDisplay: chips,
        status: status,
        normalizedAction: WPT.ACTION_MAP[status] || status.toLowerCase(),
        seatStatus: seatComp.seatStatus,
        isOwner: seatComp.bOwnerSeat || false,
        isEmpty: !name || name === 'Name' || seatComp.seatStatus === WPT.SEAT_STATUS.EMPTY,
        isFolded: status === 'FOLD' || status === 'Fold',
        isSittingOut: status === 'Sit Out' || status === 'Sitting Out',
        cards: this._scrapePlayerCards(seatNode),
        currentBet: currentBet,
        screenX: 0,
        screenY: 0,
      };

      // Get screen coordinates for HUD badge placement
      var worldPos = seatNode.convertToWorldSpaceAR(cc.v2(0, 0));
      if (worldPos) {
        var canvas = document.getElementById('GameCanvas');
        if (canvas) {
          var rect = canvas.getBoundingClientRect();
          var designW = cc.view.getDesignResolutionSize().width;
          var designH = cc.view.getDesignResolutionSize().height;
          var scaleX = rect.width / designW;
          var scaleY = rect.height / designH;
          player.screenX = rect.left + worldPos.x * scaleX;
          player.screenY = rect.top + (designH - worldPos.y) * scaleY;
        }
      }

      players.push(player);
    }

    return players;
  };

  // Scrape hole cards for a seat
  CocosScraper.prototype._scrapePlayerCards = function(seatNode) {
    var cards = [];
    try {
      // Try multiple child names for the card container
      var pcc = seatNode.getChildByName('playerCardControl')
             || seatNode.getChildByName('PlayerCardControl')
             || seatNode.getChildByName('cardControl')
             || seatNode.getChildByName('card_control');

      if (!pcc) {
        // Search all children for a component that has _pkCards
        var children = seatNode.children || [];
        for (var c = 0; c < children.length; c++) {
          var comps = children[c]._components || [];
          for (var cc2 = 0; cc2 < comps.length; cc2++) {
            if (comps[cc2] && comps[cc2]._pkCards) {
              pcc = children[c];
              break;
            }
          }
          if (pcc) break;
        }
      }

      if (!pcc) return cards;

      // Try to get PlayerCardControl component
      var cardCtrl = pcc.getComponent('PlayerCardControl')
                  || pcc.getComponent('playerCardControl');

      // Fallback: search components for one with _pkCards
      if (!cardCtrl || !cardCtrl._pkCards) {
        var comps2 = pcc._components || [];
        for (var cc3 = 0; cc3 < comps2.length; cc3++) {
          if (comps2[cc3] && comps2[cc3]._pkCards) {
            cardCtrl = comps2[cc3];
            break;
          }
        }
      }

      if (!cardCtrl || !cardCtrl._pkCards) return cards;

      // Debug: collect per-card raw data for hero
      var seatComp = seatNode.getComponent('Seat');
      var isHero = seatComp && seatComp.bOwnerSeat;
      var debugParts = [];

      for (var i = 0; i < cardCtrl._pkCards.length; i++) {
        var card = cardCtrl._pkCards[i];
        if (!card) continue;

        if (isHero) {
          // Collect key properties for debug display
          debugParts.push('c' + i + '={num:' + card.eCardNum + ',suit:' + card.eCardSuit + ',has:' + card._hasContent + '}');
        }

        // Check for content - handle zero values properly
        var hasContent = card._hasContent === true || card._hasContent === 1;

        // Fallback: if eCardNum is a valid number (including 0), treat as having content
        if (!hasContent && typeof card.eCardNum === 'number' && card.eCardNum >= 0 &&
            typeof card.eCardSuit === 'number' && card.eCardSuit >= 0) {
          hasContent = true;
        }

        if (hasContent) {
          var num = typeof card.eCardNum === 'number' ? card.eCardNum : (card.cardNum || card._cardNum || 0);
          var suit = typeof card.eCardSuit === 'number' ? card.eCardSuit : (card.cardSuit || card._cardSuit || 0);

          var notation = CardUtils.fromCocos(num, suit);
          if (notation) cards.push(notation);
        }
      }

      if (isHero) {
        this._lastCardDebug = debugParts.join(' | ');
      }
    } catch (e) {
      console.warn('[WPT] Card scrape error:', e.message);
    }
    return cards;
  };

  // Scrape community cards - comprehensive multi-strategy approach
  CocosScraper.prototype._scrapeCommunityCards = function() {
    var cards = [];
    var debugParts = [];
    try {

      // ═══════════════════════════════════════════════════════
      // Strategy 1: DEEP INTROSPECT key board panels
      // Previous debug showed TableCenter→publicCard_panel nodes exist but
      // Card component returns null. This strategy goes deeper:
      // checks ALL component types, sprite frame names, node properties, etc.
      // ═══════════════════════════════════════════════════════
      var targetNames = ['card_panel', 'gaopai', 'TableCenter', 'table_center'];
      for (var ti = 0; ti < targetNames.length; ti++) {
        var target = this._gameMain.getChildByName(targetNames[ti]);
        if (!target) continue;

        var kids = target.children || [];
        if (kids.length === 0) continue;
        debugParts.push(targetNames[ti] + ':kids=' + kids.length);

        // Scan up to 3 levels deep — use strictHasContent=true for community cards
        // This prevents picking up stale eCardNum values from previous hand
        for (var ki = 0; ki < kids.length; ki++) {
          var kid = kids[ki];
          var foundCard = this._extractCardDeep(kid, targetNames[ti] + '/' + kid.name, debugParts, true);
          if (foundCard) {
            cards.push(foundCard);
          }
          // Grandchildren (level 2)
          var gkids = kid.children || [];
          for (var gki = 0; gki < gkids.length; gki++) {
            var gkid = gkids[gki];
            var gfound = this._extractCardDeep(gkid, targetNames[ti] + '/' + kid.name + '/' + gkid.name, debugParts, true);
            if (gfound) {
              cards.push(gfound);
            }
            // Great-grandchildren (level 3)
            var ggkids = gkid.children || [];
            for (var ggki = 0; ggki < ggkids.length; ggki++) {
              var ggkid = ggkids[ggki];
              var ggfound = this._extractCardDeep(ggkid, kid.name + '/' + gkid.name + '/' + ggkid.name, debugParts, true);
              if (ggfound) {
                cards.push(ggfound);
              }
            }
          }
        }

        if (cards.length > 0) {
          this._lastBoardDebug = 'SRC:' + targetNames[ti] + ' | ' + debugParts.join(' | ');
          return cards;
        }
      }

      // ═══════════════════════════════════════════════════════
      // Strategy 2: Check GameControl for card-related properties
      // Look for arrays, nodes with children, or objects with card data
      // ═══════════════════════════════════════════════════════
      var gc = this._gameCtrl;
      if (gc) {
        // First: look for common property names that might hold community cards
        var boardPropNames = [
          'publicCards', '_publicCards', 'communityCards', '_communityCards',
          'boardCards', '_boardCards', 'tableCards', '_tableCards',
          'commonCards', '_commonCards', 'publicCardArr', '_publicCardArr',
          'cardArr', '_cardArr', 'flopCards', 'cards'
        ];
        for (var bpi = 0; bpi < boardPropNames.length; bpi++) {
          var bpv = gc[boardPropNames[bpi]];
          if (bpv) {
            var extracted = this._extractCardsFromValue(bpv, 'gc.' + boardPropNames[bpi], debugParts);
            if (extracted.length > 0) {
              cards = extracted;
              this._lastBoardDebug = 'SRC:gc.' + boardPropNames[bpi] + ' | ' + debugParts.join(' | ');
              return cards;
            }
          }
        }

        // General scan of GameControl properties
        for (var gk in gc) {
          try {
            var gv = gc[gk];
            var extracted2 = this._extractCardsFromValue(gv, 'gc.' + gk, debugParts);
            if (extracted2.length > 0) {
              cards = extracted2;
              this._lastBoardDebug = 'SRC:gc.' + gk + ' | ' + debugParts.join(' | ');
              return cards;
            }
          } catch (e2) { /* skip */ }
        }
      }

      // ═══════════════════════════════════════════════════════
      // Strategy 3: Deep scan ALL gameMain descendants (3 levels)
      // Skip seatPanel (those are player cards)
      // ═══════════════════════════════════════════════════════
      var gmChildren = this._gameMain.children || [];
      var childNames = [];
      for (var mi = 0; mi < gmChildren.length; mi++) {
        var child = gmChildren[mi];
        childNames.push(child.name + '(' + (child.children ? child.children.length : 0) + ')');
        if (child.name === 'seatPanel') continue;

        var subKids = child.children || [];
        for (var ski = 0; ski < subKids.length; ski++) {
          var skFound = this._extractCardDeep(subKids[ski], child.name + '/' + subKids[ski].name, debugParts, true);
          if (skFound) cards.push(skFound);

          // Level 3
          var subSubKids = subKids[ski].children || [];
          for (var sski = 0; sski < subSubKids.length; sski++) {
            var sskFound = this._extractCardDeep(subSubKids[sski], child.name + '/' + subKids[ski].name + '/' + subSubKids[sski].name, debugParts, true);
            if (sskFound) cards.push(sskFound);
          }
        }
      }
      if (cards.length > 0) {
        this._lastBoardDebug = 'SRC:deepScan | ' + debugParts.join(' | ');
        return cards;
      }

      debugParts.push('gameKids=[' + childNames.join(',') + ']');

      // ═══════════════════════════════════════════════════════
      // Strategy 4: Check _roomData for card arrays
      // Cards might be stored as raw integers (encoded card values)
      // ═══════════════════════════════════════════════════════
      if (this._room && this._room._roomData) {
        var rd = this._room._roomData;
        for (var rk in rd) {
          var rv = rd[rk];
          if (Array.isArray(rv) && rv.length > 0 && rv.length <= 5 && typeof rv[0] === 'number') {
            debugParts.push('rd.' + rk + '=[' + rv.join(',') + ']');
            // Try to decode if values look like card encodings
            var decoded = this._tryDecodeCardArray(rv);
            if (decoded.length > 0) {
              cards = decoded;
              this._lastBoardDebug = 'SRC:rd.' + rk + ' | ' + debugParts.join(' | ');
              return cards;
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════
      // Strategy 5: Check _gameSession and _pokerRoom
      // ═══════════════════════════════════════════════════════
      var roomTargets = [];
      if (this._room) {
        roomTargets.push({ obj: this._room, prefix: 'room' });
        if (this._room._gameSession) roomTargets.push({ obj: this._room._gameSession, prefix: 'session' });
      }
      for (var rti = 0; rti < roomTargets.length; rti++) {
        var rtObj = roomTargets[rti].obj;
        var rtPfx = roomTargets[rti].prefix;
        for (var sk in rtObj) {
          try {
            var sv = rtObj[sk];
            if (Array.isArray(sv) && sv.length > 0 && sv.length <= 5) {
              if (typeof sv[0] === 'number') {
                debugParts.push(rtPfx + '.' + sk + '=[' + sv.join(',') + ']');
                var decoded2 = this._tryDecodeCardArray(sv);
                if (decoded2.length > 0) {
                  cards = decoded2;
                  this._lastBoardDebug = 'SRC:' + rtPfx + '.' + sk + ' | ' + debugParts.join(' | ');
                  return cards;
                }
              } else if (sv[0] && typeof sv[0] === 'object') {
                var extracted3 = this._extractCardsFromValue(sv, rtPfx + '.' + sk, debugParts);
                if (extracted3.length > 0) {
                  cards = extracted3;
                  this._lastBoardDebug = 'SRC:' + rtPfx + '.' + sk + ' | ' + debugParts.join(' | ');
                  return cards;
                }
              }
            }
          } catch (e3) { /* skip */ }
        }
      }

      // ═══════════════════════════════════════════════════════
      // Strategy 6: INTROSPECT MODE - One-time deep dump of TableCenter
      // This runs periodically to discover the actual structure
      // ═══════════════════════════════════════════════════════
      if (!this._boardIntrospectDone || this._boardIntrospectCounter++ % 20 === 0) {
        var tc = this._gameMain.getChildByName('TableCenter');
        if (tc) {
          var introspect = this._introspectNode(tc, 'TC', 3);
          if (introspect.length > 0) {
            debugParts.push('INTROSPECT:' + introspect.join('|'));
          }
        }
        // Also check gaopai
        var gp = this._gameMain.getChildByName('gaopai');
        if (gp) {
          var gpIntro = this._introspectNode(gp, 'GP', 3);
          if (gpIntro.length > 0) {
            debugParts.push('GP_INTRO:' + gpIntro.join('|'));
          }
        }
      }

    } catch (e) {
      debugParts.push('err:' + e.message);
    }
    this._lastBoardDebug = debugParts.join(' | ');
    return cards;
  };

  // Deep card extraction: checks ALL component properties, sprite names, etc.
  // strictHasContent: if true, requires _hasContent to be true (use for community cards to avoid stale data)
  CocosScraper.prototype._extractCardDeep = function(node, path, debugParts, strictHasContent) {
    if (!node || node.active === false) return null;
    var comps = node._components || [];

    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      if (!c) continue;

      // Method 1: Standard eCardNum/eCardSuit
      if (c.eCardNum !== undefined || c.eCardSuit !== undefined) {
        var has = c._hasContent === true || c._hasContent === 1;
        // In non-strict mode, treat any valid eCardNum as having content
        if (!strictHasContent && !has && typeof c.eCardNum === 'number' && c.eCardNum >= 0) {
          has = true;
        }
        var notation = has ? CardUtils.fromCocos(c.eCardNum, c.eCardSuit) : null;
        // Always log what we find for debugging, even if filtered
        if (typeof c.eCardNum === 'number') {
          debugParts.push(path + '=eCard(' + c.eCardNum + ',' + c.eCardSuit + ',has:' + c._hasContent + ')→' + (notation || 'FILTERED'));
        }
        if (notation) {
          return notation;
        }
      }

      // Method 2: Check for cardNum/cardSuit/_cardNum/_cardSuit variants
      var altProps = [
        ['cardNum', 'cardSuit'], ['_cardNum', '_cardSuit'],
        ['cardValue', 'cardSuit'], ['_cardValue', '_cardSuit'],
        ['num', 'suit'], ['_num', '_suit'],
        ['value', 'suit'], ['_value', '_suit'],
        ['rank', 'suit'], ['_rank', '_suit'],
        ['card_num', 'card_suit'], ['card_value', 'card_suit'],
        ['eNum', 'eSuit'], ['_eNum', '_eSuit'],
      ];
      for (var ap = 0; ap < altProps.length; ap++) {
        var numProp = altProps[ap][0];
        var suitProp = altProps[ap][1];
        if (typeof c[numProp] === 'number' && typeof c[suitProp] === 'number') {
          var n2 = CardUtils.fromCocos(c[numProp], c[suitProp]);
          if (n2) {
            debugParts.push(path + '=' + numProp + '(' + c[numProp] + ',' + c[suitProp] + ')→' + n2);
            return n2;
          }
        }
      }

      // Method 3: Check for sprite frame name that encodes a card
      // e.g., "card_Ah", "poker_As", "Spade_A", "hearts_10", "13_4" etc.
      try {
        var sprite = c.spriteFrame || c._spriteFrame;
        if (!sprite && c.getComponent) {
          var sprComp = node.getComponent('cc.Sprite');
          if (sprComp) sprite = sprComp.spriteFrame || sprComp._spriteFrame;
        }
        if (sprite) {
          var frameName = sprite.name || sprite._name || '';
          if (frameName && frameName.length > 0) {
            var parsed = this._parseCardFromSpriteName(frameName);
            if (parsed) {
              debugParts.push(path + '=sprite("' + frameName + '")→' + parsed);
              return parsed;
            }
          }
        }
      } catch (e) { /* skip */ }

      // Method 4: Check for a _cardData or cardData object property
      var dataProps = ['_cardData', 'cardData', '_data', 'data', '_card', 'card'];
      for (var dp = 0; dp < dataProps.length; dp++) {
        var dv = c[dataProps[dp]];
        if (dv && typeof dv === 'object') {
          // Check for num/suit in the data object
          for (var ap2 = 0; ap2 < altProps.length; ap2++) {
            var np2 = altProps[ap2][0];
            var sp2 = altProps[ap2][1];
            if (typeof dv[np2] === 'number' && typeof dv[sp2] === 'number') {
              var n3 = CardUtils.fromCocos(dv[np2], dv[sp2]);
              if (n3) {
                debugParts.push(path + '=' + dataProps[dp] + '.' + np2 + '(' + dv[np2] + ',' + dv[sp2] + ')→' + n3);
                return n3;
              }
            }
          }
          if (typeof dv.eCardNum === 'number') {
            var n4 = CardUtils.fromCocos(dv.eCardNum, dv.eCardSuit);
            if (n4) {
              debugParts.push(path + '=' + dataProps[dp] + '.eCard(' + dv.eCardNum + ',' + dv.eCardSuit + ')→' + n4);
              return n4;
            }
          }
        }
      }
    }

    // Method 5: Check node-level properties (not on components)
    if (typeof node.eCardNum === 'number' && typeof node.eCardSuit === 'number') {
      var n5 = CardUtils.fromCocos(node.eCardNum, node.eCardSuit);
      if (n5) {
        debugParts.push(path + '=node.eCard(' + node.eCardNum + ',' + node.eCardSuit + ')→' + n5);
        return n5;
      }
    }

    // Method 6: Check sprite on the node directly
    try {
      var directSprite = node.getComponent && node.getComponent('cc.Sprite');
      if (directSprite) {
        var sf = directSprite.spriteFrame || directSprite._spriteFrame;
        if (sf) {
          var sfName = sf.name || sf._name || '';
          if (sfName) {
            var parsed2 = this._parseCardFromSpriteName(sfName);
            if (parsed2) {
              debugParts.push(path + '=nodeSprite("' + sfName + '")→' + parsed2);
              return parsed2;
            }
          }
        }
      }
    } catch (e) { /* skip */ }

    return null;
  };

  // Parse card notation from a sprite frame name
  // Common patterns: "card_Ah", "poker_10h", "Spade_A", "hearts_10", "13_4", "card_13_4"
  CocosScraper.prototype._parseCardFromSpriteName = function(name) {
    if (!name || name.length < 2) return null;
    name = String(name);

    // Skip generic/back sprites
    if (name.indexOf('back') >= 0 || name.indexOf('Back') >= 0) return null;
    if (name.indexOf('bg') >= 0 || name.indexOf('empty') >= 0) return null;

    // Pattern: ends with standard notation like "Ah", "Ts", "2c"
    var stdMatch = name.match(/([2-9TJQKA])([shdc])$/i);
    if (stdMatch) {
      var r = stdMatch[1].toUpperCase();
      var s = stdMatch[2].toLowerCase();
      if ('shdc'.indexOf(s) >= 0 && '23456789TJQKA'.indexOf(r) >= 0) {
        return r + s;
      }
    }

    // Pattern: "num_suit" where num = 0-12, suit = 0-3 (Cocos encoding)
    var numMatch = name.match(/(\d+)[_\-](\d+)/);
    if (numMatch) {
      var cardNum = parseInt(numMatch[1]);
      var cardSuit = parseInt(numMatch[2]);
      if (cardNum >= 0 && cardNum <= 12 && cardSuit >= 0 && cardSuit <= 3) {
        var n = CardUtils.fromCocos(cardNum, cardSuit);
        if (n) return n;
      }
      // Try reversed: suit_num
      if (cardSuit >= 0 && cardSuit <= 12 && cardNum >= 0 && cardNum <= 3) {
        var n2 = CardUtils.fromCocos(cardSuit, cardNum);
        if (n2) return n2;
      }
    }

    // Pattern: suit name + rank (e.g., "Spade_A", "hearts_10", "diamond_K")
    var suitNameMatch = name.match(/(spade|heart|diamond|club)s?[_\-]?([2-9]|10|[AJQK])/i);
    if (suitNameMatch) {
      var suitName = suitNameMatch[1].toLowerCase();
      var rankStr = suitNameMatch[2];
      var suitChar = suitName[0] === 's' ? 's' : suitName[0] === 'h' ? 'h' : suitName[0] === 'd' ? 'd' : 'c';
      var rankChar = rankStr === '10' ? 'T' : rankStr.toUpperCase();
      if ('23456789TJQKA'.indexOf(rankChar) >= 0) {
        return rankChar + suitChar;
      }
    }

    // Pattern: "poker_" + some encoded card
    var pokerMatch = name.match(/poker[_\-](\d+)[_\-](\d+)/i);
    if (pokerMatch) {
      var pNum = parseInt(pokerMatch[1]);
      var pSuit = parseInt(pokerMatch[2]);
      var pn = CardUtils.fromCocos(pNum, pSuit);
      if (pn) return pn;
    }

    return null;
  };

  // Extract cards from a value (array of card objects, array of nodes, etc.)
  CocosScraper.prototype._extractCardsFromValue = function(val, label, debugParts) {
    var cards = [];
    if (!val) return cards;

    // Array of card-like objects
    if (Array.isArray(val) && val.length > 0 && val.length <= 5) {
      for (var i = 0; i < val.length; i++) {
        var item = val[i];
        if (!item) continue;

        // Object with eCardNum
        if (typeof item === 'object') {
          if (typeof item.eCardNum === 'number') {
            var n = CardUtils.fromCocos(item.eCardNum, item.eCardSuit);
            if (n) {
              cards.push(n);
              debugParts.push(label + '[' + i + ']=eCard(' + item.eCardNum + ',' + item.eCardSuit + ')→' + n);
            }
          }
          // Node with components
          if (item._components || item.getComponent) {
            var nfound = this._extractCardDeep(item, label + '[' + i + ']', debugParts);
            if (nfound) cards.push(nfound);
          }
        }
      }
    }
    // Single node with children
    if (val.children && val.children.length > 0 && val.children.length <= 8) {
      for (var ci = 0; ci < val.children.length; ci++) {
        var cfound = this._extractCardDeep(val.children[ci], label + '/' + (val.children[ci].name || ci), debugParts);
        if (cfound) cards.push(cfound);
      }
    }
    return cards;
  };

  // Try to decode an array of integers as card values
  // Common encodings: single int = rank*4+suit, or rank*10+suit, etc.
  CocosScraper.prototype._tryDecodeCardArray = function(arr) {
    var cards = [];
    // Encoding 1: value = rank * 4 + suit (0-51)
    var all51 = arr.every(function(v) { return v >= 0 && v <= 51; });
    if (all51) {
      for (var i = 0; i < arr.length; i++) {
        var rank = Math.floor(arr[i] / 4);
        var suit = arr[i] % 4;
        var n = CardUtils.fromCocos(rank, suit);
        if (n) cards.push(n);
      }
      if (cards.length === arr.length) return cards;
      cards = [];
    }
    // Encoding 2: value = suit * 13 + rank (0-51)
    if (all51) {
      for (var j = 0; j < arr.length; j++) {
        var suit2 = Math.floor(arr[j] / 13);
        var rank2 = arr[j] % 13;
        var n2 = CardUtils.fromCocos(rank2, suit2);
        if (n2) cards.push(n2);
      }
      if (cards.length === arr.length) return cards;
      cards = [];
    }
    // Encoding 3: two-digit number where tens = suit, ones = rank (e.g., 12 = suit1 rank2)
    var allTwoDigit = arr.every(function(v) { return v >= 0 && v <= 49; });
    if (allTwoDigit) {
      for (var k = 0; k < arr.length; k++) {
        var s3 = Math.floor(arr[k] / 13);
        var r3 = arr[k] % 13;
        var n3 = CardUtils.fromCocos(r3, s3);
        if (n3) cards.push(n3);
      }
      if (cards.length === arr.length) return cards;
    }
    return [];
  };

  // Introspect a node tree and report what we find (for debugging unknown structures)
  CocosScraper.prototype._introspectNode = function(node, prefix, maxDepth) {
    if (!node || maxDepth <= 0) return [];
    var results = [];
    var name = node.name || '?';

    // Report active state and component types
    var compTypes = [];
    var comps = node._components || [];
    for (var i = 0; i < comps.length; i++) {
      if (!comps[i]) continue;
      var cType = comps[i].__classname__ || comps[i].constructor.name || '?';
      compTypes.push(cType);

      // Report any numeric properties that could be card data
      var numProps = [];
      for (var pk in comps[i]) {
        try {
          if (typeof comps[i][pk] === 'number' && pk[0] !== '_' && pk !== 'node' && pk !== '__instanceId') {
            numProps.push(pk + ':' + comps[i][pk]);
          }
        } catch (e) { /* skip */ }
      }
      if (numProps.length > 0 && numProps.length < 15) {
        results.push(prefix + '/' + name + '[' + cType + ']={' + numProps.join(',') + '}');
      }

      // Check for sprite frame name
      try {
        var sf = comps[i].spriteFrame || comps[i]._spriteFrame;
        if (sf) {
          var sfName = sf.name || sf._name || '';
          if (sfName) results.push(prefix + '/' + name + '.sprite="' + sfName + '"');
        }
      } catch (e) { /* skip */ }
    }

    if (compTypes.length > 0) {
      results.push(prefix + '/' + name + ':comps=[' + compTypes.join(',') + ']' + (node.active ? '' : '(inactive)'));
    }

    // Recurse into children
    var children = node.children || [];
    for (var ci = 0; ci < children.length; ci++) {
      var childResults = this._introspectNode(children[ci], prefix + '/' + name, maxDepth - 1);
      for (var ri = 0; ri < childResults.length; ri++) {
        results.push(childResults[ri]);
      }
    }

    return results;
  };

  // Helper: extract card data from a node (check all its components)
  CocosScraper.prototype._extractCardFromNode = function(node) {
    if (!node) return null;
    var comps = node._components || [];
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      if (!c) continue;
      if (c.eCardNum !== undefined || c.eCardSuit !== undefined) {
        var has = c._hasContent === true || c._hasContent === 1;
        if (!has && typeof c.eCardNum === 'number' && c.eCardNum >= 0 && node.active !== false) {
          has = true;
        }
        var notation = has ? CardUtils.fromCocos(c.eCardNum, c.eCardSuit) : null;
        return { notation: notation, num: c.eCardNum, suit: c.eCardSuit, has: c._hasContent, active: node.active };
      }
    }
    return null;
  };

  // Scrape pot amount
  CocosScraper.prototype._scrapePot = function() {
    var pot = 0;
    try {
      // Strategy 1: Main pool label
      if (this._gameCtrl && this._gameCtrl.mainpool) {
        var label = this._gameCtrl.mainpool.getComponentInChildren
          ? this._gameCtrl.mainpool.getComponentInChildren('cc.Label')
          : null;
        if (label) {
          pot = parseFloat(label.string.replace(/[^0-9.]/g, '')) || 0;
        }
      }
      // Strategy 1b: potNode/potValue label in TableCenter
      if (pot === 0) {
        var tc = this._gameMain.getChildByName('TableCenter');
        if (tc) {
          var potNode = tc.getChildByName('potNode');
          if (potNode) {
            var potValueNode = potNode.getChildByName('potValue');
            if (potValueNode) {
              var pvLabel = potValueNode.getComponent ? potValueNode.getComponent('cc.Label') : null;
              if (pvLabel && pvLabel.string) {
                pot = parseFloat(pvLabel.string.replace(/[^0-9.]/g, '')) || 0;
              }
            }
          }
        }
      }
      // Strategy 2: Check GameControl pot properties
      if (pot === 0 && this._gameCtrl) {
        var potProps = ['_pot', 'pot', '_totalPot', 'totalPot', '_mainPot', 'mainPotVal', '_poolValue'];
        for (var pp = 0; pp < potProps.length; pp++) {
          var pv = this._gameCtrl[potProps[pp]];
          if (typeof pv === 'number' && pv > 0) { pot = pv; break; }
        }
      }
      // Strategy 3: Check room data
      if (pot === 0 && this._room && this._room._roomData) {
        var rd = this._room._roomData;
        if (typeof rd.pot === 'number' && rd.pot > 0) pot = rd.pot;
        else if (typeof rd.totalPot === 'number' && rd.totalPot > 0) pot = rd.totalPot;
        else if (typeof rd.mainPot === 'number' && rd.mainPot > 0) pot = rd.mainPot;
      }
      // Strategy 4: Check for side pot nodes
      if (this._gameCtrl && this._gameCtrl.sidepool) {
        try {
          var sideLabel = this._gameCtrl.sidepool.getComponentInChildren
            ? this._gameCtrl.sidepool.getComponentInChildren('cc.Label')
            : null;
          if (sideLabel) {
            var sidePot = parseFloat(sideLabel.string.replace(/[^0-9.]/g, '')) || 0;
            pot += sidePot;
          }
        } catch(e2) {}
      }
    } catch (e) {}
    return pot;
  };

  // Scrape blinds
  CocosScraper.prototype._scrapeBlinds = function() {
    try {
      if (this._gameCtrl && this._gameCtrl.blindInfoLabel) {
        var text = this._gameCtrl.blindInfoLabel.string;
        var parts = text.split('/');
        return {
          text: text,
          sb: parseFloat(parts[0]) || 0,
          bb: parseFloat(parts[1]) || 0,
        };
      }
    } catch (e) {}
    return { text: '?/?', sb: 0, bb: 0 };
  };

  // One-time dump of _roomData properties (for discovering buy-in, hand number, etc.)
  CocosScraper.prototype.dumpRoomData = function() {
    var result = {};
    try {
      if (this._room && this._room._roomData) {
        var rd = this._room._roomData;
        for (var k in rd) {
          try {
            var v = rd[k];
            if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
              result[k] = v;
            } else if (Array.isArray(v)) {
              result[k] = '[Array(' + v.length + ')]';
            } else if (v && typeof v === 'object') {
              result[k] = '[Object]';
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
    return result;
  };

  // Try to scrape the buy-in / initial stack amount
  CocosScraper.prototype.scrapeBuyIn = function() {
    try {
      if (this._room && this._room._roomData) {
        var rd = this._room._roomData;
        var props = ['buyIn', 'i32BuyIn', 'initChips', 'i32InitChips', 'startChips',
          'initialStack', 'buyInAmount', 'nBuyIn', 'buy_in', 'init_chips',
          'defaultBuyIn', 'i32DefaultBuyIn', 'chipsBuyIn', 'maxBuyIn'];
        for (var i = 0; i < props.length; i++) {
          var v = rd[props[i]];
          if (typeof v === 'number' && v > 0) return v;
        }
      }
    } catch(e) {}
    return 0;
  };

  // Scrape hand number
  CocosScraper.prototype._scrapeHandNum = function() {
    try {
      if (this._room && this._room._roomData) {
        var rd = this._room._roomData;
        // Try multiple property names (game uses i32 prefix convention, e.g. i32SelfSeat)
        var hn = rd.handNum || rd.i32HandNum || rd.handId || rd.i32HandId ||
                 rd.gameNum || rd.i32GameNum || rd.roundNum || rd.nHandNum ||
                 rd.hand_num || rd.game_num || 0;
        return hn;
      }
    } catch (e) {}
    return 0;
  };

  // Scrape hero seat index
  CocosScraper.prototype._scrapeHeroSeat = function() {
    try {
      if (this._room && this._room._roomData) {
        return this._room._roomData.i32SelfSeat;
      }
    } catch (e) {}
    // Fallback: find seat with bOwnerSeat
    if (this._seatPanel) {
      var seats = this._seatPanel.children;
      for (var i = 0; i < seats.length; i++) {
        var comp = seats[i].getComponent('Seat');
        if (comp && comp.bOwnerSeat) return i;
      }
    }
    return -1;
  };

  // Scrape dealer button position (map D_img position to nearest seat)
  CocosScraper.prototype._scrapeDealerSeat = function() {
    try {
      var dImg = this._gameCtrl.D_img;
      if (!dImg || !dImg.active) return -1;

      var dPos = dImg.convertToWorldSpaceAR(cc.v2(0, 0));
      var minDist = Infinity;
      var closestSeat = -1;

      var seats = this._seatPanel.children;
      for (var i = 0; i < seats.length; i++) {
        var seatComp = seats[i].getComponent('Seat');
        if (!seatComp || seatComp.seatStatus === WPT.SEAT_STATUS.EMPTY) continue;
        var name = seatComp.roleName_text ? seatComp.roleName_text.string : '';
        if (!name || name === 'Name') continue;

        var sPos = seats[i].convertToWorldSpaceAR(cc.v2(0, 0));
        var dx = dPos.x - sPos.x;
        var dy = dPos.y - sPos.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          closestSeat = i;
        }
      }
      return closestSeat;
    } catch (e) {}
    return -1;
  };

  // Scrape action button state
  CocosScraper.prototype._scrapeActionState = function() {
    try {
      var abc = this._gameCtrl.actionBtnControl;
      if (!abc) return { active: false };

      var isActive = abc.actionBtnRoot && abc.actionBtnRoot.active;
      var result = {
        active: isActive,
        raiseLabel: '',
        callAmount: '',
        raiseAmount: '',
      };

      if (isActive) {
        if (abc.actionRaiseOrBetTitle) result.raiseLabel = abc.actionRaiseOrBetTitle.string;
        if (abc.actionCallAmount) {
          var callLabel = abc.actionCallAmount.getComponent
            ? abc.actionCallAmount.getComponent('cc.Label')
            : null;
          if (callLabel) result.callAmount = callLabel.string;
        }
        if (abc.actionRaiseOrBetAmount) {
          var raiseLabel = abc.actionRaiseOrBetAmount.getComponent
            ? abc.actionRaiseOrBetAmount.getComponent('cc.Label')
            : null;
          if (raiseLabel) result.raiseAmount = raiseLabel.string;
        }
      }

      return result;
    } catch (e) {}
    return { active: false };
  };

  return CocosScraper;

})();

window.CocosScraper = CocosScraper;
