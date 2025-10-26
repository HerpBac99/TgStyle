# CapsuleErrorHandler - Утилита обработки ошибок

## Описание

`CapsuleErrorHandler` - централизованная утилита для обработки ошибок в модуле капсул. Обеспечивает единообразную обработку ошибок, понятные пользователю сообщения и детальное логирование.

## Основные возможности

- ✅ Единый механизм обработки ошибок
- ✅ Автоматический маппинг технических ошибок на понятные сообщения
- ✅ Детальное логирование с контекстом
- ✅ Fallback механизмы для graceful degradation
- ✅ Проверка типа ошибки (критическая, повторяемая)
- ✅ Интеграция с ModalService для показа alert

## Требования

Реализует требования: **8.1, 8.2, 8.3**

## API

### handleWithFallback

Выполняет операцию с обработкой ошибок и fallback значением.

```typescript
static async handleWithFallback<T>(
  operation: () => Promise<T>,
  fallback: () => T,
  context: ErrorContext
): Promise<T>
```

**Пример:**

```typescript
const capsule = await CapsuleErrorHandler.handleWithFallback(
  async () => {
    const response = await api.getCapsule(capsuleId);
    return response;
  },
  () => {
    // Fallback - возвращаем пустую капсулу
    return { id: capsuleId, items: [] };
  },
  {
    operation: 'Load Capsule',
    capsuleId,
    userId: currentUser.id,
  }
);
```

### wrap

Оборачивает асинхронную операцию в обработчик ошибок без fallback.

```typescript
static async wrap<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T>
```

**Пример:**

```typescript
await CapsuleErrorHandler.wrap(
  async () => {
    await api.saveCapsule(capsuleId, data);
  },
  {
    operation: 'Save Capsule',
    capsuleId,
  }
);
```

### handle

Обрабатывает ошибку без fallback (только логирование и показ пользователю).

```typescript
static handle(error: unknown, context: ErrorContext): void
```

**Пример:**

```typescript
try {
  await someOperation();
} catch (error) {
  CapsuleErrorHandler.handle(error, {
    operation: 'Some Operation',
    additionalData: { key: 'value' },
  });
  throw error;
}
```

### showUserError

Показывает пользователю понятное сообщение об ошибке.

```typescript
static showUserError(error: unknown, operation: string): void
```

**Пример:**

```typescript
try {
  await loadCanvas();
} catch (error) {
  CapsuleErrorHandler.showUserError(error, 'Загрузка редактора');
}
```

### getUserFriendlyMessage

Получает понятное пользователю сообщение об ошибке.

```typescript
static getUserFriendlyMessage(error: unknown, operation: string): string
```

**Пример:**

```typescript
const message = CapsuleErrorHandler.getUserFriendlyMessage(
  new Error('Canvas not initialized'),
  'Загрузка редактора'
);
// Вернет: "Редактор не готов. Попробуйте еще раз"
```

### createContext

Создает контекст ошибки для логирования.

```typescript
static createContext(
  operation: string,
  additionalData?: Partial<ErrorContext>
): ErrorContext
```

**Пример:**

```typescript
const context = CapsuleErrorHandler.createContext('Process Image', {
  capsuleId: 123,
  additionalData: { imageSize: 1024000 },
});
```

### isCritical

Проверяет, является ли ошибка критической.

```typescript
static isCritical(error: unknown): boolean
```

**Пример:**

```typescript
if (CapsuleErrorHandler.isCritical(error)) {
  logger.error('Critical error detected!');
  // Дополнительные действия для критических ошибок
}
```

### isRetryable

Проверяет, можно ли повторить операцию после ошибки.

```typescript
static isRetryable(error: unknown): boolean
```

**Пример:**

```typescript
if (CapsuleErrorHandler.isRetryable(error)) {
  // Повторная попытка
  await retryOperation();
}
```

## Типы

### ErrorContext

Контекст ошибки для логирования.

```typescript
interface ErrorContext {
  operation: string;           // Название операции
  userId?: number;             // ID пользователя
  capsuleId?: number;          // ID капсулы
  itemIds?: number[];          // ID вещей
  additionalData?: Record<string, any>; // Дополнительные данные
}
```

## Маппинг ошибок

Утилита автоматически преобразует технические ошибки в понятные пользователю сообщения:

| Техническая ошибка | Сообщение пользователю |
|-------------------|------------------------|
| `Canvas not initialized` | Редактор не готов. Попробуйте еще раз |
| `Background removal failed` | Не удалось удалить фон |
| `Network error` | Ошибка сети. Проверьте подключение |
| `Failed to create capsule` | Не удалось создать капсулу |
| `No items selected` | Не выбрано ни одной вещи |

Полный список см. в константе `ERROR_MESSAGES` в исходном коде.

## Паттерны использования

### В менеджерах

```typescript
class CapsulesManager {
  async createCapsule(items: WardrobeItem[]) {
    return await CapsuleErrorHandler.handleWithFallback(
      async () => {
        // Основная логика
        const capsule = await this.api.createCapsule(items);
        return capsule;
      },
      () => {
        // Fallback - остаемся на текущем экране
        return null;
      },
      {
        operation: 'Create Capsule',
        itemIds: items.map(i => i.id),
      }
    );
  }
}
```

### В сервисах

```typescript
class ImageProcessingService {
  async removeBackground(image: string) {
    return await CapsuleErrorHandler.wrap(
      async () => {
        const result = await api.removeBackground(image);
        return result;
      },
      {
        operation: 'Remove Background',
        additionalData: { imageSize: image.length },
      }
    );
  }
}
```

### С повторными попытками

```typescript
async function loadWithRetry(capsuleId: number) {
  try {
    return await loadCapsule(capsuleId);
  } catch (error) {
    if (CapsuleErrorHandler.isRetryable(error)) {
      logger.info('Retrying operation...');
      return await loadCapsule(capsuleId);
    }
    throw error;
  }
}
```

## Логирование

Все ошибки логируются с полным контекстом:

```json
{
  "level": "error",
  "message": "Capsule operation failed: Create Capsule",
  "data": {
    "operation": "Create Capsule",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "userId": 123,
    "itemIds": [1, 2, 3],
    "errorMessage": "Network error",
    "errorName": "Error",
    "errorStack": "Error: Network error\n    at ..."
  }
}
```

## Интеграция с ModalService

Утилита автоматически показывает alert через `ModalService`:

```typescript
// Автоматически покажет alert с понятным сообщением
CapsuleErrorHandler.showUserError(
  new Error('Canvas not initialized'),
  'Загрузка редактора'
);
// Пользователь увидит: "Редактор не готов. Попробуйте еще раз"
```

## Best Practices

1. **Всегда используйте контекст**: Передавайте максимум информации для отладки
2. **Используйте fallback**: Предоставляйте альтернативное поведение вместо краха
3. **Проверяйте тип ошибки**: Используйте `isCritical()` и `isRetryable()`
4. **Не дублируйте логирование**: Утилита уже логирует все ошибки
5. **Используйте wrap для простых случаев**: Когда не нужен fallback

## Примеры

Полные примеры использования см. в файле `CapsuleErrorHandler.example.ts`.

## См. также

- [ModalService](../shared/ModalService.ts) - Сервис модальных окон
- [Logger](../logger.ts) - Система логирования
- [Design Document](../../../.kiro/specs/capsule-refactoring/design.md) - Архитектура модуля
