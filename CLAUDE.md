# Browser Brawl

Cat vs Mouse browser agent game — one AI agent (mouse) tries to complete a task on a webpage, another AI agent (cat) tries to block it.

## Tech Stack

- **Frontend:** Next.js 16 + TypeScript + Tailwind CSS 4
- **Backend/Agents:** TypeScript/Node.js (all in Next.js API routes)
- **Browser Infrastructure:** Browser-Use API (cloud browser with CDP + live view)
- **AI Models:** Anthropic SDK — Claude Sonnet 4 (attacker) + Claude Haiku 4.5 (defender)
- **Browser Automation:** Playwright MCP (attacker) + CDP WebSocket injection (defender)
- **Real-time:** Server-Sent Events (SSE) for streaming to frontend

## Environment Variables

All in `.env.local` (gitignored):

- `ANTHROPIC_API_KEY` — Claude API key for both agents
- `BROWSER_USE_API_KEY` — Browser-Use API key for managed browser sessions
- `BROWSERBASE_API_KEY` — Browserbase API key (used by defender CDP injection)
- `BROWSERBASE_PROJECT_ID` — Browserbase project identifier

**Note:** Shell-level `ANTHROPIC_API_KEY` overrides `.env.local` in Next.js. If you get credit errors, run `unset ANTHROPIC_API_KEY` before `yarn dev`.

## Game Flow

1. **Lobby** — user picks task + difficulty → POST `/api/game/start`
2. **Loading** (~8s) — Browser-Use creates managed cloud browser
3. **Arena** — attacker + defender run concurrently with SSE streaming
4. **Game Over** — winner announced when health ≤ 0 (defender wins) or attacker completes task (attacker wins)

