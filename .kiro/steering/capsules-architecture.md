# Архитектура модуля Capsules

## Обзор

Модуль Capsules реализует функциональность создания и редактирования образов (капсул) из вещей гардероба. После рефакторинга модуль следует принципам SOLID и использует паттерн Dependency Injection.

## Архитектурные принципы

### Single Responsibility Principle
Каждый модуль отвечает за одну конкретную область:
- **CapsuleFlowManager** - управление flow переходов
- **CapsuleSelectionManager** - выбор вещей из гардероба
- **CanvasStateManager** - состояние и кэширование canvas
- **ImageProcessingService** - обработка изображений
- **ModalService** - управление модальными окнами
- **CapsuleErrorHandler** - обработка ошибок

### Dependency Injection
```typescript
export class CapsulesManager {
  private flowManager: CapsuleFlowManager;
  private selectionManager: CapsuleSelectionManager;
  private stateManager: CanvasStateManager;
  private imageService: typeof imageProcessingService;
  private modalSvc: ModalService;

  constructor() {
    // Внедрение зависимостей
    this.flowManager = capsuleFlowManager;
    this.selectionManager = capsuleSelectionManager;
    this.stateManager = canvasStateManager;
    this.imageService = imageProcessingService;
    this.modalSvc = modalService;
  }
}
```

## Основные модули

### 1. CapsulesManager (Координатор)
**Файл**: `client/src/modules/capsules/CapsulesManager.ts`
**Роль**: Главный координатор, делегирует задачи в специализированные модули
**Размер**: ~1126 строк (было 1272)

**Основные методы**:
- `handleCapsulesOpen()` - открытие грида капсул
- `handleAddCapsuleClick()` - создание новой капсулы
- `handleViewCapsule()` - редактирование существующей капсулы

### 2. CapsuleFlowManager (Управление переходами)
**Файл**: `client/src/modules/capsules/CapsuleFlowManager.ts`
**Роль**: Управляет переходами между этапами создания/редактирования

**Flow этапы**:
- `selection` - выбор вещей из гардероба
- `canvas` - редактирование на canvas
- `result` - просмотр результата с watermark

**Режимы работы**:
- `create` - создание новой капсулы (selection → canvas → result)
- `edit` - редактирование существующей (canvas → result)

### 3. CapsuleSelectionManager (Выбор вещей)
**Файл**: `client/src/modules/capsules/CapsuleSelectionManager.ts`
**Роль**: Управляет модальным окном выбора вещей из гардероба

**Возможности**:
- Показ/скрытие модального окна
- Предвыбранные элементы (для редактирования)
- Фильтрация по категориям
- Интеграция с WardrobeManager

### 4. CanvasStateManager (Состояние canvas)
**Файл**: `client/src/modules/capsules/CanvasStateManager.ts`
**Роль**: Управляет состоянием canvas и кэшированием

**Оптимизации**:
- Трехуровневое кэширование (память, localStorage, браузерный кэш)
- Флаг `isDirty` для избежания ненужных сохранений
- Автоматическая инвалидация старого кэша
- Сжатие изображений для кэша

### 5. ImageProcessingService (Обработка изображений)
**Файл**: `client/src/modules/shared/ImageProcessingService.ts`
**Роль**: Централизованная обработка изображений

**Операции**:
- Удаление фона через FastVLM API
- Добавление watermark
- Оптимизация размера и качества
- Кэширование обработанных изображений

### 6. ModalService (Модальные окна)
**Файл**: `client/src/modules/shared/ModalService.ts`
**Роль**: Управление всеми модальными окнами

**Типы модальных окон**:
- Loading модальные окна
- Alert/Confirm диалоги
- Кастомные модальные окна

## Паттерны проектирования

### Singleton Pattern
```typescript
// UICanvasEditor использует singleton
export class UICanvasEditor {
  private static instance: UICanvasEditor | null = null;
  
  static getInstance(config?: UICanvasEditorConfig): UICanvasEditor {
    if (!UICanvasEditor.instance) {
      UICanvasEditor.instance = new UICanvasEditor(config);
    }
    return UICanvasEditor.instance;
  }
}
```

### Observer Pattern
```typescript
// Событийная система для связи между модулями
window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
  detail: { item }
}));

window.addEventListener('wardrobe:item-saved', (event) => {
  const item = event.detail.item;
  // Обработка события
});
```

### Strategy Pattern
```typescript
// Разные стратегии обработки ошибок
export class CapsuleErrorHandler {
  static async handleWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    context: ErrorContext
  ): Promise<T>
}
```

## Интеграция с другими модулями

### WardrobeManager
- Использует события для синхронизации данных
- Переиспользует рендеринг грида через `wardrobeService`
- Избегает прямых зависимостей

### NavigationManager
- Управляет BackButton через единую систему
- Поддерживает стек обработчиков для разных этапов
- Автоматическое удаление обработчиков при переходах

### UIManager
- Интегрируется с общей системой экранов
- Использует единые стили и анимации
- Поддерживает responsive дизайн

## Производительность

### Оптимизации кэширования
- **Память**: Все данные в DataCacheManager
- **localStorage**: Первые 30 вещей (без base64)
- **Браузерный кэш**: Изображения с HTTP заголовками

### Метрики производительности
- **Создание капсулы**: 3-5 сек (было 30+ сек)
- **Загрузка из кэша**: <100ms
- **Обработка изображений**: 1-2 сек
- **Сохранение состояния**: <200ms

### Оптимизация изображений
| Этап | Размер | Формат | Цель |
|------|--------|--------|------|
| Canvas | 1170x2531 | PNG | Высокое качество |
| Кэш | 800x800 | JPEG 80% | Быстрая загрузка |
| Thumbnail | 400x400 | JPEG 70% | Предпросмотр |
| Watermark | Оригинал | PNG | Финальный результат |

## Обработка ошибок

### Централизованная обработка
```typescript
await CapsuleErrorHandler.handleWithFallback(
  async () => {
    // Основная операция
  },
  () => {
    // Fallback при ошибке
  },
  CapsuleErrorHandler.createContext('Описание операции')
);
```

### Типы ошибок
- **Сетевые ошибки** - повторные попытки, fallback на кэш
- **Ошибки API** - понятные сообщения пользователю
- **Ошибки обработки изображений** - использование оригинала
- **Ошибки состояния** - восстановление из кэша

## Тестирование

### Unit тесты
- Каждый модуль тестируется изолированно
- Моки для внешних зависимостей
- Покрытие критических путей

### Интеграционные тесты
- Полный flow создания капсулы
- Полный flow редактирования
- Сценарии ошибок и восстановления

### E2E тесты
- Тестирование в реальном Telegram окружении
- Проверка производительности
- Тестирование на разных устройствах