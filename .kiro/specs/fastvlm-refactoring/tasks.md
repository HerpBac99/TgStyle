# Implementation Plan - FastVLM Server Refactoring

## Overview
Рефакторинг монолитного server.py в модульную архитектуру с четким разделением ответственности.

---

## Phase 1: Создание базовой структуры

- [ ] 1. Создать структуру директорий
  - Создать директории: core/, models/, services/, mappers/, routes/, utils/
  - Создать __init__.py файлы во всех директориях
  - _Requirements: 1.1, 1.2_

- [ ] 2. Создать модуль mappers
- [ ] 2.1 Создать mappers/color_mapper.py
  - Перенести функцию map_color_to_russian()
  - Перенести COLOR_MAP словарь
  - Добавить логирование для неизвестных цветов
  - _Requirements: 2.1, 2.6, 2.7_

- [ ] 2.2 Создать mappers/material_mapper.py
  - Перенести функцию map_material_to_russian()
  - Перенести MATERIAL_MAP словарь
  - Добавить логирование для неизвестных материалов
  - _Requirements: 2.2, 2.6, 2.7_

- [ ] 2.3 Создать mappers/style_mapper.py
  - Перенести функцию map_style_to_enum()
  - Перенести STYLE_MAP словарь
  - Добавить логирование для неизвестных стилей
  - _Requirements: 2.3, 2.6, 2.7_

- [ ] 2.4 Создать mappers/category_mapper.py
  - Перенести функцию validate_and_correct_category()
  - Перенести функцию detect_category_from_subtype()
  - Перенести функцию map_to_clothing_category()
  - Добавить логирование для коррекций категорий
  - _Requirements: 2.4, 2.6, 2.7_

- [ ] 2.5 Создать mappers/subtype_mapper.py
  - Перенести функцию map_subtype_to_russian()
  - Перенести SUBTYPE_MAP словарь (расширенный)
  - Добавить логирование для неизвестных подтипов
  - _Requirements: 2.5, 2.6, 2.7_

- [ ] 2.6 Создать mappers/__init__.py
  - Экспортировать все публичные функции маппинга
  - Добавить документацию модуля
  - _Requirements: 1.4, 2.1-2.5_

---

## Phase 2: Создание модулей моделей

- [ ] 3. Создать обертки для ML моделей
- [ ] 3.1 Создать models/fastvlm_model.py
  - Создать класс FastVLMModel
  - Реализовать метод load() для загрузки модели
  - Реализовать метод analyze() для inference
  - Реализовать метод cleanup() для очистки GPU памяти
  - Добавить context manager для GPU memory management
  - _Requirements: 5.1, 5.4, 5.5, 5.6_

- [ ] 3.2 Создать models/fashion_clip_model.py
  - Создать класс FashionCLIPModel
  - Реализовать метод load() для загрузки модели
  - Реализовать метод generate_embedding() для генерации векторов
  - Добавить fallback на стандартную CLIP модель
  - _Requirements: 5.2, 5.4, 5.5_

- [ ] 3.3 Создать models/background_remover_model.py
  - Создать класс BackgroundRemoverModel (тонкая обертка)
  - Импортировать BackgroundRemover из background_removal.py
  - Реализовать методы: load(), remove_background(), crop_to_content(), post_process_mask()
  - Делегировать все вызовы в оригинальный BackgroundRemover
  - Добавить логирование инициализации
  - _Requirements: 5.3, 5.4, 5.5_
  - _Note: background_removal.py остается на месте, не переносится_

- [ ] 3.4 Создать models/__init__.py
  - Экспортировать все классы моделей
  - Добавить документацию модуля
  - _Requirements: 1.4, 5.1-5.3_

---

## Phase 3: Создание сервисов

- [ ] 4. Создать AI-сервисы
- [ ] 4.1 Создать services/gemini_service.py
  - Создать класс GeminiService
  - Реализовать метод initialize() с проверкой API ключа
  - Реализовать метод create_stylist_response()
  - Реализовать метод analyze_image_direct()
  - Добавить обработку ошибок и логирование
  - _Requirements: 3.1, 3.3, 3.5, 3.6_

- [ ] 4.2 Создать services/ollama_service.py
  - Создать класс OllamaService
  - Реализовать метод check_availability()
  - Реализовать метод create_stylist_response()
  - Добавить обработку ошибок и логирование
  - _Requirements: 3.2, 3.4, 3.5, 3.6_

- [ ] 4.3 Создать services/analysis_service.py
  - Создать класс AnalysisService
  - Реализовать метод perform_multi_pass_analysis() (6 промптов)
  - Реализовать метод create_final_response() с fallback логикой
  - Интегрировать FastVLM, Gemini, Ollama сервисы
  - _Requirements: 3.5, 3.6_

