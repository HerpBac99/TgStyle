# TgStyle Main Menu - Complete Documentation Index

## Обзор главной закладки

Главная закладка (mainMenu) TgStyle предоставляет полный цикл работы с анализом одежды: от захвата фото через камеру до получения рекомендаций покупок. Это основная функциональность приложения, объединяющая все ключевые модули.

## Архитектура главной закладки

```
Пользователь взаимодействие
        ↓
UI Manager (uiManager.ts)
├── Меню и карусель (uiMenu.ts)
├── Камера и фото (camera.ts)
├── Анализ изображений (analysis.ts)
├── API коммуникация (api.ts)
└── Рекомендации покупок (purchaseRecommendation.ts)
```

## Документация по модулям

### 🎯 [UI Manager](./MAIN_TAB_UI_MANAGER.md)
**Файл:** `client/src/modules/uiManager.ts`
**Ответственность:** Координация всех UI модулей главной закладки
**Ключевые функции:**
- `UIManager.constructor()` - инициализация всех модулей
- `initializeAll()` - настройка UI компонентов
- `setupTabsListeners()` - обработчики переключения закладок
- `handleTabSwitch()` - логика смены контента
- `handleAnalysisStateChange()` - обработка состояния анализа

**Теги поиска:** `ui_coordination`, `tab_management`, `event_handling`, `module_initialization`

### 🎠 [Carousel History](./MAIN_TAB_CAROUSEL.md)
**Файл:** `client/src/modules/uiMenu.ts`
**Ответственность:** Управление каруселью истории и главным меню
**Ключевые функции:**
- `UIMenuManager.constructor()` - инициализация меню
- `updateHistoryDisplay()` - обновление карусели
- `createCarouselCards()` - генерация карт истории
- `positionCarousel()` - позиционирование карусели
- `handleLongPress()` - режим удаления элементов
- `showSavedAnalysis()` - показ сохраненного анализа

**Теги поиска:** `carousel_management`, `history_display`, `long_press_deletion`, `swipe_navigation`, `saved_analysis`

### 📷 [Camera Management](./MAIN_TAB_CAMERA.md)
**Файл:** `client/src/modules/camera.ts`
**Ответственность:** Захват фото и обработка изображений
**Ключевые функции:**
- `CameraManager.capturePhoto()` - полный процесс захвата
- `selectFile()` - выбор файла через Telegram API
- `processImageFile()` - обработка и валидация изображения
- `validateFile()` - проверка размера и формата
- `readFileAsBase64()` - конвертация в base64
- `getImageDimensions()` - получение размеров

**Теги поиска:** `photo_capture`, `image_processing`, `telegram_camera_api`, `file_validation`, `base64_conversion`

### 🤖 [Analysis Process](./MAIN_TAB_ANALYSIS.md)
**Файл:** `client/src/modules/analysis.ts`
**Ответственность:** Управление анализом изображений через API
**Ключевые функции:**
- `AnalysisManager.analyzeImage()` - основной процесс анализа
- `prepareAnalysisRequest()` - подготовка запроса
- `updateState()` - управление состоянием прогресса
- `dispatchStateChangeEvent()` - отправка событий UI
- `getCurrentState()` - получение текущего состояния

**Теги поиска:** `image_analysis`, `api_request`, `progress_tracking`, `state_management`, `ai_processing`

### 🌐 [API Integration](./MAIN_TAB_API.md)
**Файл:** `client/src/modules/api.ts`
**Ответственность:** HTTP клиент для коммуникации с сервером
**Ключевые функции:**
- `ApiClient.request()` - базовый HTTP запрос
- `handleHttpError()` - обработка ошибок HTTP
- `TgStyleApi.authenticate()` - авторизация пользователя
- `TgStyleApi.analyzeImage()` - отправка на анализ
- `ping()` - проверка доступности сервера

**Теги поиска:** `http_client`, `api_requests`, `error_handling`, `authentication`, `server_communication`

### 🛍️ [Purchase Recommendations](./MAIN_TAB_PURCHASE_REC.md)
**Файл:** `client/src/modules/purchaseRecommendation.ts`
**Ответственность:** Обработка рекомендаций и генерация ссылок Lamoda
**Ключевые функции:**
- `extractPurchaseRecommendation()` - извлечение рекомендаций из текста
- `parseRecommendations()` - парсинг в HTML ссылки
- `generateLamodaUrlFromQuery()` - создание URL Lamoda
- `openLamodaLink()` - открытие ссылок через Telegram

