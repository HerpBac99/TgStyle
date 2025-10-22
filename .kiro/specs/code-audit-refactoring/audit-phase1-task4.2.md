# Аудит модулей капсул (CapsulesManager.ts, CapsulesService.ts, CapsulesSharing.ts)

**Дата**: 2025-10-22  
**Задача**: 4.2 - Анализ модулей капсул  
**Требования**: 1.1, 1.2, 4.1

## Обзор модулей

### CapsulesManager.ts
- **Размер**: ~850 строк
- **Ответственность**: Координация UI, управление состоянием, обработка событий
- **Паттерн**: Singleton (экспорт экземпляра)
- **Зависимости**: CapsulesService, CapsulesSharing, PhotoProcessor, UICanvasEditor, UICapsulesGrid, UICanvasResultScreen

### CapsulesService.ts
- **Размер**: ~170 строк
- **Ответственность**: Бизнес-логика, API запросы, работа с кэшем
- **Паттерн**: Singleton (экспорт экземпляра)
- **Зависимости**: api, dataLoader, dataCacheManager

### CapsulesSharing.ts
- **Размер**: ~120 строк
- **Ответственность**: Логика шеринга капсул
- **Паттерн**: Singleton (экспорт экземпляра)
- **Зависимости**: sharingService, UICanvasEditor

## 1. Проверка дублирования CRUD операций

### ✅ Разделение ответственности соблюдено

**CapsulesManager** (UI слой):
- `handleCapsulesOpen()` - открытие грида капсул
- `handleAddCapsuleClick()` - создание новой капсулы
- `handleViewCapsule()` - просмотр/редактирование капсулы
- `handleDeleteCapsule()` - удаление капсулы (вызывает сервис)
- `handleResultDone()` - сохранение капсулы (вызывает сервис)
- Управление canvas editor
- Управление экраном результата
- Обработка навигации

**CapsulesService** (бизнес-логика):
- `loadCapsules()` - загрузка с кэшем
- `loadCapsulesFromServer()` - загрузка с сервера
- `loadCapsule()` - загрузка конкретной капсулы
- `createCapsule()` - создание через API
- `updateCapsule()` - обновление через API
- `deleteCapsule()` - удаление через API
- `sortItemsByLayer()` - сортировка вещей

### ❌ Дублирование логики обработки ошибок

**CapsulesService.ts** (5 методов с одинаковым паттерном):
```typescript
// loadCapsulesFromServer
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Error loading capsules from server', { error: errorMessage });
  return [];
}

// loadCapsule
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Error loading capsule data', { error: errorMessage, capsuleId });
  throw error;
}

// createCapsule
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Error saving capsule to server', { error: errorMessage });
  throw error;
}

// updateCapsule
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Error updating capsule on server', { error: errorMessage, capsuleId });
  throw error;
}

// deleteCapsule
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Error removing capsule', { error: errorMessage, capsuleId });
  throw error;
}
```

**Вывод**: Точно такой же паттерн обработки ошибок, как в WardrobeService. Нужна общая утилита.

### ❌ Дублирование логики загрузки гардероба

**CapsulesManager.ts:665-688**:
```typescript
private async loadWardrobeItems(): Promise<void> {
  try {
    this.wardrobeItems = await dataLoader.loadWithCacheFallback<WardrobeItem>(
      () => dataCacheManager.getWardrobeItems(),
      async () => {
        const initData = (window as any).Telegram?.WebApp?.initData || '';
        const response = await fetch(`/api/wardrobe?initData=${encodeURIComponent(initData)}`);
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load items');
        }
        
        return result.items;
      }
    );
    logger.info(`Loaded ${this.wardrobeItems.length} wardrobe items`);
  } catch (error) {
    logger.error('Error loading wardrobe items', error);
    this.wardrobeItems = [];
  }
}
```

**Проблема**: Эта логика дублирует `WardrobeService.loadWardrobe()`. CapsulesManager должен использовать WardrobeService вместо прямого API вызова.

**Рекомендация**: Использовать `wardrobeService.loadWardrobe()` вместо дублирования.

### ❌ Дублирование логики обработки фото

**CapsulesManager.ts:707-765**:
```typescript
async processPhotoWithBackgroundRemoval(file: File): Promise<void> {
  try {
    const base64 = await fileToBase64(file);
    logger.info('Processing photo with background removal');

    this.showLoadingInModal(true);
    const result = await photoProcessor.classifyAndRemoveBackground(base64);
    this.showLoadingInModal(false);

    this.currentPreviewImage = result.processedImage;
    this.currentClassification = result.classification;

    uiModalManager.showItemModal({
      type: 'item-modal',
      modalId: 'wardrobe-preview-modal',
      data: {
        imageUrl: result.processedImage,
        category: result.classification.category,
        color: result.classification.color || '',
        material: result.classification.material
      },
      allowEditCategory: false,
      allowEditColorMaterial: false,
      onConfirm: () => this.confirmPreview(),
      onCancel: () => this.cancelPreview()
    });
  } catch (error) {
    // Fallback logic...
  }
}
```

