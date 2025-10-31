# API модуля Capsules

## Обзор

Модуль Capsules предоставляет API для создания, редактирования и управления капсулами (образами) - комбинациями вещей из гардероба пользователя. API включает клиентские методы для работы с UI и бизнес-логикой, а также серверные endpoints для работы с данными.

**Архитектурные особенности:**
- **Dependency Injection** - CapsulesManager делегирует задачи специализированным модулям
- **Singleton Pattern** - UICanvasEditor использует единственный экземпляр
- **Flow Management** - CapsuleFlowManager управляет переходами между этапами
- **State Management** - CanvasStateManager управляет кэшированием состояний
- **Service Layer** - Специализированные сервисы для обработки изображений и модальных окон

## Клиентские методы

### CapsulesManager

**Файл:** `client/src/modules/capsules/CapsulesManager.ts`

**Singleton:** `capsulesManager`

**Архитектурный паттерн:** Coordinator + Dependency Injection

#### handleCapsulesOpen()

Открывает грид капсул с инвалидацией старого кэша.

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
import { capsulesManager } from './modules/capsules/CapsulesManager';

// Открыть грид капсул
await capsulesManager.handleCapsulesOpen();
```

**Flow выполнения:**
1. Инвалидирует старый кэш (старше 1 часа)
2. Загружает капсулы через DataLoader с кэш-fallback
3. Показывает грид капсул
4. Рендерит капсулы с анимацией

**Интеграция:**
- `CanvasStateManager.invalidateOldCache()` - Очистка старого кэша
- `DataLoader.loadWithCacheFallback()` - Умная загрузка данных
- `UICapsulesGrid.show()` и `render()` - Отображение грида
#### closeCapsules()

Закрывает модуль капсул полностью.

**Пример:**
```typescript
capsulesManager.closeCapsules();
```

**Интеграция:**
- Отменяет активный flow через `CapsuleFlowManager.cancel()`
- Очищает canvas через `cleanupCanvas()`
- Скрывает UI компоненты

#### showItemSelection(preselectedIds?, context?)

ЕДИНЫЙ МЕТОД для показа выбора вещей из гардероба.

**Параметры:**
- `preselectedIds?: number[]` - ID предварительно выбранных вещей
- `context?: 'new-capsule' | 'canvas-add'` - Контекст вызова

**Возвращает:** `Promise<WardrobeItem[]>`

**Пример:**
```typescript
// Выбор для новой капсулы
const selectedItems = await capsulesManager.showItemSelection([], 'new-capsule');

// Добавление вещей на canvas с предвыбором
const currentIds = canvasEditor.getItemIds();
const updatedItems = await capsulesManager.showItemSelection(currentIds, 'canvas-add');
```

**Интеграция:**
- ДЕЛЕГИРУЕТ в `CapsuleSelectionManager.show()`
- Поддерживает предвыбор для возврата с canvas
- Универсальная работа в разных контекстах

#### getStatus()

Получает текущее состояние менеджера капсул.

**Возвращает:** `object`

**Пример:**
```typescript
const status = capsulesManager.getStatus();
console.log(status.initialized); // true
console.log(status.flowStatus); // Статус CapsuleFlowManager
console.log(status.canvasVisible); // Видимость canvas
console.log(status.capsulesCount); // Количество капсул
```

#### destroy()

Очищает все ресурсы и обработчики событий.

**Пример:**
```typescript
capsulesManager.destroy();
```

### CapsuleFlowManager

**Файл:** `client/src/modules/capsules/CapsuleFlowManager.ts`

**Singleton:** `capsuleFlowManager`

**Архитектурный паттерн:** State Machine + Observer

#### startNewCapsule()

Начинает создание новой капсулы.

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
import { capsuleFlowManager } from './modules/capsules/CapsuleFlowManager';

// Начать создание новой капсулы
await capsuleFlowManager.startNewCapsule();
```

**Flow выполнения:**
1. Сбрасывает состояние flow
2. Устанавливает режим 'create'
3. Переходит на этап 'selection'
4. Настраивает навигацию BackButton

#### editCapsule(capsuleId)

Начинает редактирование существующей капсулы.

**Параметры:**
- `capsuleId: number` - ID капсулы для редактирования

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
// Редактировать капсулу
await capsuleFlowManager.editCapsule(123);
```

**Flow выполнения:**
1. Устанавливает режим 'edit'
2. Переходит сразу на этап 'canvas' (пропускает selection)
3. Настраивает навигацию BackButton

#### moveToSelection() / moveToCanvas() / moveToResult()

Переходы между этапами flow.

**Пример:**
```typescript
// Переходы между этапами
capsuleFlowManager.moveToSelection(); // selection этап
capsuleFlowManager.moveToCanvas();    // canvas этап  
capsuleFlowManager.moveToResult();    // result этап
```

**Интеграция:**
- Каждый переход вызывает соответствующий callback
- Настраивает навигацию BackButton для каждого этапа
- Обновляет внутреннее состояние flow

#### goBack()

Возвращается на предыдущий этап с сохранением состояния.

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
// Возврат назад (вызывается через BackButton)
await capsuleFlowManager.goBack();
```

**Flow возврата:**
- `result → canvas`
- `canvas → selection` (только для create)
- `canvas → grid` (для edit)
- `selection → grid` (отмена)

#### complete() / cancel()

Завершение или отмена flow.

**Пример:**
```typescript
// Завершить flow (сохранить капсулу)
await capsuleFlowManager.complete();

// Отменить flow (вернуться к гриду)
capsuleFlowManager.cancel();
```

#### Управление состоянием

**Методы для работы с состоянием flow:**

```typescript
// Работа с выбранными вещами
capsuleFlowManager.setSelectedItems(items);
const selectedItems = capsuleFlowManager.getSelectedItems();

// Работа с состоянием canvas
capsuleFlowManager.setCanvasState(canvasState);
const canvasState = capsuleFlowManager.getCanvasState();

// Работа с результатом
capsuleFlowManager.setResultImage(imageBase64);
const resultImage = capsuleFlowManager.getResultImage();

// Работа с metadata (для AI-generated капсул)
capsuleFlowManager.setMetadata({ isGenerated: true, source: 'ai_generated' });
const metadata = capsuleFlowManager.getMetadata();

// ID капсулы (для редактирования)
capsuleFlowManager.setCapsuleId(123);
const capsuleId = capsuleFlowManager.getCapsuleId();

// Режим и этап
const mode = capsuleFlowManager.getMode(); // 'create' | 'edit'
const step = capsuleFlowManager.getCurrentStep(); // 'selection' | 'canvas' | 'result'
```

