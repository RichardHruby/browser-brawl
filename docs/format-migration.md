# Format Migration: ShareGPT → OpenAI Messages

## The Problem

Our current `scripts/convert-to-sharegpt.ts` outputs **legacy ShareGPT format**:

```json
{
  "conversations": [
    {"from": "system", "value": "You are a browser automation agent..."},
    {"from": "human", "value": "Add toothpaste to cart"},
    {"from": "gpt", "value": "I'll take a snapshot.\n<tool_call>\n{\"name\": \"browser_snapshot\", \"arguments\": {}}\n</tool_call>"},
    {"from": "tool", "value": "<tool_response>\n{\"name\": \"browser_snapshot\", \"content\": \"- ref=s1: link 'Sign in'\"}\n</tool_response>"}
  ]
}
```

Both **Unsloth** (FastVisionModel) and **Axolotl** (multimodal mode) require **OpenAI Messages format** with typed content arrays for vision training:

```json
{
  "messages": [
    {
      "role": "system",
      "content": [{"type": "text", "text": "You are a browser automation agent..."}]
    },
    {
      "role": "user",
      "content": [
        {"type": "image", "image": "file:///data/images/game123/1.png"},
        {"type": "text", "text": "Add toothpaste to cart"}
      ]
    },
    {
      "role": "assistant",
      "content": [{"type": "text", "text": "I'll take a snapshot.\n<tool_call>\n{\"name\": \"browser_snapshot\", \"arguments\": {}}\n</tool_call>"}]
    },
    {
      "role": "tool",
      "content": [{"type": "text", "text": "<tool_response>\n{\"name\": \"browser_snapshot\", \"content\": \"- ref=s1: link 'Sign in'\"}\n</tool_response>"}]
    }
  ]
}
```

## What Needs to Change

### Role Mapping

| ShareGPT (`from`) | OpenAI Messages (`role`) |
|--------------------|--------------------------|
| `system` | `system` |
| `human` | `user` |
| `gpt` | `assistant` |
| `tool` | `tool` (or `user` — see note) |

**Note on `tool` role:** Unsloth/TRL's `SFTTrainer` may not recognize `tool` as a valid role for all chat templates. If the model's chat template doesn't handle `tool`, we may need to use `user` with a tool response prefix. Test both.

### Content Structure

**Old (string):**
```json
{"from": "gpt", "value": "I'll click the search box.\n<tool_call>..."}
```

**New (typed array):**
```json
{"role": "assistant", "content": [{"type": "text", "text": "I'll click the search box.\n<tool_call>..."}]}
```

### Image Integration

For steps that have screenshots, the observation message includes an image:

```json
{
  "role": "user",
  "content": [
    {"type": "image", "image": "file:///data/images/dCM7YB1y8s/3.png"},
    {"type": "text", "text": "<tool_response>\n{\"name\": \"browser_snapshot\", \"content\": \"- ref=s1: link 'Sign in'\\n- ref=s2: textbox 'Search'\"}\n</tool_response>"}
  ]
}
```

## Options

### Option A: Update `convert-to-sharegpt.ts` to Output Both Formats

Add a `--format` flag:
- `--format sharegpt` — current behavior (for text-only training)
- `--format openai` — new OpenAI Messages format (for multimodal training)

**Pros:** Single script, both formats
**Cons:** TypeScript script, but training infra is Python

### Option B: Python Post-Processor

Write a Python script that:
1. Reads ShareGPT JSONL (output of existing converter)
2. Maps roles and wraps values in typed content arrays
3. Downloads screenshots from Convex URLs and saves as files
4. Inserts `{"type": "image", ...}` content blocks at the right positions
5. Outputs OpenAI Messages JSONL

**Pros:** Python is the training ecosystem language, easier to integrate with Unsloth
**Cons:** Another script in the pipeline

### Option C: Python Dataset Loader (No JSONL)

Skip JSONL entirely. Write a Python script that:
1. Loads raw JSONL from extraction script
2. Converts Anthropic → OpenAI Messages format in-memory
3. Downloads/caches screenshots
4. Feeds directly to Unsloth's `SFTTrainer`

**Pros:** Simplest, least moving parts
**Cons:** Tied to Unsloth, less reusable

## Recommendation

**Option B** for PoC. Keep the existing TypeScript extraction + conversion pipeline (it's tested), add a lightweight Python script that transforms ShareGPT → OpenAI Messages + downloads screenshots. This is ~50 lines of Python.

Later, if we commit to Unsloth, can consolidate into Option C.

## Text-Only Fallback

For a quick first training run without multimodal:
1. Use existing ShareGPT JSONL output
2. Use Unsloth's `standardize_sharegpt()` with `FastLanguageModel` (not Vision)
3. Use `Qwen/Qwen2.5-3B-Instruct` (text-only, NOT the VL variant)

This validates the pipeline end-to-end before adding the complexity of screenshots.

## Tool Call Format — Already Correct

Our `<tool_call>` / `<tool_response>` XML format matches the Qwen2.5 tool calling convention. Since Qwen2.5-VL lacks native tool tokens, this text-based approach is the standard workaround. No changes needed here.

## Migration Checklist

- [ ] Write Python post-processor (ShareGPT → OpenAI Messages)
- [ ] Add screenshot download + local file saving
- [ ] Test with Unsloth's `FastVisionModel` data collator
- [ ] Verify `tool` role handling in Qwen2.5-VL chat template
- [ ] Test text-only path first (faster iteration)
- [ ] Add multimodal path once text-only works
