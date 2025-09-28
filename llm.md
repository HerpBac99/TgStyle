# FastVLM Server - AI для анализа одежды

## Обзор

**FastVLM Server** - это специализированный микросервис для анализа изображений одежды с использованием модели LLaVA (Large Vision Model). Сервер работает как отдельный Python процесс и предоставляет высокопроизводительный анализ через REST API с поддержкой GPU acceleration.

## Архитектура FastVLM

### Технологический стек

- **Модель ИИ**: LLaVA (Vision-Language Transformer)
- **Framework**: PyTorch с CUDA/CPU поддержкой
- **Сервер**: Flask + Waitress (multithreaded)
- **Обработка изображений**: PIL, OpenCV
- **Логирование**: Python logging с ротацией
- **API**: Gemini API (Google AI) как fallback

### Структура файлов

```
fastvlm-server/
├── server.py              # Основной Flask сервер
├── config.py              # Конфигурация и настройки
├── prompt.md              # Промпты для анализа одежды
├── prompt7bAnal.md        # Промпты для 7B модели
├── style_prompt.md        # Промпты для анализа стиля
├── test_1.5b.py           # Тестирование 1.5B модели
├── test_7b.py             # Тестирование 7B модели
├── test_multipass.py      # Многопроходный анализ
├── requirements1.5b.txt   # Зависимости для 1.5B модели
├── requirements7b.txt     # Зависимости для 7B модели
├── models/                # Директория с моделями
│   └── llava-fastvithd_1.5b_stage3/  # Модель 1.5B
└── logs/                  # Логи сервера
```

## 🚀 Быстрый запуск

### Запуск сервера

```bash
cd fastvlm-server
python server.py
```

Сервер запускается на `http://127.0.0.1:3001` с автоматическим определением GPU/CPU.

## 📋 API Эндпоинты

### `GET /health` - Проверка здоровья

**Ответ**:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "timestamp": 1725623456.789,
  "device": "cuda",
  "torch_version": "2.4.1"
}
```

### `POST /analyze` - Анализ изображения

**Запрос**:
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "prompt": "Опиши одежду на фото"
}
```

**Ответ**:
```json
{
  "success": true,
  "analysis": "На фото изображена синяя футболка из хлопка...",
  "model_used": "llava",
  "device": "cuda"
}
```

### `GET /load` - Нагрузка сервера

**Ответ**:
```json
{
  "cpu_percent": 45.2,
  "memory_percent": 67.8,
  "memory_used_gb": 8.5,
  "memory_total_gb": 16.0
}
```

### `GET /gpu` - Информация о GPU

**Ответ**:
```json
{
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 3080",
  "gpu_memory_allocated_mb": 2048,
  "gpu_memory_total_mb": 10240
}
```

### `GET /model` - Информация о модели

**Ответ**:
```json
{
  "model_loaded": true,
  "model_name": "llava",
  "device": "cuda",
  "context_length": 2048
}
```

## 🧠 Модель LLaVA

### Технические характеристики

- **Архитектура**: Vision-Language Transformer
- **Размеры**: 1.5B и 7B параметров
- **Точность**: FP16 (half precision)
- **Контекст**: 2048 токенов
- **Язык**: Многоязычная поддержка

### Особенности

1. **Vision Understanding**: Анализ визуального контента
2. **Fashion Analysis**: Специализация на одежде
3. **Russian Prompts**: Промпты на русском языке
4. **Fallback**: Gemini API при недоступности LLaVA

### Промпты для анализа

**Основной промпт** (`prompt.md`):
```markdown
Describe the person in the photograph, including their gender and age.
Describe in detail all the clothing they are wearing, including its type, color, and material.
Describe in detail all the accessories they wear, whether they are wearing them on their neck, fingers, or ears.
```

## 🔧 Работа с сервером

### Автоматическая конфигурация

```python
# config.py
class Config:
    # Автоопределение устройства
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

    # Пути к моделям
    MODEL_1_5B_PATH = "models/llava-fastvithd_1.5b_stage3"
    MODEL_7B_PATH = "models/llava-fastvithd_7b_stage3"

    # Настройки генерации
    MAX_NEW_TOKENS = 256
    TEMPERATURE = 0.2
    DO_SAMPLE = True
```

