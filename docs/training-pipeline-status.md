# Training Pipeline — Status & Decisions

## What's Built (All Committed on `worktree-training-pipeline`)

### Phase 1: Data Pipeline ✅

| Script | What it does | Status |
|--------|-------------|--------|
| `scripts/extract-training-data.ts` | Queries Convex for successful games, pulls full conversation rows, outputs raw JSONL | Done, verified |
| `scripts/convert-to-sharegpt.ts` | Anthropic tool format → ShareGPT `<tool_call>` XML format | Done, 16 tests passing |
| `scripts/prepare_training_data.py` | ShareGPT → OpenAI Messages format + screenshot download | Done, verified on 1 game |

Verified end-to-end on game `dCM7YB1y8s` (Hacker News upvote, 9 messages, 3 screenshots).

### Phase 2: Fine-Tuning ✅

| Script | What it does | Status |
|--------|-------------|--------|
| `scripts/modal_finetune.py` | QLoRA fine-tune on Modal A10G — text-only and VLM modes | Done, smoke-tested |
| `scripts/modal_serve.py` | vLLM serving endpoint on Modal, OpenAI-compatible POST /chat | Done, deployed |
| `scripts/modal_merge.py` | One-off LoRA → merged model conversion | Done, verified |

**Training result** (experiment `text-20260228-2221`, 1 training example):
- Model: `Qwen2.5-3B-Instruct` on A10G (22GB VRAM)
- Unsloth patched 36 QKV/O/MLP layers, 29.9M trainable params (0.96%)
- 3 epochs, 3 steps, 17 seconds total
- Loss: 1.15 → 1.04
- LoRA merged into base weights via `modal_merge.py` → `merged_model/` (~6GB bfloat16)
- Deployed via vLLM on Modal A10G, 32K context, OpenAI-compatible endpoint

### Phase 3: Inference + Eval ✅

| File | What it does | Status |
|------|-------------|--------|
| `src/lib/attacker-finetuned.ts` | Fine-tuned attacker — calls Modal endpoint, parses `<tool_call>` XML, executes via Playwright MCP | Done |
| `src/lib/attacker-agent.ts` | Updated to route `attackerType='finetuned'` to new attacker | Done |
| `src/types/game.ts` | Added `'finetuned'` to `AttackerType` union | Done |
| `src/app/api/game/start/route.ts` | Added `noDefender=true` flag — skips defender for clean eval | Done |
| `scripts/eval_browser_brawl.py` | Runs N games (finetuned vs Claude baseline), reports success rate / steps / time | Done |

---

## Key Decisions Made

### Framework: Unsloth (not Axolotl)
Axolotl VLM support is beta with "limited feature parity". Unsloth is production-grade for VLMs, 1.7x faster, 60% less VRAM. Single A10G is sufficient for Qwen2.5-3B QLoRA. Switch to Axolotl only if scaling to 70B+.

### Format: OpenAI Messages (not ShareGPT directly)
Both Unsloth `FastVisionModel` and Axolotl multimodal require `role`/`content` with typed content arrays — NOT legacy ShareGPT `from`/`value` format. The ShareGPT converter is an intermediate step; `prepare_training_data.py` is the final pre-training transform.

### Screenshots: file paths (not base64)
Unsloth expects `{"type": "image", "image": "file:///abs/path.png"}`. Base64 inline would explode JSONL file size and cause OOM during training. Screenshots are downloaded to `data/images/{gameId}/{step}.png` and referenced by path.

### Tool call format: `<tool_call>` XML
Qwen2.5-VL has no native tool tokens. XML tags in text is the standard workaround and matches what Qwen was pretrained to understand. The fine-tuned attacker parses this with a regex on the text response.

### Eval: in-distribution (Browser Brawl), no defender
The clearest eval of model capability is: run Qwen + Playwright MCP on real tasks, measure success rate + steps + time. Defender is disabled by default (`noDefender=true`) so results measure model quality not health-race-against-clock.

Offline next-action prediction (give model a truncated conversation, check if it picks the right next tool) is a cheaper diagnostic but the live eval IS the right primary metric.

### Merge before serving
vLLM doesn't support LoRA + VLM simultaneously. `save_pretrained_merged()` bakes `W + B·A` permanently into the base weights (bfloat16, ~6GB). The `modal_finetune.py` now does this automatically after training. For the initial checkpoint (which was trained before merge was added), `scripts/modal_merge.py` does a one-off merge.

