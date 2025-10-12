# База знаний: FastVLM Сервер

## Оглавление

1. [Общая архитектура](#общая-архитектура)
2. [Основной сервер - server.py](#основной-сервер---serverpy)
3. [Конфигурация - config.py](#конфигурация---configpy)
4. [Предобработка изображений - image_preprocessing.py](#предобработка-изображений---image_preprocessingpy)
5. [Удаление фона - background_removal.py](#удаление-фона---background_removalpy)
6. [API Endpoints](#api-endpoints)
7. [Промпты для анализа](#промпты-для-анализа)
8. [Интеграции](#интеграции)

---

## Общая архитектура

FastVLM сервер - это отдельный Python Flask сервер для AI-анализа изображений одежды. Сервер работает независимо от основного Node.js сервера и предоставляет REST API для анализа.

### Технологический стек

- **Python 3.x** - язык программирования
- **Flask** - веб-фреймворк
- **Waitress** - production WSGI сервер (многопоточный)
- **PyTorch** - deep learning фреймворк
- **FastVLM (LLaVA)** - vision-language модель
- **Pillow (PIL)** - обработка изображений
- **rembg** - удаление фона
- **Google Gemini API** - опциональная интеграция
- **Ollama** - опциональная локальная LLM

### Особенности

- **GPU/CPU автоопределение** - автоматическое переключение
- **Многопроходный анализ** - person, clothing, legs, shoes, accessories
- **Кэширование моделей** - быстрая повторная загрузка
- **Graceful shutdown** - корректное завершение с очисткой памяти
- **Детальное логирование** - ротация логов, мониторинг производительности
- **Поддержка нескольких моделей** - FastVLM, Gemini, Ollama

### Структура

```
fastvlm-server/
├── server.py                   # Основной Flask сервер
├── config.py                   # Конфигурация
├── image_preprocessing.py      # Предобработка изображений
├── background_removal.py       # Удаление фона
├── start_fastvlm.py           # Скрипт запуска
├── prompt/                     # Промпты для анализа
│   ├── PERSON_PROMPT.md
│   ├── CLOTHING_PROMPT.md
│   ├── LEG_PROMPT.md
│   ├── SHOES_PROMPT.md
│   ├── ACCESSORIES_HEAD_PROMPT.md
│   ├── ACCESSORIES_HAND_PROMPT.md
│   └── CLASS_PROMPT.md
├── models/                     # Директория для моделей
│   └── ml-fastvlm/
├── logs/                       # Логи сервера
└── results/                    # Результаты анализов
```

---

## Основной сервер - server.py

### Глобальные переменные

#### Модель FastVLM

```python
model = None              # Загруженная модель
tokenizer = None          # Токенизатор
image_processor = None    # Процессор изображений
context_len = None        # Длина контекста
```

#### Gemini

```python
gemini_client = None      # Gemini клиент
```

#### Ollama

```python
ollama_available = False  # Статус Ollama
ollama_url = "http://127.0.0.1:11434"
ollama_model = "gemma3:4b"
```

#### Background Remover

```python
background_remover = None # BackgroundRemover instance
```

#### Промпты

```python
default_prompt = None
style_prompt = None
person_prompt = None
clothing_prompt = None
legs_prompt = None
shoes_prompt = None
accessories_head_prompt = None
accessories_hand_prompt = None
class_prompt = None
```

#### Статистика производительности

```python
performance_stats = {
    'total_requests': 0,
    'successful_requests': 0,
    'failed_requests': 0,
    'total_processing_time': 0.0,
    'average_processing_time': 0.0,
    'gpu_enabled': False,
    'model_loaded_at': None
}
```

---

### Основные функции

#### `setup_logging()`

Настройка логирования для FastVLM сервера.

**Что делает:**
- Создает директорию для логов
- Настраивает RotatingFileHandler (10MB, 5 backup файлов)
- Настраивает форматтер
- Отключает дефолтные Flask handlers
- Настраивает консольный вывод
- Настраивает корневой логгер

**Пример использования:**
```python
setup_logging()
app.logger.info('Server started')
```

#### `load_prompts()`

Загрузка промптов для анализа.

**Что делает:**
- Загружает промпты из файлов .md в директории prompt/
- Устанавливает fallback значения если файлы не найдены
- Логирует успех или предупреждения

**Промпты:**
- `PERSON_PROMPT.md` - анализ человека
- `CLOTHING_PROMPT.md` - анализ верхней одежды
- `LEG_PROMPT.md` - анализ одежды на ногах
- `SHOES_PROMPT.md` - анализ обуви
- `ACCESSORIES_HEAD_PROMPT.md` - аксессуары головы/шеи
- `ACCESSORIES_HAND_PROMPT.md` - аксессуары рук/запястий
- `CLASS_PROMPT.md` - классификация одежды

#### `extract_text(result) -> str`

Извлекает текст из результата анализа.

**Параметры:**
- `result` - результат анализа (dict или str)

**Возвращает:**
- Текст анализа

**Логика:**
```python
if isinstance(result, dict):
    return result.get("technical_analysis") or result.get("analysis") or ""
elif isinstance(result, str):
    return result
else:
    return ""
```

#### `perform_multi_pass_analysis(image_base64: str, nickname: str) -> dict`

Выполняет многопроходный анализ изображения.

**Параметры:**
- `image_base64` - base64 изображение
- `nickname` - никнейм пользователя для логирования

**Что делает:**
1. Pass 1: Анализ человека (person_prompt)
2. Pass 2: Анализ верхней одежды (clothing_prompt)
3. Pass 3: Анализ одежды на ногах (legs_prompt)
4. Pass 4: Анализ обуви (shoes_prompt)
5. Pass 5: Анализ аксессуаров головы/шеи (accessories_head_prompt)
6. Pass 6: Анализ аксессуаров рук (accessories_hand_prompt)

**Возвращает:**
```python
{
    "person": str,
    "clothing": str,
    "legs": str,
    "shoes": str,
    "accessories_head": str,
    "accessories_hand": str,
    "timing": {
        "person": float,
        "clothing": float,
        "legs": float,
        "shoes": float,
        "accessories_head": float,
        "accessories_hand": float,
        "total": float
    },
    "success": bool,
    "error": str  # если success = False
}
```

#### `analyze_image_fastvlm(image_base64, prompt_text=None) -> tuple`

Анализ изображения с помощью FastVLM модели.

**Параметры:**
- `image_base64` - base64 изображение
- `prompt_text` - промпт для анализа (опционально)

**Что делает:**
1. Проверяет что модель загружена
2. Декодирует base64 изображение
3. Конвертирует в RGB
4. Подготавливает промпт с IMAGE_TOKEN
5. Создает диалог через conv_templates
6. Токенизирует промпт
7. Обрабатывает изображение через image_processor
8. Генерирует ответ через model.generate()
9. Декодирует результат
10. Очищает от стоп-последовательностей

**Возвращает:**
```python
(outputs: str, error: str | None)
```

**Параметры генерации:**
```python
do_sample = Config.FASHION_ANALYSIS_CONFIG['do_sample']
temperature = Config.FASHION_ANALYSIS_CONFIG['temperature']
top_p = Config.FASHION_ANALYSIS_CONFIG['top_p']
top_k = Config.FASHION_ANALYSIS_CONFIG['top_k']
num_beams = Config.FASHION_ANALYSIS_CONFIG['num_beams']
max_new_tokens = Config.FASHION_ANALYSIS_CONFIG['max_new_tokens']
repetition_penalty = Config.FASHION_ANALYSIS_CONFIG['repetition_penalty']
length_penalty = Config.FASHION_ANALYSIS_CONFIG['length_penalty']
no_repeat_ngram_size = Config.FASHION_ANALYSIS_CONFIG['no_repeat_ngram_size']
early_stopping = Config.FASHION_ANALYSIS_CONFIG['early_stopping']
```

#### `check_ollama_availability() -> bool`

Проверяет доступность Ollama API.

**Что делает:**
- Проверяет установлен ли requests
- Делает GET запрос к /api/tags
- Проверяет наличие нужной модели в списке
- Устанавливает ollama_available = True/False
- Логирует результат

**Возвращает:**
- `True` если Ollama доступен и модель найдена

#### `update_performance_stats(processing_time, success=True)`

Обновление статистики производительности.

**Параметры:**
- `processing_time` - время обработки в секундах
- `success` - успешность запроса

**Что делает:**
- Увеличивает total_requests
- Обновляет successful_requests или failed_requests
- Пересчитывает average_processing_time

#### `@contextmanager gpu_memory_manager()`

Контекст-менеджер для управления GPU памятью.

**Использование:**
```python
with gpu_memory_manager():
    output = model.generate(...)
```

**Что делает:**
- Запоминает начальное использование памяти
- После выполнения очищает кэш GPU
- Логирует освобожденную память

---

### Flask Routes

#### `GET /health`

Проверка здоровья сервера.

**Возвращает:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "gpu_available": true,
  "device": "cuda:0",
  "performance": {
    "total_requests": 100,
    "successful_requests": 95,
    "failed_requests": 5,
    "average_processing_time": 2.5
  }
}
```

#### `POST /analyze`

Анализ изображения одежды.

**Тело запроса:**
```json
{
  "image_base64": "base64_string",
  "prompt": "Опиши одежду на фото",
  "nickname": "username",
  "topic": "casual"
}
```

**Ответ (успех):**
```json
{
  "success": true,
  "analysis": "Текст анализа...",
  "multi_pass_results": {
    "person": "...",
    "clothing": "...",
    "legs": "...",
    "shoes": "...",
    "accessories_head": "...",
    "accessories_hand": "..."
  },
  "model_used": "llava",
  "processing_time": 5.2
}
```

**Ответ (ошибка):**
```json
{
  "success": false,
  "error": "Error message",
  "processing_time": 0.5
}
```

#### `POST /remove-background`

Удаление фона с изображения.

**Тело запроса:**
```json
{
  "image_base64": "base64_string"
}
```

**Ответ:**
```json
{
  "success": true,
  "image_base64": "processed_base64_string",
  "processing_time": 1.5
}
```

#### `POST /classify-clothing`

Классификация предмета одежды.

**Тело запроса:**
```json
{
  "image_base64": "base64_string"
}
```

**Ответ:**
```json
{
  "success": true,
  "classification": {
    "category": "BODYWEAR",
    "subcategory": "T-shirt",
    "color": "Blue",
    "material": "Cotton",
    "fit": "Regular",
    "style": "Casual",
    "description": "..."
  },
  "processing_time": 2.0
}
```

---

## Конфигурация - config.py

### Класс Config

Централизованная конфигурация FastVLM сервера.

#### Основные переменные

##### Пути к моделям

```python
MODEL_PATH = os.getenv('MODEL_PATH', './models/ml-fastvlm')
MODEL_NAME = os.getenv('MODEL_NAME', 'llava-v1.6-vicuna-7b-hf')
```

##### GPU настройки

```python
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
TORCH_DTYPE = torch.float16 if torch.cuda.is_available() else torch.float32
LOAD_4BIT = os.getenv('LOAD_4BIT', 'false').lower() == 'true'
LOAD_8BIT = os.getenv('LOAD_8BIT', 'false').lower() == 'true'
```

##### Сервер настройки

```python
SERVER_HOST = os.getenv('SERVER_HOST', '127.0.0.1')
SERVER_PORT = int(os.getenv('SERVER_PORT', '3001'))
SERVER_THREADS = int(os.getenv('SERVER_THREADS', '4'))
```

##### Логирование

```python
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_DIR = os.path.join(os.path.dirname(__file__), 'logs')
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
LOG_BACKUP_COUNT = 5
```

##### Результаты

```python
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')
SAVE_RESULTS = os.getenv('SAVE_RESULTS', 'false').lower() == 'true'
```

#### Конфигурация анализа моды

```python
FASHION_ANALYSIS_CONFIG = {
    'conv_mode': 'vicuna_v1',          # Режим диалога
    'do_sample': True,                  # Сэмплинг
    'temperature': 0.2,                 # Температура (0.0-1.0)
    'top_p': 0.7,                       # Nucleus sampling
    'top_k': 50,                        # Top-K sampling
    'num_beams': 1,                     # Beam search
    'max_new_tokens': 512,              # Макс токенов
    'repetition_penalty': 1.15,         # Штраф за повторы
    'length_penalty': 1.0,              # Штраф за длину
    'no_repeat_ngram_size': 3,          # N-грамм без повторов
    'early_stopping': True              # Ранняя остановка
}
```

#### Стоп-последовательности

```python
STOP_SEQUENCES = [
    '</s>',
    '<|im_end|>',
    'USER:',
    'ASSISTANT:',
    '[INST]',
    '[/INST]',
    '\n\n\n'
]
```

#### Методы

##### `ensure_directories()`

Создает необходимые директории если их нет.

**Создает:**
- LOG_DIR
- RESULTS_DIR

##### `get_model_config() -> dict`

Получение конфигурации модели.

**Возвращает:**
```python
{
    'model_path': str,
    'model_name': str,
    'device': str,
    'load_4bit': bool,
    'load_8bit': bool,
    'conv_mode': str
}
```

##### `get_server_config() -> dict`

Получение конфигурации сервера.

**Возвращает:**
```python
{
    'host': str,
    'port': int,
    'threads': int,
    'log_level': str
}
```

---

## Предобработка изображений - image_preprocessing.py

### Функция `smart_preprocess_image(image_path_or_pil, target_size=(336, 336))`

Умная предобработка изображения для FastVLM.

**Параметры:**
- `image_path_or_pil` - путь к файлу или PIL Image
- `target_size` - целевой размер (width, height)

**Что делает:**
1. Загружает изображение
2. Конвертирует в RGB
3. Вычисляет соотношение сторон
4. Определяет padding для сохранения пропорций
5. Ресайзит изображение
6. Добавляет padding (черные полосы)
7. Применяет нормализацию ImageNet

**Возвращает:**
- Обработанный PIL Image

**Пример:**
```python
from image_preprocessing import smart_preprocess_image

image = smart_preprocess_image('photo.jpg', target_size=(336, 336))
```

---

## Удаление фона - background_removal.py

### Класс BackgroundRemover

Класс для удаления фона с изображений одежды.

#### Методы

##### `__init__()`

Инициализация BackgroundRemover.

**Что делает:**
- Импортирует rembg
- Инициализирует модель u2net
- Логирует успех или ошибку

##### `remove_background(image_base64: str) -> tuple`

Удаление фона с изображения.

**Параметры:**
- `image_base64` - base64 изображение

**Что делает:**
1. Декодирует base64
2. Открывает изображение через PIL
3. Применяет rembg.remove()
4. Конвертирует в base64
5. Возвращает результат

**Возвращает:**
```python
(processed_base64: str, error: str | None)
```

**Пример:**
```python
remover = BackgroundRemover()
result, error = remover.remove_background(image_base64)
if not error:
    print("Background removed successfully")
```

##### `is_available() -> bool`

Проверка доступности rembg.

**Возвращает:**
- `True` если rembg установлен и модель загружена

---

## API Endpoints

### Детальное описание

#### `/analyze` - Анализ изображения

**Метод:** POST

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgA...",
  "prompt": "Опиши одежду на фото",
  "nickname": "user123",
  "topic": "casual"
}
```

**Процесс обработки:**

1. **Валидация запроса**
   - Проверка наличия image_base64
   - Проверка что модель загружена

2. **Предобработка**
   - Умная предобработка изображения
   - Сохранение в temp файл (если SAVE_RESULTS=true)

3. **Многопроходный анализ**
   - 6 проходов с разными промптами
   - Timing для каждого прохода

4. **Постобработка**
   - Форматирование результатов
   - Сохранение в results/ (если SAVE_RESULTS=true)

5. **Ответ**
   - JSON с результатами всех проходов
   - Общее время обработки

**Пример ответа:**
```json
{
  "success": true,
  "analysis": "На фотографии изображена женщина примерно 25-30 лет...",
  "multi_pass_results": {
    "person": "Женщина, примерно 25-30 лет, европейская внешность",
    "clothing": "Белая хлопковая футболка, свободного кроя",
    "legs": "Синие джинсы, slim fit, средняя посадка",
    "shoes": "Белые кроссовки Nike Air Force 1",
    "accessories_head": "Солнцезащитные очки Ray-Ban",
    "accessories_hand": "Серебряные часы на левом запястье"
  },
  "model_used": "llava",
  "processing_time": 12.5,
  "timing": {
    "person": 2.1,
    "clothing": 2.3,
    "legs": 2.0,
    "shoes": 1.8,
    "accessories_head": 2.1,
    "accessories_hand": 2.2,
    "total": 12.5
  }
}
```

#### `/remove-background` - Удаление фона

**Метод:** POST

**Body:**
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgA..."
}
```

**Процесс обработки:**

1. **Валидация**
   - Проверка image_base64
   - Проверка что BackgroundRemover инициализирован

2. **Удаление фона**
   - Декодирование base64
   - Применение rembg
   - Конвертация обратно в base64

3. **Ответ**
   - Обработанное изображение в base64

**Пример ответа:**
```json
{
  "success": true,
  "image_base64": "iVBORw0KGgoAAAANSUhEUgA...",
  "processing_time": 1.8
}
```

#### `/classify-clothing` - Классификация одежды

**Метод:** POST

**Body:**
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgA..."
}
```

**Процесс обработки:**

1. **Предобработка**
   - Умная предобработка изображения

2. **Анализ с CLASS_PROMPT**
   - Специальный промпт для классификации
   - Структурированный ответ

3. **Парсинг результата**
   - Извлечение категории, цвета, материала, стиля, посадки
   - Валидация категорий

4. **Ответ**
   - Структурированная классификация

**Пример ответа:**
```json
{
  "success": true,
  "classification": {
    "category": "BODYWEAR",
    "subcategory": "T-shirt",
    "color": "White",
    "material": "Cotton",
    "fit": "Regular",
    "style": "Casual",
    "description": "White cotton t-shirt with round neck"
  },
  "processing_time": 2.5
}
```

---

## Промпты для анализа

### PERSON_PROMPT.md

Анализ человека на фотографии.

**Что извлекается:**
- Приблизительный возраст
- Пол
- Тип внешности
- Особенности

**Пример результата:**
```
Женщина, примерно 25-30 лет, европейская внешность, светлые волосы, стройное телосложение.
```

### CLOTHING_PROMPT.md

Анализ верхней одежды.

**Что извлекается:**
- Тип одежды (футболка, рубашка, свитер и т.д.)
- Цвет
- Материал
- Особенности кроя
- Детали (воротник, рукава, декор)

**Пример результата:**
```
Белая хлопковая футболка, круглый вырез, короткий рукав, свободный крой, без принта.
```

### LEG_PROMPT.md

Анализ одежды на ногах.

**Что извлекается:**
- Тип одежды (джинсы, брюки, шорты и т.д.)
- Цвет
- Материал
- Посадка (высокая, средняя, низкая)
- Крой (slim, regular, wide)

**Пример результата:**
```
Синие джинсы, деним, slim fit, средняя посадка, длина до щиколоток.
```

### SHOES_PROMPT.md

Анализ обуви.

**Что извлекается:**
- Тип обуви (кроссовки, туфли, ботинки и т.д.)
- Бренд (если распознается)
- Цвет
- Материал
- Особенности

**Пример результата:**
```
Белые кожаные кроссовки Nike Air Force 1, классический дизайн, плоская подошва.
```

### ACCESSORIES_HEAD_PROMPT.md

Анализ аксессуаров на голове, лице, ушах, шее.

**Что извлекается:**
- Очки (солнцезащитные, для зрения)
- Серьги
- Ожерелья, цепочки
- Шарфы
- Головные уборы

**Пример результата:**
```
Солнцезащитные очки Ray-Ban Wayfarer, серебряные серьги-гвоздики, тонкая золотая цепочка.
```

### ACCESSORIES_HAND_PROMPT.md

Анализ аксессуаров на руках, запястьях, пальцах.

**Что извлекается:**
- Часы
- Браслеты
- Кольца
- Сумки (в руках)

**Пример результата:**
```
Серебряные часы на левом запястье, тонкий золотой браслет на правом запястье, обручальное кольцо.
```

### CLASS_PROMPT.md

Классификация предмета одежды для гардероба.

**Структура ответа:**
```
1. [Type of clothing]     # Тип одежды
2. [Subtype of clothing]  # Подтип
3. [Color]                # Цвет
4. [Material]             # Материал
5. [Fit]                  # Посадка/крой
6. [Style]                # Стиль
```

**Пример результата:**
```
1. BODYWEAR
2. T-shirt
3. White
4. Cotton
5. Regular fit
6. Casual
```

---

## Интеграции

### Google Gemini API

#### Настройка

```python
GEMINI_AVAILABLE = True
gemini_client = genai.Client(api_key=os.getenv('GOOGLE_API_KEY'))
```

#### Использование

```python
if GEMINI_AVAILABLE:
    response = gemini_client.models.generate_content(
        model='gemini-2.0-flash-exp',
        contents=[
            types.Part.from_text(prompt),
            types.Part.from_image_data(image_data)
        ]
    )
    analysis = response.text
```

**Преимущества:**
- Быстрая обработка
- Хорошее качество анализа
- Поддержка мультимодальности

**Недостатки:**
- Требует API ключ
- Ограничения по запросам
- Стоимость использования

### Ollama (локальная LLM)

#### Настройка

```python
ollama_url = "http://127.0.0.1:11434"
ollama_model = "gemma3:4b"
```

#### Проверка доступности

```python
def check_ollama_availability():
    response = requests.get(f"{ollama_url}/api/tags")
    models = response.json().get('models', [])
    return ollama_model in [m['name'] for m in models]
```

#### Использование

```python
if ollama_available:
    response = requests.post(
        f"{ollama_url}/api/generate",
        json={
            "model": ollama_model,
            "prompt": prompt,
            "stream": False,
            "images": [image_base64]
        }
    )
    analysis = response.json()['response']
```

**Преимущества:**
- Полностью локальная работа
- Нет лимитов и стоимости
- Приватность данных

**Недостатки:**
- Требует установку Ollama
- Нужна мощная система
- Медленнее чем Gemini

### FastVLM (LLaVA)

Основная модель, работает по умолчанию.

**Преимущества:**
- Локальная работа
- Хорошее качество
- Поддержка GPU

**Недостатки:**
- Требует много памяти (GPU/RAM)
- Медленнее чем Gemini
- Требует загрузки модели (~14GB)

---

## Производительность

### Оптимизации

#### 1. GPU Memory Manager

```python
with gpu_memory_manager():
    output = model.generate(...)
```

Автоматически очищает GPU кэш после использования.

#### 2. Кэширование модели

Модель загружается один раз при старте и остается в памяти.

#### 3. Inference Mode

```python
with torch.inference_mode():
    output = model.generate(...)
```

Отключает gradient computation для ускорения.

#### 4. Batch Processing

Обработка изображений пакетами (не реализовано, но возможно).

### Benchmarks

**Типичные времена обработки (GPU RTX 3060):**

- Person analysis: ~2.1s
- Clothing analysis: ~2.3s
- Legs analysis: ~2.0s
- Shoes analysis: ~1.8s
- Accessories (head): ~2.1s
- Accessories (hand): ~2.2s
- **Total multi-pass: ~12.5s**

**CPU режим:**
- Медленнее в 5-10 раз
- Person analysis: ~10-15s
- **Total multi-pass: ~60-80s**

---

## Troubleshooting

### Ошибка загрузки модели

```
Error: Model not found at ./models/ml-fastvlm
```

**Решение:**
1. Скачайте модель FastVLM
2. Распакуйте в models/ml-fastvlm/
3. Проверьте MODEL_PATH в .env

### Out of Memory (GPU)

```
RuntimeError: CUDA out of memory
```

**Решение:**
1. Включите 4-bit quantization: `LOAD_4BIT=true`
2. Включите 8-bit quantization: `LOAD_8BIT=true`
3. Используйте меньшую модель
4. Уменьшите max_new_tokens в config.py
5. Переключитесь на CPU

### rembg ошибки

```
Error: Failed to download model
```

**Решение:**
1. Установите rembg: `pip install rembg`
2. Скачайте модель вручную:
```bash
mkdir -p ~/.u2net
wget -O ~/.u2net/u2net.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
```

### Ollama недоступен

```
Warning: Ollama API недоступен
```

**Решение:**
1. Установите Ollama: https://ollama.ai
2. Скачайте модель: `ollama pull gemma3:4b`
3. Запустите Ollama: `ollama serve`

---

## Запуск сервера

### Через start_fastvlm.py

```bash
python start_fastvlm.py
```

**Что делает:**
- Проверяет переменные окружения
- Загружает модель
- Запускает сервер через Waitress
- Настраивает graceful shutdown

### Напрямую

```bash
python server.py
```

**Development режим:** Flask development server

**Production режим:** Waitress WSGI server

### Docker

```bash
docker build -t tgstyle-fastvlm .
docker run -p 3001:3001 --gpus all tgstyle-fastvlm
```

---

## Переменные окружения

### Обязательные

```env
# Не требуются, есть defaults
```

### Опциональные

```env
# Модель
MODEL_PATH=./models/ml-fastvlm
MODEL_NAME=llava-v1.6-vicuna-7b-hf

# Quantization
LOAD_4BIT=false
LOAD_8BIT=false

# Сервер
SERVER_HOST=127.0.0.1
SERVER_PORT=3001
SERVER_THREADS=4

# Логирование
LOG_LEVEL=INFO

# Результаты
SAVE_RESULTS=false

# Google Gemini (опционально)
GOOGLE_API_KEY=your_api_key_here

# GPU
CUDA_VISIBLE_DEVICES=0
```

---

## Мониторинг

### Health Check

```bash
curl http://127.0.0.1:3001/health
```

### Логи

```bash
tail -f logs/fastvlm.log
```

### Статистика производительности

```python
performance_stats = {
    'total_requests': 150,
    'successful_requests': 145,
    'failed_requests': 5,
    'average_processing_time': 12.3
}
```

---

**Конец документации FastVLM сервера.**
