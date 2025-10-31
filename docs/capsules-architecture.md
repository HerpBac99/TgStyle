# Архитектура модуля Capsules

## Обзор

Модуль Capsules отвечает за создание и редактирование капсул (образов) - комбинаций вещей из гардероба пользователя. Это один из самых сложных модулей приложения с продвинутой архитектурой на основе Dependency Injection, Singleton паттернов и делегирования задач.

**Основные функции:**
- Создание новых капсул через выбор вещей из гардероба
- Редактирование существующих капсул на canvas
- Автоматическое позиционирование вещей по слоям одежды
- Обработка изображений с watermark и автообрезкой
- Сохранение состояния canvas с кэшированием
- Интеграция с AI для генерации капсул
- Sharing капсул через Telegram

**Архитектурные принципы:**
- **Dependency Injection** - CapsulesManager делегирует задачи специализированным модулям
- **Singleton Pattern** - UICanvasEditor использует единственный экземпляр
- **Flow Management** - CapsuleFlowManager управляет переходами между этапами
- **State Management** - CanvasStateManager управляет кэшированием состояний
- **Service Layer** - Специализированные сервисы для обработки изображений и модальных окон

## Основные компоненты

### 1. CapsulesManager (CapsulesManager.ts)

**Ответственность:** Главный координатор модуля - управляет UI, делегирует задачи специализированным модулям, интегрирует все компоненты.

**Архитектурный паттерн:** Coordinator + Dependency Injection

**Внедренные зависимости:**
```typescript
private flowManager: CapsuleFlowManager;           // Управление flow
private selectionManager: CapsuleSelectionManager; // Выбор вещей
private stateManager: CanvasStateManager;          // Состояние canvas
private imageService: typeof imageProcessingService; // Обработка изображений
private modalSvc: ModalService;                    // Модальные окна
```

**Ключевые методы:**
- `handleCapsulesOpen()` - Открывает грид капсул с инвалидацией старого кэша
- `handleAddCapsuleClick()` - ДЕЛЕГИРУЕТ создание новой капсулы в CapsuleFlowManager
- `handleViewCapsule(capsuleId)` - Показ результата капсулы с кнопкой редактирования
- `handleEditCapsuleWithCleanup(capsuleId)` - Редактирование с принудительной очисткой canvas
- `showItemSelection(preselectedIds, context)` - ЕДИНЫЙ МЕТОД выбора вещей
- `initializeCanvasEditor()` - Получает Singleton экземпляр UICanvasEditor
- `handleCanvasNext()` - ДЕЛЕГИРУЕТ обработку изображений в ImageProcessingService
- `saveCapsuleFromCanvas(state)` - НОВАЯ ЛОГИКА: сохранение при нажатии "Далее"

**Делегирование задач:**
- **Flow управление** → CapsuleFlowManager
- **Выбор вещей** → CapsuleSelectionManager  
- **Состояние canvas** → CanvasStateManager
- **Обработка изображений** → ImageProcessingService
- **Модальные окна** → ModalService
- **Canvas редактирование** → UICanvasEditor (Singleton)
**Интеграции:**
- `UICapsulesGrid` - Отображение грида капсул
- `UICanvasEditor` - Singleton canvas редактор
- `UICanvasResultScreen` - Экран результата с кнопками
- `CapsulesService` - API запросы к серверу
- `WardrobeService` - Загрузка вещей из гардероба
- `PhotoProcessor` - Классификация новых вещей
- `DataCacheManager` - Кэширование капсул
- `NavigationManager` - Управление BackButton

**Состояние:**
```typescript
private capsules: StyleCapsule[] = [];
private canvasEditor: UICanvasEditor | null = null;
private resultScreen: UICanvasResultScreen | null = null;
private currentGeneratedCapsules: GeneratedCapsule[] | null = null;
```

### 2. CapsuleFlowManager (CapsuleFlowManager.ts)

