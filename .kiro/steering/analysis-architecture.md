# Архитектура модуля Analysis

## Обзор

Модуль Analysis отвечает за анализ стиля пользователя через AI (FastVLM). Это главный экран приложения с каруселью истории анализов, выбором темы анализа, и отображением результатов с рекомендациями покупок.

**Основные функции:**
- Захват фото из камеры/галереи
- Выбор темы анализа (Casual, Business, Sport, etc.)
- AI анализ стиля через FastVLM
- Отображение результатов с каскадной анимацией
- Карусель истории анализов с Instagram-style UI
- Лайки и sharing анализов
- Рекомендации покупок на Lamoda

## Основные компоненты

### 1. UIAnalysisManager (uiAnalysis.ts)

**Ответственность:** Управление UI анализа - камера, выбор темы, экран анализа, результаты, рекомендации.

**Ключевые методы:**
- `handleCameraButtonClick()` - Открывает камеру/галерею для захвата фото
- `handlePhotoCaptured(event)` - Обрабатывает захваченное фото и показывает выбор темы
- `showFullscreenPreview(imageBase64, showThemeSelection)` - Показывает экран анализа
- `createThemeCards(container)` - Создает карточки тем с каскадной анимацией
- `selectTheme(themeId)` - Обрабатывает выбор темы и запускает анализ
- `showAnalysisWithTheme(imageData, themeDescription)` - Запускает анализ с выбранной темой
- `showAnalysisResult(result, historyItemId)` - Отображает результат с каскадной анимацией
- `parseAnalysisText(text)` - Разбивает текст на блоки для анимации
- `processMarkdown(text)` - Конвертирует markdown и ссылки в HTML
- `setupResultButtons()` - Настраивает обработчики кнопок результата
- `setupRecommendationLinks()` - Настраивает открытие ссылок через Telegram WebApp API
- `closePreview()` - Закрывает экран анализа и обновляет историю
- `syncHistoryMetadata()` - Синхронизирует метаданные (лайки, просмотры) без загрузки фото
- `showAnalysisError()` - Показывает ошибку анализа вместо результата

**Состояние:**
```typescript
private currentAnalysisData: {
  imageSrc: string | null;
  analysisText: string | null;
  historyItemId: number | null;
}
private currentLamodaUrl: string | null;
private currentThemeImage: ImageData | null;
```

**Интеграции:**
- `CameraManager` - Захват фото
- `AnalysisManager` - Бизнес-логика анализа
- `HistoryManager` - Управление историей
- `UIMenuManager` - Карусель истории
- `AnalysisLikesService` - Лайки анализов
- `SharingService` - Sharing анализов
- `PurchaseRecommendationManager` - Извлечение рекомендаций

### 2. AnalysisManager (analysis.ts)

**Ответственность:** Бизнес-логика анализа изображений через API, управление состоянием анализа.

**Ключевые методы:**
- `analyzeImage(imageBase64, themeDescription)` - Главный метод анализа
- `prepareAnalysisRequest(imageBase64, themeDescription)` - Подготовка запроса с initData
- `updateState(newState)` - Обновление состояния анализа
- `dispatchStateChangeEvent()` - Отправка события изменения состояния
- `getCurrentState()` - Получение текущего состояния
- `resetState()` - Сброс состояния
- `isAnalyzing()` - Проверка выполнения анализа
- `cancelAnalysis()` - Отмена текущего анализа
- `getStats()` - Получение статистики анализа

**Состояние:**
```typescript
private currentState: AnalysisState = {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error',
  progress: 0-100,
  currentStep?: string,
  error?: string
}
```

**Flow анализа:**
1. `status: 'uploading', progress: 10` - Подготовка изображения
2. `status: 'processing', progress: 30` - Отправка на анализ
3. `status: 'completed', progress: 100` - Анализ завершен
4. Перезагрузка истории с сервера
5. Обновление UI и лимитов пользователя
6. Показ результата

**Интеграции:**
- `API` - HTTP запросы к серверу
- `AuthManager` - Получение initData для аутентификации
- `HistoryManager` - Перезагрузка истории после анализа
- `UIManager` - Обновление UI после анализа

### 3. AnalysisLikesService (AnalysisLikesService.ts)

**Ответственность:** Управление лайками анализов с оптимистичным обновлением UI.

