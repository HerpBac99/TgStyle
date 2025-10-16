# Tag Specification для TgStyle AI Documentation

**Версия:** 1.0  
**Назначение:** Каталог всех тегов в коде и их значения

---

## 📌 Правила использования тегов

1. **В комментариях методов** - перечисляем все относящиеся теги
2. **Формат:** `/** ... #tag1 #tag2 #tag3 */`
3. **ИИ ищет через grep:** `grep -r "#CAROUSEL" --include="*.ts" --include="*.js"`
4. **Один файл спецификации** - ты читаешь эту документацию один раз, остальное поиск по тегам

---

## 🏷️ КАТАЛОГ ТЕГОВ

### ИНИЦИАЛИЗАЦИЯ И ЗАПУСК

| Тег | Значение | Файлы | Grep команда |
|-----|----------|-------|--------------|
| `#INIT` | Инициализация приложения | main.ts | `grep -n "#INIT" main.ts` |
| `#STARTUP` | Запуск, DOMContentLoaded | main.ts | `grep -n "#STARTUP" main.ts` |
| `#ENTRY-POINT` | Точка входа | main.ts | `grep -n "#ENTRY-POINT" main.ts` |
| `#TELEGRAM` | Telegram WebApp API | main.ts | `grep -n "#TELEGRAM" main.ts` |
| `#SETUP` | Настройка app behavior | main.ts | `grep -n "#SETUP" main.ts` |

### КАРУСЕЛЬ И ИСТОРИЯ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#CAROUSEL` | Управление каруселью (позиция, свайп, навигация) | uiMenu.ts | `createCarouselCards`, `moveCarouselToPosition`, `handleCarouselTouch*` |
| `#CAROUSEL-CREATE` | Создание карточек карусели | uiMenu.ts line ~420 | `createCarouselCards`, `createCard`, `createCardElement` |
| `#CAROUSEL-POSITION` | Позиционирование карусели | uiMenu.ts line ~620 | `positionCarousel`, `moveCarouselToPosition` |
| `#CAROUSEL-SWIPE` | Обработка свайпа | uiMenu.ts line ~750 | `handleCarouselTouch*`, `moveToPrevious/NextCarouselItem` |
| `#CAROUSEL-NAV` | Навигация (точки) | uiMenu.ts line ~680 | `updateCarouselNavigation`, `updateActiveDot` |
| `#CARD` | Отдельная карточка карусели | uiMenu.ts line ~450 | `createCard`, `setupFilledCard`, `setupEmptyCard` |
| `#CARD-FILLED` | Заполненная карточка (с анализом) | uiMenu.ts line ~505 | `setupFilledCard` |
| `#CARD-EMPTY` | Пустая карточка (для новых фото) | uiMenu.ts line ~565 | `setupEmptyCard` |
| `#HISTORY` | Работа с историей анализов | history.ts | `getFilledItems`, `addItem`, `removeItem` |
| `#HISTORY-LOAD` | Загрузка истории (storage, server) | history.ts line ~40 | `loadFromStorage`, `loadHistoryFromServer` |
| `#HISTORY-VALIDATE` | Валидация истории | history.ts | `validateHistory`, `validateHistoryItem` |

### СИСТЕМА ЛАЙКОВ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#LIKES` | Система лайков (полностью) | uiMenu.ts, analysisLikes.js | `loadCarouselLikeStatus`, `handleCarouselLikeClick` |
| `#LIKES-LOAD` | Загрузка статуса лайка | uiMenu.ts line ~310 | `loadCarouselLikeStatus`, `loadAndUpdateLikeStatus` |
| `#LIKES-TOGGLE` | Добавление/удаление лайка | uiMenu.ts line ~345 | `handleCarouselLikeClick`, `handleSavedAnalysisLikeClick` |
| `#LIKES-UI` | Отображение лайков в UI | uiMenu.ts line ~520 | `setupFilledCard` - создание кнопки лайка |
| `#LIKES-API` | API endpoints лайков | server/src/api/analysisLikes.js | `/analysis-likes/*` endpoints |

