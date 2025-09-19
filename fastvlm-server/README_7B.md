# FastVLM 7B Server - Руководство по запуску

## 🎯 Обзор

**FastVLM 7B Server** - это оптимизированный сервер для анализа изображений одежды с использованием 7B модели Apple FastVLM. Обеспечивает высокое качество анализа при сохранении приемлемой скорости обработки.

### Особенности 7B модели:
- 🧠 **7 миллиардов параметров** - более точный анализ стиля
- 📱 **Qwen2-7B LLM** - улучшенное понимание языка
- ⚡ **Optimized FastViTHD** - эффективная обработка изображений
- 🎨 **Детальный анализ** - глубокое понимание моды и стиля
- 🚀 **7.9x быстрее** чем аналоги (Cambrian-1-8B)

## 📋 Требования системы

### Минимальные требования:
- **GPU**: 6GB+ видеопамяти (NVIDIA с CUDA поддержкой) 🆕 **С квантизацией!**
- **RAM**: 16GB+ оперативной памяти
- **Диск**: 15GB+ свободного места
- **Python**: 3.8+
- **CUDA**: 11.8+ (рекомендуется 12.1+)

### 🆕 Автоматическая квантизация:
- **8GB GPU** (RTX 3070/3080): Автоматически включается **4-bit квантизация**
- **12GB+ GPU** (RTX 3080Ti/4080): Работает без квантизации (FP16)
- **6-8GB GPU**: 4-bit квантизация позволяет запустить 7B модель!

### Рекомендуемые требования:
- **GPU**: 16GB+ видеопамяти (RTX 3080/4080, A100, H100)
- **RAM**: 32GB+ оперативной памяти
- **Диск**: SSD для быстрой загрузки модели
- **CPU**: 8+ ядер для многопоточности

### Поддерживаемые GPU:
- ✅ NVIDIA RTX 3080/3090 (12GB+)
- ✅ NVIDIA RTX 4080/4090 (16GB+)
- ✅ NVIDIA A100 (40GB)
- ✅ NVIDIA H100 (80GB)
- ⚠️ NVIDIA RTX 3070 (8GB) - может работать с ограничениями
- ❌ NVIDIA GTX серии (нет Tensor Cores)

## 🚀 Быстрый запуск

### 1. Проверка готовности системы

```bash
# Переход в директорию FastVLM сервера
cd fastvlm-server

# Проверка GPU
nvidia-smi

# Проверка CUDA
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
```

### 2. Установка зависимостей

```bash
# Создание виртуального окружения (рекомендуется)
python -m venv venv_7b
source venv_7b/bin/activate  # Linux/Mac
# или
venv_7b\Scripts\activate     # Windows

# Установка зависимостей для 7B модели
pip install -r requirements7b.txt
```

### 3. Конфигурация

```bash
# Копирование примера конфигурации
cp env_7b_example.txt .env

# Редактирование конфигурации (опционально)
nano .env
```

### 4. Запуск сервера

```bash
# Автоматический запуск с проверками
python start_7b.py

# Или прямой запуск сервера
python server7b.py
```

### 5. Проверка работы

```bash
# Тестирование в отдельном терминале
python test_7b.py
```

## ⚙️ Конфигурация

### Базовые настройки (.env файл):

```bash
# Сервер
FASTVLM7B_HOST=127.0.0.1
FASTVLM7B_PORT=3002

# Производительность
FASTVLM7B_THREADS=4          # Меньше потоков для 7B
MAX_NEW_TOKENS_7B=2048       # Максимум токенов
TEMPERATURE_7B=0.1           # Точность генерации
MAX_IMAGE_SIZE_7B=2048       # Размер изображений
```

### Оптимизация для слабых GPU (8-12GB):

```bash
# Экономия памяти
MAX_NEW_TOKENS_7B=1024
MAX_IMAGE_SIZE_7B=1024
FASTVLM7B_THREADS=2
FASTVLM7B_CONNECTION_LIMIT=256
```

### Оптимизация для мощных GPU (16GB+):

```bash
# Максимальная производительность
MAX_NEW_TOKENS_7B=4096
FASTVLM7B_THREADS=8
FASTVLM7B_CONNECTION_LIMIT=1024
TORCH_COMPILE_7B=true
```

## 🔄 API Эндпоинты

### Base URL: `http://127.0.0.1:3002`

#### 🩺 Health Check
```bash
GET /health
```

**Ответ:**
```json
{
  "status": "healthy",
  "model_type": "7B",
  "model_loaded": true,
  "device": "cuda",
  "gpu_name": "NVIDIA RTX 4080",
  "gpu_memory_allocated_mb": 8192
}
```

#### 🧠 Анализ изображения
```bash
POST /analyze
Content-Type: application/json

{
  "image_base64": "iVBORw0KGgoAAAANS...",
  "prompt": "Опиши одежду на фото детально"
}
```

**Ответ:**
```json
{
  "success": true,
  "analysis": "На изображении представлена...",
  "model_used": "fastvlm_7b",
  "device": "cuda",
  "response_time": 3.2,
  "model_type": "7B"
}
```

#### 📊 Информация о системе
```bash
GET /gpu     # GPU статистика
GET /load    # Нагрузка системы  
GET /model   # Информация о модели
```