**Ключевые методы:**
- `createLikeComponent(parentElement, entityId, initialData, componentClass)` - Создает компонент лайка
- `likeAnalysis(historyItemId)` - Ставит лайк
- `unlikeAnalysis(historyItemId)` - Убирает лайк
- `toggleLike(historyItemId, currentlyLiked)` - Переключает лайк
- `getLikeStatus(historyItemId)` - Получает статус лайка

**Оптимистичное обновление:**
1. Мгновенное обновление UI (добавление класса 'liked', инкремент счетчика)
2. Асинхронный запрос к API
3. Корректировка UI если ответ сервера отличается
4. Откат UI при ошибке

**Интеграции:**
- `API` - HTTP запросы лайков
- `HistoryManager` - Обновление статуса лайка в истории
- `Logger` - Логирование операций

### 4. LoadingTextAnimator (uiAnalysis.ts)

**Ответственность:** Анимация текста загрузки во время анализа.

**Ключевые методы:**
- `start()` - Запускает анимацию смены фраз
- `stop()` - Останавливает анимацию и возвращает исходный текст
- `updateText()` - Обновляет текст на экране

**Фразы загрузки:**
```typescript
const LOADING_PHRASES = [
  'Сканируем одежду ...',
  'Определяем типы вещей и фасоны ...',
  'Находим элементы гардероба ...',
  'Анализируем стиль и настроение ...',
  'Изучаем цвета, оттенки и материалы ...',
  'Сравниваем с актуальными трендами ...',
  'Подбираем аксессуары и акценты ...',
  'Уточняем детали ...',
  'Определяем тренды ...',
  'Генерируем рекомендации ...',
  'Почти готово ...',
  'Еще немного ...'
];
```

**Интервал:** 3.5 секунды между фразами

### 5. UIMenuManager (uiMenu.ts)

**Ответственность:** Управление каруселью истории анализов на главном экране.

**Ключевые методы:**
- `updateHistoryDisplay(options)` - Обновляет карусель истории
- `createCarouselCards()` - Создает карты карусели
- `createCard()` - Создает одну карту (заполненную или пустую)
- `setupFilledCard()` - Настраивает заполненную карту с изображением и кнопками
- `positionCarousel()` - Позиционирует карусель для отображения центральной карты
- `loadVisibleCardImages()` - Прогрессивная загрузка изображений
- `handleHistoryCellClick()` - Обработка клика по пустой карте
- `showSavedAnalysis(analysisData)` - Показ сохраненного анализа
- `setupCarouselSwipe()` - Настройка свайп-управления
- `startLongPress()` - Обработка долгого нажатия для удаления
- `handleDeleteClick()` - Удаление элемента истории
- `updateCardMetadata(historyItemId, likesCount, isLiked)` - Обновление метаданных карты

**Интеграции:**
- `HistoryManager` - Получение истории анализов
- `AnalysisLikesService` - Лайки на картах карусели
- `SharingService` - Sharing с карт карусели
- `CameraManager` - Захват фото для нового анализа

## Архитектурные паттерны

### 1. Singleton Pattern

**UIAnalysisManager, AnalysisManager, AnalysisLikesService** - Единственные экземпляры для всего приложения.

```typescript
export const uiAnalysisManager = new UIAnalysisManager();
export const analysisManager = new AnalysisManager();
export const analysisLikesService = new AnalysisLikesService();
```

### 2. Observer Pattern (События)

**Событийная система для связи между модулями:**

```typescript
// Изменение состояния анализа
window.dispatchEvent(new CustomEvent('analysisStateChange', {
  detail: { ...this.currentState }
}));

// Захват фото
window.dispatchEvent(new CustomEvent('photo:captured', {
  detail: { imageData }
}));

// Обновление истории
window.dispatchEvent(new CustomEvent('history:updated'));
```

### 3. Strategy Pattern

**Разные стратегии обработки текста анализа:**
- Разбивка по абзацам (если есть `\n\n`)
- Разбивка по предложениям (если нет абзацев)
- Группировка предложений в блоки (2-3 предложения)
- Один блок (если нет предложений)

### 4. Optimistic UI Pattern

**Оптимистичное обновление для лайков:**
1. Мгновенное обновление UI
2. Асинхронный запрос к серверу
3. Корректировка при расхождении
4. Откат при ошибке

