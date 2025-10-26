# Design Document

## Overview

Рефакторинг модуля капсул направлен на упрощение архитектуры, устранение дублирования кода и улучшение поддерживаемости. Решение основано на принципах SOLID, разделении ответственности и использовании композиции вместо наследования.

## Architecture

### Текущая архитектура (проблемы)

```
CapsulesManager (1272 строки)
├── Управление UI (grid, canvas, result)
├── Бизнес-логика (создание, редактирование)
├── Обработка событий
├── Работа с изображениями
├── Навигация
└── Интеграция с WardrobeManager

UIModalManager (800+ строк)
├── Item modal
├── Canvas loading modal (дубль)
├── Wardrobe loading modal
└── Capsule preview

UICanvasEditor (1090 строк)
├── Инициализация Fabric.js
├── Загрузка элементов
├── Позиционирование
├── Сериализация
└── Обработка изображений
```

**Проблемы:**
- Слишком большие классы с множественной ответственностью
- Дублирование логики между модулями
- Прямые зависимости между менеджерами
- Повторная инициализация canvas
- Дублирование методов модальных окон

### Новая архитектура (решение)

```
CapsulesManager (упрощен до ~600 строк)
├── Координация flow
├── Делегирование UI компонентам
└── Обработка событий высокого уровня

Новые специализированные модули:
├── CapsuleFlowManager (управление flow создания/редактирования)
├── CapsuleSelectionManager (выбор вещей из гардероба)
├── CanvasStateManager (управление состоянием canvas)
├── ImageProcessingService (обработка изображений)
└── ModalService (унифицированная работа с модальными окнами)

Улучшенные существующие модули:
├── UICanvasEditor (оптимизирован, переиспользуется)
├── UIModalManager (упрощен, без дублей)
└── CapsulesService (расширен middleware)
```

## Components and Interfaces

### 1. CapsuleFlowManager

**Ответственность:** Управление flow создания и редактирования капсул

```typescript
interface CapsuleFlowManager {
  // Создание новой капсулы
  startNewCapsule(): Promise<void>;
  
  // Редактирование существующей
  editCapsule(capsuleId: number): Promise<void>;
  
  // Переходы между этапами
  moveToSelection(): void;
  moveToCanvas(): void;
  moveToResult(): void;
  
  // Возврат назад
  goBack(): void;
  
  // Завершение
  complete(): Promise<void>;
  cancel(): void;
}

interface CapsuleFlowState {
  mode: 'create' | 'edit';
  currentStep: 'selection' | 'canvas' | 'result';
  capsuleId: number | null;
  selectedItems: WardrobeItem[];
  canvasState: CanvasState | null;
  resultImage: string | null;
}
```

**Преимущества:**
- Единый flow для создания и редактирования
- Четкие переходы между этапами
- Централизованное управление состоянием

### 2. CapsuleSelectionManager

**Ответственность:** Управление выбором вещей из гардероба

```typescript
interface CapsuleSelectionManager {
  // Показать модальное окно выбора
  show(preselectedIds?: number[]): Promise<WardrobeItem[]>;
  
  // Скрыть модальное окно
  hide(): void;
  
  // Получить выбранные вещи
  getSelectedItems(): WardrobeItem[];
  
  // Обработчики
  onItemToggle(item: WardrobeItem): void;
  onConfirm(): void;
  onCancel(): void;
}
```

**Преимущества:**
- Переиспользуется для создания и редактирования
- Инкапсулирует логику выбора
- Не зависит от WardrobeManager напрямую

### 3. CanvasStateManager

**Ответственность:** Управление состоянием canvas (кэширование, оптимизация)

```typescript
interface CanvasStateManager {
  // Сохранить состояние
  saveState(canvasEditor: UICanvasEditor): Promise<CanvasState>;
  
  // Восстановить состояние
  restoreState(canvasEditor: UICanvasEditor, state: CanvasState): Promise<void>;
  
  // Получить thumbnail (с кэшированием)
  getThumbnail(canvasEditor: UICanvasEditor, useCache?: boolean): Promise<string>;
  
  // Очистить кэш
  clearCache(): void;
}

interface CanvasState {
  canvasData: any;
  thumbnailImage: string;
  itemIds: number[];
  timestamp: number;
}
```