#### setCallbacks(callbacks)

Устанавливает callbacks для событий flow.

**Параметры:**
- `callbacks: CapsuleFlowCallbacks` - Объект с callback функциями

**Пример:**
```typescript
capsuleFlowManager.setCallbacks({
  onMoveToSelection: () => showSelectionModal(),
  onMoveToCanvas: () => showCanvas(),
  onMoveToResult: () => showResultScreen(),
  onGoBack: () => saveCanvasState(),
  onComplete: () => returnToGrid(),
  onCancel: () => returnToGrid()
});
```

### CapsuleSelectionManager

**Файл:** `client/src/modules/capsules/CapsuleSelectionManager.ts`

**Singleton:** `capsuleSelectionManager`

**Архитектурный паттерн:** Modal Manager + Event-Driven

#### show(preselectedIds?)

Показывает модальное окно выбора вещей из гардероба.

**Параметры:**
- `preselectedIds?: number[]` - ID предварительно выбранных вещей

**Возвращает:** `Promise<WardrobeItem[]>`

**Пример:**
```typescript
import { capsuleSelectionManager } from './modules/capsules/CapsuleSelectionManager';

// Показать выбор без предвыбора
const selectedItems = await capsuleSelectionManager.show();

// Показать выбор с предвыбранными вещами
const preselected = [1, 2, 3];
const updatedItems = await capsuleSelectionManager.show(preselected);
```

**Интеграция:**
- Загружает гардероб через `WardrobeService.loadWardrobe()`
- Отправляет событие `'wardrobe:render-requested'` для рендеринга грида
- Слушает событие `'wardrobe:item-selection-toggle'` для переключения выбора
- Восстанавливает выделение после добавления новой вещи

#### hide()

Скрывает модальное окно и очищает обработчики.

**Пример:**
```typescript
capsuleSelectionManager.hide();
```

#### getSelectedItems()

Получает текущие выбранные вещи.

**Возвращает:** `WardrobeItem[]`

**Пример:**
```typescript
const selected = capsuleSelectionManager.getSelectedItems();
console.log(`Выбрано: ${selected.length} вещей`);
```

#### setSelectedItems(items)

Устанавливает выбранные вещи программно.

**Параметры:**
- `items: WardrobeItem[]` - Вещи для выбора

**Пример:**
```typescript
// Программная установка выбора
capsuleSelectionManager.setSelectedItems(wardrobeItems.slice(0, 3));
```

#### updateConfig(newConfig)

Обновляет конфигурацию менеджера.

**Параметры:**
- `newConfig: Partial<CapsuleSelectionConfig>` - Новая конфигурация

**Пример:**
```typescript
// Обновление callbacks
capsuleSelectionManager.updateConfig({
  onAddItem: () => handleAddNewItem(),
  onConfirm: (items) => console.log('Selected:', items.length),
  onCancel: () => console.log('Selection cancelled')
});
```

### CanvasStateManager

**Файл:** `client/src/modules/capsules/CanvasStateManager.ts`

**Singleton:** `canvasStateManager`

**Архитектурный паттерн:** Cache Manager + State Persistence

#### saveState(canvasEditor, cacheKey?)

Сохраняет состояние canvas с автоматической обрезкой по содержимому.

**Параметры:**
- `canvasEditor: UICanvasEditor` - Экземпляр canvas editor
- `cacheKey?: string` - Ключ для кэширования

**Возвращает:** `Promise<CanvasState>`

**Пример:**
```typescript
import { canvasStateManager } from './modules/capsules/CanvasStateManager';

// Сохранение с кэшированием
const state = await canvasStateManager.saveState(canvasEditor, 'capsule-123');

// Сохранение без кэширования
const state = await canvasStateManager.saveState(canvasEditor);
```

**Возвращаемое состояние:**
```typescript
interface CanvasState {
  canvasData: any;           // Данные canvas (объекты, позиции)
  thumbnailImage: string;    // base64 thumbnail с удаленным фоном
  itemIds: number[];         // ID вещей на canvas
  timestamp: number;         // Timestamp для инвалидации кэша
  isDirty: boolean;          // Флаг изменений
}
```

#### restoreState(canvasEditor, state)

Восстанавливает состояние canvas.

**Параметры:**
- `canvasEditor: UICanvasEditor` - Экземпляр canvas editor
- `state: CanvasState` - Сохраненное состояние

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
// Восстановление состояния
const cachedState = canvasStateManager.getCachedState('capsule-123');
if (cachedState) {
  await canvasStateManager.restoreState(canvasEditor, cachedState);
}
```

#### getCachedState(cacheKey) / hasCachedState(cacheKey)

Работа с кэшем состояний.

**Пример:**
```typescript
// Проверка наличия в кэше
if (canvasStateManager.hasCachedState('capsule-123')) {
  const state = canvasStateManager.getCachedState('capsule-123');
  console.log('Loaded from cache:', state?.itemIds.length);
}
```

#### markDirty(cacheKey) / isDirty(cacheKey)

Управление флагом изменений.

**Пример:**
```typescript
// Пометка как измененного
canvasStateManager.markDirty('capsule-123');

// Проверка изменений
if (canvasStateManager.isDirty('capsule-123')) {
  console.log('Canvas state has been modified');
}
```

#### invalidateOldCache(maxAge?) / clearCache()

Управление кэшем.

**Пример:**
```typescript
// Инвалидация старого кэша (старше 1 часа)
canvasStateManager.invalidateOldCache(60 * 60 * 1000);

// Полная очистка кэша
canvasStateManager.clearCache();