**Теги поиска:** `recommendation_parsing`, `lamoda_integration`, `html_generation`, `link_opening`, `purchase_suggestions`

## Поток работы главной закладки

### 1. Инициализация
```
uiManager.initializeAll()
├── uiMenuManager.init()
├── uiAnalysisManager.init()
├── setupTabsListeners()
└── setupGlobalEventListeners()
```

### 2. Захват фото
```
Пользователь кликает кнопку камеры
uiMenuManager.handleCameraButtonClick()
uiAnalysisManager.handleCameraButtonClick()
cameraManager.capturePhoto()
├── selectFile() → Telegram показывает диалог выбора
├── processImageFile() → валидация и обработка
├── currentImageData = imageData
└── dispatchEvent('photo:captured')
```

### 3. Выбор темы анализа
```
uiAnalysisManager.handlePhotoCaptured()
showFullscreenPreview(imageBase64, true)
createThemeCards() → показ карточек тем
Пользователь выбирает тему
selectTheme() → скрывает выбор темы
showAnalysisWithTheme()
analysisManager.analyzeImage(imageBase64, themeDescription)
```

### 4. Процесс анализа
```
analysisManager.analyzeImage()
├── prepareAnalysisRequest() → создает запрос
├── api.analyzeImage() → отправляет на сервер
├── updateState() → прогресс: uploading → processing
├── Ожидание ответа сервера
├── updateState() → completed
└── dispatchEvent('showAnalysisScreen')
```

### 5. Отображение результата
```
uiAnalysisManager.showAnalysisResult()
├── Останавливает анимацию загрузки
├── Парсит текст анализа на блоки
├── purchaseRecommendationManager.extractPurchaseRecommendation()
├── Формирует каскадную анимацию текста
└── Настраивает обработчики ссылок
```

### 6. Работа с историей
```
uiManager.updateHistoryDisplay()
uiMenuManager.updateHistoryDisplay()
├── historyManager.getFilledItems()
├── createCarouselCards() → генерация HTML
├── positionCarousel() → центрирование
└── updateCarouselNavigation() → точки навигации
```

## События главной закладки

### Отправляемые события
- `photo:captured` - фото захвачено, готово к выбору темы
- `analysisStateChange` - изменилось состояние анализа
- `showAnalysisScreen` - показать экран с результатом анализа

### Получаемые события
- `history:updated` - история обновлена с сервера
- `analysisStateChange` - изменения состояния анализа

## Ключевые константы

### Таймауты API
```typescript
AUTH_REQUEST: 10000,      // 10 сек авторизация
ANALYSIS_REQUEST: 60000,  // 60 сек анализ
LOG_REQUEST: 5000,        // 5 сек логи
HEALTH_CHECK: 3000        // 3 сек пинг
```

### Ограничения изображений
```typescript
MAX_SIZE_MB: 10,          // Максимальный размер файла
ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
```

### Настройки карусели
```typescript
TOTAL_CARD_WIDTH: 280,     // Ширина карты + отступы
CENTER_OFFSET: 140,        // Смещение для центрирования
LONG_PRESS_DELAY: 500,     // Задержка долгого нажатия
SWIPE_THRESHOLD: 50,       // Минимальный свайп
TRANSITION_DURATION: 300   // Длительность анимации
```

## Поиск по документации

### По функциональности
- **Камера и фото:** `photo_capture`, `image_processing`, `telegram_camera_api`
- **Анализ ИИ:** `image_analysis`, `ai_processing`, `progress_tracking`
- **История:** `carousel_management`, `history_display`, `saved_analysis`
- **Рекомендации:** `recommendation_parsing`, `lamoda_integration`, `purchase_suggestions`
- **Навигация:** `tab_management`, `swipe_navigation`, `long_press_deletion`

### По техническим аспектам
- **API:** `http_client`, `api_requests`, `error_handling`
- **UI:** `ui_coordination`, `event_handling`, `animation`
- **Обработка данных:** `text_parsing`, `html_generation`, `state_management`
- **Производительность:** `lazy_loading`, `dynamic_imports`, `caching`

### По типам задач
- **Отладка:** `logging`, `error_handling`, `debug_info`
- **Разработка:** `module_initialization`, `event_driven_architecture`
- **Тестирование:** `api_health_check`, `state_tracking`, `validation`

