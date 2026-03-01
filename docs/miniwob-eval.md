# MiniWob++ Benchmark Evaluation

## What We Built

Standalone TypeScript eval harness (`scripts/eval-miniwob.ts`) that runs fine-tuned Qwen2.5-3B against MiniWob++ browser tasks and compares with vanilla Qwen and Claude Sonnet.

### Why MiniWob++ (not BrowserGym/WebArena)

The fine-tuned model was trained on Playwright MCP's 22 tool schemas with `<tool_call>` XML format. BrowserGym uses a completely different action space (`click('id')`, `fill('id', 'text')`) — would require retraining. MiniWob++ tasks are self-contained HTML files we can serve locally and interact with via the same Playwright MCP tools.

### Files Created

| File | Purpose |
|------|---------|
| `scripts/eval-miniwob.ts` | Main eval harness (~400 lines) |
| `scripts/miniwob-tasks.ts` | 25 curated tasks across 5 categories |
| `package.json` | Added `playwright-core` devDep + `eval:miniwob` script |
| `CLAUDE.md` | Added MiniWob++ eval section |

### How It Works

1. Static HTTP server serves MiniWob++ HTML files locally
2. Chromium launches with `--remote-debugging-port` for Playwright MCP
3. Per episode: navigate to task → `core.startEpisodeReal()` → read utterance → spawn MCP → agent loop → check `WOB_RAW_REWARD_GLOBAL`
4. Agent loop: system prompt (from `training-converter.ts`) → model call → parse `<tool_call>` XML → execute via MCP → format `<tool_response>` XML → repeat
5. Three termination conditions: `WOB_DONE_GLOBAL` (task validator fired), model says "TASK COMPLETE", or max steps
6. Metrics: pass rate by task, category, difficulty + side-by-side comparison table

### Verified Working (smoke tests)

- Static server serves MiniWob++ HTML/JS/CSS correctly
- `core.startEpisodeReal()` starts episodes, `core.getUtterance()` returns instructions
- Playwright MCP connects via CDP, discovers 22 tools, sees MiniWob++ page
- Accessibility snapshot returns element refs (`button "ok" [ref=e10]`)
- `WOB_DONE_GLOBAL` / `WOB_RAW_REWARD_GLOBAL` readable for reward checking
- Script compiles and runs (exits with validation error when no endpoint URL — expected)

## What's Next

### Immediate: Run Evaluations

Three models to compare:

1. **Fine-tuned Qwen2.5-3B** — Modal vLLM endpoint (from training-pipeline branch)
   - Need: the Modal endpoint URL with `?experiment_name=<name>`
   - The model speaks `<tool_call>` XML natively (trained on it)

2. **Vanilla Qwen2.5-3B-Instruct** — needs an endpoint
   - **Option A:** Deploy second Modal instance with `hf:Qwen/Qwen2.5-3B-Instruct`
   - **Option B:** Use external API (Together AI, Fireworks) — they serve Qwen with OpenAI-compatible endpoints
   - **Option C:** Local vLLM: `python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-3B-Instruct --max-model-len 32768`

3. **Claude Sonnet 4** — needs a small adapter
   - The eval script currently calls OpenAI-compatible `/v1/chat/completions` endpoints
   - Sonnet uses Anthropic's native API with `tool_use` blocks, not `<tool_call>` XML
   - Two options:
     - (a) Add an `--anthropic` flag that switches the agent loop to use Anthropic SDK + native tool calling (cleaner, ~50 lines)
     - (b) Write a thin proxy that translates between OpenAI chat format and Anthropic API (hacky)
   - Option (a) is better — add a `callSonnet()` function alongside `callModel()`

### Before Running Evals

- [ ] Ensure Modal fine-tuned endpoint is deployed and warm
- [ ] Set up vanilla Qwen endpoint (pick option A/B/C above)
- [ ] Add Claude Sonnet support to eval script (option a: `--anthropic` flag)
- [ ] Run: `npx tsx scripts/eval-miniwob.ts --finetuned-url <FT> --vanilla-url <VN> --miniwob-dir ../miniwob-plusplus/miniwob/html --episodes 3 --record --output data/miniwob_results.json`
- [ ] Run Sonnet separately: `npx tsx scripts/eval-miniwob.ts --anthropic --miniwob-dir ... --episodes 3 --output data/miniwob_sonnet.json`

### Follow-up: WebArena-Verified Hard (next benchmark)

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