// Очистка конкретного ключа
canvasStateManager.clearCacheForKey('temp-canvas');
```

#### getThumbnail(canvasEditor, cacheKey?, useCache?)

Получение thumbnail с поддержкой кэша.

**Параметры:**
- `canvasEditor: UICanvasEditor` - Экземпляр canvas editor
- `cacheKey?: string` - Ключ для кэширования
- `useCache?: boolean` - Использовать кэш (по умолчанию true)

**Возвращает:** `Promise<string>` - base64 изображение

**Пример:**
```typescript
// Получение с кэшированием
const thumbnail = await canvasStateManager.getThumbnail(canvasEditor, 'capsule-123');

// Получение без кэша
const freshThumbnail = await canvasStateManager.getThumbnail(canvasEditor, undefined, false);
```

#### getCacheStats()

Получает статистику использования кэша.

**Возвращает:** `object`

**Пример:**
```typescript
const stats = canvasStateManager.getCacheStats();
console.log(`States: ${stats.statesCount}, Size: ${stats.totalSize} bytes`);
console.log(`Oldest cache: ${stats.oldestTimestamp}`);
```

### CapsulesService

**Файл:** `client/src/modules/capsules/CapsulesService.ts`

**Singleton:** `capsulesService`

**Архитектурный паттерн:** Service Layer

#### loadCapsules()

Загружает все капсулы с кэш-fallback стратегией.

**Возвращает:** `Promise<StyleCapsule[]>`

**Пример:**
```typescript
import { capsulesService } from './modules/capsules/CapsulesService';

const capsules = await capsulesService.loadCapsules();
console.log(`Загружено ${capsules.length} капсул`);
```

**Интеграция:**
- Использует `DataLoader.loadWithCacheFallback()`
- Сначала проверяет кэш памяти (`dataCacheManager.getCapsules()`)
- При отсутствии кэша загружает с сервера (`loadCapsulesFromServer()`)

#### loadCapsule(capsuleId)

Загружает конкретную капсулу с полными данными.

**Параметры:**
- `capsuleId: number` - ID капсулы

**Возвращает:** `Promise<Capsule>`

**Пример:**
```typescript
const capsule = await capsulesService.loadCapsule(123);
console.log('Canvas data:', capsule.canvasData);
console.log('Items:', capsule.items);
```

#### createCapsule(data)

Создает новую капсулу на сервере.

**Параметры:**
- `data: CreateCapsuleDto` - Данные для создания

**Возвращает:** `Promise<Capsule>`

**Пример:**
```typescript
const newCapsule = await capsulesService.createCapsule({
  name: 'Летний образ',
  canvasData: canvasState.canvasData,
  thumbnailImage: canvasState.thumbnailImage,
  itemIds: [1, 2, 3],
  metadata: {
    isGenerated: false,
    source: 'manual'
  }
});

console.log('Создана капсула:', newCapsule.id);
```

**Интеграция:**
- Отправляет POST `/api/capsules`
- Автоматически добавляет в кэш через `dataCacheManager.addCapsule()`

#### updateCapsule(capsuleId, data)

Обновляет существующую капсулу.

**Параметры:**
- `capsuleId: number` - ID капсулы
- `data: UpdateCapsuleDto` - Данные для обновления

**Возвращает:** `Promise<Capsule>`

**Пример:**
```typescript
const updated = await capsulesService.updateCapsule(123, {
  canvasData: newCanvasData,
  thumbnailImage: newThumbnail
  // ВАЖНО: НЕ отправляем itemIds при обновлении
});

console.log('Капсула обновлена:', updated.id);
```

**Особенности:**
- При обновлении НЕ отправляем `itemIds` - они не должны изменяться
- Автоматически обновляет кэш через `dataCacheManager.updateCapsule()`

#### deleteCapsule(capsuleId)

Удаляет капсулу.

**Параметры:**
- `capsuleId: number` - ID капсулы

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
await capsulesService.deleteCapsule(123);
console.log('Капсула удалена');
```

**Интеграция:**
- Отправляет DELETE `/api/capsules/:id`
- Автоматически удаляет из кэша через `dataCacheManager.removeCapsule()`

#### sortItemsByLayer(items)

Сортирует вещи по слоям одежды (от нижнего к верхнему).

**Параметры:**
- `items: WardrobeItem[]` - Вещи для сортировки

**Возвращает:** `WardrobeItem[]`

**Пример:**
```typescript
const sortedItems = capsulesService.sortItemsByLayer(selectedItems);
// Порядок: LEGWEAR → BODYWEAR → INNERWEAR → FULLBODY → FOOTWEAR → OUTERWEAR → HEADWEAR → ACCESSORIES
```

**Использование:**
- Автоматическое позиционирование на canvas
- Правильный порядок слоев одежды
- Визуальная корректность (верхняя одежда поверх нижней)#
# Серверные endpoints

### POST /api/capsules

Создает новую капсулу с сохранением изображения на диск.

**Параметры запроса (body):**
```typescript
{
  name?: string,           // Название капсулы
  canvasData: any,         // Данные canvas (обязательно)
  thumbnailImage?: string, // Base64 thumbnail изображения
  itemIds?: number[],      // ID вещей в капсуле
  metadata?: {             // Metadata для AI-generated капсул
    source?: string,       // 'ai_generated' или 'manual'
    recommendations?: string,
    reasoning?: string,
    season?: string,
    description?: string
  }
}
```

**Заголовки:**
```typescript
{
  'X-Init-Data'?: string,  // Telegram WebApp initData
  'Content-Type': 'application/json'
}
```

**Ответ (success):**
```typescript
{
  success: true,
  capsule: {
    id: number,
    name: string | null,
    thumbnailUrl: string,    // URL для доступа к изображению
    canvasData: any,
    metadata: any | null,
    createdAt: string,       // ISO дата создания
    itemCount: number,
    items: WardrobeItem[]    // Связанные вещи
  }
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `400` - Отсутствует обязательный параметр canvasData
- `401` - Невалидная аутентификация Telegram
- `403` - Нет доступа к указанным вещам гардероба
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/capsules', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Init-Data': window.Telegram.WebApp.initData
  },
  body: JSON.stringify({
    name: 'Летний образ',
    canvasData: {
      canvas: { objects: [...] },
      version: '5.3.0'
    },
    thumbnailImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    itemIds: [1, 2, 3],
    metadata: {
      source: 'manual',
      season: 'summer'
    }
  })
});

const result = await response.json();
console.log('Создана капсула:', result.capsule.id);
```

