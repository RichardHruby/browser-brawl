# Unsloth Vision Fine-Tuning Reference

Research compiled from official Unsloth docs, GitHub, HuggingFace model cards, and Colab notebooks.

## Model Support

Unsloth provides pre-quantized Qwen2.5-VL models on HuggingFace:

- `unsloth/Qwen2.5-VL-3B-Instruct` — full precision
- `unsloth/Qwen2.5-VL-3B-Instruct-unsloth-bnb-4bit` — 4-bit quantized for training
- `unsloth/Qwen2.5-VL-7B-Instruct` and `-bnb-4bit` variants

**Known bug (fixed):** GitHub issue #1613 — `requires_grad_` error on 4-bit Qwen2.5-VL-3B. Fixed in Unsloth 2025.7.x+. Use latest version.

## API Reference

### FastVisionModel.from_pretrained()

Used for VLMs (NOT `FastLanguageModel` which is text-only):

```python
from unsloth import FastVisionModel

model, tokenizer = FastVisionModel.from_pretrained(
    "unsloth/Qwen2.5-VL-3B-Instruct-unsloth-bnb-4bit",
    load_in_4bit=True,
    use_gradient_checkpointing="unsloth",  # 30% less VRAM
)
```

### FastVisionModel.get_peft_model()

```python
model = FastVisionModel.get_peft_model(
    model,
    finetune_vision_layers     = True,   # Train vision encoder
    finetune_language_layers   = True,   # Train language decoder
    finetune_attention_modules = True,   # Train attention (q/k/v/o)
    finetune_mlp_modules       = True,   # Train FFN layers
    r = 16,              # LoRA rank (8, 16, 32, 64 common)
    lora_alpha = 16,     # Usually same as r
    lora_dropout = 0,
    bias = "none",
    random_state = 3407,
    use_rslora = False,
    loftq_config = None,
    target_modules = "all-linear",
    modules_to_save = ["lm_head", "embed_tokens"],
)
```

### UnslothVisionDataCollator

```python
from unsloth.trainer import UnslothVisionDataCollator

collator = UnslothVisionDataCollator(
    model,
    tokenizer,  # same as processor for VLMs
    max_seq_length          = None,
    resize                  = "min",        # "min", "max", or (H, W) tuple
    train_on_responses_only = False,
    completion_only_loss    = True,
)
```

### SFTTrainer Setup

```python
from trl import SFTTrainer, SFTConfig

FastVisionModel.for_training(model)  # Enable training mode

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    data_collator=UnslothVisionDataCollator(model, tokenizer),
    train_dataset=dataset,
    args=SFTConfig(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=30,
        learning_rate=2e-4,
        logging_steps=1,
        optim="adamw_8bit",
        weight_decay=0.001,
        lr_scheduler_type="linear",
        seed=3407,
        output_dir="outputs",
        report_to="none",
        # REQUIRED for vision:
        remove_unused_columns=False,
        dataset_text_field="",           # must be empty string
        dataset_kwargs={"skip_prepare_dataset": True},
        max_length=2048,
    ),
)

trainer.train()
```

### Model Saving

```python
# Save LoRA adapter only
model.save_pretrained("lora_adapter")
tokenizer.save_pretrained("lora_adapter")

# Merge LoRA into base model + save
model.save_pretrained_merged("merged_model", tokenizer)

# Export as GGUF for Ollama/llama.cpp
model.save_pretrained_gguf("gguf_model", tokenizer, quantization_method="q4_k_m")

# Push to HuggingFace Hub
model.push_to_hub("your-org/model-name")
```

## Dataset Format

### Structure

Unsloth vision expects a **list of dicts** with a `"messages"` key. Each message has `role` and `content` (typed array):

```python
dataset = [
    {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": "file:///data/images/step1.png"},
                    {"type": "text", "text": "Task: Add toothpaste to cart\n\nCurrent page:\n- ref=s1: link 'Sign in'\n- ref=s2: textbox 'Search'"}
                ]
            },
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "I'll search for toothpaste.\n<tool_call>\n{\"name\": \"browser_type\", \"arguments\": {\"ref\": \"s2\", \"text\": \"toothpaste\"}}\n</tool_call>"}
                ]
            },
            {
                "role": "tool",  # or "user" with tool response context
                "content": [
                    {"type": "text", "text": "<tool_response>\n{\"name\": \"browser_type\", \"content\": \"Typed text into search box\"}\n</tool_response>"}
                ]
            }
        ]
    }
]
```

