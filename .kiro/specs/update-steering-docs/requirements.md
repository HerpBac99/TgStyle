# Requirements Document - Обновление Steering документации

## Introduction

Необходимо создать структурированную систему steering файлов в директории `.kiro/steering/`, которая будет соответствовать текущему состоянию кодовой базы. Документация должна быть организована по принципу: flow функций для каждой вкладки главного меню + архитектура и API для каждого модуля + серверная документация.

## Glossary

- **Steering Files**: Файлы с инструкциями и контекстом для AI-ассистента, расположенные в `.kiro/steering/`
- **Flow Functions**: Последовательность вызовов методов при выполнении операций
- **Analysis Tab**: Вкладка анализа стиля (главный экран с каруселью)
- **Feed Tab**: Вкладка публичной ленты
- **Wardrobe Tab**: Вкладка гардероба
- **Capsules Tab**: Вкладка капсул (образов)
- **Module Architecture**: Описание структуры, классов и паттернов модуля
- **Module API**: Описание методов, endpoints и интеграций модуля
- **Server Documentation**: Описание серверной части приложения

## Requirements

### Requirement 1: Flow функций для вкладки Analysis

**User Story:** Как разработчик, я хочу видеть последовательность вызовов методов для вкладки анализа, чтобы понимать flow выполнения операций

#### Acceptance Criteria

1. WHEN разработчик открывает `analysis_func.md`, THE System SHALL отображать пронумерованную последовательность вызовов методов
2. WHEN разработчик проверяет метод, THE System SHALL указывать класс, файл и краткое описание для каждого метода
3. WHEN разработчик изучает flow, THE System SHALL описывать полный цикл от открытия вкладки до показа результата анализа
4. WHEN разработчик смотрит на взаимодействия, THE System SHALL показывать связи между UIManager, UIAnalysisManager, AnalysisManager и другими модулями

### Requirement 2: Flow функций для вкладки Feed

**User Story:** Как разработчик, я хочу видеть последовательность вызовов методов для публичной ленты, чтобы понимать flow загрузки и отображения контента

#### Acceptance Criteria

1. WHEN разработчик открывает `feed_func.md`, THE System SHALL отображать пронумерованную последовательность вызовов методов
2. WHEN разработчик проверяет метод, THE System SHALL указывать класс, файл и краткое описание для каждого метода
3. WHEN разработчик изучает flow, THE System SHALL описывать полный цикл от открытия вкладки до отображения ленты
4. WHEN разработчик смотрит на взаимодействия, THE System SHALL показывать связи между UIManager, PublicFeedManager, UIPublicFeed и PublicFeedService

### Requirement 3: Flow функций для вкладки Wardrobe

**User Story:** Как разработчик, я хочу видеть последовательность вызовов методов для гардероба, чтобы понимать flow добавления, редактирования и удаления вещей

#### Acceptance Criteria

1. WHEN разработчик открывает `wardrobe_func.md`, THE System SHALL отображать пронумерованную последовательность вызовов методов
2. WHEN разработчик проверяет метод, THE System SHALL указывать класс, файл и краткое описание для каждого метода
3. WHEN разработчик изучает flow, THE System SHALL описывать полные циклы: открытие гардероба, добавление вещи, редактирование, удаление
4. WHEN разработчик смотрит на взаимодействия, THE System SHALL показывать связи между UIManager, WardrobeManager, WardrobeService, PhotoProcessor и FastVLM

### Requirement 4: Flow функций для вкладки Capsules

**User Story:** Как разработчик, я хочу видеть последовательность вызовов методов для капсул, чтобы понимать flow создания и редактирования образов

#### Acceptance Criteria

1. WHEN разработчик открывает `capsules_func.md`, THE System SHALL отображать пронумерованную последовательность вызовов методов
2. WHEN разработчик проверяет метод, THE System SHALL указывать класс, файл и краткое описание для каждого метода
3. WHEN разработчик изучает flow, THE System SHALL описывать полные циклы: создание капсулы (selection → canvas → result) и редактирование (canvas → result)
4. WHEN разработчик смотрит на взаимодействия, THE System SHALL показывать связи между CapsulesManager, CapsuleFlowManager, CapsuleSelectionManager, CanvasStateManager и другими модулями

### Requirement 5: Архитектура модуля Analysis

**User Story:** Как разработчик, я хочу понимать архитектуру модуля анализа, чтобы правильно расширять функциональность

#### Acceptance Criteria

1. WHEN разработчик открывает `analysis-architecture.md`, THE System SHALL описывать структуру модуля, основные классы и их ответственности
2. WHEN разработчик проверяет паттерны, THE System SHALL показывать используемые архитектурные паттерны
3. WHEN разработчик изучает зависимости, THE System SHALL описывать связи с другими модулями
4. WHEN разработчик смотрит на оптимизацию, THE System SHALL показывать стратегии кэширования и производительности

### Requirement 6: API модуля Analysis

**User Story:** Как разработчик, я хочу знать API модуля анализа, чтобы правильно использовать его методы и endpoints

#### Acceptance Criteria

1. WHEN разработчик открывает `analysis-api.md`, THE System SHALL описывать все публичные методы классов модуля
2. WHEN разработчик проверяет endpoints, THE System SHALL показывать серверные API endpoints с параметрами и ответами
3. WHEN разработчик изучает интеграции, THE System SHALL описывать взаимодействие с FastVLM и другими сервисами
4. WHEN разработчик смотрит примеры, THE System SHALL предоставлять рабочие примеры кода

### Requirement 7: Архитектура модуля Feed