**Обработка на сервере:**
1. Валидация Telegram initData
2. Проверка обязательных параметров
3. Проверка доступа к вещам гардероба
4. Сохранение thumbnail изображения на диск через `FileService.saveCapsuleThumbnail()`
5. Создание записи в БД (таблица `Capsule`)
6. Связывание с вещами гардероба через Prisma relations
7. Формирование URL изображения через `FileService.getImageUrl()`
8. Возврат созданного объекта

### GET /api/capsules

Получает все капсулы пользователя с пагинацией.

**Параметры запроса (query):**
```typescript
{
  page?: number,    // Номер страницы (по умолчанию 1)
  limit?: number    // Количество на страницу (по умолчанию 10)
}
```

**Заголовки:**
```typescript
{
  'X-Init-Data': string  // Telegram WebApp initData (обязательно)
}
```

**Ответ (success):**
```typescript
{
  success: true,
  capsules: Capsule[],     // Массив капсул пользователя
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number
  }
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `401` - Невалидная аутентификация Telegram
- `404` - Пользователь не найден
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/capsules?page=1&limit=20', {
  headers: {
    'X-Init-Data': window.Telegram.WebApp.initData
  }
});

const result = await response.json();
console.log(`Загружено ${result.capsules.length} капсул`);
result.capsules.forEach(capsule => {
  console.log(`${capsule.name}: ${capsule.itemCount} вещей, ${capsule.likesCount} лайков`);
});
```

**Обработка на сервере:**
1. Валидация Telegram initData
2. Получение пользователя из БД
3. Загрузка капсул с пагинацией (сортировка по дате создания)
4. Загрузка связанных вещей гардероба
5. Проверка лайков текущего пользователя
6. Формирование URL для каждого изображения
7. Возврат массива с полными данными и пагинацией

### GET /api/capsules/:id

Получает конкретную капсулу по ID.

**Параметры URL:**
- `id: number` - ID капсулы

**Параметры запроса (query):**
```typescript
{
  telegramId?: string  // Telegram ID для проверки лайков (опционально)
}
```

**Ответ (success):**
```typescript
{
  success: true,
  capsule: {
    id: number,
    name: string,
    description?: string,
    thumbnailUrl: string,
    canvasData: any,
    metadata?: any,
    analysis?: string,
    analysisDate?: string,
    createdAt: string,
    likesCount: number,
    isLiked: boolean,        // Только если передан telegramId
    itemCount: number,
    items: WardrobeItem[]
  }
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `404` - Капсула не найдена
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
// Без проверки лайков
const response = await fetch('/api/capsules/123');

// С проверкой лайков
const telegramId = window.Telegram.WebApp.initDataUnsafe.user?.id;
const response = await fetch(`/api/capsules/123?telegramId=${telegramId}`);

const result = await response.json();
console.log('Капсула:', result.capsule.name);
console.log('Лайкнута:', result.capsule.isLiked);
```

**Обработка на сервере:**
1. Поиск капсулы по ID
2. Загрузка связанных вещей гардероба
3. Проверка лайка текущего пользователя (если передан telegramId)
4. Формирование URL изображения
5. Возврат полных данных капсулы

### PUT /api/capsules/:id

Обновляет существующую капсулу.

**Параметры URL:**
- `id: number` - ID капсулы для обновления

**Параметры запроса (body):**
```typescript
{
  canvasData?: any,        // Новые данные canvas
  thumbnailImage?: string, // Новое thumbnail изображение
  itemIds?: number[]       // Новые ID вещей (опционально)
}
```

**Заголовки:**
```typescript
{
  'X-Init-Data': string,   // Telegram WebApp initData
  'Content-Type': 'application/json'
}
```

**Ответ (success):**
```typescript
{
  success: true,
  capsule: {
    id: number,
    name: string,
    thumbnailUrl: string,
    canvasData: any,
    metadata?: any,
    createdAt: string,
    likesCount: number,
    isLiked: boolean,
    itemCount: number,
    items: WardrobeItem[]
  }
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `401` - Невалидная аутентификация Telegram
- `403` - Нет доступа к капсуле или указанным вещам
- `404` - Капсула не найдена
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/capsules/123', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Init-Data': window.Telegram.WebApp.initData
  },
  body: JSON.stringify({
    canvasData: updatedCanvasData,
    thumbnailImage: newThumbnailBase64
    // ВАЖНО: НЕ отправляем itemIds при обычном обновлении
  })
});

const result = await response.json();
console.log('Капсула обновлена');
```

**Обработка на сервере:**
1. Валидация Telegram initData
2. Проверка принадлежности капсулы пользователю
3. Сохранение нового thumbnail (если передан)
4. Удаление старого файла изображения
5. Обновление связей с вещами (если переданы itemIds)
6. Проверка доступа к новым вещам
7. Обновление записи в БД
8. Возврат обновленного объекта

### DELETE /api/capsules/:id

Удаляет капсулу и связанное изображение.

**Параметры URL:**
- `id: number` - ID капсулы для удаления

**Заголовки:**
```typescript
{
  'X-Init-Data': string  // Telegram WebApp initData
}
```

**Ответ (success):**
```typescript
{
  success: true,
  message: "Capsule deleted successfully"
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `401` - Невалидная аутентификация Telegram
- `404` - Капсула не найдена или нет доступа
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/capsules/123', {
  method: 'DELETE',
  headers: {
    'X-Init-Data': window.Telegram.WebApp.initData
  }
});

const result = await response.json();
console.log('Капсула удалена');
```

**Обработка на сервере:**
1. Валидация Telegram initData
2. Проверка существования капсулы
3. Проверка принадлежности пользователю
4. Удаление файла изображения с диска (`FileService.deleteOldCapsuleThumbnail()`)
5. Удаление записи из БД (каскадное удаление связей)
6. Возврат подтверждения

### POST /api/capsules/generate

Генерирует 3 варианта капсул через AI (FastVLM).

**Параметры запроса (body):**
```typescript
{
  excludeCombinations?: number[][]  // Комбинации для исключения при регенерации
}
```

**Заголовки:**
```typescript
{
  'X-Init-Data': string,   // Telegram WebApp initData
  'Content-Type': 'application/json'
}
```