**Ответственность:** Управление переходами между этапами создания и редактирования капсул. Обеспечивает единый flow для создания новых и редактирования существующих капсул.

**Архитектурный паттерн:** State Machine + Observer

**Этапы flow:**
1. **selection** - выбор вещей из гардероба (только для создания)
2. **canvas** - редактирование на canvas
3. **result** - просмотр результата с watermark

**Режимы работы:**
- **create**: selection → canvas → result
- **edit**: canvas → result (пропускает selection)

**Ключевые методы:**
- `startNewCapsule()` - Начинает создание новой капсулы
- `editCapsule(capsuleId)` - Начинает редактирование существующей капсулы
- `moveToSelection()` - Переход на этап выбора вещей
- `moveToCanvas()` - Переход на этап canvas
- `moveToResult()` - Переход на этап результата
- `goBack()` - Возврат на предыдущий этап с сохранением состояния
- `complete()` - Завершение flow
- `cancel()` - Отмена flow

**Состояние flow:**
```typescript
interface CapsuleFlowState {
  mode: 'create' | 'edit';
  currentStep: 'selection' | 'canvas' | 'result';
  capsuleId: number | null;
  selectedItems: WardrobeItem[];
  canvasState: CanvasState | null;
  resultImage: string | null;
  metadata?: CapsuleMetadata;
}
```

**Навигация:**
- Интегрируется с `NavigationManager` для управления BackButton
- Каждый этап настраивает свой обработчик BackButton
- НОВАЯ ЛОГИКА: BackButton на результате закрывает результат (не возвращает на canvas)

**Callbacks:**
```typescript
interface CapsuleFlowCallbacks {
  onMoveToSelection?: () => void;
  onMoveToCanvas?: () => void;
  onMoveToResult?: () => void;
  onGoBack?: () => Promise<void>;
  onComplete?: () => void;
  onCancel?: () => void;
}
```

### 3. CapsuleSelectionManager (CapsuleSelectionManager.ts)

**Ответственность:** Управление модальным окном выбора вещей из гардероба. Переиспользуется для создания новых капсул и редактирования существующих.

**Архитектурный паттерн:** Modal Manager + Event-Driven

**Ключевые методы:**
- `show(preselectedIds?)` - Показывает модальное окно с предвыбранными вещами
- `hide()` - Скрывает модальное окно и очищает обработчики
- `onItemToggle(item)` - Переключение выбора вещи через события
- `setSelectedItems(items)` - Программная установка выбранных вещей
- `restoreVisualSelection()` - Восстановление выделения после перерендера
- `updateNextButtonState()` - Обновление состояния кнопки "Далее"

**Событийная интеграция:**
- Отправляет `'wardrobe:render-requested'` для рендеринга грида
- Слушает `'wardrobe:item-selection-toggle'` для переключения выбора
- Слушает `'wardrobe:item-added'` для восстановления выделения

**Конфигурация:**
```typescript
interface CapsuleSelectionConfig {
  modalId?: string;
  gridId?: string;
  filtersId?: string;
  onConfirm?: (selectedItems: WardrobeItem[]) => void;
  onCancel?: () => void;
  onAddItem?: () => void;
}
```

**Оптимизации:**
- Загружает гардероб через `WardrobeService` вместо прямого вызова WardrobeManager
- Восстанавливает визуальное выделение после добавления новой вещи
- Предотвращает дублирование обработчиков событий

### 4. CanvasStateManager (CanvasStateManager.ts)

**Ответственность:** Управление сохранением, восстановлением и кэшированием состояния canvas. Обеспечивает оптимизацию производительности через кэширование.

**Архитектурный паттерн:** Cache Manager + State Persistence

**Ключевые методы:**
- `saveState(canvasEditor, cacheKey?)` - Сохранение состояния с автообрезкой
- `restoreState(canvasEditor, state)` - Восстановление состояния canvas
- `getCachedState(cacheKey)` - Получение состояния из кэша
- `markDirty(cacheKey)` - Пометка состояния как измененного
- `isDirty(cacheKey)` - Проверка изменений состояния
- `invalidateOldCache(maxAge)` - Инвалидация старого кэша
- `getThumbnail(canvasEditor, cacheKey, useCache)` - Получение thumbnail с кэшированием

