"""
Convert ShareGPT JSONL → OpenAI Messages JSONL for Unsloth/Axolotl training.

Reads the output of convert-to-sharegpt.ts and:
  1. Maps roles: system→system, human→user, gpt→assistant, tool→tool
  2. Wraps string values in typed content arrays: [{"type": "text", "text": "..."}]
  3. Optionally downloads screenshots from Convex URLs → data/images/{gameId}/{step}.png
  4. Inserts {"type": "image", "image": "file:///..."} content blocks when available

Output format (Unsloth FastVisionModel expects):
  {"messages": [
    {"role": "system",    "content": [{"type": "text", "text": "..."}]},
    {"role": "user",      "content": [{"type": "image", "image": "file:///..."}, {"type": "text", "text": "..."}]},
    {"role": "assistant", "content": [{"type": "text", "text": "..."}]},
    {"role": "tool",      "content": [{"type": "text", "text": "..."}]},
    ...
  ], "metadata": {...}}

Usage:
  python scripts/prepare_training_data.py -i data/sharegpt.jsonl -o data/train.jsonl
  python scripts/prepare_training_data.py -i data/sharegpt.jsonl -o data/train.jsonl --download-images
  python scripts/prepare_training_data.py -i data/sharegpt.jsonl -o data/train.jsonl --download-images --images-dir data/images
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Only import requests/Pillow when actually downloading images
def _import_download_deps():
    try:
        import requests
        from PIL import Image
        import io
        return requests, Image, io
    except ImportError:
        print("ERROR: Install deps first: pip install requests Pillow", file=sys.stderr)
        sys.exit(1)


# ── Role mapping ──────────────────────────────────────────────────────────────

ROLE_MAP = {
    "system": "system",
    "human":  "user",
    "gpt":    "assistant",
    "tool":   "tool",
}


# ── Conversion ────────────────────────────────────────────────────────────────

def convert_message(msg: dict, image_path: str | None = None) -> dict:
    """
    Convert a single ShareGPT message to OpenAI Messages format.

    ShareGPT:  {"from": "gpt", "value": "some text"}
    OpenAI:    {"role": "assistant", "content": [{"type": "text", "text": "some text"}]}

    If image_path is provided, prepend it as an image content block.
    """
    role = ROLE_MAP.get(msg["from"], msg["from"])
    text = msg["value"]

    content = []

    # Prepend image block if provided (for tool response / observation messages)
    if image_path:
        # image_path is already an absolute path with forward slashes
        # Unsloth FastVisionModel accepts "file:///abs/path.png" or just the path
        content.append({"type": "image", "image": f"file:///{image_path}"})

    content.append({"type": "text", "text": text})

    return {"role": role, "content": content}


def convert_example(
    sharegpt: dict,
    image_dir: Path | None,
    download_images: bool,
) -> dict:
    """
    Convert a full ShareGPT training example to OpenAI Messages format.

    The raw JSONL has:
      - sharegpt["conversations"]: list of {from, value} messages
      - sharegpt["metadata"]: game metadata

    Image association strategy:
      - Screenshots are captured BEFORE each tool call (browser_snapshot result includes the screenshot)
      - We associate screenshots with tool response messages (from="tool")
      - Step numbering in metadata.steps corresponds to tool call order
    """
    game_id = sharegpt.get("metadata", {}).get("gameId", "unknown")
    conversations = sharegpt.get("conversations", [])
    metadata = sharegpt.get("metadata", {})

    # Build a list of image paths if available, keyed by tool-response index
    # We count tool messages (from="tool") to match screenshot step numbers
    tool_response_index = 0
    image_paths: dict[int, str] = {}  # tool_response_index → image path

    if image_dir and game_id != "unknown":
        game_image_dir = image_dir / game_id
        if game_image_dir.exists():
            # Screenshots are named {stepNumber}.png — collect all, sorted by step number
            # Map by 0-based position so tool response 0 gets image 0, etc.
            existing = sorted(game_image_dir.glob("*.png"), key=lambda p: int(p.stem))
            for i, img_path in enumerate(existing):
                # Use absolute path with forward slashes for Unsloth file:// URI
                image_paths[i] = str(img_path.resolve()).replace("\\", "/")

    # Convert messages
    messages = []
    tool_idx = 0
    for msg in conversations:
        from_role = msg.get("from", "")

        # Attach screenshot to tool response messages if available
        img_path = None
        if from_role == "tool":
            if tool_idx in image_paths:
                img_path = image_paths[tool_idx]
            tool_idx += 1

        messages.append(convert_message(msg, img_path))

    return {"messages": messages, "metadata": metadata}


def download_screenshot(url: str, dest_path: Path, requests_mod, Image_mod, io_mod) -> bool:
    """Download a screenshot from a URL, resize to max 768px wide, save as PNG."""
    try:
        resp = requests_mod.get(url, timeout=15)
        resp.raise_for_status()
        img = Image_mod.open(io_mod.BytesIO(resp.content))

        # Resize to max 768px on the longest side (keeps token count reasonable)
        max_size = 768
        w, h = img.size
        if max(w, h) > max_size:
            scale = max_size / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image_mod.LANCZOS)

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest_path, "PNG", optimize=True)
        return True
    except Exception as e:
        print(f"  WARN: failed to download {url}: {e}", file=sys.stderr)
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convert ShareGPT JSONL → OpenAI Messages JSONL for Unsloth/Axolotl"
    )
    parser.add_argument("-i", "--input",  required=True, help="Input ShareGPT JSONL file")
    parser.add_argument("-o", "--output", required=True, help="Output OpenAI Messages JSONL file")
    parser.add_argument(
        "--download-images",
        action="store_true",
        help="Download screenshots from Convex URLs (requires raw JSONL with screenshotUrl fields)",
    )
    parser.add_argument(
        "--raw-jsonl",
        help="Path to raw JSONL (from extract-training-data.ts) for screenshot URL lookup",
    )
    parser.add_argument(
        "--images-dir",
        default="data/images",
        help="Directory to save downloaded screenshots (default: data/images)",
    )
    parser.add_argument(
        "--text-only",
        action="store_true",
        help="Skip all images, output text-only conversations",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    images_dir = Path(args.images_dir) if not args.text_only else None

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Load raw JSONL for screenshot URLs (optional)
    screenshot_urls: dict[str, dict[int, str]] = {}  # gameId → {stepNumber → url}
    if args.download_images and args.raw_jsonl:
        requests_mod, Image_mod, io_mod = _import_download_deps()
        raw_path = Path(args.raw_jsonl)
        if raw_path.exists():
            print(f"[prepare] Loading screenshot URLs from {raw_path}", file=sys.stderr)
            with open(raw_path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    raw = json.loads(line)
                    game_id = raw.get("gameId", "")
                    steps = raw.get("steps", [])
                    screenshot_urls[game_id] = {
                        s["stepNumber"]: s["screenshotUrl"]
                        for s in steps
                        if s.get("screenshotUrl")
                    }
            print(f"[prepare] Found screenshot URLs for {len(screenshot_urls)} games", file=sys.stderr)

    # Download screenshots if requested
    if args.download_images and screenshot_urls:
        print(f"[prepare] Downloading screenshots to {images_dir}/...", file=sys.stderr)
        for game_id, steps in screenshot_urls.items():
            game_dir = images_dir / game_id
            downloaded = 0
            for step_num, url in steps.items():
                dest = game_dir / f"{step_num}.png"
                if dest.exists():
                    downloaded += 1
                    continue  # already downloaded
                if download_screenshot(url, dest, requests_mod, Image_mod, io_mod):
                    downloaded += 1
            print(f"[prepare]   {game_id}: {downloaded}/{len(steps)} screenshots", file=sys.stderr)

    # Convert ShareGPT → OpenAI Messages
    print(f"[prepare] Converting {input_path} → {output_path}", file=sys.stderr)
    with open(input_path) as f_in:
        lines = [l.strip() for l in f_in if l.strip()]

    print(f"[prepare] Processing {len(lines)} examples...", file=sys.stderr)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    converted = 0
    with_images = 0

    with open(output_path, "w") as f_out:
        for line in lines:
            sharegpt = json.loads(line)
            example = convert_example(sharegpt, images_dir, args.download_images)

            # Count how many messages have images
            has_img = any(
                any(c.get("type") == "image" for c in msg.get("content", []))
                for msg in example["messages"]
            )
            if has_img:
                with_images += 1

            f_out.write(json.dumps(example, ensure_ascii=False) + "\n")
            converted += 1

    print(f"[prepare] Done.", file=sys.stderr)
    print(f"  Converted: {converted}", file=sys.stderr)
    print(f"  With images: {with_images}", file=sys.stderr)
    print(f"  Text-only: {converted - with_images}", file=sys.stderr)
    print(f"  Output: {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