**Ответ (success):**
```typescript
{
  success: true,
  capsules: GeneratedCapsule[]
}

interface GeneratedCapsule {
  id: string,              // Временный ID
  name: string,            // Название от AI (максимум 3 слова)
  description: string,     // Описание образа
  reasoning: string,       // Обоснование выбора комбинации
  recommendations: string, // Рекомендации по улучшению
  itemIds: number[],       // ID вещей для создания капсулы
  items: WardrobeItem[],   // Полные данные вещей
  isUnique: boolean        // Флаг уникальности (>80% отличия)
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `400` - Недостаточно вещей в гардеробе (минимум 3)
- `401` - Невалидная аутентификация Telegram
- `429` - Превышен дневной лимит генераций
- `502` - Не удалось подключиться к сервису генерации
- `504` - Таймаут генерации (60 секунд)
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/capsules/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Init-Data': window.Telegram.WebApp.initData
  },
  body: JSON.stringify({
    excludeCombinations: [[1, 2, 3], [4, 5, 6]] // Исключить эти комбинации
  })
});

const result = await response.json();
console.log(`Сгенерировано ${result.capsules.length} капсул`);

result.capsules.forEach(capsule => {
  console.log(`${capsule.name}: ${capsule.itemIds.length} вещей`);
  console.log(`Уникальная: ${capsule.isUnique}`);
  console.log(`Обоснование: ${capsule.reasoning}`);
});
```

**Обработка на сервере:**
1. Валидация Telegram initData
2. Загрузка всех вещей гардероба (9 полей)
3. Проверка минимального количества вещей (3)
4. Загрузка существующих капсул для проверки уникальности
5. Вычисление статистики использования вещей
6. Приоритизация редко используемых вещей
7. Определение текущего сезона и месяца
8. Отправка запроса в FastVLM с таймаутом 60 секунд
9. Проверка уникальности сгенерированных капсул (порог 80%)
10. Обогащение данными вещей с правильными imageUrl
11. Возврат массива сгенерированных капсул

**Интеграция с FastVLM:**
- **Endpoint:** `POST http://127.0.0.1:3001/generate-capsules-mock`
- **Таймаут:** 60 секунд
- **Payload:** wardrobeItems, currentSeason, existingCapsules, excludeCombinations

### GET /api/capsules/public

Получает публичные капсулы других пользователей с пагинацией.

**Параметры запроса (query):**
```typescript
{
  page?: number,    // Номер страницы (по умолчанию 1)
  limit?: number    // Количество на страницу (по умолчанию 20)
}
```

**Заголовки:**
```typescript
{
  'X-Init-Data'?: string  // Telegram WebApp initData (опционально для проверки лайков)
}
```

**Ответ (success):**
```typescript
{
  success: true,
  capsules: PublicCapsule[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number,
    hasMore: boolean
  }
}

interface PublicCapsule {
  id: number,
  name: string,
  description?: string,
  thumbnailUrl: string,
  canvasData: any,
  metadata?: any,
  analysis?: string,
  createdAt: string,
  likesCount: number,
  isLiked: boolean,        // Только если авторизован
  itemCount: number,
  items: WardrobeItem[],
  author: {
    firstName: string,
    lastName?: string,
    username?: string
  }
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string
}
```

**Коды ошибок:**
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
// Без авторизации
const response = await fetch('/api/capsules/public?page=1&limit=20');

// С авторизацией для проверки лайков
const response = await fetch('/api/capsules/public?page=1&limit=20', {
  headers: {
    'X-Init-Data': window.Telegram.WebApp.initData
  }
});

const result = await response.json();
console.log(`Загружено ${result.capsules.length} публичных капсул`);

result.capsules.forEach(capsule => {
  console.log(`${capsule.name} от ${capsule.author.firstName}`);
  console.log(`Лайков: ${capsule.likesCount}, Лайкнута мной: ${capsule.isLiked}`);
});
```

**Обработка на сервере:**
1. Опциональная валидация initData (middleware `optionalTelegramAuth`)
2. Исключение собственных капсул текущего пользователя
3. Загрузка капсул с сортировкой по популярности и новизне
4. Загрузка данных авторов (firstName, lastName, username)
5. Проверка лайков текущего пользователя (если авторизован)
6. Формирование URL изображений
7. Возврат массива с пагинацией

**Логика сортировки:**
```javascript
orderBy: [
  { likesCount: 'desc' },  // Сначала по популярности
  { createdAt: 'desc' }     // Потом по новизне
]
```## Пр
имеры создания и редактирования капсул с flow управлением

### Полный flow создания новой капсулы

```typescript
import { capsulesManager } from './modules/capsules/CapsulesManager';
import { capsuleFlowManager } from './modules/capsules/CapsuleFlowManager';

// 1. Открытие грида капсул
await capsulesManager.handleCapsulesOpen();

// 2. Клик "Добавить капсулу" - ДЕЛЕГИРОВАНИЕ в CapsuleFlowManager
await capsulesManager.handleAddCapsuleClick();
// → capsuleFlowManager.startNewCapsule()
// → capsuleFlowManager.moveToSelection()

// 3. Выбор вещей - ДЕЛЕГИРОВАНИЕ в CapsuleSelectionManager
// → capsulesManager.showSelectionModal()
// → capsuleSelectionManager.show()
const selectedItems = await capsuleSelectionManager.show();

// 4. Переход на canvas - ДЕЛЕГИРОВАНИЕ в UICanvasEditor (Singleton)
// → capsuleFlowManager.moveToCanvas()
// → capsulesManager.showCanvas()
// → canvasEditor.loadItems(items)

// 5. Редактирование на canvas
// Пользователь перемещает, масштабирует, добавляет/удаляет вещи

// 6. Обработка результата - ДЕЛЕГИРОВАНИЕ в ImageProcessingService
// → capsulesManager.handleCanvasNext()
// → modalService.executeWithLoading()
// → canvasStateManager.saveState() + imageProcessingService.addWatermark()

// 7. НОВАЯ ЛОГИКА: Сохранение при "Далее"
// → capsulesManager.saveCapsuleFromCanvas()
// → capsulesService.createCapsule()

// 8. Показ результата
// → capsuleFlowManager.moveToResult()
// → capsulesManager.showResultScreen()

