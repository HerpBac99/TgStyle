# Паттерны разработки для модуля Capsules

## Обзор

Модуль Capsules следует современным паттернам разработки для обеспечения масштабируемости, тестируемости и поддерживаемости кода.

## Архитектурные паттерны

### 1. Dependency Injection (Внедрение зависимостей)

**Применение**: CapsulesManager получает все зависимости через конструктор

```typescript
export class CapsulesManager {
  private flowManager: CapsuleFlowManager;
  private selectionManager: CapsuleSelectionManager;
  private stateManager: CanvasStateManager;

  constructor() {
    // Внедрение зависимостей
    this.flowManager = capsuleFlowManager;
    this.selectionManager = capsuleSelectionManager;
    this.stateManager = canvasStateManager;
  }
}
```

**Преимущества**:
- Легкое тестирование с моками
- Слабая связанность модулей
- Возможность замены реализаций

### 2. Singleton Pattern

**Применение**: UICanvasEditor, сервисы

```typescript
export class UICanvasEditor {
  private static instance: UICanvasEditor | null = null;
  
  static getInstance(config?: UICanvasEditorConfig): UICanvasEditor {
    if (!UICanvasEditor.instance) {
      UICanvasEditor.instance = new UICanvasEditor(config);
    }
    return UICanvasEditor.instance;
  }
}

// Использование
const canvasEditor = UICanvasEditor.getInstance();
```

**Когда использовать**:
- Дорогие в создании объекты (Canvas, WebGL контексты)
- Глобальное состояние (настройки, кэш)
- Сервисы без состояния

### 3. Observer Pattern (Событийная система)

**Применение**: Связь между модулями через события

```typescript
// Отправка события
window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
  detail: { item: newItem }
}));

// Подписка на событие
window.addEventListener('wardrobe:item-saved', (event) => {
  const item = event.detail.item;
  this.handleNewItemSaved(item);
});
```

**Преимущества**:
- Слабая связанность модулей
- Легкое добавление новых подписчиков
- Асинхронная обработка событий

### 4. Strategy Pattern

**Применение**: Разные стратегии обработки ошибок

```typescript
export class CapsuleErrorHandler {
  static async handleWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    context: ErrorContext
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.error('Operation failed', { error, context });
      return fallback();
    }
  }
}
```

**Применение**: Разные режимы Flow

```typescript
// Стратегия для создания
const createStrategy = {
  getInitialStep: () => 'selection',
  getNextStep: (current) => current === 'selection' ? 'canvas' : 'result'
};

// Стратегия для редактирования  
const editStrategy = {
  getInitialStep: () => 'canvas',
  getNextStep: (current) => current === 'canvas' ? 'result' : null
};
```

### 5. Command Pattern

**Применение**: Навигация через navigationManager

```typescript
// Команда для возврата назад
const backCommand = async () => {
  await this.saveCurrentState();
  this.goToPreviousStep();
};

navigationManager.push(backCommand, 'Return from canvas');
```

**Преимущества**:
- Инкапсуляция операций
- Возможность отмены (undo)
- Логирование команд

## Паттерны кодирования

### 1. Error Handling Pattern

**Всегда используй CapsuleErrorHandler**:

```typescript
// ✅ Правильно
await CapsuleErrorHandler.handleWithFallback(
  async () => {
    const result = await riskyOperation();
    return result;
  },
  () => {
    // Fallback значение
    return defaultValue;
  },
  CapsuleErrorHandler.createContext('Описание операции')
);

// ❌ Неправильно
try {
  const result = await riskyOperation();
} catch (error) {
  console.error(error); // Не информативно для пользователя
}
```

### 2. Async/Await Pattern

**Всегда используй async/await вместо Promise chains**:

```typescript
// ✅ Правильно
async function processCanvas(): Promise<string> {
  const state = await stateManager.saveState(canvas);
  const processed = await imageService.removeBackground(state.image);
  const watermarked = await imageService.addWatermark(processed);
  return watermarked;
}

// ❌ Неправильно
function processCanvas(): Promise<string> {
  return stateManager.saveState(canvas)
    .then(state => imageService.removeBackground(state.image))
    .then(processed => imageService.addWatermark(processed));
}
```

### 3. Caching Pattern

**Используй трехуровневое кэширование**:

```typescript
async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600000 // 1 час
): Promise<T> {
  // 1. Проверяем память
  let data = memoryCache.get(key);
  if (data && !isExpired(data, ttl)) {
    return data.value;
  }

  // 2. Проверяем localStorage
  data = localStorageCache.get(key);
  if (data && !isExpired(data, ttl)) {
    memoryCache.set(key, data);
    return data.value;
  }

  // 3. Загружаем с сервера
  const freshData = await fetcher();
  const cachedData = { value: freshData, timestamp: Date.now() };
  
  memoryCache.set(key, cachedData);
  localStorageCache.set(key, cachedData);
  
  return freshData;
}
```

### 4. Loading State Pattern

**Используй ModalService для loading состояний**:

```typescript
// ✅ Правильно
await modalService.executeWithLoading(
  async () => {
    const result = await longRunningOperation();
    return result;
  },
  { message: 'Обрабатываем образ...' },
  'canvas'
);

// ❌ Неправильно
showLoadingModal();
try {
  const result = await longRunningOperation();
  hideLoadingModal();
  return result;
} catch (error) {
  hideLoadingModal(); // Можем забыть скрыть при ошибке
  throw error;
}
```

### 5. State Management Pattern

**Используй immutable обновления состояния**:

