#!/usr/bin/env python3
"""
fine_tune/train_lora.py
LoRA fine-tuning on top of an open-source model using data
collected from your app's conversations.

Workflow:
  1. Export training data from phone app:
       Settings → Export Fine-tune Data → copy chat_finetune.jsonl to this folder
  2. Install dependencies:
       pip install -r fine_tune/requirements.txt
  3. Run:
       python fine_tune/train_lora.py --data fine_tune/chat_finetune.jsonl

The resulting adapter can be:
  a) Used locally with Ollama / llama.cpp
  b) Uploaded to Hugging Face
  c) Deployed as an API for your phone app to call
"""

import argparse
import json
import os
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer


# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"  # Good quality, open, free

LORA_CONFIG = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,                         # LoRA rank (higher = more capacity, more memory)
    lora_alpha=32,                # LoRA scaling
    target_modules=[              # Which layers to adapt
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    lora_dropout=0.05,
    bias="none",
)

QUANT_CONFIG = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)


# ── Data loading ──────────────────────────────────────────────────────────────

def load_jsonl(path: str) -> list[dict]:
    data = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    return data


def format_conversation(example: dict, tokenizer) -> str:
    """Convert a conversation to the model's chat template format."""
    messages = example.get("messages", [])
    if hasattr(tokenizer, "apply_chat_template"):
        return tokenizer.apply_chat_template(messages, tokenize=False)
    # Fallback: Mistral format
    formatted = ""
    for msg in messages:
        if msg["role"] == "user":
            formatted += f"[INST] {msg['content']} [/INST]"
        elif msg["role"] == "assistant":
            formatted += f" {msg['content']}</s>"
    return formatted


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",       default="fine_tune/chat_finetune.jsonl")
    parser.add_argument("--model",      default=DEFAULT_MODEL)
    parser.add_argument("--output_dir", default="fine_tune/output")
    parser.add_argument("--max_steps",  type=int, default=500)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr",         type=float, default=2e-4)
    parser.add_argument("--max_len",    type=int, default=2048)
    parser.add_argument("--no_4bit",    action="store_true", help="Disable 4-bit quantization")
    parser.add_argument("--push_to_hub", default=None, help="HuggingFace repo to push adapter")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"  LoRA Fine-tuning on {args.model}")
    print(f"{'='*60}\n")

    # ── 1. Load data
    print(f"Loading training data from {args.data} …")
    raw = load_jsonl(args.data)
    print(f"  {len(raw)} examples loaded")

    if len(raw) < 10:
        print("WARNING: Very few examples. Fine-tuning needs at least ~100 for meaningful results.")

    # ── 2. Load tokenizer
    print(f"\nLoading tokenizer …")
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # ── 3. Format dataset
    texts = [format_conversation(ex, tokenizer) for ex in raw]
    dataset = Dataset.from_dict({"text": texts})
    dataset = dataset.train_test_split(test_size=0.05, seed=42)
    print(f"  Train: {len(dataset['train'])}  Val: {len(dataset['test'])}")

    # ── 4. Load model
    print(f"\nLoading base model …")
    model_kwargs = {"trust_remote_code": True, "torch_dtype": torch.bfloat16}

    if not args.no_4bit and torch.cuda.is_available():
        model_kwargs["quantization_config"] = QUANT_CONFIG
        model_kwargs["device_map"] = "auto"
    elif torch.cuda.is_available():
        model_kwargs["device_map"] = "auto"
    else:
        print("  No GPU found — training on CPU (slow, use a small model)")

    model = AutoModelForCausalLM.from_pretrained(args.model, **model_kwargs)

    if not args.no_4bit and torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model)

    # ── 5. Apply LoRA
    print("\nApplying LoRA adapters …")
    model = get_peft_model(model, LORA_CONFIG)
    model.print_trainable_parameters()

    # ── 6. Training config
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=3,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        weight_decay=0.01,
        fp16=False,
        bf16=torch.cuda.is_available(),
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=100,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=3,
        load_best_model_at_end=True,
        report_to="tensorboard",
        push_to_hub=args.push_to_hub is not None,
        hub_model_id=args.push_to_hub,
        dataloader_num_workers=2,
        group_by_length=True,
    )

    # ── 7. Train
    print("\nStarting training …\n")
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        dataset_text_field="text",
        max_seq_length=args.max_len,
        packing=True,   # pack multiple short examples into one sequence (efficiency)
    )

    trainer.train()
    trainer.save_model(str(output_dir / "final"))
    tokenizer.save_pretrained(str(output_dir / "final"))

    print(f"\n{'='*60}")
    print(f"  Training complete!")
    print(f"  Adapter saved to: {output_dir / 'final'}")
    print(f"\nNext steps:")
    print(f"  1. Test locally:   ollama create my-model -f Modelfile")
    print(f"  2. Push to hub:    huggingface-cli upload {args.push_to_hub or 'your-username/your-model'} {output_dir / 'final'}")
    print(f"  3. Use as API:     python fine_tune/serve.py --adapter {output_dir / 'final'}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
