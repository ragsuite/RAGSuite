"""Download the reranker model into the image so it loads with HF_HUB_OFFLINE=1.

Usage: python fetch-reranker.py <hugging-face-model-id> <target-dir>
Fetches safetensors weights when the repo has them, otherwise the PyTorch weights.
"""
import sys

from huggingface_hub import list_repo_files, snapshot_download

CONFIG_PATTERNS = ["*.json", "*.txt", "*.model"]


def main(model_id: str, target: str) -> None:
    files = list_repo_files(model_id)
    weights = ["*.safetensors"] if any(f.endswith(".safetensors") for f in files) else ["pytorch_model.bin"]
    snapshot_download(model_id, local_dir=target, allow_patterns=CONFIG_PATTERNS + weights)
    print(f"reranker {model_id} -> {target}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