// 9. Завершение flow
// → capsulesManager.handleResultClose()
// → capsuleFlowManager.complete()
```

### Полный flow редактирования существующей капсулы

```typescript
// 1. Клик по карточке капсулы
await capsulesManager.handleViewCapsule(capsuleId);
// → Показ результата с кнопкой "Редактировать"

// 2. Клик "Редактировать" - Принудительная очистка
await capsulesManager.handleEditCapsuleWithCleanup(capsuleId);
// → capsulesManager.cleanupCanvas() // НОВЫЙ МЕТОД
// → capsuleFlowManager.editCapsule(capsuleId)
// → capsuleFlowManager.moveToCanvas()

// 3. Восстановление состояния - КЭШИРОВАНИЕ
// → canvasStateManager.getCachedState() или capsulesService.loadCapsule()
// → canvasEditor.restoreState(canvasData)

// 4. Редактирование на canvas
// Пользователь изменяет позиции, добавляет/удаляет вещи

// 5. Сохранение изменений - аналогично созданию
// → capsulesManager.handleCanvasNext()
// → capsulesManager.saveCapsuleFromCanvas()
// → capsulesService.updateCapsule() // ВАЖНО: НЕ отправляем itemIds

// 6. Показ результата и завершение
// → capsuleFlowManager.moveToResult()
// → capsuleFlowManager.complete()
```

### Использование CapsuleFlowManager

```typescript
import { capsuleFlowManager } from './modules/capsules/CapsuleFlowManager';

// Настройка callbacks
capsuleFlowManager.setCallbacks({
  onMoveToSelection: () => {
    console.log('Переход на выбор вещей');
    showSelectionModal();
  },
  onMoveToCanvas: () => {
    console.log('Переход на canvas');
    showCanvasEditor();
  },
  onMoveToResult: () => {
    console.log('Переход на результат');
    showResultScreen();
  },
  onGoBack: async () => {
    console.log('Сохранение состояния перед возвратом');
    await saveCanvasState();
  },
  onComplete: () => {
    console.log('Flow завершен');
    returnToGrid();
  },
  onCancel: () => {
    console.log('Flow отменен');
    returnToGrid();
  }
});

// Создание новой капсулы
await capsuleFlowManager.startNewCapsule();

// Редактирование существующей
await capsuleFlowManager.editCapsule(123);

// Управление состоянием
capsuleFlowManager.setSelectedItems(wardrobeItems);
capsuleFlowManager.setCanvasState(canvasState);
capsuleFlowManager.setResultImage(imageBase64);

// Получение состояния
const selectedItems = capsuleFlowManager.getSelectedItems();
const canvasState = capsuleFlowManager.getCanvasState();
const mode = capsuleFlowManager.getMode(); // 'create' | 'edit'
const step = capsuleFlowManager.getCurrentStep(); // 'selection' | 'canvas' | 'result'

// Навигация
await capsuleFlowManager.goBack(); // Возврат назад
await capsuleFlowManager.complete(); // Завершение
capsuleFlowManager.cancel(); // Отмена
```

### Использование CapsuleSelectionManager

```typescript
import { capsuleSelectionManager } from './modules/capsules/CapsuleSelectionManager';

// Настройка callbacks
capsuleSelectionManager.updateConfig({
  onConfirm: (selectedItems) => {
    console.log(`Выбрано ${selectedItems.length} вещей`);
  },
  onCancel: () => {
    console.log('Выбор отменен');
  },
  onAddItem: () => {
    console.log('Добавление новой вещи');
    handleAddNewItem();
  }
});

// Показ выбора без предвыбора
const selectedItems = await capsuleSelectionManager.show();

// Показ выбора с предвыбранными вещами (для возврата с canvas)
const currentItemIds = canvasEditor.getItemIds();
const updatedItems = await capsuleSelectionManager.show(currentItemIds);

// Программная установка выбора
capsuleSelectionManager.setSelectedItems(someWardrobeItems);

// Получение текущего выбора
const currentSelection = capsuleSelectionManager.getSelectedItems();

// Скрытие модального окна
capsuleSelectionManager.hide();
```

### Использование CanvasStateManager

```typescript
import { canvasStateManager } from './modules/capsules/CanvasStateManager';

// Сохранение состояния с кэшированием
const state = await canvasStateManager.saveState(canvasEditor, 'capsule-123');
console.log('Состояние сохранено:', state.itemIds.length, 'вещей');

// Проверка кэша
if (canvasStateManager.hasCachedState('capsule-123')) {
  const cachedState = canvasStateManager.getCachedState('capsule-123');
  
  // Проверка на изменения
  if (!canvasStateManager.isDirty('capsule-123')) {
    console.log('Восстановление из кэша');
    await canvasStateManager.restoreState(canvasEditor, cachedState);
  } else {
    console.log('Состояние изменено, требуется пересохранение');
  }
}

// Пометка как измененного при модификации canvas
window.addEventListener('canvas:modified', () => {
  canvasStateManager.markDirty('capsule-123');
});

// Получение thumbnail с кэшированием
const thumbnail = await canvasStateManager.getThumbnail(canvasEditor, 'capsule-123');

// Управление кэшем
canvasStateManager.invalidateOldCache(60 * 60 * 1000); // Старше 1 часа
canvasStateManager.clearCacheForKey('temp-canvas'); // Очистка временного кэша
canvasStateManager.clearCache(); // Полная очистка

// Статистика кэша
const stats = canvasStateManager.getCacheStats();
console.log(`Кэш: ${stats.statesCount} состояний, ${stats.totalSize} байт`);
```

### Использование CapsulesService

```typescript
import { capsulesService } from './modules/capsules/CapsulesService';

// Загрузка всех капсул с кэш-fallback
const capsules = await capsulesService.loadCapsules();
console.log(`Загружено ${capsules.length} капсул`);

// Загрузка конкретной капсулы
const capsule = await capsulesService.loadCapsule(123);
console.log('Canvas data:', capsule.canvasData);

// Создание новой капсулы
const newCapsule = await capsulesService.createCapsule({
  name: 'Осенний образ',
  canvasData: canvasState.canvasData,
  thumbnailImage: canvasState.thumbnailImage,
  itemIds: selectedItems.map(item => item.id),
  metadata: {
    source: 'manual',
    season: 'autumn'
  }
});

