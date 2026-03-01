# Modal GPU Platform Reference

Research compiled from Modal docs, official examples, and pricing page.

## Setup

```bash
pip install modal
modal token new      # One-time auth
```

## GPU Pricing (Per-Second Billing, No Idle Costs)

| GPU | VRAM | Per-Hour | Notes |
|-----|------|----------|-------|
| NVIDIA T4 | 16 GB | $0.59 | Minimum viable for 3B QLoRA |
| NVIDIA L4 | 24 GB | $0.80 | Budget option |
| NVIDIA A10G | 24 GB | $1.10 | Good for QLoRA 3B |
| NVIDIA L40S | 48 GB | $1.95 | Default in Modal examples |
| NVIDIA A100 40GB | 40 GB | $2.10 | Good for 7B |
| NVIDIA A100 80GB | 80 GB | $2.50 | Sweet spot for large models |
| NVIDIA H100 | 80 GB | $3.95 | Overkill for 3B |

**Free tier:** $30/month on Starter plan.

**For Qwen2.5-VL-3B QLoRA:** A10G ($1.10/hr) or L40S ($1.95/hr). Training 50-150 trajectories: 1-3 hours → **$1-6 per run**.

## Complete Working Example (Unsloth on Modal)

Source: `modal-labs/modal-examples/06_gpu_and_ml/unsloth_finetune.py`

### Container Image

```python
import modal

app = modal.App("browser-brawl-finetune")

train_image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "accelerate==1.9.0",
        "datasets==3.6.0",
        "hf-transfer==0.1.9",
        "huggingface_hub==0.34.2",
        "peft==0.16.0",
        "transformers==4.54.0",
        "trl==0.19.1",
        "unsloth[cu128-torch270]==2025.7.8",
        "unsloth_zoo==2025.7.10",
        "wandb==0.21.0",
        "qwen-vl-utils[decord]==0.0.8",  # Required for Qwen2.5-VL
    )
    .env({"HF_HOME": "/model_cache"})
)
```

**Critical:** Import `unsloth` BEFORE everything else so its patches to `transformers`, `peft`, `trl` apply.

### Volumes (Persistent Storage)

```python
model_cache = modal.Volume.from_name("model-cache", create_if_missing=True)
data_volume = modal.Volume.from_name("training-data", create_if_missing=True)
checkpoint_volume = modal.Volume.from_name("checkpoints", create_if_missing=True)
```

### Training Function

```python
@app.function(
    image=train_image,
    gpu="A10G",  # or "L40S", "A100"
    volumes={
        "/model_cache": model_cache,
        "/data": data_volume,
        "/checkpoints": checkpoint_volume,
    },
    timeout=6 * 60 * 60,  # 6 hours
    retries=modal.Retries(initial_delay=0.0, max_retries=3),
)
def finetune():
    import unsloth  # import first!
    from unsloth import FastVisionModel
    from unsloth.trainer import UnslothVisionDataCollator
    from trl import SFTTrainer, SFTConfig

    # Load model
    model, tokenizer = FastVisionModel.from_pretrained(
        "unsloth/Qwen2.5-VL-3B-Instruct-unsloth-bnb-4bit",
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
        r=16,
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
    )

    # Load dataset from volume
    import json
    dataset = []
    with open("/data/train.jsonl") as f:
        for line in f:
            dataset.append(json.loads(line))

    # Train
    FastVisionModel.for_training(model)
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        data_collator=UnslothVisionDataCollator(model, tokenizer),
        train_dataset=dataset,
        args=SFTConfig(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            num_train_epochs=3,
            learning_rate=2e-4,
            optim="adamw_8bit",
            output_dir="/checkpoints/run",
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
        ),
    )
    trainer.train()

    # Save
    model.save_pretrained("/checkpoints/final_model")
    tokenizer.save_pretrained("/checkpoints/final_model")

@app.local_entrypoint()
def main():
    finetune.remote()
```

### Launch

```bash
# Run training
modal run finetune.py

# Run in background (detached)
modal run --detach finetune.py
```

## Data Upload / Download

### Upload Training Data

```bash
# Create volume
modal volume create training-data

# Upload JSONL + images
modal volume put training-data data/train.jsonl /data/train.jsonl
modal volume put training-data data/images/ /data/images/

# Verify
modal volume ls training-data /data/
```

### Download Results

```bash
# Download trained model
modal volume get checkpoints /final_model ./local_model/

# Download all checkpoints
modal volume get checkpoints / ./all_checkpoints/
```

### Alternative: Mount Local Files (Re-uploads Each Run)

```python
@app.function(
    mounts=[modal.Mount.from_local_dir("./data", remote_path="/data")]
)
def finetune():
    # /data/train.jsonl available inside container
    ...
```

### Alternative: Push to HuggingFace

```python
@app.function(
    secrets=[modal.Secret.from_name("huggingface-secret")],
    ...
)
def finetune():
    # ... training ...
    model.push_to_hub("your-org/browser-brawl-qwen-vl-3b-lora")
```

## Simpler Alternatives

### Google Colab (Free or $10/mo)

Best for initial PoC validation:

- Free: T4 (16GB) — fits Qwen2.5-VL-3B QLoRA
- Pro ($10/mo): A100 (40GB)
- Official Unsloth Qwen2.5-VL notebook exists
- 12-hour session limit, may disconnect

### RunPod ($0.59-1.20/hr)

SSH into a GPU container:

- Pre-built Axolotl template available
- Full root access, persistent storage
- More hands-on than Modal

## Cost Estimates for Our Pipeline

| Scenario | Platform | GPU | Time | Cost |
|----------|----------|-----|------|------|
| 50 trajectories, quick test | Colab Free | T4 | ~30 min | $0 |
| 150 trajectories, 3 epochs | Modal | A10G | ~2 hr | $2-3 |
| 150 trajectories, 3 epochs | Modal | L40S | ~1.5 hr | $3-4 |
| 500 trajectories, 3 epochs | Modal | A100 | ~1.5 hr | $3-4 |

## Sources

- Modal Fine-Tuning Guide: https://modal.com/blog/llm-fine-tuning-guide
- Modal Pricing: https://modal.com/pricing
- Modal Unsloth Example (Docs): https://modal.com/docs/examples/unsloth_finetune
- Modal Unsloth Example (Source): https://github.com/modal-labs/modal-examples/blob/main/06_gpu_and_ml/unsloth_finetune.py
- Modal Volumes Docs: https://modal.com/docs/guide/volumes
- Modal Axolotl Repo: https://github.com/modal-labs/llm-finetuning
