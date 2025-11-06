# Core Module - Ядро FastVLM сервера

## Обзор

Модуль `core` содержит базовые компоненты для инициализации FastVLM сервера.

## Структура

```
fastvlm-server/core/
├── __init__.py           # Экспорт публичных классов
├── initialization.py     # Класс ServerInitializer
└── README.md            # Документация
```

---

## ServerInitializer

Класс для централизованной инициализации всех компонентов сервера.

### Инициализируемые компоненты:

1. **Логирование** - настройка логов в файл и консоль
2. **Промпты** - загрузка всех промптов для анализа
3. **FastVLM модель** - загрузка основной модели для анализа
4. **FashionCLIP** - загрузка модели для генерации embeddings
5. **Gemini API** - инициализация клиента Gemini
6. **Ollama API** - проверка доступности Ollama

---

## Использование

### Базовое использование

```python
from flask import Flask
from core import ServerInitializer

# Создаем Flask app
app = Flask(__name__)

# Создаем инициализатор
initializer = ServerInitializer(app)

# Настраиваем логирование
initializer.setup_logging()

# Инициализируем все компоненты
success = initializer.initialize_all()

if not success:
    print("Ошибка инициализации!")
    exit(1)

# Получаем состояние компонентов
state = initializer.get_state()

# Используем загруженные компоненты
model = state['model']
tokenizer = state['tokenizer']
prompts = state['prompts']
```

### Пошаговая инициализация

```python
# Создаем инициализатор
initializer = ServerInitializer(app)

# Настраиваем логирование
initializer.setup_logging()

# Загружаем только нужные компоненты
initializer.load_prompts()
initializer.load_model()
initializer.initialize_gemini()

# Получаем состояние
state = initializer.get_state()
```

---

## API

### `ServerInitializer(app)`

Конструктор класса.

**Параметры:**
- `app` (Flask) - экземпляр Flask приложения

**Пример:**
```python
from flask import Flask
from core import ServerInitializer

app = Flask(__name__)
initializer = ServerInitializer(app)
```

---

### `setup_logging()`

Настраивает логирование для сервера.

**Возвращает:** `None`

**Особенности:**
- Логи пишутся в `logs/fastvlm.log`
- Ротация файлов (10MB, 5 бэкапов)
- Консольный вывод для INFO уровня
- Файловый вывод для всех уровней

**Пример:**
```python
initializer.setup_logging()
```

---

### `load_prompts()`

Загружает все промпты для анализа из директории `prompt/`.

**Возвращает:** `bool` - успешность загрузки

**Загружаемые промпты:**
- `person` - описание человека
- `clothing` - описание верхней одежды
- `legs` - описание одежды на ногах
- `shoes` - описание обуви
- `accessories_head` - аксессуары на голове
- `accessories_hand` - аксессуары на руках
- `style` - стилевой анализ
- `class` - классификация одежды
- `default` - базовый промпт

**Пример:**
```python
success = initializer.load_prompts()
if success:
    prompts = initializer.prompts
    print(prompts['person'])
```

---

### `load_model()`

Загружает FastVLM модель для анализа изображений.

**Возвращает:** `bool` - успешность загрузки

**Особенности:**
- Автоматическая квантизация (4-bit/8-bit)
- GPU оптимизация
- Flash Attention поддержка
- Мониторинг использования памяти

**Пример:**
```python
success = initializer.load_model()
if success:
    model = initializer.model
    tokenizer = initializer.tokenizer
```

---

### `load_fashion_clip()`

Загружает FashionCLIP модель для генерации embeddings.

**Возвращает:** `bool` - успешность загрузки

**Особенности:**
- Использует `patrickjohncyh/fashion-clip`
- Fallback на `openai/clip-vit-base-patch32`
- GPU оптимизация

**Пример:**
```python
success = initializer.load_fashion_clip()
if success:
    fashion_clip = initializer.fashion_clip_model
```

---

### `initialize_gemini()`

Инициализирует Gemini API клиент.

**Возвращает:** `bool` - успешность инициализации

**Требования:**
- `FASTVLM_STYLIST_GEMINI_API_KEY` в .env
- Установлен пакет `google-genai`

**Пример:**
```python
success = initializer.initialize_gemini()
if success:
    gemini_client = initializer.gemini_client
```

---

### `check_ollama_availability()`

Проверяет доступность Ollama API.

**Возвращает:** `bool` - доступность Ollama

**Проверяет:**
- Доступность API на `http://127.0.0.1:11434`
- Наличие модели `gemma3:4b`

**Пример:**
```python
available = initializer.check_ollama_availability()
if available:
    print(f"Ollama доступен: {initializer.ollama_url}")
```

---

### `initialize_all()`

Инициализирует ВСЕ компоненты сервера.

**Возвращает:** `bool` - успешность полной инициализации

