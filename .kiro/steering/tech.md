# Технологический стек TgStyle

## Обзор архитектуры

TgStyle построен как микросервисная архитектура с тремя основными компонентами:

1. **Client** - Telegram Mini App (TypeScript/Vite)
2. **Server** - REST API (Node.js/Express/Prisma)
3. **FastVLM** - AI сервис (Python/Flask)

## Frontend (Client)

### Основные технологии

**Runtime & Build:**
- **TypeScript 5.3+** - Строгая типизация
- **Vite 7.1+** - Сборщик и dev server
- **ES2020** - Target для современных браузеров
- **Node.js 18+** - Минимальная версия

**UI Framework:**
- **Vanilla TypeScript** - Без фреймворков для минимального размера
- **Fabric.js 6.7+** - Canvas редактор для капсул
- **HammerJS 2.0+** - Touch жесты и свайпы

**Стили:**
- **CSS3** - Нативные CSS переменные и Grid
- **CSS Modules** - Изолированные стили (планируется)
- **Responsive Design** - Mobile-first подход

### Архитектурные паттерны

**Модульная система:**
```typescript
// Каждый модуль экспортирует singleton
export const wardrobeManager = new WardrobeManager();

// Импорт в других модулях
import { wardrobeManager } from '@/modules/wardrobe/WardrobeManager';
```

**Событийная система:**
```typescript
// Связь между модулями через события
window.dispatchEvent(new CustomEvent('wardrobe:item-added', {
  detail: { item }
}));
```

**Path aliases:**
```typescript
// tsconfig.json и vite.config.ts
"@/*": ["client/src/*"],
"@/types/*": ["client/src/types/*"],
"@/modules/*": ["client/src/modules/*"],
"@/utils/*": ["client/src/utils/*"]
```

### Состояние и кэширование

**Трехуровневое кэширование:**
1. **Память** - DataCacheManager (мгновенный доступ)
2. **localStorage** - Кэш при перезагрузке
3. **Сервер** - Источник истины

**Оптимистичные обновления:**
- UI обновляется мгновенно
- Синхронизация с сервером в фоне
- Автоматический откат при ошибках

## Backend (Server)

### Основные технологии

**Runtime:**
- **Node.js 18+** - LTS версия
- **Express.js 4.18+** - Web framework
- **TypeScript** - Планируется миграция с JavaScript

**База данных:**
- **PostgreSQL 15+** - Основная БД
- **Prisma 6.16+** - ORM и миграции
- **Redis** - Кэширование (планируется)

**Обработка файлов:**
- **Sharp 0.34+** - Оптимизация изображений
- **Multer 1.4+** - Загрузка файлов
- **fs-extra** - Работа с файловой системой

### Архитектура API

**REST API структура:**
```
server/src/
├── api/              # API роуты
│   ├── analyze.js    # POST /api/analyze
│   ├── wardrobe.js   # CRUD /api/wardrobe
│   ├── capsules.js   # CRUD /api/capsules
│   └── auth.js       # POST /api/auth
├── middleware/       # Middleware
│   └── telegramAuth.js
├── services/         # Бизнес-логика
│   └── FileService.js
└── lib/             # Библиотеки
    └── prisma.js    # Prisma client
```

**Middleware stack:**
- CORS для кросс-доменных запросов
- JSON parser с лимитом 50MB
- Telegram authentication
- Error handling
- Request logging

### Безопасность

**HTTPS обязательно:**
- SSL сертификаты для домена
- TLS 1.2+ поддержка
- Telegram Mini App требует HTTPS

**Аутентификация:**
```javascript
// Валидация Telegram WebApp initData
function validateTelegramWebAppData(initData) {
  // Проверка подписи через bot token
  // Извлечение данных пользователя
  // Создание/обновление в БД
}
```

## AI Service (FastVLM)

### Технологии

**Python Stack:**
- **Python 3.9+** - Минимальная версия
- **Flask 2.3+** - Web framework
- **Waitress 3.0+** - WSGI server

**AI/ML:**
- **PyTorch 2.4+** - ML framework
- **Transformers 4.45+** - Hugging Face
- **FastVLM** - Кастомная модель
- **CUDA** - GPU ускорение (опционально)

**Computer Vision:**
- **Pillow 10.0+** - Обработка изображений
- **OpenCV 4.10+** - Computer vision
- **rembg 2.0+** - Удаление фона

### Модели

**Доступные модели:**
- **llava-fastvithd_1.5b** - Быстрая модель (основная)
- **llava-fastvithd_7b** - Точная модель (опционально)

**Endpoints:**
- `POST /analyze` - Анализ стиля
- `POST /classify-clothing` - Классификация одежды
- `POST /remove-background` - Удаление фона
- `POST /generate-capsules-mock` - Генерация образов

