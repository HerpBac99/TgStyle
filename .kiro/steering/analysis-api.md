# API модуля Analysis

## Обзор

Модуль Analysis предоставляет API для анализа стиля пользователя через AI (FastVLM), управления историей анализов и работы с лайками. API разделен на клиентские методы (JavaScript) и серверные endpoints (REST API).

## Клиентские методы

### AnalysisManager

**Файл:** `client/src/modules/analysis.ts`

**Singleton:** `analysisManager`

#### analyzeImage(imageBase64, themeDescription?)

Главный метод для анализа изображения через FastVLM.

**Параметры:**
- `imageBase64: string` - Изображение в формате base64
- `themeDescription?: string` - Тема анализа (опционально)

**Возвращает:** `Promise<AnalysisResponse>`

**Пример:**
```typescript
import { analysisManager } from './modules/analysis';

const result = await analysisManager.analyzeImage(
  imageBase64,
  'Casual стиль'
);

console.log(result.analysis); // Текст анализа
console.log(result.historyItemId); // ID сохраненного анализа
console.log(result.analysesLeft); // Оставшиеся анализы
```

**Flow выполнения:**
1. Обновляет состояние: `status: 'uploading', progress: 10`
2. Подготавливает запрос с initData
3. Обновляет состояние: `status: 'processing', progress: 30`
4. Отправляет POST /api/analyze
5. Обновляет состояние: `status: 'completed', progress: 100`
6. Перезагружает историю с сервера
7. Обновляет UI и лимиты пользователя
8. Показывает результат


**Интеграция:**
- Автоматически сохраняет результат в историю через сервер
- Обновляет счетчики лимитов пользователя
- Отправляет событие `analysisStateChange` для UI
- Вызывает `historyManager.loadHistoryFromServer()` после анализа
- Вызывает `uiManager.showAnalysisResult()` для отображения

#### getCurrentState()

Получает текущее состояние анализа.

**Возвращает:** `AnalysisState`

**Пример:**
```typescript
const state = analysisManager.getCurrentState();
console.log(state.status); // 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
console.log(state.progress); // 0-100
console.log(state.currentStep); // 'Подготовка изображения...'
```

#### resetState()

Сбрасывает состояние анализа к начальному.

**Пример:**
```typescript
analysisManager.resetState();
```

#### isAnalyzing()

Проверяет, выполняется ли анализ в данный момент.

**Возвращает:** `boolean`

**Пример:**
```typescript
if (analysisManager.isAnalyzing()) {
  console.log('Анализ уже выполняется');
}
```

#### cancelAnalysis()

Отменяет текущий анализ (если возможно).

**Пример:**
```typescript
analysisManager.cancelAnalysis();
```

#### getStats()

Получает статистику анализа.

**Возвращает:** `object`

**Пример:**
```typescript
const stats = analysisManager.getStats();
console.log(stats.currentStatus); // 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
console.log(stats.progress); // 0-100
console.log(stats.isAnalyzing); // boolean
console.log(stats.hasError); // boolean
```


### UIAnalysisManager

**Файл:** `client/src/modules/uiAnalysis.ts`

**Singleton:** `uiAnalysisManager`

#### handleCameraButtonClick(event)

Обрабатывает клик по кнопке камеры, открывает выбор фото.

**Параметры:**
- `event: Event` - DOM событие клика

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
import { uiAnalysisManager } from './modules/uiAnalysis';

