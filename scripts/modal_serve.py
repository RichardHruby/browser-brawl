"""
Serve a fine-tuned Browser Brawl model via vLLM on Modal.

Exposes an OpenAI-compatible /chat endpoint.
The attacker connects via FINETUNED_MODEL_URL in .env.local.

Deployed ONCE — each experiment is served via ?experiment_name= query param.
Modal's parametrized functions create a separate auto-scaling container pool
per unique experiment_name, each loading its own merged model.

Usage:
  # Deploy once (universal endpoint for all experiments):
  modal deploy scripts/modal_serve.py

  # URL for any experiment:
  # https://mehulkalia--browser-brawl-serve-model-chat.modal.run?experiment_name=text-20260301

  # Set in .env.local (for a specific experiment):
  # FINETUNED_MODEL_URL=https://mehulkalia--browser-brawl-serve-model-chat.modal.run?experiment_name=text-20260301
"""

import modal

app = modal.App("browser-brawl-serve")

# ── Container image ────────────────────────────────────────────────────────────

serve_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.8.5",
        "fastapi[standard]",
        "huggingface_hub==0.34.2",
        "hf-transfer==0.1.9",
    )
    .env({
        "HF_HOME": "/model_cache",
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
    })
)

# ── Volumes ────────────────────────────────────────────────────────────────────

model_cache    = modal.Volume.from_name("browser-brawl-model-cache",  create_if_missing=True)
checkpoint_vol = modal.Volume.from_name("browser-brawl-checkpoints",  create_if_missing=True)

# ── Model class ────────────────────────────────────────────────────────────────

@app.cls(
    image=serve_image,
    gpu="A10G",
    volumes={
        "/model_cache":  model_cache,
        "/checkpoints":  checkpoint_vol,
    },
    timeout=60 * 60,       # 1 hour max per request
    scaledown_window=300,  # Keep warm 5 min after last request
)
@modal.concurrent(max_inputs=8)  # vLLM handles batching internally
class Model:
    # experiment_name is set via --name when deploying
    experiment_name: str = modal.parameter(default="")

    @modal.enter()
    def load(self):
        """Load the merged model into vLLM at container startup."""
        from vllm import AsyncLLMEngine, AsyncEngineArgs
        from transformers import AutoTokenizer

        if not self.experiment_name:
            raise ValueError(
                "experiment_name parameter is required.\n"
                "Pass it as a URL query param: ?experiment_name=text-20260301"
            )

        model_path = f"/checkpoints/experiments/{self.experiment_name}/merged_model"
        print(f"[serve] Loading {model_path}...", flush=True)

        engine_args = AsyncEngineArgs(
            model=model_path,
            max_model_len=32768,
            gpu_memory_utilization=0.90,
            dtype="bfloat16",
        )
        self.engine = AsyncLLMEngine.from_engine_args(engine_args)
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        print("[serve] Model ready.", flush=True)

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def chat(self, request: dict) -> dict:
        """
        OpenAI-compatible chat completions endpoint.

        Request body (subset of OpenAI spec):
          {
            "messages": [{"role": "system"|"user"|"assistant"|"tool", "content": "..."}],
            "max_tokens": 1024,
            "temperature": 0.0
          }

        Response body:
          {
            "choices": [{"message": {"role": "assistant", "content": "..."}, ...}],
            "usage": {"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}
          }
        """
        import uuid
        from vllm import SamplingParams

        messages   = request.get("messages", [])
        max_tokens = int(request.get("max_tokens", 1024))
        temperature = float(request.get("temperature", 0.0))

        # Format messages with the model's chat template
        prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        params     = SamplingParams(temperature=temperature, max_tokens=max_tokens)
        request_id = str(uuid.uuid4())

        # Collect all streaming outputs, return final
        final_output = None
        async for output in self.engine.generate(prompt, params, request_id):
            final_output = output

        if final_output is None:
            return {"error": "No output generated"}, 500

        text = final_output.outputs[0].text

        return {
            "id": f"chatcmpl-{request_id[:8]}",
            "object": "chat.completion",
            "model": self.experiment_name,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": final_output.outputs[0].finish_reason or "stop",
            }],
            "usage": {
                "prompt_tokens":     len(final_output.prompt_token_ids),
                "completion_tokens": len(final_output.outputs[0].token_ids),
                "total_tokens":      len(final_output.prompt_token_ids) + len(final_output.outputs[0].token_ids),
            },
        }

    @modal.fastapi_endpoint(method="GET")
    def health(self) -> dict:
        """Health check — returns model name if loaded."""
        return {"status": "ok", "experiment": self.experiment_name}
