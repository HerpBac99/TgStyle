# FastVLM Server

Отдельный Flask-сервер для анализа изображений одежды с использованием FastVLM модели.

## 🚀 Быстрый запуск

### 1. Создание виртуального окружения
```bash
cd fastvlm-server
python -m venv venv
python start_fastvlm.py
```

**Активация окружения:**
venv\Scripts\activate

### 2. Установка зависимостей
```bash
pip install -r requirements.txt
```

### 3. Запуск сервера
```bash
$env:FASTVLM_MODEL="1.5b"; python server.py

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

## 🎨 Удаление заднего фона

### Быстрый запуск background_removal.py

**Скрипт для удаления заднего фона на фотографиях с использованием AI.**

### 1. Установка зависимостей
```bash
cd fastvlm-server
pip install rembg opencv-python onnxruntime-gpu==1.16.3
```

### 2. Запуск на одном изображении
```bash
# Обработать одно фото (результат сохранится как photo_bg.jpg)
python background_removal.py --input ../photos/photo.jpg --output ../results/photo_bg.jpg

# Или короче
python background_removal.py -i ../photos/photo.jpg -o ../results/photo_bg.jpg
```

### 3. Пакетная обработка директории
```bash
# Обработать все JPG файлы в директории
python background_removal.py --input ../photos/ --output ../results/ --batch

# Пример: обработать 5 конкретных фото
python background_removal.py -i ../photos/ -o ../results/ -b
```

### 4. Выбор устройства (GPU/CPU)
```bash
# GPU режим
python background_removal.py -i photo.jpg -o result.jpg --gpu

# CPU режим (по умолчанию, рекомендуется)
python background_removal.py -i photo.jpg -o result.jpg
```

### Параметры скрипта
- `--input, -i`: путь к изображению или директории
- `--output, -o`: путь для сохранения результата
- `--batch, -b`: пакетная обработка всех изображений в директории
- `--gpu`: использовать GPU
- `--cpu`: использовать CPU (по умолчанию)
- `--no-crop`: отключить автоматическое обрезание до границ объекта
- `--no-postprocess`: отключить постобработку краев

### Примеры использования

#### Обработка одного фото
```bash
python background_removal.py --input ../1.jpg --output ../1_bg.jpg
```

#### Обработка директории с фото
```bash
# Создать папку для результатов
mkdir ../bg_results

# Обработать все фото из photos/ и сохранить в bg_results/
python background_removal.py --input ../photos/ --output ../bg_results/ --batch
```

#### Сравнение качества (для тестирования)
```bash
# GPU режим
python background_removal.py -i ../1.jpg -o ../1_gpu.jpg --gpu

# CPU режим (по умолчанию)
python background_removal.py -i ../1.jpg -o ../1_cpu.jpg
```

#### Сохранение с прозрачным фоном (PNG)
```bash
# Одно фото в PNG (прозрачный фон)
python background_removal.py -i ../1.jpg -o ../1_bg_transparent.png

# Пакетная обработка в PNG
python background_removal.py -i ../photos/ -o ../transparent_results/ --batch
```

### Результаты
- **Качество**: Высокое (нейронная сеть U2Net)
- **Формат**: JPG с белым фоном или PNG с прозрачностью (в зависимости от расширения выходного файла)
- **Скорость**: 2-3 секунды на фото (CPU), зависит от GPU
- **Именование**: `{original_name}_bg.jpg` или `{original_name}_bg.png`
- **Автообрезание**: Удаление лишнего фона, подгонка под границы объекта

### Устранение проблем
```bash
# Если CUDA не работает
python background_removal.py -i photo.jpg -o result.jpg --cpu

# Проверить GPU
python -c "import onnxruntime as ort; print(ort.get_available_providers())"
```

## 🖼️ Создание коллажей

### Быстрый запуск collage_maker.py

**Скрипт для создания вертикальных коллажей из двух фотографий.**

### Пример использования
```bash
cd fastvlm-server

# Создать коллаж: верхняя половина кофты + нижняя половина штанов
python collage_maker.py --top ../set/4_bg.jpg --bottom ../set/1_bg.jpg --output ../my_collage.jpg

# Создать коллаж с другим соотношением (60% кофты, 40% штанов)
python collage_maker.py --top ../set/4_bg.jpg --bottom ../set/1_bg.jpg --output ../collage_60_40.jpg --ratio 0.6
```

### Параметры скрипта
- `--top, -t`: путь к изображению для верхней части
- `--bottom, -b`: путь к изображению для нижней части
- `--output, -o`: путь для сохранения коллажа
- `--ratio, -r`: соотношение разреза (0.5 = пополам)

### Результат
- **Формат**: JPG с белым фоном
- **Размер**: Автоматически подбирается по минимальной ширине
- **Качество**: Высокое (95% JPEG)

---

*Этот сервер обеспечивает высокопроизводительный анализ изображений одежды с использованием FastVLM модели и включает инструменты для предварительной обработки изображений и создания коллажей.*