const cameraBtn = document.getElementById('camera-btn');
cameraBtn.addEventListener('click', (e) => {
  uiAnalysisManager.handleCameraButtonClick(e);
});
```

**Интеграция:**
- Вызывает `cameraManager.capturePhoto()`
- Отправляет событие `photo:captured` при успехе
- Вызывает `authManager.vibrate('light')` для тактильной обратной связи

#### handlePhotoCaptured(event)

Обрабатывает событие захвата фото, показывает экран выбора темы.

**Параметры:**
- `event: CustomEvent` - Событие с данными изображения

**Пример:**
```typescript
window.addEventListener('photo:captured', (event) => {
  uiAnalysisManager.handlePhotoCaptured(event);
});
```

#### showFullscreenPreview(imageBase64, showThemeSelection?)

Показывает полноэкранный экран анализа.

**Параметры:**
- `imageBase64: string` - Изображение в base64
- `showThemeSelection?: boolean` - Показать выбор темы (по умолчанию false)

**Пример:**
```typescript
uiAnalysisManager.showFullscreenPreview(imageBase64, true);
```

**Интеграция:**
- Создает карточки тем через `createThemeCards()`
- Показывает loading индикатор
- Запускает `loadingTextAnimator.start()` для анимации текста

#### showAnalysisResult(result, historyItemId?)

Показывает результат анализа с каскадной анимацией.

**Параметры:**
- `result: string` - Текст анализа
- `historyItemId?: number` - ID элемента истории

**Пример:**
```typescript
uiAnalysisManager.showAnalysisResult(analysisText, 123);
```

**Интеграция:**
- Останавливает `loadingTextAnimator.stop()`
- Извлекает рекомендации через `purchaseRecommendationManager.extractPurchaseRecommendation()`
- Парсит текст на блоки через `parseAnalysisText()`
- Создает компонент лайков через `analysisLikesService.createLikeComponent()`
- Создает кнопку share через `sharingService.createShareButton()`


#### showAnalysisError()

Показывает сообщение об ошибке вместо результата анализа.

**Пример:**
```typescript
uiAnalysisManager.showAnalysisError();
```

#### closeAnalysisScreen()

Закрывает экран анализа и синхронизирует историю.

**Пример:**
```typescript
uiAnalysisManager.closeAnalysisScreen();
```

**Интеграция:**
- Очищает динамические кнопки через `clearAnalysisResultButtons()`
- Очищает изображение через `cameraManager.clearCurrentImage()`
- Синхронизирует метаданные через `syncHistoryMetadata()` (если > 10 элементов)
- Перезагружает историю через `historyManager.loadHistoryFromServer()` (если < 10 элементов)

#### getCurrentAnalysisData()

Получает текущие данные анализа для sharing.

**Возвращает:** `object`

**Пример:**
```typescript
const data = uiAnalysisManager.getCurrentAnalysisData();
console.log(data.imageSrc); // base64 изображения
console.log(data.analysisText); // Текст анализа
console.log(data.historyItemId); // ID элемента истории
```

### AnalysisLikesService

**Файл:** `client/src/modules/analysis/AnalysisLikesService.ts`

**Singleton:** `analysisLikesService`

#### createLikeComponent(parentElement, entityId, initialData, componentClass?)

Создает полнофункциональный компонент лайков с оптимистичным обновлением.

**Параметры:**
- `parentElement: HTMLElement` - Родительский элемент для компонента
- `entityId: number` - ID анализа (historyItemId)
- `initialData: AnalysisLikeStatus` - Начальные данные `{ isLiked, likesCount }`
- `componentClass?: string` - Дополнительный CSS класс (например, 'carousel', 'result')

**Пример:**
```typescript
import { analysisLikesService } from './modules/analysis/AnalysisLikesService';

const resultActions = document.querySelector('.result-actions');
analysisLikesService.createLikeComponent(
  resultActions,
  123, // historyItemId
  { isLiked: false, likesCount: 5 },
  'result' // Добавит класс 'result-like-btn'
);
```

**Оптимистичное обновление:**
1. Мгновенно обновляет UI (добавляет класс 'liked', инкрементирует счетчик)
2. Асинхронно вызывает `toggleLike()`
3. Корректирует UI если ответ сервера отличается
4. Откатывает UI при ошибке


#### likeAnalysis(historyItemId)

Ставит лайк анализу.

**Параметры:**
- `historyItemId: number` - ID анализа

**Возвращает:** `Promise<AnalysisLikeStatus>`

**Пример:**
```typescript
const status = await analysisLikesService.likeAnalysis(123);
console.log(status.isLiked); // true
console.log(status.likesCount); // 6
```

**Интеграция:**
- Отправляет POST /api/analysis-likes/:historyItemId
- Обновляет статус в `historyManager.updateItemLikeStatus()` (только если анализ в локальной истории)

#### unlikeAnalysis(historyItemId)

Убирает лайк с анализа.

**Параметры:**
- `historyItemId: number` - ID анализа

**Возвращает:** `Promise<AnalysisLikeStatus>`

**Пример:**
```typescript
const status = await analysisLikesService.unlikeAnalysis(123);
console.log(status.isLiked); // false
console.log(status.likesCount); // 5
```

#### toggleLike(historyItemId, currentlyLiked)

Переключает лайк (toggle).

**Параметры:**
- `historyItemId: number` - ID анализа
- `currentlyLiked: boolean` - Текущий статус лайка

**Возвращает:** `Promise<AnalysisLikeStatus>`

**Пример:**
```typescript
const status = await analysisLikesService.toggleLike(123, false);
```

#### getLikeStatus(historyItemId)

Получает статус лайка для текущего пользователя.

**Параметры:**
- `historyItemId: number` - ID анализа

**Возвращает:** `Promise<AnalysisLikeStatus>`

**Пример:**
```typescript
const status = await analysisLikesService.getLikeStatus(123);
console.log(status.isLiked); // false
console.log(status.likesCount); // 5
```


### HistoryManager

**Файл:** `client/src/modules/history.ts`

**Singleton:** `historyManager`

#### loadHistoryFromServer()

Загружает историю анализов с сервера (основной источник правды).

**Возвращает:** `Promise<boolean>`

**Пример:**
```typescript
import { historyManager } from './modules/history';

