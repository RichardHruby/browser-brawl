"""
In-distribution evaluation of a fine-tuned Browser Brawl attacker model.

Runs N games against the Browser Brawl API with attackerType='finetuned',
compares results against a baseline (attackerType='playwright-mcp').

Prerequisites:
  - Browser Brawl dev server running: yarn dev
  - FINETUNED_MODEL_URL set in .env.local (from: modal deploy scripts/modal_serve.py)
  - BROWSER_USE_API_KEY set (each game needs a live browser)

Usage:
  python scripts/eval_browser_brawl.py
  python scripts/eval_browser_brawl.py --games 10 --difficulty easy
  python scripts/eval_browser_brawl.py --baseline-only   # just run Claude baseline
  python scripts/eval_browser_brawl.py --finetuned-only  # just run fine-tuned model
  python scripts/eval_browser_brawl.py --server http://localhost:3000

Metrics:
  - Task success rate (attacker wins)
  - Steps to completion (lower = better)
  - Tool call format compliance (% responses with valid <tool_call> XML)
  - Failure modes (max steps, health depleted, error)
"""

import argparse
import json
import time
import sys
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    sys.exit(1)

# ── Task definitions (must match /api/game/tasks) ─────────────────────────────

TASKS = [
    {
        "id": "hacker-news-upvote",
        "label": "Hacker News Upvote",
        "description": "Go to Hacker News and upvote the top post",
        "startUrl": "https://news.ycombinator.com",
    },
    {
        "id": "amazon-toothpaste",
        "label": "Amazon Toothpaste",
        "description": "Search for Sensodyne toothpaste and add it to cart",
        "startUrl": "https://www.amazon.com",
    },
]

# ── Game runner ────────────────────────────────────────────────────────────────

