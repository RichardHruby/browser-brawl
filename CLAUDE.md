# Browser Brawl

Cat vs Mouse browser agent game — one AI agent (mouse) tries to complete a task on a webpage, another AI agent (cat) tries to block it.

## Tech Stack

- **Frontend/Viz:** Next.js + TypeScript
- **Backend/Agents:** TBD (Python or TypeScript)

## Architecture

### Core Components

1. **Orchestrator** — manages game state and turn flow
   - Initializes attacker (mouse) with goal + model, defender (cat) with model
   - State = DOM + screenshots
   - Calls `take_action(attacker)` then `take_action(defender)` each turn
   - Both models are parametrized by difficulty (e.g. "hard" = smarter model)

2. **Browser Controller** — updates the page
   - Receives actions from both agents and applies them to the DOM

3. **Mouse (Attacker)** — off-the-shelf browser agent
   - Options: Browser Use, Anthropic computer use, etc.
   - Given a single prompt with a goal (e.g. "add this item to cart", "book the cheapest flight")
   - Executes browser actions (click, type, scroll, etc.)

4. **Cat (Defender)** — custom agent that modifies the DOM to block the mouse
   - Injects DOM/CSS overlays, popups, moves elements, modifies components
   - Difficulty levels control: how much DOM changes, how many popups, whether it can erase mouse's work

5. **Visualization** — split-screen UI
   - Website in center
   - Attacker thoughts/actions on left, defender on right
   - Stream agent thinking, highlight DOM selections
   - Health bar for mouse (decreases with time + trap hits)

### Game Flow

- **Turn-based** (not real-time) for the simplest version
- Defender sets traps first, then attacker acts, then defender again
- Orchestrator handles sequencing and state

### Website Strategy

- **Shallow copy approach:** snapshot a real webpage's DOM (e.g. Amazon product page, checkout flow)
- Create a fake local version from the snapshot
- Predefine the goal/objective for that page
- Don't worry about generating multiple websites for now — start with one

## Open Design Questions

- Live website vs shallow copy (leaning shallow copy for v1)
- Turn-based vs real-time (starting turn-based)
- What rules/constraints govern the defender's modifications
- Exact mechanism for how defender modifies DOM
- Trace storage: Supabase? Existing tracing platform?