**Проблема**: Точно такая же логика есть в WardrobeManager.processPhotoWithBackgroundRemoval(). Дублирование ~60 строк кода.

**Рекомендация**: Вынести в общий PhotoUploadHandler или использовать WardrobeManager.

## 2. Неиспользуемые методы

### ✅ Все методы используются

**CapsulesManager** - все методы используются:
- `handleCapsulesOpen()` - вызывается из uiManager.ts:167
- `getStatus()` - вызывается из uiManager.ts:247
- `destroy()` - вызывается из uiManager.ts:271
- Остальные методы - внутренние, используются в цепочках вызовов

**CapsulesService** - все методы используются:
- `loadCapsules()` - вызывается из CapsulesManager.loadCapsules()
- `loadCapsule()` - вызывается из CapsulesManager.handleViewCapsule()
- `createCapsule()` - вызывается из CapsulesManager.handleResultDone()
- `updateCapsule()` - вызывается из CapsulesManager.handleResultDone()
- `deleteCapsule()` - вызывается из CapsulesManager.handleDeleteCapsule()
- `sortItemsByLayer()` - вызывается из CapsulesManager.handleClothingConfirmed()

**CapsulesSharing** - все методы используются:
- `shareCapsule()` - вызывается из CapsulesManager.handleResultShare()
- `getCanvasImage()` - внутренний метод, используется в shareCapsule()

### ✅ Нет неиспользуемых методов

Все публичные методы активно используются в кодовой базе.

## 3. Проверка логики шеринга

### ✅ Логика шеринга НЕ дублируется

**CapsulesSharing.ts** использует универсальный `sharingService`:
```typescript
async shareCapsule(
  canvasEditor: UICanvasEditor,
  capsuleName: string,
  capsuleId?: number,
  thumbnailImage?: string
): Promise<boolean> {
  // 1. Получаем изображение
  let canvasImage: string;
  if (thumbnailImage) {
    canvasImage = thumbnailImage;
  } else {
    canvasImage = await this.getCanvasImage(canvasEditor);
  }

  // 2. Конфигурация для sharing
  const shareConfig: ShareConfig = {
    type: 'capsule',
    image: canvasImage,
    text: `Моя капсула "${capsuleName}"`,
    title: '👔 Моя капсула гардероба',
    metadata: { capsuleId, capsuleName }
  };

  // 3. Делимся через универсальный SharingService
  const result = await sharingService.share(shareConfig, {
    includeImage: true,
    includeLink: true,
    saveToServer: true
  });

  return result.success;
}
```

**Вывод**: Логика шеринга правильно делегирована универсальному `SharingService`. Нет дублирования.

### ✅ Хорошая архитектура шеринга

**Преимущества**:
1. Использует универсальный `SharingService` для всех типов контента
2. Минимальная логика в CapsulesSharing - только подготовка данных
3. Поддержка готового thumbnail изображения (оптимизация)
4. Правильная обработка ошибок

## 4. Дополнительные находки

### ❌ Дублирование интерфейса PhotoUploadHandler

**CapsulesManager.ts:697-820**:
```typescript
export class CapsulesManager implements PhotoUploadHandler {
  showLoadingInModal(show: boolean): void { ... }
  async processPhotoWithBackgroundRemoval(file: File): Promise<void> { ... }
  async fileToBase64(file: File): Promise<string> { ... }
  async handlePhotoUpload(): Promise<void> { ... }
  private async confirmPreview(): Promise<void> { ... }
  private cancelPreview(): void { ... }
}
```

**Проблема**: Точно такая же реализация PhotoUploadHandler есть в WardrobeManager (~150 строк дублирующегося кода).

**Рекомендация**: Создать базовый класс или миксин для PhotoUploadHandler.

### ⚠️ Сложная логика состояний

**CapsulesManager.ts** имеет 5 режимов работы:
```typescript
private mode: 'grid' | 'selection' | 'canvas' | 'result' | null = null;
```

**Проблема**: Сложная state machine с множеством переходов между состояниями. Трудно отследить все возможные пути.

**Рекомендация**: Рассмотреть использование паттерна State Machine или документировать диаграмму переходов.

### ⚠️ Прямой вызов fetch вместо API клиента

**CapsulesManager.ts:673**:
```typescript
const response = await fetch(`/api/wardrobe?initData=${encodeURIComponent(initData)}`);
```

**Проблема**: Прямой вызов fetch вместо использования api клиента. Нарушает консистентность.

**Рекомендация**: Использовать `api.getWardrobe()` или `wardrobeService.loadWardrobe()`.

### ✅ Хорошая практика: Обработка событий