const success = await historyManager.loadHistoryFromServer();
if (success) {
  console.log('История загружена с сервера');
}
```

**Интеграция:**
- Отправляет GET /api/history с initData
- Сохраняет в localStorage как кэш
- Отправляет событие `history:updated`

#### addItem(item)

Добавляет новый элемент в историю (используется редко, обычно сервер сохраняет).

**Параметры:**
- `item: HistoryItem` - Элемент истории

**Возвращает:** `boolean`

**Пример:**
```typescript
const success = historyManager.addItem({
  id: 123,
  telegramId: '123456789',
  photoPath: '/uploads/analysis/123456789/photo.jpg',
  analysisText: 'Анализ стиля...',
  likesCount: 0,
  viewsCount: 0,
  isLiked: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
```

#### removeItem(index)

Удаляет элемент из истории по индексу.

**Параметры:**
- `index: number` - Индекс элемента в массиве

**Возвращает:** `Promise<boolean>`

**Пример:**
```typescript
const success = await historyManager.removeItem(0);
```

**Интеграция:**
- Отправляет DELETE /api/history/:id
- Удаляет из локального массива
- Сохраняет в localStorage

#### getItem(index)

Получает элемент истории по индексу.

**Параметры:**
- `index: number` - Индекс элемента

**Возвращает:** `HistoryItem | null`

**Пример:**
```typescript
const item = historyManager.getItem(0);
console.log(item?.analysisText);
```


#### getItemById(historyItemId)

Получает элемент истории по ID (не по индексу).

**Параметры:**
- `historyItemId: number` - ID элемента

**Возвращает:** `HistoryItem | undefined`

**Пример:**
```typescript
const item = historyManager.getItemById(123);
console.log(item?.likesCount);
```

#### getAllItems()

Получает всю историю.

**Возвращает:** `HistoryItem[]`

**Пример:**
```typescript
const items = historyManager.getAllItems();
console.log(items.length);
```

#### updateItemLikeStatus(itemId, likeStatus)

Обновляет статус лайка для элемента истории.

**Параметры:**
- `itemId: number` - ID элемента
- `likeStatus: { isLiked: boolean; likesCount: number }` - Новый статус

**Пример:**
```typescript
historyManager.updateItemLikeStatus(123, {
  isLiked: true,
  likesCount: 6
});
```

**Интеграция:**
- Обновляет элемент в памяти
- Сохраняет в localStorage

#### updateMetadata(metadata)

Обновляет метаданные (лайки, просмотры) без перерисовки карусели.

**Параметры:**
- `metadata: Array<{ id, likesCount, viewsCount, isLiked }>` - Массив метаданных

**Пример:**
```typescript
historyManager.updateMetadata([
  { id: 123, likesCount: 6, viewsCount: 10, isLiked: true },
  { id: 124, likesCount: 3, viewsCount: 5, isLiked: false }
]);
```

**Интеграция:**
- Отправляет событие `history:metadata-updated` для каждого обновленного элемента
- Сохраняет в localStorage

#### getStats()

Получает статистику истории.

**Возвращает:** `object`

**Пример:**
```typescript
const stats = historyManager.getStats();
console.log(stats.totalSlots); // 50
console.log(stats.filledSlots); // 10
console.log(stats.emptySlots); // 40
console.log(stats.oldestItem); // '2024-01-01T00:00:00.000Z'
console.log(stats.newestItem); // '2024-01-10T00:00:00.000Z'
```


## Серверные endpoints

### POST /api/analyze

Анализирует изображение одежды через FastVLM и сохраняет результат в историю.

**Параметры запроса (body):**
```typescript
{
  photo: string,        // Base64 изображения
  initData: string,     // Telegram WebApp initData для аутентификации
  theme?: string        // Тема анализа (опционально)
}
```

**Ответ (success):**
```typescript
{
  success: true,
  analysis: string,           // Текст анализа от FastVLM
  model: string,              // Модель FastVLM ('llava')
  historyItemId: number,      // ID сохраненного элемента истории
  analysesLeft: number,       // Оставшиеся анализы
  totalAnalyses: number       // Всего выполнено анализов
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string,
  message?: string
}
```

**Коды ошибок:**
- `400` - Отсутствуют обязательные параметры или невалидное изображение
- `401` - Невалидная аутентификация Telegram
- `429` - Превышен лимит анализов
- `500` - Внутренняя ошибка сервера или ошибка FastVLM

**Пример запроса:**
```javascript
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    photo: imageBase64,
    initData: window.Telegram.WebApp.initData,
    theme: 'Casual стиль'
  })
});

const result = await response.json();
console.log(result.analysis);
console.log(result.historyItemId);
```

**Интеграция с FastVLM:**

Сервер пересылает запрос на FastVLM:

```
POST http://127.0.0.1:3001/analyze
Content-Type: application/json

