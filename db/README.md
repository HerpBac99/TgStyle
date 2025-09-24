# 🗄️ TgStyle Database Setup

Настройка базы данных PostgreSQL + Redis для Telegram Style App.

## 🚀 Быстрый запуск

### 1. Запустить Docker контейнеры
```bash
cd docker
docker-compose -f docker-compose.db.yml up -d
```

### 2. Проверить что контейнеры запущены
```bash
docker ps
```
Должны быть запущены:
- `telegramstyle-postgres` (порт 5432)
- `telegramstyle-redis` (порт 6379)
- `telegramstyle-adminer` (порт 8080)

### 3. Создать структуру БД и сгенерировать Prisma клиент
```bash
cd db
npm run db:push
npm run db:generate
```

### 4. Заполнить тестовыми данными
```bash
npm run db:seed
```

### 5. Проверить подключение
```bash
node test-connection.js
```

## 🛠️ Команды

| Команда | Описание |
|---------|----------|
| `npm run db:push` | Создать/обновить структуру БД |
| `npm run db:generate` | Сгенерировать Prisma клиент |
| `npm run db:migrate` | Создать миграцию (для продакшена) |
| `npm run db:studio` | Открыть Prisma Studio (веб-интерфейс) |
| `npm run db:seed` | Заполнить БД тестовыми данными |

## 📊 Доступ к данным

### Adminer (веб-интерфейс)
- **URL**: http://localhost:8080
- **Система**: PostgreSQL
- **Сервер**: host.docker.internal
- **Пользователь**: telegramstyle_user
- **Пароль**: telegramstyle_password_123
- **База**: telegramstyle

### Prisma Studio
```bash
npm run db:studio
```
Открывает веб-интерфейс для работы с данными.

## 🔧 Конфигурация

### Переменные окружения (.env)
```bash
DATABASE_URL="postgresql://telegramstyle_user:telegramstyle_password_123@localhost:5432/telegramstyle?schema=public"
REDIS_URL="redis://localhost:6379"
```

### Docker контейнеры

**PostgreSQL**:
- **Образ**: postgres:15-alpine
- **База**: telegramstyle
- **Пользователь**: telegramstyle_user
- **Пароль**: telegramstyle_password_123

**Redis**:
- **Образ**: redis:7-alpine
- **Порт**: 6379

## 📋 Схема базы данных

### Users (Пользователи)
```sql
- id: PRIMARY KEY
- telegramId: BIGINT UNIQUE (Telegram ID)
- firstName, lastName, username: VARCHAR
- avatarUrl: TEXT
- analysesCount: INT DEFAULT 3 (доступно анализов в неделю)
- subscriptionType: VARCHAR DEFAULT 'free' ('free' | 'premium')
- subscriptionEndDate: TIMESTAMP NULL
- totalAnalyses: INT DEFAULT 0 (всего сделано анализов)
- weeklyResetDate: TIMESTAMP (когда сбросится счетчик)
```

### HistoryItems (История анализов)
```sql
- id: PRIMARY KEY
- userId: FOREIGN KEY -> users(id)
- photoData: TEXT (base64 изображение)
- analysisText: TEXT (пользовательское описание)
- technicalAnalysis: TEXT (техническое описание ИИ)
- isPublic: BOOLEAN DEFAULT true
```

### Ratings, Comments, Notifications
Социальные функции для взаимодействия пользователей.

## 🧪 Тестирование

### Проверка подключения
```bash
node test-connection.js
```

### Тестовые данные
После запуска `npm run db:seed` в базе будут:
- 1 тестовый пользователь
- 1 элемент истории
- 1 комментарий
- 1 оценка

## 🔄 Миграции

Для продакшена используйте миграции:
```bash
# Создать миграцию
npx prisma migrate dev --name init

# Применить миграции
npx prisma migrate deploy
```

## 🚨 Troubleshooting

### Ошибка подключения к PostgreSQL
1. Проверить что Docker запущен
2. Проверить что контейнер postgres запущен: `docker ps`
3. Проверить логи: `docker logs telegramstyle-postgres`

### Ошибка подключения к Redis
1. Проверить что контейнер redis запущен
2. Проверить порт 6379: `telnet localhost 6379`

### Ошибка Prisma
1. Перегенерировать клиент: `npm run db:generate`
2. Проверить .env файл
3. Проверить что БД доступна

## 📝 Следующие шаги

Когда БД настроена и работает:

1. ✅ Сказать "OK" для интеграции в приложение
2. 🔧 Добавить Prisma клиент в server/src/
3. 📡 Создать API эндпоинты для работы с БД
4. 🔐 Настроить миграцию данных из localStorage
5. 💳 Реализовать систему подписок
