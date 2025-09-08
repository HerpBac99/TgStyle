#!/usr/bin/env python3
"""
Simple FastVLM Performance Test - CPU vs GPU comparison
"""

import os
import sys
import json
import time
import base64
import requests
from pathlib import Path

# Configuration
TEST_IMAGE_PATH = "2.jpg"
SERVER_URL = "http://127.0.0.1:3001"

def log(message):
    """Simple logging without emoji"""
    print(message)

def load_image_as_base64(image_path):
    """Load image and convert to base64"""
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
        return base64.b64encode(image_data).decode('utf-8')
    except Exception as e:
        log(f"Error loading image: {e}")
        return None

def test_analysis(image_path, force_gpu=None):
    """Test image analysis with optional GPU forcing"""
    # Load image
    image_base64 = load_image_as_base64(image_path)
    if not image_base64:
        return None
    
    # Prepare request
    data = {
        'prompt': 'Describe the clothing in this image in detail. Answer in Russian.',
        'image_base64': image_base64
    }
    
    if force_gpu is not None:
        data['force_gpu'] = force_gpu
    
    # Send request
    device_str = "GPU" if force_gpu else "CPU" if force_gpu is False else "Auto"
    log(f"Testing {device_str}...")
    
    start_time = time.time()
    
    try:
        response = requests.post(
            f"{SERVER_URL}/analyze",
            json=data,
            timeout=60
        )
        
        end_time = time.time()
        total_time = end_time - start_time
        
        if response.status_code == 200:
            result = response.json()
            timing = result.get('timing', {})
            inference_time = timing.get('inference_time', 0)
            device = result.get('device', 'unknown')
            
            # Get GPU memory info
            gpu_memory = result.get('gpu_memory_used')
            
            return {
                'success': True,
                'total_time': total_time,
                'inference_time': inference_time,
                'device': device,
                'gpu_memory': gpu_memory
            }
        else:
            log(f"Server error: {response.status_code}")
            return None
            
    except Exception as e:
        log(f"Request error: {e}")
        return None

def get_gpu_info():
    """Get GPU information"""
    try:
        response = requests.get(f"{SERVER_URL}/gpu", timeout=10)
        if response.status_code == 200:
            return response.json()
        return None
    except:
        return None

def check_server():
    """Check if server is available"""
    try:
        response = requests.get(f"{SERVER_URL}/health", timeout=10)
        if response.status_code == 200:
            health_data = response.json()
            log(f"Server available")
            log(f"Model loaded: {health_data.get('model_loaded')}")
            log(f"Device: {health_data.get('device')}")
            
            # Show GPU info
            gpu_info = get_gpu_info()
            if gpu_info and gpu_info.get('gpu_available'):
                total_mb = gpu_info.get('gpu_memory_total_mb', 0)
                allocated_mb = gpu_info.get('gpu_memory_allocated_mb', 0)
                log(f"GPU: {gpu_info.get('gpu_name')}")
                log(f"VRAM: {allocated_mb:.0f}MB / {total_mb:.0f}MB ({allocated_mb/total_mb*100:.1f}%)")
            
            return True
        return False
    except:
        log("Server unavailable")
        return False

def main():
    """Main function"""
    log("FastVLM Performance Test")
    log("=" * 40)
    
    # Check server
    if not check_server():
        log("Server not available. Make sure it's running.")
        sys.exit(1)
    
    # Find test image
    project_root = Path(__file__).parent.parent
    test_image = project_root / TEST_IMAGE_PATH
    
    if not test_image.exists():
        log(f"Test image not found: {test_image}")
        sys.exit(1)
    
    log(f"Using image: {test_image.name}")
    log("")
    
    # Test CPU
    log("Testing CPU:")
    cpu_result = test_analysis(str(test_image), force_gpu=False)
    if cpu_result and cpu_result['success']:
        log(f"CPU: {cpu_result['total_time']:.2f}s")
    else:
        log("CPU: FAILED")
    
    log("")
    
    # Test GPU
    log("Testing GPU:")
    gpu_result = test_analysis(str(test_image), force_gpu=True)
    if gpu_result and gpu_result['success']:
        log(f"GPU: {gpu_result['total_time']:.2f}s")
        if gpu_result.get('gpu_memory'):
            log(f"VRAM used: {gpu_result['gpu_memory']:.1f}MB")
    else:
        log("GPU: FAILED")
    
    log("")
    
    # Comparison
    if cpu_result and gpu_result and cpu_result['success'] and gpu_result['success']:
        cpu_time = cpu_result['total_time']
        gpu_time = gpu_result['total_time']
        
        if gpu_time < cpu_time:
            speedup = cpu_time / gpu_time
            log(f"GPU is {speedup:.1f}x faster")
        else:
            slowdown = gpu_time / cpu_time
            log(f"CPU is {slowdown:.1f}x faster")
    else:
        log("Comparison failed - one or both tests failed")

if __name__ == "__main__":
    main()