- [ ] 4.4 Создать services/classification_service.py
  - Создать класс ClassificationService
  - Реализовать метод classify_clothing() (полный pipeline)
  - Реализовать метод _execute_classification_prompts() (6 промптов)
  - Интегрировать mappers для результатов
  - _Requirements: 3.5_

- [ ] 4.5 Создать services/capsule_service.py
  - Создать класс CapsuleService
  - Реализовать метод generate_capsules_with_gemini()
  - Реализовать метод generate_capsules_algorithmically() (mock)
  - Реализовать вспомогательные методы для генерации капсул
  - _Requirements: 3.5_

- [ ] 4.6 Создать services/embedding_service.py
  - Создать класс EmbeddingService
  - Реализовать метод generate_fashion_embedding()
  - Интегрировать FashionCLIP модель
  - _Requirements: 3.5_

- [ ] 4.7 Создать services/__init__.py
  - Экспортировать все классы сервисов
  - Добавить документацию модуля
  - _Requirements: 1.4, 3.1-3.6_

---

## Phase 4: Создание утилит

- [ ] 5. Создать модули утилит
- [ ] 5.1 Создать utils/prompt_loader.py
  - Создать класс PromptLoader
  - Реализовать метод load_prompt() с кэшированием
  - Реализовать метод load_all_classification_prompts()
  - Добавить обработку ошибок
  - _Requirements: 6.1, 6.5_

- [ ] 5.2 Создать utils/image_utils.py
  - Перенести функции обработки изображений
  - Создать функции для декодирования base64
  - Создать функции для конвертации форматов
  - _Requirements: 6.2, 6.5_

- [ ] 5.3 Создать utils/performance.py
  - Создать класс PerformanceTracker
  - Реализовать метод update_stats()
  - Реализовать метод get_stats()
  - Перенести глобальную переменную performance_stats
  - _Requirements: 6.3, 6.5_

- [ ] 5.4 Создать utils/validators.py
  - Создать функции валидации запросов
  - Создать функции валидации изображений
  - Добавить обработку ошибок валидации
  - _Requirements: 6.4, 6.5_

- [ ] 5.5 Создать utils/__init__.py
  - Экспортировать все утилиты
  - Добавить документацию модуля
  - _Requirements: 1.4, 6.1-6.4_

---

## Phase 5: Создание роутов (endpoints)

- [ ] 6. Создать модули роутов
- [ ] 6.1 Создать routes/health.py
  - Создать Blueprint 'health'
  - Перенести эндпоинт /health
  - Перенести эндпоинт /stats
  - Перенести эндпоинт /gpu
  - Перенести эндпоинт /model
  - Перенести эндпоинт /load
  - _Requirements: 4.1, 4.6, 8.1-8.4_

- [ ] 6.2 Создать routes/analysis.py
  - Создать Blueprint 'analysis'
  - Перенести эндпоинт /analyze (multi-pass + stylist)
  - Перенести эндпоинт /analyze_gemini (direct Gemini)
  - Перенести эндпоинт /analyze_for_test (только FastVLM)
  - Интегрировать AnalysisService
  - _Requirements: 4.2, 4.6, 8.1-8.4_

- [ ] 6.3 Создать routes/classification.py
  - Создать Blueprint 'classification'
  - Перенести эндпоинт /classify_clothing
  - Интегрировать ClassificationService
  - _Requirements: 4.3, 4.6, 8.1-8.4_

- [ ] 6.4 Создать routes/capsules.py
  - Создать Blueprint 'capsules'
  - Перенести эндпоинт /generate-capsules (Gemini)
  - Перенести эндпоинт /generate-capsules-mock (алгоритмический)
  - Интегрировать CapsuleService
  - _Requirements: 4.4, 4.6, 8.1-8.4_

- [ ] 6.5 Создать routes/utilities.py
  - Создать Blueprint 'utilities'
  - Перенести эндпоинт /embed-clothing
  - Перенести эндпоинт /remove-background
  - Перенести эндпоинт /simple_analyze
  - Интегрировать EmbeddingService
  - _Requirements: 4.5, 4.6, 8.1-8.4_

- [ ] 6.6 Создать routes/__init__.py
  - Экспортировать все blueprints
  - Добавить документацию модуля
  - _Requirements: 1.4, 4.1-4.5_

---

## Phase 6: Создание ядра приложения