### 5. Lazy Loading Pattern

**Прогрессивная загрузка изображений в карусели:**
- Загружаются только видимые карты
- Использование `loading="lazy"` атрибута
- Оптимизация производительности

## Интеграции

### 1. FastVLM (AI сервис)

**Endpoint:** `POST http://127.0.0.1:3001/analyze`

**Запрос:**
```typescript
{
  image_base64: string,
  prompt: string // Тема анализа
}
```

**Ответ:**
```typescript
{
  success: boolean,
  analysis?: string,
  model_used?: string,
  device?: string,
  error?: string
}
```

**Интеграция:**
- Сервер получает запрос от клиента через `/api/analyze`
- Сервер пересылает на FastVLM с промптом темы
- FastVLM анализирует изображение и возвращает текст
- Сервер сохраняет результат в БД и возвращает клиенту

### 2. Telegram WebApp API

**Использование:**
- `window.Telegram.WebApp.openLink(url)` - Открытие внешних ссылок (Lamoda)
- `window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning')` - Вибрация при долгом нажатии
- `window.Telegram.WebApp.HapticFeedback.impactOccurred('light')` - Вибрация успеха
- `window.Telegram.WebApp.initData` - Аутентификация пользователя
- `window.Telegram.WebApp.ready()` - Уведомление о готовности UI

### 3. CameraManager

**Методы:**
- `capturePhoto()` - Захват фото из камеры/галереи
- `clearCurrentImage()` - Очистка текущего изображения

**Интеграция:**
```typescript
const result = await cameraManager.capturePhoto();
if (result.success && result.image) {
  // Показ экрана анализа через событие photo:captured
}
```

### 4. HistoryManager

**Методы:**
- `loadHistoryFromServer()` - Загрузка истории с сервера
- `getItemById(historyItemId)` - Получение элемента по ID
- `updateItemLikeStatus(historyItemId, status)` - Обновление статуса лайка
- `updateMetadata(metadata)` - Обновление метаданных без загрузки фото
- `getStats()` - Получение статистики истории

**Интеграция:**
- После анализа: перезагрузка истории
- При закрытии экрана: синхронизация метаданных
- При лайке: обновление статуса в истории

### 5. PurchaseRecommendationManager

**Методы:**
- `extractPurchaseRecommendation(result)` - Извлечение рекомендаций из текста

**Возвращает:**
```typescript
{
  cleanAnalysis: string, // Текст без рекомендаций
  hasRecommendations: boolean,
  lamodaUrl: string | null,
  recommendationsHtml: string | null // HTML с ссылками
}
```

**Формат рекомендаций в тексте:**
```
@"текст_поиска" отображаемый_текст@
```

**Пример:**
```
@"черные джинсы slim fit" черные джинсы@
```

**Конвертируется в:**
```html
<a href="https://www.lamoda.ru/catalogsearch/result/?q=черные+джинсы+slim+fit&gender_section=men" 
   class="lamoda-link">черные джинсы</a>
```

### 6. SharingService

**Методы:**
- `createShareButton(parentElement, shareConfig, componentClass)` - Создает кнопку sharing
- `share(config, options)` - Выполняет sharing

**Конфигурация:**
```typescript
{
  type: 'analysis',
  image: string, // base64
  text: string,
  title: '🤖 AI Анализ стиля',
  metadata: {
    historyItemId: number
  }
}
```

## Производительность и оптимизация

### 1. Оптимистичная отрисовка UI

**Проблема:** Медленная загрузка истории с сервера при старте приложения.

**Решение:**
```typescript
// main.ts
async optimisticUIRender() {
  // Мгновенная отрисовка из localStorage
  uiMenuManager.updateHistoryDisplay();
  
  // Фоновая загрузка с сервера
  await historyManager.loadHistoryFromServer();
}
```

**Результат:** Instant UI - карусель появляется мгновенно, обновляется в фоне.

### 2. Синхронизация метаданных

**Проблема:** Перезагрузка всей истории с изображениями при закрытии экрана анализа.

**Решение:**
```typescript
// uiAnalysis.ts
private async syncHistoryMetadata() {
  const response = await api.get('/history-metadata');
  historyManager.updateMetadata(response.metadata);
}
```

