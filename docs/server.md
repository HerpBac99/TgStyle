# Серверная документация TgStyle

## Обзор

TgStyle Server - это Node.js/Express сервер, предоставляющий REST API для Telegram Mini App анализа стиля одежды. Сервер интегрируется с FastVLM для AI анализа, использует PostgreSQL через Prisma ORM и обрабатывает изображения через Sharp.

**Основные функции:**
- REST API для клиентского приложения
- Интеграция с FastVLM для AI анализа стиля
- Управление пользователями и аутентификация через Telegram WebApp
- Обработка и хранение изображений одежды
- Управление гардеробом и капсулами пользователей
- Система лайков и социальных функций
- HTTPS сервер с SSL сертификатами

## Архитектура

### Технологический стек

**Backend:**
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Prisma** - ORM для работы с PostgreSQL
- **PostgreSQL** - Основная база данных
- **Sharp** - Обработка изображений
- **HTTPS** - Обязательно для Telegram Mini App

**Интеграции:**
- **FastVLM** - Python/Flask сервер для AI анализа (порт 3001)
- **Telegram WebApp API** - Аутентификация и интеграция

### Структура проекта

```
server/
├── server.js                 # Главный файл сервера
├── package.json              # Зависимости
├── src/
│   ├── api/                  # API роуты
│   │   ├── analyze.js        # Анализ изображений
│   │   ├── wardrobe.js       # Управление гардеробом
│   │   ├── capsules.js       # Управление капсулами
│   │   ├── auth.js           # Аутентификация
│   │   ├── history.js        # История анализов
│   │   ├── analysisLikes.js  # Лайки анализов
│   │   ├── capsuleLikes.js   # Лайки капсул
│   │   └── ...
│   ├── controllers/          # Контроллеры
│   │   └── logsController.js # Логирование
│   ├── lib/                  # Библиотеки
│   │   └── prisma.js         # Prisma клиент
│   ├── middleware/           # Middleware
│   │   └── telegramAuth.js   # Аутентификация Telegram
│   ├── services/             # Бизнес-логика
│   │   ├── FileService.js    # Работа с файлами
│   │   ├── wardrobeUsageService.js
│   │   └── capsuleSimilarityService.js
│   └── utils/               # Утилиты
│       ├── telegram.js      # Валидация Telegram данных
│       └── authHelper.js    # Помощники аутентификации
├── uploads/                 # Загруженные файлы
│   ├── wardrobe/           # Изображения гардероба
│   ├── capsules/           # Изображения капсул
│   └── analysis/           # Изображения анализов
└── routes/                 # Дополнительные роуты
    └── api.js
```

### Основные компоненты

#### 1. Express Application (server.js)

**Ответственность:** Главный сервер с настройкой middleware, роутов и HTTPS.

**Ключевые особенности:**
- HTTPS сервер с SSL сертификатами (обязательно для Telegram Mini App)
- CORS поддержка для кросс-доменных запросов
- Увеличенный лимит JSON (50MB) для больших изображений
- Статическая раздача файлов (dist/ и uploads/)
- Централизованная обработка ошибок
- Graceful shutdown с отключением от БД

**Middleware:**
- `express.json({ limit: '50mb' })` - Парсинг JSON с большим лимитом
- `express.static()` - Статические файлы клиента и изображений
- Агрессивное кэширование изображений (1 год, immutable)

#### 2. Prisma ORM (src/lib/prisma.js)

**Ответственность:** Подключение к PostgreSQL и ORM операции.

**Конфигурация:**
- Автоматическое подключение при импорте
- Graceful отключение при завершении сервера
- Логирование всех SQL запросов в development режиме

#### 3. Telegram Authentication (src/middleware/telegramAuth.js)

**Ответственность:** Валидация Telegram WebApp initData.

**Два типа middleware:**
- `requireTelegramAuth` - Обязательная авторизация (401 при ошибке)
- `optionalTelegramAuth` - Опциональная авторизация (продолжает без ошибки)

**Добавляет в request:**
- `req.telegramUser` - Данные пользователя Telegram
- `req.telegramId` - BigInt ID пользователя
- `req.telegramData` - Полные данные initData