## 🧪 Тестирование

### Автоматическое тестирование:
```bash
python test_7b.py
```

### Ручное тестирование:
```bash
# Health check
curl http://127.0.0.1:3002/health

# GPU информация
curl http://127.0.0.1:3002/gpu

# Анализ изображения через curl
curl -X POST http://127.0.0.1:3002/analyze \
  -H "Content-Type: application/json" \
  -d '{"image_base64":"[base64_image]","prompt":"Describe clothing"}'
```

## 📈 Производительность

### Типичные показатели:

| GPU | Время загрузки модели | Время первого ответа | Последующие ответы |
|-----|----------------------|---------------------|-------------------|
| RTX 4090 | 30-45 сек | 3-5 сек | 2-4 сек |
| RTX 4080 | 45-60 сек | 4-7 сек | 3-5 сек |
| RTX 3080 | 60-90 сек | 6-10 сек | 4-7 сек |
| A100 | 20-30 сек | 2-3 сек | 1-2 сек |

### Мониторинг производительности:
```bash
# GPU мониторинг в реальном времени
watch -n 1 nvidia-smi

# Системная нагрузка
curl http://127.0.0.1:3002/load
```

## 🔧 Troubleshooting

### Проблема: Out of Memory (OOM)

**Симптомы:**
```
CUDA out of memory. Tried to allocate 2.00 GiB
```

**Решения:**
1. Уменьшить `MAX_NEW_TOKENS_7B` до 1024
2. Уменьшить `MAX_IMAGE_SIZE_7B` до 1024
3. Установить `FASTVLM7B_THREADS=2`
4. Закрыть другие GPU приложения

### Проблема: Модель загружается медленно

**Решения:**
1. Использовать SSD диск
2. Увеличить `FASTVLM7B_CONNECTION_TIMEOUT`
3. Проверить использование CPU/RAM

### Проблема: Сервер не запускается

**Проверки:**
```bash
# Проверка порта
netstat -tlnp | grep 3002

# Проверка зависимостей
pip list | grep torch

# Проверка модели
ls -la models/llava-fastvithd_7b_stage3/
```

### Проблема: Низкое качество анализа

**Решения:**
1. Увеличить `MAX_NEW_TOKENS_7B`
2. Настроить `TEMPERATURE_7B` (0.1-0.3)
3. Использовать детальные промпты
4. Проверить качество входных изображений

## 🆚 Сравнение с 1.5B моделью

| Характеристика | FastVLM 1.5B | FastVLM 7B |
|---------------|--------------|------------|
| **Размер модели** | 1.5B параметров | 7B параметров |
| **GPU память** | 4-6GB | 12-16GB |
| **Качество анализа** | Хорошее | Отличное |
| **Скорость** | Быстрее | Медленнее |
| **Детализация** | Базовая | Глубокая |
| **Языковые навыки** | Стандартные | Продвинутые |

## 🔀 Интеграция с основным сервером

### Использование через основной TgStyle сервер:

1. **Запустите 7B сервер** на порту 3002
2. **Настройте основной сервер** для использования 7B:

```javascript
// В server/src/api/analyze.js
const FASTVLM_7B_URL = 'http://127.0.0.1:3002';

async function analyzeWithFastVLM7B(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  
  const response = await fetch(`${FASTVLM_7B_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: base64Image,
      prompt: 'Детально опиши одежду и стиль на изображении'
    })
  });
  
  return response.json();
}
```

### Балансировка нагрузки:

```javascript
// Выбор модели в зависимости от нагрузки
async function chooseModel() {
  const load7B = await checkServerLoad('http://127.0.0.1:3002');
  const load1_5B = await checkServerLoad('http://127.0.0.1:3001');
  
  return load7B < 80 ? 'fastvlm_7b' : 'fastvlm_1_5b';
}
```

## 📚 Дополнительные ресурсы

### Официальные ссылки:
- 🔗 [Apple FastVLM GitHub](https://github.com/apple/ml-fastvlm)
- 🤗 [Hugging Face Model](https://huggingface.co/apple/FastVLM-7B-int4)
- 📖 [FastVLM Paper (CVPR 2025)](https://arxiv.org/abs/2412.13303)

### Полезные команды:
```bash
# Очистка GPU памяти
python -c "import torch; torch.cuda.empty_cache()"

# Проверка CUDA версии
nvcc --version

# Мониторинг логов 7B сервера
tail -f logs/7b/fastvlm7b.log

# Остановка всех Python процессов
pkill -f python
```

## 🤝 Поддержка

### При возникновении проблем:

1. **Проверьте системные требования**
2. **Запустите автоматическую диагностику**: `python start_7b.py`
3. **Проверьте логи**: `logs/7b/fastvlm7b.log`
4. **Выполните тесты**: `python test_7b.py`

### Контакты:
- 📧 Email: [support@tgstyle.app](mailto:support@tgstyle.app)
- 💬 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 📚 Documentation: [Full Docs](./README.md)

---

**FastVLM 7B Server** обеспечивает превосходное качество анализа одежды для профессиональных приложений в сфере моды и стиля! 🎨👗
