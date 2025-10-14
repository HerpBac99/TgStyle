# База знаний проекта TgStyle

## Описание проекта

TgStyle - это Telegram Mini App для анализа стиля одежды с использованием AI (FastVLM). Проект состоит из трех основных частей:

1. **Client (TypeScript/JavaScript)** - клиентская часть веб-приложения
2. **Server (Node.js/Express)** - серверная часть с API
3. **FastVLM Server (Python/Flask)** - сервер для AI-анализа изображений

## Структура базы знаний

- [KNOWLEDGE_BASE_CLIENT.md](./KNOWLEDGE_BASE_CLIENT.md) - документация клиентской части
- [KNOWLEDGE_BASE_SERVER.md](./KNOWLEDGE_BASE_SERVER.md) - документация серверной части
- [KNOWLEDGE_BASE_FASTVLM.md](./KNOWLEDGE_BASE_FASTVLM.md) - документация FastVLM сервера
- [MAIN_TAB_INDEX.md](./MAIN_TAB_INDEX.md) - детальная документация главной закладки

## Основные функции проекта

### Клиентская часть
- Аутентификация через Telegram WebApp
- Загрузка и анализ фотографий одежды
- Управление гардеробом пользователя
- Создание капсульных коллекций
- История анализов
- UI управление через модули

### Серверная часть
- REST API для работы с клиентом
- Аутентификация пользователей
- Управление подписками
- Работа с базой данных PostgreSQL
- Интеграция с FastVLM сервером
- Удаление фона с изображений

### FastVLM сервер
- AI-анализ изображений одежды
- Многопроходный анализ (person, clothing, legs, shoes, accessories)
- Классификация предметов одежды
- Интеграция с различными моделями (FastVLM, Gemini, Ollama)
- Умная предобработка изображений

## Технологический стек

### Frontend
- TypeScript
- Vite (сборщик)
- Telegram WebApp API
- Fabric.js (редактор изображений)

### Backend
- Node.js + Express
- PostgreSQL + Prisma ORM
- HTTPS сервер
- Winston (логирование)

### AI Server
- Python 3.x
- Flask + Waitress
- PyTorch
- FastVLM (LLaVA)
- PIL/Pillow (обработка изображений)
- Google Gemini API (опционально)

## Быстрый старт

### Установка зависимостей

```bash
# Клиент
npm install

# Сервер
cd server
npm install

# FastVLM сервер
cd fastvlm-server
pip install -r requirements.txt
```

### Настройка окружения

Создайте `.env` файлы в корневой директории и в директориях server/ и fastvlm-server/

### Запуск

```bash
# Сборка клиента
npm run build

# Запуск сервера
npm start

# Запуск FastVLM сервера
cd fastvlm-server
python start_fastvlm.py
```

## Основные модули

### Клиентские модули
- `main.ts` - точка входа приложения
- `auth.ts` - управление аутентификацией
- `api.ts` - HTTP клиент для API запросов
- `camera.ts` - работа с камерой и загрузкой фото
- `analysis.ts` - управление анализом изображений
- `history.ts` - управление историей анализов
- `logger.ts` - логирование на клиенте
- `uiManager.ts` - главный менеджер UI
- `uiModalManager.ts` - управление модальными окнами
- `uiWardrobe.ts` - UI для гардероба
- `uiCapsules.ts` - UI для капсульных коллекций

### Серверные модули
- `server.js` - основной сервер
- `auth.js` - API авторизации
- `analyze.js` - API анализа изображений
- `wardrobe.js` - API гардероба
- `capsules.js` - API капсульных коллекций
- `backgroundRemoval.js` - удаление фона
- `clothingClassification.js` - классификация одежды

### FastVLM модули
- `server.py` - основной Flask сервер
- `config.py` - конфигурация
- `image_preprocessing.py` - предобработка изображений
- `background_removal.py` - удаление фона с изображений

## Архитектура

```
TgStyle/
├── client/                 # Клиентская часть
│   ├── src/
│   │   ├── main.ts        # Точка входа
│   │   ├── modules/       # Модули приложения
│   │   ├── types/         # TypeScript типы
│   │   └── utils/         # Утилиты
│   ├── css/               # Стили
│   └── index.html         # HTML шаблон
├── server/                 # Серверная часть
│   ├── src/
│   │   ├── api/          # API роуты
│   │   ├── controllers/  # Контроллеры
│   │   ├── lib/          # Библиотеки
│   │   └── utils/        # Утилиты
│   ├── routes/           # Маршруты
│   ├── uploads/          # Загруженные файлы
│   └── server.js         # Основной файл сервера
├── fastvlm-server/        # AI сервер
│   ├── server.py         # Flask сервер
│   ├── config.py         # Конфигурация
│   ├── prompt/           # Промпты для AI
│   ├── models/           # AI модели
│   └── logs/             # Логи
└── dist/                  # Собранные файлы клиента
```

## База данных

Проект использует PostgreSQL с Prisma ORM. Основные таблицы:

- `User` - пользователи
- `HistoryItem` - история анализов
- `WardrobeItem` - предметы гардероба
- `Capsule` - капсульные коллекции
- `CapsuleItem` - элементы капсул

## API Endpoints

### Аутентификация
- `POST /api/auth` - авторизация через Telegram

### Анализ
- `POST /api/analyze` - анализ изображения

### Гардероб
- `GET /api/wardrobe` - получить все вещи
- `POST /api/wardrobe` - добавить вещь
- `DELETE /api/wardrobe/:id` - удалить вещь

### Капсулы
- `GET /api/capsules` - получить все капсулы
- `POST /api/capsules` - создать капсулу
- `DELETE /api/capsules/:id` - удалить капсулу

### Дополнительно
- `POST /api/remove-background` - удаление фона
- `POST /api/classify-clothing` - классификация одежды
- `GET /api/health` - проверка здоровья сервера

## Конфигурация

### Переменные окружения (корневая директория)

```env
# Сервер
DOMAIN=your-domain.com
PORT=443
NODE_ENV=production

# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/tgstyle

# Telegram
BOT_TOKEN=your_bot_token

# FastVLM
FASTVLM_HOST=http://127.0.0.1
FASTVLM_PORT=3001
```

### Переменные окружения FastVLM сервера

```env
# Модель
MODEL_PATH=./models/ml-fastvlm
LOAD_4BIT=false
LOAD_8BIT=false

# Сервер
SERVER_HOST=127.0.0.1
SERVER_PORT=3001

# GPU
CUDA_VISIBLE_DEVICES=0
```

## Troubleshooting

### Проблемы с FastVLM
- Убедитесь что PyTorch установлен с поддержкой CUDA (для GPU)
- Проверьте пути к моделям в config.py
- Проверьте доступность портов

### Проблемы с сервером
- Убедитесь что SSL сертификаты настроены правильно
- Проверьте подключение к PostgreSQL
- Проверьте доступность FastVLM сервера

### Проблемы с клиентом
- Убедитесь что проект собран (`npm run build`)
- Проверьте консоль браузера на наличие ошибок
- Убедитесь что приложение открыто через Telegram

## Лицензия

MIT

## Контакты

Для вопросов и предложений создавайте issues в репозитории проекта.