### Graceful shutdown

```python
# server.py
def signal_handler(signum, frame):
    logger.info("Получен сигнал завершения, очистка ресурсов...")
    # Очистка GPU памяти
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    # Закрытие соединений
    sys.exit(0)
```

## 🔄 Многопроходный анализ

### Архитектура анализа

**FastVLM Server** использует **5-проходную систему анализа** для детального разбора изображения:

1. **Person Analysis** - определение пола и возраста человека
2. **Clothing Analysis** - анализ верхней одежды
3. **Legs Analysis** - анализ одежды на ногах
4. **Shoes Analysis** - анализ обуви
5. **Accessories Analysis** - анализ аксессуаров

### Последовательность вызовов

```
1. POST /analyze получает запрос
2. perform_multi_pass_analysis() запускается
3. Для каждого промпта вызывается analyze_image_fastvlm()
4. Результаты объединяются в combined_analysis
5. create_stylist_response() создает креативный ответ
6. Возвращается финальный результат
```

### Промпты анализа

#### Person Prompt (`PERSON_PROMPT.md`)
```markdown
Describe the person gender and age in the photograph.
```

#### Clothing Prompt (`CLOTHING_PROMPT.md`)
```markdown
Describe in detail the clothing on the person's torso. Include type of clothing, color, material, style, and any patterns or designs.
```

#### Legs Prompt (`LEG_PROMPT.md`)
```markdown
Describe in detail the clothing on the person's legs. Include type of clothing, color, material, style, and any patterns or designs.
```

#### Shoes Prompt (`SHOES_PROMPT.md`)
```markdown
Describe in detail the shoes the person is wearing. Include type, color, material, style, and any distinctive features.
```

#### Accessories Prompt (`ACCESSORIES_PROMPT.md`)
```markdown
Describe in detail all accessories the person is wearing. Include jewelry, bags, belts, hats, scarves, and any other accessories.
```

## 🤖 Создание ответа стилиста

### Система стилистов

**FastVLM Server** поддерживает **3 типа стилистов**:

1. **Ollama** - локальная модель (gemma3:4b)
2. **Gemini** - Google AI API
3. **FastVLM** - fallback на базовый анализ

### Логика выбора стилиста

```python
def create_stylist_response(multi_pass_analysis):
    # 1. Попытка использовать выбранный тип стилиста
    if Config.STYLIST_TYPE == 'ollama' and ollama_available:
        return create_stylist_response_ollama(multi_pass_analysis)

    elif Config.STYLIST_TYPE == 'gemini' and gemini_client:
        return create_stylist_response_gemini(multi_pass_analysis)

    # 2. Fallback на доступные альтернативы
    if ollama_available:
        return create_stylist_response_ollama(multi_pass_analysis)

    if gemini_client:
        return create_stylist_response_gemini(multi_pass_analysis)

    # 3. Ultimate fallback - базовый анализ
    return multi_pass_analysis
```

### Ollama интеграция

```python
def create_stylist_response_ollama(multi_pass_analysis):
    try:
        response = requests.post(f"{ollama_url}/api/generate", json={
            "model": ollama_model,
            "prompt": style_prompt + "\n\n" + multi_pass_analysis,
            "stream": False
        })
        return response.json()["response"]
    except Exception as e:
        logger.error(f"Ollama error: {e}")
        return multi_pass_analysis
```

### Gemini интеграция

```python
def create_stylist_response_gemini(multi_pass_analysis):
    try:
        response = gemini_client.models.generate_content(
            model="gemini-1.5-flash",
            contents=[style_prompt + "\n\n" + multi_pass_analysis]
        )
        return response.text
    except Exception as e:
        logger.error(f"Gemini error: {e}")
        return multi_pass_analysis
```

## 🔧 Конфигурация модели

### Автоопределение параметров

```python
# config.py
class Config:
    # GPU автоопределение
    if torch.cuda.is_available():
        DEVICE = 'cuda'
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3

        # Автоматическая квантизация для слабых GPU
        if gpu_memory < 12:
            USE_4BIT = True  # 4-bit квантизация
        elif gpu_memory < 24:
            USE_8BIT = True  # 8-bit квантизация
```

