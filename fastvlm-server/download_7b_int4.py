#!/usr/bin/env python3
"""
Download FastVLM-7B-int4 model from Hugging Face
"""

import os
from huggingface_hub import snapshot_download
from pathlib import Path

def download_fastvlm_7b_int4():
    """Download FastVLM-7B-int4 model"""
    
    model_name = "apple/FastVLM-7B-int4"
    local_dir = Path(__file__).parent / "models" / "llava-fastvithd_7b_int4"
    
    print(f"Downloading {model_name}...")
    print(f"Target directory: {local_dir}")
    
    # Create models directory if not exists
    local_dir.parent.mkdir(exist_ok=True)
    
    try:
        # Download the model
        snapshot_download(
            repo_id=model_name,
            local_dir=str(local_dir),
            local_dir_use_symlinks=False,
            resume_download=True
        )
        
        print(f"✅ Model downloaded successfully to: {local_dir}")
        
        # List downloaded files
        print("\nDownloaded files:")
        for file in local_dir.rglob("*"):
            if file.is_file():
                size_mb = file.stat().st_size / (1024 * 1024)
                print(f"  {file.name}: {size_mb:.1f}MB")
        
        return str(local_dir)
        
    except Exception as e:
        print(f"❌ Error downloading model: {e}")
        return None

if __name__ == "__main__":
    download_fastvlm_7b_int4()
