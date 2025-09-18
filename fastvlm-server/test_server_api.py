#!/usr/bin/env python3
"""
FastVLM Prompt & Response Viewer
Shows only the full prompt sent to LLM and the full response received.
"""

import os
import sys
import json
import time
import base64
import requests
from pathlib import Path

# Configuration
TEST_IMAGE_PATH = "8.jpg"
SERVER_URL = "http://127.0.0.1:3001"

def load_image_as_base64(image_path):
    """Load image and convert to base64"""
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
        return base64.b64encode(image_data).decode('utf-8')
    except Exception as e:
        print(f"Error loading image: {e}")
        return None

def load_prompt():
    """Load prompt from prompt.md file"""
    try:
        prompt_file = Path(__file__).parent / "prompt.md"
        with open(prompt_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract prompt from markdown code block
        if '```' in content:
            start = content.find('```') + 3
            end = content.find('```', start)
            if end > start:
                return content[start:end].strip()

        # Fallback: return whole content if no code blocks
        return content.strip()
    except Exception as e:
        print(f"Error loading prompt: {e}")
        return 'Describe the clothing in this image in detail.'

def analyze_image(image_path):
    """Send image to FastVLM and get analysis"""
    # Load image
    image_base64 = load_image_as_base64(image_path)
    if not image_base64:
        return None

    # Load prompt
    prompt = load_prompt()

    # Prepare request
    data = {
        'prompt': prompt,
        'image_base64': image_base64
    }

    try:
        response = requests.post(
            f"{SERVER_URL}/analyze",
            json=data,
            timeout=60
        )

        if response.status_code == 200:
            result = response.json()

            # ДЕБАГ: проверяем что пришло
            
            technical_analysis = result.get('technical_analysis', 'No technical analysis received')
            print("=" * 80)
            print("TECHNICAL ANALYSIS:")
            print("=" * 80)
            print(technical_analysis)
            print("=" * 80)

            stylist_response = result.get('analysis', 'No analysis received')

            # Show full response
            print("=" * 80)
            print("LLM RESPONSE:")
            print("=" * 80)
            print(stylist_response)
            print("=" * 80)

            return stylist_response
        else:
            print(f"Server error: {response.status_code}")
            print(f"Response: {response.text}")
            return None

    except Exception as e:
        print(f"Request error: {e}")
        return None

def main():
    """Main function"""
    # Use command line argument or default image
    if len(sys.argv) >= 2:
        image_path = sys.argv[1]
    else:
        # Use default image from project root
        project_root = Path(__file__).parent.parent
        image_path = str(project_root / TEST_IMAGE_PATH)

    # Check if image exists
    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        sys.exit(1)

    print(f"Using image: {image_path}")
    print()

    # Run analysis
    result = analyze_image(image_path)

    if result:
        print("\n✓ Analysis completed successfully")
    else:
        print("\n✗ Analysis failed")

if __name__ == "__main__":
    main()