# База знаний: Серверная часть TgStyle

## Оглавление

1. [Общая архитектура](#общая-архитектура)
2. [Основной сервер - server.js](#основной-сервер---serverjs)
3. [API маршруты](#api-маршруты)
4. [База данных - Prisma](#база-данных---prisma)
5. [Утилиты](#утилиты)
6. [Контроллеры](#контроллеры)

---

## Общая архитектура

Серверная часть построена на Node.js + Express с использованием PostgreSQL через Prisma ORM. Сервер работает по HTTPS для соответствия требованиям Telegram Mini Apps.

### Технологический стек

- **Node.js** - runtime environment
- **Express** - веб-фреймворк
- **PostgreSQL** - реляционная база данных
- **Prisma** - ORM для работы с БД
- **HTTPS** - защищенное соединение
- **Winston** - логирование
- **Multer** - загрузка файлов
- **Sharp** - обработка изображений

### Структура сервера

```
server/
├── server.js              # Основной файл сервера
├── routes/
│   └── api.js            # Общие API маршруты
├── src/
│   ├── api/              # API endpoints
│   │   ├── auth.js       # Авторизация
│   │   ├── analyze.js    # Анализ изображений
│   │   ├── wardrobe.js   # Гардероб
│   │   ├── capsules.js   # Капсулы
│   │   ├── backgroundRemoval.js
│   │   ├── clothingClassification.js
│   │   ├── history.js
│   │   └── subscription.js
│   ├── controllers/      # Контроллеры
│   │   └── logsController.js
│   ├── lib/             # Библиотеки
│   │   └── prisma.js    # Prisma клиент
│   └── utils/           # Утилиты
│       └── telegram.js  # Telegram утилиты
├── uploads/             # Загруженные файлы
└── temp/                # Временные файлы
```

---

## Основной сервер - server.js

### Функции

#### `createHttpsServer(): https.Server`

Создает HTTPS сервер с SSL сертификатами.

**Что делает:**
- Читает SSL сертификаты из указанных путей
- Проверяет существование файлов
- Создает HTTPS сервер с Express приложением
- Логирует успешную загрузку или ошибки

**Возвращает:**
- Настроенный HTTPS сервер

**Переменные окружения:**
- `HTTPS_KEY_PATH` - путь к SSL ключу
- `HTTPS_CERT_PATH` - путь к SSL сертификату

**Пример:**
```javascript
const server = createHttpsServer();
```

#### `startServer(): Promise<void>`

Запускает HTTPS сервер TgStyle.

**Что делает:**
1. Проверяет обязательные переменные окружения (DOMAIN)
2. Подключается к PostgreSQL через Prisma
3. Создает HTTPS сервер
4. Запускает сервер на указанном порту
5. Настраивает graceful shutdown
6. Регистрирует обработчики сигналов (SIGTERM, SIGINT)
7. Обрабатывает необработанные исключения

**Переменные окружения:**
- `PORT` - порт сервера (по умолчанию 443)
- `DOMAIN` - домен сервера (обязательно)
- `NODE_ENV` - окружение (development/production)

**Пример:**
```bash
DOMAIN=your-domain.com PORT=443 node server.js
```

### Middleware

#### CORS

```javascript
app.use(cors());
```

Включает CORS для всех маршрутов.

#### JSON парсер

```javascript
app.use(express.json({ limit: '10mb' }));
```

Парсит JSON с лимитом 10MB (для base64 изображений).

#### Статические файлы

```javascript
// Клиентские файлы
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Загруженные изображения
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

### Централизованная обработка ошибок

```javascript
app.use((error, req, res, next) => {
  // Обработка ошибок
});
```

**Обрабатывает:**
- ValidationError (400)
- UnauthorizedError (401)
- ForbiddenError (403)
- NotFoundError (404)
- ConflictError (409)
- Internal Server Error (500)

**Игнорирует:**
- `request aborted`
- `ECONNABORTED`
- `ECONNRESET`

**Возвращает:**
```json
{
  "success": false,
  "error": "ErrorName",
  "message": "User-friendly message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "stack": "..." // только в development
}
```

### Health Check

```javascript
GET /api/health
```

**Возвращает:**
```json
{
  "success": true,
  "message": "Сервер работает",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "domain": "your-domain.com",
  "port": 443
}
```

---

## API маршруты

### Авторизация - auth.js

#### `POST /api/auth`

Авторизация пользователя через Telegram WebApp.

**Тело запроса:**
```json
{
  "initData": "string" // Telegram WebApp initData
}
```

**Ответ (успех):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "telegramId": "123456789",
    "firstName": "John",
    "lastName": "Doe",
    "username": "johndoe",
    "avatarUrl": "https://...",
    "subscription": {
      "type": "free",
      "isActive": true,
      "analysesLeft": 3,
      "totalAnalyses": 0,
      "weeklyResetDate": "2024-01-08T00:00:00.000Z",
      "subscriptionEndDate": null
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Authentication successful"
}
```

**Ответ (ошибка валидации):**
```json
{
  "success": false,
  "error": "Invalid initData"
}
```

**Что делает:**
1. Валидирует Telegram initData
2. Извлекает данные пользователя
3. Создает или обновляет пользователя в БД
4. Проверяет и обновляет weekly reset
5. Возвращает данные пользователя с подпиской

**Функции:**

##### `createOrUpdateUser(telegramUserData): Promise<User>`

Создание или обновление пользователя в БД.

**Параметры:**
- `telegramUserData` - данные пользователя из Telegram

**Что делает:**
- Ищет пользователя по telegramId
- Обновляет данные если найден
- Создает нового с лимитами free подписки
- Проверяет weekly reset
- Возвращает объект User

##### `checkAndUpdateWeeklyReset(user): Promise<User>`

Проверка и обновление weekly reset.

**Параметры:**
- `user` - объект пользователя

**Что делает:**
- Проверяет дату weeklyResetDate
- Если прошла, обновляет analysesCount = 3
- Устанавливает новую дату следующего понедельника
- Возвращает обновленного пользователя

##### `getNextMondayDate(): Date`

Получение даты следующего понедельника.

**Возвращает:**
- Date объект следующего понедельника 00:00:00

##### `formatUserResponse(user): UserResponse`

Форматирование ответа с данными пользователя.

**Параметры:**
- `user` - объект User из БД

**Возвращает:**
- Форматированный объект с информацией о подписке

---

### Анализ - analyze.js

#### `POST /api/analyze`

Анализ изображения одежды через FastVLM.

**Тело запроса:**
```json
{
  "photo": "base64_string",
  "platform": "string",
  "userAgent": "string",
  "initData": "telegram_initData",
  "theme": "casual"
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
  "subscription": {
    "type": "free",
    "analysesLeft": 2,
    "totalAnalyses": 1
  },
  "fastvlm": true,
  "model": "llava"
}
```

**Ответ (ошибка лимита):**
```json
{
  "success": false,
  "error": "SUBSCRIPTION_LIMIT_EXCEEDED",
  "message": "Превышен недельный лимит анализов",
  "analysesLeft": 0,
  "weeklyResetDate": "2024-01-08T00:00:00.000Z",
  "upgradeRequired": true
}
```

**Что делает:**
1. Валидирует initData
2. Получает пользователя из БД
3. Проверяет лимиты анализа
4. Декодирует base64 изображение
5. Отправляет на FastVLM сервер
6. Оптимизирует изображение для хранения
7. Сохраняет результат в историю (лимит 50)
8. Обновляет счетчики пользователя
9. Возвращает результат анализа

**Функции:**

##### `getUserByTelegramId(telegramId): Promise<User | null>`

Получение пользователя из БД.

**Параметры:**
- `telegramId` - Telegram ID пользователя

**Возвращает:**
- User объект или null

##### `checkAnalysisLimits(user): Object`

Проверка лимитов анализа для пользователя.

**Параметры:**
- `user` - объект User

**Возвращает:**
```javascript
{
  allowed: boolean,
  reason: string,
  subscription?: string,
  analysesLeft?: number,
  weeklyResetDate?: Date
}
```

**Логика:**
- Premium активна → allowed = true
- Free пользователь с analysesCount > 0 → allowed = true
- Free пользователь с analysesCount <= 0 → allowed = false
- Пользователь не найден → allowed = true (fallback)

##### `updateUserCounters(userId): Promise<User | null>`

Обновление счетчиков после анализа.

**Параметры:**
- `userId` - UUID пользователя

**Что делает:**
- Уменьшает analysesCount на 1
- Увеличивает totalAnalyses на 1
- Обновляет updatedAt
- Возвращает обновленного пользователя

##### `optimizeImageForStorage(base64Image): Promise<string>`

Оптимизация изображения для хранения.

**Параметры:**
- `base64Image` - base64 изображение

**Что делает:**
- Убирает data:image префикс
- Конвертирует в Buffer
- Resize до 800x800px (пропорции сохраняются)
- Конвертирует в JPEG качества 0.85
- Возвращает оптимизированное base64

**Использует:** Sharp библиотеку

##### `saveAnalysisToHistory(userId, photoData, technicalAnalysis): Promise<HistoryItem | null>`

Сохранение анализа в историю с лимитом 50 записей.

**Параметры:**
- `userId` - UUID пользователя
- `photoData` - base64 изображение
- `technicalAnalysis` - результат FastVLM

**Что делает:**
1. Оптимизирует изображение
2. Проверяет количество записей (лимит 50)
3. Удаляет самую старую если лимит достигнут
4. Создает новую запись в БД
5. Возвращает HistoryItem

##### `analyzeImage(imageBuffer, nickname, theme): Promise<Object>`

Анализ изображения через FastVLM сервер.

**Параметры:**
- `imageBuffer` - Buffer изображения
- `nickname` - никнейм пользователя
- `theme` - тема анализа

**Что делает:**
- Конвертирует Buffer в base64
- Создает POST запрос к FastVLM серверу
- Отправляет с таймаутом 60 секунд
- Обрабатывает ответ
- Очищает текст анализа
- Возвращает результат

**URL:** `http://127.0.0.1:3001/analyze`

**Тело запроса к FastVLM:**
```json
{
  "image_base64": "base64_string",
  "prompt": "Опиши одежду на фото",
  "nickname": "username",
  "topic": "casual"
}
```

##### `cleanAnalysisText(text): string`

Очистка текста анализа от лишних элементов.

**Параметры:**
- `text` - исходный текст анализа

**Что делает:**
- Удаляет markdown заголовки (# ## ###)
- Удаляет emoji
- Удаляет лишние пробелы
- Возвращает очищенный текст

---

### Гардероб - wardrobe.js

#### `GET /api/wardrobe`

Получение всех вещей из гардероба пользователя.

**Query параметры:**
- `initData` - Telegram initData (обязательно)

**Ответ:**
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "userId": "uuid",
      "imageUrl": "/uploads/123.jpg",
      "category": "BODYWEAR",
      "color": "Blue",
      "material": "Cotton",
      "style": "Casual",
      "fit": "Regular",
      "description": "...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /api/wardrobe`

Добавление новой вещи в гардероб.

**Тело запроса (multipart/form-data):**
- `image` - файл изображения
- `initData` - Telegram initData
- `category` - категория одежды
- `color` - цвет
- `material` - материал (опционально)
- `style` - стиль (опционально)
- `fit` - посадка (опционально)
- `description` - описание (опционально)

**Ответ:**
```json
{
  "success": true,
  "item": {
    "id": 1,
    "imageUrl": "/uploads/123.jpg",
    "category": "BODYWEAR",
    "color": "Blue"
  }
}
```

**Что делает:**
1. Валидирует initData
2. Обрабатывает загруженный файл (multer)
3. Сохраняет файл в uploads/
4. Создает запись в БД
5. Возвращает данные вещи

#### `DELETE /api/wardrobe/:id`

Удаление вещи из гардероба.

**Параметры URL:**
- `id` - ID вещи

**Тело запроса:**
```json
{
  "initData": "telegram_initData"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Item deleted successfully"
}
```

**Что делает:**
1. Валидирует initData
2. Проверяет принадлежность вещи пользователю
3. Удаляет файл изображения
4. Удаляет запись из БД

---

### Капсулы - capsules.js

#### `GET /api/capsules`

Получение всех капсул пользователя.

**Query параметры:**
- `initData` - Telegram initData

**Ответ:**
```json
{
  "success": true,
  "capsules": [
    {
      "id": 1,
      "name": "Summer casual",
      "description": "...",
      "items": [
        {
          "id": 1,
          "wardrobeItemId": 5,
          "wardrobeItem": {
            "id": 5,
            "imageUrl": "/uploads/123.jpg",
            "category": "BODYWEAR"
          }
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /api/capsules`

Создание новой капсулы.

**Тело запроса:**
```json
{
  "initData": "telegram_initData",
  "name": "Summer casual",
  "description": "My summer outfit",
  "itemIds": [1, 2, 3, 4]
}
```

**Ответ:**
```json
{
  "success": true,
  "capsule": {
    "id": 1,
    "name": "Summer casual",
    "description": "...",
    "items": [...]
  }
}
```

**Что делает:**
1. Валидирует initData
2. Создает капсулу в БД
3. Связывает выбранные вещи с капсулой
4. Возвращает полные данные капсулы

#### `DELETE /api/capsules/:id`

Удаление капсулы.

**Параметры URL:**
- `id` - ID капсулы

**Тело запроса:**
```json
{
  "initData": "telegram_initData"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Capsule deleted successfully"
}
```

**Что делает:**
1. Валидирует initData
2. Проверяет принадлежность капсулы пользователю
3. Удаляет связи с вещами (cascade)
4. Удаляет капсулу из БД

---

### Удаление фона - backgroundRemoval.js

#### `POST /api/remove-background`

Удаление фона с изображения одежды.

**Тело запроса:**
```json
{
  "image_base64": "base64_string",
  "initData": "telegram_initData"
}
```

**Ответ:**
```json
{
  "success": true,
  "image_base64": "base64_processed_image"
}
```

**Что делает:**
1. Валидирует initData
2. Отправляет изображение на FastVLM сервер
3. FastVLM использует rembg для удаления фона
4. Возвращает обработанное изображение

**URL FastVLM:** `http://127.0.0.1:3001/remove-background`

---

### Классификация одежды - clothingClassification.js

#### `POST /api/classify-clothing`

Классификация предмета одежды через AI.

**Тело запроса:**
```json
{
  "image_base64": "base64_string",
  "initData": "telegram_initData"
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
    "description": "Blue cotton t-shirt"
  }
}
```

**Что делает:**
1. Валидирует initData
2. Отправляет изображение на FastVLM сервер
3. FastVLM использует специальный CLASS_PROMPT
4. Парсит структурированный ответ AI
5. Возвращает классификацию

**URL FastVLM:** `http://127.0.0.1:3001/classify-clothing`

---

### История - history.js

#### `GET /api/history`

Получение истории анализов пользователя.

**Query параметры:**
- `initData` - Telegram initData
- `limit` - количество записей (опционально)
- `offset` - смещение (опционально)

**Ответ:**
```json
{
  "success": true,
  "items": [
    {
      "id": "uuid",
      "photoData": "base64_optimized_image",
      "technicalAnalysis": "...",
      "analysisText": null,
      "isPublic": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 50,
  "limit": 20,
  "offset": 0
}
```

**Что делает:**
1. Валидирует initData
2. Получает записи из БД с пагинацией
3. Возвращает историю

---

### Подписки - subscription.js

#### `POST /api/subscription/upgrade`

Обновление подписки до Premium (заглушка).

**Тело запроса:**
```json
{
  "initData": "telegram_initData",
  "plan": "premium_monthly"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Subscription upgraded",
  "subscription": {
    "type": "premium",
    "endDate": "2024-02-01T00:00:00.000Z"
  }
}
```

#### `GET /api/subscription/status`

Получение статуса подписки.

**Query параметры:**
- `initData` - Telegram initData

**Ответ:**
```json
{
  "success": true,
  "subscription": {
    "type": "free",
    "analysesLeft": 3,
    "totalAnalyses": 0,
    "weeklyResetDate": "2024-01-08T00:00:00.000Z",
    "subscriptionEndDate": null
  }
}
```

---

### Общие API - routes/api.js

#### `POST /api/log-client`

Прием логов от клиента.

**Тело запроса:**
```json
{
  "sessionId": "string",
  "logs": [
    {
      "level": "info",
      "message": "...",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "data": {}
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "userAgent": "...",
  "appVersion": "2.0.0",
  "userData": {},
  "userId": 123456789,
  "username": "johndoe"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Logs received",
  "count": 10
}
```

**Что делает:**
1. Получает логи от клиента
2. Сохраняет в файл logs/client_{username}_{date}.log
3. Использует winston для записи

#### `GET /api/ping`

Проверка работоспособности сервера.

**Ответ:**
```json
{
  "success": true,
  "message": "pong",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /api/shared-analysis/:id`

Получение shared анализа по ID (для обратной совместимости).

**Параметры URL:**
- `id` - ID анализа

**Ответ:**
```json
{
  "success": true,
  "data": {
    "photo": "base64_image",
    "analysis": "...",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## База данных - Prisma

### Модели

#### User

```prisma
model User {
  id                   String        @id @default(uuid())
  telegramId           BigInt        @unique
  firstName            String
  lastName             String?
  username             String?
  avatarUrl            String?
  subscriptionType     String        @default("free")
  subscriptionEndDate  DateTime?
  analysesCount        Int           @default(3)
  totalAnalyses        Int           @default(0)
  weeklyResetDate      DateTime      @default(now())
  isActive             Boolean       @default(true)
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
  
  historyItems         HistoryItem[]
  wardrobeItems        WardrobeItem[]
  capsules             Capsule[]
}
```

#### HistoryItem

```prisma
model HistoryItem {
  id                String   @id @default(uuid())
  userId            String
  photoData         String   @db.Text
  technicalAnalysis String   @db.Text
  analysisText      String?  @db.Text
  isPublic          Boolean  @default(true)
  createdAt         DateTime @default(now())
  
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

#### WardrobeItem

```prisma
model WardrobeItem {
  id          Int           @id @default(autoincrement())
  userId      String
  imageUrl    String
  category    String
  color       String
  material    String?
  style       String?
  fit         String?
  description String?       @db.Text
  createdAt   DateTime      @default(now())
  
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  capsuleItems CapsuleItem[]
}
```

#### Capsule

```prisma
model Capsule {
  id          Int           @id @default(autoincrement())
  userId      String
  name        String
  description String?       @db.Text
  createdAt   DateTime      @default(now())
  
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  items       CapsuleItem[]
}
```

#### CapsuleItem

```prisma
model CapsuleItem {
  id              Int          @id @default(autoincrement())
  capsuleId       Int
  wardrobeItemId  Int
  
  capsule         Capsule      @relation(fields: [capsuleId], references: [id], onDelete: Cascade)
  wardrobeItem    WardrobeItem @relation(fields: [wardrobeItemId], references: [id], onDelete: Cascade)
}
```

### Prisma клиент - lib/prisma.js

```javascript
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

module.exports = prisma;
```

### Использование Prisma

#### Создание записи

```javascript
const user = await prisma.user.create({
  data: {
    telegramId: BigInt(123456789),
    firstName: 'John',
    analysesCount: 3
  }
});
```

#### Получение записи

```javascript
const user = await prisma.user.findUnique({
  where: { telegramId: BigInt(123456789) }
});
```

#### Обновление записи

```javascript
const user = await prisma.user.update({
  where: { id: userId },
  data: {
    analysesCount: { decrement: 1 },
    totalAnalyses: { increment: 1 }
  }
});
```

#### Удаление записи

```javascript
await prisma.wardrobeItem.delete({
  where: { id: itemId }
});
```

#### Запросы с связями

```javascript
const capsule = await prisma.capsule.findUnique({
  where: { id: capsuleId },
  include: {
    items: {
      include: {
        wardrobeItem: true
      }
    }
  }
});
```

#### Количество записей

```javascript
const count = await prisma.historyItem.count({
  where: { userId }
});
```

#### Сортировка

```javascript
const oldest = await prisma.historyItem.findFirst({
  where: { userId },
  orderBy: { createdAt: 'asc' }
});
```

---

## Утилиты

### Telegram утилиты - utils/telegram.js

#### `validateTelegramWebAppData(initData): Object`

Валидация initData из Telegram WebApp.

**Параметры:**
- `initData` - строка initData

**Что делает:**
1. Парсит query string
2. Извлекает hash
3. Вычисляет HMAC-SHA256
4. Сравнивает с переданным hash
5. Парсит данные пользователя

**Возвращает:**
```javascript
{
  isValid: boolean,
  data: {
    user: {
      id: number,
      first_name: string,
      last_name: string,
      username: string,
      photo_url: string
    }
  },
  error?: string
}
```

**Использует:**
- `process.env.BOT_TOKEN` - Telegram bot token
- crypto.createHmac для HMAC-SHA256

---

## Контроллеры

### Логирование - controllers/logsController.js

#### Экспортируемые функции

##### `logger`

Winston logger instance.

**Уровни:**
- `error` - ошибки
- `warn` - предупреждения
- `info` - информация
- `debug` - отладка

**Пример:**
```javascript
logger.info('User authenticated', { userId });
logger.error('Database error', { error: error.message });
```

##### `logApiError(endpoint, error, context)`

Логирование ошибок API.

**Параметры:**
- `endpoint` - путь API endpoint
- `error` - объект ошибки
- `context` - дополнительный контекст

##### `logSuccess(message, data)`

Логирование успешных операций.

**Параметры:**
- `message` - сообщение
- `data` - данные операции

### Конфигурация Winston

```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

---

## Переменные окружения

### Обязательные

```env
# Домен и порт
DOMAIN=your-domain.com
PORT=443

# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/tgstyle

# Telegram Bot
BOT_TOKEN=your_telegram_bot_token
```

### Опциональные

```env
# Окружение
NODE_ENV=production

# SSL сертификаты
HTTPS_KEY_PATH=./ssl/keys/server.key
HTTPS_CERT_PATH=./ssl/certs/server.crt

# FastVLM сервер
FASTVLM_HOST=http://127.0.0.1
FASTVLM_PORT=3001

# Логирование
LOG_LEVEL=info
```

---

## Безопасность

### 1. HTTPS соединение

Обязательное использование HTTPS для Telegram Mini Apps.

### 2. Валидация initData

Все запросы валидируются через `validateTelegramWebAppData()`.

### 3. Проверка принадлежности

Перед удалением/изменением проверяется принадлежность ресурса пользователю.

### 4. Лимиты размеров

- JSON body: 10MB
- Файлы: настраивается в multer

### 5. Graceful shutdown

Корректное завершение при получении SIGTERM/SIGINT.

### 6. Обработка ошибок

Централизованная обработка с логированием.

---

## Troubleshooting

### Ошибка подключения к PostgreSQL

```bash
Error: Can't reach database server at `localhost:5432`
```

**Решение:**
1. Проверьте запущен ли PostgreSQL
2. Проверьте DATABASE_URL в .env
3. Проверьте доступность порта 5432

### Ошибка SSL сертификатов

```bash
Error: SSL ключ не найден
```

**Решение:**
1. Создайте SSL сертификаты
2. Укажите правильные пути в .env
3. Убедитесь что файлы существуют

### FastVLM сервер недоступен

```bash
Error: ECONNREFUSED 127.0.0.1:3001
```

**Решение:**
1. Запустите FastVLM сервер
2. Проверьте FASTVLM_PORT в .env
3. Проверьте логи FastVLM сервера

### Ошибка валидации initData

```bash
Error: Invalid initData hash
```

**Решение:**
1. Проверьте BOT_TOKEN в .env
2. Убедитесь что токен совпадает с ботом
3. Проверьте что приложение открыто через Telegram

---

## Производительность

### 1. Оптимизация изображений

Все изображения оптимизируются через Sharp перед сохранением:
- Resize до 800x800px
- JPEG качество 0.85
- Сжатие размера на 70-80%

### 2. Лимит истории

Максимум 50 записей на пользователя:
- Автоматическое удаление старых
- Экономия места в БД
- Быстрые запросы

### 3. Индексы БД

- `User.telegramId` - unique index
- `HistoryItem.userId` - index
- `WardrobeItem.userId` - index
- `Capsule.userId` - index

### 4. Cascade удаление

При удалении User автоматически удаляются:
- Все HistoryItem
- Все WardrobeItem
- Все Capsule
- Все CapsuleItem

---

## API Response Стандарты

### Успешный ответ

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

### Ответ с ошибкой

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "User-friendly message",
  "details": {} // только в development
}
```

### Ответ с пагинацией

```json
{
  "success": true,
  "items": [],
  "total": 100,
  "limit": 20,
  "offset": 0,
  "hasMore": true
}
```

---

**Конец документации серверной части.**
