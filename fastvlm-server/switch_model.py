#!/usr/bin/env python3
"""
Switch between FastVLM models
"""

import os
import sys

def switch_model(model_type):
    """Switch to specified model"""
    
    available_models = {
        '1.5b': 'FastVLM-1.5B (stage3)',
        '7b-int4': 'FastVLM-7B-int4 (quantized)'
    }
    
    if model_type not in available_models:
        print(f"Available models: {', '.join(available_models.keys())}")
        return False
    
    # Set environment variable
    os.environ['FASTVLM_MODEL'] = model_type
    
    print(f"Switched to: {available_models[model_type]}")
    print(f"Environment variable FASTVLM_MODEL={model_type}")
    print("\nRestart the server to apply changes:")
    print("python server.py")
    
    return True

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python switch_model.py <model_type>")
        print("Available models: 1.5b, 7b-int4")
        sys.exit(1)
    
    model_type = sys.argv[1]
    switch_model(model_type)