### ФОТО И КАМЕРА

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#CAMERA` | CameraManager класс | camera.ts | `capturePhoto`, `processImageFile` |
| `#CAMERA-CAPTURE` | Захват фото через камеру | camera.ts line ~30 | `capturePhoto`, `selectFile` |
| `#CAMERA-PROCESS` | Обработка файла (валидация, ресайз) | camera.ts line ~60 | `processImageFile`, `validateFile` |
| `#PHOTO-VALIDATION` | Валидация фото (размер, тип) | camera.ts, validation.ts | `validateFile`, `validateImageData` |
| `#PHOTO-DATA` | Структура данных фото (base64, URL) | types/api.ts | `ImageData`, `HistoryItem.photo` |

### АНАЛИЗ И РЕЗУЛЬТАТЫ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#ANALYSIS` | Анализ изображений (полностью) | analysis.ts, uiAnalysis.ts | `analyzeImage`, `showAnalysisResult` |
| `#ANALYSIS-REQUEST` | Отправка фото на анализ | analysis.ts | `analyzeImage` - api.post(/analyze) |
| `#ANALYSIS-RESULT` | Отображение результата анализа | uiAnalysis.ts | `showAnalysisResult`, `showFullscreenPreview` |
| `#SHARED-ANALYSIS` | Sharing анализов другим пользователям | main.ts, uiCore.ts | `handleSharedAnalysis`, `showSharedAnalysis` |

