#!/usr/bin/env python3
"""
РАБОЧИЙ СКРИПТ ДЛЯ ТЕСТИРОВАНИЯ FASTVLM - КОПИЯ PREDICT.PY
"""

import os
import sys
import torch
from PIL import Image

# Добавляем путь к FastVLM
sys.path.append('./ml-fastvlm')

# Добавляем флуш для немедленного вывода
print("🚀 Начинаем тест FastVLM...", flush=True)

import warnings
warnings.filterwarnings("ignore")

# Импортируем модули FastVLM
from llava.utils import disable_torch_init
from llava.conversation import conv_templates
from llava.model.builder import load_pretrained_model
from llava.mm_utils import tokenizer_image_token, process_images, get_model_name_from_path
from llava.constants import IMAGE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN, DEFAULT_IM_START_TOKEN, DEFAULT_IM_END_TOKEN

def main():
    print("🔥 Тест FastVLM-1.5B для анализа одежды", flush=True)
    print("="*50, flush=True)
    
    try:
        # Проверка GPU
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🎮 Устройство: {device}", flush=True)
        if device == "cuda":
            print(f"    GPU: {torch.cuda.get_device_name(0)}", flush=True)
            print(f"    VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB", flush=True)

        # ИСПОЛЬЗУЕМ ЛОКАЛЬНУЮ FASTVLM 1.5B МОДЕЛЬ!
        model_path = "./ml-fastvlm/checkpoints/llava-fastvithd_1.5b_stage3"
        image_path = "3.jpg"
        prompt_text = "Describe in detail what clothing items you see in this image. What type, color, style and material? Response translate to russian language."

        print(f"\n📁 Модель: {model_path}", flush=True)
        print(f"📸 Изображение: {image_path}", flush=True)
        print(f"📝 Промпт: {prompt_text}", flush=True)

        # === КОПИРУЕМ КОД ИЗ PREDICT.PY ===
        
        # Remove generation config from model folder
        generation_config = None
        if os.path.exists(os.path.join(model_path, 'generation_config.json')):
            generation_config = os.path.join(model_path, '.generation_config.json')
            os.rename(os.path.join(model_path, 'generation_config.json'), generation_config)

        print("🔄 Загружаем модель...", flush=True)
        
        # Load model
        disable_torch_init()
        model_name = get_model_name_from_path(model_path)
        tokenizer, model, image_processor, context_len = load_pretrained_model(
            model_path, None, model_name, device=device, torch_dtype=torch.float16
        )
        
        print("✅ Модель загружена!", flush=True)

        # Construct prompt
        qs = prompt_text
        if model.config.mm_use_im_start_end:
            qs = DEFAULT_IM_START_TOKEN + DEFAULT_IMAGE_TOKEN + DEFAULT_IM_END_TOKEN + '\n' + qs
        else:
            qs = DEFAULT_IMAGE_TOKEN + '\n' + qs
        conv = conv_templates["qwen_2"].copy()
        conv.append_message(conv.roles[0], qs)
        conv.append_message(conv.roles[1], None)
        prompt = conv.get_prompt()

        # Set the pad token id for generation
        model.generation_config.pad_token_id = tokenizer.pad_token_id

        # Tokenize prompt
        input_ids = tokenizer_image_token(prompt, tokenizer, IMAGE_TOKEN_INDEX, return_tensors='pt').unsqueeze(0).to(device)

        print("🖼️ Обрабатываем изображение...", flush=True)
        
        # Load and preprocess image
        image = Image.open(image_path).convert('RGB')
        image_tensor = process_images([image], image_processor, model.config)[0]

        print("🤖 Генерируем ответ...", flush=True)
        
        # Run inference
        with torch.inference_mode():
            output_ids = model.generate(
                input_ids,
                images=image_tensor.unsqueeze(0).half(),
                image_sizes=[image.size],
                do_sample=True,
                temperature=0.2,
                top_p=None,
                num_beams=1,
                max_new_tokens=256,
                use_cache=True)

            outputs = tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()

        # Restore generation config
        if generation_config is not None:
            os.rename(generation_config, os.path.join(model_path, 'generation_config.json'))

        print("\n" + "🎯 АНАЛИЗ ОДЕЖДЫ:", flush=True)
        print("="*60, flush=True)
        print(outputs, flush=True)
        print("="*60, flush=True)
        print("✅ Анализ завершен!", flush=True)

    except Exception as e:
        print(f"❌ ОШИБКА: {e}", flush=True)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
