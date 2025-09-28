# TgStyle Server - Полная документация серверной части

## Обзор архитектуры

**TgStyle Server** - это Node.js/Express сервер для Telegram Mini App, предоставляющий REST API для анализа изображений одежды с помощью FastVLM AI. Сервер работает с PostgreSQL базой данных через Prisma ORM и включает комплексную систему логирования.

## Технологии и зависимости

- **Backend**: Node.js + Express.js
- **База данных**: PostgreSQL с Prisma ORM
- **Аутентификация**: Telegram WebApp API валидация
- **HTTPS**: SSL/TLS сертификаты (обязательно для Telegram Mini App)
- **Логирование**: Winston с ротацией файлов
- **Валидация**: Собственная система валидации данных
- **AI интеграция**: HTTP клиент для FastVLM сервера

## Структура файлов

```
server/
├── server.js              # Основной Express.js сервер
├── package.json           # Зависимости Node.js
├── routes/
│   └── api.js            # API маршруты (логи, ping)
├── src/
│   ├── api/              # API эндпоинты
│   │   ├── auth.js       # Авторизация пользователей
│   │   ├── analyze.js    # Анализ изображений
│   │   ├── history.js    # Управление историей
│   │   └── subscription.js # Управление подписками
│   ├── controllers/      # Бизнес-логика
│   │   └── logsController.js # Логирование
│   ├── lib/             # Внешние зависимости
│   │   └── prisma.js    # Prisma клиент
│   ├── middleware/      # Middleware функции
│   ├── models/          # Модели данных (устаревшие)
│   ├── services/        # Бизнес-логика
│   └── utils/           # Утилиты
│       └── telegram.js  # Валидация Telegram данных
└── ssl/                 # SSL сертификаты
```

## Детальное описание модулей

### 1. `server.js` - Главный сервер

**Ответственность**: Инициализация Express приложения, настройка HTTPS, маршрутизация, обработка ошибок, graceful shutdown.

**Ключевые функции**:

#### `startServer(): Promise<void>`
- **Что делает**: Полная инициализация сервера
- **Последовательность**:
  1. Проверяет переменные окружения (DOMAIN обязателен)
  2. Подключается к PostgreSQL через Prisma
  3. Создает HTTPS сервер с SSL сертификатами
  4. Настраивает Express middleware (CORS, JSON parsing, статика)
  5. Регистрирует API маршруты
  6. Запускает сервер на порту 443
  7. Настраивает обработчики graceful завершения

#### `createHttpsServer(): https.Server`
- **Что делает**: Создает HTTPS сервер с SSL сертификатами
- **Проверки**:
  - Наличие файлов `ssl/keys/server.key` и `ssl/certs/server.crt`
  - Корректность сертификатов
- **Fallback**: Выход из процесса при ошибке сертификатов

**Middleware**:
- `cors()` - Разрешает кросс-доменные запросы
- `express.json({ limit: '10mb' })` - Парсинг JSON до 10MB
- `express.static()` - Статические файлы клиента
- Централизованная обработка ошибок

**Маршруты**:
- `GET /` - Главная страница (клиент)
- `GET /api/health` - Проверка здоровья сервера
- `POST /api/auth` - Авторизация пользователей
- `POST /api/analyze` - Анализ изображений
- `GET /api/history` - Получение истории
- `PUT /api/history/:id` - Обновление истории
- `DELETE /api/history/:id` - Удаление из истории
- `GET /api/history/public` - Публичная лента
- `POST /api/log-client` - Сохранение клиентских логов

### 2. `src/api/auth.js` - Авторизация пользователей

**Ответственность**: Аутентификация через Telegram, управление пользователями в БД, подписки.

**Ключевые функции**:

#### `createOrUpdateUser(telegramUserData): Promise<User>`
- **Что делает**: Создает нового пользователя или обновляет существующего
- **Последовательность**:
  1. Ищет пользователя по `telegramId` (BigInt)
  2. Если найден - обновляет данные (имя, аватар, активность)
  3. Если не найден - создает нового с дефолтными лимитами
  4. Проверяет и обновляет weekly reset

#### `checkAndUpdateWeeklyReset(user): Promise<User>`
- **Что делает**: Проверяет и обновляет недельные лимиты
- **Логика**:
  - Проверяет дату последнего сброса
  - Если прошло больше недели - сбрасывает лимит до 3 для free пользователей
  - Обновляет дату следующего сброса

#### `formatUserResponse(user): Object`
- **Что делает**: Форматирует ответ с информацией о пользователе
- **Преобразования**:
  - `BigInt` → `String` для JSON сериализации
  - Проверяет активность Premium подписки
  - Устанавливает `-1` для безлимитных анализов

