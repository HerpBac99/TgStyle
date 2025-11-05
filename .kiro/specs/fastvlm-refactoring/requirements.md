# Рефакторинг FastVLM Server - Требования

## Введение

Рефакторинг монолитного `server.py` (~1800 строк) в модульную архитектуру для улучшения поддерживаемости, тестируемости и масштабируемости FastVLM сервиса.

## Глоссарий

- **FastVLM Server**: Python Flask сервер для AI-анализа изображений одежды
- **Mapper**: Модуль для маппинга значений между языками/форматами
- **Service**: Бизнес-логика для конкретной функциональности
- **Route**: Flask endpoint handler
- **Model Wrapper**: Обертка для ML модели с единым интерфейсом

## Требования

### Requirement 1: Модульная структура проекта

**User Story:** Как разработчик, я хочу иметь четкую модульную структуру, чтобы легко находить и изменять код

#### Acceptance Criteria

1. THE FastVLM Server SHALL организовать код в следующие модули: core, models, services, mappers, routes, utils
2. WHEN разработчик ищет функциональность, THE FastVLM Server SHALL предоставить логическую группировку по назначению
3. THE FastVLM Server SHALL иметь точку входа server.py размером не более 100 строк
4. THE FastVLM Server SHALL использовать __init__.py для экспорта публичных интерфейсов каждого модуля

### Requirement 2: Изоляция маппинг-функций

**User Story:** Как разработчик, я хочу иметь все функции маппинга в отдельных модулях, чтобы легко их поддерживать и расширять

#### Acceptance Criteria

1. THE FastVLM Server SHALL создать модуль mappers/color_mapper.py для маппинга цветов (EN→RU)
2. THE FastVLM Server SHALL создать модуль mappers/material_mapper.py для маппинга материалов
3. THE FastVLM Server SHALL создать модуль mappers/style_mapper.py для маппинга стилей
4. THE FastVLM Server SHALL создать модуль mappers/category_mapper.py для валидации и маппинга категорий
5. THE FastVLM Server SHALL создать модуль mappers/subtype_mapper.py для маппинга подтипов одежды
6. WHEN маппер вызывается, THE FastVLM Server SHALL возвращать нормализованное значение на русском языке
7. THE FastVLM Server SHALL логировать предупреждения для неизвестных значений

### Requirement 3: Изоляция AI-сервисов

**User Story:** Как разработчик, я хочу иметь изолированные модули для работы с Gemini и Ollama, чтобы легко переключаться между провайдерами

#### Acceptance Criteria

1. THE FastVLM Server SHALL создать модуль services/gemini_service.py для работы с Gemini API
2. THE FastVLM Server SHALL создать модуль services/ollama_service.py для работы с Ollama API
3. WHEN Gemini сервис инициализируется, THE FastVLM Server SHALL проверить наличие API ключа
4. WHEN Ollama сервис инициализируется, THE FastVLM Server SHALL проверить доступность Ollama API
5. THE FastVLM Server SHALL предоставить единый интерфейс для создания стилистических ответов
6. THE FastVLM Server SHALL поддерживать fallback между провайдерами при недоступности

### Requirement 4: Разделение эндпоинтов по модулям

**User Story:** Как разработчик, я хочу иметь эндпоинты, сгруппированные по функциональности, чтобы легко находить и изменять API

#### Acceptance Criteria

1. THE FastVLM Server SHALL создать модуль routes/health.py для health check эндпоинтов
2. THE FastVLM Server SHALL создать модуль routes/analysis.py для эндпоинтов анализа стиля
3. THE FastVLM Server SHALL создать модуль routes/classification.py для эндпоинтов классификации одежды
4. THE FastVLM Server SHALL создать модуль routes/capsules.py для эндпоинтов генерации капсул
5. THE FastVLM Server SHALL создать модуль routes/utilities.py для вспомогательных эндпоинтов
6. WHEN Flask app инициализируется, THE FastVLM Server SHALL регистрировать все blueprints