{
  "image_base64": "...",
  "prompt": "Опиши одежду на фото",
  "nickname": "username",
  "topic": "casual"
}
```

**Ответ FastVLM:**
```typescript
{
  success: boolean,
  analysis?: string,           // Креативный ответ стилиста
  technical_analysis?: string, // Технический анализ (ЧЕЛОВЕК, ОДЕЖДА...)
  model_used?: string,
  device?: string,
  error?: string
}
```


**Обработка на сервере:**

1. Валидация Telegram initData
2. Получение пользователя из БД
3. Проверка лимитов анализа
4. Декодирование base64 изображения
5. Отправка на FastVLM для анализа
6. Оптимизация изображения (resize до 800x800px, JPEG 85%)
7. Сохранение изображения на диск (`server/uploads/analysis/{telegramId}/`)
8. Сохранение результата в БД (таблица `HistoryItem`)
9. Обновление счетчиков пользователя (decrement `analysesCount`, increment `totalAnalyses`)
10. Удаление самого старого анализа если уже 50 записей
11. Возврат результата клиенту

**Лимиты:**
- Максимум 50 анализов в истории на пользователя
- При превышении удаляется самый старый анализ
- Счетчик `analysesCount` уменьшается после каждого анализа
- При достижении 0 возвращается ошибка 429

### POST /api/analysis-likes/:historyItemId

Ставит лайк анализу.

**Параметры URL:**
- `historyItemId: number` - ID анализа

**Параметры запроса (body):**
```typescript
{
  initData: string  // Telegram WebApp initData
}
```

**Ответ (success):**
```typescript
{
  success: true,
  isLiked: true,
  likesCount: number
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string,
  isLiked?: boolean,
  likesCount?: number
}
```

**Коды ошибок:**
- `400` - Уже лайкнуто
- `401` - Невалидная аутентификация
- `404` - Пользователь или анализ не найден
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/analysis-likes/123', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    initData: window.Telegram.WebApp.initData
  })
});

const result = await response.json();
console.log(result.likesCount);
```

**Обработка на сервере:**

1. Валидация initData
2. Получение пользователя из БД
3. Проверка существования анализа
4. Проверка не лайкнул ли уже (таблица `Rating` с `ratingType: 'like'`)
5. Атомарная транзакция:
   - Создание записи в `Rating`
   - Инкремент `likesCount` в `HistoryItem`
6. Возврат нового статуса


### DELETE /api/analysis-likes/:historyItemId

Удаляет лайк с анализа.

**Параметры URL:**
- `historyItemId: number` - ID анализа

**Параметры запроса (query):**
```typescript
{
  initData: string  // Telegram WebApp initData
}
```

**Ответ (success):**
```typescript
{
  success: true,
  isLiked: false,
  likesCount: number
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string,
  isLiked?: boolean,
  likesCount?: number
}
```

**Коды ошибок:**
- `404` - Лайк не найден
- `401` - Невалидная аутентификация
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const initData = encodeURIComponent(window.Telegram.WebApp.initData);
const response = await fetch(`/api/analysis-likes/123?initData=${initData}`, {
  method: 'DELETE'
});

const result = await response.json();
console.log(result.likesCount);
```

**Обработка на сервере:**

1. Валидация initData
2. Получение пользователя из БД
3. Проверка существования лайка
4. Атомарная транзакция:
   - Удаление записи из `Rating`
   - Декремент `likesCount` в `HistoryItem`
5. Возврат нового статуса

### GET /api/analysis-likes/:historyItemId/status

Получает статус лайка для текущего пользователя.

**Параметры URL:**
- `historyItemId: number` - ID анализа

**Параметры запроса (query):**
```typescript
{
  initData?: string  // Telegram WebApp initData (опционально)
}
```

**Ответ:**
```typescript
{
  success: true,
  isLiked: boolean,
  likesCount: number
}
```

**Коды ошибок:**
- `404` - Анализ не найден
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const initData = encodeURIComponent(window.Telegram.WebApp.initData);
const response = await fetch(`/api/analysis-likes/123/status?initData=${initData}`);

const result = await response.json();
console.log(result.isLiked);
console.log(result.likesCount);
```

**Обработка на сервере:**

1. Получение `HistoryItem` с `likesCount`
2. Если нет initData - возвращает `isLiked: false`
3. Валидация initData (если есть)
4. Получение пользователя из БД
5. Проверка наличия лайка в таблице `Rating`
6. Возврат статуса


### GET /api/history-metadata

Получает метаданные истории (лайки, просмотры) без загрузки изображений.

**Параметры запроса (query):**
```typescript
{
  initData: string  // Telegram WebApp initData
}
```

**Ответ:**
```typescript
{
  success: true,
  metadata: Array<{
    id: number,
    likesCount: number,
    viewsCount: number,
    isLiked: boolean,
    updatedAt: string
  }>
}
```

**Коды ошибок:**
- `400` - Отсутствует initData
- `401` - Невалидная аутентификация
- `404` - Пользователь не найден
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const initData = encodeURIComponent(window.Telegram.WebApp.initData);
const response = await fetch(`/api/history-metadata?initData=${initData}`);

const result = await response.json();
result.metadata.forEach(item => {
  console.log(`ID: ${item.id}, Likes: ${item.likesCount}, Liked: ${item.isLiked}`);
});
```

**Обработка на сервере:**

1. Валидация initData
2. Получение пользователя из БД
3. Загрузка метаданных из `HistoryItem` (только `id`, `likesCount`, `viewsCount`, `updatedAt`)
4. Загрузка лайков пользователя из `Rating`
5. Формирование ответа с флагом `isLiked` для каждого элемента
6. Возврат массива метаданных

**Оптимизация:**
- Не загружает `photoPath` и `analysisText` (экономия трафика)
- Используется для синхронизации после закрытия экрана анализа
- Вызывается только если в истории >= 10 элементов

## Интеграция с FastVLM

### Конфигурация

**Файл:** `server/src/api/analyze.js`

```javascript
const FASTVLM_CONFIG = {
  HOST: 'http://127.0.0.1',
  PORT: 3001,
  TIMEOUT: 60000, // 60 секунд
  ENDPOINT: '/analyze'
};
```

### Запрос к FastVLM

**URL:** `http://127.0.0.1:3001/analyze`