- [ ] 7. Создать модули ядра
- [ ] 7.1 Создать core/logging_config.py
  - Перенести функцию setup_logging()
  - Создать функцию get_logger() для модулей
  - Настроить форматирование логов
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 7.2 Создать core/startup.py
  - Создать класс ServerStartup
  - Реализовать метод load_models()
  - Реализовать метод initialize_services()
  - Реализовать метод validate_config()
  - Интегрировать все модели и сервисы
  - _Requirements: 10.1, 10.4, 10.5_

- [ ] 7.3 Создать core/app.py
  - Создать функцию create_app() (Flask app factory)
  - Создать функцию register_blueprints()
  - Настроить Flask app
  - _Requirements: 1.3, 4.6_

- [ ] 7.4 Создать core/__init__.py
  - Экспортировать create_app
  - Экспортировать ServerStartup
  - Добавить документацию модуля
  - _Requirements: 1.4_

---

## Phase 7: Рефакторинг server.py

- [ ] 8. Упростить точку входа
- [ ] 8.1 Обновить server.py
  - Импортировать create_app из core.app
  - Импортировать ServerStartup из core.startup
  - Упростить main блок до ~50 строк
  - Удалить весь перенесенный код
  - _Requirements: 1.3, 8.1-8.4_

- [ ] 8.2 Обновить импорты
  - Обновить все импорты на новые модули
  - Проверить отсутствие циклических зависимостей
  - _Requirements: 8.1-8.4_

---

## Phase 8: Удаление мертвого кода

- [ ] 9. Аудит и очистка кода
- [ ] 9.1 Найти неиспользуемые функции
  - Проанализировать все функции в server.py
  - Найти функции без вызовов
  - Создать список для удаления
  - _Requirements: 7.1, 7.5_

- [ ] 9.2 Удалить закомментированный код
  - Найти все закомментированные блоки
  - Проверить их актуальность
  - Удалить устаревший код
  - _Requirements: 7.2_

- [ ] 9.3 Удалить дублирующиеся функции
  - Найти функции с похожей логикой
  - Объединить в одну функцию
  - Обновить все вызовы
  - _Requirements: 7.3_

- [ ] 9.4 Удалить устаревшие эндпоинты
  - Проверить использование всех эндпоинтов
  - Удалить неиспользуемые
  - Обновить документацию
  - _Requirements: 7.4_

---

## Phase 9: Тестирование и валидация

- [ ] 10. Проверка работоспособности
- [ ] 10.1 Запустить сервер
  - Проверить успешный запуск
  - Проверить загрузку всех моделей
  - Проверить инициализацию всех сервисов
  - _Requirements: 8.1-8.5_

- [ ] 10.2 Протестировать health endpoints
  - GET /health
  - GET /stats
  - GET /gpu
  - GET /model
  - _Requirements: 8.1-8.4_

- [ ] 10.3 Протестировать analysis endpoints
  - POST /analyze
  - POST /analyze_gemini
  - POST /analyze_for_test
  - _Requirements: 8.1-8.4_

- [ ] 10.4 Протестировать classification endpoint
  - POST /classify_clothing
  - Проверить маппинг результатов
  - _Requirements: 8.1-8.4_

- [ ] 10.5 Протестировать capsules endpoints
  - POST /generate-capsules
  - POST /generate-capsules-mock
  - _Requirements: 8.1-8.4_

- [ ] 10.6 Протестировать utilities endpoints
  - POST /embed-clothing
  - POST /remove-background
  - POST /simple_analyze
  - _Requirements: 8.1-8.4_

- [ ] 10.7 Проверить логирование
  - Проверить логи всех модулей
  - Проверить уровни логирования
  - Проверить форматирование
  - _Requirements: 9.1-9.5_

- [ ] 10.8 Проверить производительность
  - Сравнить время ответа до и после рефакторинга
  - Проверить использование памяти
  - Проверить использование GPU
  - _Requirements: 8.1-8.5_

---

## Phase 10: Документация и финализация

- [ ] 11. Обновить документацию
- [ ] 11.1 Создать README для новой структуры
  - Описать архитектуру
  - Описать каждый модуль
  - Добавить примеры использования
  - _Requirements: 1.1-1.4_

- [ ] 11.2 Добавить docstrings
  - Добавить docstrings ко всем классам
  - Добавить docstrings ко всем публичным методам
  - Добавить примеры использования
  - _Requirements: 1.4_

- [ ] 11.3 Обновить конфигурацию
  - Проверить все параметры в config.py
  - Удалить неиспользуемые параметры
  - Добавить новые параметры если нужно
  - _Requirements: 10.1-10.5_

---

## Notes

- Каждая задача должна быть выполнена последовательно
- После каждой фазы необходимо тестирование
- Сохранять обратную совместимость API на всех этапах
- Логировать все изменения и проблемы
- Создавать git commits после каждой завершенной задачи