**CapsulesManager.ts:60-65**:
```typescript
window.addEventListener('wardrobe:item-saved', ((event: CustomEvent) => {
  const { item } = event.detail;
  this.handleNewItemSaved(item);
}) as EventListener);
```

**Вывод**: Правильная подписка на события для синхронизации данных между модулями.

### ✅ Хорошая практика: Использование navigationManager

**CapsulesManager.ts** правильно использует navigationManager для управления back button:
```typescript
navigationManager.push(() => {
  this.returnToClothingSelection();
}, 'Return to clothing selection from new capsule');
```

**Вывод**: Правильная интеграция с навигацией Telegram WebApp.

### ⚠️ Отсутствие очистки event listener

**CapsulesManager.ts:60-65**:
```typescript
constructor() {
  window.addEventListener('wardrobe:item-saved', ((event: CustomEvent) => {
    const { item } = event.detail;
    this.handleNewItemSaved(item);
  }) as EventListener);
}
```

**Проблема**: Event listener добавляется в конструкторе, но не удаляется в destroy(). Потенциальная утечка памяти.

**Рекомендация**: Сохранить ссылку на handler и удалить в destroy().

## 5. Сравнение с WardrobeManager

### Общие паттерны (хорошо)

1. ✅ Singleton экспорт
2. ✅ Разделение Manager/Service
3. ✅ Использование dataLoader с кэшем
4. ✅ Правильная обработка ошибок
5. ✅ Методы getStatus() и destroy()

### Дублирование кода (плохо)

1. ❌ PhotoUploadHandler реализация (~150 строк)
2. ❌ Логика обработки ошибок в Service (~5 методов)
3. ❌ Загрузка гардероба (~25 строк)

## Итоговые рекомендации

### Высокий приоритет

1. **Создать базовый класс для PhotoUploadHandler**:
   ```typescript
   // shared/BasePhotoUploadHandler.ts
   export abstract class BasePhotoUploadHandler implements PhotoUploadHandler {
     protected currentPreviewImage: string | null = null;
     protected currentClassification: any = null;
     
     async processPhotoWithBackgroundRemoval(file: File): Promise<void> { ... }
     async handlePhotoUpload(): Promise<void> { ... }
     // ... общая реализация
   }
   ```

2. **Использовать WardrobeService для загрузки гардероба**:
   ```typescript
   // Вместо прямого fetch
   private async loadWardrobeItems(): Promise<void> {
     this.wardrobeItems = await wardrobeService.loadWardrobe();
   }
   ```

3. **Создать общую утилиту обработки ошибок**:
   ```typescript
   // shared/ErrorHandler.ts
   export function handleServiceError(error: unknown, context: string, metadata?: any): string {
     const errorMessage = error instanceof Error ? error.message : String(error);
     logger.error(context, { error: errorMessage, ...metadata });
     return errorMessage;
   }
   ```

### Средний приоритет

4. **Исправить утечку памяти event listener**:
   ```typescript
   private wardrobeItemSavedHandler: EventListener;
   
   constructor() {
     this.wardrobeItemSavedHandler = ((event: CustomEvent) => {
       this.handleNewItemSaved(event.detail.item);
     }) as EventListener;
     window.addEventListener('wardrobe:item-saved', this.wardrobeItemSavedHandler);
   }
   
   destroy(): void {
     window.removeEventListener('wardrobe:item-saved', this.wardrobeItemSavedHandler);
     // ...
   }
   ```

5. **Документировать state machine**:
   - Создать диаграмму переходов между режимами
   - Добавить комментарии для каждого перехода

### Низкий приоритет

6. **Улучшить типизацию**:
   - Избегать `any` типов
   - Добавить строгие типы для всех параметров

## Метрики

- **Всего методов в CapsulesManager**: 25
- **Всего методов в CapsulesService**: 6
- **Всего методов в CapsulesSharing**: 2
- **Неиспользуемых методов**: 0
- **Дублирование кода**: Высокое (~200 строк с WardrobeManager)
- **Строк кода**: ~1140 (850 Manager + 170 Service + 120 Sharing)

## Заключение

Модули капсул хорошо структурированы с правильным разделением ответственности. Основные проблемы:

1. ❌ Дублирование PhotoUploadHandler реализации с WardrobeManager (~150 строк)
2. ❌ Дублирование логики обработки ошибок в Service
3. ❌ Дублирование загрузки гардероба (прямой fetch вместо WardrobeService)
4. ⚠️ Утечка памяти event listener
5. ⚠️ Сложная state machine без документации

**Положительные стороны**:
- ✅ Логика шеринга НЕ дублируется (использует SharingService)
- ✅ Правильная интеграция с navigationManager
- ✅ Все методы используются
- ✅ Хорошее разделение Manager/Service

Рекомендуется выполнить рефакторинг для устранения дублирования кода с WardrobeManager.