**Оптимизация:**
- Если < 10 элементов: полная перезагрузка
- Если >= 10 элементов: только метаданные (лайки, просмотры)
- Изображения не перезагружаются

**Результат:** Экономия трафика и времени загрузки.

### 3. Прогрессивная загрузка изображений

**Проблема:** Загрузка всех изображений карусели сразу.

**Решение:**
```typescript
// uiMenu.ts
loadVisibleCardImages() {
  const visibleCards = this.getVisibleCards();
  visibleCards.forEach(card => {
    const img = card.querySelector('img');
    if (img && img.dataset.src) {
      img.src = img.dataset.src;
    }
  });
}
```

**Результат:** Загружаются только видимые карты, остальные по требованию.

### 4. Трехуровневое кэширование

**Уровни:**
1. **Память (HistoryManager)** - Мгновенный доступ
2. **localStorage** - Быстрый доступ при перезагрузке
3. **Сервер** - Источник истины

**Flow:**
```
Запрос истории
  ↓
Проверка памяти → Есть → Возврат
  ↓ Нет
Проверка localStorage → Есть → Возврат + фоновая синхронизация
  ↓ Нет
Загрузка с сервера → Сохранение в память и localStorage → Возврат
```

### 5. Каскадная анимация

**Проблема:** Резкое появление большого текста анализа.

**Решение:**
```typescript
// uiAnalysis.ts
private parseAnalysisText(text: string) {
  const blocks = text.split('\n\n');
  return blocks.map((block, index) => ({
    content: block,
    delay: index * 0.8 // 0, 0.8, 1.6, 2.4, ...
  }));
}
```

**CSS:**
```css
.analysis-block {
  animation: fadeInUp 0.6s ease-out forwards;
  animation-delay: var(--delay);
}
```

**Результат:** Плавное появление текста блок за блоком.

### 6. Оптимизация изображений

**Обработка на сервере:**
- Оптимизация размера и качества через Sharp
- Проверка hasAlpha для выбора формата (PNG/JPEG)
- Сохранение в `server/uploads/analysis/{telegramId}/`

**Обработка на клиенте:**
- Конвертация в base64 для передачи
- Оптимизация перед отправкой на FastVLM

## Обработка ошибок

### 1. Graceful Degradation

**Стратегия:** Показ понятных сообщений вместо технических ошибок.

```typescript
// analysis.ts
if (!response.success) {
  const userFriendlyMessage = 'Сервер временно недоступен. Попробуйте позже.';
  throw new Error(userFriendlyMessage);
}
```

### 2. Fallback на кэш

**Стратегия:** Использование кэша при сетевых ошибках.

```typescript
// history.ts
async loadHistoryFromServer() {
  try {
    const response = await api.get('/history');
    this.saveToCache(response.history);
    return response.history;
  } catch (error) {
    logger.warn('Failed to load from server, using cache');
    return this.loadFromCache();
  }
}
```

### 3. Откат оптимистичных операций

**Стратегия:** Откат UI при ошибке лайка.

```typescript
// AnalysisLikesService.ts
try {
  const updatedStatus = await this.toggleLike(entityId, !isLiking);
  // Обновление UI
} catch (error) {
  // Откат UI
  currentState = previousState;
  likeBtn.classList.toggle('liked', currentState.isLiked);
  likesCountEl.textContent = String(currentState.likesCount);
}
```

### 4. Обработка состояния ошибки

**Стратегия:** Централизованная обработка через события.

```typescript
// uiAnalysis.ts
private handleAnalysisStateChange(event: CustomEvent) {
  const state = event.detail;
  if (state.status === 'error' && state.error) {
    this.showAnalysisError();
  }
}
```

### 5. Логирование

**Уровни:**
- `logger.info()` - Информационные сообщения
- `logger.warn()` - Предупреждения (fallback на кэш)
- `logger.error()` - Ошибки с деталями

**Контекст:**
```typescript
logger.info('Analysis completed', {
  historyItemId,
  analysisLength: result.length,
  hasRecommendations: !!lamodaUrl
});
```

## Метрики производительности

### Время загрузки UI
- **Оптимистичная отрисовка:** < 100ms (из localStorage)
- **Полная загрузка:** 500-1000ms (с сервера)

### Время анализа
- **Подготовка:** 10% (< 1s)
- **Отправка:** 30% (1-2s)
- **Анализ FastVLM:** 60% (5-15s в зависимости от модели)
- **Завершение:** 100% (< 1s)

