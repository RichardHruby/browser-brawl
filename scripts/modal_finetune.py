"""
Fine-tune Qwen2.5-VL-3B on Browser Brawl training data using Unsloth on Modal.

Two modes:
  --text-only  : uses Qwen2.5-3B-Instruct (no vision) + FastLanguageModel
                 Fastest path to validate the pipeline works.
  (default)    : uses Qwen2.5-VL-3B-Instruct + FastVisionModel
                 Multimodal — screenshots + DOM text.

Usage:
  # Upload data first
  modal volume create training-data
  modal volume put training-data data/openai_messages.jsonl /data/train.jsonl
  modal volume put training-data data/images/ /data/images/      # (multimodal only)

  # Run training
  modal run scripts/modal_finetune.py                            # multimodal
  modal run scripts/modal_finetune.py -- --text-only             # text-only
  modal run --detach scripts/modal_finetune.py                   # background

  # Download model
  modal volume get checkpoints /experiments/<name>/final_model ./local_model/
"""

import argparse
import modal

# ── App ────────────────────────────────────────────────────────────────────────

app = modal.App("browser-brawl-finetune")

# ── Container image ───────────────────────────────────────────────────────────

# Unsloth MUST be imported first inside the container so it patches transformers/peft/trl
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
        "qwen-vl-utils[decord]==0.0.8",  # Required for Qwen2.5-VL image processing
        "Pillow>=10.0.0",
    )
    .env({
        "HF_HOME": "/model_cache",
        "HF_HUB_ENABLE_HF_TRANSFER": "1",  # Faster HF downloads
    })
)

# ── Volumes ────────────────────────────────────────────────────────────────────

model_cache   = modal.Volume.from_name("browser-brawl-model-cache",  create_if_missing=True)
data_volume   = modal.Volume.from_name("browser-brawl-training-data", create_if_missing=True)
checkpoint_vol = modal.Volume.from_name("browser-brawl-checkpoints",  create_if_missing=True)

# ── Training config ────────────────────────────────────────────────────────────

# Text-only path: Qwen2.5-3B-Instruct (faster, no VL complexity)
TEXT_ONLY_MODEL = "unsloth/Qwen2.5-3B-Instruct"

# Multimodal path: Qwen2.5-VL-3B with vision
VL_MODEL = "unsloth/Qwen2.5-VL-3B-Instruct-unsloth-bnb-4bit"

LORA_R = 16
LORA_ALPHA = 16
NUM_EPOCHS = 3
LEARNING_RATE = 2e-4
BATCH_SIZE = 2
GRAD_ACCUM = 4
MAX_SEQ_LEN = 4096

# ── Training function (multimodal) ─────────────────────────────────────────────

@app.function(
    image=train_image,
    gpu="A10G",  # 24GB VRAM — fits Qwen2.5-VL-3B with QLoRA
    volumes={
        "/model_cache":  model_cache,
        "/data":         data_volume,
        "/checkpoints":  checkpoint_vol,
    },
    timeout=6 * 60 * 60,  # 6 hours
    retries=modal.Retries(initial_delay=0.0, max_retries=2),
)
def finetune_vlm(experiment_name: str = "qwen25vl-3b"):
    """Fine-tune Qwen2.5-VL-3B with screenshots (multimodal)."""
    import unsloth  # MUST be first import
    import json
    from pathlib import Path
    from unsloth import FastVisionModel
    from unsloth.trainer import UnslothVisionDataCollator
    from trl import SFTTrainer, SFTConfig

    print(f"[train] Starting VLM fine-tune: {experiment_name}", flush=True)

    # Load model
    print(f"[train] Loading {VL_MODEL}...", flush=True)
    model, tokenizer = FastVisionModel.from_pretrained(
        VL_MODEL,
        load_in_4bit=True,
        use_gradient_checkpointing="unsloth",
    )

    # Configure LoRA
    model = FastVisionModel.get_peft_model(
        model,
        finetune_vision_layers=True,
        finetune_language_layers=True,
        finetune_attention_modules=True,
        finetune_mlp_modules=True,
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=0,
        bias="none",
        random_state=42,
    )

    # Load dataset from volume
    train_path = Path("/data/train.jsonl")
    if not train_path.exists():
        raise FileNotFoundError(
            f"Training data not found at {train_path}. "
            "Upload with: modal volume put browser-brawl-training-data data/openai_messages_with_images.jsonl /data/train.jsonl"
        )

    print(f"[train] Loading dataset from {train_path}...", flush=True)
    dataset = [json.loads(line) for line in open(train_path) if line.strip()]
    print(f"[train] Loaded {len(dataset)} training examples", flush=True)

    # Train
    FastVisionModel.for_training(model)
    checkpoint_dir = Path(f"/checkpoints/experiments/{experiment_name}")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        data_collator=UnslothVisionDataCollator(model, tokenizer),
        train_dataset=dataset,
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
            # REQUIRED for vision training:
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
            max_seq_length=MAX_SEQ_LEN,
            bf16=True,
            report_to="none",
        ),
    )

    print("[train] Starting training...", flush=True)
    trainer.train()

    # Save final model
    final_dir = checkpoint_dir / "final_model"
    print(f"[train] Saving to {final_dir}...", flush=True)
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))

    print(f"[train] Done! Model at /checkpoints/experiments/{experiment_name}/final_model", flush=True)
    return experiment_name