**Структура состояния:**
```typescript
interface CanvasState {
  canvasData: any;           // Данные canvas (объекты, позиции)
  thumbnailImage: string;    // base64 thumbnail с удаленным фоном
  itemIds: number[];         // ID вещей на canvas
  timestamp: number;         // Timestamp для инвалидации кэша
  isDirty: boolean;          // Флаг изменений
}
```

**Кэширование:**
- **Кэш состояний**: `Map<string, CanvasState>` для полных состояний
- **Кэш thumbnail**: `Map<string, string>` для быстрого доступа к изображениям
- **Автоинвалидация**: Удаление состояний старше 1 часа
- **Флаг dirty**: Отслеживание изменений для избежания повторной обработки

**Оптимизации:**
- Автоматическая обрезка изображений по содержимому на клиенте
- Кэширование thumbnail для быстрого доступа
- Инвалидация старого кэша при открытии модуля
- Отслеживание изменений через флаг dirty###
 5. ImageProcessingService (shared/ImageProcessingService.ts)

**Ответственность:** Унифицированная обработка изображений - удаление фона, оптимизация, добавление watermark, кэширование обработанных изображений.

**Архитектурный паттерн:** Service Layer + Cache Manager

**Ключевые методы:**
- `removeBackground(imageBase64)` - Удаление фона через API
- `optimizeImage(imageBase64, config)` - Оптимизация размера и качества
- `addWatermark(imageBase64)` - Добавление watermark
- `processForSave(imageBase64)` - Полная обработка для сохранения
- `processForShare(imageBase64, useCache)` - Полная обработка для шеринга
- `cacheImage(key, imageBase64)` - Кэширование изображения
- `getCachedImage(key)` - Получение кэшированного изображения
- `canvasToBase64(canvas, config)` - Конвертация canvas в base64

**Кэширование:**
- **Кэш обработанных изображений**: `Map<string, ProcessedImage>` (до 50 элементов)
- **Кэш отдельных изображений**: `Map<string, string>` (до 100 элементов)
- **LRU стратегия**: Удаление самых старых элементов при переполнении

**Интеграции:**
- `api.removeBackground()` - API удаления фона
- `addWatermark()` - Утилита добавления watermark
- Canvas API для оптимизации изображений

### 6. ModalService (shared/ModalService.ts)

**Ответственность:** Унифицированный сервис для работы с модальными окнами и loading индикаторами. Предоставляет единый API для всех типов модальных окон.

**Архитектурный паттерн:** Service Layer + Factory

**Ключевые методы:**
- `showLoading(config, type)` - Показ loading модального окна
- `hideLoading()` - Скрытие loading модального окна
- `executeWithLoading(operation, config, type)` - Выполнение операции с loading
- `showModal(config)` - Показ обычного модального окна
- `hideModal(modalId)` - Скрытие модального окна
- `showAlert(message)` - Показ alert диалога
- `showConfirm(message)` - Показ confirm диалога

**Типы loading модальных окон:**
- **wardrobe** - Использует существующий wardrobe loading в preview modal
- **canvas** - Использует существующий canvas loading modal
- **generic** - Создает временное модальное окно

**Состояние:**
```typescript
interface ActiveLoadingModal {
  type: LoadingModalType;
  config: LoadingConfig;
  element: HTMLElement;
}
```

**Интеграция с CapsulesManager:**
- `executeWithLoading()` используется для показа "Обрабатываем образ..." при переходе на результат
- `showLoading()` используется для PhotoUploadHandler интерфейса
- Автоматическое управление состоянием loading индикаторов

### 7. UICanvasEditor (uiCanvasEditor.ts) - SINGLETON