### Requirement 5: Обертки для ML моделей

**User Story:** Как разработчик, я хочу иметь единый интерфейс для работы с ML моделями, чтобы легко их заменять и тестировать

#### Acceptance Criteria

1. THE FastVLM Server SHALL создать модуль models/fastvlm_model.py для FastVLM модели
2. THE FastVLM Server SHALL создать модуль models/fashion_clip_model.py для FashionCLIP модели
3. THE FastVLM Server SHALL создать модуль models/background_remover.py для Background Remover
4. WHEN модель загружается, THE FastVLM Server SHALL логировать время загрузки и использование памяти
5. THE FastVLM Server SHALL предоставить методы для inference с единым интерфейсом
6. THE FastVLM Server SHALL управлять GPU памятью через context managers

### Requirement 6: Утилиты и хелперы

**User Story:** Как разработчик, я хочу иметь переиспользуемые утилиты в отдельных модулях, чтобы избежать дублирования кода

#### Acceptance Criteria

1. THE FastVLM Server SHALL создать модуль utils/prompt_loader.py для загрузки промптов из файлов
2. THE FastVLM Server SHALL создать модуль utils/image_utils.py для обработки изображений
3. THE FastVLM Server SHALL создать модуль utils/performance.py для трекинга производительности
4. THE FastVLM Server SHALL создать модуль utils/validators.py для валидации запросов
5. WHEN утилита вызывается, THE FastVLM Server SHALL обрабатывать ошибки gracefully

### Requirement 7: Удаление мертвого кода

**User Story:** Как разработчик, я хочу удалить неиспользуемый код, чтобы упростить поддержку проекта

#### Acceptance Criteria

1. THE FastVLM Server SHALL удалить неиспользуемые функции и переменные
2. THE FastVLM Server SHALL удалить закомментированный код
3. THE FastVLM Server SHALL удалить дублирующиеся функции
4. THE FastVLM Server SHALL удалить устаревшие эндпоинты
5. WHEN код удаляется, THE FastVLM Server SHALL проверить отсутствие зависимостей

### Requirement 8: Обратная совместимость API

**User Story:** Как клиент API, я хочу чтобы все существующие эндпоинты продолжали работать после рефакторинга

#### Acceptance Criteria

1. THE FastVLM Server SHALL сохранить все существующие URL эндпоинтов
2. THE FastVLM Server SHALL сохранить формат запросов и ответов
3. THE FastVLM Server SHALL сохранить коды ошибок и сообщения
4. WHEN клиент отправляет запрос, THE FastVLM Server SHALL возвращать тот же формат ответа
5. THE FastVLM Server SHALL пройти все существующие тесты без изменений

### Requirement 9: Улучшенное логирование

**User Story:** Как DevOps инженер, я хочу иметь структурированное логирование, чтобы легко отслеживать проблемы

#### Acceptance Criteria

1. THE FastVLM Server SHALL создать модуль core/logging_config.py для настройки логирования
2. WHEN модуль инициализируется, THE FastVLM Server SHALL логировать имя модуля
3. THE FastVLM Server SHALL использовать разные уровни логирования (DEBUG, INFO, WARNING, ERROR)
4. THE FastVLM Server SHALL логировать время выполнения критических операций
5. THE FastVLM Server SHALL логировать ошибки с полным traceback

### Requirement 10: Конфигурация и константы

**User Story:** Как разработчик, я хочу иметь централизованную конфигурацию, чтобы легко изменять параметры

#### Acceptance Criteria

1. THE FastVLM Server SHALL использовать существующий config.py для всех настроек
2. THE FastVLM Server SHALL избегать hardcoded значений в коде
3. WHEN параметр изменяется, THE FastVLM Server SHALL применить изменение без изменения кода
4. THE FastVLM Server SHALL валидировать конфигурацию при старте
5. THE FastVLM Server SHALL логировать используемую конфигурацию при старте