console.log('Создана капсула:', newCapsule.id);

// Обновление капсулы (БЕЗ itemIds)
const updated = await capsulesService.updateCapsule(123, {
  canvasData: newCanvasData,
  thumbnailImage: newThumbnail
  // ВАЖНО: НЕ передаем itemIds при обновлении
});

// Удаление капсулы
await capsulesService.deleteCapsule(123);

// Сортировка вещей по слоям
const sortedItems = capsulesService.sortItemsByLayer(selectedItems);
// Результат: LEGWEAR → BODYWEAR → ... → ACCESSORIES
```

### Оптимистичное создание капсул

```typescript
// НОВАЯ ЛОГИКА: Капсула сохраняется при нажатии "Далее", а не "Готово"

// 1. Пользователь нажимает "Далее" на canvas
await capsulesManager.handleCanvasNext();

// 2. Обработка изображения с loading
await modalService.executeWithLoading(async () => {
  // Получение состояния с автообрезкой
  const state = await canvasStateManager.saveState(canvasEditor, cacheKey);
  
  // Добавление watermark
  const imageWithWatermark = await imageProcessingService.addWatermark(state.thumbnailImage);
  
  // НОВАЯ ЛОГИКА: Сохранение капсулы сразу
  await capsulesManager.saveCapsuleFromCanvas(state);
  
  return imageWithWatermark;
}, { message: 'Обрабатываем образ...' });

// 3. Переход на результат (капсула уже сохранена)
capsuleFlowManager.moveToResult();

// 4. Кнопка "Закрыть" просто завершает flow
await capsulesManager.handleResultClose();
// → capsuleFlowManager.complete() (без дополнительного сохранения)
```

### Работа с событиями

```typescript
// Событийная интеграция между модулями

// WardrobeManager → CapsuleSelectionManager
window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
  detail: {
    gridId: 'capsules-modal-clothes-grid',
    items: wardrobeItems,
    mode: 'selection'
  }
}));

// WardrobeManager → CapsulesManager
window.addEventListener('wardrobe:item-selection-toggle', (event) => {
  const { item } = event.detail;
  capsuleSelectionManager.onItemToggle(item);
});

// CapsulesManager → WardrobeManager
window.dispatchEvent(new CustomEvent('wardrobe:photo-upload-requested', {
  detail: {
    source: 'capsules',
    onItemAdded: (newItem) => console.log('Новая вещь добавлена:', newItem.id)
  }
}));

// UICanvasEditor → CapsulesManager
window.addEventListener('canvas:modified', () => {
  canvasStateManager.markDirty(cacheKey);
});

// Уведомления о сохранении
window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
  detail: { item: newWardrobeItem }
}));
```

### Обработка ошибок

```typescript
import { CapsuleErrorHandler } from './modules/capsules/CapsuleErrorHandler';

// Централизованная обработка ошибок с fallback
await CapsuleErrorHandler.handleWithFallback(
  async () => {
    // Основная логика
    const result = await capsulesService.createCapsule(data);
    return result;
  },
  () => {
    // Fallback логика
    console.log('Fallback: возвращаемся к гриду');
    capsulesGrid.show();
  },
  CapsuleErrorHandler.createContext('Создание капсулы', { 
    additionalData: { itemCount: data.itemIds?.length } 
  })
);
```

## Типы данных

### Capsule

```typescript
interface Capsule {
  id: number;
  name: string;
  description?: string;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  canvasData?: any;
  createdAt: string;
  updatedAt?: string;
  metadata?: any;
  likesCount?: number;
  isLiked?: boolean;
  itemCount?: number;
  items?: WardrobeItem[];
}
```

### CreateCapsuleDto

```typescript
interface CreateCapsuleDto {
  name: string;
  description?: string;
  canvasData: any;              // Обязательно
  thumbnailImage?: string;      // Base64 thumbnail
  itemIds?: number[];           // ID вещей в капсуле
  metadata?: {
    source?: 'manual' | 'ai_generated';
    recommendations?: string;
    reasoning?: string;
    season?: string;
    description?: string;
  };
}
```

### UpdateCapsuleDto

```typescript
interface UpdateCapsuleDto {
  name?: string;
  description?: string;
  canvasData?: any;
  thumbnailImage?: string;      // Base64 thumbnail
  itemIds?: number[];           // ВАЖНО: НЕ отправлять при обычном обновлении
  metadata?: any;
}
```

### CanvasState

```typescript
interface CanvasState {
  canvasData: any;              // Данные canvas (объекты, позиции)
  thumbnailImage: string;       // base64 thumbnail с удаленным фоном
  itemIds: number[];            // ID вещей на canvas
  timestamp: number;            // Timestamp для инвалидации кэша
  isDirty: boolean;             // Флаг изменений
}
```

### GeneratedCapsule

```typescript
interface GeneratedCapsule {
  id: string;                   // Временный ID
  name: string;                 // Название от AI (максимум 3 слова)
  description: string;          // Описание образа
  reasoning: string;            // Обоснование выбора комбинации
  recommendations: string;      // Рекомендации по улучшению
  itemIds: number[];            // ID вещей для создания капсулы
  items: WardrobeItem[];        // Полные данные вещей
  isUnique: boolean;            // Флаг уникальности (>80% отличия)
}
```

### CapsuleFlowState

```typescript
interface CapsuleFlowState {
  mode: 'create' | 'edit';                    // Режим работы
  currentStep: 'selection' | 'canvas' | 'result'; // Текущий этап
  capsuleId: number | null;                   // ID капсулы (для редактирования)
  selectedItems: WardrobeItem[];              // Выбранные вещи
  canvasState: CanvasState | null;            // Состояние canvas
  resultImage: string | null;                 // Результат (изображение с watermark)
  metadata?: CapsuleMetadata;                 // Metadata (для AI-generated)
}
```

### CapsuleFlowCallbacks

```typescript
interface CapsuleFlowCallbacks {
  onMoveToSelection?: () => void;             // Переход на выбор вещей
  onMoveToCanvas?: () => void;                // Переход на canvas
  onMoveToResult?: () => void;                // Переход на результат
  onGoBack?: () => Promise<void>;             // Возврат назад (сохранение состояния)
  onComplete?: () => void;                    // Завершение flow
  onCancel?: () => void;                      // Отмена flow
}
```

## Оптимизации и best practices

### Dependency Injection Pattern

Модуль использует внедрение зависимостей для разделения ответственности:

```typescript
export class CapsulesManager {
  // ВНЕДРЕНИЕ ЗАВИСИМОСТЕЙ
  private flowManager: CapsuleFlowManager;           // Управление flow
  private selectionManager: CapsuleSelectionManager; // Выбор вещей
  private stateManager: CanvasStateManager;          // Состояние canvas
  private imageService: typeof imageProcessingService; // Обработка изображений
  private modalSvc: ModalService;                    // Модальные окна