```typescript
// ✅ Правильно
const updateFlowState = (updates: Partial<CapsuleFlowState>) => {
  this.state = {
    ...this.state,
    ...updates,
    timestamp: Date.now()
  };
};

// ❌ Неправильно
const updateFlowState = (updates: Partial<CapsuleFlowState>) => {
  Object.assign(this.state, updates); // Мутирует существующий объект
};
```

## Паттерны производительности

### 1. Lazy Loading Pattern

**Инициализируй компоненты только при необходимости**:

```typescript
class CapsulesManager {
  private canvasEditor: UICanvasEditor | null = null;

  private getCanvasEditor(): UICanvasEditor {
    if (!this.canvasEditor) {
      this.canvasEditor = UICanvasEditor.getInstance();
    }
    return this.canvasEditor;
  }
}
```

### 2. Debouncing Pattern

**Используй debouncing для частых операций**:

```typescript
import { debounce } from 'lodash';

class CanvasStateManager {
  private debouncedSave = debounce(
    (canvas: fabric.Canvas, key: string) => {
      this.saveState(canvas, key);
    },
    500 // Сохраняем не чаще раза в 500ms
  );

  markDirty(key: string): void {
    this.debouncedSave(this.canvas, key);
  }
}
```

### 3. Memoization Pattern

**Кэшируй результаты дорогих вычислений**:

```typescript
class ImageProcessingService {
  private processedCache = new Map<string, string>();

  async addWatermark(imageBase64: string): Promise<string> {
    const cacheKey = `watermark-${this.hashImage(imageBase64)}`;
    
    if (this.processedCache.has(cacheKey)) {
      return this.processedCache.get(cacheKey)!;
    }

    const watermarked = await this.processWatermark(imageBase64);
    this.processedCache.set(cacheKey, watermarked);
    
    return watermarked;
  }
}
```

## Паттерны тестирования

### 1. Dependency Injection для тестов

```typescript
// Тестовый mock
const mockFlowManager = {
  startNewCapsule: jest.fn(),
  moveToCanvas: jest.fn(),
  getState: jest.fn(() => ({ mode: 'create', currentStep: 'selection' }))
};

// Внедрение mock в тест
const capsulesManager = new CapsulesManager();
capsulesManager['flowManager'] = mockFlowManager;
```

### 2. Event Testing Pattern

```typescript
test('should emit event when capsule is saved', async () => {
  const eventSpy = jest.fn();
  window.addEventListener('capsule:saved', eventSpy);

  await capsulesManager.saveCapsule(capsuleData);

  expect(eventSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: { capsuleId: expect.any(Number) }
    })
  );
});
```

### 3. Async Testing Pattern

```typescript
test('should handle async operations correctly', async () => {
  const mockOperation = jest.fn().mockResolvedValue('success');
  
  const result = await CapsuleErrorHandler.handleWithFallback(
    mockOperation,
    () => 'fallback',
    { operation: 'test' }
  );

  expect(result).toBe('success');
  expect(mockOperation).toHaveBeenCalledTimes(1);
});
```

## Антипаттерны (чего избегать)

### ❌ God Object
```typescript
// Плохо: один класс делает всё
class CapsulesManager {
  // 2000+ строк кода
  // Управляет UI, состоянием, сетью, кэшем, ошибками...
}
```

### ❌ Tight Coupling
```typescript
// Плохо: прямые зависимости
class CapsulesManager {
  private wardrobeManager = new WardrobeManager(); // Жесткая связь
}
```

### ❌ Callback Hell
```typescript
// Плохо: вложенные callbacks
loadCapsule(id, (capsule) => {
  loadCanvas(capsule, (canvas) => {
    processImage(canvas, (processed) => {
      saveResult(processed, (saved) => {
        // Глубокая вложенность
      });
    });
  });
});
```

### ❌ Magic Numbers/Strings
```typescript
// Плохо: магические значения
if (step === 'canvas' && mode === 'create') { // Что означают эти строки?
  setTimeout(() => {}, 500); // Почему 500?
}

// Хорошо: именованные константы
const CANVAS_STEP = 'canvas';
const CREATE_MODE = 'create';
const DEBOUNCE_DELAY = 500;

if (step === CANVAS_STEP && mode === CREATE_MODE) {
  setTimeout(() => {}, DEBOUNCE_DELAY);
}
```

## Рекомендации по рефакторингу

### 1. Выделение сервисов
Если метод не использует `this`, выноси его в отдельный сервис:

```typescript
// Было в CapsulesManager
private optimizeImage(base64: string): string {
  // Логика оптимизации без использования this
}

// Стало в ImageProcessingService
export const imageProcessingService = {
  optimizeImage(base64: string): string {
    // Та же логика, но в отдельном сервисе
  }
};
```

### 2. Разделение ответственности
Один класс = одна ответственность:

```typescript
// Было: CapsulesManager делал всё
// Стало: каждый класс отвечает за свою область
- CapsuleFlowManager → управление переходами
- CapsuleSelectionManager → выбор вещей  
- CanvasStateManager → состояние canvas
- ImageProcessingService → обработка изображений
```

### 3. Использование TypeScript
Всегда типизируй интерфейсы:

```typescript
interface CapsuleFlowState {
  mode: 'create' | 'edit';
  currentStep: 'selection' | 'canvas' | 'result';
  selectedItems: WardrobeItem[];
  // ...
}

// Вместо any используй конкретные типы
function processCanvas(canvas: fabric.Canvas): Promise<CanvasState> {
  // ...
}
```