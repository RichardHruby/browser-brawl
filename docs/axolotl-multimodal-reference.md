# Axolotl Multimodal VLM Reference

Research compiled from official Axolotl docs, GitHub issues, and example configs.

## Status

Axolotl added Qwen2.5-VL support in October 2025. Multimodal is marked **BETA** — "doesn't have full feature parity."

## YAML Config for Qwen2.5-VL-3B

```yaml
# === Model ===
base_model: Qwen/Qwen2.5-VL-3B-Instruct
processor_type: AutoProcessor        # REQUIRED for all VLMs

# === CRITICAL VLM FLAGS (all 3 mandatory) ===
skip_prepare_dataset: true            # standard preprocessing doesn't handle multimodal
remove_unused_columns: false          # preserves image embeddings in batch
sample_packing: false                 # NOT supported for multimodal (Issue #3131)

# === Chat Template ===
chat_template: qwen2_vl              # same for Qwen2-VL, Qwen2.5-VL, Qwen3-VL

# === Dataset ===
datasets:
  - path: /path/to/training-data.jsonl
    type: chat_template
dataset_prepared_path: last_run_prepared
val_set_size: 0.05

# === LoRA ===
adapter: lora
lora_r: 32
lora_alpha: 16
lora_dropout: 0.05
# CRITICAL: Must include "language_model" in path
lora_target_modules: >-
  model.language_model.layers.[\d]+.(mlp|cross_attn|self_attn).(up|down|gate|q|k|v|o)_proj

# === Sequence ===
sequence_len: 8192
pad_to_sequence_len: false            # no truncation for VLMs

# === Optional Image Resizing ===
image_size: 512
image_resize_algorithm: bilinear

# === Training ===
output_dir: ./outputs/qwen25vl-3b-lora
micro_batch_size: 1
gradient_accumulation_steps: 4
num_epochs: 3
optimizer: adamw_bnb_8bit
lr_scheduler: cosine
learning_rate: 2e-4
warmup_ratio: 0.1
weight_decay: 0.0

# === Precision ===
bf16: true
tf32: true
gradient_checkpointing: true
flash_attention: true

# === Logging ===
logging_steps: 1
evals_per_epoch: 2
saves_per_epoch: 1
```

### For QLoRA (4-bit)

Add these flags to the config above:

```yaml
adapter: qlora
load_in_4bit: true
```

## Dataset Format

Axolotl multimodal uses an **extended OpenAI Messages format** (NOT legacy ShareGPT):

```json
[
  {
    "messages": [
      {
        "role": "system",
        "content": [
          {"type": "text", "text": "You are a browser automation agent..."}
        ]
      },
      {
        "role": "user",
        "content": [
          {"type": "image", "url": "https://example.com/screenshot.jpg"},
          {"type": "text", "text": "Describe this image in detail."}
        ]
      },
      {
        "role": "assistant",
        "content": [
          {"type": "text", "text": "The image shows a shopping cart page..."}
        ]
      }
    ]
  }
]
```

### Image Reference Methods

Within `content` alongside `"type": "image"`:

- `"url": "https://example.com/image.jpg"` — HTTP URL
- `"path": "/path/to/image.jpg"` — local file path
- `"base64": "..."` — base64-encoded data

### Dataset Config

```yaml
datasets:
  - path: /path/to/your/dataset.jsonl
    type: chat_template
    split: train
```

## LoRA Target Modules

### CORRECT (targets language model only):
```
model.language_model.layers.[\d]+.(mlp|cross_attn|self_attn).(up|down|gate|q|k|v|o)_proj
```

### WRONG (silently fails — Issue #2792):
```
model.layers.[\d]+...
```

The vision encoder stays frozen. Only the language model is fine-tuned.

## Known Limitations

1. **No sample packing** — Issue #3131, still open. Significant GPU waste from padding tokens. No workaround exists.

2. **No sequence length truncation** — "we do not truncate nor drop samples based on `sequence_len` as each arch has different ways to process non-text tokens." Must handle truncation in data preprocessing.

3. **Video support** — "not well tested at the moment."

4. **Tool calling** — Not native to Qwen2.5-VL. Must embed tool calls as XML text (our `<tool_call>` approach is correct).

5. **DPO + VLM** — Both supported separately, but intersection may not be well tested.

6. **`PIL.UnidentifiedImageError`** — Occurs when URLs are unreachable. Check for server blocks or typos.

## Axolotl vs Unsloth for Our Use Case

| Feature | Axolotl | Unsloth |
|---------|---------|---------|
| Qwen2.5-VL-3B | Yes (beta) | Yes (full) |
| Multi-GPU | Yes (FSDP/DeepSpeed) | No (single GPU only) |
| Speed | Standard | 1.7-2x faster |
| VRAM | Standard | 60-70% less |
| VLM RL (GRPO/DPO) | Not well tested | Supported |
| Tool calling | Manual XML in text | Manual XML in text |
| Interface | YAML config | Python API |
| GGUF export | External tool | Built-in |

**Recommendation:** Use Unsloth for PoC (single GPU, faster, less VRAM). Switch to Axolotl only if we need multi-GPU for larger models.

## Sources

- Axolotl Multimodal Docs: https://docs.axolotl.ai/docs/multimodal.html
- Axolotl Dataset Formats: https://docs.axolotl.ai/docs/dataset-formats/
- Qwen2-VL Example Config: https://github.com/axolotl-ai-cloud/axolotl/blob/main/examples/qwen2-vl/lora-7b.yaml
- Qwen Axolotl Guide: https://qwen.readthedocs.io/en/latest/training/axolotl.html
- Issue #2792 (lora_target_modules bug): https://github.com/axolotl-ai-cloud/axolotl/issues/2792
- Issue #3131 (no VLM packing): https://github.com/axolotl-ai-cloud/axolotl/issues/3131
