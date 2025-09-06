# 🚀 Детальный план реализации FastVLM сервера

## 🎯 Цели проекта

Создать отдельный FastVLM сервер в папке `fastvlm-server/` с полным API для анализа изображений одежды, запуском в двух терминалах и интеграцией с основным приложением.

## 📋 Технические требования

### API Эндпоинты
- ✅ `GET /health` - проверка здоровья сервера
- ✅ `POST /analyze` - анализ изображения (base64 + промпт)
- 🆕 `GET /load` - проверка нагрузки сервера
- 🆕 `GET /gpu` - проверка работы на GPU
- 🆕 `GET /model` - информация о загруженной модели

### Формат данных
- **Вход**: `{"image_base64": "...", "prompt": "..."}`
- **Выход**: `{"success": true, "analysis": "..."}`

### Архитектура
- **FastVLM сервер**: Python Flask (порт 3001)
- **Основное приложение**: Node.js Express (порт 8443)
- **Коммуникация**: HTTP REST API

---

## 📁 Детальный план реализации

### 🎯 ФАЗА 1: Создание структуры fastvlm-server/

#### 1.1 Создание папки и базовых файлов
```bash
mkdir fastvlm-server
cd fastvlm-server

# Создание основных файлов
touch server.py
touch requirements.txt
touch README.md
touch config.py
mkdir logs
```

#### 1.2 Перенос и адаптация server.py
**Текущий файл:** `server/src/utils/fastvlm_server.py`
**Новый файл:** `fastvlm-server/server.py`

**Изменения:**
- Обновление путей к модели: `../../../ml-fastvlm` → `../ml-fastvlm`
- Добавление новых эндпоинтов
- Улучшение обработки ошибок
- Добавление логирования

#### 1.3 Создание requirements.txt
```txt
Flask==2.3.3
Pillow==10.0.0
torch==2.0.1
torchvision==0.15.2
transformers==4.21.3
accelerate==0.20.3
psutil==5.9.0
```

#### 1.4 Создание config.py
```python
import os

class Config:
    # Пути
    MODEL_PATH = os.path.join(os.path.dirname(__file__), '../ml-fastvlm/checkpoints/llava-fastvithd_1.5b_stage3')
    LOG_DIR = os.path.join(os.path.dirname(__file__), 'logs')

    # Настройки сервера
    HOST = '127.0.0.1'
    PORT = 3001

    # Настройки модели
    DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
    TORCH_DTYPE = torch.float16

    # Настройки генерации
    MAX_NEW_TOKENS = 256
    TEMPERATURE = 0.2
    DO_SAMPLE = True
```

### 🎯 ФАЗА 2: Реализация API эндпоинтов

#### 2.1 Базовые эндпоинты (уже есть)
```python
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'timestamp': time.time()
    })

@app.route('/analyze', methods=['POST'])
def analyze():
    # Анализ изображения с base64
    pass
```

#### 2.2 Новые эндпоинты

**Эндпоинт нагрузки:**
```python
@app.route('/load', methods=['GET'])
def get_load():
    """Проверка нагрузки сервера"""
    import psutil

    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()

    return jsonify({
        'cpu_percent': cpu_percent,
        'memory_percent': memory.percent,
        'memory_used_gb': memory.used / (1024**3),
        'memory_total_gb': memory.total / (1024**3)
    })
```

**Эндпоинт GPU:**
```python
@app.route('/gpu', methods=['GET'])
def get_gpu_info():
    """Проверка работы на GPU"""
    if not torch.cuda.is_available():
        return jsonify({
            'gpu_available': False,
            'message': 'GPU не доступен'
        })

    return jsonify({
        'gpu_available': True,
        'gpu_name': torch.cuda.get_device_name(0),
        'gpu_memory_allocated': torch.cuda.memory_allocated(0) / (1024**2),  # MB
        'gpu_memory_reserved': torch.cuda.memory_reserved(0) / (1024**2),   # MB
        'gpu_memory_total': torch.cuda.get_device_properties(0).total_memory / (1024**2)  # MB
    })
```

**Эндпоинт модели:**
```python
@app.route('/model', methods=['GET'])
def get_model_info():
    """Информация о загруженной модели"""
    if model is None:
        return jsonify({
            'loaded': False,
            'message': 'Модель не загружена'
        })

    return jsonify({
        'loaded': True,
        'model_name': model.config.model_type,
        'device': str(model.device),
        'context_length': context_len
    })
```

### 🎯 ФАЗА 3: Улучшения сервера

#### 3.1 Логирование
```python
import logging
from logging.handlers import RotatingFileHandler

def setup_logging():
    """Настройка логирования"""
    log_file = os.path.join(Config.LOG_DIR, 'fastvlm.log')

    handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
    handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
```

#### 3.2 Graceful shutdown
```python
def signal_handler(signum, frame):
    """Обработка сигналов завершения"""
    print("Получен сигнал завершения, останавливаем сервер...")
    if model:
        # Очистка GPU памяти
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)
```

#### 3.3 Валидация входных данных
```python
def validate_image_data(data):
    """Валидация данных изображения"""
    if not data or 'image_base64' not in data:
        raise ValueError("Отсутствует image_base64")

    try:
        # Проверяем корректность base64
        base64.b64decode(data['image_base64'])
    except Exception as e:
        raise ValueError(f"Некорректный base64: {e}")

    return True
```

### 🎯 ФАЗА 4: Интеграция с основным приложением

