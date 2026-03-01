# MiniWob++ Benchmark Evaluation

## What We Built

Standalone TypeScript eval harness (`scripts/eval-miniwob.ts`) that runs fine-tuned Qwen2.5-3B against MiniWob++ browser tasks and compares with vanilla Qwen and Claude Sonnet.

### Why MiniWob++ (not BrowserGym/WebArena)

The fine-tuned model was trained on Playwright MCP's 22 tool schemas with `<tool_call>` XML format. BrowserGym uses a completely different action space (`click('id')`, `fill('id', 'text')`) — would require retraining. MiniWob++ tasks are self-contained HTML files we can serve locally and interact with via the same Playwright MCP tools.

### Files Created

| File | Purpose |
|------|---------|
| `scripts/eval-miniwob.ts` | Main eval harness (~900 lines) |
| `scripts/miniwob-tasks.ts` | 25 curated tasks across 5 categories |
| `package.json` | Added `playwright-core` devDep + `eval:miniwob` script |
| `CLAUDE.md` | Added MiniWob++ eval section |

### How It Works

1. Static HTTP server serves MiniWob++ HTML files locally
2. Chromium launches with `--remote-debugging-port` for Playwright MCP
3. Per episode: navigate to task → `core.startEpisodeReal()` → read utterance → spawn MCP → agent loop → check `WOB_RAW_REWARD_GLOBAL`
4. **Qwen agent loop:** system prompt (from `training-converter.ts`) → model call → parse `<tool_call>` XML → execute via MCP → format `<tool_response>` XML → repeat
5. **Sonnet agent loop:** native Anthropic API with `tool_use` blocks → execute via MCP → `tool_result` blocks → repeat
6. Three termination conditions: `WOB_DONE_GLOBAL` (task validator fired), model says "TASK COMPLETE", or max steps
7. Metrics: pass rate by task, category, difficulty + side-by-side comparison table (2-way or 3-way)

### Verified Working (smoke tests)

- Static server serves MiniWob++ HTML/JS/CSS correctly
- `core.startEpisodeReal()` starts episodes, `core.getUtterance()` returns instructions
- Playwright MCP connects via CDP, discovers 22 tools, sees MiniWob++ page
- Accessibility snapshot returns element refs (`button "ok" [ref=e10]`)
- `WOB_DONE_GLOBAL` / `WOB_RAW_REWARD_GLOBAL` readable for reward checking
- Script compiles and runs (exits with validation error when no endpoint URL — expected)

## CLI Reference

### Flags

| Flag | Description |
|------|-------------|
| `--finetuned-url <URL>` | Fine-tuned model endpoint URL |
| `--vanilla-url <URL>` | Vanilla model endpoint URL |
| `--finetuned-api-key <KEY>` | API key for fine-tuned endpoint (Bearer auth) |
| `--vanilla-api-key <KEY>` | API key for vanilla endpoint (Bearer auth) |
| `--finetuned-model <ID>` | Model ID for fine-tuned endpoint |
| `--vanilla-model <ID>` | Model ID for vanilla endpoint |
| `--sonnet` | Run Claude Sonnet 4 evaluation |
| `--anthropic-api-key <KEY>` | Anthropic API key (or use `ANTHROPIC_API_KEY` env var) |
| `--miniwob-dir <path>` | Path to `miniwob-plusplus/miniwob/html/` (required) |
| `--tasks <id1,id2,...>` | Comma-separated task IDs (default: all 25) |
| `--episodes <N>` | Episodes per task (default: 3) |
| `--max-steps <N>` | Override max steps per episode |
| `--port <N>` | HTTP server port (default: 8765) |
| `--cdp-port <N>` | Chrome DevTools Protocol port (default: 9222) |
| `--headless` | Run browser headless |
| `--record` | Record per-episode .webm video |
| `--record-dir <path>` | Video output directory (default: data/recordings) |
| `--output <path>` | Save results JSON |
| `--finetuned-only` | Only run fine-tuned model |
| `--vanilla-only` | Only run vanilla model |
| `--sonnet-only` | Only run Sonnet |

## Running Evaluations

### 1. Fine-tuned Qwen2.5-3B (Modal vLLM)

The fine-tuned model is served via Modal vLLM with a custom `/chat` endpoint.

```bash
npx tsx scripts/eval-miniwob.ts \
  --finetuned-url "https://mehulkalia--browser-brawl-serve-model-chat.modal.run?experiment_name=text-20260228-2221" \
  --finetuned-only \
  --miniwob-dir ../miniwob-plusplus/miniwob/html \
  --tasks click-button \
  --episodes 1
```