**API эндпоинт**: `POST /api/auth`

### 3. `src/api/analyze.js` - Анализ изображений

**Ответственность**: Проверка лимитов, отправка в FastVLM, сохранение результатов.

**Ключевые функции**:

#### `analyzeImage(imageBuffer, nickname): Promise<Object>`
- **Что делает**: Отправляет изображение в FastVLM сервер
- **Процесс**:
  1. Конвертирует Buffer в base64
  2. Создает AbortController с таймаутом 30 сек
  3. Отправляет POST запрос на FastVLM
  4. Очищает текст от проблем кодировки
  5. Возвращает результат анализа

#### `checkAnalysisLimits(user): Object`
- **Что делает**: Проверяет лимиты анализа пользователя
- **Логика**:
  - Premium пользователи: без ограничений
  - Free пользователи: проверка `analysesCount > 0`
  - Возврат причины и оставшихся анализов

#### `updateUserCounters(userId): Promise<User>`
- **Что делает**: Обновляет счетчики после анализа
- **Действия**:
  - Уменьшает `analysesCount` на 1
  - Увеличивает `totalAnalyses` на 1
  - Обновляет `updatedAt`

#### `saveAnalysisToHistory(userId, photoData, technicalAnalysis): Promise<HistoryItem>`
- **Что делает**: Сохраняет результат анализа в БД
- **Сохраняет**:
  - `userId` - владелец
  - `photoData` - base64 изображения
  - `technicalAnalysis` - результат ИИ
  - `analysisText` - пустое (для пользовательского описания)
  - `isPublic` - true по умолчанию

**API эндпоинт**: `POST /api/analyze`

### 4. `src/api/history.js` - Управление историей

**Ответственность**: CRUD операции с историей анализов, пагинация, доступ.

**Ключевые функции**:

#### `validatePaginationParams(page, limit): Object`
- **Что делает**: Валидирует параметры пагинации
- **Ограничения**:
  - `page`: минимум 1
  - `limit`: 1-50, по умолчанию 10
  - Вычисляет `offset` для SQL

#### `checkHistoryItemAccess(historyItemId, userId): Promise<HistoryItem>`
- **Что делает**: Проверяет доступ к элементу истории
- **Логика**:
  - Пользователь должен быть владельцем ИЛИ элемент публичный
  - Загружает связанные данные (пользователь, комментарии, рейтинги)

**API эндпоинты**:
- `GET /api/history` - История пользователя с пагинацией
- `GET /api/history/:id` - Конкретный элемент с комментариями
- `PUT /api/history/:id` - Обновление описания/видимости
- `DELETE /api/history/:id` - Удаление элемента
- `GET /api/history/public` - Публичная лента

### 5. `src/api/subscription.js` - Управление подписками

**Ответственность**: Получение и обновление информации о подписках.

**Ключевые функции**:

#### `getUserSubscription(userId): Object`
- **Что делает**: Получает информацию о подписке пользователя
- **Проверяет**:
  - Активность Premium подписки (дата окончания)
  - Возвращает тип, лимиты, даты сброса

**API эндпоинты**:
- `GET /api/subscription/:userId` - Информация о подписке
- `POST /api/subscription/:userId/upgrade` - Обновление подписки

### 6. `src/controllers/logsController.js` - Логирование

**Ответственность**: Winston логгер с перехватом ошибок, ротация файлов.

**Конфигурация**:
- **Уровни**: error(0), warn(1), info(2), http(3), debug(4)
- **Файлы**: server.log, error.log, exceptions.log, rejections.log
- **Ротация**: 5MB, 5 файлов максимум
- **Формат**: JSON + timestamp + stack traces

**Функции**:
- `logger` - основной Winston логгер
- `logApiError()` - middleware для API ошибок
- `logSuccess()` - логирование успешных операций

### 7. `src/utils/telegram.js` - Валидация Telegram

**Ответственность**: Валидация данных из Telegram WebApp.

**Функции**:

#### `validateTelegramWebAppData(initDataString): Object`
- **Что делает**: Валидирует initData от Telegram
- **Алгоритм**:
  1. Парсит URL параметры
  2. Извлекает и проверяет hash
  3. Создает секретный ключ из BOT_TOKEN
  4. Вычисляет HMAC-SHA256 хэш
  5. Сравнивает с полученным hash
  6. Парсит данные пользователя

#### `mockValidateTelegramWebAppData()` - для разработки
- **Что делает**: Создает mock пользователя для тестирования

**Безопасность**: Использует HMAC-SHA256 для валидации подлинности данных.