## Быстрые ссылки на функции

### Основные точки входа
- [uiManager.initializeAll()](./MAIN_TAB_UI_MANAGER.md#initializeall) - запуск UI
- [cameraManager.capturePhoto()](./MAIN_TAB_CAMERA.md#capturephoto) - захват фото
- [analysisManager.analyzeImage()](./MAIN_TAB_ANALYSIS.md#analyzeimage) - анализ изображения
- [uiMenuManager.updateHistoryDisplay()](./MAIN_TAB_CAROUSEL.md#updatehistorydisplay) - обновление истории

### Обработчики событий
- [handleTabClick()](./MAIN_TAB_UI_MANAGER.md#handletabclick) - смена закладки
- [handlePhotoCaptured()](./MAIN_TAB_ANALYSIS.md#handlephotocaptured) - фото получено
- [handleAnalysisStateChange()](./MAIN_TAB_ANALYSIS.md#handleanalysisstatechange) - статус анализа

### Утилиты
- [api.analyzeImage()](./MAIN_TAB_API.md#analyzeimage) - API запрос анализа
- [extractPurchaseRecommendation()](./MAIN_TAB_PURCHASE_REC.md#extractpurchaserecommendation) - парсинг рекомендаций
- [generateLamodaUrlFromQuery()](./MAIN_TAB_PURCHASE_REC.md#generatelamodaurlfromquery) - создание ссылок

## Типичные сценарии использования

### Новый пользователь
1. [Инициализация](./MAIN_TAB_UI_MANAGER.md#initializeall)
2. [Показ карусели](./MAIN_TAB_CAROUSEL.md#updatehistorydisplay) (пустой)
3. [Клик по кнопке камеры](./MAIN_TAB_CAMERA.md#capturephoto)
4. [Выбор темы](./MAIN_TAB_ANALYSIS.md#selecttheme)
5. [Анализ изображения](./MAIN_TAB_ANALYSIS.md#analyzeimage)
6. [Показ результата](./MAIN_TAB_ANALYSIS.md#showanalysisresult)

### Просмотр истории
1. [Клик по карте истории](./MAIN_TAB_CAROUSEL.md#handlehistorycellclick)
2. [Показ сохраненного анализа](./MAIN_TAB_CAROUSEL.md#showsvedanalysis)
3. [Долгое нажатие для удаления](./MAIN_TAB_CAROUSEL.md#handlelongpress)

### Работа с рекомендациями
1. [Извлечение из текста](./MAIN_TAB_PURCHASE_REC.md#extractpurchaserecommendation)
2. [Парсинг рекомендаций](./MAIN_TAB_PURCHASE_REC.md#parserecommendations)
3. [Открытие в Lamoda](./MAIN_TAB_PURCHASE_REC.md#openlamodalink)

## Отладка и мониторинг

### Логирование
- Все модули логируют через `logger` с уровнями `info`, `warn`, `error`
- API запросы логируются с временем выполнения
- Состояния анализа отслеживаются

### Метрики производительности
- Время захвата фото
- Время API запросов
- Время обработки изображений
- Количество элементов в истории

### Обработка ошибок
- Graceful degradation при сетевых ошибках
- Fallback на пустую историю
- Показ пользовательских сообщений об ошибках

## Версии и изменения

**Текущая версия:** 2.0.0
**Последнее обновление документации:** 2025-01-12

### Ключевые изменения в v2.0
- Полная переработка архитектуры UI менеджеров
- Добавлен выбор темы анализа
- Улучшена система рекомендаций покупок
- Оптимизирована работа с историей
- Добавлена каскадная анимация результатов

---

**Навигация по документации:**
- [← Назад к общей документации](../KNOWLEDGE_BASE_INDEX.md)
- [UI Manager](./MAIN_TAB_UI_MANAGER.md) - координация интерфейса
- [Carousel](./MAIN_TAB_CAROUSEL.md) - управление историей
- [Camera](./MAIN_TAB_CAMERA.md) - работа с фото
- [Analysis](./MAIN_TAB_ANALYSIS.md) - процесс ИИ анализа
- [API](./MAIN_TAB_API.md) - коммуникация с сервером
- [Purchase Rec](./MAIN_TAB_PURCHASE_REC.md) - рекомендации покупок