**Метод:** POST

**Тело запроса:**
```typescript
{
  image_base64: string,  // Base64 изображения
  prompt: string,        // "Опиши одежду на фото"
  nickname: string,      // Никнейм пользователя
  topic: string          // Тема анализа (например, "casual")
}
```

**Ответ FastVLM:**
```typescript
{
  success: boolean,
  analysis?: string,           // Креативный ответ стилиста (для пользователя)
  technical_analysis?: string, // Технический анализ (ЧЕЛОВЕК, ОДЕЖДА...)
  model_used?: string,         // Модель ('llava', 'qwen2-vl')
  device?: string,             // Устройство ('cuda', 'cpu')
  error?: string
}
```


### Обработка ответа FastVLM

**Файл:** `server/src/api/analyze.js`

```javascript
async function analyzeImage(imageBuffer, nickname, theme) {
  try {
    const base64Image = imageBuffer.toString('base64');
    const url = `${FASTVLM_CONFIG.HOST}:${FASTVLM_CONFIG.PORT}${FASTVLM_CONFIG.ENDPOINT}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, FASTVLM_CONFIG.TIMEOUT);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: base64Image,
        prompt: 'Опиши одежду на фото',
        nickname: nickname,
        topic: theme || 'casual'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      
      if (result.success && result.analysis) {
        return {
          success: true,
          analysis: cleanAnalysisText(result.analysis),
          technical_analysis: result.technical_analysis || '',
          fastvlm: true,
          model: result.model_used || 'llava'
        };
      }
    }

    return { success: false, error: 'FastVLM analysis failed' };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'FastVLM timeout' };
    }
    return { success: false, error: error.message };
  }
}
```

### Очистка текста анализа

```javascript
function cleanAnalysisText(text) {
  if (!text || typeof text !== 'string') {
    return 'Анализ выполнен, но текст описания недоступен.';
  }

  let cleanedText = text;

  // Исправляем проблемы с кодировкой UTF-8
  if (cleanedText.includes('�') || cleanedText.includes('\ufffd')) {
    cleanedText = cleanedText.replace(/�/g, '').replace(/\ufffd/g, '');
  }

  // Удаляем лишние пробелы
  cleanedText = cleanedText.trim();

  if (!cleanedText) {
    return 'Анализ выполнен, но текст описания недоступен.';
  }

  return cleanedText;
}
```

### Таймауты и обработка ошибок

- **Таймаут:** 60 секунд
- **AbortController:** Отменяет запрос при таймауте
- **Fallback:** Возвращает понятное сообщение об ошибке
- **Логирование:** Все ошибки логируются с деталями


## Примеры использования

### Полный flow анализа

```typescript
import { analysisManager } from './modules/analysis';
import { uiAnalysisManager } from './modules/uiAnalysis';
import { cameraManager } from './modules/camera';

// 1. Захват фото
const cameraBtn = document.getElementById('camera-btn');
cameraBtn.addEventListener('click', async (e) => {
  await uiAnalysisManager.handleCameraButtonClick(e);
});

// 2. Обработка захвата фото
window.addEventListener('photo:captured', (event) => {
  uiAnalysisManager.handlePhotoCaptured(event);
});

// 3. Выбор темы (автоматически через UI)
// Пользователь кликает на карточку темы
// uiAnalysisManager.selectTheme('casual')

// 4. Анализ (автоматически после выбора темы)
// analysisManager.analyzeImage(imageBase64, 'Casual стиль')

// 5. Показ результата (автоматически после анализа)
// uiAnalysisManager.showAnalysisResult(analysisText, historyItemId)

// 6. Закрытие экрана
const closeBtn = document.getElementById('close-analysis-btn');
closeBtn.addEventListener('click', () => {
  uiAnalysisManager.closeAnalysisScreen();
});
```

### Работа с лайками

```typescript
import { analysisLikesService } from './modules/analysis/AnalysisLikesService';

// Создание компонента лайков в карусели
const carouselCard = document.querySelector('.carousel-card');
analysisLikesService.createLikeComponent(
  carouselCard,
  123, // historyItemId
  { isLiked: false, likesCount: 5 },
  'carousel'
);

// Создание компонента лайков на экране результата
const resultActions = document.querySelector('.result-actions');
analysisLikesService.createLikeComponent(
  resultActions,
  123,
  { isLiked: false, likesCount: 5 },
  'result'
);

// Ручное переключение лайка
const status = await analysisLikesService.toggleLike(123, false);
console.log(`Лайков: ${status.likesCount}`);
```

### Работа с историей

```typescript
import { historyManager } from './modules/history';

