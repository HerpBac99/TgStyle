# 🚨 TgStyle - Telegram Mini App

## ⚠️ АРХИТЕКТУРНЫЙ СТАТУС ПРОЕКТА

**Текущая архитектура имеет критические проблемы:**
- ❌ FastVLM сервер не контейнеризован
- ❌ Монолитный клиент (1544 строки в одном файле)
- ❌ Отсутствие TypeScript
- ❌ Слабая система логирования

**См. [ref_plan.md](ref_plan.md) для детального плана рефакторинга**

---

Telegram Mini App для анализа стиля одежды с помощью ИИ. Приложение позволяет загружать фотографии одежды и получать персональные рекомендации по стилю.

## 🚀 Быстрый старт

### Установка зависимостей
```bash
npm install
```

### Локальный запуск для разработки
```bash
# Терминал 1: Запуск FastVLM сервера
cd fastvlm-server
python server.py

# Терминал 2: Запуск основного приложения
npm run build
npm start
```

### Альтернативный способ (скрипты)
```bash
# Сделать скрипты исполняемыми
chmod +x start-llm.sh start-app.sh

# Терминал 1
./start-llm.sh

# Терминал 2
./start-app.sh
```

### Разработка (legacy)
```bash
# Запуск клиента (Vite dev server)
npm run dev

# Запуск сервера с hot-reload
npm run dev:server
```

## 📁 Структура проекта

```
tgstyle/
├── ⚠️ client/                    # ❌ МОНолитный клиент (1544 строки)
│   ├── css/
│   │   └── styles.css           # Стили приложения
│   ├── js/
│   │   ├── scripts.js           # ❌ Основная логика (нужен рефакторинг)
│   │   └── logger.js            # Система логирования
│   └── index.html               # Главная страница
├── ⚠️ server/                    # Node.js сервер
│   ├── src/
│   │   ├── api/                 # API эндпоинты
│   │   ├── models/              # Модели данных
│   │   └── utils/               # Утилиты
│   └── server.js                # Основной сервер
├── 🆕 fastvlm-server/           # ✅ FastVLM Python сервер
│   ├── server.py               # Flask сервер для ИИ
│   ├── requirements.txt        # Python зависимости
│   ├── models/                 # Симлинк на ml-fastvlm
│   └── README.md               # Инструкции
├── ⚠️ ml-fastvlm/               # Модели ИИ (оригинальные файлы)
│   ├── checkpoints/            # Обученные модели
│   └── llava/                  # FastVLM библиотека
├── ⚠️ fastvlm_env/              # Python окружение (для разработки)
├── ssl/                        # SSL сертификаты
├── docker/                     # Docker конфигурация (будет обновлена)
├── start-llm.sh               # 🆕 Скрипт запуска LLM
├── start-app.sh               # 🆕 Скрипт запуска приложения
└── ref_plan.md                 # ✅ План рефакторинга
```

### 🎯 Текущая архитектура:
- **FastVLM**: Отдельный Python сервер (локально в двух терминалах)
- **Приложение**: Node.js + Express
- **Клиент**: Vanilla JS (нужен рефакторинг)
- **Коммуникация**: HTTP между сервисами

### 📋 Следующие шаги:
1. **Фаза 0**: Реструктуризация FastVLM в отдельную папку
2. **Фаза 1**: TypeScript + модульная архитектура клиента
3. **Фаза 2**: Middleware система для сервера
4. **Фаза 3**: Docker контейнеризация (для production)

## 🔧 Конфигурация

### 🎯 Рекомендуемая архитектура (после рефакторинга):

```
tgstyle/
├── client/                    # ✅ Модульный клиент с TypeScript
│   ├── src/
│   │   ├── core/TgStyleApp.ts # Главный класс приложения
│   │   ├── services/          # Сервисы (Telegram, Camera, Analysis)
│   │   └── components/        # UI компоненты
├── server/                    # ✅ Node.js сервер с middleware
│   ├── services/              # Бизнес-логика
│   ├── middleware/            # Middleware система
│   └── config/                # Конфигурация
├── fastvlm/                   # ✅ Отдельный Python сервис
│   └── Dockerfile             # Контейнеризация
└── docker-compose.yml         # ✅ Оркестрация всех сервисов
```

### Переменные окружения

Создайте файл `.env` в корне проекта:

```bash
# Environment Configuration
NODE_ENV=production
PORT=443
DOMAIN=tgstyle.flappy.crazedns.ru

# FastVLM Service (после рефакторинга)
FASTVLM_URL=http://fastvlm:3001
FASTVLM_TIMEOUT=30000

# Database (optional)
MONGODB_URI=mongodb://localhost:27017/tgstyle

# SSL Certificates (optional)
HTTPS_CERT_PATH=/path/to/cert.pem
HTTPS_KEY_PATH=/path/to/key.pem
```

## 🐳 Docker развертывание

```bash
cd docker
docker-compose up -d
```

## 📡 API Эндпоинты

### Основные роуты

- `GET /` - Главная страница приложения
- `GET /api/health` - Проверка работоспособности сервера
- `POST /api/auth` - Аутентификация через Telegram
- `POST /api/analyze` - Анализ изображения одежды

## 🔐 SSL Сертификаты

Приложение использует HTTPS для работы с Telegram Mini Apps. Сертификаты должны находиться в:

- `ssl/certs/server.crt` - SSL сертификат
- `ssl/keys/server.key` - Приватный ключ

## 🛠️ Разработка

### Добавление новых функций

1. **Клиентская часть**: Добавляйте код в `client/js/`
2. **Серверная часть**: Добавляйте API в `server/src/api/`
3. **Стили**: Используйте `client/css/styles.css`

### Сборка для продакшена

```bash
npm run build
```

Собранные файлы будут в папке `dist/`.

## 📋 Скрипты

- `npm start` - Запуск в продакшене
- `npm run dev` - Запуск Vite dev server
- `npm run dev:server` - Запуск сервера с nodemon
- `npm run build` - Сборка клиента

## 🔍 Логирование

Логи сервера сохраняются в:
- `server/logs/server-all.log`
- `server/logs/server-api.log`
- `server/logs/server-errors.log`

## 🤝 Contributing

1. Fork проект
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 📞 Контакты

- Проект: [TgStyle](https://github.com/your-username/tgstyle)
- Telegram: [@your_bot](https://t.me/your_bot)