**Ответственность:** Унифицированный редактор canvas для капсул. Использует Fabric.js для манипуляций с изображениями одежды.

**Архитектурный паттерн:** Singleton + Factory

**SINGLETON IMPLEMENTATION:**
```typescript
export class UICanvasEditor {
  private static instance: UICanvasEditor | null = null;
  
  private constructor(config: CanvasEditorConfig) {
    this.config = config;
  }
  
  static getInstance(config: CanvasEditorConfig): UICanvasEditor {
    if (!UICanvasEditor.instance) {
      UICanvasEditor.instance = new UICanvasEditor(config);
    } else {
      UICanvasEditor.instance.updateConfig(config);
    }
    return UICanvasEditor.instance;
  }
}
```

**Преимущества Singleton:**
- **Единственный экземпляр** - Предотвращает создание нескольких canvas
- **Переиспользование ресурсов** - Fabric.js canvas остается в памяти
- **Предотвращение конфликтов** - Гарантирует работу с одним canvas
- **Обновление callbacks** - Динамическое обновление обработчиков событий

**Ключевые методы:**
- `getInstance(config)` - SINGLETON: Получение единственного экземпляра
- `initializeCanvas()` - Инициализация Fabric.js canvas
- `loadItems(items)` - УНИФИЦИРОВАННЫЙ МЕТОД загрузки элементов
- `loadGeneratedCapsule(capsule)` - Загрузка AI-generated капсулы
- `addItems(items)` - ИНКРЕМЕНТАЛЬНОЕ добавление элементов
- `removeItems(itemIds)` - ИНКРЕМЕНТАЛЬНОЕ удаление элементов
- `getState(includeWatermark)` - Получение состояния с автообрезкой
- `restoreState(savedData)` - Восстановление состояния из БД
- `cropToContent()` - Автоматическая обрезка по содержимому
- `destroy()` - Уничтожение canvas и очистка ресурсов

**Автоматическое позиционирование:**
- Сортировка по слоям одежды (LEGWEAR → BODYWEAR → ... → ACCESSORIES)
- Позиционирование по категориям с учетом размеров canvas
- Автоматический расчет масштаба на основе размеров изображения
- Предотвращение перекрытия элементов одной категории

**Fabric.js интеграция:**
- Настройка контролов (удаление, масштабирование, поворот)
- Обработка событий выделения и изменения объектов
- Автоматический подъем выделенного объекта на передний план
- Отправка событий `'canvas:modified'` для отслеживания изменений

**Оптимизации:**
- Переиспользование существующих объектов при загрузке
- Инкрементальные операции добавления/удаления
- Автоматическая обрезка изображений по содержимому
- Кэширование состояний через CanvasStateManager

## Архитектурные паттерны

### 1. Dependency Injection Pattern

**Реализация в CapsulesManager:**
```typescript
export class CapsulesManager {
  // ВНЕДРЕНИЕ ЗАВИСИМОСТЕЙ
  private flowManager: CapsuleFlowManager;
  private selectionManager: CapsuleSelectionManager;
  private stateManager: CanvasStateManager;
  private imageService: typeof imageProcessingService;
  private modalSvc: ModalService;

  constructor() {
    // Внедрение зависимостей через singleton экземпляры
    this.flowManager = capsuleFlowManager;
    this.selectionManager = capsuleSelectionManager;
    this.stateManager = canvasStateManager;
    this.imageService = imageProcessingService;
    this.modalSvc = modalService;
  }
}
```

**Преимущества:**
- **Разделение ответственности** - Каждый модуль отвечает за свою область
- **Тестируемость** - Легко заменить зависимости для тестирования
- **Расширяемость** - Легко добавить новые сервисы
- **Слабая связанность** - Модули не зависят друг от друга напрямую

### 2. Singleton Pattern

**Применение:**
- **UICanvasEditor** - Единственный экземпляр canvas редактора
- **Все сервисы** - imageProcessingService, modalService, canvasStateManager

