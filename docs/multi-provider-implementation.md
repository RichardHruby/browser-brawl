# Multi-Provider Model Support — Implementation Status

## Branch & Location
- **Worktree**: `.claude/worktrees/multi-provider-models`
- **Branch**: `worktree-multi-provider-models`
- **Base**: `main`

## What Was Built

### Provider Abstraction Layer (`src/lib/model-providers/`)

A pluggable LLM interface so the Playwright MCP attacker loop can use any model provider without duplicating the 350-line harness code.

| File | Purpose |
|------|---------|
| `types.ts` | `LLMProvider` interface: `initTools`, `initMessages`, `call`, `appendToolResults`, `getConversationSnapshot` |
| `anthropic-provider.ts` | Wraps `@anthropic-ai/sdk`. Tool format: `Anthropic.Tool[]` with `input_schema`. Parses `ToolUseBlock`/`TextBlock`. |
| `openai-provider.ts` | Raw `fetch()` to `https://api.openai.com/v1/chat/completions`. Tool format: `{ type: 'function', function: { name, description, parameters } }`. Parses `message.tool_calls[].function.{name, arguments}`. Tool results via `{ role: 'tool', tool_call_id, content }`. |
| `gemini-provider.ts` | Uses `@google/genai` SDK (`GoogleGenAI`). Tool format: `{ functionDeclarations: [...] }`. Parses `response.functionCalls[].{name, args}`. Tool results as `functionResponse` parts in user-role messages. Gemini matches by name not ID, so synthetic IDs are generated via `nanoid`. Abort handled via `Promise.race` since SDK doesn't accept `AbortSignal`. |
| `index.ts` | Factory: `createModelProvider(provider, modelId) → LLMProvider` |

### Models Supported

| Provider | Model ID | Display Name |
|----------|----------|-------------|
| Anthropic | `claude-sonnet-4-6` | Claude Sonnet 4 |
| OpenAI | `gpt-5.4` | GPT-5.4 |
| OpenAI | `gpt-5-mini` | GPT-5 Mini |
| Google | `gemini-3.1-pro-preview` | Gemini 3.1 Pro |
| Google | `gemini-3-flash-preview` | Gemini 3 Flash |

### Core Refactor — `src/lib/attacker-playwright.ts`

The attacker loop was refactored from inline Anthropic SDK calls to the `LLMProvider` interface:

- **Before**: `anthropic.messages.create({ model, tools, messages })` → parse `ToolUseBlock` → build `ToolResultBlockParam[]`
- **After**: `provider.call(signal)` → iterate `response.toolCalls` → `provider.appendToolResults(results)`

The provider is resolved from `session.modelProvider` / `session.modelId`. Defaults to `AnthropicProvider('claude-sonnet-4-6')` for backward compatibility.

Everything else unchanged: MCP tool discovery/execution, SSE events, `observe()` tracing, turn-based gating, data collection, step logging, game-over detection.

### Types & Config Changes

| File | Change |
|------|--------|
| `src/types/game.ts` | Added `ModelProvider = 'anthropic' \| 'openai' \| 'gemini'` and `ModelId` union type |
| `src/lib/models.ts` | **New file** — `AVAILABLE_MODELS` registry array + `PROVIDER_META` (display names & colors) |
| `src/lib/env.ts` | Added `getOpenAIApiKey()` and `getGeminiApiKey()` |
| `src/lib/game-session-store.ts` | Added `modelProvider?` and `modelId?` to `ServerGameSession` and `createSession` params. Also added `skipScreenshots` to interface (was used but missing from type). |
| `src/app/api/game/start/route.ts` | Accepts `modelProvider`/`modelId` in POST body, passes to `createSession()`, uses actual `modelId` in `createGameRecord` `attackerModel` field |
| `next.config.ts` | Added `@google/genai` to `serverExternalPackages` |

### Lobby UI

| File | Change |
|------|--------|
| `src/components/lobby/ModelPicker.tsx` | **New component** — Horizontal pill buttons grouped by provider (Anthropic / OpenAI / Google). Fetches model availability from `GET /api/game/models`. Active model gets neon glow in provider color. Unavailable models greyed out. Only visible when `attackerType === 'playwright-mcp'`. |
| `src/components/lobby/LobbyScreenV1.tsx` | Added `modelProvider`/`modelId` state. Renders `<ModelPicker>` below `<FighterSelect>`. Passes model info through `onStart`. Replaced old "BRING YOUR OWN MODEL" waitlist link. |
| `src/components/lobby/LobbyScreen.tsx` | Updated `onStart` prop type to include `modelProvider`/`modelId` |
| `src/app/page.tsx` | `handleStart` now passes `modelProvider`/`modelId` in POST body to `/api/game/start` |

### API Endpoint

