# Browser Brawl

**Train browser agents like GANs — by making them fight.**

One AI agent (the attacker) tries to complete a task on a real webpage. Another AI agent (the defender) tries to block it with JavaScript injections. They compete in real time inside a cloud browser. Every match produces rich, structured training data — tool calls, DOM snapshots, screenshots, full conversation traces — that you can use to fine-tune smaller browser models.

We've proven this works: traces from Browser Brawl fine-tune Qwen2.5-3B into a capable browser agent. Two wins out of two games on Hacker News upvote with a single training example.

> Built at the [Browser Use](https://browser-use.com) Web Agents Hackathon at [Y Combinator](https://events.ycombinator.com/browser-use-hackathon), San Francisco — Feb 28–Mar 1, 2026.

---

## The Idea: Adversarial Data Generation for Browser Agents

Browser agent training data is expensive. You either pay humans to label trajectories or you script narrow synthetic tasks. Both are slow, brittle, and boring.

We took inspiration from **Generative Adversarial Networks** (Goodfellow et al., 2014). In a GAN, a generator learns to produce realistic outputs by competing against a discriminator that tries to distinguish real from fake. The adversarial pressure forces both networks to improve — the generator produces increasingly realistic data, and the discriminator becomes a better judge.

Browser Brawl applies this intuition to browser agents:

| GAN | Browser Brawl |
|-----|---------------|
| **Generator** produces realistic data | **Attacker** navigates real websites, completes tasks |
| **Discriminator** tries to catch fakes | **Defender** disrupts the page with JS injections |
| Adversarial pressure improves both | Harder disruptions force richer, more resilient trajectories |
| Training signal from the competition | Training data from every match — win or lose |

The analogy isn't perfect — there's no shared gradient, no minimax objective, and the agents don't co-train in a single loop. But the core insight holds: **adversarial competition between agents produces richer, more diverse training data than either agent would generate alone.** The defender forces the attacker to recover from popups, hidden buttons, scroll hijacks, and DOM mutations — exactly the kind of edge cases that make browser agents robust.

The result: a scalable, configurable pipeline that turns a fun game into high-quality training data.

---

## How It Works

```mermaid
flowchart LR
  subgraph Lobby
    L1[Pick task]
    L2[Pick difficulty]
    L3[Pick framework]
    L4[Start match]
  end

  subgraph Arena
    A1[Attacker<br/>Playwright MCP / Browser-Use / Stagehand]
    A2[Cloud browser live view]
    A3[Defender<br/>Haiku + CDP injection]
    A1 --> A2
    A3 --> A2
    A2 -. SSE stream .-> C1
  end

  subgraph TrainingPipeline["Training Pipeline"]
    C1[Convex DB<br/>conversations, steps/screenshots,<br/>disruptions/DOM, health timeline]
    C2[extract -> convert -> ShareGPT JSONL]
    C1 --> C2
  end

  L4 --> A1
```

1. **Lobby** — Pick a task (Amazon shopping, Google Flights, Hacker News, etc.) and difficulty level
2. **Arena** — Both agents run concurrently. The attacker navigates the real website with Playwright. The defender injects JavaScript disruptions via CDP. Health drains over time and on each hit.
3. **Game Over** — Attacker wins by completing the task. Defender wins by depleting health to zero.
4. **Data** — Every match records full Claude conversations, tool calls, DOM snapshots, screenshots, and video to Convex for training data extraction.

---

## Features

### Game
- Real-time adversarial matches between two AI agents in a cloud browser
- 4 difficulty levels controlling defender aggression, health decay, and disruption pool
- 9 prebuilt JavaScript disruptions + AI-generated custom injections
- Live browser view embedded in the arena via iframe
- SSE streaming with full reconnection replay
- Turn-based mode for step-by-step analysis
- Cyberpunk neon UI with glitch animations, health bar shake, CRT scanlines

### History & Replay
- Paginated session list with difficulty/winner filters
- Step-by-step replay with full tool input/output, DOM snapshots, before/after screenshots
- Video player with play/pause, speed control (1x/2x/4x), scrubber
- CSV export for sessions and disruption effectiveness analysis

### Disruptions
| Disruption | Damage | What it does |
|-----------|--------|-------------|
| Session Expired Popup | 8 HP | Fullscreen fake "session expired" overlay |
| Fake Loading Spinner | 6 HP | Blocks viewport for 7 seconds |
| Button Camouflage | 8 HP | Makes all buttons invisible for 10 seconds |
| Scroll Hijack | 10 HP | Randomly scrolls the page for 6 seconds |
| Custom Injection (AI) | 15 HP | Haiku reads the DOM and generates targeted JS |
| Dialog Barrage | 12 HP | Three staggered confirmation dialogs |
| Element Obliterator | 20 HP | Removes submit buttons from the DOM |
| Visual Chaos | 15 HP | Shakes the entire page for 8 seconds |
| Coordinated Assault | 30 HP | Hides nav + redirect countdown + click blocker |

### Data Collection
- Full Claude conversation persistence (messages, tool calls, tool results — untruncated)
- Before/after screenshots via CDP on every step
- DOM snapshots (50 interactive elements with positions, IDs, classes)
- Health timeline with labeled deltas (decay vs. disruption damage)
- Network request logging (method, URL, status, size)
- Session video via CDP screencast (~1fps JPEG frames)
- Laminar auto-traces on all LLM calls

### One-Click Training Pipeline

Select games on the history page, click **Kickoff Finetune**, and the full pipeline runs automatically — no Python environment or CLI needed.

```mermaid
flowchart TD
  subgraph UI["Browser UI"]
    H["/history\nselect games → Kickoff Finetune"]
    T["/training\nlive status dashboard"]
    L["Lobby\nBYOM toggle + endpoint URL"]
  end

  subgraph API["Next.js API Route"]
    S["POST /api/training/start\nfetch conversations from Convex\nconvert: Anthropic → ShareGPT → OpenAI Messages"]
  end

  subgraph Convex["Convex"]
    DB["conversations table\nfull Claude messages + tool calls"]
    FS["file storage\nJSONL training blob"]
    JT["trainingJobs table\nstatus + step/loss metrics"]
  end

  subgraph Modal["Modal — GPU Cloud"]
    K["kickoff endpoint\nweb fn, spawns GPU job"]
    TR["train\nUnsloth QLoRA on A10G\nQwen2.5-3B-Instruct"]
    MG["merge\nLoRA adapter → base model"]
    SV["serve\nvLLM endpoint, OpenAI-compatible"]
  end

  H --> S
  S -->|query| DB
  S -->|upload JSONL| FS
  FS -->|download URL| S
  S -->|fire-and-forget POST| K
  K -->|spawn async| TR
  TR -->|status callbacks| JT
  TR --> MG
  MG --> SV
  JT -->|useQuery live updates| T
  SV -->|serve URL| T
  T -->|paste URL| L
  L -->|fight with fine-tuned model| L
```

Status transitions streamed live to `/training` via Convex subscriptions: `preparing → uploading → training → merging → ready`.

### Bring Your Own Model (BYOM)

Once you have a fine-tuned model, close the loop — fight with it directly in the game.

1. In the lobby, enable **Bring Your Own Model**
2. Paste your vLLM endpoint URL (OpenAI-compatible — e.g. the serve URL from `/training`)
3. Hit **FIGHT** — the fine-tuned model controls the attacker using the same Playwright MCP tool interface it was trained on

The model outputs `<tool_call>` XML matching the training data format. Results return as `<tool_response>` XML. Cold start handling built in: a warm-up ping fires during browser creation to overlap the ~2min Modal cold start with the ~8s browser spin-up.

This closes the self-improvement loop: **play games → collect traces → train model → fight with that model → generate harder traces → repeat.**

### Training Pipeline (CLI)
- `extract-training-data.ts` — Pull successful game trajectories from Convex as raw JSONL
- `convert-to-sharegpt.ts` — Convert Anthropic tool format to Qwen2.5-compatible ShareGPT format
- `eval_browser_brawl.py` — Compare fine-tuned Qwen vs Claude Sonnet baseline across N games
- `eval-miniwob.ts` — Out-of-distribution eval on MiniWob++ benchmark tasks
- Quality filters (minimum tool call count, success-only)
- Proven end-to-end: Convex → JSONL → ShareGPT → Qwen2.5-3B fine-tuning (QLoRA via Unsloth)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| **LLM** | Anthropic SDK — Claude Sonnet 4.6 (attacker), Claude Haiku 4.5 (defender) |
| **Cloud Browsers** | Browser-Use API (managed sessions with CDP + live view) |
| **Real-time Streaming** | Server-Sent Events (SSE) |
| **Database & Storage** | [Convex](https://convex.dev) (real-time DB + file storage) |
| **LLM Observability** | [Laminar](https://www.lmnr.ai) (auto-traces all Anthropic calls) |
| **Protocol** | [Model Context Protocol (MCP)](https://modelcontextprotocol.io) |
| **Fine-tuning** | Unsloth QLoRA on Modal A10G — Qwen2.5-3B-Instruct |
| **Serving** | vLLM on Modal, OpenAI-compatible API |
| **Testing** | Vitest |

### Supported Browser Agent Frameworks

The attacker agent is framework-agnostic — pick the one you prefer:

| Framework | How it works |
|-----------|-------------|
| [**Playwright MCP**](https://github.com/anthropics/mcp) | Spawns a Playwright MCP server connected to the cloud browser via CDP. Full tool suite (click, type, navigate, snapshot, etc.) |
| [**Browser-Use SDK**](https://browser-use.com) | Uses Browser-Use's built-in agent API for browser control |
| [**Stagehand**](https://github.com/browserbase/stagehand) | Browserbase's AI-native browser automation framework |
| [**Fine-tuned Qwen**](scripts/modal_train_pipeline.py) | Your own Qwen2.5-3B fine-tuned on Browser Brawl traces, served via vLLM. Enable via the BYOM toggle in the lobby. |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in your API keys (see below)

# Start Convex (in a separate terminal)
npx convex dev

# Start the app
npm run dev
```

### Environment Variables

Create `.env.local` with:

```
ANTHROPIC_API_KEY=sk-ant-...
BROWSER_USE_API_KEY=bu_...
LMNR_PROJECT_API_KEY=...
NEXT_PUBLIC_CONVEX_URL=https://...convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://...convex.site

# Optional: Product analytics/session recording with PostHog
# NEXT_PUBLIC_POSTHOG_KEY=phc_...
# Optional (defaults to US cloud if omitted)
# NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Required for one-click training pipeline
MODAL_TRAIN_ENDPOINT=https://your-workspace--browser-brawl-train-pipeline-kickoff.modal.run
```

### Training Pipeline

**One-click (recommended):**
1. Play games and collect successful traces
2. Go to `/history`, select winning sessions, click **Kickoff Finetune**
3. Watch live progress on `/training` (`preparing → uploading → training → merging → ready`)
4. Copy the serve URL from `/training` → paste into the lobby BYOM field → **FIGHT**

**Deploy Modal endpoints first (one-time setup):**
```bash
modal deploy scripts/modal_train_pipeline.py   # training + kickoff endpoint
modal deploy scripts/modal_serve.py            # vLLM inference endpoint (all experiments)
```

**Manual CLI:**
```bash
# Pull successful game trajectories from Convex
npx tsx scripts/extract-training-data.ts -o data/raw.jsonl

# Convert to ShareGPT format
npx tsx scripts/convert-to-sharegpt.ts -i data/raw.jsonl -o data/train.jsonl

# Run fine-tuning directly
modal run scripts/modal_finetune.py --text-only
```

**Evaluate:**
```bash
# In-distribution: fine-tuned Qwen vs Claude Sonnet baseline
python scripts/eval_browser_brawl.py --games 10 --task hackernews-upvote

# Out-of-distribution: MiniWob++ benchmark
npx tsx scripts/eval-miniwob.ts --finetuned-url <URL> --miniwob-dir ../miniwob-plusplus/miniwob/html
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/game/start` | POST | Create browser session, start both agents |
| `/api/game/tasks` | GET | List available tasks |
| `/api/game/[sessionId]/events` | GET | SSE event stream (replays history on reconnect) |
| `/api/game/[sessionId]/status` | GET | Current game state snapshot |
| `/api/game/[sessionId]/abort` | POST | Stop game, clean up resources |
| `/api/training/start` | POST | Kick off full training pipeline (convert → upload → Modal GPU train) |
| `/api/export/sessions` | GET | CSV download of all sessions |
| `/api/export/disruptions` | GET | CSV download of all defender actions |
| `/api/export/training` | GET | Download selected sessions as ShareGPT JSONL |

---

## Difficulty Levels

| Level | Defender Interval | Health Decay/s | Disruptions Available |
|-------|-------------------|----------------|----------------------|
| Easy | 20s | 0.05 | 2 |
| Medium | 10s | 0.2 | 5 |
| Hard | 5s | 0.4 | 7 |
| Nightmare | 2.5s | 0.8 | All 9 |

---

## Project Structure

```
src/
├── app/                          # Next.js pages + API routes
│   ├── api/game/                 # Game lifecycle endpoints
│   ├── api/training/             # One-click training pipeline endpoint
│   ├── api/export/               # CSV + JSONL export endpoints
│   ├── history/                  # Replay UI (session list + detail viewer)
│   ├── training/                 # Live training dashboard
│   └── page.tsx                  # Main game page (lobby → arena → game over)
├── components/
│   ├── lobby/                    # Task selector, difficulty picker, fighter select, BYOM toggle
│   ├── arena/                    # Health bar, browser frame, agent panels
│   ├── end/                      # Winner banner
│   └── shared/                   # Glitch text, neon borders, loading screen
├── hooks/                        # useGameState, useGameSSE, useArenaTimer, useHealthBar
├── lib/
│   ├── attacker-playwright.ts    # Attacker: Playwright MCP + Claude Sonnet loop
│   ├── attacker-finetuned.ts     # Attacker: fine-tuned Qwen via vLLM (BYOM)
│   ├── attacker-stagehand.ts     # Attacker: Stagehand alternative
│   ├── browser-use-attacker.ts   # Attacker: Browser-Use SDK alternative
│   ├── defender-agent.ts         # Defender: Haiku + JS injection loop
│   ├── disruptions.ts            # 9 prebuilt disruptions + cooldown system
│   ├── cdp.ts                    # CDP WebSocket: injectJS, snapshotDOM
│   ├── data-collector.ts         # Fire-and-forget Convex mutations
│   ├── training-converter.ts     # Anthropic native → ShareGPT → OpenAI Messages
│   ├── screencast.ts             # CDP screencast frame capture
│   ├── sse-emitter.ts            # SSE broadcast to connected clients
│   └── game-session-store.ts     # In-memory session state
├── types/                        # TypeScript interfaces
convex/                           # Convex schema, mutations, queries, HTTP endpoint
scripts/
├── extract-training-data.ts      # Pull trajectories from Convex as JSONL
├── convert-to-sharegpt.ts        # Anthropic tool format → ShareGPT
├── modal_train_pipeline.py       # Modal: kickoff web endpoint + GPU training function
├── modal_serve.py                # Modal: vLLM inference endpoint (all experiments)
├── modal_finetune.py             # Modal: manual CLI fine-tuning alternative
├── eval_browser_brawl.py         # Eval: fine-tuned vs baseline across Browser Brawl tasks
└── eval-miniwob.ts               # Eval: MiniWob++ out-of-distribution benchmark
defender/                         # Standalone defender CLI (legacy prototype)
```

---

## Collaborators

- **Richard Hruby** — [GitHub](https://github.com/RichardHruby)
- **Mehul Kalia** — [GitHub](http://github.com/mehulkalia/)

---

## Acknowledgments

Built at the [Browser Use](https://browser-use.com) Web Agents Hackathon at [Y Combinator](https://events.ycombinator.com/browser-use-hackathon), San Francisco.

Sponsored by Anthropic, OpenAI, Vercel, Convex, and Browser Use.

Theoretical inspiration from: Goodfellow, I. J., et al. (2014). *Generative Adversarial Nets.* NeurIPS. [arXiv:1406.2661](https://arxiv.org/abs/1406.2661)