**Преимущества:**
- Кэширование thumbnail для предпросмотра
- Инкрементальные обновления
- Оптимизация повторных операций

### 4. ImageProcessingService

**Ответственность:** Унифицированная обработка изображений

```typescript
interface ImageProcessingService {
  // Удалить фон
  removeBackground(imageBase64: string): Promise<string>;
  
  // Оптимизировать размер
  optimizeImage(imageBase64: string, maxSize: number): Promise<string>;
  
  // Добавить watermark
  addWatermark(imageBase64: string): Promise<string>;
  
  // Полная обработка (все в одном)
  processForSave(imageBase64: string): Promise<ProcessedImage>;
  
  // Полная обработка для sharing
  processForShare(imageBase64: string): Promise<ProcessedImage>;
}

interface ProcessedImage {
  original: string;
  processed: string;
  thumbnail: string;
  metadata: ImageMetadata;
}
```

**Преимущества:**
- Единая точка для всех операций с изображениями
- Переиспользование между модулями
- Кэширование результатов

### 5. ModalService

**Ответственность:** Унифицированная работа с модальными окнами

```typescript
interface ModalService {
  // Показать модальное окно с loading
  showLoading(config: LoadingConfig): void;
  hideLoading(): void;
  
  // Выполнить операцию с loading
  executeWithLoading<T>(
    operation: () => Promise<T>,
    config: LoadingConfig
  ): Promise<T>;
  
  // Показать модальное окно с контентом
  showModal(config: ModalConfig): void;
  hideModal(modalId: string): void;
  
  // Показать alert/confirm
  showAlert(message: string): Promise<void>;
  showConfirm(message: string): Promise<boolean>;
}

interface LoadingConfig {
  message: string;
  cancellable?: boolean;
  onCancel?: () => void;
}

interface ModalConfig {
  id: string;
  content: HTMLElement | string;
  onClose?: () => void;
  closeOnOverlay?: boolean;
}
```

**Преимущества:**
- Единый API для всех модальных окон
- Устранение дублирования (canvas/wardrobe loading)
- Упрощение UIModalManager

### 6. Улучшенный UICanvasEditor

**Изменения:**
- Убрать повторную инициализацию (singleton pattern)
- Оптимизировать loadItems (инкрементальные обновления)
- Вынести обработку изображений в ImageProcessingService
- Упростить API (меньше методов)

```typescript
class UICanvasEditor {
  private static instance: UICanvasEditor | null = null;
  
  // Singleton
  static getInstance(config: CanvasEditorConfig): UICanvasEditor {
    if (!UICanvasEditor.instance) {
      UICanvasEditor.instance = new UICanvasEditor(config);
    }
    return UICanvasEditor.instance;
  }
  
  // Упрощенный API
  show(): void;
  hide(): void;
  loadItems(items: CanvasItem[]): Promise<void>;
  addItems(items: CanvasItem[]): Promise<void>;  // Инкрементальное добавление
  removeItems(itemIds: number[]): Promise<void>; // Инкрементальное удаление
  clear(): void;
  
  // Состояние (делегируется CanvasStateManager)
  getState(): CanvasState;
  restoreState(state: CanvasState): Promise<void>;
}
```

### 7. Упрощенный UIModalManager

**Изменения:**
- Убрать дублирующиеся методы (canvas/wardrobe loading)
- Делегировать ModalService
- Оставить только специфичную логику (item modal)

```typescript
class UIModalManager {
  // Делегирование ModalService
  private modalService: ModalService;
  
  // Специфичные методы (item modal)
  showItemModal(config: ItemModalConfig): void;
  
  // Остальное через ModalService
  showLoading(config: LoadingConfig): void {
    this.modalService.showLoading(config);
  }
  
  executeWithLoading<T>(operation: () => Promise<T>, config: LoadingConfig): Promise<T> {
    return this.modalService.executeWithLoading(operation, config);
  }
}
```