| File | Purpose |
|------|---------|
| `src/app/api/game/models/route.ts` | **New** — `GET /api/game/models` returns all models with `available: boolean` based on which API keys are configured in `.env.local`. Needed because env vars are server-side only. |

### Dependencies

- **Added**: `@google/genai` (npm installed in worktree)
- **NOT added**: `openai` npm package — using raw `fetch()` to Chat Completions API (same pattern as `attacker-finetuned.ts`)

### Tests

**File**: `src/lib/model-providers/__tests__/providers.test.ts` — **25 tests, all passing**

Coverage:
- Factory: returns correct provider class, throws on unknown
- **Anthropic**: tool schema conversion (`input_schema`), message init, tool result appending (`tool_use_id` linking, `is_error` flag), response parsing (tool calls + text), task completion detection
- **OpenAI**: tool schema conversion (`function.parameters`), system+user message init, tool result appending (`tool_call_id`), response parsing from fetch mock, API error handling
- **Gemini**: tool schema conversion (`functionDeclarations`), contents init, `functionResponse` parts appending (matched by name), function call parsing, task completion detection
- **Serialization**: JSON roundtrip for all 3 providers' conversation snapshots
- **Construction**: Verifies providers construct successfully with valid keys

### Env Setup

Add to `.env.local`:
- `OPENAI_API_KEY=<your-openai-key>`
- `GEMINI_API_KEY=<your-gemini-key>`

## Verified

- `tsc --noEmit` — 0 errors
- `npx vitest run` — 25/25 tests pass
- Dev server starts on port 3001
- `GET /api/game/models` returns all 5 models as `available: true`

## What's Remaining

### Must Do Before Merge

1. **End-to-end game test with each provider** — Start a real game via the lobby (or curl) with `modelProvider: 'openai'` and `modelProvider: 'gemini'`. This requires `BROWSER_USE_API_KEY` to be set so a cloud browser can be created. Verify:
   - MCP tools are discovered and converted correctly
   - Model API call succeeds and returns tool calls
   - Tool calls execute via MCP (browser_snapshot, browser_click, etc.)
   - SSE events stream to frontend (`attacker_step` descriptions)
   - Game over detection works ("TASK COMPLETE")
   - Data collection works (conversations saved to Convex with correct format)

2. **Check `skipScreenshots` field** — I added it to the `ServerGameSession` interface (it was used in code but missing from the type). Verify this doesn't break anything in the session store or `createSession` callers.

### Nice to Have / Follow-up

3. **OpenAI o-series models** — `o3` and `o4-mini` use the same Chat Completions API but have different behavior (reasoning tokens, no `max_tokens` parameter for some). Could add them to `AVAILABLE_MODELS` if desired.

4. **Gemini 2.5 stable models** — `gemini-2.5-pro` and `gemini-2.5-flash` are production-grade (not preview). Could add alongside the preview models.

5. **Error UX** — If a model API call fails mid-game (rate limit, bad key, etc.), the error surfaces as `attackerStatus: 'failed'` via SSE. Could add a more descriptive error message in the UI.

6. **Training data pipeline** — OpenAI/Gemini games store messages in their native format in Convex. The existing training pipeline (`convert-to-sharegpt.ts`) only processes Anthropic native format and correctly skips non-Anthropic games. If you want to train on OpenAI/Gemini game data too, you'd need format-specific converters.

7. **Cost tracking** — Each provider has different pricing. Could display estimated cost per game in the history view based on token usage.

8. **Streaming** — Currently all providers use non-streaming API calls. Could add streaming support for better UX (show model thinking in real-time).

9. **Commit & PR** — All changes are uncommitted in the worktree. Need to commit and create a PR to merge into main.

## File Inventory (all changes)

### New Files
```
src/lib/models.ts
src/lib/model-providers/types.ts
src/lib/model-providers/anthropic-provider.ts
src/lib/model-providers/openai-provider.ts
src/lib/model-providers/gemini-provider.ts
src/lib/model-providers/index.ts
src/lib/model-providers/__tests__/providers.test.ts
src/app/api/game/models/route.ts
src/components/lobby/ModelPicker.tsx
docs/multi-provider-implementation.md (this file)
```

### Modified Files
```
src/types/game.ts                          — Added ModelProvider, ModelId types
src/lib/env.ts                             — Added getOpenAIApiKey, getGeminiApiKey
src/lib/attacker-playwright.ts             — Refactored to use LLMProvider interface
src/lib/game-session-store.ts              — Added modelProvider, modelId, skipScreenshots
src/app/api/game/start/route.ts            — Accept/pass modelProvider, modelId
src/app/page.tsx                           — Pass model info to API
src/components/lobby/LobbyScreen.tsx        — Updated onStart prop type
src/components/lobby/LobbyScreenV1.tsx      — Added ModelPicker, model state
next.config.ts                             — Added @google/genai to serverExternalPackages
package.json / package-lock.json           — Added @google/genai dependency
```
