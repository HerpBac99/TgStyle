#!/usr/bin/env python3
"""
Заплатка для test_multipass.py чтобы он работал с FastVLM 7B сервером
Применяет минимальные изменения к существующему файлу
"""

import os
import shutil
from pathlib import Path

def patch_multipass():
    """Патчит существующий test_multipass.py для работы с 7B сервером"""
    
    multipass_file = Path("test_multipass.py")
    backup_file = Path("test_multipass.py.backup")
    
    if not multipass_file.exists():
        print("❌ Файл test_multipass.py не найден")
        return False
    
    print(f"🔧 Патчу {multipass_file}...")
    
    # Создаем резервную копию
    if not backup_file.exists():
        shutil.copy2(multipass_file, backup_file)
        print(f"💾 Создана резервная копия: {backup_file}")
    
    # Читаем файл
    with open(multipass_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Применяем патчи
    patches_applied = 0
    
    # Патч 1: Изменяем эндпоинт
    if '/analyze_for_test' in content:
        content = content.replace('/analyze_for_test', '/analyze')
        patches_applied += 1
        print("✅ Патч 1: Изменен эндпоинт на /analyze")
    
    # Патч 2: Убираем nickname из payload
    old_payload = '''json={
                "image_base64": image_b64,
                "prompt": prompt,
                "nickname": "test_user"
            },'''
    
    new_payload = '''json={
                "image_base64": image_b64,
                "prompt": prompt
            },'''
    
    if old_payload in content:
        content = content.replace(old_payload, new_payload)
        patches_applied += 1
        print("✅ Патч 2: Убран nickname из payload")
    
    # Патч 3: Изменяем порт по умолчанию на 3002
    if 'http://127.0.0.1:3001' in content:
        content = content.replace('http://127.0.0.1:3001', 'http://127.0.0.1:3002')
        patches_applied += 1
        print("✅ Патч 3: Изменен порт на 3002")
    elif '127.0.0.1:3001' in content:
        content = content.replace('127.0.0.1:3001', '127.0.0.1:3002')
        patches_applied += 1
        print("✅ Патч 3: Изменен порт на 3002")
    
    # Сохраняем патченый файл
    if patches_applied > 0:
        with open(multipass_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"🎉 Применено патчей: {patches_applied}")
        print(f"✅ Файл {multipass_file} обновлен для работы с FastVLM 7B")
        return True
    else:
        print("ℹ️  Патчи уже применены или файл уже совместим")
        return True

def restore_backup():
    """Восстанавливает оригинальный файл из резервной копии"""
    multipass_file = Path("test_multipass.py")
    backup_file = Path("test_multipass.py.backup")
    
    if backup_file.exists():
        shutil.copy2(backup_file, multipass_file)
        print(f"✅ Восстановлен оригинальный файл из {backup_file}")
        return True
    else:
        print("❌ Резервная копия не найдена")
        return False

def main():
    print("🔧 FastVLM 7B Multipass Patcher")
    print("=" * 40)
    
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "restore":
            restore_backup()
            return
        elif sys.argv[1] == "help":
            print("Использование:")
            print("  python patch_multipass_for_7b.py        # Применить патч")
            print("  python patch_multipass_for_7b.py restore  # Восстановить оригинал")
            return
    
    success = patch_multipass()
    
    if success:
        print("\n💡 Теперь можно запускать:")
        print("   python test_multipass.py")
        print("   python test_multipass.py path/to/image.jpg")
        print("\n🔄 Для восстановления оригинала:")
        print("   python patch_multipass_for_7b.py restore")
    else:
        print("❌ Не удалось применить патч")

if __name__ == "__main__":
    main()