### Размер изображений
- **Оригинал:** 1-5 MB
- **Оптимизированное:** 200-500 KB
- **Thumbnail:** 50-100 KB

### Кэш
- **localStorage:** До 5 MB (история анализов)
- **Память:** Неограниченно (текущая сессия)
- **TTL:** Нет (обновляется при синхронизации)

## Диаграмма архитектуры

```
┌─────────────────────────────────────────────────────────────┐
│                     Analysis Module                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ UIAnalysisManager│◄────────┤ LoadingTextAnimator│         │
│  │                  │         └──────────────────┘          │
│  │  - Camera        │                                        │
│  │  - Theme Select  │         ┌──────────────────┐          │
│  │  - Result Screen │◄────────┤ AnalysisManager  │          │
│  │  - Animations    │         │                  │          │
│  └────────┬─────────┘         │  - State         │          │
│           │                   │  - API calls     │          │
│           │                   └────────┬─────────┘          │
│           │                            │                     │
│           ▼                            ▼                     │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ UIMenuManager    │         │ HistoryManager   │          │
│  │                  │◄────────┤                  │          │
│  │  - Carousel      │         │  - Load/Save     │          │
│  │  - Cards         │         │  - Cache         │          │
│  │  - Swipe         │         └──────────────────┘          │
│  └────────┬─────────┘                                        │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │AnalysisLikesService│       │ SharingService   │          │
│  │                  │         │                  │          │
│  │  - Like/Unlike   │         │  - Share         │          │
│  │  - Optimistic UI │         │  - Telegram API  │          │
│  └──────────────────┘         └──────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   External Services    │
              ├────────────────────────┤
              │  - FastVLM (AI)        │
              │  - Telegram WebApp API │
              │  - Lamoda (Links)      │
              └────────────────────────┘
```

## Примеры использования

### 1. Захват фото и анализ

```typescript
// Клик по кнопке камеры
await uiAnalysisManager.handleCameraButtonClick(event);

// Событие захвата фото
window.addEventListener('photo:captured', (event) => {
  uiAnalysisManager.handlePhotoCaptured(event);
});

// Выбор темы
uiAnalysisManager.selectTheme('casual');

// Анализ
await analysisManager.analyzeImage(imageBase64, 'Casual стиль');
```

### 2. Показ результата

```typescript
// Показ результата с каскадной анимацией
uiAnalysisManager.showAnalysisResult(analysisText, historyItemId);

// Интеграция лайков
analysisLikesService.createLikeComponent(
  resultActions,
  historyItemId,
  { isLiked: false, likesCount: 0 },
  'result'
);

// Интеграция sharing
sharingService.createShareButton(
  resultActions,
  {
    type: 'analysis',
    image: imageBase64,
    text: analysisText,
    title: '🤖 AI Анализ стиля',
    metadata: { historyItemId }
  },
  'result'
);
```

### 3. Карусель истории

```typescript
// Обновление карусели
uiMenuManager.updateHistoryDisplay();

// Обновление с сохранением позиции
uiMenuManager.updateHistoryDisplay({ preservePosition: true });

// Показ сохраненного анализа
uiMenuManager.showSavedAnalysis(analysisData);
```

### 4. Оптимистичные лайки

```typescript
// Создание компонента лайка
analysisLikesService.createLikeComponent(
  parentElement,
  historyItemId,
  { isLiked: false, likesCount: 5 },
  'carousel'
);

// Переключение лайка
await analysisLikesService.toggleLike(historyItemId, currentlyLiked);
```

## Будущие улучшения

### 1. Offline Support
- Service Worker для кэширования
- Очередь запросов при отсутствии сети
- Синхронизация при восстановлении соединения

### 2. Расширенная аналитика
- Трекинг популярных тем
- Статистика лайков и sharing
- A/B тестирование промптов

### 3. Персонализация
- История предпочтений пользователя
- Рекомендации на основе прошлых анализов
- Сохранение любимых стилей

### 4. Улучшение FastVLM
- Поддержка нескольких моделей
- Выбор качества анализа (быстрый/детальный)
- Batch обработка нескольких фото

### 5. Социальные функции
- Комментарии к анализам
- Подписки на других пользователей
- Лента анализов друзей
