// ClubWPT Poker Terminal - Floating HUD Panel (Glassmorphism)
'use strict';

var TerminalUI = (function() {

  var BRIDGE_ID = 'wpt-bridge';
  var MAIN_ID = 'wpt-main';
  var STORAGE_KEY = 'wpt_hud_prefs';

  // Default preferences
  var DEFAULTS = {
    x: -1, y: 16, w: 380, collapsed: false,
    sections: { session: false, info: false, debug: false },
  };

  // ============================================================
  // PANEL CSS (injected into shadow root)
  // ============================================================
  var PANEL_CSS = '\
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\
    :host { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1.4; color: #e2e8f0; }\
    \
    #hud-panel {\
      position: fixed;\
      top: 16px;\
      right: 16px;\
      width: 380px;\
      max-height: calc(100vh - 32px);\
      background: rgba(12, 12, 16, 0.92);\
      backdrop-filter: blur(16px);\
      -webkit-backdrop-filter: blur(16px);\
      border: 1px solid rgba(255, 255, 255, 0.1);\
      border-radius: 10px;\
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;\
      display: flex;\
      flex-direction: column;\
      overflow: hidden;\
      pointer-events: auto;\
      z-index: 1;\
      min-width: 320px;\
      max-width: 560px;\
    }\
    #hud-panel.hidden { display: none; }\
    \
    /* ===== HEADER (drag handle) ===== */\
    .hud-header {\
      display: flex;\
      align-items: center;\
      gap: 8px;\
      padding: 8px 12px;\
      background: rgba(255, 255, 255, 0.04);\
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);\
      cursor: grab;\
      user-select: none;\
      flex-shrink: 0;\
    }\
    .hud-header:active { cursor: grabbing; }\
    .hud-title { font-weight: 700; font-size: 13px; letter-spacing: 0.5px; color: #e2e8f0; }\
    .hud-status {\
      font-size: 10px;\
      padding: 2px 7px;\
      border-radius: 10px;\
      font-weight: 600;\
      letter-spacing: 0.3px;\
    }\
    .hud-status.live { background: rgba(34, 197, 94, 0.2); color: #22c55e; }\
    .hud-status.scanning { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }\
    .hud-collapse-btn {\
      margin-left: auto;\
      width: 24px;\
      height: 24px;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      border-radius: 6px;\
      cursor: pointer;\
      color: #64748b;\
      font-size: 18px;\
      line-height: 1;\
      transition: background 0.15s, color 0.15s;\
    }\
    .hud-collapse-btn:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }\
    \
    /* ===== BODY (scrollable) ===== */\
    .hud-body {\
      padding: 8px;\
      overflow-y: auto;\
      overflow-x: hidden;\
      flex: 1;\
      display: flex;\
      flex-direction: column;\
      gap: 8px;\
    }\
    .hud-body::-webkit-scrollbar { width: 4px; }\
    .hud-body::-webkit-scrollbar-track { background: transparent; }\
    .hud-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }\
    \
    /* ===== CARD (generic section wrapper) ===== */\
    .hud-card {\
      background: rgba(255, 255, 255, 0.03);\
      border: 1px solid rgba(255, 255, 255, 0.08);\
      border-radius: 8px;\
      padding: 10px 12px;\
    }\
    \
    /* ===== TIER 1: ACTION CARD ===== */\
    .hud-action-card {\
      border-radius: 8px;\
      padding: 12px;\
      text-align: center;\
      border: 1px solid rgba(255,255,255,0.08);\
      transition: background 0.2s, border-color 0.2s;\
    }\
    .hud-action-card.action-fold    { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.3); }\
    .hud-action-card.action-call    { background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); }\
    .hud-action-card.action-check   { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3); }\
    .hud-action-card.action-raise   { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); }\
    .hud-action-card.action-allin   { background: rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.3); }\
    .hud-action-card.action-none    { background: rgba(255, 255, 255, 0.03); }\
    \
    .hud-action-label {\
      font-size: 20px;\
      font-weight: 800;\
      letter-spacing: 1px;\
      line-height: 1.2;\
    }\
    .hud-action-label.fold  { color: #ef4444; }\
    .hud-action-label.call  { color: #3b82f6; }\
    .hud-action-label.check { color: #f59e0b; }\
    .hud-action-label.raise { color: #22c55e; }\
    .hud-action-label.allin { color: #a855f7; }\
    .hud-action-label.none  { color: #64748b; }\
    \
    .hud-confidence {\
      display: none;\
      font-size: 10px;\
      font-weight: 600;\
      margin-top: 4px;\
      letter-spacing: 0.3px;\
    }\
    .hud-confidence.high   { display: block; color: #22c55e; }\
    .hud-confidence.medium { display: block; color: #f59e0b; }\
    .hud-confidence.low    { display: block; color: #ef4444; }\
    .hud-confidence.none   { display: none; }\
    \
    .hud-action-reason {\
      font-size: 11px;\
      color: #94a3b8;\
      margin-top: 4px;\
      line-height: 1.3;\
    }\
    \
    /* ===== TIER 1: HAND SUMMARY STRIP ===== */\
    .hud-hand-strip {\
      display: flex;\
      align-items: center;\
      gap: 8px;\
      flex-wrap: wrap;\
    }\
    .hud-hero-cards { display: flex; gap: 4px; }\
    .hud-card-el {\
      display: inline-flex;\
      align-items: center;\
      justify-content: center;\
      background: rgba(255, 255, 255, 0.08);\
      border: 1px solid rgba(255, 255, 255, 0.2);\
      border-radius: 4px;\
      padding: 2px 5px;\
      font-size: 14px;\
      font-weight: 700;\
      min-width: 28px;\
      text-align: center;\
    }\
    .hud-card-el.empty { opacity: 0.3; }\
    .hud-hand-notation { color: #94a3b8; font-size: 12px; font-weight: 600; }\
    .hud-hand-tier {\
      font-size: 9px;\
      font-weight: 700;\
      padding: 2px 6px;\
      border-radius: 10px;\
      color: #000;\
      display: none;\
    }\
    .hud-position-badge {\
      font-size: 9px;\
      font-weight: 600;\
      padding: 2px 5px;\
      border-radius: 8px;\
      background: rgba(255, 255, 255, 0.06);\
      color: #64748b;\
      letter-spacing: 0.3px;\
      display: none;\
    }\
    .hud-position-badge.visible { display: inline-block; }\
    .hud-board-cards { display: flex; gap: 3px; margin-left: auto; }\
    .hud-card-sm {\
      display: inline-flex;\
      align-items: center;\
      justify-content: center;\
      background: rgba(255, 255, 255, 0.05);\
      border: 1px solid rgba(255, 255, 255, 0.12);\
      border-radius: 3px;\
      padding: 1px 3px;\
      font-size: 11px;\
      font-weight: 700;\
      min-width: 22px;\
      text-align: center;\
    }\
    .hud-card-sm.empty { opacity: 0.2; }\
    \
    /* ===== TIER 2: EQUITY & ODDS ===== */\
    .hud-equity-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; }\
    .hud-equity-value { font-size: 28px; font-weight: 800; letter-spacing: -1px; }\
    .hud-equity-pct { font-size: 14px; color: #64748b; }\
    .hud-equity-high { color: #22c55e; }\
    .hud-equity-med  { color: #f59e0b; }\
    .hud-equity-low  { color: #ef4444; }\
    \
    .hud-equity-detail { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }\
    \
    .hud-outs-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }\
    .hud-outs-count { font-size: 14px; font-weight: 700; color: #3b82f6; }\
    .hud-draw-tag {\
      font-size: 10px;\
      padding: 2px 6px;\
      border-radius: 10px;\
      background: rgba(59, 130, 246, 0.15);\
      color: #93c5fd;\
      white-space: nowrap;\
    }\
    .hud-outs-pct { font-size: 11px; color: #64748b; }\
    .hud-no-draws { font-size: 11px; color: #475569; }\
    \
    .hud-vuln-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }\
    .hud-vuln-badge {\
      font-size: 10px;\
      font-weight: 700;\
      padding: 2px 7px;\
      border-radius: 10px;\
      letter-spacing: 0.3px;\
      white-space: nowrap;\
    }\
    .hud-vuln-badge.safe     { background: rgba(34,197,94,0.2); color: #4ade80; }\
    .hud-vuln-badge.low      { background: rgba(59,130,246,0.2); color: #93c5fd; }\
    .hud-vuln-badge.moderate { background: rgba(245,158,11,0.2); color: #fcd34d; }\
    .hud-vuln-badge.high     { background: rgba(239,68,68,0.2); color: #fca5a5; }\
    .hud-vuln-badge.critical { background: rgba(220,38,38,0.3); color: #ff6b6b; }\
    .hud-threat-tag {\
      font-size: 10px;\
      padding: 2px 6px;\
      border-radius: 10px;\
      white-space: nowrap;\
    }\
    .hud-threat-tag.sev-2 { background: rgba(59,130,246,0.12); color: #93c5fd; }\
    .hud-threat-tag.sev-3 { background: rgba(245,158,11,0.12); color: #fcd34d; }\
    .hud-threat-tag.sev-4 { background: rgba(239,68,68,0.12); color: #fca5a5; }\
    .hud-threat-tag.sev-5 { background: rgba(220,38,38,0.2); color: #ff6b6b; }\
    .hud-vuln-outs { font-size: 11px; color: #64748b; }\
    \
    .hud-odds-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }\
    .hud-odds-bar-wrap {\
      display: flex;\
      height: 8px;\
      background: rgba(255,255,255,0.06);\
      border-radius: 4px;\
      overflow: hidden;\
      position: relative;\
    }\
    .hud-odds-fill-equity { background: #22c55e; transition: width 0.3s ease; height: 100%; }\
    .hud-odds-fill-needed { background: #ef4444; transition: width 0.3s ease; height: 100%; }\
    .hud-odds-notch {\
      position: absolute;\
      top: 0;\
      bottom: 0;\
      width: 2px;\
      background: rgba(255, 255, 255, 0.5);\
      transition: left 0.3s ease;\
      z-index: 1;\
    }\
    \
    /* ===== TIER 2: BOARD TEXTURE + SPR ===== */\
    .hud-texture-badge {\
      display: inline-block;\
      font-size: 11px;\
      font-weight: 700;\
      padding: 2px 8px;\
      border-radius: 10px;\
      margin-right: 6px;\
    }\
    .hud-texture-badge.dry  { background: rgba(59,130,246,0.2); color: #93c5fd; }\
    .hud-texture-badge.wet  { background: rgba(239,68,68,0.2); color: #fca5a5; }\
    .hud-texture-badge.med  { background: rgba(245,158,11,0.2); color: #fcd34d; }\
    .hud-texture-desc { font-size: 11px; color: #94a3b8; margin-top: 4px; }\
    \
    .hud-spr-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }\
    .hud-spr-label { font-size: 11px; color: #64748b; }\
    .hud-spr-value { font-size: 15px; font-weight: 700; }\
    .hud-spr-value.low  { color: #ef4444; }\
    .hud-spr-value.med  { color: #f59e0b; }\
    .hud-spr-value.high { color: #3b82f6; }\
    .hud-spr-tag {\
      font-size: 9px; font-weight: 600;\
      padding: 2px 6px; border-radius: 10px;\
    }\
    .hud-spr-tag.low  { background: rgba(239,68,68,0.2); color: #fca5a5; }\
    .hud-spr-tag.med  { background: rgba(245,158,11,0.2); color: #fcd34d; }\
    .hud-spr-tag.high { background: rgba(59,130,246,0.2); color: #93c5fd; }\
    .hud-spr-advice { font-size: 11px; color: #94a3b8; margin-top: 2px; white-space: normal; }\
    \
    /* ===== TIER 2: BET SIZING PILLS ===== */\
    .hud-sizing-row { display: flex; gap: 6px; flex-wrap: wrap; }\
    .hud-sizing-pill {\
      font-size: 11px;\
      padding: 4px 10px;\
      border-radius: 16px;\
      background: rgba(255,255,255,0.06);\
      border: 1px solid rgba(255,255,255,0.1);\
      color: #e2e8f0;\
      cursor: default;\
      white-space: nowrap;\
      transition: background 0.15s;\
    }\
    .hud-sizing-pill:hover { filter: brightness(1.2); }\
    .hud-sizing-pill .pill-label { font-weight: 600; }\
    .hud-sizing-pill .pill-amount { margin-left: 4px; }\
    .hud-sizing-pill.pill-value { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); }\
    .hud-sizing-pill.pill-value .pill-label { color: #22c55e; }\
    .hud-sizing-pill.pill-thin { background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); }\
    .hud-sizing-pill.pill-thin .pill-label { color: #93c5fd; }\
    .hud-sizing-pill.pill-bluff { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3); }\
    .hud-sizing-pill.pill-bluff .pill-label { color: #f59e0b; }\
    .hud-sizing-pill.pill-allin { background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.35); font-weight: 700; }\
    .hud-sizing-pill.pill-allin .pill-label { color: #ef4444; }\
    .hud-sizing-pill.pill-default .pill-label { color: #93c5fd; }\
    \
    /* ===== TIER 3: COLLAPSIBLE SECTIONS ===== */\
    .hud-section-header {\
      display: flex;\
      align-items: center;\
      gap: 6px;\
      padding: 6px 8px;\
      cursor: pointer;\
      user-select: none;\
      border-radius: 6px;\
      transition: background 0.15s;\
    }\
    .hud-section-header:hover { background: rgba(255,255,255,0.05); }\
    .hud-section-chevron {\
      font-size: 10px;\
      color: #64748b;\
      transition: transform 0.2s ease;\
      display: inline-block;\
    }\
    .hud-section-chevron.open { transform: rotate(90deg); }\
    .hud-section-title { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.3px; }\
    .hud-section-inline { font-size: 11px; margin-left: auto; }\
    .hud-session-reset {\
      font-size: 10px;\
      padding: 1px 6px;\
      border-radius: 8px;\
      border: 1px solid rgba(255,255,255,0.1);\
      background: rgba(255,255,255,0.04);\
      color: #64748b;\
      cursor: pointer;\
      margin-left: 6px;\
      transition: background 0.15s, color 0.15s;\
    }\
    .hud-session-reset:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }\
    .hud-section-body {\
      display: none;\
      padding: 6px 8px 4px;\
      font-size: 11px;\
    }\
    .hud-section-body.open { display: block; }\
    \
    .hud-info-grid {\
      display: grid;\
      grid-template-columns: auto 1fr;\
      gap: 2px 10px;\
    }\
    .hud-info-label { color: #64748b; }\
    .hud-info-value { color: #e2e8f0; }\
    \
    .hud-session-grid {\
      display: grid;\
      grid-template-columns: auto 1fr;\
      gap: 2px 10px;\
    }\
    .hud-session-label { color: #64748b; }\
    .hud-session-value { color: #e2e8f0; }\
    .hud-profit-pos { color: #22c55e !important; font-weight: 700; }\
    .hud-profit-neg { color: #ef4444 !important; font-weight: 700; }\
    .hud-profit-zero { color: #64748b !important; }\
    \
    .hud-session-graph {\
      margin-top: 4px;\
      border: 1px solid rgba(255,255,255,0.06);\
      border-radius: 4px;\
      padding: 2px;\
      background: rgba(0,0,0,0.2);\
    }\
    \
    .hud-debug-text {\
      font-size: 10px;\
      color: #64748b;\
      word-break: break-all;\
      max-height: 80px;\
      overflow-y: auto;\
      font-family: monospace;\
    }\
    .hud-debug-copy {\
      font-size: 9px;\
      padding: 2px 8px;\
      border-radius: 10px;\
      background: rgba(255,255,255,0.08);\
      border: 1px solid rgba(255,255,255,0.12);\
      color: #94a3b8;\
      cursor: pointer;\
      margin-left: auto;\
      transition: background 0.15s;\
    }\
    .hud-debug-copy:hover { background: rgba(255,255,255,0.15); color: #e2e8f0; }\
    \
    /* ===== PILL (collapsed state) ===== */\
    #hud-pill {\
      position: fixed;\
      top: 16px;\
      right: 16px;\
      padding: 6px 14px;\
      background: rgba(12, 12, 16, 0.92);\
      backdrop-filter: blur(16px);\
      -webkit-backdrop-filter: blur(16px);\
      border: 1px solid rgba(255, 255, 255, 0.1);\
      border-radius: 20px;\
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);\
      cursor: pointer;\
      pointer-events: auto;\
      display: none;\
      align-items: center;\
      gap: 8px;\
      user-select: none;\
      z-index: 1;\
      transition: background 0.15s;\
    }\
    #hud-pill:hover { background: rgba(20, 20, 28, 0.95); }\
    #hud-pill.visible { display: flex; }\
    .hud-pill-label { font-size: 12px; font-weight: 700; color: #e2e8f0; letter-spacing: 0.5px; }\
    .hud-pill-dot {\
      width: 8px;\
      height: 8px;\
      border-radius: 50%;\
      background: #64748b;\
    }\
    .hud-pill-dot.fold  { background: #ef4444; }\
    .hud-pill-dot.call  { background: #3b82f6; }\
    .hud-pill-dot.check { background: #f59e0b; }\
    .hud-pill-dot.raise { background: #22c55e; }\
    .hud-pill-dot.allin { background: #a855f7; }\
    \
    /* ===== RESIZE GRIP ===== */\
    .hud-resize-grip {\
      position: absolute;\
      bottom: 0;\
      right: 0;\
      width: 16px;\
      height: 16px;\
      cursor: se-resize;\
      opacity: 0.3;\
      transition: opacity 0.15s;\
    }\
    .hud-resize-grip:hover { opacity: 0.7; }\
    .hud-resize-grip::after {\
      content: "";\
      position: absolute;\
      bottom: 3px;\
      right: 3px;\
      width: 8px;\
      height: 8px;\
      border-right: 2px solid #64748b;\
      border-bottom: 2px solid #64748b;\
    }\
    \
    .hud-dim { color: #475569; font-size: 11px; }\
  ';

  // ============================================================
  // Constructor
  // ============================================================
  function TerminalUI() {
    this._host = null;
    this._shadow = null;
    this._panel = null;
    this._pill = null;
    this._badges = {};
    this._isOpen = true;

    // Drag state
    this._isDragging = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;

    // Resize state
    this._isResizing = false;
    this._resizeStartX = 0;
    this._resizeStartW = 0;

    // Position & size (loaded from prefs or defaults)
    this._position = { x: DEFAULTS.x, y: DEFAULTS.y };
    this._size = { w: DEFAULTS.w };
    this._expandedSections = {
      session: DEFAULTS.sections.session,
      info: DEFAULTS.sections.info,
      debug: DEFAULTS.sections.debug,
    };

    // Storage bridge
    this._pendingStorageRequests = {};
    this._storageRequestCounter = 0;
    this._saveTimer = null;

    // Bound listeners (for cleanup)
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);

    // Last action type (for pill dot)
    this._lastActionType = '';

    // Last outs data (for improve% display)
    this._lastOutsData = null;
    this._lastEquityData = null;
  }

  // ============================================================
  // init()
  // ============================================================
  TerminalUI.prototype.init = function() {
    // 1. Create host
    this._host = document.createElement('div');
    this._host.id = 'wpt-terminal-host';
    document.body.appendChild(this._host);

    // 2. Attach shadow root
    this._shadow = this._host.attachShadow({ mode: 'open' });

    // 3. Inject CSS into shadow
    var styleEl = document.createElement('style');
    styleEl.textContent = PANEL_CSS;
    this._shadow.appendChild(styleEl);

    // 4. Build panel
    this._panel = document.createElement('div');
    this._panel.id = 'hud-panel';
    this._panel.innerHTML = this._buildPanelHTML();
    this._shadow.appendChild(this._panel);

    // 5. Build pill
    this._pill = document.createElement('div');
    this._pill.id = 'hud-pill';
    this._pill.innerHTML = '<span class="hud-pill-dot"></span><span class="hud-pill-label">WPT</span>';
    this._shadow.appendChild(this._pill);

    // 6. Attach events
    this._attachEvents();

    // 7. Listen for storage bridge responses
    var self = this;
    this._storageListener = function(event) {
      if (event.source !== window) return;
      if (!event.data || event.data.source !== BRIDGE_ID) return;
      if (event.data.type === 'STORAGE_RESULT' && self._pendingStorageRequests[event.data.requestId]) {
        self._pendingStorageRequests[event.data.requestId](event.data.data);
        delete self._pendingStorageRequests[event.data.requestId];
      }
    };
    window.addEventListener('message', this._storageListener);

    // 8. Load preferences
    this._loadPrefs();

    // 9. Add document-level mouse listeners for drag/resize
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);

    console.log('[WPT] Terminal UI initialized (floating HUD)');
  };

  // ============================================================
  // _buildPanelHTML()
  // ============================================================
  TerminalUI.prototype._buildPanelHTML = function() {
    return '' +
      // HEADER
      '<div class="hud-header" id="hud-drag-handle">' +
        '<span class="hud-title">WPT HUD</span>' +
        '<span class="hud-status scanning" id="hud-status">SCANNING</span>' +
        '<span class="hud-collapse-btn" id="hud-collapse">&mdash;</span>' +
      '</div>' +

      // BODY
      '<div class="hud-body">' +

        // TIER 1: Action Card
        '<div class="hud-action-card action-none" id="hud-action-card">' +
          '<div class="hud-action-label none" id="hud-action-label">--</div>' +
          '<div class="hud-confidence none" id="hud-confidence"></div>' +
          '<div class="hud-action-reason" id="hud-action-reason"></div>' +
        '</div>' +

        // TIER 1: Hand Summary Strip
        '<div class="hud-card hud-hand-strip">' +
          '<div class="hud-hero-cards" id="hud-hero-cards">' +
            '<span class="hud-card-el empty">--</span>' +
            '<span class="hud-card-el empty">--</span>' +
          '</div>' +
          '<span class="hud-hand-notation" id="hud-hand-notation"></span>' +
          '<span class="hud-hand-tier" id="hud-hand-tier"></span>' +
          '<div class="hud-board-cards" id="hud-board">' +
            '<span class="hud-card-sm empty">--</span>' +
            '<span class="hud-card-sm empty">--</span>' +
            '<span class="hud-card-sm empty">--</span>' +
            '<span class="hud-card-sm empty">--</span>' +
            '<span class="hud-card-sm empty">--</span>' +
          '</div>' +
          '<span class="hud-position-badge" id="hud-pos-badge"></span>' +
        '</div>' +

        // TIER 2: Equity & Odds
        '<div class="hud-card" id="hud-equity-card">' +
          '<div class="hud-equity-row">' +
            '<span class="hud-equity-value" id="hud-equity">--</span>' +
            '<span class="hud-equity-pct">%</span>' +
          '</div>' +
          '<div class="hud-equity-detail" id="hud-equity-detail">Waiting for cards...</div>' +
          '<div class="hud-outs-row" id="hud-outs">' +
            '<span class="hud-no-draws">No draws detected</span>' +
          '</div>' +
          '<div class="hud-vuln-row" id="hud-vulnerability"></div>' +
          '<div class="hud-odds-label" id="hud-odds-text">--</div>' +
          '<div class="hud-odds-bar-wrap">' +
            '<div class="hud-odds-fill-equity" id="hud-odds-equity" style="width:0%"></div>' +
            '<div class="hud-odds-fill-needed" id="hud-odds-needed" style="width:0%"></div>' +
            '<div class="hud-odds-notch" id="hud-odds-notch" style="left:0%"></div>' +
          '</div>' +
        '</div>' +

        // TIER 2: Board Texture + SPR
        '<div class="hud-card" id="hud-texture-card">' +
          '<span class="hud-dim">--</span>' +
        '</div>' +

        // TIER 2: Bet Sizing Pills
        '<div class="hud-card" id="hud-sizing-card">' +
          '<div class="hud-sizing-row">' +
            '<span class="hud-dim">--</span>' +
          '</div>' +
        '</div>' +

        // TIER 3: Session (collapsed by default)
        '<div class="hud-card" style="padding:0">' +
          '<div class="hud-section-header" data-section="session">' +
            '<span class="hud-section-chevron" id="hud-chev-session">&#9654;</span>' +
            '<span class="hud-section-title">SESSION</span>' +
            '<span class="hud-section-inline" id="hud-session-inline"></span>' +
            '<button class="hud-session-reset" id="hud-session-reset" title="Reset session">Reset</button>' +
          '</div>' +
          '<div class="hud-section-body" id="hud-session-body">' +
            '<span class="hud-dim">Waiting for data...</span>' +
          '</div>' +
        '</div>' +

        // TIER 3: Game Info (collapsed by default)
        '<div class="hud-card" style="padding:0">' +
          '<div class="hud-section-header" data-section="info">' +
            '<span class="hud-section-chevron" id="hud-chev-info">&#9654;</span>' +
            '<span class="hud-section-title">GAME INFO</span>' +
          '</div>' +
          '<div class="hud-section-body" id="hud-info-body">' +
            '<div class="hud-info-grid">' +
              '<span class="hud-info-label">Phase:</span><span class="hud-info-value" id="hud-phase">--</span>' +
              '<span class="hud-info-label">Position:</span><span class="hud-info-value" id="hud-position">--</span>' +
              '<span class="hud-info-label">Pot:</span><span class="hud-info-value" id="hud-pot">--</span>' +
              '<span class="hud-info-label">Players:</span><span class="hud-info-value" id="hud-players">--</span>' +
              '<span class="hud-info-label">Hand #:</span><span class="hud-info-value" id="hud-handnum">--</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // TIER 3: Debug (collapsed by default)
        '<div class="hud-card" style="padding:0">' +
          '<div class="hud-section-header" data-section="debug">' +
            '<span class="hud-section-chevron" id="hud-chev-debug">&#9654;</span>' +
            '<span class="hud-section-title">DEBUG</span>' +
            '<span class="hud-debug-copy" id="hud-debug-copy">COPY</span>' +
          '</div>' +
          '<div class="hud-section-body" id="hud-debug-body">' +
            '<div class="hud-debug-text" id="hud-debug">Waiting...</div>' +
          '</div>' +
        '</div>' +

      '</div>' + // end body

      // RESIZE GRIP
      '<div class="hud-resize-grip" id="hud-resize-grip"></div>';
  };

  // ============================================================
  // _attachEvents()
  // ============================================================
  TerminalUI.prototype._attachEvents = function() {
    var self = this;
    var shadow = this._shadow;

    // Collapse button
    shadow.getElementById('hud-collapse').addEventListener('click', function(e) {
      e.stopPropagation();
      self.toggle();
    });

    // Pill click → expand
    this._pill.addEventListener('click', function() {
      self.toggle();
    });

    // Drag start on header
    shadow.getElementById('hud-drag-handle').addEventListener('mousedown', function(e) {
      // Ignore clicks on collapse button
      if (e.target.closest('.hud-collapse-btn')) return;
      e.preventDefault();
      self._isDragging = true;
      var rect = self._panel.getBoundingClientRect();
      self._dragOffsetX = e.clientX - rect.left;
      self._dragOffsetY = e.clientY - rect.top;
    });

    // Resize start
    shadow.getElementById('hud-resize-grip').addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self._isResizing = true;
      self._resizeStartX = e.clientX;
      self._resizeStartW = self._panel.offsetWidth;
    });

    // Section toggles
    var headers = shadow.querySelectorAll('.hud-section-header');
    for (var i = 0; i < headers.length; i++) {
      (function(header) {
        header.addEventListener('click', function(e) {
          // Don't toggle when clicking action buttons
          if (e.target.closest('.hud-debug-copy')) return;
          if (e.target.closest('.hud-session-reset')) return;
          var section = header.getAttribute('data-section');
          if (section) self._toggleSection(section);
        });
      })(headers[i]);
    }

    // Session reset button
    var resetBtn = shadow.getElementById('hud-session-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (self._onSessionReset) self._onSessionReset();
      });
    }

    // Copy debug button
    var copyBtn = shadow.getElementById('hud-debug-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var debugEl = shadow.getElementById('hud-debug');
        if (debugEl) {
          var text = debugEl.textContent;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
              copyBtn.textContent = 'COPIED!';
              setTimeout(function() { copyBtn.textContent = 'COPY'; }, 1500);
            });
          } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copyBtn.textContent = 'COPIED!';
            setTimeout(function() { copyBtn.textContent = 'COPY'; }, 1500);
          }
        }
      });
    }
  };

  // ============================================================
  // Mouse handlers (drag + resize)
  // ============================================================
  TerminalUI.prototype._onMouseMove = function(e) {
    if (this._isDragging) {
      var x = e.clientX - this._dragOffsetX;
      var y = e.clientY - this._dragOffsetY;
      this._position.x = x;
      this._position.y = y;
      this._applyPosition();
      this._debounceSave();
    } else if (this._isResizing) {
      var delta = e.clientX - this._resizeStartX;
      var newW = Math.max(320, Math.min(560, this._resizeStartW + delta));
      this._size.w = newW;
      this._panel.style.width = newW + 'px';
      this._debounceSave();
    }
  };

  TerminalUI.prototype._onMouseUp = function() {
    if (this._isDragging) {
      this._isDragging = false;
      this._clampPosition();
      this._applyPosition();
    }
    if (this._isResizing) {
      this._isResizing = false;
    }
  };

  TerminalUI.prototype._applyPosition = function() {
    if (!this._panel) return;
    // Reset right/use left+top for absolute positioning
    this._panel.style.right = 'auto';
    this._panel.style.left = this._position.x + 'px';
    this._panel.style.top = this._position.y + 'px';

    // Also position pill at the same spot
    if (this._pill) {
      this._pill.style.right = 'auto';
      this._pill.style.left = this._position.x + 'px';
      this._pill.style.top = this._position.y + 'px';
    }
  };

  TerminalUI.prototype._clampPosition = function() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var pw = this._panel ? this._panel.offsetWidth : this._size.w;
    var ph = this._panel ? this._panel.offsetHeight : 200;

    this._position.x = Math.max(0, Math.min(vw - pw, this._position.x));
    this._position.y = Math.max(0, Math.min(vh - Math.min(ph, 60), this._position.y));
  };

  // ============================================================
  // toggle() - Collapse/expand
  // ============================================================
  TerminalUI.prototype.toggle = function() {
    this._isOpen = !this._isOpen;
    if (this._isOpen) {
      this._panel.classList.remove('hidden');
      this._pill.classList.remove('visible');
    } else {
      this._panel.classList.add('hidden');
      this._pill.classList.add('visible');
    }
    this._debounceSave();
  };

  TerminalUI.prototype.toggleMinimize = function() { this.toggle(); };

  // ============================================================
  // _toggleSection() - Tier 3 expand/collapse
  // ============================================================
  TerminalUI.prototype._toggleSection = function(name) {
    this._expandedSections[name] = !this._expandedSections[name];
    var body = this._shadow.getElementById('hud-' + name + '-body');
    var chevron = this._shadow.getElementById('hud-chev-' + name);
    if (body) {
      if (this._expandedSections[name]) {
        body.classList.add('open');
      } else {
        body.classList.remove('open');
      }
    }
    if (chevron) {
      if (this._expandedSections[name]) {
        chevron.classList.add('open');
      } else {
        chevron.classList.remove('open');
      }
    }
    this._debounceSave();
  };

  // ============================================================
  // Storage persistence via bridge
  // ============================================================
  TerminalUI.prototype._bridgeRequest = function(type, extra, callback) {
    var requestId = 'hud_' + (++this._storageRequestCounter);
    this._pendingStorageRequests[requestId] = callback;

    var msg = { source: MAIN_ID, type: type, requestId: requestId };
    if (extra) {
      var keys = Object.keys(extra);
      for (var i = 0; i < keys.length; i++) { msg[keys[i]] = extra[keys[i]]; }
    }
    window.postMessage(msg, '*');

    var self = this;
    setTimeout(function() {
      if (self._pendingStorageRequests[requestId]) {
        self._pendingStorageRequests[requestId](null);
        delete self._pendingStorageRequests[requestId];
      }
    }, 3000);
  };

  TerminalUI.prototype._loadPrefs = function() {
    var self = this;
    this._bridgeRequest('STORAGE_GET', { key: STORAGE_KEY }, function(data) {
      if (data) {
        if (typeof data.x === 'number') self._position.x = data.x;
        if (typeof data.y === 'number') self._position.y = data.y;
        if (typeof data.w === 'number') self._size.w = data.w;
        if (typeof data.collapsed === 'boolean' && data.collapsed) {
          self._isOpen = false;
          self._panel.classList.add('hidden');
          self._pill.classList.add('visible');
        }
        if (data.sections) {
          if (data.sections.session) { self._expandedSections.session = true; self._toggleSectionDirect('session', true); }
          if (data.sections.info) { self._expandedSections.info = true; self._toggleSectionDirect('info', true); }
          if (data.sections.debug) { self._expandedSections.debug = true; self._toggleSectionDirect('debug', true); }
        }
      }

      // Apply position (default: top-right if x === -1)
      if (self._position.x === -1) {
        self._position.x = window.innerWidth - self._size.w - 16;
      }
      self._panel.style.width = self._size.w + 'px';
      self._applyPosition();
    });
  };

  TerminalUI.prototype._toggleSectionDirect = function(name, open) {
    var body = this._shadow.getElementById('hud-' + name + '-body');
    var chevron = this._shadow.getElementById('hud-chev-' + name);
    if (body) { if (open) body.classList.add('open'); else body.classList.remove('open'); }
    if (chevron) { if (open) chevron.classList.add('open'); else chevron.classList.remove('open'); }
  };

  TerminalUI.prototype._debounceSave = function() {
    var self = this;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function() {
      self._savePrefs();
    }, 500);
  };

  TerminalUI.prototype._savePrefs = function() {
    var prefs = {
      x: this._position.x,
      y: this._position.y,
      w: this._size.w,
      collapsed: !this._isOpen,
      sections: {
        session: this._expandedSections.session,
        info: this._expandedSections.info,
        debug: this._expandedSections.debug,
      },
    };
    var data = {};
    data[STORAGE_KEY] = prefs;
    this._bridgeRequest('STORAGE_SET', { data: data }, function() {});
  };

  // ============================================================
  // Helper: _getActionType(actionText)
  // ============================================================
  TerminalUI.prototype._getActionType = function(text) {
    if (!text) return 'none';
    var t = text.toLowerCase();
    if (t.includes('fold')) return 'fold';
    if (t.includes('all-in') || t.includes('all in')) return 'allin';
    if (t.includes('raise') || t.includes('bet')) return 'raise';
    if (t.includes('call')) return 'call';
    if (t.includes('check')) return 'check';
    return 'none';
  };

  // ============================================================
  // UPDATE METHODS — same signatures as before
  // ============================================================

  TerminalUI.prototype.updateHeroCards = function(cards) {
    var container = this._shadow.getElementById('hud-hero-cards');
    if (!container) return;
    var cardEls = container.querySelectorAll('.hud-card-el');
    for (var i = 0; i < 2; i++) {
      if (cards && cards[i]) {
        cardEls[i].innerHTML = CardUtils.displayHTML(cards[i]);
        cardEls[i].classList.remove('empty');
      } else {
        cardEls[i].textContent = '--';
        cardEls[i].classList.add('empty');
      }
    }
    var notation = this._shadow.getElementById('hud-hand-notation');
    if (notation && cards && cards.length === 2) {
      notation.textContent = CardUtils.handNotation(cards[0], cards[1]);
    } else if (notation) {
      notation.textContent = '';
    }
  };

  TerminalUI.prototype.updateHandTier = function(tier) {
    var el = this._shadow.getElementById('hud-hand-tier');
    if (!el) return;
    if (tier) {
      el.textContent = tier.label;
      el.style.backgroundColor = tier.color;
      el.style.display = 'inline-block';
    } else {
      el.style.display = 'none';
    }
  };

  TerminalUI.prototype.updateBoard = function(cards) {
    var container = this._shadow.getElementById('hud-board');
    if (!container) return;
    var html = '';
    for (var i = 0; i < 5; i++) {
      if (cards && cards[i]) {
        html += '<span class="hud-card-sm">' + CardUtils.displayHTML(cards[i]) + '</span>';
      } else {
        html += '<span class="hud-card-sm empty">--</span>';
      }
    }
    container.innerHTML = html;
  };

  TerminalUI.prototype.updateEquity = function(equityData) {
    var el = this._shadow.getElementById('hud-equity');
    var detail = this._shadow.getElementById('hud-equity-detail');
    if (!el) return;

    this._lastEquityData = equityData;

    if (!equityData || equityData.equity === '-') {
      el.textContent = '--';
      el.className = 'hud-equity-value';
      if (detail) detail.textContent = 'Waiting for cards...';
      return;
    }

    var eq = parseFloat(equityData.equity);
    el.textContent = equityData.equity;

    if (eq > 60) el.className = 'hud-equity-value hud-equity-high';
    else if (eq > 40) el.className = 'hud-equity-value hud-equity-med';
    else el.className = 'hud-equity-value hud-equity-low';

    if (detail) {
      this._renderEquityDetail(detail, equityData);
    }
  };

  TerminalUI.prototype._renderEquityDetail = function(el, equityData) {
    var outs = this._lastOutsData;
    var improvePct = null;
    if (outs && outs.totalOuts > 0) {
      // Use two-card if available and higher, otherwise one-card
      improvePct = outs.twoCard > outs.oneCard ? outs.twoCard : outs.oneCard;
    }

    if (improvePct !== null) {
      el.innerHTML = 'Win ' + equityData.winPct + '% <span style="margin:0 2px">|</span> Tie ' + equityData.tiePct +
        '% <span style="margin:0 2px">|</span> Improve ' + improvePct.toFixed(1) + '%';
    } else {
      el.innerHTML = 'Win ' + equityData.winPct + '% <span style="margin:0 2px">|</span> Tie ' + equityData.tiePct +
        '% <span style="margin:0 2px">|</span> <span style="color:#475569">Lose ' + equityData.lossPct + '%</span>';
    }
  };

  TerminalUI.prototype.updateOuts = function(outsData) {
    var el = this._shadow.getElementById('hud-outs');
    if (!el) return;

    this._lastOutsData = outsData;

    // Re-render equity detail line when outs change (for improve%)
    var detail = this._shadow.getElementById('hud-equity-detail');
    if (detail && this._lastEquityData && this._lastEquityData.equity !== '-') {
      this._renderEquityDetail(detail, this._lastEquityData);
    }

    if (!outsData || outsData.draws.length === 0) {
      el.innerHTML = '<span class="hud-no-draws">No draws</span>';
      return;
    }

    var html = '<span class="hud-outs-count">' + outsData.totalOuts + ' outs</span>';

    // Draw tags inline
    for (var i = 0; i < outsData.draws.length; i++) {
      html += '<span class="hud-draw-tag">' + outsData.draws[i].name + ' (' + outsData.draws[i].outs + ')</span>';
    }

    // Percentages
    html += '<span class="hud-outs-pct">' + outsData.oneCard.toFixed(1) + '% next';
    if (outsData.twoCard > outsData.oneCard) {
      html += ' / ' + outsData.twoCard.toFixed(1) + '% river';
    }
    html += '</span>';

    el.innerHTML = html;
  };

  TerminalUI.prototype.updateVulnerability = function(vuln) {
    var el = this._shadow.getElementById('hud-vulnerability');
    if (!el) return;

    if (!vuln || !vuln.threats || vuln.threats.length === 0) {
      el.innerHTML = '';
      return;
    }

    var levelClass = vuln.level.toLowerCase();
    var html = '<span class="hud-vuln-badge ' + levelClass + '">' + vuln.level + '</span>';

    // Show up to 3 threat pills
    var max = Math.min(vuln.threats.length, 3);
    for (var i = 0; i < max; i++) {
      var t = vuln.threats[i];
      var sevClass = 'sev-' + Math.min(t.severity, 5);
      html += '<span class="hud-threat-tag ' + sevClass + '">' + t.shortLabel + '</span>';
    }

    // Total threat outs
    if (vuln.totalThreatOuts > 0) {
      html += '<span class="hud-vuln-outs">' + vuln.totalThreatOuts + ' threat outs</span>';
    }

    el.innerHTML = html;
  };

  TerminalUI.prototype.updatePotOdds = function(potOdds) {
    var textEl = this._shadow.getElementById('hud-odds-text');
    var eqBar = this._shadow.getElementById('hud-odds-equity');
    var neededBar = this._shadow.getElementById('hud-odds-needed');
    var notch = this._shadow.getElementById('hud-odds-notch');
    if (!textEl || !potOdds) {
      if (textEl) textEl.textContent = '--';
      return;
    }
    textEl.textContent = 'Pot: $' + potOdds.pot.toFixed(2) +
      '  Call: $' + potOdds.toCall.toFixed(2) +
      '  Odds: ' + (potOdds.ratio === Infinity ? '\u221E' : potOdds.ratio.toFixed(1)) + ':1' +
      '  Need: ' + potOdds.requiredEquity.toFixed(1) + '%';
    if (eqBar && potOdds.equity) eqBar.style.width = Math.min(100, parseFloat(potOdds.equity)) + '%';
    if (neededBar) neededBar.style.width = Math.min(100, potOdds.requiredEquity) + '%';
    if (notch) notch.style.left = Math.min(100, potOdds.requiredEquity) + '%';
  };

  TerminalUI.prototype.updateRecommendation = function(rec) {
    var card = this._shadow.getElementById('hud-action-card');
    var labelEl = this._shadow.getElementById('hud-action-label');
    var confEl = this._shadow.getElementById('hud-confidence');
    var reasonEl = this._shadow.getElementById('hud-action-reason');
    if (!labelEl) return;

    if (!rec) {
      labelEl.textContent = '--';
      labelEl.className = 'hud-action-label none';
      if (card) card.className = 'hud-action-card action-none';
      if (confEl) { confEl.textContent = ''; confEl.className = 'hud-confidence none'; }
      if (reasonEl) reasonEl.textContent = '';
      this._lastActionType = '';
      this._updatePillDot('');
      return;
    }

    var type = this._getActionType(rec.action);
    this._lastActionType = type;

    labelEl.textContent = rec.action;
    labelEl.className = 'hud-action-label ' + type;

    if (card) card.className = 'hud-action-card action-' + type;

    if (confEl && rec.confidence && rec.confidence !== 'NONE') {
      confEl.textContent = 'Confidence: ' + rec.confidence.charAt(0) + rec.confidence.slice(1).toLowerCase();
      confEl.className = 'hud-confidence ' + rec.confidence.toLowerCase();
    } else if (confEl) {
      confEl.textContent = '';
      confEl.className = 'hud-confidence none';
    }

    if (reasonEl) reasonEl.textContent = rec.reasoning || '';

    this._updatePillDot(type);
  };

  TerminalUI.prototype._updatePillDot = function(type) {
    if (!this._pill) return;
    var dot = this._pill.querySelector('.hud-pill-dot');
    if (dot) {
      dot.className = 'hud-pill-dot' + (type ? ' ' + type : '');
    }
  };

  TerminalUI.prototype.updateBoardTexture = function(texture, spr) {
    var el = this._shadow.getElementById('hud-texture-card');
    if (!el) return;

    var html = '';

    if (texture) {
      var wetClass = texture.wetness >= 5 ? 'wet' : (texture.wetness <= 2 ? 'dry' : 'med');
      html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
      html += '<span class="hud-texture-badge ' + wetClass + '">' + texture.label + '</span>';
      html += '<span class="hud-texture-desc" style="margin-top:0">' + texture.description + '</span>';
      html += '</div>';
    }

    if (spr) {
      var sprClass = spr.value <= 4 ? 'low' : (spr.value > 10 ? 'high' : 'med');
      html += '<div class="hud-spr-row"' + (texture ? '' : ' style="margin-top:0"') + '>' +
        '<span class="hud-spr-label">SPR</span>' +
        '<span class="hud-spr-value ' + sprClass + '">' + spr.value.toFixed(1) + '</span>' +
        '<span class="hud-spr-tag ' + sprClass + '">' + spr.label + '</span>' +
        '<span class="hud-spr-advice" style="margin-top:0;margin-left:6px">' + spr.advice + '</span>' +
      '</div>';
    }

    el.innerHTML = html || '<span class="hud-dim">--</span>';
  };

  TerminalUI.prototype.updateBetSizing = function(suggestions) {
    var el = this._shadow.getElementById('hud-sizing-card');
    if (!el) return;

    if (!suggestions || suggestions.length === 0) {
      el.innerHTML = '<div class="hud-sizing-row"><span class="hud-dim">--</span></div>';
      return;
    }

    var html = '<div class="hud-sizing-row">';
    for (var i = 0; i < suggestions.length; i++) {
      var s = suggestions[i];
      var pillClass = 'pill-default';
      var labelLow = (s.label || '').toLowerCase();
      if (labelLow.indexOf('all') >= 0) pillClass = 'pill-allin';
      else if (labelLow.indexOf('bluff') >= 0 || labelLow.indexOf('overbet') >= 0) pillClass = 'pill-bluff';
      else if (labelLow.indexOf('thin') >= 0) pillClass = 'pill-thin';
      else if (labelLow.indexOf('value') >= 0 || labelLow.indexOf('protection') >= 0) pillClass = 'pill-value';
      else if (labelLow.indexOf('standard') >= 0) pillClass = 'pill-default';
      html += '<span class="hud-sizing-pill ' + pillClass + '" title="' + (s.reason || '').replace(/"/g, '&quot;') + '">' +
        '<span class="pill-label">' + s.label + '</span>' +
        '<span class="pill-amount"> $' + s.size.toFixed(2) + ' (' + s.pct + ')</span>' +
      '</span>';
    }
    html += '</div>';

    el.innerHTML = html;
  };

  TerminalUI.prototype.updateSession = function(stats) {
    var inlineEl = this._shadow.getElementById('hud-session-inline');
    var bodyEl = this._shadow.getElementById('hud-session-body');
    if (!bodyEl) return;

    if (!stats) {
      if (inlineEl) inlineEl.textContent = '';
      bodyEl.innerHTML = '<span class="hud-dim">Waiting for data...</span>';
      return;
    }

    var profitClass = stats.profit > 0 ? 'hud-profit-pos' : (stats.profit < 0 ? 'hud-profit-neg' : 'hud-profit-zero');
    var profitSign = stats.profit >= 0 ? '+' : '';

    // Inline P&L in toggle header
    if (inlineEl) {
      inlineEl.innerHTML = '<span class="' + profitClass + '">' + profitSign + '$' + stats.profit.toFixed(2) + '</span>';
    }

    // Expanded body
    var lowSample = stats.handsPlayed < 20;
    var bbhrDisplay = lowSample
      ? '<span style="color:#475569">' + stats.bbPerHour.toFixed(1) + ' <span style="font-size:9px;opacity:0.7">(low sample)</span></span>'
      : stats.bbPerHour.toFixed(1);
    var bb100Display = lowSample
      ? '<span style="color:#475569">' + stats.bb100.toFixed(1) + ' <span style="font-size:9px;opacity:0.7">(low sample)</span></span>'
      : stats.bb100.toFixed(1);

    var html = '<div class="hud-session-grid">' +
      '<span class="hud-session-label">P&L:</span>' +
      '<span class="hud-session-value ' + profitClass + '">' + profitSign + '$' + stats.profit.toFixed(2) +
        ' (' + profitSign + stats.profitBB.toFixed(1) + ' BB)</span>' +
      '<span class="hud-session-label">Hands:</span>' +
      '<span class="hud-session-value">' + stats.handsPlayed + '</span>' +
      '<span class="hud-session-label">BB/hr:</span>' +
      '<span class="hud-session-value">' + bbhrDisplay + '</span>' +
      '<span class="hud-session-label">BB/100:</span>' +
      '<span class="hud-session-value">' + bb100Display + '</span>' +
      '<span class="hud-session-label">VPIP:</span>' +
      '<span class="hud-session-value">' + stats.vpipPct.toFixed(0) + '%</span>' +
      '<span class="hud-session-label">Time:</span>' +
      '<span class="hud-session-value">' + stats.duration + '</span>' +
    '</div>';

    // Sparkline
    if (stats.graphData && stats.graphData.length > 1) {
      html += '<div class="hud-session-graph">' + this._buildSparkline(stats.graphData) + '</div>';
    }

    bodyEl.innerHTML = html;
  };

  TerminalUI.prototype.updateInfo = function(info) {
    if (info.phase) this._setText('hud-phase', info.phase.toUpperCase());
    if (info.position) {
      this._setText('hud-position', info.position);
      var posBadge = this._shadow.getElementById('hud-pos-badge');
      if (posBadge) {
        posBadge.textContent = info.position;
        posBadge.classList.add('visible');
      }
    }
    if (info.pot !== undefined) this._setText('hud-pot', '$' + info.pot.toFixed(2));
    if (info.players !== undefined) this._setText('hud-players', info.players.toString());
    if (info.handNum) this._setText('hud-handnum', '#' + info.handNum);
  };

  TerminalUI.prototype.updateStatus = function(text) {
    var el = this._shadow.getElementById('hud-status');
    if (!el) return;
    el.textContent = text;
    if (text === 'LIVE') {
      el.className = 'hud-status live';
    } else {
      el.className = 'hud-status scanning';
    }
  };

  TerminalUI.prototype.updateDebug = function(text) {
    var el = this._shadow.getElementById('hud-debug');
    if (el) el.textContent = text;
  };

  // Player HUD badges (light DOM — on host, not shadow)
  TerminalUI.prototype.updatePlayerBadges = function(players, statsEngine) {
    if (!this._host) return;
    var activeBadges = {};
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.isEmpty || !p.name || p.name === 'Name') continue;
      var stats = statsEngine.getDisplayStats(p.name);
      if (!stats || stats.hands < WPT.MIN_HANDS_FOR_DISPLAY) continue;

      var badgeId = 'wpt-badge-' + i;
      activeBadges[badgeId] = true;
      var badge = this._badges[badgeId];
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'wpt-player-badge';
        badge.id = badgeId;
        this._host.appendChild(badge);
        this._badges[badgeId] = badge;
      }
      badge.style.left = (p.screenX - 40) + 'px';
      badge.style.top = (p.screenY - 45) + 'px';

      var playerType = statsEngine.getPlayerType(p.name);
      var typeClass = 'wpt-type-' + playerType.toLowerCase();
      badge.innerHTML =
        '<div class="wpt-badge-stats">' +
          '<span class="wpt-stat-vpip">' + stats.vpip + '</span>/' +
          '<span class="wpt-stat-pfr">' + stats.pfr + '</span>/' +
          '<span class="wpt-stat-af">' + stats.af + '</span>' +
          '<span class="wpt-stat-hands">(' + stats.hands + ')</span>' +
          '<span class="wpt-player-type ' + typeClass + '">' + playerType + '</span>' +
        '</div>' +
        '<div class="wpt-badge-tooltip">' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">VPIP:</span><span class="wpt-tooltip-value">' + stats.vpip + '%</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">PFR:</span><span class="wpt-tooltip-value">' + stats.pfr + '%</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">AF:</span><span class="wpt-tooltip-value">' + stats.af + '</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">3-Bet:</span><span class="wpt-tooltip-value">' + stats.threeBet + '%</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">WTSD:</span><span class="wpt-tooltip-value">' + stats.wtsd + '%</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">C-Bet:</span><span class="wpt-tooltip-value">' + stats.cBet + '%</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">F2CB:</span><span class="wpt-tooltip-value">' + stats.foldToCBet + '%</span></div>' +
          '<div class="wpt-tooltip-row"><span class="wpt-tooltip-label">Hands:</span><span class="wpt-tooltip-value">' + stats.hands + '</span></div>' +
        '</div>';
    }
    for (var id in this._badges) {
      if (!activeBadges[id]) {
        this._badges[id].remove();
        delete this._badges[id];
      }
    }
  };

  // ============================================================
  // Helpers
  // ============================================================
  TerminalUI.prototype._setText = function(id, text) {
    var el = this._shadow.getElementById(id);
    if (el) el.textContent = text;
  };

  TerminalUI.prototype._buildSparkline = function(data) {
    if (!data || data.length < 2) return '';

    var w = Math.min(this._size.w - 40, 340);
    var h = 30;
    var stacks = data.map(function(d) { return d.stack; });
    var min = Math.min.apply(null, stacks);
    var max = Math.max.apply(null, stacks);
    var range = max - min || 1;

    var points = [];
    for (var i = 0; i < data.length; i++) {
      var x = (i / (data.length - 1)) * w;
      var y = h - ((stacks[i] - min) / range) * (h - 4) - 2;
      points.push(x.toFixed(1) + ',' + y.toFixed(1));
    }

    var lastStack = stacks[stacks.length - 1];
    var firstStack = stacks[0];
    var color = lastStack >= firstStack ? '#22c55e' : '#ef4444';

    return '<svg width="' + w + '" height="' + h + '" style="display:block">' +
      '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5" />' +
    '</svg>';
  };

  // ============================================================
  // destroy()
  // ============================================================
  TerminalUI.prototype.destroy = function() {
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
    if (this._storageListener) {
      window.removeEventListener('message', this._storageListener);
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._host) {
      this._host.remove();
      this._host = null;
    }
    this._shadow = null;
    this._panel = null;
    this._pill = null;
    this._badges = {};
  };

  return TerminalUI;
})();

window.TerminalUI = TerminalUI;