### 8. `src/lib/prisma.js` - База данных

**Ответственность**: Prisma клиент для PostgreSQL.

**Конфигурация**:
- Логирование запросов в development режиме
- Graceful shutdown обработчик
- Автоматическое отключение при завершении процесса

## База данных схема (Prisma)

### Модели:

#### `User`
```sql
- id: Int (Primary Key)
- telegramId: BigInt (Unique)
- firstName: String
- lastName: String?
- username: String?
- avatarUrl: String?
- subscriptionType: String (free/premium)
- subscriptionEndDate: DateTime?
- analysesCount: Int (текущий лимит)
- totalAnalyses: Int (общий счетчик)
- weeklyResetDate: DateTime
- isActive: Boolean
- createdAt: DateTime
- updatedAt: DateTime
```

#### `HistoryItem`
```sql
- id: Int (Primary Key)
- userId: Int (Foreign Key → User.id)
- photoData: String (base64 изображения)
- technicalAnalysis: String (результат ИИ)
- analysisText: String? (пользовательское описание)
- isPublic: Boolean
- createdAt: DateTime
- updatedAt: DateTime
```

#### `Comment` и `Rating` (социальные функции)
```sql
- Связи с HistoryItem и User
- Рейтинги (like/dislike)
- Комментарии с вложенностью
```

## Последовательность выполнения

### Запуск сервера:
```
1. server.js загружается
2. Проверка переменных окружения (DOMAIN обязателен)
3. Подключение к PostgreSQL через Prisma
4. Создание HTTPS сервера с SSL сертификатами
5. Настройка Express middleware
6. Регистрация API маршрутов
7. Запуск на порту 443
8. Настройка graceful shutdown обработчиков
```

### Процесс анализа изображения:
```
1. POST /api/analyze получает запрос
2. Валидация Telegram initData
3. Проверка пользователя в БД
4. Проверка лимитов анализа
5. Отправка изображения в FastVLM сервер
6. Получение результата анализа
7. Сохранение в историю БД
8. Обновление счетчиков пользователя
9. Возврат результата клиенту
```

### Weekly reset процесс:
```
1. auth.js проверяет дату последнего сброса
2. Если прошла неделя - сбрасывает analysesCount до 3
3. Обновляет weeklyResetDate на следующий понедельник
4. Сохраняет изменения в БД
```

## Внешние интеграции

### Telegram WebApp:
- Валидация initData через HMAC-SHA256
- Получение данных пользователя (ID, имя, аватар)
- Обязательное HTTPS соединение

### FastVLM AI:
- HTTP POST запросы на локальный сервер
- JSON формат: `{image_base64, prompt, nickname}`
- Таймаут 30 секунд
- Fallback при недоступности

### PostgreSQL:
- Prisma ORM для type-safe запросов
- Автоматическая миграция схемы
- Connection pooling и graceful disconnect

### SSL сертификаты:
- Обязательны для Telegram Mini App
- Пути: `ssl/keys/server.key`, `ssl/certs/server.crt`
- Автоматическая проверка при запуске

## Безопасность

### Аутентификация:
- Валидация всех Telegram initData через HMAC-SHA256
- Проверка подписи с секретным ключом бота
- Защита от подделки данных

### Авторизация:
- Проверка владения ресурсами (пользователь → его история)
- Публичный доступ к элементам истории
- Валидация параметров запросов

### Данные:
- Санитизация пользовательского ввода
- Ограничение размеров изображений
- Валидация JSON структур

## Производительность

### Оптимизации:
- Connection pooling для PostgreSQL
- Таймауты для внешних API
- Лимиты пагинации (максимум 50 элементов)
- Компрессия ответов

### Мониторинг:
- Winston логирование всех операций
- Детальное логирование ошибок
- Мониторинг использования ресурсов

## Отладка и разработка

### Логирование:
- 5 уровней логирования (error → debug)
- Ротация файлов (5MB, 5 файлов)
- JSON формат с timestamp и метаданными

### Тестирование:
- Mock валидация для development
- Graceful degradation при ошибках БД
- Fallback режимы для всех критических функций

### Переменные окружения:
```bash
NODE_ENV=production
DOMAIN=your-domain.com
PORT=443
HTTPS_KEY_PATH=ssl/keys/server.key
HTTPS_CERT_PATH=ssl/certs/server.crt
TELEGRAM_BOT_TOKEN=your_bot_token
DATABASE_URL=postgresql://...
LOG_LEVEL=info
```

Эта документация служит полным справочником по серверной части TgStyle, позволяя быстро понять архитектуру, API, базы данных и процессы.
