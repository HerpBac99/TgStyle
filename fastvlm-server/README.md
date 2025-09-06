# FastVLM Server

Отдельный Flask-сервер для анализа изображений одежды с использованием FastVLM модели.

## 🚀 Быстрый запуск

### 1. Создание виртуального окружения
```bash
cd fastvlm-server
python -m venv venv
```

**Активация окружения:**
- **Windows:** `venv\Scripts\activate`
- **Linux/Mac:** `source venv/bin/activate`

### 2. Установка зависимостей
```bash
pip install -r requirements.txt
```

### 3. Запуск сервера
```bash
python server.py
```

Сервер запустится на `http://127.0.0.1:3001`

### 🚀 Альтернативный запуск (из корня проекта)
```bash
# Из папки TgStyle
python start_llm.py
```

## 📋 API Эндпоинты

### GET `/health`
Проверка здоровья сервера

**Ответ:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "timestamp": 1725623456.789,
  "device": "cuda",
  "torch_version": "2.0.1"
}
```

### POST `/analyze`
Анализ изображения одежды

**Запрос:**
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "prompt": "Опиши одежду на фото"
}
```

**Ответ:**
```json
{
  "success": true,
  "analysis": "На фото изображена синяя футболка из хлопка в casual стиле...",
  "model_used": "llava",
  "device": "cuda"
}
```

### GET `/load`
Информация о нагрузке сервера

**Ответ:**
```json
{
  "cpu_percent": 45.2,
  "memory_percent": 67.8,
  "memory_used_gb": 8.5,
  "memory_total_gb": 16.0,
  "timestamp": 1725623456.789
}
```

### GET `/gpu`
Информация о GPU

**Ответ:**
```json
{
  "gpu_available": true,
  "gpu_name": "NVIDIA GeForce RTX 3080",
  "gpu_memory_allocated_mb": 2048,
  "gpu_memory_reserved_mb": 3072,
  "gpu_memory_total_mb": 10240,
  "device": "cuda"
}
```

### GET `/model`
Информация о загруженной модели

**Ответ:**
```json
{
  "loaded": true,
  "model_name": "llava",
  "device": "cuda",
  "context_length": 2048,
  "torch_dtype": "torch.float16",
  "model_path": "/path/to/model"
}
```

## ⚙️ Конфигурация

### Переменные окружения (.env)
```bash
# Server Settings
FASTVLM_HOST=127.0.0.1
FASTVLM_PORT=3001

# Model Settings
MAX_NEW_TOKENS=256
TEMPERATURE=0.2
DO_SAMPLE=true

# Performance Settings
MAX_IMAGE_SIZE=2048
BATCH_SIZE=1

# Logging Settings
LOG_LEVEL=INFO
LOG_MAX_BYTES=10485760
LOG_BACKUP_COUNT=5
```

### Структура файлов
```
fastvlm-server/
├── server.py          # Основной Flask сервер
├── config.py          # Конфигурация
├── requirements.txt   # Python зависимости
├── .env              # Переменные окружения
├── logs/             # Логи сервера
├── __init__.py       # Python пакет
└── README.md         # Документация
```

## 🔧 Тестирование API

### Запуск тестов
```bash
cd fastvlm-server
python test_api.py
```

### Ручное тестирование
```bash
# Health check
curl http://127.0.0.1:3001/health

# GPU info
curl http://127.0.0.1:3001/gpu

# Load info
curl http://127.0.0.1:3001/load

# Model info
curl http://127.0.0.1:3001/model
```

## 📊 Мониторинг

### Логи
Логи сервера сохраняются в `logs/fastvlm.log`

### Метрики
- **CPU usage**: `/load`
- **Memory usage**: `/load`
- **GPU memory**: `/gpu`
- **Model status**: `/model`

## 🚨 Обработка ошибок

### Типичные ошибки
- **Model not loaded**: Модель не загружена
- **CUDA out of memory**: Недостаточно GPU памяти
- **Invalid image**: Некорректное изображение

### Логирование
Все ошибки логируются с уровнем ERROR в `logs/fastvlm.log`

## 🔄 Перезапуск сервера

### Graceful shutdown
Сервер корректно завершается по сигналам SIGINT/SIGTERM

### Автоматическая очистка
- GPU память очищается при завершении
- Временные файлы удаляются

## 📈 Производительность

### Оптимизации
- **GPU acceleration**: Автоматическое использование CUDA
- **Memory management**: Очистка GPU памяти
- **Batch processing**: Поддержка батчевой обработки

### Рекомендации
- **GPU**: Минимум 4GB GPU памяти
- **RAM**: Минимум 8GB
- **Disk**: Минимум 10GB для модели

## 🐛 Troubleshooting

### Модель не загружается
```bash
# Проверить путь к модели
python -c "from config import Config; print(Config.MODEL_PATH)"
```

### CUDA ошибка
```bash
# Проверить CUDA
python -c "import torch; print(torch.cuda.is_available())"
```

### Порт занят
```bash
# Изменить порт в .env
FASTVLM_PORT=3002
```

## 🔗 Интеграция с основным приложением

FastVLM сервер работает как отдельный микросервис:

```
Основное приложение (Node.js:8443)
    ↓ HTTP requests
FastVLM сервер (Python:3001)
    ↓ FastVLM model
Результаты анализа
```

### Клиент для Node.js
```javascript
const response = await fetch('http://127.0.0.1:3001/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_base64: imageData,
    prompt: 'Опиши одежду'
  })
});
```

---

*Этот сервер обеспечивает высокопроизводительный анализ изображений одежды с использованием FastVLM модели.*
