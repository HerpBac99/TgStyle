# Технологический стек

## Архитектура

Мультисервисная архитектура:
- **Client**: TypeScript + Vite (SPA)
- **Server**: Node.js + Express (API)
- **AI Service**: Python Flask (FastVLM vision model)
- **Database**: PostgreSQL + Prisma ORM
- **Cache**: Redis

## Frontend

- **Язык**: TypeScript (ES2020)
- **Сборка**: Vite 7.x
- **UI**: Vanilla TypeScript, модульная архитектура
- **Canvas**: Fabric.js для редактора капсул
- **Стили**: CSS модули (mainMenu.css, wardrobe.css, capsules.css, publicFeed.css)
- **Path Aliases**: `@/` → `client/src/`, `@/modules/` → `client/src/modules/`

## Backend

- **Runtime**: Node.js ≥18.0.0
- **Framework**: Express 4.x
- **БД**: PostgreSQL 15 + Prisma 5.x
- **Изображения**: Sharp, Multer
- **Логирование**: Winston
- **SSL**: HTTPS обязателен (сертификаты в ssl/)

## AI Сервис (FastVLM)

- **Язык**: Python 3.x
- **Framework**: Flask
- **Модель**: FastVLM 1.5B (llava-fastvithd stage3)
- **GPU**: CUDA с fallback на CPU
- **Порт**: 3001 (локально)
- **Фичи**: Удаление фона (rembg), препроцессинг

## Схема БД

Основные модели (детали в `db/prisma/schema.prisma`):
- `User`: Пользователи Telegram + подписка
- `HistoryItem`: История анализов + шеринг
- `WardrobeItem`: Вещи с классификацией (категория, цвет, стиль, материал)
- `Capsule`: Образы с canvas данными
- `Rating`, `Comment`, `Notification`: Социальные фичи

## Команды

### Разработка
```bash
npm install                    # Установка зависимостей

python start_llm.py           # Терминал 1: FastVLM сервер
python start_app.py           # Терминал 2: Основное приложение

npm run type-check            # Проверка типов
```

### Сборка и деплой
```bash
npm run build                 # Сборка клиента
npm start                     # Production сервер

# База данных
cd db
npm run db:generate           # Генерация Prisma client
npm run db:push               # Push схемы
npm run db:migrate            # Миграции
npm run db:studio             # Prisma Studio
```

### Docker
```bash
cd docker
docker-compose up -d
```

### Тестирование
```bash
python test_fastvlm.py        # Тест FastVLM API
```

## Переменные окружения

В `.env`:
- `NODE_ENV`: production/development
- `PORT`: Порт сервера (8443)
- `DOMAIN`: Домен
- `DATABASE_URL`: PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN`: Токен бота
- `FASTVLM_URL`: URL FastVLM сервиса

## Порты

- **8443**: Node.js сервер (HTTPS)
- **3001**: FastVLM Python сервис
- **5173**: Vite dev server
- **5432**: PostgreSQL
- **6379**: Redis
