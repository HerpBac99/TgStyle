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

#### 🔥 ПЕРВЫЙ ЗАПУСК (один раз):
```bash
# 1. Установка зависимостей FastVLM
cd fastvlm-server
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# 2. Установка зависимостей основного приложения
cd ..
npm install
```

#### 🚀 ОБЫЧНЫЙ ЗАПУСК (каждый раз):
```bash
# Терминал 1: FastVLM сервер
python start_llm.py

# Терминал 2: Основное приложение
python start_app.py
```

### Альтернативный способ (ручной)
```bash
# Терминал 1: FastVLM сервер
cd fastvlm-server
python server.py

# Терминал 2: Основное приложение
npm run build
npm start
```

### Тестирование FastVLM API
```bash
# Автоматическое тестирование всех эндпоинтов
python test_fastvlm.py

# Тестирование с кастомным URL
python test_fastvlm.py --url http://127.0.0.1:3001
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
├── start_llm.py               # 🆕 Скрипт запуска LLM (кроссплатформенный)
├── start_app.py               # 🆕 Скрипт запуска приложения (кроссплатформенный)
├── test_fastvlm.py            # 🆕 Скрипт тестирования API
└── ref_plan.md                 # ✅ План рефакторинга
```

### 🎯 Текущая архитектура:
- **FastVLM**: Отдельный Python сервер (локально в двух терминалах)
- **Приложение**: Node.js + Express
- **Клиент**: Vanilla JS (нужен рефакторинг)
- **Коммуникация**: HTTP между сервисами

### ⚙️ Конфигурация GPU

FastVLM сервер автоматически определяет и использует GPU если доступен:
- **GPU доступен**: Модель загружается на CUDA
- **GPU недоступен**: Используется CPU (работает, но медленнее)

### 📁 Структура моделей
```
ml-fastvlm/
├── checkpoints/
│   ├── llava-fastvithd_1.5b_stage2/  # Модель stage 2
│   └── llava-fastvithd_1.5b_stage3/  # Модель stage 3 (используется)
```

### 📋 Следующие шаги:
1. ✅ **Фаза 0**: FastVLM сервер готов к работе
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