// Загрузка истории с сервера
await historyManager.loadHistoryFromServer();

// Получение всех элементов
const items = historyManager.getAllItems();
console.log(`Всего анализов: ${items.length}`);

// Получение элемента по ID
const item = historyManager.getItemById(123);
console.log(item?.analysisText);

// Обновление метаданных (оптимизация)
historyManager.updateMetadata([
  { id: 123, likesCount: 6, viewsCount: 10, isLiked: true }
]);

// Удаление элемента
await historyManager.removeItem(0);

// Статистика
const stats = historyManager.getStats();
console.log(`Заполнено: ${stats.filledSlots} из ${stats.totalSlots}`);
```


### Синхронизация метаданных (оптимизация)

```typescript
import { historyManager } from './modules/history';
import { api } from './modules/api';

// Проверка размера истории
const stats = historyManager.getStats();

if (stats.filledSlots < 10) {
  // Мало элементов - загружаем полностью
  await historyManager.loadHistoryFromServer();
} else {
  // Много элементов - загружаем только метаданные
  const initData = window.Telegram.WebApp.initData;
  const response = await api.get(`/history-metadata?initData=${encodeURIComponent(initData)}`);
  
  if (response.success) {
    historyManager.updateMetadata(response.metadata);
  }
}
```

### Обработка событий

```typescript
// Изменение состояния анализа
window.addEventListener('analysisStateChange', (event) => {
  const state = event.detail;
  console.log(`Статус: ${state.status}, Прогресс: ${state.progress}%`);
  
  if (state.status === 'error') {
    console.error(`Ошибка: ${state.error}`);
  }
});

// Обновление истории
window.addEventListener('history:updated', (event) => {
  const { source, itemsCount } = event.detail;
  console.log(`История обновлена из ${source}, элементов: ${itemsCount}`);
});

// Обновление метаданных
window.addEventListener('history:metadata-updated', (event) => {
  const { historyItemId, likesCount, isLiked } = event.detail;
  console.log(`Анализ ${historyItemId}: лайков ${likesCount}, лайкнут: ${isLiked}`);
});
```

### Прямой вызов API

```typescript
// Анализ изображения
const analyzeResponse = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    photo: imageBase64,
    initData: window.Telegram.WebApp.initData,
    theme: 'Casual стиль'
  })
});

const analyzeResult = await analyzeResponse.json();
console.log(analyzeResult.analysis);
console.log(`Осталось анализов: ${analyzeResult.analysesLeft}`);

// Лайк анализа
const likeResponse = await fetch('/api/analysis-likes/123', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    initData: window.Telegram.WebApp.initData
  })
});

const likeResult = await likeResponse.json();
console.log(`Лайков: ${likeResult.likesCount}`);

// Получение метаданных
const initData = encodeURIComponent(window.Telegram.WebApp.initData);
const metadataResponse = await fetch(`/api/history-metadata?initData=${initData}`);
const metadataResult = await metadataResponse.json();

metadataResult.metadata.forEach(item => {
  console.log(`ID: ${item.id}, Лайков: ${item.likesCount}`);
});
```


## Типы данных

### AnalysisRequest

```typescript
interface AnalysisRequest {
  photo: string;           // Base64 изображения
  platform: string;        // navigator.platform
  userAgent: string;       // navigator.userAgent
  initData?: string;       // Telegram WebApp initData
  theme?: string;          // Тема анализа
}
```

### AnalysisResponse

```typescript
interface AnalysisResponse {
  success: boolean;
  analysis?: string;           // Текст анализа
  model?: string;              // Модель FastVLM
  historyItemId?: number;      // ID сохраненного анализа
  analysesLeft?: number;       // Оставшиеся анализы
  totalAnalyses?: number;      // Всего выполнено анализов
  error?: string;              // Сообщение об ошибке
  message?: string;            // Дополнительное сообщение
}
```

### AnalysisState

```typescript
interface AnalysisState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;        // 0-100
  currentStep?: string;    // Текущий шаг
  error?: string;          // Сообщение об ошибке
}
```

### AnalysisLikeStatus

```typescript
interface AnalysisLikeStatus {
  isLiked: boolean;
  likesCount: number;
}
```

### HistoryItem

```typescript
interface HistoryItem {
  id: number;
  telegramId: string;          // Telegram ID для путей к файлам
  photoPath?: string;          // Путь к файлу изображения
  analysisText?: string;       // Текст анализа
  technicalAnalysis?: string;  // Технический анализ
  isPublic: boolean;           // Публичный анализ
  shareId?: string;            // ID для sharing
  likesCount: number;          // Количество лайков
  viewsCount: number;          // Количество просмотров
  isLiked?: boolean;           // Лайкнут текущим пользователем
  createdAt: string;           // ISO дата создания
  updatedAt?: string;          // ISO дата обновления
}
```

### FashionTheme

```typescript
type FashionTheme = 
  | 'casual'
  | 'business'
  | 'sport'
  | 'evening'
  | 'street'
  | 'minimalism'
  | 'vintage'
  | 'romantic';