**Реализация UICanvasEditor:**
```typescript
// Приватный конструктор
private constructor(config: CanvasEditorConfig) {
  this.config = config;
}

// Статический метод получения экземпляра
static getInstance(config: CanvasEditorConfig): UICanvasEditor {
  if (!UICanvasEditor.instance) {
    UICanvasEditor.instance = new UICanvasEditor(config);
  } else {
    // Обновляем callbacks при повторном вызове
    UICanvasEditor.instance.updateConfig(config);
  }
  return UICanvasEditor.instance;
}
```

**Особенности реализации:**
- **Ленивая инициализация** - Создается только при первом обращении
- **Обновление конфигурации** - Callbacks обновляются при повторных вызовах
- **Принудительная очистка** - `cleanupCanvas()` гарантирует правильное состояние

### 3. State Machine Pattern (CapsuleFlowManager)

**Состояния и переходы:**
```
CREATE MODE:
selection → canvas → result → complete

EDIT MODE:
canvas → result → complete

NAVIGATION:
result → canvas (goBack)
canvas → selection (goBack, только для create)
selection → cancel
```

**Управление состоянием:**
```typescript
interface CapsuleFlowState {
  mode: CapsuleFlowMode;
  currentStep: CapsuleFlowStep;
  capsuleId: number | null;
  selectedItems: WardrobeItem[];
  canvasState: CanvasState | null;
  resultImage: string | null;
}
```### 4. O
bserver Pattern (Событийная система)

**События между модулями:**
```typescript
// WardrobeManager → CapsuleSelectionManager
'wardrobe:render-requested' - Запрос рендеринга грида
'wardrobe:grid-rendered' - Уведомление о завершении рендеринга
'wardrobe:item-selection-toggle' - Переключение выбора вещи

// WardrobeManager → CapsulesManager
'wardrobe:item-saved' - Уведомление о сохранении новой вещи
'wardrobe:item-added' - Уведомление о добавлении вещи

// UICanvasEditor → CapsulesManager
'canvas:modified' - Уведомление об изменении canvas

// CapsulesManager → WardrobeManager
'wardrobe:photo-upload-requested' - Запрос загрузки фото
```

**Преимущества:**
- **Слабая связанность** - Модули не знают друг о друге напрямую
- **Расширяемость** - Легко добавить новых слушателей
- **Асинхронность** - События не блокируют выполнение

### 5. Cache-First Pattern (CanvasStateManager)

**Стратегия кэширования:**
```typescript
// 1. Проверка кэша
let cachedState = this.stateManager.getCachedState(cacheKey);

if (!cachedState || this.stateManager.isDirty(cacheKey)) {
  // 2. Генерация нового состояния
  cachedState = await this.stateManager.saveState(canvasEditor, cacheKey);
} else {
  // 3. Использование кэша
  logger.info('Using cached canvas state');
}
```

**Оптимизации:**
- **Флаг dirty** - Отслеживание изменений для избежания повторной обработки
- **Автоинвалидация** - Удаление старого кэша (> 1 часа)
- **LRU кэш** - Удаление самых старых элементов при переполнении

### 6. Factory Pattern (ModalService)

**Создание модальных окон:**
```typescript
// Фабричные методы для разных типов модальных окон
private createGenericLoadingModal(): HTMLElement
private createModalElement(config: ModalConfig): HTMLElement
private createAlertElement(id: string, message: string, onClose: () => void): HTMLElement
private createConfirmElement(id: string, message: string, onConfirm: () => void, onCancel: () => void): HTMLElement
```

## Интеграции

### 1. Интеграция с WardrobeManager

**Событийная интеграция:**
```typescript
// Запрос рендеринга грида в модальном окне
window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
  detail: {
    gridId: 'capsules-modal-clothes-grid',
    filtersId: 'capsules-modal-filters',
    items: wardrobeItems,
    mode: 'selection'
  }
}));

// Переключение выделения вещи
window.dispatchEvent(new CustomEvent('wardrobe:item-selection-toggle', {
  detail: { item }
}));
```