## Data Models

### CapsuleFlowState

```typescript
interface CapsuleFlowState {
  // Режим работы
  mode: 'create' | 'edit';
  
  // Текущий этап
  currentStep: 'selection' | 'canvas' | 'result';
  
  // ID капсулы (для редактирования)
  capsuleId: number | null;
  
  // Выбранные вещи
  selectedItems: WardrobeItem[];
  
  // Состояние canvas
  canvasState: CanvasState | null;
  
  // Результат (изображение с watermark)
  resultImage: string | null;
  
  // Metadata (для AI-generated)
  metadata?: CapsuleMetadata;
}
```

### CanvasState (расширенный)

```typescript
interface CanvasState {
  // Данные canvas (объекты, позиции)
  canvasData: any;
  
  // Thumbnail (кэшируется)
  thumbnailImage: string;
  
  // ID вещей на canvas
  itemIds: number[];
  
  // Timestamp для кэша
  timestamp: number;
  
  // Флаг изменений
  isDirty: boolean;
}
```

### ProcessedImage

```typescript
interface ProcessedImage {
  // Оригинальное изображение
  original: string;
  
  // Обработанное (без фона, оптимизированное)
  processed: string;
  
  // Thumbnail для предпросмотра
  thumbnail: string;
  
  // Metadata
  metadata: ImageMetadata;
}

interface ImageMetadata {
  originalSize: number;
  processedSize: number;
  thumbnailSize: number;
  format: 'png' | 'jpeg';
  hasAlpha: boolean;
  dimensions: { width: number; height: number };
}
```

## Error Handling

### Единый механизм обработки ошибок

```typescript
class CapsuleErrorHandler {
  // Обработать ошибку с fallback
  static async handleWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    errorMessage: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.error(errorMessage, { error });
      return fallback();
    }
  }
  
  // Показать ошибку пользователю
  static showUserError(error: Error, context: string): void {
    const userMessage = this.getUserFriendlyMessage(error, context);
    modalService.showAlert(userMessage);
  }
  
  // Получить понятное сообщение
  private static getUserFriendlyMessage(error: Error, context: string): string {
    // Маппинг технических ошибок на понятные сообщения
    const errorMap: Record<string, string> = {
      'Canvas not initialized': 'Редактор не готов. Попробуйте еще раз',
      'Failed to load image': 'Не удалось загрузить изображение',
      'Background removal failed': 'Не удалось удалить фон',
      // ...
    };
    
    return errorMap[error.message] || `Ошибка: ${context}`;
  }
}
```

### Использование

```typescript
// В CapsulesManager
async handleCanvasNext(): Promise<void> {
  await CapsuleErrorHandler.handleWithFallback(
    async () => {
      const state = await canvasStateManager.saveState(this.canvasEditor);
      this.flowManager.moveToResult(state);
    },
    () => {
      // Fallback: остаемся на canvas
      logger.warn('Failed to process canvas, staying on canvas screen');
    },
    'Не удалось обработать образ'
  );
}
```

## Testing Strategy

### Unit Tests

**Что тестировать:**
1. CapsuleFlowManager - переходы между этапами
2. CapsuleSelectionManager - выбор вещей
3. CanvasStateManager - кэширование, сериализация
4. ImageProcessingService - обработка изображений
5. ModalService - показ/скрытие модальных окон

**Пример теста:**

