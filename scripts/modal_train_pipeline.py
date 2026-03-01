"""
Modal training pipeline — web endpoint + async GPU training function.

Architecture:
  1. POST /kickoff — receives { data_url, experiment_name, text_only, convex_site_url }
     Spawns the GPU training function, returns immediately with { call_id }.
  2. train() — GPU function that downloads data, trains, merges, and calls
     Convex HTTP endpoint at each phase to update job status in real-time.

Deploy:
  modal deploy scripts/modal_train_pipeline.py

The deployed kickoff URL becomes MODAL_TRAIN_ENDPOINT in .env.local.
"""

import modal

# ── App ────────────────────────────────────────────────────────────────────────

app = modal.App("browser-brawl-train-pipeline")

# ── Images ─────────────────────────────────────────────────────────────────────

# Lightweight image for the web endpoint (no GPU deps needed)
web_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("requests>=2.31.0", "fastapi[standard]")
)

# Heavy image for GPU training (same as modal_finetune.py)
train_image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "unsloth[cu128-torch270]==2025.7.8",
        "unsloth_zoo==2025.7.10",
        "trl==0.19.1",
        "transformers==4.54.0",
        "peft==0.16.0",
        "datasets==3.6.0",
        "accelerate==1.9.0",
        "huggingface_hub==0.34.2",
        "hf-transfer==0.1.9",
        "requests>=2.31.0",
    )
    .env({
        "HF_HOME": "/model_cache",
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
    })
)

# ── Volumes ────────────────────────────────────────────────────────────────────

model_cache    = modal.Volume.from_name("browser-brawl-model-cache",   create_if_missing=True)
data_volume    = modal.Volume.from_name("browser-brawl-training-data", create_if_missing=True)
checkpoint_vol = modal.Volume.from_name("browser-brawl-checkpoints",   create_if_missing=True)

# ── Training config ───────────────────────────────────────────────────────────

# Universal serve endpoint — deployed once, each experiment_name query param
# gets its own auto-scaling container pool via modal.parameter().
SERVE_BASE_URL = "https://mehulkalia--browser-brawl-serve-model-chat.modal.run"

TEXT_ONLY_MODEL = "unsloth/Qwen2.5-3B-Instruct"
LORA_R = 16
LORA_ALPHA = 16
NUM_EPOCHS = 3
LEARNING_RATE = 2e-4
BATCH_SIZE = 2
GRAD_ACCUM = 4
MAX_SEQ_LEN = 4096


# ── Convex status callback ───────────────────────────────────────────────────

def update_convex_status(convex_site_url: str, experiment_name: str, **kwargs):
    """POST status update to Convex HTTP endpoint."""
    import requests
    url = f"{convex_site_url}/api/training-status"
    payload = {"experimentName": experiment_name, **kwargs}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        print(f"[pipeline] Convex status update: {kwargs.get('status', '?')} → {resp.status_code}", flush=True)
    except Exception as e:
        print(f"[pipeline] WARN: Convex status update failed: {e}", flush=True)


# ── GPU training function ─────────────────────────────────────────────────────

@app.function(
    image=train_image,
    gpu="A10G",
    volumes={
        "/model_cache":  model_cache,
        "/data":         data_volume,
        "/checkpoints":  checkpoint_vol,
    },
    timeout=6 * 60 * 60,  # 6 hours
)
def train(
    data_url: str,
    experiment_name: str,
    text_only: bool,
    convex_site_url: str,
):
    """Download data, fine-tune, merge, update Convex at each phase."""
    import json
    import requests as req
    from pathlib import Path

    print(f"[pipeline] Starting training: {experiment_name}", flush=True)
    print(f"[pipeline] text_only={text_only}, data_url={data_url[:80]}...", flush=True)

    try:
        # ── Phase 1: Download data ────────────────────────────────────────
        update_convex_status(convex_site_url, experiment_name, status="training")

        print("[pipeline] Downloading training data...", flush=True)
        resp = req.get(data_url, timeout=60)
        resp.raise_for_status()
        data_text = resp.text.strip()
        lines = [l for l in data_text.split("\n") if l.strip()]
        print(f"[pipeline] Downloaded {len(lines)} training examples", flush=True)

        # Save to volume
        train_path = Path("/data/train.jsonl")
        train_path.write_text(data_text)

        # ── Phase 2: Train ────────────────────────────────────────────────
        if text_only:
            _train_text_only(experiment_name, train_path, convex_site_url)
        else:
            _train_vlm(experiment_name, train_path, convex_site_url)

        # ── Phase 3: Done ─────────────────────────────────────────────────
        model_path = f"/checkpoints/experiments/{experiment_name}/merged_model"
        serve_url = f"{SERVE_BASE_URL}?experiment_name={experiment_name}"

        update_convex_status(
            convex_site_url, experiment_name,
            status="ready",
            serveUrl=serve_url,
        )
        print(f"[pipeline] Training complete: {experiment_name}", flush=True)
        print(f"[pipeline] Merged model at: {model_path} (on browser-brawl-checkpoints volume)", flush=True)
        print(f"[pipeline] Serve URL (live immediately): {serve_url}", flush=True)
        return {
            "status": "complete",
            "experiment_name": experiment_name,
            "model_path": model_path,
            "serve_url": serve_url,
        }

    except Exception as e:
        print(f"[pipeline] ERROR: {e}", flush=True)
        update_convex_status(
            convex_site_url, experiment_name,
            status="failed",
            error=str(e)[:500],
        )
        raise