**Режимы работы WardrobeManager:**
- **Основной гардероб**: клик = превью, долгое нажатие = удаление
- **Модальное окно капсул**: клик = выделение, долгое нажатие = удаление

### 2. Интеграция с FastVLM (через PhotoProcessor)

**Классификация новых вещей:**
```typescript
// Обработка фото через PhotoProcessor
const result = await photoProcessor.classifyAndRemoveBackground(base64);

// Показ модального окна с результатом
uiModalManager.showItemModal({
  type: 'item-modal',
  data: {
    imageUrl: result.processedImage,
    category: result.classification.category,
    color: result.classification.color
  }
});
```

### 3. Интеграция с Server API

**Endpoints для капсул:**
- `GET /api/capsules` - Получение всех капсул пользователя
- `POST /api/capsules` - Создание новой капсулы
- `PUT /api/capsules/:id` - Обновление капсулы (НЕ отправляем itemIds)
- `DELETE /api/capsules/:id` - Удаление капсулы
- `GET /api/capsules/:id` - Получение конкретной капсулы

**Особенности обновления:**
```typescript
// При обновлении НЕ отправляем itemIds - они не должны изменяться
const updated = await capsulesService.updateCapsule(capsuleId, {
  canvasData: state.canvasData,
  thumbnailImage: state.thumbnailImage
  // itemIds: state.itemIds // УБРАНО
});
```

### 4. Интеграция с NavigationManager

**Управление BackButton:**
```typescript
// Каждый этап настраивает свой обработчик
private setupNavigationForCanvas(): void {
  navigationManager.push(async () => {
    await this.goBack();
  }, `Return from capsule canvas (${this.state.mode})`);
}

// НОВАЯ ЛОГИКА: BackButton на результате закрывает результат
private setupNavigationForResult(): void {
  navigationManager.push(async () => {
    await this.complete(); // Закрываем результат
  }, 'Close capsule result');
}
```

## Производительность и оптимизация

### 1. Кэширование состояний canvas

**Проблема:** Медленная загрузка canvas при переходах между этапами.

**Решение:**
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

**Результат:** Мгновенное восстановление состояния canvas при возврате с результата.

### 2. Инкрементальные операции на canvas

**Проблема:** Полная перезагрузка canvas при добавлении/удалении вещей.

**Решение:**
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

**Результат:** Быстрое добавление/удаление вещей без полной перезагрузки canvas.

### 3. Автоматическая обрезка изображений

**Проблема:** Большие изображения с пустыми областями.

**Решение:**
```typescript
// Автоматическая обрезка по содержимому на клиенте
private cropCanvasToContent(padding: number = 25): HTMLCanvasElement | null {
  // Находим границы содержимого
  let minX = width, minY = height, maxX = 0, maxY = 0;
  
  // Анализируем пиксели для определения границ
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (diff > threshold) {
        // Обновляем границы
      }
    }
  }
  
  // Создаем обрезанный canvas
  return croppedCanvas;
}
```

**Результат:** Экономия трафика и улучшение качества изображений.

### 4. Оптимистичное сохранение

**НОВАЯ ЛОГИКА:** Капсула сохраняется при нажатии "Далее", а не "Готово".

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

**Преимущества:**
- Капсула сохранена до показа результата
- Кнопка "Закрыть" просто завершает flow
- Нет риска потери данных при закрытии результата

### 5. Singleton для UICanvasEditor

**Проблема:** Создание нескольких экземпляров canvas приводит к конфликтам.

**Решение:**
```typescript
// Принудительная очистка перед загрузкой новой капсулы
private cleanupCanvas(): void {
  if (this.canvasEditor) {
    this.canvasEditor.hide();
    this.canvasEditor.destroy();
    this.canvasEditor = null;
    this.stateManager.clearCache();
  }
}

// Получение Singleton экземпляра
this.canvasEditor = UICanvasEditor.getInstance({
  containerId: 'capsules-canvas-container',
  canvasId: 'capsules-canvas',
  onAddItem: () => this.handleCanvasAddItem(),
  onNext: () => this.handleCanvasNext()
});
```

