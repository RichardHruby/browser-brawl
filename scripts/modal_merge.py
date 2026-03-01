"""One-off: merge LoRA adapter into base model for an existing experiment."""
import modal

app = modal.App("browser-brawl-merge")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "unsloth[cu128-torch270]==2025.7.8",
        "unsloth_zoo==2025.7.10",
        "trl==0.19.1",
        "transformers==4.54.0",
        "peft==0.16.0",
    )
    .env({"HF_HOME": "/model_cache", "HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

checkpoint_vol = modal.Volume.from_name("browser-brawl-checkpoints", create_if_missing=False)
model_cache    = modal.Volume.from_name("browser-brawl-model-cache",  create_if_missing=True)

@app.function(
    image=image,
    gpu="A10G",
    volumes={"/checkpoints": checkpoint_vol, "/model_cache": model_cache},
    timeout=30 * 60,
)
def merge(experiment_name: str):
    import unsloth
    from unsloth import FastLanguageModel

    lora_path   = f"/checkpoints/experiments/{experiment_name}/final_model"
    merged_path = f"/checkpoints/experiments/{experiment_name}/merged_model"

    print(f"[merge] Loading LoRA from {lora_path}...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        lora_path,
        max_seq_length=4096,
        load_in_4bit=True,
    )

    print(f"[merge] Saving merged model to {merged_path}...")
    model.save_pretrained_merged(merged_path, tokenizer, save_method="merged_16bit")
    print(f"[merge] Done! → {merged_path}")
    return merged_path

@app.local_entrypoint()
def main(experiment_name: str = "text-20260228-2221"):
    result = merge.remote(experiment_name)
    print(f"\nMerge complete: {result}")
    print(f"Deploy with: modal deploy scripts/modal_serve.py --name {experiment_name}")