#### 4.1 Обновление Node.js сервера
**Файл:** `server/src/api/analyze.js`

**Изменения:**
- Обновление URL FastVLM: `http://127.0.0.1:3001`
- Добавление обработки новых эндпоинтов
- Улучшение обработки ошибок

#### 4.2 Создание FastVLM клиента
```javascript
// server/src/services/fastvlmClient.js
class FastVLMClient {
    constructor(baseUrl = 'http://127.0.0.1:3001') {
        this.baseUrl = baseUrl;
    }

    async analyzeImage(imageBase64, prompt) {
        const response = await fetch(`${this.baseUrl}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: imageBase64, prompt })
        });

        if (!response.ok) {
            throw new Error(`FastVLM API error: ${response.status}`);
        }

        return await response.json();
    }

    async healthCheck() {
        const response = await fetch(`${this.baseUrl}/health`);
        return response.ok ? await response.json() : null;
    }

    async getLoad() {
        const response = await fetch(`${this.baseUrl}/load`);
        return response.ok ? await response.json() : null;
    }

    async getGpuInfo() {
        const response = await fetch(`${this.baseUrl}/gpu`);
        return response.ok ? await response.json() : null;
    }
}
```

### 🎯 ФАЗА 5: Настройка запуска

#### 5.1 Скрипты запуска
**start-llm.sh:**
```bash
#!/bin/bash
cd fastvlm-server

# Активация виртуального окружения
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Запуск сервера
python server.py
```

**start-app.sh:**
```bash
#!/bin/bash
npm run build
npm start
```

#### 5.2 Инструкция запуска
```bash
# Терминал 1: FastVLM сервер
./start-llm.sh

# Терминал 2: Основное приложение
./start-app.sh
```

#### 5.3 Проверка работы
```bash
# Проверка здоровья
curl http://127.0.0.1:3001/health

# Проверка GPU
curl http://127.0.0.1:3001/gpu

# Проверка нагрузки
curl http://127.0.0.1:3001/load
```

### 🎯 ФАЗА 6: Тестирование

#### 6.1 Модульные тесты
```python
# tests/test_server.py
def test_health_endpoint():
    response = app.test_client().get('/health')
    assert response.status_code == 200

def test_analyze_endpoint():
    # Тест с mock изображением
    pass
```

#### 6.2 Интеграционные тесты
```javascript
// server/tests/fastvlm.integration.test.js
describe('FastVLM Integration', () => {
    it('should analyze image successfully', async () => {
        const client = new FastVLMClient();
        const result = await client.analyzeImage(testImageBase64, testPrompt);
        expect(result.success).toBe(true);
    });
});
```

### 🎯 ФАЗА 7: Документация

#### 7.1 README для fastvlm-server/
```markdown
# FastVLM Server

Отдельный сервер для анализа изображений с использованием FastVLM модели.

## Запуск

```bash
# Создание виртуального окружения
python -m venv venv
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt

# Запуск сервера
python server.py
```

## API

### GET /health
Проверка здоровья сервера

### POST /analyze
Анализ изображения
```json
{
  "image_base64": "base64_encoded_image",
  "prompt": "Опиши одежду на изображении"
}
```

### GET /load
Информация о нагрузке сервера

### GET /gpu
Информация о GPU

### GET /model
Информация о модели
```

---

## 📊 Ожидаемые результаты

### После реализации:
1. **Отдельный FastVLM сервер** в папке `fastvlm-server/`
2. **5 API эндпоинтов** (health, analyze, load, gpu, model)
3. **Запуск в двух терминалах** с автоматическими скриптами
4. **Полная интеграция** с основным Node.js приложением
5. **Логирование и мониторинг** всех операций
6. **Тесты** для всех компонентов

### Метрики успеха:
- ✅ FastVLM сервер запускается за < 30 секунд
- ✅ API отвечает за < 2 секунд на health/load/gpu
- ✅ Анализ изображения занимает < 10 секунд
- ✅ Память GPU используется эффективно
- ✅ Все эндпоинты документированы и протестированы

---

## 🚨 Риски и решения

### Риск 1: Проблемы с путями к модели
**Решение:** Использовать относительные пути и проверку существования файлов

### Риск 2: Недостаточно GPU памяти
**Решение:** Добавить обработку OutOfMemoryError и автоматическое переключение на CPU

### Риск 3: Конфликты портов
**Решение:** Проверка доступности порта перед запуском

### Риск 4: Долгая загрузка модели
**Решение:** Добавить прогресс-бар и статус загрузки

---

## ⏱️ Временные оценки

- **Фаза 1**: 1-2 часа (создание структуры)
- **Фаза 2**: 2-3 часа (API эндпоинты)
- **Фаза 3**: 1-2 часа (улучшения сервера)
- **Фаза 4**: 2-3 часа (интеграция с Node.js)
- **Фаза 5**: 30 мин (настройка запуска)
- **Фаза 6**: 1-2 часа (тестирование)
- **Фаза 7**: 30 мин (документация)

**Итого:** 8-13 часов работы

---

## 🔧 Необходимые инструменты

### Python зависимости:
- Flask
- Pillow
- torch
- transformers
- accelerate
- psutil

### Системные требования:
- Python 3.8+
- CUDA (рекомендуется для GPU)
- Минимум 8GB RAM
- Минимум 4GB GPU памяти (для GPU версии)

---

*Этот план обеспечивает создание полноценного FastVLM сервера с современным API и интеграцией с основным приложением.*