**Результат:** Гарантированно правильная работа canvas без конфликтов.## 
Обработка ошибок

### 1. CapsuleErrorHandler

**Централизованная обработка ошибок:**
```typescript
await CapsuleErrorHandler.handleWithFallback(
  async () => {
    // Основная логика
  },
  () => {
    // Fallback логика
  },
  CapsuleErrorHandler.createContext('Описание операции', { additionalData })
);
```

**Стратегии:**
- **Graceful degradation** - Fallback на безопасное состояние
- **Контекстная информация** - Подробное логирование с контекстом
- **Пользовательские сообщения** - Понятные сообщения об ошибках

### 2. Откат оптимистичных операций

**Стратегия:** Возврат к предыдущему состоянию при ошибках.

```typescript
try {
  // Оптимистичное обновление
  this.capsules.unshift(optimisticCapsule);
  this.capsulesGrid.render(this.capsules);
  
  // Сохранение на сервер
  const serverCapsule = await capsulesService.createCapsule(data);
  
  // Замена оптимистичной капсулы на реальную
  this.capsules[0] = serverCapsule;
} catch (error) {
  // Откат: удаляем оптимистичную капсулу
  this.capsules.shift();
  this.capsulesGrid.render(this.capsules);
}
```

## Диаграмма архитектуры

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Capsules Module (Refactored)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐    DEPENDENCY INJECTION    ┌──────────────────┐          │
│  │ CapsulesManager  │◄──────────────────────────►│CapsuleFlowManager│          │
│  │   (Coordinator)  │                            │  (State Machine) │          │
│  │                  │                            │                  │          │
│  │  - UI Management │                            │  - Flow Control  │          │
│  │  - Delegation    │                            │  - Navigation    │          │
│  │  - Integration   │                            │  - State Mgmt    │          │
│  └────────┬─────────┘                            └──────────────────┘          │
│           │                                                                     │
│           ▼                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐│
│  │CapsuleSelection  │         │CanvasStateManager│         │ImageProcessing   ││
│  │    Manager       │         │                  │         │    Service       ││
│  │                  │         │  - Caching       │         │                  ││
│  │  - Modal Mgmt    │         │  - Persistence   │         │  - Background    ││
│  │  - Item Selection│         │  - Dirty Flags   │         │  - Watermark     ││
│  │  - Events        │         │  - Auto-crop     │         │  - Optimization  ││
│  └──────────────────┘         └──────────────────┘         └──────────────────┘│
│                                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐│
│  │   ModalService   │         │ UICanvasEditor   │         │  UICapsulesGrid  ││
│  │                  │         │   (SINGLETON)    │         │                  ││
│  │  - Loading       │         │                  │         │  - Grid Display ││
│  │  - Dialogs       │         │  - Fabric.js     │         │  - Card Creation ││
│  │  - Unified API   │         │  - Auto Position │         │  - Events        ││
│  └──────────────────┘         │  - Incremental   │         └──────────────────┘│
│                               │  - State Mgmt    │                             │
│                               └──────────────────┘                             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                       ┌────────────────────────────────────┐
                       │         External Services          │
                       ├────────────────────────────────────┤
                       │  - WardrobeManager (Events)        │
                       │  - FastVLM (Classification)        │
                       │  - Server API (CRUD)               │
                       │  - NavigationManager (BackButton)  │
                       │  - DataCacheManager (Persistence)  │
                       └────────────────────────────────────┘
```

## Примеры использования

### 1. Создание новой капсулы

```typescript
// Открытие грида капсул
await capsulesManager.handleCapsulesOpen();