interface FashionThemeData {
  id: FashionTheme;
  name: string;
  emoji: string;
  description: string;
}
```


## Оптимизации и best practices

### Оптимистичное обновление UI

Лайки обновляются мгновенно без ожидания ответа сервера:

```typescript
// 1. Мгновенное обновление UI
currentState.isLiked = true;
currentState.likesCount += 1;
likeBtn.classList.add('liked');
likesCountEl.textContent = String(currentState.likesCount);

// 2. Асинхронный запрос
try {
  const updatedStatus = await this.toggleLike(entityId, false);
  
  // 3. Корректировка если ответ отличается
  if (updatedStatus.likesCount !== currentState.likesCount) {
    currentState = updatedStatus;
    likesCountEl.textContent = String(currentState.likesCount);
  }
} catch (error) {
  // 4. Откат при ошибке
  currentState = previousState;
  likeBtn.classList.toggle('liked', currentState.isLiked);
  likesCountEl.textContent = String(currentState.likesCount);
}
```

### Синхронизация метаданных

Для больших историй (>= 10 элементов) загружаются только метаданные:

```typescript
const stats = historyManager.getStats();

if (stats.filledSlots < 10) {
  // Полная загрузка
  await historyManager.loadHistoryFromServer();
} else {
  // Только метаданные (экономия трафика)
  await syncHistoryMetadata();
}
```

### Трехуровневое кэширование

1. **Память (HistoryManager)** - Мгновенный доступ
2. **localStorage** - Быстрый доступ при перезагрузке
3. **Сервер** - Источник истины

```typescript
// Загрузка из localStorage при старте
constructor() {
  this.loadFromStorage();
}

// Загрузка с сервера
await historyManager.loadHistoryFromServer();

// Сохранение в localStorage
private saveToStorage(): void {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.history));
}
```

### Оптимизация изображений

**На клиенте:**
- Конвертация в base64 для передачи
- Оптимизация перед отправкой на FastVLM

**На сервере:**
- Resize до 800x800px
- JPEG качество 85%
- Автоматическая ротация по EXIF
- Сохранение на диск вместо БД

```javascript
const optimizedBuffer = await sharp(imageBuffer)
  .rotate() // Применяет EXIF orientation
  .resize(800, 800, {
    fit: 'inside',
    withoutEnlargement: true
  })
  .jpeg({ quality: 85, progressive: true })
  .toBuffer();
```


### Обработка ошибок

**Graceful degradation:**

```typescript
try {
  const response = await api.analyzeImage(request);
  
  if (!response.success) {
    // User-friendly сообщение вместо технических ошибок
    throw new Error('Сервер временно недоступен. Попробуйте позже.');
  }
} catch (error) {
  this.updateState({
    status: 'error',
    error: error.message
  });
  
  // Показ ошибки в UI
  uiAnalysisManager.showAnalysisError();
}
```

**Fallback на кэш:**

```typescript
try {
  await historyManager.loadHistoryFromServer();
} catch (error) {
  logger.warn('Failed to load from server, using cache');
  // localStorage уже загружен в constructor
}
```

### Лимиты и квоты

**Проверка лимитов на сервере:**

```javascript
function checkAnalysisLimits(user) {
  if (!user) {
    return { allowed: true, reason: 'user_not_found_fallback' };
  }

  if (user.analysesCount <= 0) {
    return {
      allowed: false,
      reason: 'limit_exceeded',
      analysesLeft: 0
    };
  }

  return {
    allowed: true,
    reason: 'limit_ok',
    analysesLeft: user.analysesCount
  };
}
```

**Обновление счетчиков:**

```javascript
const updatedUser = await prisma.user.update({
  where: { id: userId },
  data: {
    analysesCount: { decrement: 1 },
    totalAnalyses: { increment: 1 }
  }
});
```

### Управление историей

**Лимит 50 анализов:**

```javascript
const historyCount = await prisma.historyItem.count({
  where: { userId }
});

if (historyCount >= 50) {
  const oldestItem = await prisma.historyItem.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' }
  });

  if (oldestItem) {
    await deleteAnalysisImage(telegramId, oldestItem.photoPath);
    await prisma.historyItem.delete({
      where: { id: oldestItem.id }
    });
  }
}
```

### Безопасность

**Валидация Telegram initData:**

```javascript
const validationResult = validateTelegramWebAppData(initData);
if (!validationResult.isValid) {
  return res.status(401).json({
    success: false,
    error: validationResult.error
  });
}
```

**Проверка размера изображения:**

```javascript
if (imageBuffer.length < 100) {
  return res.status(400).json({
    success: false,
    error: 'Image too small'
  });
}
```


## Диаграмма последовательности

### Полный flow анализа

```
Пользователь → UIAnalysisManager → CameraManager → UIAnalysisManager → AnalysisManager → API → Server → FastVLM
                                                                                                    ↓
                                                                                                Database
                                                                                                    ↓