## База данных

### PostgreSQL Schema

**Основные таблицы:**
```sql
-- Пользователи
users (id, telegramId, firstName, analysesCount, ...)

-- Гардероб
wardrobe_items (id, telegramId, imagePath, category, color, ...)

-- Капсулы
capsules (id, telegramId, canvasData, thumbnailPath, ...)

-- История анализов
history_items (id, userId, photoPath, analysisText, ...)

-- Лайки
ratings (userId, historyItemId, ratingType)
capsule_likes (userId, capsuleId)
```

**Индексы для производительности:**
- Все внешние ключи проиндексированы
- Составные индексы для частых запросов
- Индексы на поля сортировки (createdAt DESC)

### Prisma ORM

**Конфигурация:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Миграции:**
- Все изменения схемы через миграции
- Версионирование изменений
- Rollback стратегия

## Развертывание

### Development

**Локальная разработка:**
```bash
# FastVLM сервер
cd fastvlm-server
python server.py

# Основное приложение
npm run build
npm start
```

**Vite dev server:**
```bash
npm run dev  # Клиент на порту 5173
```

### Production

**Docker контейнеры:**
```yaml
services:
  client:
    build: ./client
    ports: ["443:443"]
    
  server:
    build: ./server
    depends_on: [postgres]
    
  fastvlm:
    build: ./fastvlm-server
    ports: ["3001:3001"]
    
  postgres:
    image: postgres:15
    volumes: [postgres_data:/var/lib/postgresql/data]
```

**SSL сертификаты:**
- Let's Encrypt автообновление
- Хранение в `ssl/` директории
- Обязательно для Telegram Mini App

## Мониторинг

### Логирование

**Winston logger:**
```typescript
logger.info('Operation completed', { userId, operation, duration });
logger.warn('Potential issue', { context });
logger.error('Error occurred', { error, stack });
```

**Уровни логов:**
- `error` - Критические ошибки
- `warn` - Предупреждения
- `info` - Информационные сообщения
- `debug` - Отладочная информация

### Метрики

**Производительность:**
- Время ответа API endpoints
- Размеры изображений до/после оптимизации
- Использование памяти и CPU
- Количество активных пользователей

**Бизнес-метрики:**
- Конверсия в анализы
- Retention пользователей
- Популярность функций
- Ошибки и их частота

## Инструменты разработки

### IDE и редакторы

**Рекомендуемые:**
- **VS Code** с расширениями:
  - TypeScript and JavaScript Language Features
  - Prisma
  - Vite
  - ESLint
  - Prettier

### Отладка

**Клиент:**
- Browser DevTools
- Telegram Web Inspector
- Vite HMR для быстрой разработки

**Сервер:**
- Node.js Inspector
- Prisma Studio для БД
- Winston logs в файлах

**AI сервис:**
- Python debugger
- Flask debug mode
- CUDA profiler для GPU

## Версионирование

### Git workflow

**Ветки:**
- `main` - Production код
- `develop` - Development ветка
- `feature/*` - Новые функции
- `hotfix/*` - Критические исправления

**Коммиты:**
- Conventional commits
- Описательные сообщения
- Атомарные изменения

### Релизы

**Семантическое версионирование:**
- `MAJOR.MINOR.PATCH`
- Breaking changes = MAJOR
- Новые функции = MINOR
- Исправления = PATCH

## Производительность

### Оптимизации

**Клиент:**
- Tree shaking неиспользуемого кода
- Code splitting по модулям
- Lazy loading изображений
- Service Worker кэширование

**Сервер:**
- Кэширование статических файлов (1 год)
- Gzip сжатие ответов
- Connection pooling для БД
- Оптимизация SQL запросов

**AI сервис:**
- GPU ускорение когда доступно
- Batch обработка запросов
- Кэширование результатов
- Оптимизация размеров изображений

## Будущие улучшения

### Планируемые технологии

**Клиент:**
- React/Vue для сложных UI
- PWA для offline работы
- WebAssembly для тяжелых вычислений

**Сервер:**
- GraphQL для гибких запросов
- Redis для кэширования
- Microservices архитектура

**AI:**
- Собственные модели
- Edge computing
- Real-time inference

### Масштабирование

**Горизонтальное:**
- Load balancer (Nginx)
- Multiple server instances
- Database sharding

**Вертикальное:**
- Более мощные серверы
- SSD диски
- Больше RAM для кэширования

## Заключение

Технологический стек TgStyle оптимизирован для:
- Быстрой разработки
- Высокой производительности
- Легкого масштабирования
- Простой поддержки

Все технологии проверены в production и имеют активную поддержку сообщества.