# Design Document - Обновление Steering документации

## Overview

Создание структурированной системы steering документации, организованной по принципу разделения ответственности: flow функций для UI, архитектура для структуры модулей, API для интеграций, и серверная документация.

## Architecture

### Структура файлов

```
.kiro/steering/
├── Flow функций (UI операции)
│   ├── analysis_func.md      # Вкладка анализа стиля
│   ├── feed_func.md           # Вкладка публичной ленты
│   ├── wardrobe_func.md       # Вкладка гардероба
│   └── capsules_func.md       # Вкладка капсул
│
├── Архитектура модулей
│   ├── analysis-architecture.md
│   ├── feed-architecture.md
│   ├── wardrobe-architecture.md
│   └── capsules-architecture.md
│
├── API модулей
│   ├── analysis-api.md
│   ├── feed-api.md
│   ├── wardrobe-api.md
│   └── capsules-api.md
│
├── Серверная документация
│   └── server.md              # Express API, Prisma, PostgreSQL, FastVLM
│
└── Общие файлы
    ├── rules.md               # Правила разработки и структура
    ├── tech.md                # Технологический стек
    ├── product.md             # Описание продукта
    └── patterns.md            # Общие паттерны кодирования
```

### Принципы организации

1. **Разделение по типу информации**
   - Flow функций - последовательность вызовов методов
   - Архитектура - структура, классы, паттерны
   - API - методы, endpoints, интеграции

2. **Единообразное именование**
   - Flow: `{module}_func.md`
   - Архитектура: `{module}-architecture.md`
   - API: `{module}-api.md`

3. **Актуальность**
   - Все данные соответствуют текущему коду
   - Указаны актуальные файлы и строки кода
   - Примеры работают без изменений

## Components and Interfaces

### 1. Flow функций (analysis_func.md, feed_func.md, wardrobe_func.md, capsules_func.md)

**Формат:**
```markdown
# {Module} - Ключевые функции

## Последовательность выполнения методов

### 1. Название операции
- **Класс**: `ClassName` (fileName.ts)
- **Метод**: `methodName()`
- **Описание**: Краткое описание что делает метод

### 2. Следующая операция
...
```

**Содержание:**
- Пронумерованная последовательность вызовов
- Класс и файл для каждого метода
- Краткое описание операции
- Связи между методами

**Примеры flow:**
- Analysis: Открытие вкладки → Захват фото → Выбор темы → Анализ → Показ результата
- Feed: Открытие вкладки → Загрузка ленты → Отображение карточек → Лайки/комментарии
- Wardrobe: Открытие → Загрузка из кэша → Добавление вещи → Классификация → Сохранение
- Capsules: Открытие → Создание (selection → canvas → result) → Сохранение

### 2. Архитектура модулей (*-architecture.md)

**Формат:**
```markdown
# Архитектура модуля {Module}

## Обзор
Краткое описание назначения модуля

## Основные компоненты
Список классов с их ответственностями

## Архитектурные паттерны
Используемые паттерны проектирования

## Интеграции
Связи с другими модулями

## Производительность
Оптимизации и метрики
```

**Содержание для каждого модуля:**

**Analysis:**
- UIAnalysisManager - координатор UI
- AnalysisManager - бизнес-логика
- AnalysisLikesService - лайки анализов
- SharingService - шеринг результатов
- Интеграция с FastVLM для AI анализа

**Feed:**
- PublicFeedManager - координатор
- UIPublicFeed - отображение ленты
- PublicFeedService - API запросы
- Пагинация и infinite scroll
- Интеграция с лайками и комментариями

**Wardrobe:**
- WardrobeManager - координатор UI
- WardrobeService - бизнес-логика
- PhotoProcessor - обработка фото
- Оптимистичное создание
- Трехуровневое кэширование
- Интеграция с FastVLM для классификации

**Capsules (рефакторенный):**
- CapsulesManager - главный координатор
- CapsuleFlowManager - управление flow
- CapsuleSelectionManager - выбор вещей
- CanvasStateManager - состояние canvas
- ImageProcessingService - обработка изображений
- ModalService - модальные окна
- Dependency Injection паттерн
- Singleton для UICanvasEditor

### 3. API модулей (*-api.md)

