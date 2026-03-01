"""
In-distribution evaluation: fine-tuned Qwen vs Claude Sonnet baseline.

Runs N games via the Browser Brawl API with Playwright MCP as the browser
layer — same setup for both models, just swapping attackerType. Defender is
disabled by default (noDefender=true) so results measure model capability, not
race-against-health-drain.

Prerequisites:
  - Browser Brawl dev server running: yarn dev
  - FINETUNED_MODEL_URL set in .env.local (deploy with: modal deploy scripts/modal_serve.py)
  - BROWSER_USE_API_KEY set (each game spins up a live browser session)

Usage:
  python scripts/eval_browser_brawl.py
  python scripts/eval_browser_brawl.py --games 10 --task hacker-news-upvote
  python scripts/eval_browser_brawl.py --baseline-only    # Claude Sonnet only
  python scripts/eval_browser_brawl.py --finetuned-only   # Qwen only
  python scripts/eval_browser_brawl.py --with-defender    # re-enable defender (harder, noisier)
  python scripts/eval_browser_brawl.py --output data/eval_results.json

Metrics reported:
  - Task success rate  — primary: did the model complete the task?
  - Steps to completion — efficiency proxy (not wall-clock time)
  - Avg steps on wins  — how efficiently did it succeed?
  - Failure modes      — timeout vs max-steps vs error
"""

import argparse
import json
import re
import time
import sys
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    sys.exit(1)

# ── Game runner ────────────────────────────────────────────────────────────────

