# TgStyle - Telegram Mini App

Telegram Mini App для анализа стиля одежды с помощью ИИ. Приложение позволяет загружать фотографии одежды и получать персональные рекомендации по стилю.

## 🚀 Быстрый старт

### Установка зависимостей
```bash
npm install
```

### Запуск в продакшене
```bash
npm start
```

### Разработка
```bash
# Запуск клиента (Vite dev server)
npm run dev

# Запуск сервера с hot-reload
npm run dev:server
```

## 📁 Структура проекта

```
tgstyle/
├── client/                 # Клиентская часть
│   ├── css/
│   │   └── styles.css     # Стили приложения
│   ├── js/
│   │   ├── scripts.js     # Основная логика клиента
│   │   └── logger.js      # Система логирования
│   └── index.html         # Главная страница
├── server/                 # Серверная часть
│   ├── src/
│   │   ├── api/           # API эндпоинты
│   │   ├── models/        # Модели данных
│   │   └── utils/         # Утилиты
│   └── server.js          # Основной сервер
├── ssl/                    # SSL сертификаты
│   ├── certs/
│   └── keys/
├── docker/                 # Docker конфигурация
└── package.json           # Зависимости и скрипты
```

## 🔧 Конфигурация

### Переменные окружения

Создайте файл `.env` в корне проекта:

```bash
# Environment Configuration
NODE_ENV=production
PORT=443
DOMAIN=tgstyle.flappy.crazedns.ru

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