def _train_text_only(experiment_name: str, train_path, convex_site_url: str):
    """Text-only fine-tuning with Qwen2.5-3B-Instruct."""
    import unsloth  # MUST be first
    import json
    from pathlib import Path
    from unsloth import FastLanguageModel
    from trl import SFTTrainer, SFTConfig
    import datasets as hf_datasets

    print(f"[pipeline] Loading {TEXT_ONLY_MODEL}...", flush=True)
    model, tokenizer = FastLanguageModel.from_pretrained(
        TEXT_ONLY_MODEL,
        max_seq_length=MAX_SEQ_LEN,
        load_in_4bit=True,
        use_gradient_checkpointing="unsloth",
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_R, lora_alpha=LORA_ALPHA, lora_dropout=0, bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )

    # Load and format dataset
    raw = [json.loads(line) for line in open(train_path) if line.strip()]

    def format_example(example):
        messages = []
        for msg in example["messages"]:
            role = msg["role"]
            text = " ".join(
                block["text"] for block in msg["content"]
                if block.get("type") == "text"
            )
            messages.append({"role": role, "content": text})
        return {"text": tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False,
        )}

    dataset = hf_datasets.Dataset.from_list(raw)
    dataset = dataset.map(format_example, remove_columns=dataset.column_names)
    print(f"[pipeline] Loaded {len(dataset)} examples", flush=True)

    # Train
    FastLanguageModel.for_training(model)
    checkpoint_dir = Path(f"/checkpoints/experiments/{experiment_name}")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    # Custom callback to update Convex with training metrics
    from transformers import TrainerCallback

    class ConvexCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            if logs and "loss" in logs:
                update_convex_status(
                    convex_site_url, experiment_name,
                    status="training",
                    currentStep=int(state.global_step),
                    totalSteps=int(state.max_steps),
                    currentLoss=round(float(logs["loss"]), 4),
                )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LEN,
        callbacks=[ConvexCallback()],
        args=SFTConfig(
            per_device_train_batch_size=BATCH_SIZE,
            gradient_accumulation_steps=GRAD_ACCUM,
            num_train_epochs=NUM_EPOCHS,
            learning_rate=LEARNING_RATE,
            optim="adamw_8bit",
            lr_scheduler_type="cosine",
            warmup_ratio=0.05,
            weight_decay=0.01,
            logging_steps=1,
            output_dir=str(checkpoint_dir),
            save_strategy="epoch",
            bf16=True,
            report_to="none",
        ),
    )

    print("[pipeline] Starting training...", flush=True)
    trainer.train()

    # Save LoRA adapter
    final_dir = checkpoint_dir / "final_model"
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))

    # Merge LoRA into base model (required for vLLM serving)
    update_convex_status(convex_site_url, experiment_name, status="merging")
    merged_dir = checkpoint_dir / "merged_model"
    print(f"[pipeline] Merging LoRA → {merged_dir}...", flush=True)
    model.save_pretrained_merged(str(merged_dir), tokenizer, save_method="merged_16bit")

    print(f"[pipeline] Merged model saved at {merged_dir}", flush=True)


def _train_vlm(experiment_name: str, train_path, convex_site_url: str):
    """Multimodal fine-tuning — placeholder, uses text-only for now."""
    # TODO: implement VLM path when needed
    print("[pipeline] VLM mode not yet implemented, falling back to text-only", flush=True)
    _train_text_only(experiment_name, train_path, convex_site_url)


# ── Web endpoint (kickoff) ────────────────────────────────────────────────────

@app.function(image=web_image)
@modal.fastapi_endpoint(method="POST", docs=True)
def kickoff(request: dict) -> dict:
    """
    Accept a training request and spawn the GPU training function.
    Returns immediately with a call_id.

    POST body:
      {
        "data_url": "https://...",          // Convex file storage URL for JSONL
        "experiment_name": "text-20260301", // Unique experiment name
        "text_only": true,                  // text-only or VLM
        "convex_site_url": "https://standing-lark-465.convex.site"
      }
    """
    data_url = request.get("data_url")
    experiment_name = request.get("experiment_name")
    text_only = request.get("text_only", True)
    convex_site_url = request.get("convex_site_url")

    if not data_url or not experiment_name or not convex_site_url:
        return {"error": "Missing required fields: data_url, experiment_name, convex_site_url"}

    # Spawn the training function asynchronously — returns immediately
    train_fn = modal.Function.from_name("browser-brawl-train-pipeline", "train")
    call = train_fn.spawn(
        data_url=data_url,
        experiment_name=experiment_name,
        text_only=text_only,
        convex_site_url=convex_site_url,
    )

    return {
        "status": "spawned",
        "call_id": call.object_id,
        "experiment_name": experiment_name,
    }


@app.function(image=web_image)
@modal.fastapi_endpoint(method="GET")
def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "app": "browser-brawl-train-pipeline"}