def start_game(
    server: str,
    task_id: str,
    attacker_type: str,
    difficulty: str,
    no_defender: bool,
) -> str | None:
    """Start a game, return sessionId or None on failure."""
    payload = {
        "taskId":       task_id,
        "difficulty":   difficulty,
        "attackerType": attacker_type,
        "mode":         "realtime",
        "noDefender":   no_defender,
    }

    resp = requests.post(f"{server}/api/game/start", json=payload, timeout=30)
    if not resp.ok:
        print(f"  WARN: start failed ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
        return None

    data = resp.json()
    return data.get("sessionId") or data.get("gameId")


def poll_game(server: str, session_id: str, timeout_s: int = 300) -> dict:
    """Poll /status until game_over or timeout."""
    deadline = time.time() + timeout_s
    last_phase = None

    while time.time() < deadline:
        try:
            resp = requests.get(f"{server}/api/game/{session_id}/status", timeout=10)
            if resp.ok:
                status = resp.json()
                phase = status.get("phase")
                if phase != last_phase:
                    print(f"    [{attacker_label(session_id)}] phase → {phase}")
                    last_phase = phase
                if phase == "game_over":
                    return status
        except requests.RequestException as e:
            print(f"  WARN: poll error: {e}", file=sys.stderr)

        time.sleep(5)

    return {"phase": "timeout", "winner": None, "winReason": "timeout", "attackerSteps": []}


def attacker_label(session_id: str) -> str:
    # Just for pretty printing in poll — session_id is globally available via closure
    return session_id[:8]


def abort_game(server: str, session_id: str) -> None:
    try:
        requests.post(f"{server}/api/game/{session_id}/abort", timeout=10)
    except Exception:
        pass


# ── Tool-call format compliance ───────────────────────────────────────────────
# Pull attacker step descriptions from status and check that the finetuned
# model is actually emitting <tool_call> XML rather than free-form text.
# (Only meaningful for the finetuned model — Claude uses native tool_use blocks.)

_TOOL_CALL_RE = re.compile(r"<tool_call>")

def format_compliance(attacker_steps: list[dict]) -> float:
    """
    Fraction of acting steps where the description contains a tool name
    (i.e. the step executed a tool call, not just reasoning text).
    Proxy for whether the model is emitting parseable tool calls.
    """
    acting = [s for s in attacker_steps if s.get("agentStatus") == "acting"]
    if not acting:
        return 1.0  # no tool steps to judge
    # Acting steps have descriptions like "browser_click(ref: ...)" — presence
    # of '(' is a good proxy for a successfully parsed tool call
    parsed = sum(1 for s in acting if "(" in s.get("description", ""))
    return round(parsed / len(acting), 3)


# ── Metrics ───────────────────────────────────────────────────────────────────

def compute_metrics(results: list[dict]) -> dict:
    n = len(results)
    if n == 0:
        return {"n": 0}

    wins       = [r for r in results if r.get("winner") == "attacker"]
    losses     = [r for r in results if r.get("winner") != "attacker"]
    avg_steps  = sum(r.get("steps", 0) for r in results) / n
    avg_steps_on_wins = (
        sum(r.get("steps", 0) for r in wins) / len(wins) if wins else None
    )
    timeouts   = sum(1 for r in results if r.get("win_reason") == "timeout")
    health_dep = sum(1 for r in results if r.get("win_reason") == "health_depleted")
    fmt_scores = [r["format_compliance"] for r in results if "format_compliance" in r]
    avg_fmt    = round(sum(fmt_scores) / len(fmt_scores), 3) if fmt_scores else None

    return {
        "n":                   n,
        "win_rate":            round(len(wins) / n, 3),
        "wins":                len(wins),
        "losses":              len(losses),
        "avg_steps":           round(avg_steps, 1),
        "avg_steps_on_wins":   round(avg_steps_on_wins, 1) if avg_steps_on_wins else None,
        "timeouts":            timeouts,
        "health_depleted":     health_dep,
        "format_compliance":   avg_fmt,
    }


def print_metrics(label: str, metrics: dict) -> None:
    if metrics.get("n", 0) == 0:
        print(f"\n  {label}: no games run")
        return
    print(f"\n{'─' * 52}")
    print(f"  {label}")
    print(f"{'─' * 52}")
    print(f"  Games:              {metrics['n']}")
    print(f"  Win rate:           {metrics['win_rate']:.1%}  ({metrics['wins']}W / {metrics['losses']}L)")
    print(f"  Avg steps (all):    {metrics['avg_steps']}")
    if metrics["avg_steps_on_wins"] is not None:
        print(f"  Avg steps (wins):   {metrics['avg_steps_on_wins']}")
    print(f"  Health depleted:    {metrics['health_depleted']}")
    print(f"  Timeouts:           {metrics['timeouts']}")
    if metrics["format_compliance"] is not None:
        print(f"  Format compliance:  {metrics['format_compliance']:.1%}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Eval fine-tuned Browser Brawl attacker")
    parser.add_argument("--server",         default="http://localhost:3000")
    parser.add_argument("--games",          type=int, default=5,           help="Games per attacker type")
    parser.add_argument("--difficulty",     default="easy",                help="easy|medium|hard|nightmare")
    parser.add_argument("--task",           default="hacker-news-upvote",  help="Task ID (from /api/game/tasks)")
    parser.add_argument("--game-timeout",   type=int, default=300,         help="Max seconds per game")
    parser.add_argument("--with-defender",  action="store_true",           help="Enable defender (adds noise)")
    parser.add_argument("--baseline-only",  action="store_true")
    parser.add_argument("--finetuned-only", action="store_true")
    parser.add_argument("--output",         default="",                    help="Save results JSON to file")
    args = parser.parse_args()

    no_defender = not args.with_defender

    print(f"Browser Brawl Eval")
    print(f"  Server:       {args.server}")
    print(f"  Task:         {args.task}")
    print(f"  Difficulty:   {args.difficulty}")
    print(f"  Games each:   {args.games}")
    print(f"  Defender:     {'ON' if args.with_defender else 'OFF (noDefender=true)'}")
    print()

    # Sanity-check server
    try:
        requests.get(f"{args.server}/api/game/tasks", timeout=5).raise_for_status()
    except Exception as e:
        print(f"ERROR: Cannot reach {args.server}: {e}")
        print("Run: yarn dev")
        sys.exit(1)

    attacker_types = []
    if not args.finetuned_only:
        attacker_types.append("playwright-mcp")   # Claude Sonnet 4 baseline
    if not args.baseline_only:
        attacker_types.append("finetuned")        # Fine-tuned Qwen2.5-3B

    all_results: dict[str, list[dict]] = {}

    for attacker_type in attacker_types:
        label = "Claude Sonnet (baseline)" if attacker_type == "playwright-mcp" else "Qwen2.5-3B (finetuned)"
        print(f"\n{'═' * 52}")
        print(f"  {label}  ·  {args.games} games")
        print(f"{'═' * 52}")

        results = []

        for game_num in range(1, args.games + 1):
            print(f"\n  Game {game_num}/{args.games}...")

            session_id = start_game(
                args.server, args.task, attacker_type, args.difficulty, no_defender
            )
            if not session_id:
                print("  SKIP: failed to start")
                results.append({"winner": None, "win_reason": "start_failed", "steps": 0})
                continue

            print(f"  Session: {session_id}")
            status = poll_game(args.server, session_id, timeout_s=args.game_timeout)

            winner     = status.get("winner")
            win_reason = status.get("winReason") or status.get("phase")
            steps_list = status.get("attackerSteps", [])
            steps      = len(steps_list)
            fmt        = format_compliance(steps_list) if attacker_type == "finetuned" else None

            result = {
                "game_num":          game_num,
                "session_id":        session_id,
                "attacker":          attacker_type,
                "task":              args.task,
                "difficulty":        args.difficulty,
                "no_defender":       no_defender,
                "winner":            winner,
                "win_reason":        win_reason,
                "steps":             steps,
                "timestamp":         datetime.utcnow().isoformat(),
            }
            if fmt is not None:
                result["format_compliance"] = fmt

            results.append(result)

            icon = "✓" if winner == "attacker" else "✗"
            fmt_str = f"  fmt={fmt:.0%}" if fmt is not None else ""
            print(f"  {icon} {winner or 'none'} — {win_reason} — {steps} steps{fmt_str}")

            if game_num < args.games:
                time.sleep(10)  # cooldown between browser sessions

        all_results[attacker_type] = results

    # Summary
    print(f"\n\n{'═' * 52}")
    print("  RESULTS SUMMARY")

    for attacker_type, results in all_results.items():
        label = "Claude Sonnet (baseline)" if attacker_type == "playwright-mcp" else "Qwen2.5-3B (finetuned)"
        print_metrics(label, compute_metrics(results))

    if len(all_results) == 2:
        bm = compute_metrics(all_results.get("playwright-mcp", []))
        fm = compute_metrics(all_results.get("finetuned", []))
        if bm["n"] and fm["n"]:
            print(f"\n{'─' * 52}")
            print("  HEAD-TO-HEAD")
            print(f"{'─' * 52}")
            wr_d    = fm["win_rate"]    - bm["win_rate"]
            step_d  = fm["avg_steps"]  - bm["avg_steps"]
            print(f"  Win rate Δ:     {wr_d:+.1%}  (Qwen vs Claude)")
            print(f"  Avg steps Δ:    {step_d:+.1f}  (Qwen vs Claude)")

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w") as f:
            json.dump(all_results, f, indent=2)
        print(f"\nResults saved → {out}")


if __name__ == "__main__":
    main()