  constructor() {
    // Внедрение через singleton экземпляры
    this.flowManager = capsuleFlowManager;
    this.selectionManager = capsuleSelectionManager;
    this.stateManager = canvasStateManager;
    this.imageService = imageProcessingService;
    this.modalSvc = modalService;
  }
}
```

### Singleton Pattern для UICanvasEditor

Предотвращает создание нескольких экземпляров canvas:

```typescript
// Получение единственного экземпляра
this.canvasEditor = UICanvasEditor.getInstance({
  containerId: 'capsules-canvas-container',
  canvasId: 'capsules-canvas',
  onAddItem: () => this.handleCanvasAddItem(),
  onNext: () => this.handleCanvasNext()
});

// При повторном вызове - обновление callbacks
const sameEditor = UICanvasEditor.getInstance({
  onNext: () => this.newHandleCanvasNext() // Обновленный callback
});
// sameEditor === this.canvasEditor (true)
```

### Трехуровневое кэширование состояний

1. **Память (CanvasStateManager)** - Мгновенный доступ
2. **DataCacheManager** - Кэш капсул
3. **Сервер** - Источник истины

```typescript
// Проверка кэша перед загрузкой
const cacheKey = capsuleId ? `capsule-${capsuleId}` : `temp-canvas`;
let cachedState = this.stateManager.getCachedState(cacheKey);

if (cachedState && this.itemsMatch(cachedState.itemIds, selectedItems.map(i => i.id))) {
  // Восстановление из кэша
  await this.stateManager.restoreState(this.canvasEditor!, cachedState);
} else {
  // Загрузка элементов заново
  await this.canvasEditor!.loadItems(items);
  await this.stateManager.saveState(this.canvasEditor!, cacheKey);
}
```

### Оптимистичное сохранение

НОВАЯ ЛОГИКА: Капсула сохраняется при нажатии "Далее", а не "Готово":

```typescript
// При переходе на результат - сохраняем капсулу
private async handleCanvasNext(): Promise<void> {
  // Обработка изображения
  const state = await this.stateManager.saveState(this.canvasEditor!, cacheKey);
  
  // НОВАЯ ЛОГИКА: Сохраняем капсулу сразу
  await this.saveCapsuleFromCanvas(state);
  
  // Переходим к результату
  this.flowManager.moveToResult();
}
```

### Инкрементальные операции на canvas

Избегает полной перезагрузки при добавлении/удалении вещей:

```typescript
// Добавляем только новые вещи
const newItems = selectedItems.filter(item => !previousIdsSet.has(item.id));
if (newItems.length > 0) {
  await this.canvasEditor!.addItems(canvasItems);
}

// Удаляем только снятые с выбора
const itemsToRemove = currentItemIds.filter(id => !selectedIdsSet.has(id));
if (itemsToRemove.length > 0) {
  await this.canvasEditor!.removeItems(itemsToRemove);
}
```

### Автоматическая обрезка изображений

Экономия трафика через обрезку по содержимому на клиенте:

```typescript
// Получаем состояние с автоматической обрезкой
const state = await canvasEditor.getState(false); // includeWatermark = false

// cropToContent() вызывается автоматически внутри getState()
// Обрезает canvas по границам объектов
```

### Событийная архитектура

Слабая связанность модулей через события:

```typescript
// Запрос рендеринга грида (CapsulesManager → WardrobeManager)
window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
  detail: { gridId, items, mode: 'selection' }
}));

// Переключение выделения (WardrobeManager → CapsuleSelectionManager)
window.dispatchEvent(new CustomEvent('wardrobe:item-selection-toggle', {
  detail: { item }
}));

// Уведомление об изменении canvas (UICanvasEditor → CapsulesManager)
window.dispatchEvent(new CustomEvent('canvas:modified'));
```

## Troubleshooting

### Проблема: Canvas не инициализируется

**Причина:** Попытка инициализации до показа контейнера.

**Решение:**
```typescript
// Сначала показываем контейнер
canvasEditor.show();
// Затем инициализируем
canvasEditor.initializeCanvas();
```

### Проблема: Состояние canvas не сохраняется

**Причина:** Отсутствие флага dirty или неправильный ключ кэша.

**Решение:**
```typescript
// Проверяем флаг dirty
if (canvasStateManager.isDirty(cacheKey)) {
  await canvasStateManager.saveState(canvasEditor, cacheKey);
}

// Помечаем как измененное при модификации
window.addEventListener('canvas:modified', () => {
  canvasStateManager.markDirty(cacheKey);
});
```

### Проблема: Дублирование canvas экземпляров

**Причина:** Создание нескольких экземпляров UICanvasEditor.

**Решение:**
```typescript
// Принудительная очистка перед получением экземпляра
capsulesManager.cleanupCanvas();

// Получение Singleton экземпляра
const canvasEditor = UICanvasEditor.getInstance(config);
```

### Проблема: itemIds отправляются при обновлении

**Причина:** Неправильное использование API обновления.

**Решение:**
```typescript
// ПРАВИЛЬНО: НЕ отправляем itemIds при обновлении canvas
const updated = await capsulesService.updateCapsule(capsuleId, {
  canvasData: state.canvasData,
  thumbnailImage: state.thumbnailImage
  // itemIds: state.itemIds // УБРАНО
});

// itemIds отправляем только при создании новой капсулы
const created = await capsulesService.createCapsule({
  name: capsuleName,
  canvasData: state.canvasData,
  thumbnailImage: state.thumbnailImage,
  itemIds: state.itemIds // МОЖНО при создании
});
```