// Клик "Добавить капсулу" - ДЕЛЕГИРОВАНИЕ в CapsuleFlowManager
await capsulesManager.handleAddCapsuleClick();
// → flowManager.startNewCapsule()
// → flowManager.moveToSelection()
// → capsulesManager.showSelectionModal()

// Выбор вещей - ДЕЛЕГИРОВАНИЕ в CapsuleSelectionManager
const selectedItems = await selectionManager.show();

// Переход на canvas - ДЕЛЕГИРОВАНИЕ в UICanvasEditor (Singleton)
// → flowManager.moveToCanvas()
// → capsulesManager.showCanvas()
// → canvasEditor.loadItems(items)

// Обработка результата - ДЕЛЕГИРОВАНИЕ в ImageProcessingService
// → capsulesManager.handleCanvasNext()
// → modalService.executeWithLoading()
// → stateManager.saveState() + imageService.addWatermark()
// → capsulesManager.saveCapsuleFromCanvas() // НОВАЯ ЛОГИКА

// Показ результата
// → flowManager.moveToResult()
// → capsulesManager.showResultScreen()
```

### 2. Редактирование существующей капсулы

```typescript
// Клик по карточке капсулы
await capsulesManager.handleViewCapsule(capsuleId);
// → Показ результата с кнопкой "Редактировать"

// Клик "Редактировать" - Принудительная очистка
await capsulesManager.handleEditCapsuleWithCleanup(capsuleId);
// → capsulesManager.cleanupCanvas() // НОВЫЙ МЕТОД
// → flowManager.editCapsule(capsuleId)
// → flowManager.moveToCanvas()

// Восстановление состояния - КЭШИРОВАНИЕ
// → stateManager.getCachedState() или capsulesService.loadCapsule()
// → canvasEditor.restoreState(canvasData)

// Сохранение изменений - аналогично созданию
```

### 3. Использование Singleton UICanvasEditor

```typescript
// Получение единственного экземпляра
const canvasEditor = UICanvasEditor.getInstance({
  containerId: 'capsules-canvas-container',
  canvasId: 'capsules-canvas',
  onAddItem: () => this.handleCanvasAddItem(),
  onNext: () => this.handleCanvasNext()
});

// При повторном вызове - обновление callbacks
const sameEditor = UICanvasEditor.getInstance({
  onAddItem: () => this.newHandleCanvasAddItem() // Обновленный callback
});
// sameEditor === canvasEditor (true)
```

### 4. Кэширование состояний

```typescript
// Сохранение состояния с автообрезкой
const state = await canvasStateManager.saveState(canvasEditor, 'capsule-123');

// Проверка кэша при загрузке
const cachedState = canvasStateManager.getCachedState('capsule-123');
if (cachedState && !canvasStateManager.isDirty('capsule-123')) {
  await canvasStateManager.restoreState(canvasEditor, cachedState);
} else {
  // Загрузка заново
}

// Пометка как измененного
canvasStateManager.markDirty('capsule-123');
```

## Будущие улучшения

### 1. Расширенное кэширование
- Кэширование обработанных изображений в IndexedDB
- Предзагрузка часто используемых вещей
- Кэширование AI-generated капсул

### 2. Улучшение производительности
- Виртуализация грида капсул для больших коллекций
- Lazy loading изображений в canvas
- Web Workers для обработки изображений

### 3. Расширенная функциональность
- Слои и группировка объектов на canvas
- Анимации переходов между этапами
- Поддержка undo/redo операций

### 4. AI интеграция
- Автоматические рекомендации по улучшению капсул
- Анализ стиля и предложения альтернатив
- Генерация описаний капсул

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

### Проблема: Модальные окна не закрываются

**Причина:** Накопление обработчиков событий.

**Решение:**
```typescript
// Очистка обработчиков при скрытии
selectionManager.hide(); // Автоматически очищает cleanupFunctions

// Проверка активных модальных окон
const status = modalService.getStatus();
console.log(status.activeModalsCount);
```