### Настройки генерации

```python
FASHION_ANALYSIS_CONFIG = {
    'do_sample': True,
    'temperature': 0.2,      # Низкая температура для стабильности
    'top_p': 0.9,
    'top_k': 50,
    'num_beams': 1,          # Beam search отключен для скорости
    'max_new_tokens': 256,   # Максимум токенов
    'repetition_penalty': 1.2,
    'length_penalty': 1.0,
    'no_repeat_ngram_size': 3,
    'early_stopping': True,
    'use_cache': True
}
```

## 📊 Мониторинг производительности

### Метрики

- **Response Time**: 2-5 секунд на изображение
- **GPU Memory**: ~2-4GB при обработке
- **CPU Usage**: 10-30% при активной работе
- **Throughput**: 10-15 изображений в минуту

### Оптимизации

1. **GPU Acceleration**: CUDA для ускорения
2. **Memory Management**: Автоматическая очистка памяти
3. **Multithreading**: Waitress для одновременных запросов
4. **Error Recovery**: Graceful degradation

## 🚨 Обработка ошибок

### Типичные ошибки

- **CUDA out of memory**: Переключение на CPU
- **Model loading failed**: Fallback на Gemini API
- **Invalid image**: Валидация входных данных
- **Network timeout**: Таймауты и повторные попытки

### Fallback система

```python
# server.py
async def analyze_with_fallback(image_base64, prompt):
    try:
        # Попытка LLaVA анализа
        return await analyze_with_llava(image_base64, prompt)
    except Exception as e:
        logger.warning(f"LLaVA failed, trying Gemini: {e}")
        try:
            # Fallback на Gemini API
            return await analyze_with_gemini(image_base64, prompt)
        except Exception as e2:
            logger.error(f"Both models failed: {e2}")
            raise
```

## 🔗 Интеграция с TgStyle

### Архитектура микросервисов

```
Клиент → Node.js сервер → FastVLM сервер → LLaVA/Gemini
    ↑         ↑              ↑             ↑
Результаты ← Анализ ← Детальный анализ ← Обработка изображения
```

### Обработка запросов

1. **Валидация**: Проверка формата изображения
2. **Предобработка**: Конвертация base64 в PIL Image
3. **Анализ**: Отправка в LLaVA модель
4. **Fallback**: Переключение на Gemini API при ошибках
5. **Постобработка**: Форматирование ответа

## 🎯 Производственные особенности

### Масштабируемость

- **Multiprocessing**: Поддержка нескольких процессов
- **Load Balancing**: Распределение нагрузки
- **Resource Limits**: Ограничение использования ресурсов

### Безопасность

- **Input Validation**: Проверка входных данных
- **Rate Limiting**: Защита от перегрузки
- **Error Isolation**: Изоляция ошибок между запросами

## 📈 Производительность

### Бенчмарки

- **1.5B модель**: ~3 секунды на изображение (GPU)
- **7B модель**: ~5 секунд на изображение (GPU)
- **CPU fallback**: ~10-15 секунд на изображение
- **Gemini API**: ~2-3 секунды на изображение

### Оптимизации

1. **Batch Processing**: Групповая обработка изображений
2. **Memory Pooling**: Переиспользование GPU памяти
3. **Async Processing**: Асинхронная обработка запросов
4. **Model Caching**: Кэширование загруженных моделей

## 🐛 Troubleshooting

### Диагностика проблем

```bash
# Проверка здоровья
curl http://127.0.0.1:3001/health

# Проверка GPU
curl http://127.0.0.1:3001/gpu

# Просмотр логов
tail -f logs/fastvlm.log
```

### Решение проблем

- **GPU не доступна**: Переключение на CPU режим
- **Модель не загружается**: Проверка путей к файлам
- **Память переполнена**: Очистка GPU памяти
- **Сеть недоступна**: Использование локальных моделей

## 📚 Заключение

FastVLM Server представляет собой высокопроизводительный AI-сервис для анализа изображений одежды с поддержкой GPU acceleration, graceful fallback и комплексным мониторингом производительности.