### Image Reference Methods

Within `content` arrays, images can be specified as:

- **File path:** `{"type": "image", "image": "file:///path/to/image.png"}`
- **URL:** `{"type": "image", "image": "https://example.com/image.jpg"}`
- **PIL object:** `{"type": "image", "image": pil_image_object}`
- **Base64:** `{"type": "image", "image": "data:image;base64,..."}`

**Recommended:** File paths. Keep images 300-1000px. All images in a batch should ideally be the same dimensions.

### NOT ShareGPT Format

The vision training format is **NOT** the legacy ShareGPT `from`/`value` format. It uses OpenAI-style `role`/`content` with typed content arrays.

For text-only (non-vision) training, Unsloth DOES support ShareGPT via `standardize_sharegpt()` with `FastLanguageModel`. But `FastVisionModel` requires the typed content format.

## Tool Calling

### Qwen2.5-VL Does NOT Have Native Tool Tokens

The default Qwen2.5-VL chat template handles vision tokens but NOT tool calling. The text-only Qwen2.5 models have tool templates, but the VL variants do not.

### Workaround: XML Tags in Text

Embed tool calls as XML in the text content — this is what our `convert-to-sharegpt.ts` already does:

```
<tool_call>
{"name": "browser_click", "arguments": {"ref": "s2"}}
</tool_call>
```

The model learns to emit this pattern from training data. This matches the Qwen2.5 tool calling convention.

### Custom Chat Template

A community-contributed Jinja2 template merges VL + tool calling:
https://huggingface.co/Qwen/Qwen2.5-VL-32B-Instruct/discussions/18

Consider using this for the system prompt format.

## VRAM Estimates

| Model | Method | VRAM |
|-------|--------|------|
| Qwen2.5-VL-3B | QLoRA 4-bit | ~8-12 GB |
| Qwen2.5-VL-7B | QLoRA 4-bit | ~18-24 GB |
| Qwen2.5-VL-3B | LoRA 16-bit | ~16-20 GB |

## Inference Mode

```python
FastVisionModel.for_inference(model)

messages = [
    {"role": "user", "content": [
        {"type": "image", "image": "screenshot.png"},
        {"type": "text", "text": "What elements do you see?"}
    ]}
]

input_text = tokenizer.apply_chat_template(messages, add_generation_prompt=True)
inputs = tokenizer(input_text, return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=512)
response = tokenizer.decode(outputs[0])
```

## Key Gotchas

1. **Use `FastVisionModel`** not `FastLanguageModel` — different class, different API
2. **`skip_prepare_dataset: True`** is mandatory
3. **`remove_unused_columns: False`** is mandatory
4. **`dataset_text_field: ""`** must be empty string for vision
5. **Use list comprehension** for multi-image datasets, not `.map()` (Arrow serialization issues)
6. **LoRA merge for vLLM:** vLLM does not support LoRA with multimodal models — must merge adapters into base model via `save_pretrained_merged()` before deployment
7. **Image dimensions:** 300-1000px recommended. Larger images consume more tokens.

## Sources

- Unsloth Vision Fine-tuning Docs: https://unsloth.ai/docs/basics/vision-fine-tuning
- Unsloth Datasets Guide: https://unsloth.ai/docs/basics/datasets-guide
- Qwen2.5-VL Colab Notebook: https://colab.research.google.com/github/unslothai/notebooks/blob/main/nb/Qwen2.5_VL_(7B)-Vision.ipynb
- Qwen2.5-VL GRPO Notebook: https://colab.research.google.com/github/unslothai/notebooks/blob/main/nb/Qwen2_5_7B_VL_GRPO.ipynb
- Qwen2.5 Tool Calling Notebook: https://colab.research.google.com/github/unslothai/notebooks/blob/main/nb/Qwen2.5_Coder_(1.5B)-Tool_Calling.ipynb
- HuggingFace Model: https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct
- GitHub Issue #1613 (3B 4-bit bug): https://github.com/unslothai/unsloth/issues/1613
- GitHub Issue #1352 (LoRA merge bug): https://github.com/unslothai/unsloth/issues/1352