Пользователь ← UIAnalysisManager ← HistoryManager ← UIManager ← AnalysisManager ← API ← Server ←┘
```

**Детальная последовательность:**

1. Пользователь кликает кнопку камеры
2. `UIAnalysisManager.handleCameraButtonClick()` → `CameraManager.capturePhoto()`
3. Событие `photo:captured` → `UIAnalysisManager.handlePhotoCaptured()`
4. `UIAnalysisManager.showFullscreenPreview(imageBase64, true)` - показ выбора темы
5. Пользователь выбирает тему → `UIAnalysisManager.selectTheme('casual')`
6. `UIAnalysisManager.showAnalysisWithTheme()` → `AnalysisManager.analyzeImage()`
7. `AnalysisManager` обновляет состояние: `uploading` → `processing`
8. `API.analyzeImage()` → POST /api/analyze
9. Сервер валидирует initData и проверяет лимиты
10. Сервер отправляет на FastVLM: POST http://127.0.0.1:3001/analyze
11. FastVLM анализирует и возвращает текст
12. Сервер оптимизирует изображение и сохраняет на диск
13. Сервер сохраняет результат в БД (таблица HistoryItem)
14. Сервер обновляет счетчики пользователя
15. Сервер возвращает результат клиенту
16. `AnalysisManager` обновляет состояние: `completed`
17. `AnalysisManager` перезагружает историю: `historyManager.loadHistoryFromServer()`
18. `AnalysisManager` обновляет UI: `uiManager.updateHistoryDisplay()`
19. `AnalysisManager` обновляет лимиты: `authManager.updateUserLimits()`
20. `AnalysisManager` показывает результат: `uiManager.showAnalysisResult()`
21. `UIAnalysisManager.showAnalysisResult()` парсит текст и создает компоненты
22. Пользователь видит результат с каскадной анимацией

### Flow лайка

```
Пользователь → AnalysisLikesService → API → Server → Database
                      ↓ (оптимистично)
                     UI
                      ↓ (корректировка)
                     UI ← AnalysisLikesService ← API ← Server
```

**Детальная последовательность:**

1. Пользователь кликает кнопку лайка
2. `AnalysisLikesService` мгновенно обновляет UI (оптимистично)
3. `AnalysisLikesService.toggleLike()` → POST /api/analysis-likes/:id
4. Сервер валидирует initData
5. Сервер проверяет существование лайка
6. Сервер атомарно создает/удаляет лайк и обновляет счетчик
7. Сервер возвращает новый статус
8. `AnalysisLikesService` корректирует UI если нужно
9. `HistoryManager.updateItemLikeStatus()` обновляет кэш


## Метрики производительности

### Время выполнения

**Анализ изображения:**
- Подготовка: < 1s (10%)
- Отправка на FastVLM: 1-2s (30%)
- Анализ FastVLM: 5-15s (60%)
- Сохранение результата: < 1s (100%)

**Загрузка истории:**
- Из localStorage: < 100ms (мгновенно)
- С сервера (< 10 элементов): 500-1000ms
- Метаданные (>= 10 элементов): 200-500ms

**Лайк:**
- Оптимистичное обновление UI: < 50ms
- Запрос к серверу: 200-500ms
- Корректировка UI: < 50ms

### Размер данных

**Изображения:**
- Оригинал: 1-5 MB
- Оптимизированное (800x800px, JPEG 85%): 200-500 KB
- Base64 overhead: +33%

**История:**
- localStorage: До 5 MB (50 анализов)
- Метаданные: < 10 KB (50 элементов)

### Оптимизации

**Экономия трафика:**
- Синхронизация метаданных вместо полной загрузки: -95% трафика
- Оптимизация изображений: -80% размера
- Кэширование в localStorage: -100% повторных запросов

**Экономия времени:**
- Оптимистичное обновление лайков: -200-500ms задержки
- Оптимистичная отрисовка UI: -500-1000ms загрузки
- Прогрессивная загрузка изображений: -50% начальной загрузки

## Troubleshooting

### Ошибка "Analysis limit exceeded"

**Причина:** Превышен лимит анализов пользователя.

**Решение:**
```typescript
// Проверка лимитов перед анализом
const user = await authManager.getCurrentUser();
if (user.analysesLeft <= 0) {
  alert('Превышен лимит анализов');
  return;
}
```

### Ошибка "FastVLM timeout"

**Причина:** FastVLM сервер не отвечает в течение 60 секунд.

**Решение:**
- Проверить доступность FastVLM: `http://127.0.0.1:3001/analyze`
- Увеличить таймаут в `FASTVLM_CONFIG.TIMEOUT`
- Проверить логи FastVLM сервера

### Ошибка "Invalid authentication"

**Причина:** Невалидный Telegram initData.

**Решение:**
```typescript
// Проверка наличия initData
const initData = window.Telegram?.WebApp?.initData;
if (!initData) {
  console.error('No Telegram initData available');
  return;
}
```

### Лайки не синхронизируются

**Причина:** Анализ не в локальной истории пользователя (shared analysis).

**Решение:**
```typescript
// Проверка наличия в локальной истории
const isInLocalHistory = historyManager.getItemById(historyItemId) !== undefined;
if (!isInLocalHistory) {
  logger.info('Skipping local history update - shared analysis');
}
```

