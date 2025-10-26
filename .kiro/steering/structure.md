# Структура проекта

## Корневая структура

```
tgstyle/
├── client/              # Frontend приложение
├── server/              # Backend API сервер
├── fastvlm-server/      # Python AI сервис
├── db/                  # База данных и миграции
├── docker/              # Docker конфигурация
├── ssl/                 # SSL сертификаты
├── dist/                # Собранные файлы клиента
└── logs/                # Логи приложения
```

## Client (`client/`)

```
client/
├── src/
│   ├── main.ts                    # Точка входа
│   ├── types/                     # TypeScript типы
│   ├── modules/                   # Основные модули
│   │   ├── auth.ts                # Аутентификация
│   │   ├── api.ts                 # API клиент
│   │   ├── logger.ts              # Логирование
│   │   ├── uiManager.ts           # Управление UI
│   │   ├── history.ts             # История анализов
│   │   ├── dataCache.ts           # Кеширование
│   │   ├── uiWardrobe.ts          # UI гардероба
│   │   ├── uiCapsulesGrid.ts      # UI капсул
│   │   ├── publicFeed/            # Публичная лента
│   │   └── shared/                # Общие утилиты
│   └── utils/
│       └── constants.ts           # Константы приложения
├── css/                           # Стили
└── index.html                     # Главная страница
```

## Server (`server/`)

```
server/
├── server.js                      # Главный файл сервера
├── src/
│   ├── api/                       # API роуты
│   │   ├── auth.js                # Аутентификация
│   │   ├── analyze.js             # Анализ стиля
│   │   ├── backgroundRemoval.js   # Удаление фона
│   │   ├── clothingClassification.js  # Классификация одежды
│   │   ├── history.js             # История
│   │   ├── subscription.js        # Подписки
│   │   ├── wardrobe.js            # Гардероб
│   │   ├── capsules.js            # Капсулы
│   │   └── initialData.js         # Начальные данные
│   ├── controllers/               # Бизнес-логика
│   ├── lib/                       # Библиотеки (Prisma)
│   └── models/                    # Модели данных
└── uploads/                       # Загруженные файлы
```

## FastVLM Service (`fastvlm-server/`)

```
fastvlm-server/
├── server.py                      # Flask сервер
├── config.py                      # Конфигурация
├── background_removal.py          # Удаление фона
├── image_preprocessing.py         # Препроцессинг
├── requirements1.5b.txt           # Python зависимости
├── models/                        # Симлинк на ml-fastvlm
└── prompt/                        # Промпты для LLM
```

## Конвенции

### Именование файлов
- TypeScript модули: camelCase (`dataCache.ts`, `uiManager.ts`)
- CSS файлы: kebab-case (`main-menu.css`)
- API роуты: kebab-case (`background-removal.js`)
- Классы компонентов: PascalCase (`UIPublicFeed`)

### Организация модулей
- Каждая фича имеет свой модуль в `client/src/modules/`
- Общие утилиты в `client/src/modules/shared/`
- API эндпоинты зеркалят модули (например: `wardrobe.ts` ↔ `api/wardrobe.js`)

### Path Aliases
Используй TypeScript алиасы:
- `@/` → `client/src/`
- `@/types/` → `client/src/types/`
- `@/modules/` → `client/src/modules/`
- `@/utils/` → `client/src/utils/`

### Статические файлы
- CSS клиента: `client/css/`
- Загруженные изображения: `server/uploads/`
- Собранные файлы: `dist/`
- SSL сертификаты: `ssl/certs/` и `ssl/keys/`

### Логи
- Клиент: `logs/client/`
- Сервер: `logs/server/`
- FastVLM: `fastvlm-server/logs/`