#### 4. File Service (src/services/FileService.js)

**Ответственность:** Унифицированная обработка изображений для всех модулей.

**Функции:**
- Сохранение изображений с оптимизацией (Sharp)
- Автоматический выбор формата (PNG для прозрачности, JPEG для обычных)
- Масштабирование до 800x800px с сохранением пропорций
- Удаление старых файлов
- Генерация URL для доступа к изображениям

**Конфигурация изображений:**
```javascript
const IMAGE_CONFIGS = {
  wardrobe: {
    dir: 'wardrobe',
    maxSize: 800,
    jpegQuality: 85,
    pngQuality: 90,
    prefix: 'item'
  },
  capsule: {
    dir: 'capsules', 
    maxSize: 800,
    jpegQuality: 80,
    pngQuality: 90,
    prefix: 'capsule'
  }
};
```## API E
ndpoints

### Аутентификация

Все защищенные endpoints используют Telegram WebApp initData для аутентификации:

**Заголовки:**
```
X-Init-Data: <telegram_init_data>
Content-Type: application/json
```

**Альтернативно в query параметрах:**
```
?initData=<encoded_telegram_init_data>
```

### Анализ изображений

#### POST /api/analyze

Анализирует изображение одежды через FastVLM и сохраняет в историю.

**Параметры:**
```json
{
  "photo": "base64_image_data",
  "initData": "telegram_init_data",
  "theme": "casual" // опционально
}
```

**Ответ:**
```json
{
  "success": true,
  "analysis": "Текст анализа от AI",
  "model": "llava",
  "historyItemId": 123,
  "analysesLeft": 9,
  "totalAnalyses": 1
}
```

**Особенности:**
- Проверка лимитов анализа (по умолчанию 10)
- Оптимизация изображения до 800x800px
- Сохранение на диск вместо БД
- Лимит истории 50 элементов (удаление старых)
- Интеграция с FastVLM на порту 3001

#### GET /api/history

Получает историю анализов пользователя.