**User Story:** Как разработчик, я хочу понимать архитектуру публичной ленты, чтобы правильно работать с социальными функциями

#### Acceptance Criteria

1. WHEN разработчик открывает `feed-architecture.md`, THE System SHALL описывать структуру модуля, основные классы и их ответственности
2. WHEN разработчик проверяет паттерны, THE System SHALL показывать используемые архитектурные паттерны
3. WHEN разработчик изучает зависимости, THE System SHALL описывать связи с модулями лайков, комментариев и шеринга
4. WHEN разработчик смотрит на оптимизацию, THE System SHALL показывать стратегии пагинации и кэширования

### Requirement 8: API модуля Feed

**User Story:** Как разработчик, я хочу знать API публичной ленты, чтобы правильно загружать и отображать контент

#### Acceptance Criteria

1. WHEN разработчик открывает `feed-api.md`, THE System SHALL описывать все публичные методы классов модуля
2. WHEN разработчик проверяет endpoints, THE System SHALL показывать серверные API endpoints для ленты, лайков, комментариев
3. WHEN разработчик изучает интеграции, THE System SHALL описывать взаимодействие с модулями анализа и капсул
4. WHEN разработчик смотрит примеры, THE System SHALL предоставлять рабочие примеры кода

### Requirement 9: Архитектура модуля Wardrobe

**User Story:** Как разработчик, я хочу понимать архитектуру гардероба, чтобы правильно работать с вещами пользователя

#### Acceptance Criteria

1. WHEN разработчик открывает `wardrobe-architecture.md`, THE System SHALL описывать структуру модуля после актуальных изменений
2. WHEN разработчик проверяет паттерны, THE System SHALL показывать используемые архитектурные паттерны (Singleton, Observer)
3. WHEN разработчик изучает зависимости, THE System SHALL описывать связи с PhotoProcessor, FastVLM и CapsulesManager
4. WHEN разработчик смотрит на оптимизацию, THE System SHALL показывать оптимистичное создание и трехуровневое кэширование

### Requirement 10: API модуля Wardrobe

**User Story:** Как разработчик, я хочу знать API гардероба, чтобы правильно добавлять, редактировать и удалять вещи

#### Acceptance Criteria

1. WHEN разработчик открывает `wardrobe-api.md`, THE System SHALL описывать все публичные методы WardrobeManager и WardrobeService
2. WHEN разработчик проверяет endpoints, THE System SHALL показывать серверные API endpoints с параметрами и ответами
3. WHEN разработчик изучает интеграции, THE System SHALL описывать взаимодействие с FastVLM для классификации
4. WHEN разработчик смотрит примеры, THE System SHALL предоставлять рабочие примеры оптимистичного создания

### Requirement 11: Архитектура модуля Capsules

**User Story:** Как разработчик, я хочу понимать рефакторенную архитектуру капсул, чтобы правильно работать с образами

#### Acceptance Criteria

1. WHEN разработчик открывает `capsules-architecture.md`, THE System SHALL описывать структуру после рефакторинга с Dependency Injection
2. WHEN разработчик проверяет модули, THE System SHALL показывать все новые модули (CapsuleFlowManager, CapsuleSelectionManager, CanvasStateManager, ImageProcessingService, ModalService)
3. WHEN разработчик изучает паттерны, THE System SHALL описывать используемые паттерны (DI, Singleton, Observer, Strategy, Command)
4. WHEN разработчик смотрит на делегирование, THE System SHALL показывать как CapsulesManager делегирует задачи специализированным модулям

### Requirement 12: API модуля Capsules

**User Story:** Как разработчик, я хочу знать API капсул, чтобы правильно создавать и редактировать образы

#### Acceptance Criteria

1. WHEN разработчик открывает `capsules-api.md`, THE System SHALL описывать все публичные методы всех классов модуля
2. WHEN разработчик проверяет endpoints, THE System SHALL показывать серверные API endpoints для капсул
3. WHEN разработчик изучает интеграции, THE System SHALL описывать взаимодействие с WardrobeManager, ImageProcessingService и FastVLM
4. WHEN разработчик смотрит примеры, THE System SHALL предоставлять рабочие примеры создания и редактирования капсул

### Requirement 13: Серверная документация

**User Story:** Как разработчик, я хочу понимать серверную часть приложения, чтобы правильно работать с API и базой данных

#### Acceptance Criteria

1. WHEN разработчик открывает `server.md`, THE System SHALL описывать структуру серверной части (Express, Prisma, PostgreSQL)
2. WHEN разработчик проверяет endpoints, THE System SHALL показывать все API endpoints с параметрами, ответами и примерами
3. WHEN разработчик изучает базу данных, THE System SHALL описывать схему БД и основные модели (User, WardrobeItem, Capsule, HistoryItem)
4. WHEN разработчик смотрит на интеграции, THE System SHALL показывать взаимодействие с FastVLM сервисом и обработку изображений

### Requirement 14: Общие правила и структура проекта

**User Story:** Как разработчик, я хочу знать общие правила разработки и структуру проекта, чтобы писать код в едином стиле

#### Acceptance Criteria

1. WHEN разработчик открывает `rules.md`, THE System SHALL описывать актуальные правила разработки и code style
2. WHEN разработчик проверяет структуру, THE System SHALL показывать актуальную организацию директорий и файлов
3. WHEN разработчик изучает паттерны, THE System SHALL описывать общие паттерны кодирования используемые в проекте
4. WHEN разработчик смотрит на технологии, THE System SHALL показывать актуальный технологический стек