```typescript
describe('CapsuleFlowManager', () => {
  it('should transition from selection to canvas', async () => {
    const flowManager = new CapsuleFlowManager();
    
    await flowManager.startNewCapsule();
    expect(flowManager.getState().currentStep).toBe('selection');
    
    flowManager.moveToCanvas();
    expect(flowManager.getState().currentStep).toBe('canvas');
  });
  
  it('should preserve selected items when going back', async () => {
    const flowManager = new CapsuleFlowManager();
    const items = [mockWardrobeItem1, mockWardrobeItem2];
    
    await flowManager.startNewCapsule();
    flowManager.setSelectedItems(items);
    flowManager.moveToCanvas();
    flowManager.goBack();
    
    expect(flowManager.getState().selectedItems).toEqual(items);
  });
});
```

### Integration Tests

**Что тестировать:**
1. Полный flow создания капсулы
2. Полный flow редактирования капсулы
3. Интеграция с WardrobeManager
4. Сохранение и загрузка состояния canvas
5. Обработка ошибок API

### Manual Testing Checklist

- [ ] Создание новой капсулы (выбор вещей → canvas → результат → сохранение)
- [ ] Редактирование существующей капсулы
- [ ] Добавление вещей на canvas из модального окна
- [ ] Удаление вещей с canvas
- [ ] Возврат назад на каждом этапе
- [ ] Обработка ошибок (сеть, API, изображения)
- [ ] Производительность (загрузка, рендеринг, сохранение)
- [ ] Утечки памяти (повторное создание/редактирование)

## Migration Plan

### Этап 1: Создание новых модулей (без breaking changes)

1. Создать CapsuleFlowManager
2. Создать CapsuleSelectionManager
3. Создать CanvasStateManager
4. Создать ImageProcessingService
5. Создать ModalService

### Этап 2: Рефакторинг существующих модулей

1. Упростить CapsulesManager (делегировать новым модулям)
2. Оптимизировать UICanvasEditor (singleton, инкрементальные обновления)
3. Упростить UIModalManager (делегировать ModalService)

### Этап 3: Удаление дублирования

1. Удалить дублирующиеся методы из UIModalManager
2. Удалить дублирующуюся логику выбора вещей
3. Удалить дублирующуюся логику обработки изображений

### Этап 4: Оптимизация

1. Добавить кэширование в CanvasStateManager
2. Оптимизировать ImageProcessingService
3. Добавить инкрементальные обновления в UICanvasEditor

### Этап 5: Тестирование

1. Написать unit tests для новых модулей
2. Написать integration tests для flow
3. Провести manual testing
4. Проверить производительность и утечки памяти

## Performance Considerations

### Кэширование

- **Thumbnail изображения:** Кэшировать в CanvasStateManager для предпросмотра
- **Обработанные изображения:** Кэшировать в ImageProcessingService
- **Состояние canvas:** Кэшировать для быстрого восстановления

### Оптимизация

- **Инкрементальные обновления:** Добавлять/удалять элементы на canvas без полной перезагрузки
- **Lazy loading:** Загружать изображения по требованию
- **Debouncing:** Откладывать сохранение состояния при частых изменениях

### Метрики

- **Время создания капсулы:** < 5 секунд (включая обработку изображений)
- **Время редактирования:** < 2 секунд (без повторной обработки)
- **Использование памяти:** < 100 MB (с кэшированием)
- **Размер bundle:** Уменьшить на 20% за счет удаления дублирования

## Security Considerations

- **Валидация изображений:** Проверять формат и размер перед обработкой
- **Санитизация данных:** Очищать пользовательский ввод (названия капсул)
- **Rate limiting:** Ограничивать количество операций (генерация, сохранение)
- **Авторизация:** Проверять доступ к капсулам и вещам гардероба

## Backward Compatibility

- **API:** Сохранить существующие endpoints (добавить новые при необходимости)
- **Данные:** Поддержать старый формат canvasData
- **UI:** Сохранить существующий UX (улучшить производительность)

## Future Enhancements

- **Offline mode:** Сохранять капсулы локально при отсутствии сети
- **Collaborative editing:** Позволить нескольким пользователям редактировать капсулу
- **Version history:** Сохранять историю изменений капсулы
- **Templates:** Предустановленные шаблоны капсул
- **AI suggestions:** Предлагать улучшения для капсулы
