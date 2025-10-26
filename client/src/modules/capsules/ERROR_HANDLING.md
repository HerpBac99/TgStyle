# Обработка ошибок в модуле капсул

## Обзор

Все асинхронные операции в модуле капсул теперь обернуты в `CapsuleErrorHandler` для обеспечения:
- Единообразной обработки ошибок
- Понятных пользователю сообщений
- Детального логирования с контекстом
- Fallback механизмов для восстановления состояния

## Требования

Реализация соответствует требованиям:
- **8.1**: Единый механизм обработки ошибок
- **8.2**: Понятные сообщения об ошибках пользователю
- **8.3**: Логирование детальной информации для отладки
- **8.4**: Корректное восстановление состояния после ошибок
- **8.5**: Fallback механизмы при сбоях API

## Использование

### Базовый паттерн

```typescript
await CapsuleErrorHandler.handleWithFallback(
  async () => {
    // Основная операция
    const result = await someAsyncOperation();
    return result;
  },
  () => {
    // Fallback при ошибке
    return defaultValue;
  },
  CapsuleErrorHandler.createContext('Описание операции', {
    capsuleId: 123,
    itemIds: [1, 2, 3]
  })
);
```

### Примеры из кода

#### 1. Открытие грида капсул

```typescript
async handleCapsulesOpen(): Promise<void> {
  await CapsuleErrorHandler.handleWithFallback(
    async () => {
      this.stateManager.invalidateOldCache(60 * 60 * 1000);
      await this.loadCapsules();
      this.capsulesGrid.show();
      this.capsulesGrid.render(this.capsules);
    },
    () => {
      // Fallback: показываем грид с пустым массивом
      this.capsules = [];
      this.capsulesGrid.show();
      this.capsulesGrid.render(this.capsules);
    },
    CapsuleErrorHandler.createContext('Открытие капсул')
  );
}
```

#### 2. Сохранение капсулы

```typescript
private async handleResultDone(): Promise<void> {
  await CapsuleErrorHandler.handleWithFallback(
    async () => {
      await this.modalSvc.executeWithLoading(
        async () => {
          const state = this.flowManager.getCanvasState();
          if (!state) throw new Error('No canvas state available');
          
          if (capsuleId) {
            await capsulesService.updateCapsule(capsuleId, {...});
          } else {
            await capsulesService.createCapsule({...});
          }
        },
        { message: 'Сохраняем образ...' },
        'canvas'
      );
      await this.flowManager.complete();
    },
    () => {
      // Fallback: разблокируем кнопку
      const doneBtn = document.getElementById('capsule-result-done-btn');
      if (doneBtn) {
        doneBtn.disabled = false;
        doneBtn.classList.remove('pressed');
      }
    },
    CapsuleErrorHandler.createContext('Сохранение капсулы', {
      ...(capsuleId && { capsuleId })
    })
  );
}
```

#### 3. Восстановление состояния canvas

```typescript
async restoreState(canvasEditor: UICanvasEditor, state: CanvasState): Promise<void> {
  await CapsuleErrorHandler.handleWithFallback(
    async () => {
      await canvasEditor.restoreState(state.canvasData);
      logger.info('Canvas state restored successfully');
    },
    () => {
      // Fallback: canvas останется в текущем состоянии
      logger.warn('Failed to restore canvas state');
    },
    CapsuleErrorHandler.createContext('Восстановление состояния canvas', {
      itemIds: state.itemIds
    })
  );
}
```

## Контекст ошибки

Контекст помогает в отладке и предоставляет детальную информацию:

```typescript
interface ErrorContext {
  operation: string;           // Описание операции
  userId?: number;             // ID пользователя (опционально)
  capsuleId?: number;          // ID капсулы (опционально)
  itemIds?: number[];          // ID вещей (опционально)
  additionalData?: Record<string, any>; // Дополнительные данные
}
```

### Создание контекста

```typescript
// Простой контекст
CapsuleErrorHandler.createContext('Загрузка капсул')

// С ID капсулы
CapsuleErrorHandler.createContext('Удаление капсулы', { capsuleId: 123 })

// С дополнительными данными
CapsuleErrorHandler.createContext('Выбор вещей', {
  additionalData: { 
    context: 'canvas-add',
    preselectedCount: 5 
  }
})

// С условным capsuleId (только если не null)
CapsuleErrorHandler.createContext('Сохранение капсулы', {
  ...(capsuleId && { capsuleId })
})
```

## Маппинг ошибок

`CapsuleErrorHandler` автоматически преобразует технические ошибки в понятные пользователю сообщения:

| Техническая ошибка | Сообщение пользователю |
|-------------------|------------------------|
| `Canvas not initialized` | Редактор не готов. Попробуйте еще раз |
| `Failed to load image` | Не удалось загрузить изображение |
| `Background removal failed` | Не удалось удалить фон |
| `Network error` | Ошибка сети. Проверьте подключение |
| `Failed to create capsule` | Не удалось создать капсулу |

Полный список в `CapsuleErrorHandler.ts`.

## Логирование

Все ошибки логируются с полным контекстом:

```typescript
{
  operation: 'Сохранение капсулы',
  timestamp: '2025-01-15T10:30:00.000Z',
  capsuleId: 123,
  itemIds: [1, 2, 3],
  errorMessage: 'Network error',
  errorName: 'Error',
  errorStack: '...'
}
```

## Fallback стратегии

### 1. Возврат к предыдущему состоянию

```typescript
() => {
  this.capsulesGrid.show();
  this.flowManager.cancel();
}
```

### 2. Использование значений по умолчанию

```typescript
() => {
  return [];  // Пустой массив
}
```

### 3. Восстановление UI

```typescript
() => {
  const btn = document.getElementById('btn');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('pressed');
  }
}
```

### 4. Показ альтернативного контента

```typescript
() => {
  // Показываем оригинальное фото вместо обработанного
  uiModalManager.showItemModal({...});
}
```

## Покрытие модулей

### CapsulesManager
- ✅ `handleCapsulesOpen()` - открытие грида
- ✅ `handleAddCapsuleClick()` - создание новой капсулы
- ✅ `showSelectionModal()` - выбор вещей
- ✅ `showItemSelection()` - единый метод выбора
- ✅ `handleViewCapsule()` - просмотр капсулы
- ✅ `handleDeleteCapsule()` - удаление капсулы
- ✅ `handleGeneratedCapsule()` - загрузка AI капсулы
- ✅ `showCanvas()` - показ canvas
- ✅ `handleCanvasAddItem()` - добавление вещей на canvas
- ✅ `handleCanvasNext()` - обработка canvas
- ✅ `handleResultShare()` - шеринг капсулы
- ✅ `handleResultDone()` - сохранение капсулы
- ✅ `loadCapsules()` - загрузка капсул
- ✅ `processPhotoWithBackgroundRemoval()` - обработка фото
- ✅ `handleWardrobePhotoUpload()` - загрузка фото
- ✅ `confirmPreview()` - подтверждение предпросмотра
- ✅ `handleNewItemSaved()` - синхронизация новой вещи

### CapsuleSelectionManager
- ✅ `show()` - показ модального окна выбора

### CanvasStateManager
- ✅ `saveState()` - сохранение состояния
- ✅ `restoreState()` - восстановление состояния
- ✅ `getThumbnail()` - получение thumbnail

### CapsuleFlowManager
- ✅ `startNewCapsule()` - начало создания
- ✅ `editCapsule()` - начало редактирования
- ✅ `complete()` - завершение flow

## Тестирование

### Проверка обработки ошибок

1. **Сетевые ошибки**: Отключите интернет и попробуйте загрузить капсулы
2. **Ошибки API**: Проверьте поведение при 500 ошибке сервера
3. **Ошибки canvas**: Попробуйте сохранить пустой canvas
4. **Ошибки обработки изображений**: Загрузите поврежденное изображение

### Ожидаемое поведение

- ✅ Пользователь видит понятное сообщение об ошибке
- ✅ Приложение не падает и остается в рабочем состоянии
- ✅ UI восстанавливается (кнопки разблокируются, модальные окна закрываются)
- ✅ Ошибки логируются с полным контекстом
- ✅ Fallback механизмы срабатывают корректно

## Метрики

После внедрения обработки ошибок:
- **Покрытие**: 100% асинхронных операций в модуле капсул
- **Fallback механизмы**: Реализованы для всех критических операций
- **Логирование**: Все ошибки логируются с контекстом
- **UX**: Пользователь всегда видит понятное сообщение

## Дальнейшие улучшения

1. **Retry механизм**: Автоматическая повторная попытка для сетевых ошибок
2. **Offline режим**: Сохранение капсул локально при отсутствии сети
3. **Telemetry**: Отправка метрик ошибок на сервер для анализа
4. **User feedback**: Возможность отправить отчет об ошибке

## См. также

- `CapsuleErrorHandler.ts` - Реализация обработчика ошибок
- `CapsuleErrorHandler.README.md` - Документация по API
- `CapsuleErrorHandler.example.ts` - Примеры использования