### API И ENDPOINTS

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#API` | API клиент и методы | api.ts | `get`, `post`, `delete` методы |
| `#API-ENDPOINT` | Конкретный API endpoint | server/src/api/* | Функции обработчики |
| `#API-VALIDATION` | Валидация данных API | server/src/utils/validation.ts | `validateTelegramWebAppData` |
| `#API-HISTORY` | `/history` endpoint | server/src/api/history.js | Получение истории |
| `#API-ANALYZE` | `/analyze` endpoint | server/src/api/analyze.js | Анализ фото |
| `#API-AUTH` | `/auth` endpoint | server/src/api/auth.js | Авторизация |

### ТИПЫ ДАННЫХ И ВАЛИДАЦИЯ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#TYPES` | TypeScript интерфейсы и типы | types/api.ts, types/index.ts | `interface HistoryItem`, `ImageData`, и т.д. |
| `#TYPE-HISTORY-ITEM` | Интерфейс HistoryItem | types/api.ts | `interface HistoryItem` |
| `#TYPE-IMAGE-DATA` | Интерфейс ImageData | types/api.ts | `interface ImageData` |
| `#VALIDATION` | Функции валидации | utils/validation.ts | `validateHistory`, `validateImageData` |
| `#VALIDATION-TELEGRAM` | Валидация Telegram initData | server/src/utils/validation.ts | `validateTelegramWebAppData` |

### СОБЫТИЯ И COMMUNICATION

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#EVENTS` | Система событий (CustomEvent) | main.ts, uiMenu.ts, history.ts | `window.dispatchEvent`, `addEventListener` |
| `#EVENT-HISTORY-UPDATED` | Событие обновления истории | history.ts, uiMenu.ts | `'history:updated'` |
| `#EVENT-PHOTO-CAPTURED` | Событие захвата фото | camera.ts, uiAnalysis.ts | `'photo:captured'` |
| `#EVENT-ANALYSIS-STATE` | События изменения состояния анализа | uiAnalysis.ts, uiManager.ts | `'analysisStateChange'` |

### UI МЕНЕДЖЕРЫ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#UI` | Работа с UI | uiManager.ts, uiMenu.ts и т.д. | любой UI модуль |
| `#UI-MANAGER` | UIManager главный координатор | uiManager.ts | `UIManager` класс |
| `#UI-MENU** | UIMenuManager карусель и меню | uiMenu.ts | `UIMenuManager` класс |
| `#UI-ANALYSIS` | UIAnalysisManager показ анализа | uiAnalysis.ts | `UIAnalysisManager` класс |
| `#UI-CORE` | UICoreManager общие компоненты | uiCore.ts | Toasts, subscriptions и т.д. |

### ДОЛГОЕ НАЖАТИЕ И УДАЛЕНИЕ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#LONG-PRESS` | Долгое нажатие (полностью) | uiMenu.ts line ~1000 | `startLongPress`, `activateLongPress` |
| `#DELETE-MODE` | Режим удаления карточки | uiMenu.ts line ~1100 | `activateLongPress`, `exitDeleteMode` |
| `#DELETE-BUTTON` | Кнопка удаления карточки | uiMenu.ts line ~1150 | `addDeleteButton`, `handleDeleteClick` |
| `#HAPTIC** | Тактильная обратная связь (вибрация) | uiMenu.ts line ~1200 | `triggerHapticFeedback` |

### БД И ДАННЫЕ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#DATABASE` | Работа с БД (полностью) | server/prisma/schema.prisma | Prisma модели |
| `#DB-MODEL` | Prisma модель | prisma/schema.prisma | `model HistoryItem`, `model User` |
| `#DB-MIGRATION` | Миграция БД | prisma/migrations/* | Файлы миграций |
| `#PRISMA` | Prisma ORM операции | server/src/* | `prisma.historyItem.create` и т.д. |

### АВТОРИЗАЦИЯ

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#AUTH` | Авторизация (полностью) | auth.ts, server/src/api/auth.js | `authManager.authenticate` |
| `#AUTH-MANAGER` | AuthManager класс | auth.ts | `AuthManager` класс |
| `#AUTH-TELEGRAM** | Telegram авторизация | auth.ts | Проверка initData |
| `#AUTH-TOKEN** | Работа с токенами | auth.ts | getInitData, getAuthToken |

### OPTIMIZATION И ISSUES

| Тег | Значение | Файлы | Где ищи |
|-----|----------|-------|---------|
| `#ISSUE` | Проблемное место в коде | Разные файлы | Комментарии с #ISSUE |
| `#OPTIMIZATION` | Возможность оптимизации | Разные файлы | Комментарии с #OPTIMIZATION |
| `#TODO` | TODO - что нужно сделать | Разные файлы | Комментарии с #TODO |
| `#REFACTOR** | Код нужно переписать | Разные файлы | Комментарии с #REFACTOR |
| `#PERF** | Производительность | Разные файлы | Комментарии с #PERF |
| `#BUG** | Баг который нужно исправить | Разные файлы | Комментарии с #BUG |

---

## 🔍 ПРИМЕРЫ GREP КОМАНД ДЛЯ ИИ

### Найти всё про карусель
```bash
grep -r "#CAROUSEL" client/src --include="*.ts" -n
```

### Найти всё про лайки
```bash
grep -r "#LIKES" client/src server/src --include="*.ts" --include="*.js" -n
```

### Найти все проблемные места
```bash
grep -r "#ISSUE\|#BUG\|#OPTIMIZATION" --include="*.ts" --include="*.js" -n
```

### Найти всё про создание карточки
```bash
grep -r "#CARD" client/src/modules/uiMenu.ts -n
```

### Найти всё про обработку фото
```bash
grep -r "#PHOTO\|#CAMERA" client/src --include="*.ts" -n
```

### Найти все события
```bash
grep -r "#EVENT" --include="*.ts" --include="*.js" -n
```

---

## 📝 ТИПОВОЙ WORKFLOW ДЛЯ ИИ

**Сценарий:** Нужно добавить новую функцию или исправить баг

```
1. Получил задачу
   ↓
2. Знаю какой тег нужен?
   - ДА → прыгай на шаг 4
   - НЕТ → читай этот файл найди нужный тег
   ↓
3. Открой эту спецификацию и найди свой тег
   ↓
4. Выполни grep команду с этим тегом
   ↓
5. Прочитай найденный код (теги подскажут что связано)
   ↓
6. Найди все связанные теги
   ↓
7. Повтори grep для каждого связанного тега
   ↓
8. Теперь ты знаешь всё что нужно для изменения
   ↓
9. Кодируй и проверь все связанные места
```

---

## ⚡ БЫСТРЫЙ СТАРТ

1. **Если меняешь карусель** → ищи: `#CAROUSEL #CARD`
2. **Если меняешь лайки** → ищи: `#LIKES #LIKES-*`
3. **Если меняешь фото** → ищи: `#CAMERA #PHOTO`
4. **Если меняешь типы данных** → ищи: `#TYPES #VALIDATION`
5. **Если добавляешь API** → ищи: `#API #API-ENDPOINT`
6. **Если меняешь БД** → ищи: `#DATABASE #PRISMA`

---

**Обновлен:** 2025-10-16  
**Версия схемы:** 1.0