# ── Training function (text-only) ──────────────────────────────────────────────

@app.function(
    image=train_image,
    gpu="A10G",
    volumes={
        "/model_cache":  model_cache,
        "/data":         data_volume,
        "/checkpoints":  checkpoint_vol,
    },
    timeout=4 * 60 * 60,
    retries=modal.Retries(initial_delay=0.0, max_retries=2),
)
def finetune_text_only(experiment_name: str = "qwen25-3b-text"):
    """Fine-tune Qwen2.5-3B-Instruct text-only (no VL). Fastest validation path."""
    import unsloth  # MUST be first
    import json
    from pathlib import Path
    from unsloth import FastLanguageModel
    from unsloth.chat_templates import standardize_sharegpt
    from trl import SFTTrainer, SFTConfig
    import datasets as hf_datasets

    print(f"[train] Starting text-only fine-tune: {experiment_name}", flush=True)

    # Load model
    print(f"[train] Loading {TEXT_ONLY_MODEL}...", flush=True)
    model, tokenizer = FastLanguageModel.from_pretrained(
        TEXT_ONLY_MODEL,
        max_seq_length=MAX_SEQ_LEN,
        load_in_4bit=True,
        use_gradient_checkpointing="unsloth",
    )

    # Configure LoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )

    # Load dataset — expects OpenAI Messages format (role/content)
    # For text-only, content is always a list with a single text block
    train_path = Path("/data/train.jsonl")
    if not train_path.exists():
        raise FileNotFoundError(
            f"Training data not found at {train_path}. "
            "Upload with: modal volume put browser-brawl-training-data data/openai_messages.jsonl /data/train.jsonl"
        )

    print(f"[train] Loading dataset from {train_path}...", flush=True)
    raw = [json.loads(line) for line in open(train_path) if line.strip()]

    # Convert OpenAI Messages format to text using chat template
    def format_example(example):
        # Flatten content arrays to plain text for text-only training
        messages = []
        for msg in example["messages"]:
            role = msg["role"]
            text = " ".join(
                block["text"] for block in msg["content"]
                if block.get("type") == "text"
            )
            messages.append({"role": role, "content": text})

        return {"text": tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )}

    dataset = hf_datasets.Dataset.from_list(raw)
    dataset = dataset.map(format_example, remove_columns=dataset.column_names)
    print(f"[train] Loaded {len(dataset)} training examples", flush=True)

    # Train
    FastLanguageModel.for_training(model)
    checkpoint_dir = Path(f"/checkpoints/experiments/{experiment_name}")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LEN,
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

    print("[train] Starting training...", flush=True)
    trainer.train()

    final_dir = checkpoint_dir / "final_model"
    print(f"[train] Saving to {final_dir}...", flush=True)
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))

    print(f"[train] Done! Model at /checkpoints/experiments/{experiment_name}/final_model", flush=True)
    return experiment_name


# ── Local entrypoint ───────────────────────────────────────────────────────────

@app.local_entrypoint()
def main(
    text_only: bool = False,
    experiment_name: str = "",
):
    """
    Launch fine-tuning on Modal.

    Examples:
      modal run scripts/modal_finetune.py                               # multimodal (default)
      modal run scripts/modal_finetune.py -- --text-only                # text-only (faster)
      modal run scripts/modal_finetune.py -- --experiment-name my-run   # custom name
      modal run --detach scripts/modal_finetune.py -- --text-only       # background
    """
    from datetime import datetime

    if not experiment_name:
        ts = datetime.now().strftime("%Y%m%d-%H%M")
        experiment_name = f"{'text' if text_only else 'vlm'}-{ts}"

    print(f"Launching {'text-only' if text_only else 'multimodal VLM'} fine-tune")
    print(f"Experiment: {experiment_name}")
    print()
    print("Data upload reminder (run these locally before training):")
    if text_only:
        print("  modal volume put browser-brawl-training-data data/openai_messages.jsonl /data/train.jsonl")
    else:
        print("  modal volume put browser-brawl-training-data data/openai_messages_with_images.jsonl /data/train.jsonl")
        print("  modal volume put browser-brawl-training-data data/images/ /data/images/")
    print()

    if text_only:
        result = finetune_text_only.remote(experiment_name)
    else:
        result = finetune_vlm.remote(experiment_name)

    print(f"Training complete: {result}")
    print()
    print("Download model with:")
    print(f"  modal volume get browser-brawl-checkpoints /experiments/{result}/final_model ./local_model/")
