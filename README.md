# ClubWPT Poker Terminal

Real-time poker analytics HUD for ClubWPT Gold.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `clubwpt-poker-terminal` folder (the one containing `manifest.json`)
6. Navigate to [ClubWPT Gold](https://clubwptgold.com) and join a table — the HUD will appear automatically

## Features

- **Equity simulation** — Monte Carlo equity vs opponent ranges, updated in real-time
- **GTO preflop ranges** — Position-aware open/3-bet/4-bet recommendations
- **Action recommendations** — Raise/call/fold with confidence level and rationale
- **Vulnerability analysis** — Detects flush draws, straight draws, overcards, and board pairing threats against your hand
- **Board texture** — Wet/dry classification, connectedness, and flush/straight potential
- **Outs & draws** — Flush draws, straight draws, and improvement odds
- **SPR & bet sizing** — Stack-to-pot ratio with suggested bet sizes
- **Session tracking** — P&L, BB/hr, BB/100, VPIP/PFR, with sparkline graph
- **Player stats** — VPIP/PFR/AF badges on each opponent