**Ответ:**
```json
{
  "success": true,
  "history": [
    {
      "id": 123,
      "photoPath": "analysis/123456789/photo.jpg",
      "analysisText": "Анализ стиля...",
      "likesCount": 5,
      "isLiked": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/history-metadata

Получает только метаданные истории (оптимизация для больших историй).

**Ответ:**
```json
{
  "success": true,
  "metadata": [
    {
      "id": 123,
      "likesCount": 5,
      "viewsCount": 10,
      "isLiked": false,
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Управление гардеробом

#### POST /api/wardrobe

Создает новый предмет гардероба.

**Параметры:**
```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "category": "OUTERWEAR",
  "subtype": "куртка",
  "color": "черный",
  "material": "кожа",
  "style": "casual",
  "fit": "regular",
  "season": "autumn",
  "pattern": "solid",
  "description": "Черная кожаная куртка",
  "tags": ["casual", "outerwear"]
}
```

**Ответ:**
```json
{
  "success": true,
  "item": {
    "id": 123,
    "imageUrl": "/uploads/wardrobe/123456789/item_123456789_abc123.jpg",
    "category": "OUTERWEAR",
    "subtype": "куртка",
    "color": "черный",
    "material": "кожа",
    "style": "casual",
    "fit": "regular",
    "season": "autumn",
    "pattern": "solid",
    "description": "Черная кожаная куртка",
    "tags": ["casual", "outerwear"],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### GET /api/wardrobe

Получает все предметы гардероба пользователя.

**Ответ:**
```json
{
  "success": true,
  "items": [
    {
      "id": 123,
      "imageUrl": "/uploads/wardrobe/123456789/item_123456789_abc123.jpg",
      "category": "OUTERWEAR",
      "subtype": "куртка",
      "color": "черный",
      "material": "кожа",
      "style": "casual",
      "fit": "regular",
      "season": "autumn",
      "pattern": "solid",
      "description": "Черная кожаная куртка",
      "tags": ["casual", "outerwear"],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### PUT /api/wardrobe/:id

Обновляет предмет гардероба.

**Параметры:**
```json
{
  "category": "INNERWEAR",
  "color": "синий",
  "material": "хлопок"
}
```

#### DELETE /api/wardrobe/:id

Удаляет предмет гардероба и связанное изображение.

### Управление капсулами

#### POST /api/capsules

Создает новую капсулу.

**Параметры:**
```json
{
  "name": "Летний образ",
  "canvasData": {
    "canvas": { "objects": [...] },
    "version": "5.3.0"
  },
  "thumbnailImage": "data:image/png;base64,...",
  "itemIds": [1, 2, 3],
  "metadata": {
    "source": "manual",
    "season": "summer",
    "description": "Легкий летний образ"
  }
}
```

**Ответ:**
```json
{
  "success": true,
  "capsule": {
    "id": 123,
    "name": "Летний образ",
    "thumbnailUrl": "/uploads/capsules/123456789/capsule_123456789_1640995200000.png",
    "canvasData": { "canvas": {...} },
    "metadata": { "source": "manual" },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "itemCount": 3,
    "items": [...]
  }
}
```

#### GET /api/capsules

Получает капсулы пользователя с пагинацией.

**Параметры:**
```
?page=1&limit=10
```

**Ответ:**
```json
{
  "success": true,
  "capsules": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

#### GET /api/capsules/public

Получает публичные капсулы других пользователей.

**Особенности:**
- Исключает капсулы текущего пользователя
- Сортировка по популярности (likesCount) и новизне
- Опциональная авторизация для проверки лайков
- Включает информацию об авторе

#### POST /api/capsules/generate

Генерирует 3 варианта капсул через FastVLM.

**Параметры:**
```json
{
  "excludeCombinations": [[1, 2, 3], [4, 5, 6]]
}
```

**Ответ:**
```json
{
  "success": true,
  "capsules": [
    {
      "id": "temp_123",
      "name": "Casual Look",
      "description": "Удобный повседневный образ",
      "reasoning": "Комбинация создает гармоничный casual стиль",
      "recommendations": "Добавьте аксессуары для завершения образа",
      "itemIds": [1, 3, 5],
      "items": [...],
      "isUnique": true
    }
  ]
}
```

**Интеграция с FastVLM:**
- Endpoint: `POST http://127.0.0.1:3001/generate-capsules-mock`
- Таймаут: 60 секунд
- Анализ статистики использования вещей
- Проверка уникальности (порог 80%)

#### PUT /api/capsules/:id

Обновляет капсулу.

**Особенности:**
- НЕ отправляет itemIds при обычном обновлении
- Удаляет старое изображение перед сохранением нового
- Проверяет принадлежность пользователю

#### DELETE /api/capsules/:id

Удаляет капсулу и связанное изображение.

### Система лайков

#### POST /api/analysis-likes/:historyItemId

Ставит лайк анализу.

**Ответ:**
```json
{
  "success": true,
  "isLiked": true,
  "likesCount": 6
}
```

#### DELETE /api/analysis-likes/:historyItemId

Убирает лайк с анализа.

#### POST /api/capsule-likes/:capsuleId

Ставит лайк капсуле.

#### DELETE /api/capsule-likes/:capsuleId

Убирает лайк с капсулы.

### Обработка изображений

#### POST /api/classify-clothing

Классифицирует одежду через FastVLM.

**Параметры:**
```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "initData": "telegram_init_data"
}
```

**Ответ:**
```json
{
  "success": true,
  "processedImage": "data:image/png;base64,...",
  "classification": {
    "category": "OUTERWEAR",
    "subtype": "куртка",
    "color": "черный",
    "material": "кожа",
    "style": "casual",
    "fit": "regular",
    "season": "autumn",
    "pattern": "solid",
    "description": "Черная кожаная куртка"
  }
}
```

#### POST /api/remove-background

Удаляет фон с изображения через FastVLM.

### Служебные endpoints

#### GET /api/health

Проверка работы сервера.

**Ответ:**
```json
{
  "success": true,
  "message": "Сервер работает",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "domain": "your-domain.com",
  "port": 443
}
```

#### GET /api/initial-data

Batch загрузка всех начальных данных для клиента.

**Ответ:**
```json
{
  "success": true,
  "user": {...},
  "wardrobe": [...],
  "capsules": [...],
  "history": [...]
}
```## С
хема базы данных

### Основные модели

#### User
Пользователи Telegram Mini App.

```prisma
model User {
  id                   Int            @id @default(autoincrement())
  telegramId           BigInt         @unique
  firstName            String
  lastName             String?
  username             String?
  avatarUrl            String?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
  isActive             Boolean        @default(true)
  analysesCount        Int            @default(10)      // Лимит анализов
  subscriptionType     String         @default("free")
  subscriptionEndDate  DateTime?
  totalAnalyses        Int            @default(0)       // Всего выполнено
  weeklyResetDate      DateTime       @default(now())
  
  // Связи
  capsules             Capsule[]
  capsuleLikes         CapsuleLike[]
  comments             Comment[]
  historyItems         HistoryItem[]
  ratings              Rating[]
  wardrobe_items       WardrobeItem[]
  notifications        Notification[]
  relatedNotifications Notification[] @relation("NotificationRelatedUser")
}
```

**Ключевые поля:**
- `telegramId` - Уникальный ID из Telegram (BigInt)
- `analysesCount` - Оставшиеся анализы (по умолчанию 10)
- `totalAnalyses` - Общий счетчик выполненных анализов
- `subscriptionType` - Тип подписки (free, premium)

#### WardrobeItem
Предметы гардероба пользователя.

```prisma
model WardrobeItem {
  id         Int               @id @default(autoincrement())
  telegramId BigInt            @map("telegram_id")
  imagePath  String            @map("image_path") @db.VarChar(500)

  // Классификация от FastVLM
  category   ClothingCategory? // OUTERWEAR, INNERWEAR, BODYWEAR, etc.
  subtype    String?           // куртка, свитер, джинсы
  color      String?           // черный, синий, красный
  material   String?           // хлопок, кожа, шерсть
  style      String?           // casual, formal, sport
  pattern    String?           // solid, striped, checkered
  fit        String?           // slim, regular, oversized
  season     String?           // spring, summer, autumn, winter
  description String?          // Описание от FastVLM

  // Пользовательские данные
  name       String?           // Название от пользователя
  tags       String[]          // Теги

  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @default(now()) @updatedAt
  
  // Связи
  user       User              @relation(fields: [telegramId], references: [telegramId])
  capsules   Capsule[]         // Многие ко многим
}
```

**Enum ClothingCategory:**
```prisma
enum ClothingCategory {
  OUTERWEAR   // Верхняя одежда (куртки, пальто, плащи)
  INNERWEAR   // Свитеры (кофты, водолазки, свитеры)
  BODYWEAR    // Футболки и рубашки (футболки, рубашки, блузки)
  FULLBODY    // Цельная одежда (платья, костюмы, комбинезоны)
  LEGWEAR     // Штаны (штаны, брюки, джинсы, шорты)
  FOOTWEAR    // Обувь (кроссовки, ботинки, туфли)
  HEADWEAR    // Головные уборы (шапки, шляпы, кепки)
  ACCESSORIES // Аксессуары (сумки, ремни, украшения)
}
```

#### Capsule
Капсулы (образы) пользователя.

```prisma
model Capsule {
  id          Int      @id @default(autoincrement())
  telegramId  BigInt   @map("telegram_id")
  
  name        String?  @db.VarChar(255)
  description String?  @db.VarChar(500)
  
  canvasData  Json     // Данные Fabric.js canvas
  thumbnailPath String? @map("thumbnail_path") // Путь к изображению
  metadata    Json?    // Метаданные для AI-generated капсул
  
  analysis    String?  @db.Text         // Анализ от LLM стилиста
  analysisDate DateTime? @map("analysis_date")
  
  // Социальные функции
  isPublic    Boolean  @default(false)  // Можно ли делиться
  shareId     String?  @unique          // Для shared капсул
  likesCount  Int      @default(0)      // Денормализованный счетчик
  viewsCount  Int      @default(0)      // Денормализованный счетчик
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt
  
  // Связи
  user        User     @relation(fields: [telegramId], references: [telegramId])
  items       WardrobeItem[] // Многие ко многим
  capsuleLikes CapsuleLike[]
}
```

**Ключевые поля:**
- `canvasData` - JSON данные Fabric.js canvas (позиции, размеры объектов)
- `thumbnailPath` - Путь к файлу изображения капсулы
- `metadata` - Метаданные для AI-generated капсул (source, recommendations, reasoning)
- `likesCount` - Денормализованный счетчик для производительности

#### HistoryItem
История анализов пользователя.

```prisma
model HistoryItem {
  id                Int            @id @default(autoincrement())
  userId            Int
  photoData         String?        // Deprecated: legacy base64
  photoPath         String?        // NEW: путь к файлу
  analysisText      String?        // Креативный ответ стилиста
  technicalAnalysis String?        // Технический анализ
  
  // Социальные функции
  isPublic          Boolean        @default(false)
  shareId           String?        @unique // Для shared анализов
  likesCount        Int            @default(0) // Денормализованный счетчик
  viewsCount        Int            @default(0) // Денормализованный счетчик
  
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  
  // Связи
  user              User           @relation(fields: [userId], references: [id])
  comments          Comment[]
  notifications     Notification[]
  ratings           Rating[]
}
```

**Особенности:**
- Лимит 50 записей на пользователя (удаление старых)
- `photoPath` вместо `photoData` для экономии места в БД
- Денормализованные счетчики для производительности

#### Rating
Лайки анализов и капсул.

```prisma
model Rating {
  id            Int         @id @default(autoincrement())
  userId        Int
  historyItemId Int
  ratingType    String      // 'like'
  createdAt     DateTime    @default(now())
  
  // Связи
  historyItem   HistoryItem @relation(fields: [historyItemId], references: [id])
  user          User        @relation(fields: [userId], references: [id])
  
  @@unique([userId, historyItemId]) // Один лайк на пользователя
}
```

#### CapsuleLike
Лайки капсул.

```prisma
model CapsuleLike {
  id        Int      @id @default(autoincrement())
  userId    Int
  capsuleId Int
  createdAt DateTime @default(now())
  
  // Связи
  capsule   Capsule  @relation(fields: [capsuleId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  
  @@unique([userId, capsuleId]) // Один лайк на пользователя
}
```

### Индексы для производительности

**WardrobeItem:**
- `idx_wardrobe_telegram_id` - Быстрый поиск по пользователю
- `idx_wardrobe_category` - Фильтрация по категории
- `idx_wardrobe_created_at` - Сортировка по дате (DESC)

**Capsule:**
- `idx_capsule_telegram_id` - Быстрый поиск по пользователю
- `idx_capsule_created_at` - Сортировка по дате (DESC)
- `idx_capsule_is_public` - Фильтрация публичных капсул
- `idx_capsule_share_id` - Быстрый поиск shared капсул

**HistoryItem:**
- `idx_history_share_id` - Быстрый поиск shared анализов

### Связи между моделями

**Один ко многим:**
- User → WardrobeItem (через telegramId)
- User → Capsule (через telegramId)
- User → HistoryItem (через userId)

**Многие ко многим:**
- Capsule ↔ WardrobeItem (капсула содержит несколько вещей)

**Денормализация:**
- `likesCount` в Capsule и HistoryItem для производительности
- `viewsCount` для статистики просмотров

## Интеграция с FastVLM

### Конфигурация

FastVLM сервер работает на Python/Flask и предоставляет AI анализ изображений.

**Настройки подключения:**
```javascript
const FASTVLM_CONFIG = {
  HOST: 'http://127.0.0.1',
  PORT: 3001,
  TIMEOUT: 60000, // 60 секунд
  ENDPOINT: '/analyze'
};
```

### Endpoints FastVLM

#### POST /analyze
Анализ стиля одежды.

**Запрос:**
```json
{
  "image_base64": "base64_image_data",
  "prompt": "Опиши одежду на фото",
  "nickname": "username",
  "topic": "casual"
}
```

**Ответ:**
```json
{
  "success": true,
  "analysis": "Креативный ответ стилиста",
  "technical_analysis": "ЧЕЛОВЕК, ОДЕЖДА...",
  "model_used": "llava",
  "device": "cuda"
}
```

#### POST /classify-clothing
Классификация одежды.

**Запрос:**
```json
{
  "image_base64": "base64_image_data"
}
```

**Ответ:**
```json
{
  "success": true,
  "processedImage": "base64_with_removed_background",
  "classification": {
    "category": "OUTERWEAR",
    "subtype": "куртка",
    "color": "черный",
    "material": "кожа",
    "style": "casual",
    "fit": "regular",
    "season": "autumn",
    "pattern": "solid",
    "description": "Черная кожаная куртка"
  }
}
```

#### POST /remove-background
Удаление фона с изображения.

#### POST /generate-capsules-mock
Генерация капсул (mock endpoint).

### Обработка ошибок FastVLM

**Таймауты:**
- 60 секунд для всех запросов
- AbortController для отмены запросов
- Graceful fallback при недоступности сервиса

**Типы ошибок:**
- `FastVLM timeout` - Превышен таймаут
- `FastVLM server error` - Ошибка сервера
- `FastVLM communication error` - Ошибка соединения

## Обработка изображений через Sharp

### Оптимизация изображений

**Общие настройки:**
- Максимальный размер: 800x800px
- Сохранение пропорций с padding
- Автоматическая ротация по EXIF
- Выбор формата: PNG для прозрачности, JPEG для обычных

**Для гардероба:**
```javascript
// JPEG качество 85%, PNG качество 90%
const optimizedBuffer = await sharp(buffer)
  .rotate() // EXIF orientation
  .resize(scaledWidth, scaledHeight, { fit: 'fill' })
  .extend({
    top: paddingTop,
    bottom: paddingBottom,
    left: paddingLeft,
    right: paddingRight,
    background: hasAlpha 
      ? { r: 0, g: 0, b: 0, alpha: 0 }     // Прозрачный
      : { r: 255, g: 255, b: 255, alpha: 1 } // Белый
  })
  .jpeg({ quality: 85, progressive: true })
  .toBuffer();
```

**Для капсул:**
```javascript
// JPEG качество 80%, PNG качество 90%
// Аналогичная обработка с другими настройками качества
```

**Для анализов:**
```javascript
// Resize до 800x800px, JPEG качество 85%
// Сохранение на диск вместо БД
```

### Структура файлов

**Организация папок:**
```
uploads/
├── wardrobe/
│   └── {telegramId}/
│       ├── item_{telegramId}_{random}.jpg
│       └── item_{telegramId}_{random}.png
├── capsules/
│   └── {telegramId}/
│       ├── capsule_{telegramId}_{timestamp}.jpg
│       └── capsule_{telegramId}_{timestamp}.png
└── analysis/
    └── {telegramId}/
        ├── analysis_{timestamp}.jpg
        └── analysis_{timestamp}.jpg
```

**Именование файлов:**
- Гардероб: `item_{telegramId}_{randomString}.{ext}`
- Капсулы: `capsule_{telegramId}_{timestamp}.{ext}`
- Анализы: `analysis_{timestamp}.{ext}`

### URL генерация

**Для гардероба:**
```javascript
// Путь хранится в БД: "wardrobe/123456789/item_123456789_abc123.jpg"
// URL: "/uploads/wardrobe/123456789/item_123456789_abc123.jpg"
```

**Для капсул:**
```javascript
// Имя файла в БД: "capsule_123456789_1640995200000.png"
// URL: "/uploads/capsules/123456789/capsule_123456789_1640995200000.png"
```

### Очистка файлов

**Автоматическая очистка:**
- При удалении записи из БД
- При обновлении изображения (удаление старого)
- При превышении лимитов (история анализов)

**Защита от orphaned файлов:**
- Проверка существования перед удалением
- Логирование всех операций с файлами
- Graceful handling ошибок файловой системы## Б
езопасность и аутентификация

### Telegram WebApp Authentication

**Принцип работы:**
1. Telegram передает `initData` в Mini App
2. Сервер валидирует `initData` используя bot token
3. Извлекает данные пользователя из валидированного `initData`
4. Создает/обновляет пользователя в БД

**Валидация initData:**
```javascript
function validateTelegramWebAppData(initData) {
  // Парсинг query string
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  // Создание строки для проверки
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  // Создание secret key
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest();
  
  // Проверка подписи
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  return {
    isValid: calculatedHash === hash,
    data: hash === calculatedHash ? Object.fromEntries(urlParams) : null,
    error: calculatedHash !== hash ? 'Invalid hash' : null
  };
}
```

**Middleware аутентификации:**
- `requireTelegramAuth` - Обязательная авторизация (401 при ошибке)
- `optionalTelegramAuth` - Опциональная авторизация (продолжает без ошибки)

### HTTPS и SSL

**Обязательные требования:**
- Telegram Mini App требует HTTPS соединение
- SSL сертификаты должны быть валидными
- Поддержка TLS 1.2+

**Конфигурация SSL:**
```javascript
const httpsOptions = {
  key: fs.readFileSync(process.env.HTTPS_KEY_PATH || 'ssl/keys/server.key'),
  cert: fs.readFileSync(process.env.HTTPS_CERT_PATH || 'ssl/certs/server.crt')
};

const server = https.createServer(httpsOptions, app);
```

### Защита от атак

**CORS настройки:**
```javascript
app.use(cors()); // Разрешает кросс-доменные запросы
```

**Лимиты запросов:**
- JSON body limit: 50MB (для больших изображений)
- Проверка размера изображений (минимум 100 байт)
- Лимиты анализов на пользователя

**Валидация данных:**
- Проверка обязательных параметров
- Валидация форматов изображений
- Проверка принадлежности ресурсов пользователю

## Производительность и оптимизация

### Кэширование статических файлов

**Агрессивное кэширование изображений:**
```javascript
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '365d',     // Кэшировать на 1 год
  immutable: true,    // Файлы не изменяются
  etag: true,         // ETag для валидации
  lastModified: true  // Last-Modified заголовок
}));
```

### Оптимизация базы данных

**Индексы:**
- Все внешние ключи проиндексированы
- Составные индексы для частых запросов
- Индексы на поля сортировки (createdAt DESC)

**Денормализация:**
- `likesCount` в Capsule и HistoryItem
- `viewsCount` для статистики
- Избегание JOIN запросов для счетчиков

**Пагинация:**
```javascript
const skip = (parseInt(page) - 1) * parseInt(limit);
const take = parseInt(limit);

const items = await prisma.model.findMany({
  skip,
  take,
  orderBy: { createdAt: 'desc' }
});
```

### Оптимизация изображений

**Сжатие:**
- JPEG: качество 80-85%
- PNG: качество 90%, compression level 9
- Автоматический выбор формата

**Размеры:**
- Единый размер 800x800px для всех изображений
- Сохранение пропорций с padding
- Progressive JPEG для быстрой загрузки

**Хранение:**
- Файлы на диске вместо БД
- Организация по папкам пользователей
- Автоматическая очистка orphaned файлов

### Лимиты и квоты

**Пользовательские лимиты:**
- Анализы: 10 по умолчанию
- История: максимум 50 записей
- Автоматическое удаление старых записей

**Системные лимиты:**
- JSON body: 50MB
- Таймаут FastVLM: 60 секунд
- Размер изображения: минимум 100 байт

## Логирование и мониторинг

### Структурированное логирование

**Уровни логов:**
```javascript
logger.info('Operation completed', { userId, operation, duration });
logger.warn('Potential issue detected', { context });
logger.error('Error occurred', { error: error.message, stack: error.stack });
logger.debug('Debug information', { details });
```

**Контекст логов:**
- User ID и Telegram ID
- Endpoint и HTTP method
- Размеры файлов и производительность
- Ошибки с полным stack trace

### Мониторинг производительности

**Метрики:**
- Время ответа API endpoints
- Размеры изображений до/после оптимизации
- Коэффициент сжатия
- Использование дискового пространства

**Алерты:**
- Ошибки подключения к FastVLM
- Ошибки подключения к PostgreSQL
- Превышение лимитов дискового пространства
- SSL сертификаты истекают

### Graceful Shutdown

**Обработка сигналов:**
```javascript
process.on('SIGTERM', async () => await gracefulShutdown('SIGTERM'));
process.on('SIGINT', async () => await gracefulShutdown('SIGINT'));

async function gracefulShutdown(signal) {
  logger.warn(`Получен сигнал ${signal}, завершение работы...`);
  
  // Отключение от БД
  await prisma.$disconnect();
  
  // Закрытие сервера
  server.close((err) => {
    if (err) {
      logger.error('Ошибка при закрытии сервера', { error: err.message });
      process.exit(1);
    }
    logger.info('Сервер успешно остановлен');
    process.exit(0);
  });
  
  // Принудительное завершение через 10 секунд
  setTimeout(() => {
    logger.error('Принудительное завершение сервера');
    process.exit(1);
  }, 10000);
}
```

## Развертывание и конфигурация

### Переменные окружения

**Обязательные:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/tgstyle
TELEGRAM_BOT_TOKEN=your_bot_token
DOMAIN=your-domain.com
PORT=443
```

**Опциональные:**
```env
NODE_ENV=production
HTTPS_KEY_PATH=/path/to/ssl/key
HTTPS_CERT_PATH=/path/to/ssl/cert
BASE_URL=https://your-domain.com
```

### SSL сертификаты

**Требования:**
- Валидные SSL сертификаты для домена
- Поддержка TLS 1.2+
- Автоматическое обновление (Let's Encrypt)

**Пути по умолчанию:**
```
ssl/
├── keys/
│   └── server.key
└── certs/
    └── server.crt
```

### Docker конфигурация

**Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 443
CMD ["node", "server.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  server:
    build: .
    ports:
      - "443:443"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    volumes:
      - ./uploads:/app/server/uploads
      - ./ssl:/app/ssl
    depends_on:
      - postgres
      
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=tgstyle
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

### Мониторинг в production

**Health checks:**
- GET /api/health для проверки работы сервера
- Проверка подключения к PostgreSQL
- Проверка доступности FastVLM

**Логи:**
- Структурированные JSON логи
- Ротация логов по размеру/времени
- Централизованный сбор логов (ELK stack)

**Метрики:**
- Время ответа endpoints
- Количество активных пользователей
- Использование дискового пространства
- Ошибки и их частота

## Troubleshooting

### Частые проблемы

**1. SSL сертификаты не найдены**
```
SSL ключ не найден: ssl/keys/server.key
SSL сертификат не найден: ssl/certs/server.crt
```
**Решение:** Проверить пути к сертификатам в переменных окружения.

**2. FastVLM недоступен**
```
FastVLM server error: 500 Internal Server Error
FastVLM timeout
```
**Решение:** Проверить работу FastVLM сервера на порту 3001.

**3. PostgreSQL недоступен**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Решение:** Проверить подключение к PostgreSQL и DATABASE_URL.

**4. Превышен лимит JSON**
```
PayloadTooLargeError: request entity too large
```
**Решение:** Увеличить лимит в express.json() или оптимизировать изображения.

### Диагностика

**Проверка работы сервера:**
```bash
curl -k https://your-domain.com/api/health
```

**Проверка FastVLM:**
```bash
curl -X POST http://127.0.0.1:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"image_base64":"test","prompt":"test"}'
```

**Проверка PostgreSQL:**
```bash
psql $DATABASE_URL -c "SELECT version();"
```

**Проверка SSL:**
```bash
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

### Логи для отладки

**Включение debug логов:**
```env
NODE_ENV=development
```

**Анализ логов:**
```bash
# Ошибки аутентификации
grep "Invalid Telegram authentication" logs/server.log

# Ошибки FastVLM
grep "FastVLM" logs/server.log

# Ошибки файловой системы
grep "Error.*image" logs/server.log
```