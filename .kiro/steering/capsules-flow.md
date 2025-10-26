# Flow управление в модуле Capsules

## Обзор Flow

Модуль Capsules использует четко определенные flow для создания и редактирования капсул. Управление осуществляется через `CapsuleFlowManager`.

## Этапы Flow

### 1. Selection (Выбор вещей)
**Назначение**: Выбор вещей из гардероба для создания капсулы
**Доступен для**: Только режим `create`

**UI компоненты**:
- Модальное окно с гридом вещей
- Фильтры по категориям
- Кнопка "Далее" (активна при выборе ≥1 вещи)

**BackButton поведение**:
- Закрывает модальное окно
- Возвращает на Grid Capsules

### 2. Canvas (Редактирование)
**Назначение**: Размещение и редактирование вещей на canvas
**Доступен для**: Режимы `create` и `edit`

**UI компоненты**:
- Canvas редактор (Fabric.js)
- Кнопки управления (добавить, удалить, далее)
- Инструменты трансформации

**BackButton поведение**:
- **Create режим**: Возврат в Selection
- **Edit режим**: Возврат на Grid Capsules

### 3. Result (Результат)
**Назначение**: Просмотр финального результата с watermark
**Доступен для**: Режимы `create` и `edit`

**UI компоненты**:
- Изображение с watermark
- Кнопки действий (сохранить, поделиться, готово)

**BackButton поведение**:
- Возврат на Canvas для редактирования

## Режимы работы

### Create Mode (Создание новой капсулы)
```
Grid Capsules → Selection → Canvas → Result → Save → Grid Capsules
```

**Последовательность**:
1. Пользователь нажимает "Создать капсулу"
2. Открывается модальное окно выбора вещей (Selection)
3. После выбора переход на Canvas
4. После редактирования переход на Result
5. Сохранение и возврат на Grid

### Edit Mode (Редактирование существующей капсулы)
```
Grid Capsules → Canvas → Result → Save → Grid Capsules
```

**Последовательность**:
1. Пользователь нажимает на существующую капсулу
2. Загрузка данных и переход на Canvas
3. После редактирования переход на Result
4. Сохранение изменений и возврат на Grid

## Управление состоянием

### CapsuleFlowState
```typescript
interface CapsuleFlowState {
  mode: 'create' | 'edit';           // Режим работы
  currentStep: 'selection' | 'canvas' | 'result'; // Текущий этап
  capsuleId: number | null;          // ID капсулы (для edit)
  selectedItems: WardrobeItem[];     // Выбранные вещи
  canvasState: CanvasState | null;   // Состояние canvas
  resultImage: string | null;        // Результат с watermark
  metadata?: CapsuleMetadata;        // Дополнительные данные
}
```

### Переходы между этапами
```typescript
// Программные переходы
flowManager.moveToSelection();  // → selection
flowManager.moveToCanvas();     // → canvas  
flowManager.moveToResult();     // → result

// Навигация назад
flowManager.goBack();           // Автоматически определяет предыдущий этап

// Завершение/отмена
flowManager.complete();         // Сохранение и выход
flowManager.cancel();           // Отмена и выход
```

## BackButton навигация

### Логика навигации
Используется единая система `navigationManager` для всех этапов:

```typescript
// Selection этап
navigationManager.push(() => {
  // Закрыть модальное окно, вернуться на Grid
}, 'Return from capsule selection');

// Canvas этап  
navigationManager.push(() => {
  // Вернуться на Selection (create) или Grid (edit)
}, 'Return from capsule canvas');

// Result этап
navigationManager.push(() => {
  // Вернуться на Canvas
}, 'Return from capsule result');
```

### Стек обработчиков
```
Grid Capsules (базовое состояние)
├── Selection: [selection_handler]
    ├── Canvas: [selection_handler, canvas_handler]  
        ├── Result: [selection_handler, canvas_handler, result_handler]
```

При нажатии BackButton:
1. Выполняется последний обработчик
2. Обработчик автоматически удаляется из стека
3. Происходит переход на предыдущий этап

## Сохранение состояния

### Автоматическое сохранение
- **Canvas состояние** сохраняется при каждом изменении
- **Выбранные вещи** сохраняются при переходах
- **Кэш изображений** обновляется при обработке

### Восстановление при возврате
```typescript
// При возврате Result → Canvas
const cachedState = stateManager.getCachedState('temp-canvas');
if (cachedState) {
  await stateManager.restoreState(canvasEditor, cachedState);
}
```

### Очистка при завершении
```typescript
// При успешном сохранении
stateManager.clearCacheForKey('temp-canvas');
canvasEditor.clear();

// При отмене
stateManager.clearCacheForKey('temp-canvas');
canvasEditor.clear();
```

## Обработка ошибок в Flow

### Graceful degradation
```typescript
await CapsuleErrorHandler.handleWithFallback(
  async () => {
    // Основная операция перехода
    await flowManager.moveToCanvas();
  },
  () => {
    // Fallback: остаемся на текущем этапе
    logger.warn('Failed to move to canvas, staying on selection');
  },
  CapsuleErrorHandler.createContext('Переход на canvas')
);
```

### Восстановление состояния
- При ошибках сохранения - возврат на предыдущий этап
- При ошибках загрузки - использование кэша
- При критических ошибках - полная отмена flow

## Callbacks и события

### Flow callbacks
```typescript
flowManager.setCallbacks({
  onMoveToSelection: () => showSelectionModal(),
  onMoveToCanvas: () => showCanvas(),
  onMoveToResult: () => showResultScreen(),
  onGoBack: () => saveCurrentState(),
  onComplete: () => saveCapsuleAndExit(),
  onCancel: () => cleanupAndExit()
});
```

### Системные события
```typescript
// Уведомление о изменении состояния
window.dispatchEvent(new CustomEvent('capsule:flow-changed', {
  detail: { 
    step: 'canvas', 
    mode: 'create',
    itemsCount: 3 
  }
}));

// Уведомление о сохранении
window.dispatchEvent(new CustomEvent('capsule:saved', {
  detail: { capsuleId: 123 }
}));
```

## Оптимизации Flow

### Предзагрузка данных
- Гардероб загружается при открытии Selection
- Canvas инициализируется при первом использовании
- Изображения кэшируются для быстрого доступа

### Ленивая инициализация
```typescript
// Canvas создается только при необходимости
private initializeCanvasEditor(): void {
  if (!this.canvasEditor) {
    this.canvasEditor = UICanvasEditor.getInstance();
  }
}
```

### Переиспользование компонентов
- Один экземпляр UICanvasEditor для всех капсул
- Переиспользование модальных окон
- Кэширование обработанных изображений

## Отладка Flow

### Логирование переходов
```typescript
logger.info('Moving to canvas step', {
  mode: this.state.mode,
  previousStep: this.state.currentStep,
  selectedItemsCount: this.state.selectedItems.length
});
```

### Статус менеджера
```typescript
const status = flowManager.getStatus();
// {
//   mode: 'create',
//   currentStep: 'canvas', 
//   selectedItemsCount: 3,
//   hasCanvasState: true,
//   navigationStackSize: 2
// }
```

### Мониторинг производительности
- Время переходов между этапами
- Размер кэшированных данных
- Количество обращений к API