### 2. Vanilla Qwen (baseline comparison)

**No managed provider serves Qwen2.5-3B-Instruct** (too small for serverless hosting). Options:

#### Option A: Together AI with Qwen2.5-7B-Instruct (easiest, ~2 min setup)

Sign up at [together.ai](https://together.ai), get API key, then:

```bash
npx tsx scripts/eval-miniwob.ts \
  --vanilla-url "https://api.together.xyz/v1/chat/completions" \
  --vanilla-api-key "YOUR_TOGETHER_API_KEY" \
  --vanilla-model "Qwen/Qwen2.5-7B-Instruct-Turbo" \
  --vanilla-only \
  --miniwob-dir ../miniwob-plusplus/miniwob/html \
  --episodes 3
```

> Note: This is 7B, not 3B. The comparison is "our fine-tuned 3B vs vanilla 7B" — if the 3B matches or beats the 7B, that's a strong result.

Other providers with Qwen 7B:
- **Fireworks:** `--vanilla-url https://api.fireworks.ai/inference/v1/chat/completions --vanilla-model accounts/fireworks/models/qwen2p5-7b-instruct`
- **DeepInfra:** `--vanilla-url https://api.deepinfra.com/v1/openai/chat/completions --vanilla-model Qwen/Qwen2.5-7B-Instruct`

#### Option B: Deploy vanilla 3B on Modal (apples-to-apples, ~10 min setup)

Use the existing `scripts/modal_serve.py` from the training-pipeline branch with `Qwen/Qwen2.5-3B-Instruct` from HuggingFace instead of a fine-tuned checkpoint.

#### Option C: Local vLLM (free, needs GPU)

```bash
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-3B-Instruct \
  --max-model-len 32768 \
  --port 8000

# Then:
npx tsx scripts/eval-miniwob.ts \
  --vanilla-url "http://localhost:8000/v1/chat/completions" \
  --vanilla-model "Qwen/Qwen2.5-3B-Instruct" \
  --vanilla-only \
  --miniwob-dir ../miniwob-plusplus/miniwob/html
```

### 3. Claude Sonnet 4 (ceiling comparison)

```bash
npx tsx scripts/eval-miniwob.ts \
  --sonnet \
  --sonnet-only \
  --miniwob-dir ../miniwob-plusplus/miniwob/html \
  --episodes 3 \
  --output data/miniwob_sonnet.json
```

Uses `ANTHROPIC_API_KEY` env var or `--anthropic-api-key` flag.

### Full 3-way comparison

```bash
npx tsx scripts/eval-miniwob.ts \
  --finetuned-url "https://mehulkalia--browser-brawl-serve-model-chat.modal.run?experiment_name=text-20260228-2221" \
  --vanilla-url "https://api.together.xyz/v1/chat/completions" \
  --vanilla-api-key "$TOGETHER_API_KEY" \
  --vanilla-model "Qwen/Qwen2.5-7B-Instruct-Turbo" \
  --sonnet \
  --miniwob-dir ../miniwob-plusplus/miniwob/html \
  --episodes 3 \
  --record \
  --output data/miniwob_results.json
```

## Before Running Evals

- [x] Build eval harness with Playwright MCP agent loop
- [x] Add Sonnet support (native `tool_use` via Anthropic SDK)
- [x] Add API key/model ID support for OpenAI-compatible endpoints
- [ ] Ensure Modal fine-tuned endpoint is deployed and warm
- [ ] Pick vanilla endpoint option (A/B/C above)
- [ ] Run evaluations

## Follow-up: WebArena-Verified Hard (next benchmark)

After MiniWob++, the next easiest benchmark is WebArena-Verified Hard (137 tasks):
- Self-hosted Docker containers (e-commerce, forum, GitLab, CMS)
- Same Playwright MCP tool interface — no action space translation needed
- E-commerce tasks directly overlap with Amazon training data
- Needs ~16GB RAM for Docker containers
- Setup: `pip install browsergym-webarena` + Docker

### Key Reference

- WebWorld paper (Feb 2026): fine-tuning Qwen3-8B on 8K synthetic browser trajectories gave +9.9% on MiniWob++, +10.9% on WebArena
- Our model is 3B (smaller) with fewer training examples — realistic expectation: +3-7% on MiniWob++
- The story: "3B open-source model fine-tuned on adversarial Browser Brawl game data generalizes to standard benchmarks"