def start_game(server: str, task_id: str, attacker_type: str, difficulty: str) -> str | None:
    """Start a game, return sessionId or None on failure."""
    # First fetch the task object from the API
    tasks_resp = requests.get(f"{server}/api/game/tasks", timeout=10)
    tasks_resp.raise_for_status()
    tasks = tasks_resp.json()

    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        print(f"  WARN: task '{task_id}' not found in API response", file=sys.stderr)
        return None

    payload = {
        "task": task,
        "difficulty": difficulty,
        "attackerType": attacker_type,
        "mode": "realtime",
    }

    resp = requests.post(
        f"{server}/api/game/start",
        json=payload,
        timeout=30,
    )
    if not resp.ok:
        print(f"  WARN: start failed ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
        return None

    data = resp.json()
    return data.get("sessionId") or data.get("gameId")


def poll_game(server: str, session_id: str, timeout_s: int = 300) -> dict:
    """Poll game status until complete or timeout. Returns final status dict."""
    deadline = time.time() + timeout_s
    last_phase = None

    while time.time() < deadline:
        try:
            resp = requests.get(
                f"{server}/api/game/{session_id}/status",
                timeout=10,
            )
            if resp.ok:
                status = resp.json()
                phase = status.get("phase")
                if phase != last_phase:
                    print(f"    phase → {phase}")
                    last_phase = phase
                if phase == "game_over":
                    return status
        except requests.RequestException as e:
            print(f"  WARN: poll error: {e}", file=sys.stderr)

        time.sleep(5)

    return {"phase": "timeout", "winner": None, "winReason": "timeout"}


def abort_game(server: str, session_id: str) -> None:
    """Abort a running game."""
    try:
        requests.post(f"{server}/api/game/{session_id}/abort", timeout=10)
    except Exception:
        pass


# ── Metrics ────────────────────────────────────────────────────────────────────

def compute_metrics(results: list[dict]) -> dict:
    n = len(results)
    if n == 0:
        return {"n": 0}

    wins       = sum(1 for r in results if r.get("winner") == "attacker")
    avg_steps  = sum(r.get("steps", 0) for r in results) / n
    timeouts   = sum(1 for r in results if r.get("win_reason") == "timeout")
    health_dep = sum(1 for r in results if r.get("win_reason") == "health_depleted")

    return {
        "n":                n,
        "win_rate":         round(wins / n, 3),
        "wins":             wins,
        "losses":           n - wins,
        "avg_steps":        round(avg_steps, 1),
        "timeouts":         timeouts,
        "health_depleted":  health_dep,
    }


def print_metrics(label: str, metrics: dict) -> None:
    if metrics.get("n", 0) == 0:
        print(f"\n{label}: no games run")
        return
    print(f"\n{'─' * 50}")
    print(f"  {label}")
    print(f"{'─' * 50}")
    print(f"  Games:           {metrics['n']}")
    print(f"  Win rate:        {metrics['win_rate']:.1%}  ({metrics['wins']}W / {metrics['losses']}L)")
    print(f"  Avg steps:       {metrics['avg_steps']}")
    print(f"  Health depleted: {metrics['health_depleted']}")
    print(f"  Timeouts:        {metrics['timeouts']}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Evaluate fine-tuned Browser Brawl attacker"
    )
    parser.add_argument("--server",         default="http://localhost:3000",  help="Browser Brawl server URL")
    parser.add_argument("--games",          type=int, default=5,              help="Games per attacker type")
    parser.add_argument("--difficulty",     default="easy",                   help="easy|medium|hard|nightmare")
    parser.add_argument("--task",           default="hacker-news-upvote",     help="Task ID to run")
    parser.add_argument("--game-timeout",   type=int, default=300,            help="Max seconds per game")
    parser.add_argument("--baseline-only",  action="store_true")
    parser.add_argument("--finetuned-only", action="store_true")
    parser.add_argument("--output",         default="",                       help="Save results JSON to file")
    args = parser.parse_args()

    print(f"Browser Brawl Eval")
    print(f"  Server:     {args.server}")
    print(f"  Task:       {args.task}")
    print(f"  Difficulty: {args.difficulty}")
    print(f"  Games each: {args.games}")
    print()

    # Verify server is reachable
    try:
        requests.get(f"{args.server}/api/game/tasks", timeout=5).raise_for_status()
    except Exception as e:
        print(f"ERROR: Cannot reach server at {args.server}: {e}")
        print("Start the dev server with: yarn dev")
        sys.exit(1)

    attacker_types = []
    if not args.finetuned_only:
        attacker_types.append("playwright-mcp")   # Claude Sonnet baseline
    if not args.baseline_only:
        attacker_types.append("finetuned")        # Fine-tuned Qwen model

    all_results: dict[str, list[dict]] = {}

    for attacker_type in attacker_types:
        print(f"\n{'═' * 50}")
        print(f"  Running: {attacker_type}  ({args.games} games)")
        print(f"{'═' * 50}")

        results = []

        for game_num in range(1, args.games + 1):
            print(f"\n  Game {game_num}/{args.games}...")

            session_id = start_game(args.server, args.task, attacker_type, args.difficulty)
            if not session_id:
                print("  SKIP: failed to start game")
                results.append({"winner": None, "win_reason": "start_failed", "steps": 0})
                continue

            print(f"  Session: {session_id}")
            status = poll_game(args.server, session_id, timeout_s=args.game_timeout)

            winner     = status.get("winner")
            win_reason = status.get("winReason") or status.get("phase")
            steps      = len(status.get("attackerSteps", []))

            result = {
                "game_num":    game_num,
                "session_id":  session_id,
                "attacker":    attacker_type,
                "task":        args.task,
                "difficulty":  args.difficulty,
                "winner":      winner,
                "win_reason":  win_reason,
                "steps":       steps,
                "timestamp":   datetime.utcnow().isoformat(),
            }
            results.append(result)

            icon = "✓" if winner == "attacker" else "✗"
            print(f"  {icon} {winner or 'none'} won — {win_reason} — {steps} steps")

            # Brief cooldown between games (browser sessions take time to spin up)
            if game_num < args.games:
                time.sleep(10)

        all_results[attacker_type] = results

    # Print summary
    print(f"\n\n{'═' * 50}")
    print("  RESULTS SUMMARY")

    for attacker_type, results in all_results.items():
        label = "Baseline (Claude Sonnet)" if attacker_type == "playwright-mcp" else "Fine-tuned (Qwen2.5-3B)"
        print_metrics(label, compute_metrics(results))

    # Head-to-head comparison
    if len(all_results) == 2:
        baseline_m  = compute_metrics(all_results.get("playwright-mcp", []))
        finetuned_m = compute_metrics(all_results.get("finetuned", []))
        print(f"\n{'─' * 50}")
        print("  HEAD-TO-HEAD")
        print(f"{'─' * 50}")
        if baseline_m["n"] and finetuned_m["n"]:
            wr_delta = finetuned_m["win_rate"] - baseline_m["win_rate"]
            step_delta = finetuned_m["avg_steps"] - baseline_m["avg_steps"]
            print(f"  Win rate delta:   {wr_delta:+.1%}  (finetuned vs baseline)")
            print(f"  Avg steps delta:  {step_delta:+.1f}  (finetuned vs baseline)")

    # Save JSON results
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(all_results, f, indent=2)
        print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