**Последовательность:**
1. Логирование (уже настроено)
2. Промпты
3. FastVLM модель
4. FashionCLIP
5. Gemini API
6. Ollama API

**Критические компоненты:**
- FastVLM модель (обязательна)

**Пример:**
```python
success = initializer.initialize_all()
if not success:
    print("Критическая ошибка инициализации!")
    exit(1)
```

---

### `get_state()`

Возвращает текущее состояние всех компонентов.

**Возвращает:** `dict` - словарь с состоянием

**Структура:**
```python
{
    'model': FastVLM модель,
    'tokenizer': Tokenizer,
    'image_processor': Image processor,
    'context_len': Длина контекста,
    'fashion_clip_model': FashionCLIP модель,
    'fashion_clip_processor': FashionCLIP processor,
    'gemini_client': Gemini клиент,
    'ollama_available': bool,
    'ollama_url': str,
    'ollama_model': str,
    'prompts': dict,
    'performance_stats': dict
}
```

**Пример:**
```python
state = initializer.get_state()
print(f"Модель загружена: {state['model'] is not None}")
print(f"Промптов загружено: {len(state['prompts'])}")
```

---

## Тестирование

Запустите тестовый скрипт:

```bash
python fastvlm-server/test_initialization.py
```

**Ожидаемый вывод:**
```
============================================================
ТЕСТ МОДУЛЯ ИНИЦИАЛИЗАЦИИ
============================================================

1. Тестируем загрузку промптов...
   Результат: ✓ Успешно
   Загружено промптов: 9

2. Тестируем инициализацию Gemini...
   Результат: ✓ Успешно

3. Тестируем проверку Ollama...
   Результат: ✓ Доступен

============================================================
ТЕСТ ЗАВЕРШЕН
============================================================

✅ Модуль инициализации работает корректно!
```

---

## Логирование

Все операции логируются в `logs/fastvlm.log`.

**Уровни логирования:**
- `DEBUG` - детальная информация
- `INFO` - общая информация
- `WARNING` - предупреждения
- `ERROR` - ошибки

**Пример логов:**
```
2024-11-05 10:00:00 - test_initialization - INFO - Промпты загружены успешно
2024-11-05 10:00:05 - test_initialization - INFO - FastVLM модель загружена успешно за 5.23с
2024-11-05 10:00:06 - test_initialization - INFO - Gemini API клиент инициализирован
```

---

## Производительность

### Время инициализации (примерно):

| Компонент | Время | Критичность |
|-----------|-------|-------------|
| Логирование | < 0.1с | ✓ Обязательно |
| Промпты | < 0.1с | ✓ Обязательно |
| FastVLM модель | 5-10с | ✓ Обязательно |
| FashionCLIP | 2-5с | Опционально |
| Gemini API | < 0.1с | Опционально |
| Ollama API | < 1с | Опционально |

**Общее время:** ~10-15 секунд

---

## Обработка ошибок

### Критические ошибки

Если FastVLM модель не загружена, `initialize_all()` вернет `False`.

```python
if not initializer.initialize_all():
    logger.error("Не удалось загрузить FastVLM модель!")
    sys.exit(1)
```

### Некритические ошибки

Если FashionCLIP, Gemini или Ollama недоступны, сервер продолжит работу.

```python
state = initializer.get_state()
if not state['gemini_client']:
    logger.warning("Gemini недоступен, используем только FastVLM")
```

---

## Интеграция с server.py

### До рефакторинга:

```python
# server.py (старая версия)
setup_logging()
load_prompts()
load_model()
load_fashion_clip()
initialize_gemini()
check_ollama_availability()
```

### После рефакторинга:

```python
# server.py (новая версия)
from core import ServerInitializer

initializer = ServerInitializer(app)
initializer.setup_logging()

if not initializer.initialize_all():
    sys.exit(1)

# Получаем состояние для использования в endpoints
state = initializer.get_state()
```

---

## Преимущества

✅ **Централизация** - вся инициализация в одном месте  
✅ **Переиспользование** - легко использовать в тестах  
✅ **Мониторинг** - детальное логирование всех этапов  
✅ **Гибкость** - можно инициализировать только нужные компоненты  
✅ **Тестируемость** - легко тестировать каждый компонент отдельно

---

## История изменений

### v1.0.0 (2024-11-05)
- ✅ Создан модуль `core/initialization.py`
- ✅ Класс `ServerInitializer` с полной инициализацией
- ✅ Вынесены функции из `server.py`:
  - `setup_logging()`
  - `load_prompts()`
  - `load_model()`
  - `load_fashion_clip()`
  - `initialize_gemini()`
  - `check_ollama_availability()`
- ✅ Добавлен метод `initialize_all()` для полной инициализации
- ✅ Добавлен метод `get_state()` для получения состояния
- ✅ Создана документация и тесты