**Формат:**
```markdown
# API модуля {Module}

## Клиентские методы
Публичные методы классов

## Серверные endpoints
API endpoints с параметрами и ответами

## Интеграции
Взаимодействие с другими сервисами

## Примеры использования
Рабочие примеры кода
```

**Содержание для каждого модуля:**

**Analysis API:**
- `analyzeImage(imageBase64, theme)` - анализ стиля
- `POST /api/analyze` - серверный endpoint
- Интеграция с FastVLM
- Примеры вызовов

**Feed API:**
- `loadFeed(page, limit)` - загрузка ленты
- `likeItem(itemId)` - лайк элемента
- `GET /api/public-feed` - серверный endpoint
- `POST /api/like` - лайк endpoint
- Примеры пагинации

**Wardrobe API:**
- `loadWardrobe()` - загрузка вещей
- `addItem(imageBase64, classification)` - добавление вещи
- `updateItem(itemId, updates)` - обновление
- `deleteItem(itemId)` - удаление
- `GET /api/wardrobe` - получение вещей
- `POST /api/wardrobe` - создание вещи
- `PUT /api/wardrobe/:id` - обновление
- `DELETE /api/wardrobe/:id` - удаление
- Примеры оптимистичного создания

**Capsules API:**
- `loadCapsules()` - загрузка капсул
- `createCapsule(data)` - создание капсулы
- `updateCapsule(id, data)` - обновление
- `deleteCapsule(id)` - удаление
- `GET /api/capsules` - получение капсул
- `POST /api/capsules` - создание
- `PUT /api/capsules/:id` - обновление
- `DELETE /api/capsules/:id` - удаление
- Flow методы (startNewCapsule, editCapsule, moveToCanvas, etc.)
- Примеры создания и редактирования

### 4. Серверная документация (server.md)

**Формат:**
```markdown
# Серверная документация

## Архитектура сервера
Express, Prisma, PostgreSQL

## API Endpoints
Все endpoints с параметрами и ответами

## База данных
Схема БД и модели

## Интеграции
FastVLM, обработка изображений

## Обработка ошибок
Стратегии обработки ошибок

## Производительность
Оптимизации и кэширование
```

**Содержание:**

**Структура:**
```
server/
├── server.js              # Главный файл
├── src/
│   ├── api/              # API роуты
│   │   ├── auth.js
│   │   ├── analyze.js
│   │   ├── wardrobe.js
│   │   ├── capsules.js
│   │   ├── publicFeed.js
│   │   └── ...
│   ├── controllers/      # Бизнес-логика
│   ├── lib/             # Prisma client
│   └── utils/           # Утилиты
└── uploads/             # Загруженные файлы
```

**API Endpoints:**
- Authentication: `POST /api/auth`
- Analysis: `POST /api/analyze`
- Wardrobe: `GET/POST/PUT/DELETE /api/wardrobe`
- Capsules: `GET/POST/PUT/DELETE /api/capsules`
- Public Feed: `GET /api/public-feed`
- Background Removal: `POST /api/background-removal`
- Classification: `POST /api/classify-clothing`

**База данных (Prisma):**
```prisma
model User {
  id            Int      @id @default(autoincrement())
  telegramId    BigInt   @unique
  username      String?
  // ...
}

model WardrobeItem {
  id          Int      @id @default(autoincrement())
  userId      Int
  imageUrl    String
  category    String
  color       String
  // ...
}

model Capsule {
  id            Int      @id @default(autoincrement())
  userId        Int
  name          String
  canvasData    Json
  thumbnailUrl  String
  // ...
}

model HistoryItem {
  id          Int      @id @default(autoincrement())
  userId      Int
  imageUrl    String
  analysisText String
  // ...
}
```

**FastVLM интеграция:**
- `POST http://127.0.0.1:3001/analyze` - анализ стиля
- `POST http://127.0.0.1:3001/classify-clothing` - классификация одежды
- `POST http://127.0.0.1:3001/background-removal` - удаление фона

**Обработка изображений (Sharp):**
- Оптимизация размера и качества
- Проверка hasAlpha для выбора формата (PNG/JPEG)
- Сохранение в `server/uploads/{module}/{telegramId}/`

### 5. Общие файлы

**rules.md:**
- Правила разработки
- Code style
- Конвенции именования
- Структура проекта
- Path aliases

