# 🔧 Как адаптировать существующий test_multipass.py для 7B сервера

## Вариант 1: Минимальные изменения в существующем файле

Для работы с FastVLM 7B сервером нужно изменить **всего 1 строку**:

### Исходный код (строка 36):
```python
resp = requests.post(
    f"{SERVER_URL}/analyze_for_test",  # ❌ Этого эндпоинта нет в 7B сервере
    json={
        "image_base64": image_b64,
        "prompt": prompt,
        "nickname": "test_user"
    },
    timeout=120
)
```

### Исправленный код:
```python
resp = requests.post(
    f"{SERVER_URL}/analyze",  # ✅ Стандартный эндпоинт 7B сервера
    json={
        "image_base64": image_b64,
        "prompt": prompt
        # "nickname" не нужен для стандартного эндпоинта
    },
    timeout=120
)
```

## Вариант 2: Универсальный скрипт

Можно сделать скрипт который работает с обоими серверами:

```python
def post_analyze(prompt: str, image_b64: str):
    """Send analysis request - auto-detects server type"""
    
    # Сначала пробуем стандартный эндпоинт (7B сервер)
    try:
        resp = requests.post(
            f"{SERVER_URL}/analyze",
            json={
                "image_base64": image_b64,
                "prompt": prompt
            },
            timeout=120
        )
        
        if resp.status_code == 200:
            return handle_standard_response(resp)
            
    except requests.exceptions.RequestException:
        pass
    
    # Если не удалось, пробуем legacy эндпоинт
    try:
        resp = requests.post(
            f"{SERVER_URL}/analyze_for_test",
            json={
                "image_base64": image_b64,
                "prompt": prompt,
                "nickname": "test_user"
            },
            timeout=120
        )
        
        return handle_legacy_response(resp)
        
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": f"Both endpoints failed: {e}",
            "analysis": ""
        }
```

## Вариант 3: Переменные окружения

Добавить в начало файла:

```python
# Определяем какой сервер используем
SERVER_URL = os.environ.get("FASTVLM_URL", "http://127.0.0.1:3002")
USE_7B_SERVER = os.environ.get("USE_7B_SERVER", "true").lower() == "true"

def get_endpoint():
    return "/analyze" if USE_7B_SERVER else "/analyze_for_test"

def get_payload(prompt: str, image_b64: str):
    if USE_7B_SERVER:
        return {
            "image_base64": image_b64,
            "prompt": prompt
        }
    else:
        return {
            "image_base64": image_b64, 
            "prompt": prompt,
            "nickname": "test_user"
        }
```

## 🚀 Рекомендация

**Используйте новый test_multipass7B.py** - он специально оптимизирован для 7B сервера:

- ✅ Русские промпты для лучшего качества
- ✅ Цветной вывод и прогресс
- ✅ Проверка состояния сервера
- ✅ Детальная статистика
- ✅ Улучшенная обработка ошибок
- ✅ Сохранение результатов
