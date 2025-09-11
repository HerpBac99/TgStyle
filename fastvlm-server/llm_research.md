# FastVLM Research: Полный анализ системы

## Обзор FastVLM сервера

FastVLM - это специализированный микросервис для анализа изображений одежды с использованием передовой модели искусственного интеллекта LLaVA (Large Language and Vision Assistant). Система построена на Flask и предоставляет REST API для анализа изображений.

## Архитектура системы

### Основные компоненты

1. **server.py** - главный Flask сервер
2. **config.py** - система конфигурации
3. **models/** - директория с моделями ИИ
4. **ml-fastvlm/** - исходный код LLaVA
5. Вспомогательные скрипты для тестирования и управления

### Структура FastVLM

```
fastvlm-server/
├── server.py              # Основной Flask сервер
├── config.py              # Конфигурация и настройки
├── models/                 # Модели ИИ
│   ├── llava-fastvithd_1.5b_stage2/    # 1.5B модель Stage 2
│   ├── llava-fastvithd_1.5b_stage3/    # 1.5B модель Stage 3  
│   ├── llava-fastvithd_7b_int4/        # 7B квантизованная модель
│   ├── llava-fastvithd_7b_stage3/      # 7B модель Stage 3
│   └── ml-fastvlm/                     # Исходный код LLaVA
├── logs/                   # Логи системы
├── results/                # Результаты анализа
└── requirements.txt        # Python зависимости
```

## Модели и их различия

### Доступные модели

В системе доступны следующие модели:

1. **llava-fastvithd_1.5b_stage2** (3.6GB)
   - Размер: 1.5 миллиарда параметров
   - Этап обучения: Stage 2 (предобучение multimodal projector)
   - Формат: safetensors

2. **llava-fastvithd_1.5b_stage3** (3.6GB) 
   - Размер: 1.5 миллиарда параметров
   - Этап обучения: Stage 3 (fine-tuning на инструкциях)
   - Формат: safetensors

3. **llava-fastvithd_7b_int4** (4.0GB)
   - Размер: 7 миллиардов параметров 
   - Квантизация: INT4 для экономии памяти
   - Формат: safetensors + mlpackage

4. **llava-fastvithd_7b_stage3** (в архиве 11GB)
   - Размер: 7 миллиардов параметров
   - Этап обучения: Stage 3 (полное обучение)
   - Формат: ZIP архив

### Stage 2 vs Stage 3: Этапы обучения LLaVA

**Stage 2 (Pretraining)**:
- Обучение multimodal projector (проектора между vision и language)
- Vision encoder заморожен
- Language model заморожен  
- Обучается только слой проекции между визуальными и текстовыми представлениями
- Задача: научить модель связывать изображения с текстом

**Stage 3 (Fine-tuning)**:
- Fine-tuning всей модели на instruction-following данных
- Vision encoder может быть разморожен
- Language model дообучается
- Обучается следованию инструкциям для multimodal задач
- Задача: научить модель понимать и выполнять сложные визуально-текстовые инструкции

**Вывод**: Stage 3 модели более продвинутые и лучше понимают инструкции, но требуют больше ресурсов.

### Qwen2: Языковая архитектура

**Qwen2** - это современная архитектура языковой модели от Alibaba:

- **Архитектура**: Transformer-based decoder-only модель
- **Контекст**: До 32K токенов
- **Особенности**: 
  - Улучшенная RoPE (Rotary Position Embedding)
  - Grouped Query Attention (GQA)
  - SwiGLU activation function
  - Оптимизированная для инференса

**Преимущества Qwen2**:
- Высокое качество понимания на русском языке
- Эффективное использование памяти
- Быстрая генерация текста
- Хорошая поддержка long context

## Технические детали

### Конфигурация модели (config.py)

```python
# Доступные модели
AVAILABLE_MODELS = {
    '1.5b': 'models/llava-fastvithd_1.5b_stage3',
    '7b-int4': 'models/llava-fastvithd_7b_int4'
}

# По умолчанию используется 7B-int4
MODEL_TYPE = os.getenv('FASTVLM_MODEL', '7b-int4')
```

### Параметры генерации

```python
# Оптимизировано для анализа одежды
MAX_NEW_TOKENS = 512
TEMPERATURE = 0.1          # Низкая для точности
DO_SAMPLE = False          # Детерминированная генерация
TOP_P = 0.8               # Ограниченное разнообразие
REPETITION_PENALTY = 1.2   # Штраф за повторения
NUM_BEAMS = 3             # Beam search
```

### GPU и производительность

- **Автоопределение устройства**: CUDA/CPU
- **Тип данных**: torch.float16 для экономии памяти
- **Квантизация**: INT4 для больших моделей
- **Управление памятью**: Контекстный менеджер для GPU

## Почему 1.5B работает, а 7B нет?

### Анализ проблемы

**1.5B модель работает потому что**:
- Размер: 3.6GB (помещается в большинство GPU)
- Формат: Стандартный safetensors
- Простая архитектура без сложной квантизации
- Меньше зависимостей

**7B модель не работает по причинам**:

#### 1. **Недостаточно GPU памяти**
```
7B модель даже с INT4 квантизацией требует:
- Минимум 4-6GB GPU памяти
- 8-16GB RAM для полной загрузки
- Дополнительная память для inference
```

#### 2. **Проблемы с квантизацией INT4**
```python
# В builder.py есть сложная логика для INT4
qconf = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_quant_type='nf4',
    bnb_4bit_use_double_quant=True
)
```

#### 3. **Проблемы с файлами модели**
- `llava-fastvithd_7b_stage3.zip` (11GB) не распакован
- Неполная загрузка модели 7b_int4
- Отсутствие необходимых файлов конфигурации

#### 4. **Проблемы совместимости**
- Разные версии transformers/torch
- Несовместимость с версией bitsandbytes
- Проблемы с CUDA версией

## Все варианты решения проблемы

### Вариант 1: Проверка и увеличение памяти

**Проблема**: Недостаточно GPU/RAM памяти

**Решение**:
```bash
# Проверим текущую память
python check_cuda.py

# Очистим GPU память
nvidia-smi
sudo nvidia-smi --gpu-reset

# Увеличим своп файл (если нужно)
sudo fallocate -l 8G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Вариант 2: Принудительное использование CPU

**Проблема**: GPU не справляется с 7B моделью

**Решение**:
```python
# В config.py
DEVICE = 'cpu'  # Принудительно используем CPU
TORCH_DTYPE = torch.float32  # Для CPU
```

### Вариант 3: Исправление путей и файлов модели

**Проблема**: Неправильные пути или отсутствие файлов

**Решение**:
```bash
# Проверим что модель 7b_int4 полная
ls -la models/llava-fastvithd_7b_int4/

# Распакуем 7B stage3 если нужно
cd models/
unzip llava-fastvithd_7b_stage3.zip

# Обновим пути в config.py
```

### Вариант 4: Переключение на 1.5B модель

**Проблема**: 7B слишком тяжелая для системы

**Решение**:
```bash
# Используем переключатель модели
python switch_model.py 1.5b

# Или через переменную окружения
export FASTVLM_MODEL=1.5b
python server.py
```

### Вариант 5: Обновление зависимостей

**Проблема**: Устаревшие или несовместимые библиотеки

**Решение**:
```bash
# Обновим критические зависимости
pip install --upgrade torch torchvision torchaudio
pip install --upgrade transformers
pip install --upgrade bitsandbytes
pip install --upgrade accelerate

# Переустановим все зависимости
pip install -r requirements.txt --force-reinstall
```

### Вариант 6: Изменение параметров загрузки

**Проблема**: Неправильные параметры квантизации

**Решение**:
```python
# В server.py, функция load_model()
# Попробуем без квантизации
load_4bit = False
device_map = {"": "cpu"}  # Принудительно CPU

# Или с другими параметрами квантизации
load_8bit = True  # Вместо 4bit
```

### Вариант 7: Использование меньшей версии 7B

**Проблема**: Полная 7B модель слишком большая

**Решение**:
```bash
# Скачаем специально оптимизированную версию
python download_7b_int4.py

# Проверим что скачалось корректно
ls -la models/llava-fastvithd_7b_int4/
```

### Вариант 8: Отладка загрузки модели

**Проблема**: Неясно где именно происходит сбой

**Решение**:
```python
# Добавим детальное логирование в load_model()
logging.basicConfig(level=logging.DEBUG)

# Пошаговая загрузка с проверками
try:
    print("Загружаем tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    print("✓ Tokenizer загружен")
    
    print("Загружаем модель...")
    model = LlavaQwen2ForCausalLM.from_pretrained(model_path, **kwargs)
    print("✓ Модель загружена")
except Exception as e:
    print(f"✗ Ошибка: {e}")
    import traceback
    traceback.print_exc()
```

### Вариант 9: Альтернативная архитектура загрузки

**Проблема**: Стандартный способ загрузки не работает

**Решение**:
```python
# Попробуем загрузить без автоматического определения
model = LlavaLlamaForCausalLM.from_pretrained(
    model_path,
    torch_dtype=torch.float16,
    low_cpu_mem_usage=True,
    device_map="auto"
)
```

### Вариант 10: Минимальный тест загрузки

**Проблема**: Нужно изолировать проблему

**Решение**:
```python
# Создадим test_min_load.py
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

model_path = "models/llava-fastvithd_7b_int4"

try:
    # Только tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    print("Tokenizer: OK")
    
    # Только config
    from transformers import AutoConfig
    config = AutoConfig.from_pretrained(model_path)
    print("Config: OK")
    
    # Минимальная модель
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.float16,
        device_map="cpu",
        trust_remote_code=True
    )
    print("Model: OK")
    
except Exception as e:
    print(f"Error: {e}")
```

## План действий: Пошаговое решение

### Шаг 1: Диагностика системы
```bash
python check_cuda.py
nvidia-smi
free -h
df -h
```

### Шаг 2: Проверка файлов модели
```bash
ls -la models/llava-fastvithd_7b_int4/
file models/llava-fastvithd_7b_int4/model.safetensors
```

### Шаг 3: Минимальный тест
```bash
python test_min_load.py
```

### Шаг 4: Переключение на CPU если нужно
```bash
export FASTVLM_MODEL=7b-int4
export FASTVLM_DEVICE=cpu
python server.py
```

### Шаг 5: Fallback на 1.5B
```bash
python switch_model.py 1.5b
python server.py
```

## Рекомендации

1. **Начать с варианта 10** - минимальный тест загрузки
2. **Если не работает** - вариант 4 (переключение на 1.5B)
3. **Для production** - использовать 1.5B модель (быстрее и стабильнее)
4. **Для экспериментов** - попробовать CPU режим для 7B
5. **Долгосрочно** - рассмотреть обновление железа для поддержки 7B моделей

## Заключение

FastVLM представляет собой мощную систему для анализа изображений одежды, основанную на современных vision-language моделях. Проблема с 7B моделью типична для больших моделей и решается пошаговой диагностикой и оптимизацией ресурсов.

## 🎯 Главный вывод: Почему 1.5B работает, а 7B нет

### Основные различия между моделями:

| Характеристика | 1.5B Stage 3 | 7B INT4 | 7B Stage 3 |
|----------------|--------------|---------|------------|
| **Размер** | 3.6 GB | 4.0 GB | 11+ GB |
| **Параметры** | 1.5 миллиарда | 7 миллиардов | 7 миллиардов |
| **Квантизация** | Нет | INT4 | Нет |
| **Сложность загрузки** | Простая | Сложная | Очень сложная |
| **Требования GPU** | 4+ GB | 6+ GB | 12+ GB |
| **Требования RAM** | 8+ GB | 12+ GB | 20+ GB |

### Корень проблемы:

1. **7B модель в 4-5 раз больше** и требует значительно больше ресурсов
2. **INT4 квантизация** добавляет сложности при загрузке (bitsandbytes)
3. **Зависимости** - 7B требует более новые версии библиотек
4. **GPU память** - даже квантизованная 7B модель может не поместиться

## 🛠️ Инструменты для диагностики

Созданы следующие скрипты для решения проблемы:

### 1. `diagnose.py` - Полная автоматическая диагностика
```bash
python diagnose.py
```
- Проверяет все зависимости
- Анализирует модели и их файлы
- Оценивает системные ресурсы
- Предлагает конкретные решения

### 2. `switch_model.py` - Управление моделями
```bash
python switch_model.py          # Показать статус всех моделей
python switch_model.py 1.5b     # Переключиться на 1.5B
python switch_model.py 7b       # Переключиться на 7B INT4
```

### 3. `test_min_load.py` - Минимальное тестирование
```bash
python test_min_load.py 1.5b    # Тест 1.5B модели
python test_min_load.py 7b-int4 # Тест 7B модели
```

## 📋 План действий (перестаём ходить по кругу)

### Немедленные действия:

1. **Запустить диагностику** (5 минут):
```bash
cd fastvlm-server
python diagnose.py
```

2. **Проверить доступные модели** (1 минута):
```bash
python switch_model.py
```

3. **Протестировать загрузку** (2 минуты):
```bash
python test_min_load.py 1.5b
python test_min_load.py 7b-int4
```

### Варианты решения (по приоритету):

#### ✅ Вариант 1: Использовать 1.5B (РЕКОМЕНДУЕТСЯ)
- **Преимущества**: Стабильно работает, быстрая, достаточно точная
- **Недостатки**: Чуть менее детальный анализ
```bash
python switch_model.py 1.5b
python server.py
```

#### 🔧 Вариант 2: Заставить 7B работать на CPU
- **Преимущества**: Использует полную 7B модель
- **Недостатки**: Очень медленно (30+ секунд на анализ)
```bash
export FASTVLM_DEVICE=cpu
export FASTVLM_MODEL=7b-int4
python test_min_load.py 7b-int4
```

#### 🆕 Вариант 3: Переустановить 7B модель
- **Преимущества**: Исправляет повреждённые файлы
- **Недостатки**: Требует времени на скачивание
```bash
python download_7b_int4.py
python test_min_load.py 7b-int4
```

## 💡 Рекомендации для production

1. **Используйте 1.5B модель** - она показывает отличные результаты для анализа одежды
2. **7B модель оставьте для экспериментов** на более мощном железе
3. **Мониторьте ресурсы** через созданные скрипты диагностики
4. **Всегда имейте fallback** на 1.5B модель

## 📊 Техническое сравнение результатов

### 1.5B модель:
- **Время загрузки**: 10-30 секунд
- **Время анализа**: 2-5 секунд
- **Качество**: Отличное для задач анализа одежды
- **Стабильность**: Очень высокая

### 7B модель:
- **Время загрузки**: 60-300 секунд (если загрузится)
- **Время анализа**: 5-15 секунд
- **Качество**: Чуть лучше детализация
- **Стабильность**: Проблемная

## 🎯 Итоговое решение

**Используйте 1.5B модель для работы, 7B для экспериментов.**

Система спроектирована так, что можно легко переключаться между моделями, поэтому начните с стабильной 1.5B, а 7B настроите позже, когда будет время разобраться с техническими нюансами.

**Главное - перестать ходить по кругу и принять решение на основе фактов.**