## Architecture

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/game/start` | POST | Create browser, init session, start both agents |
| `/api/game/tasks` | GET | Return predefined task list |
| `/api/game/[sessionId]/events` | GET | SSE stream (replays history on reconnect) |
| `/api/game/[sessionId]/status` | GET | Snapshot of current game state |
| `/api/game/[sessionId]/abort` | POST | Stop game, clean up resources |

### Attacker Agent (Mouse) — `src/lib/attacker-agent.ts`

- **Model:** `claude-sonnet-4-20250514`
- **Browser control:** Playwright MCP spawned as subprocess via `StdioClientTransport`
- **Loop:** Snapshot → Claude reasons → tool calls (click, type, navigate, etc.) → repeat (max 50 steps)
- **Completion:** Claude outputs "TASK COMPLETE" in response
- **SSE:** Emits `attacker_step` events with step number and description

### Defender Agent (Cat) — `src/lib/defender-agent.ts`

- **Model:** `claude-haiku-4-5-20251001` (fast, cheap)
- **Frequency:** Difficulty-scaled interval (easy: 20s, medium: 10s, hard: 5s, nightmare: 2.5s)
- **Hybrid disruptions:** 8 predefined JS injections + AI-generated custom injections (`src/lib/disruptions.ts`)
- **Two-phase turn:** Phase 1 — Haiku picks disruption (prebuilt or `custom-injection`). Phase 2 (custom only) — `snapshotDOM()` captures 50 interactive elements, second Haiku call generates targeted JS based on DOM + attacker context
- **Custom injection pipeline:** `snapshotDOM()` → LLM generates JS → `wrapCustomInjection()` (try/catch safety wrapper) → `injectJS()` via CDP. Falls back to prebuilt if generation fails.
- **Injection:** CDP `Runtime.evaluate` via WebSocket to page target (`src/lib/browserbase.ts`)
- **DOM snapshots:** `snapshotDOM()` extracts up to 50 visible interactive elements (tag, text, id, classes, type, href, position) via `evaluateAndReturnViaCDP()`
- **Cooldowns:** 12s–45s per disruption type to prevent spam
- **Passive decay:** Health drains every second (0.05–0.8 HP/s by difficulty)

### Browser Integration

- **Browser-Use API** (`src/lib/browser-use-api.ts`): Creates managed browser sessions, returns `cdpUrl` + `liveViewUrl`
- **Attacker** connects via Playwright MCP over CDP
- **Defender** injects JS via raw WebSocket to CDP `Runtime.evaluate` (`src/lib/browserbase.ts`); also reads DOM via `snapshotDOM()` for custom injections
- **Frontend** embeds `liveViewUrl` in an iframe (`src/components/arena/BrowserFrame.tsx`)

### Env / Config

- **`src/lib/env.ts`** — Reads `.env.local` with priority over shell env vars (fixes issue where shell `ANTHROPIC_API_KEY` overrides Next.js `.env.local`)
- Both agents use `getAnthropicApiKey()` from this module

### State Management

- **Server:** In-memory session store (`src/lib/game-session-store.ts`) — Map of gameId → session
- **Client:** `useGameState` reducer hook (phase, health, steps, disruptions)
- **SSE:** `src/lib/sse-emitter.ts` broadcasts events; `useGameSSE` hook consumes them
- **Reconnection:** Server replays all historical events on new SSE connection

## Frontend

### UI Design

- Cyberpunk neon theme — cyan (attacker) + red (defender) color coding
- Fonts: Orbitron (display), Rajdhani (game), JetBrains Mono (code)
- Animations: glitch text, health bar shake, neon pulse, CRT scanline overlay
- Responsive 3-panel arena: AttackerPanel | BrowserFrame | DefenderPanel

### Key Components

- `src/components/lobby/` — Task selector, difficulty picker, start button
- `src/components/arena/` — Health bar, timer, browser iframe, agent feeds
- `src/components/end/` — Winner banner overlay
- `src/components/shared/` — Loading screen, glitch text, neon border

### Hooks

- `useGameState` — Reducer-based state machine (lobby → loading → arena → game_over)
- `useGameSSE` — EventSource connection + event dispatch
- `useArenaTimer` — Elapsed time display (MM:SS)
- `useHealthBar` — Shake animation on damage, color transitions

## Tasks (Predefined)

1. **Amazon Toothpaste** — Search Amazon, add Sensodyne toothpaste to cart
2. **Google Flights** — Find cheapest JFK→LAX flight for next Friday
3. **Hacker News Upvote** — Upvote top post on news.ycombinator.com
4. **TechCrunch Newsletter** — Sign up for newsletter with test@browserbrawl.com
5. **Custom** — User-defined task description

## Disruptions

| ID | Name | HP Damage | Cooldown | Min Difficulty |
|----|------|-----------|----------|----------------|
| `popup-overlay` | Session Expired Popup | 8 | 12s | easy |
| `fake-loading-spinner` | Fake Loading Screen | 6 | 15s | easy |
| `button-camouflage` | Button Camouflage | 8 | 18s | medium |
| `scroll-hijack` | Scroll Hijack | 10 | 20s | medium |
| `custom-injection` | Custom Injection (AI) | 15 | 20s | medium |
| `modal-dialog` | Dialog Barrage | 12 | 25s | hard |
| `element-removal` | Element Obliterator | 20 | 30s | hard |
| `animation-flood` | Visual Chaos | 15 | 25s | nightmare |
| `coordinated-assault` | Coordinated Assault | 30 | 45s | nightmare |

## Difficulty Levels

| Level | Defender Interval | Health Decay/s | Disruptions Available |
|-------|-------------------|----------------|----------------------|
| Easy | 20s | 0.05 | 2 (popup, spinner) |
| Medium | 10s | 0.2 | 5 (+ button camo, scroll hijack, custom injection) |
| Hard | 5s | 0.4 | 7 (+ dialog barrage, element removal) |
| Nightmare | 2.5s | 0.8 | All 9 (+ animation flood, coordinated assault) |

## Standalone Defender CLI (Legacy Prototype)

Standalone CLI in `defender/src/` — separate from the integrated game.

- **Entry:** `npm run defend -- "<url>" "<goal>"`
- **Script:** `node --import tsx/esm defender/src/index.ts`
- **TypeScript:** Uses `tsconfig.defender.json` (`module: NodeNext`), separate from root tsconfig
- **Windows:** Uses `npx.cmd` instead of `npx` on `win32`

### Files
- `defender/src/index.ts` — CLI entrypoint, .env.local loader
- `defender/src/defender-agent.ts` — MCP client setup, agent loop

## Current Status

The game is fully playable end-to-end:
- Attacker (Claude Sonnet 4) successfully completes tasks like adding items to cart on Amazon/Target
- Defender (Claude Haiku 4.5) fires a mix of prebuilt and custom injections, all consistently hitting
- Custom injections generate targeted JS that hides search results, disables add-to-cart buttons, blocks clicks, etc.
- Health system works — defender wins by depleting health, attacker wins by completing the task
- SSE streaming, live browser view, and game over detection all functional

### Known Issues
- Attacker can still complete tasks on easy/medium difficulty before health runs out

## Future Directions

### Defender Improvements
- **Reactive defender:** Trigger disruptions based on attacker actions (e.g., detect navigation to cart → immediately fire disruption) instead of fixed timer intervals
- **Learning from failures:** Track which disruptions the attacker recovers from quickly vs. which actually slow it down, and bias future picks accordingly
- **Escalating difficulty:** Start with lighter disruptions and escalate to heavier ones as the game progresses or as attacker gets closer to completion
- **DOM-aware prebuilt disruptions:** Feed DOM context into prebuilt disruptions too (e.g., `element-removal` could target the specific button the attacker is about to click)

### Attacker Improvements
- **Model selection per difficulty:** Use weaker models (Haiku) on hard difficulty, stronger (Opus) on easy, to balance the game
- **Resilience prompting:** Give the attacker hints about dealing with disruptions (e.g., "if something seems off, try refreshing or re-navigating")
- **Task completion verification:** Actually verify the task was completed (e.g., check cart contents) instead of trusting Claude's "TASK COMPLETE" self-report

### Game Features
- **Persistent storage** for game replays / leaderboards (Supabase or similar)
- **Spectator mode** — share a link to watch a live game
- **More task templates** — flight booking, form filling, social media actions
- **Custom task builder** — let users define their own tasks with start URL + goal + success criteria
- **Difficulty auto-tuning** — adjust defender aggressiveness based on win rate
- **Turn-based mode** — original CLAUDE.md design where defender sets traps, then attacker acts, alternating

### Infrastructure
- **Browser session pooling** — pre-warm browsers to reduce 8s loading time
- **Rate limiting** — prevent API abuse (currently no auth or limits)
- **Error recovery** — reconnect CDP WebSocket on disconnect, retry failed LLM calls
- **Cleanup** — ensure Browser-Use sessions are always terminated (even on server crash)
