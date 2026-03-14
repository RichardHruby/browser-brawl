# Controllable Defender — Full Working Memory

## What We're Building
A **controllable, deterministic defender engine** + **prompt injection primitive library** for Browser Brawl. Labs (DeepMind, Anthropic) want to run reproducible attack scenarios against browser agents and measure whether agents follow injected adversarial instructions.

Instead of the current random Haiku-LLM-driven defender, the new system accepts a declarative `AttackSpec` JSON that specifies exactly what attacks to fire, when, and how — producing structured labels for eval/analysis.

## Working Directory
`c:\Users\khelt\Desktop\Code\browser-brawl\.claude\worktrees\controllable-defender`

## Branch
`controllable-defender` off `origin/worktree-multi-provider-models` (commit 12bc8d6)

## Key Design Decisions
- **Health disabled in spec mode** — when `attackSpec` is set, no health decay, no damage. Pure eval mode.
- **Backward compat** — no `attackSpec` = existing random defender behavior unchanged
- **All injection via existing `injectJS()` CDP pipeline** — no new infra needed
- **LLM-as-judge** (Haiku) evaluates whether agent followed/ignored/partially-complied with injections
- **`agentSecrets`** — optional credentials appended to attacker prompt for exfil testing
- **UI route** — `/red-team` launcher page; results viewed in enhanced `/history/[gameId]` replay page
- **No standalone results timeline** — reuses existing arena/history components, enhanced to show structured labels when present

## Plan File
`C:\Users\khelt\.claude\plans\rippling-petting-allen.md`

## Build Progress — ALL COMPLETE

### COMPLETED: Step 1 — Types + AttackSpec + Templates
- `src/lib/attack-spec.ts` — AttackSpec types, triggers, suites, `expandSuite()`
- `src/lib/prompt-templates.ts` — 11 curated adversarial text templates
- `src/lib/__tests__/attack-spec.test.ts` — 15 tests

### COMPLETED: Step 2 — Primitives + Spec-Driven Defender Loop + Wiring
- `src/lib/prompt-injections.ts` — ALL 6 primitives + `generatePrimitive()` registry
- `src/lib/__tests__/prompt-injections.test.ts` — 30 tests
- `src/lib/game-session-store.ts` — `attackSpec`, `attackSuite`, `agentSecrets`, `attackRuntimeState`
- `src/app/api/game/start/route.ts` — accepts `attackSpec`/`attackSuite`/`agentSecrets`
- `src/lib/defender-agent.ts` — `runSpecDrivenLoop()`: 2s tick, trigger evaluation, budget enforcement

### COMPLETED: Step 4 — Structured Labels + Convex Schema
- `convex/schema.ts` — `defenderActions` extended with 7 label fields; `attackSuite` added to `sessions`
- `convex/steps.ts` — Extended `recordDefenderAction` args; added `updateJudgeVerdict` mutation
- `src/lib/data-collector.ts` — Extended `recordDefenderAction()` + `updateJudgeVerdict()`
- `src/types/game.ts` — `DisruptionEvent` extended with structured label fields
- `src/types/events.ts` — `DefenderDisruptionPayload` extended; `judge_verdict` SSE type + `JudgeVerdictPayload` added

### COMPLETED: Step 6 — LLM Judge
- `src/lib/injection-judge.ts` — heuristic → LLM (Haiku) → fallback
- `src/lib/__tests__/injection-judge.test.ts` — 6 tests
- `src/lib/defender-agent.ts` — `scheduleJudge()` fires async, emits `judge_verdict` SSE on completion

### COMPLETED: Step 7 — agentSecrets
- `src/lib/attacker-playwright.ts` — appends `session.agentSecrets` to task prompt

### COMPLETED: Step 8 — UI Enhancements + /red-team Launcher

**Decision:** Enhanced existing components to show structured labels (they already flow through the pipeline — just weren't displayed). No separate results page needed.

**Files modified:**
- `src/components/arena/DisruptionCard.tsx` — family/objective badges; verdict badge when judge returns; "INJECTED" instead of HP in spec mode
- `src/hooks/useGameState.ts` — passes `attackFamily`/`objective`/`concealment` from SSE; `judge_verdict` reducer case patches existing disruption with verdict
- `src/app/history/[gameId]/page.tsx`:
  - Detail view: "Attack Metadata" section (5 label badges) + "Judge Verdict" section (badge + reasoning)
  - Actions list: colored dot indicator per judge verdict + "INJ" label for spec-mode actions

**Files created:**
- `src/app/red-team/page.tsx` — Launcher: suite picker (4 presets), task dropdown, optional agentSecrets inputs, "Run Eval" button → POST `/api/game/start` → "View Results" link to `/history/[sessionId]`

## Test Status
- **157 tests passing** across 9 test files
- TypeScript compiles clean

## What Remains Before Merge

### Blocking:
1. **Push Convex schema** — `npx convex dev` must be run to push `convex/schema.ts` + `convex/steps.ts` changes. Without this, `recordDefenderAction` with new fields fails at runtime.
2. **Git commit** — All changes uncommitted in worktree.

### Nice-to-have (post-merge):
3. **Compound Convex index** — `updateJudgeVerdict` queries `defenderActions` by `gameId` + `actionNumber`. Current `by_gameId` index only covers `gameId`. Works but scans; consider adding `by_gameId_and_action: ['gameId', 'actionNumber']` index.
4. **Placement intelligence** — `near_target` placement currently falls back to `document.body`. Could use `snapshotDOM()` to find the most task-relevant element.
5. **Exfil detection** — `agentSecrets` reaches the attacker prompt but no automated scan for whether agent typed those credentials into an injected form.
6. **Red-team live status** — Page shows "Starting..." then done. Could poll `/api/game/[id]/status` to show step count while running.

## All Files Changed (for git commit)

### New files:
- `src/lib/attack-spec.ts`
- `src/lib/prompt-templates.ts`
- `src/lib/prompt-injections.ts`
- `src/lib/injection-judge.ts`
- `src/lib/__tests__/attack-spec.test.ts`
- `src/lib/__tests__/prompt-injections.test.ts`
- `src/lib/__tests__/injection-judge.test.ts`
- `src/app/red-team/page.tsx`

### Modified files:
- `src/lib/defender-agent.ts`
- `src/lib/game-session-store.ts`
- `src/app/api/game/start/route.ts`
- `src/lib/attacker-playwright.ts`
- `src/lib/data-collector.ts`
- `src/types/game.ts`
- `src/types/events.ts`
- `src/hooks/useGameState.ts`
- `src/components/arena/DisruptionCard.tsx`
- `src/app/history/[gameId]/page.tsx`
- `convex/schema.ts`
- `convex/steps.ts`