### Modal `modal.parameter` gotcha
`modal deploy --name X` sets the **app deployment name**, NOT any `modal.parameter` fields. Parameters must be passed as URL query params: `?experiment_name=text-20260228-2221`. The `FINETUNED_MODEL_URL` in `.env.local` must include this query param.

### vLLM context length
`max_model_len` must be large enough to fit the system prompt with all 22 Playwright MCP tool definitions (~9K tokens as JSON). Set to 32768 (Qwen2.5's native context). The initial 4096 caused `ValueError: decoder prompt longer than max_model_len`.

### Data volume
50-150 successful trajectories is enough for a PoC. Don't gate eval on 500+. Current state: 1 game (smoke test only). MiniWob++ and DPO are post-PoC.

### Windows quirks (Modal CLI)
- `MSYS_NO_PATHCONV=1` — prevents Git Bash from mangling `/data/train.jsonl` → `C:/Program Files/Git/data/train.jsonl`
- `PYTHONIOENCODING=utf-8` — prevents charmap error on Modal unicode output (✓ checkmarks)
- Modal args go directly after the script name, no `--` separator needed

---

## Smoke Test Results ✅

**End-to-end pipeline verified** (2026-03-01). Qwen2.5-3B fine-tuned on 1 training example:

| Run | Task | Steps | Time | Result |
|-----|------|-------|------|--------|
| 1 | hackernews-upvote | 7 | 3m22s | Win (cold start included) |
| 2 | hackernews-upvote | 7 | 18s | Win (warm endpoint) |

- Format compliance: 100% (all `<tool_call>` XML parsed correctly)
- No defender (clean eval)

---

## What's Remaining

### Next steps

1. **Farm data** — play ~50 Browser Brawl games (attacker wins). Extract + convert + post-process.

2. **Re-train** with full dataset, deploy new model, re-run eval with `--games 10`.

3. **Compare** Qwen vs Claude baseline — success rate, steps, time.

### Post-PoC (deferred)

- **Lobby UI** — add `finetuned` option to attacker type selector so you can choose it from the browser
- **DPO** — pair successful vs failed trajectories for preference fine-tuning
- **VLM mode** — multimodal training with screenshots (currently text-only path only smoke-tested)
- **Data farming automation** — headless game runner to generate trajectories without manual play
- **MiniWob++** — optional external benchmark (needs Selenium adapter, significantly more work than in-distribution eval)

---

## Reference: Full Pipeline Command Sequence

```bash
# 1. Extract from Convex
npx tsx scripts/extract-training-data.ts -o data/raw.jsonl

# 2. Convert to ShareGPT
npx tsx scripts/convert-to-sharegpt.ts -i data/raw.jsonl -o data/sharegpt.jsonl

# 3. Post-process to OpenAI Messages
python scripts/prepare_training_data.py -i data/sharegpt.jsonl -o data/openai_messages.jsonl

# 4. Upload to Modal volume (note: upload to volume root /, not /data/)
MSYS_NO_PATHCONV=1 PYTHONIOENCODING=utf-8 .venv/Scripts/modal volume put browser-brawl-training-data data/openai_messages.jsonl /train.jsonl --force

# 5. Train (text-only, ~5 min on 1 example, ~1-2hr on 100 examples)
#    Includes automatic LoRA merge after training
MSYS_NO_PATHCONV=1 PYTHONIOENCODING=utf-8 .venv/Scripts/modal run --detach scripts/modal_finetune.py --text-only

# 6. Deploy serving endpoint
#    --name sets deployment name AND becomes part of the URL
PYTHONIOENCODING=utf-8 .venv/Scripts/modal deploy scripts/modal_serve.py --name <experiment-name>

# 7. Set env var in .env.local (MUST include ?experiment_name= query param)
#    FINETUNED_MODEL_URL=https://mehulkalia--<experiment-name>-model-chat.modal.run?experiment_name=<experiment-name>

# 8. Warm up the endpoint (cold start takes ~2 min for model loading)
curl -sL "https://mehulkalia--<experiment-name>-model-health.modal.run?experiment_name=<experiment-name>"

# 9. Eval (defender off, 5 games each)
python scripts/eval_browser_brawl.py --games 5 --task hackernews-upvote --game-timeout 600
```