**tech.md:**
- Frontend: TypeScript, Vite, Fabric.js
- Backend: Node.js, Express, Prisma
- Database: PostgreSQL
- AI: Python, Flask, FastVLM
- Deployment: Docker

**product.md:**
- Описание TgStyle
- Основные функции
- User flow
- Telegram Mini App

**patterns.md:**
- Singleton pattern
- Observer pattern (события)
- Dependency Injection
- Strategy pattern
- Command pattern
- Error handling patterns
- Caching patterns

## Data Models

### Flow функций
```typescript
interface FlowStep {
  stepNumber: number;
  className: string;
  fileName: string;
  methodName: string;
  description: string;
  relatedSteps?: number[];
}
```

### Архитектура модуля
```typescript
interface ModuleArchitecture {
  overview: string;
  components: Component[];
  patterns: Pattern[];
  integrations: Integration[];
  performance: PerformanceMetrics;
}

interface Component {
  name: string;
  file: string;
  responsibility: string;
  dependencies: string[];
}
```

### API документация
```typescript
interface APIDocumentation {
  clientMethods: Method[];
  serverEndpoints: Endpoint[];
  integrations: Integration[];
  examples: CodeExample[];
}

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  parameters: Parameter[];
  response: ResponseSchema;
  example: CodeExample;
}
```

## Error Handling

### Стратегии обработки ошибок в документации

1. **Проверка актуальности**
   - Все примеры кода должны работать
   - Все ссылки на файлы должны быть валидными
   - Все методы должны существовать в коде

2. **Обработка устаревшей информации**
   - Помечать устаревшие разделы как deprecated
   - Предоставлять миграционные пути
   - Указывать альтернативы

3. **Валидация примеров**
   - Все примеры должны быть протестированы
   - Указывать версии зависимостей
   - Предоставлять полный контекст

## Testing Strategy

### Проверка документации

1. **Автоматическая валидация**
   - Проверка существования файлов
   - Проверка существования методов
   - Проверка синтаксиса примеров кода

2. **Ручная проверка**
   - Чтение документации разработчиком
   - Проверка понятности описаний
   - Проверка полноты информации

3. **Обновление при изменениях**
   - При рефакторинге обновлять документацию
   - При добавлении функций обновлять API
   - При изменении flow обновлять последовательности

### Метрики качества

- **Актуальность**: 100% примеров работают
- **Полнота**: Все публичные методы документированы
- **Понятность**: Разработчик может использовать API без дополнительных вопросов
- **Структурированность**: Легко найти нужную информацию

## Implementation Notes

### Порядок создания файлов

1. **Сначала Flow функций** (самые простые)
   - analysis_func.md
   - feed_func.md
   - wardrobe_func.md
   - capsules_func.md

2. **Затем Архитектура** (требует анализа кода)
   - analysis-architecture.md
   - feed-architecture.md
   - wardrobe-architecture.md
   - capsules-architecture.md

3. **Потом API** (требует знания архитектуры)
   - analysis-api.md
   - feed-api.md
   - wardrobe-api.md
   - capsules-api.md

4. **Серверная документация** (комплексная)
   - server.md

5. **Общие файлы** (обновление существующих)
   - rules.md
   - tech.md
   - product.md
   - patterns.md

### Источники информации

- **Для Flow**: Чтение кода модулей, трассировка вызовов
- **Для Архитектуры**: Анализ структуры классов, паттернов, зависимостей
- **Для API**: Чтение публичных методов, server endpoints, примеров использования
- **Для Server**: Анализ server/, db/prisma/schema.prisma, API роутов

### Шаблоны для копирования

Создать базовые шаблоны для каждого типа файла, чтобы обеспечить единообразие.

## Maintenance

### Процесс обновления

1. **При рефакторинге модуля**
   - Обновить architecture файл
   - Обновить API файл
   - Обновить flow файл если изменилась последовательность

2. **При добавлении функции**
   - Добавить в API файл
   - Добавить в flow файл если это UI операция
   - Обновить примеры

3. **При изменении архитектуры**
   - Обновить architecture файл
   - Обновить зависимости в других файлах
   - Обновить диаграммы если есть

### Ответственность

- **Разработчик**: Обновляет документацию при изменении кода
- **Code Review**: Проверяет актуальность документации
- **CI/CD**: Автоматически валидирует примеры кода (будущее улучшение)
