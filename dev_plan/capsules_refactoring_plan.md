# План рефакторинга UICapsulesManager

## Дата создания: 10.10.2025
## Автор анализа: AI Assistant

---

## 🔍 Обзор текущего состояния

### Структура класса UICapsulesManager
Класс объединяет следующие функции:
1. **Управление гридом капсул** - отображение сохраненных образов
2. **Модальное окно выбора одежды** - выбор элементов из гардероба
3. **Canvas редактор** - создание и редактирование композиций
4. **Управление состоянием** - отслеживание режимов (создание/редактирование)
5. **BackButton логика** - навигация назад
6. **Сохранение/загрузка** - работа с API сервера

### Текущие проблемы

#### 1. **КРИТИЧЕСКАЯ: Кнопки не работают при редактировании капсулы**
**Корневая причина:**
- Обработчики событий добавляются в `cleanupFunctions` массив
- При различных переходах `closeCapsules()` вызывается и удаляет ВСЕ обработчики
- При редактировании существующей капсулы обработчики настраиваются заново, но могут быть очищены некорректно
- Отсутствует разделение между глобальными обработчиками и обработчиками для конкретных режимов

**Проблемные места в коде:**
```typescript
// Строка 357-365: closeCapsules() удаляет ВСЕ обработчики
this.cleanupFunctions.forEach(cleanup => {
  try {
    cleanup();
  } catch (error) {
    logger.error('Error during cleanup', error);
  }
});
this.cleanupFunctions = [];

// Строки 1453-1485: setupCanvasAddButton()
// Строки 1492-1522: setupCanvasSaveButton()
// Обработчики добавляются в cleanupFunctions, но могут быть удалены преждевременно
```

**Сценарий воспроизведения бага:**
1. Открыть существующую капсулу через `viewCapsule()`
2. Canvas отображается корректно
3. Кнопки "Добавить одежду" и "Сохранить" не реагируют на клик
4. Причина: обработчики были либо не добавлены, либо удалены при предыдущих вызовах cleanup

#### 2. **Отсутствие унификации для модального окна**
- Все методы работы с модалкой (show/hide/render) разбросаны по классу
- Нет централизованного управления состоянием модалки
- Дублирование логики фильтров и грида между Wardrobe и Capsules

**Проблемные методы:**
- `showModal()` - строка 325
- `hideModal()` - строка 334
- `createFilters()` - строка 415
- `renderGrid()` - строка 493
- `toggleItemSelection()` - строка 577

#### 3. **Отсутствие унификации для Canvas**
**Два разных пути инициализации:**

**Путь A - Создание новой капсулы:**
```
handleAddCapsuleClick() 
  → loadWardrobeItems() 
  → createFilters() 
  → showModal() 
  → setupEventListeners() 
  → handleNextClick() 
    → hideModal() 
    → showCanvas() 
    → initializeCanvas() 
    → addItemsToCanvas(selectedItemsData)
    → setupBackButton() // Возврат к модалке
    → setupCanvasAddButton()
    → setupCanvasSaveButton()
```

**Путь B - Редактирование существующей капсулы:**
```
viewCapsule(capsuleId) 
  → loadWardrobeItems() 
  → showCanvas() 
  → initializeCanvas() 
  → renderCapsuleOnCanvas(capsuleData.canvasData)
  → setupBackButtonForCapsuleView() // Возврат к гриду
  → setupCanvasAddButton()
  → setupCanvasSaveButton()
```

**Проблемы:**
- Разные методы добавления объектов на canvas:
  - `addItemsToCanvas()` для новой капсулы (строка 673)
  - `renderCapsuleOnCanvas()` для редактирования (строка 2002)
- Нет единой точки входа для работы с canvas
- Логика передачи данных (позиций, объектов) не унифицирована

#### 4. **BackButton логика разбросана по классу**
Три разных метода для одной функции:
- `setupBackButton()` - строка 1319 (возврат к модалке выбора одежды)
- `setupBackButtonForCapsuleView()` - строка 1354 (возврат к гриду капсул)
- `hideBackButton()` - строка 1389

**Проблема:** Нет единого механизма управления навигацией, каждый случай обрабатывается отдельно

#### 5. **Глобальные обработчики смешаны с локальными**
Все обработчики попадают в один массив `cleanupFunctions`:
- Обработчики для модалки выбора одежды
- Обработчики для canvas кнопок
- Обработчики для грида капсул
- Обработчики для BackButton

**Результат:** При очистке одного режима удаляются обработчики другого режима

---

## 🎯 Цели рефакторинга

1. ✅ **Выделить модальное окно в отдельный класс** `UIClothingSelectionModal`
2. ✅ **Создать унифицированный класс для Canvas** `UICanvasEditor`
3. ✅ **Унифицировать навигацию с BackButton** через централизованный NavigationManager
4. ✅ **Разделить обработчики событий по контекстам** (глобальные/модалка/canvas)
5. ✅ **Исправить баг с кнопками при редактировании** через правильное управление lifecycle

---

## 📐 Архитектура после рефакторинга

```
┌──────────────────────────────────────────────────────────────────┐
│                      UICapsulesManager                           │
│  (Главный контроллер - управляет переходами между режимами)     │
└──────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │  UICapsulesGrid  │  │  UIModalManager  │  │  UICanvasEditor  │
    │                  │  │  (универсальный) │  │                  │
    │ - Грид капсул    │  │                  │  │ - Fabric.js      │
    │ - Создание карточек│ │ Типы модалок:   │  │ - Добавление     │
    │ - Удаление       │  │  1. Clothing     │  │   объектов       │
    │                  │  │     Selection    │  │ - Управление     │
    └──────────────────┘  │  2. Wardrobe     │  │   позициями      │
                          │     Preview      │  │ - Сохранение     │
                          │  3. (расширяемо) │  └──────────────────┘
                          └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Navigation      │
                    │  Manager         │
                    │ - BackButton     │
                    │ - История        │
                    │   переходов      │
                    └──────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────────┐
            │  Используется также в:              │
            │  - UIWardrobeManager                │
            │  - Будущих модулях                  │
            └─────────────────────────────────────┘
```

---

## 📋 Детальный план реализации

### Этап 1: Создание класса UIModalManager (универсальный менеджер модальных окон)

**Файл:** `client/src/modules/uiModalManager.ts`

**Ответственность:**
- **Универсальное управление всеми модальными окнами в приложении**
- Модальное окно выбора одежды для капсул (с фильтрами и выбором)
- Модальное окно предпросмотра одежды для гардероба (с классификацией)
- Будущие модальные окна (расширяемость)

**Типы модальных окон:**

#### 1. **Clothing Selection Modal** (для капсул)
- Фильтры категорий
- Грид элементов гардероба
- Множественный выбор элементов
- Кнопка "Далее" с валидацией

#### 2. **Wardrobe Preview Modal** (для гардероба)
- Предпросмотр загруженного фото
- Информация о классификации (категория, цвет, материал и т.д.)
- Индикатор загрузки
- Кнопки "Подтвердить" и "Отменить"

**Интерфейс:**
```typescript
// Базовый конфиг для любой модалки
interface BaseModalConfig {
  modalId: string;
  onClose?: () => void;
}

// Конфиг для модалки выбора одежды
interface ClothingSelectionModalConfig extends BaseModalConfig {
  type: 'clothing-selection';
  wardrobeItems: WardrobeItem[];
  selectedItemIds?: Set<number>;
  onConfirm: (selectedItems: WardrobeItem[]) => void;
  onCancel: () => void;
}

// Конфиг для модалки предпросмотра
interface WardrobePreviewModalConfig extends BaseModalConfig {
  type: 'wardrobe-preview';
  onConfirm: () => void;
  onCancel: () => void;
}

type ModalConfig = ClothingSelectionModalConfig | WardrobePreviewModalConfig;

class UIModalManager {
  private currentModal: ModalConfig | null;
  private cleanupFunctions: (() => void)[];
  
  // Для clothing-selection модалки
  private selectedItems: Set<number>;
  private currentFilter: string;
  
  constructor() { }
  
  // === ПУБЛИЧНЫЕ МЕТОДЫ ===
  
  // Показать модалку выбора одежды
  showClothingSelectionModal(config: ClothingSelectionModalConfig): void { }
  
  // Показать модалку предпросмотра
  showWardrobePreviewModal(config: WardrobePreviewModalConfig): void { }
  
  // Универсальные методы
  hide(): void { }
  destroy(): void { }
  
  // === МЕТОДЫ ДЛЯ WARDROBE PREVIEW MODAL ===
  
  clearPreviewModal(): void { }
  showLoadingInModal(show: boolean): void { }
  showImageInModal(base64: string): void { }
  showClassificationInfo(category: ClothingCategory, color: string, ...): void { }
  
  // === ПРИВАТНЫЕ МЕТОДЫ ДЛЯ CLOTHING SELECTION ===
  
  private setupClothingSelectionListeners(config: ClothingSelectionModalConfig): void { }
  private createFilters(): void { }
  private renderGrid(items: WardrobeItem[]): void { }
  private toggleItemSelection(itemId: number): void { }
  private updateNextButtonState(): void { }
  
  // === ПРИВАТНЫЕ МЕТОДЫ ДЛЯ WARDROBE PREVIEW ===
  
  private setupWardrobePreviewListeners(config: WardrobePreviewModalConfig): void { }
}
```

**Методы для миграции:**

**Из UICapsulesManager:**
- `showModal()` → `showClothingSelectionModal()`
- `hideModal()` → `hide()`
- `createFilters()` → (приватный)
- `renderGrid()` → (приватный)
- `createFilterButton()` → (приватный)
- `setActiveFilter()` → (приватный)
- `getFilteredItems()` → (приватный)
- `createItemCard()` → (приватный)
- `toggleItemSelection()` → (приватный)
- `updateNextButtonState()` → (приватный)
- Часть `setupEventListeners()` (обработчики модалки)

**Из UIWardrobeManager:**
- `showPreviewModal()` → `showWardrobePreviewModal()`
- `hidePreviewModal()` → `hide()`
- `clearPreviewModal()` → `clearPreviewModal()`
- `showLoadingInModal()` → `showLoadingInModal()`
- `showImageInModal()` → (приватный)
- `showClassificationInfo()` → `showClassificationInfo()`
- Обработчики кнопок confirm/cancel

**Преимущества объединения:**
- ✅ Единая точка управления всеми модальными окнами
- ✅ Нет дублирования кода show/hide/cleanup
- ✅ Легко добавлять новые типы модалок
- ✅ Централизованное управление overlay

---

### Этап 2: Создание класса UICanvasEditor

**Файл:** `client/src/modules/uiCanvasEditor.ts`

**Ответственность:**
- Инициализация Fabric.js canvas
- Добавление объектов на canvas (унифицированный метод)
- Управление позициями объектов
- Контроллы (удаление, масштабирование, поворот)
- Сериализация/десериализация состояния canvas

**Интерфейс:**
```typescript
interface CanvasEditorConfig {
  containerId: string;
  canvasId: string;
  onAddItem?: () => void;
  onSave?: () => void;
}

interface CanvasState {
  canvasData: any; // Данные canvas для сохранения
  thumbnailImage: string; // base64 thumbnail
}

interface CanvasItem {
  item: WardrobeItem;
  position?: { x: number; y: number };
  scale?: number;
  angle?: number;
}

class UICanvasEditor {
  private fabricCanvas: fabric.Canvas | null;
  private config: CanvasEditorConfig;
  private cleanupFunctions: (() => void)[];
  private isVisible: boolean;

  constructor(config: CanvasEditorConfig) { }
  
  // Основные методы
  show(): void { }
  hide(): void { }
  destroy(): void { }
  
  // Унифицированный метод загрузки
  async loadItems(items: CanvasItem[]): Promise<void> { }
  
  // Добавление нового элемента (например, после загрузки фото)
  async addItem(item: CanvasItem): Promise<void> { }
  
  // Получение состояния для сохранения
  getState(): CanvasState { }
  
  // Восстановление состояния
  async restoreState(state: any): Promise<void> { }
  
  // Приватные методы
  private initializeCanvas(): void { }
  private setupCanvasControls(): void { }
  private addImageToCanvas(imageObj: HTMLImageElement, item: WardrobeItem, 
                           position?: {x: number, y: number}, 
                           scale?: number, angle?: number): void { }
  private calculateImagePosition(imageObj: HTMLImageElement, item: WardrobeItem): 
    { scale: number; x: number; y: number } { }
  private addDeleteControl(fabricImg: fabric.Image): void { }
  private renderDeleteIcon(ctx: CanvasRenderingContext2D, ...): void { }
}
```

**Методы для миграции из UICapsulesManager:**
- `showCanvas()` → `show()`
- `hideCanvas()` → `hide()`
- `initializeCanvas()` → `initializeCanvas()` (приватный)
- `addItemsToCanvas()` → `loadItems()` (УНИФИЦИРОВАННЫЙ)
- `renderCapsuleOnCanvas()` → `restoreState()` (УНИФИЦИРОВАННЫЙ)
- `addNewItemToCanvas()` → `addItem()`
- `loadSingleImage()` → (приватный)
- `loadSingleImageForCanvas()` → (приватный)
- `addImageToCanvas()` → (приватный)
- `calculateImagePosition()` → (приватный)
- `deleteObject()` → (приватный)
- `renderDeleteIcon()` → (приватный)
- `addDeleteControl()` → (приватный)
- `getCanvasData()` → `getState()`
- `canvasToImage()` → часть `getState()`
- `renderCanvasObject()` → часть `restoreState()`

**КЛЮЧЕВОЕ ИЗМЕНЕНИЕ:**
```typescript
// Унифицированный метод loadItems заменит оба:
// 1. addItemsToCanvas(items: WardrobeItem[]) - для новой капсулы
// 2. renderCapsuleOnCanvas(canvasData: any) - для редактирования

async loadItems(items: CanvasItem[]): Promise<void> {
  this.clear();
  
  for (const canvasItem of items) {
    await this.addItem(canvasItem);
  }
  
  this.fabricCanvas.renderAll();
}

async addItem(canvasItem: CanvasItem): Promise<void> {
  const { item, position, scale, angle } = canvasItem;
  
  // Загружаем изображение
  const imageObj = await this.loadImage(item.imageUrl);
  
  // Вычисляем позицию (используем заданную или рассчитываем автоматически)
  const finalPosition = position || this.calculateImagePosition(imageObj, item);
  const finalScale = scale || finalPosition.scale;
  const finalAngle = angle || 0;
  
  // Добавляем на canvas
  this.addImageToCanvas(imageObj, item, 
    { x: finalPosition.x, y: finalPosition.y }, 
    finalScale, finalAngle);
}
```

**Преимущества унификации:**
- Один метод для всех случаев: новая капсула, редактирование, добавление новых элементов
- Сохраненные позиции передаются через параметр `position`
- Если позиция не указана - рассчитывается автоматически
- Унифицированная структура данных `CanvasItem`

---

### Этап 3: Создание NavigationManager

**Файл:** `client/src/modules/navigationManager.ts`

**Ответственность:**
- Управление BackButton
- История навигации
- Унифицированные обработчики возврата

**Интерфейс:**
```typescript
type NavigationHandler = () => void;

interface NavigationStackItem {
  handler: NavigationHandler;
  description: string; // Для отладки
}

class NavigationManager {
  private stack: NavigationStackItem[];
  private isBackButtonVisible: boolean;

  constructor() { }
  
  // Добавить обработчик в стек (показывает BackButton)
  push(handler: NavigationHandler, description: string): void { }
  
  // Удалить последний обработчик (скрывает BackButton если стек пуст)
  pop(): void { }
  
  // Очистить стек (скрывает BackButton)
  clear(): void { }
  
  // Обработать нажатие BackButton (вызывает handler с вершины стека)
  private handleBackButtonClick(): void { }
  
  // Показать/скрыть BackButton
  private showBackButton(): void { }
  private hideBackButton(): void { }
}
```

**Использование:**
```typescript
// В UICapsulesManager:

// При переходе к canvas из модалки (создание новой капсулы)
this.navigationManager.push(() => {
  this.canvasEditor.hide();
  this.clothingModal.show();
}, 'Return to clothing selection');

// При переходе к canvas из грида (редактирование капсулы)
this.navigationManager.push(() => {
  this.canvasEditor.hide();
  this.showCapsulesGrid();
}, 'Return to capsules grid');

// При полном закрытии
this.navigationManager.clear();
```

**Методы для замены:**
- `setupBackButton()` → `navigationManager.push(...)`
- `setupBackButtonForCapsuleView()` → `navigationManager.push(...)`
- `hideBackButton()` → `navigationManager.clear()` или `navigationManager.pop()`

---

### Этап 4: Рефакторинг UICapsulesManager

**Новая структура класса:**

```typescript
export class UICapsulesManager {
  // Дочерние компоненты
  private capsulesGrid: UICapsulesGrid;
  private clothingModal: UIClothingSelectionModal | null;
  private canvasEditor: UICanvasEditor | null;
  private navigationManager: NavigationManager;
  
  // Состояние
  private wardrobeItems: WardrobeItem[];
  private capsules: StyleCapsule[];
  private currentCapsuleId: number | null;
  
  // Управление режимами
  private mode: 'grid' | 'selection' | 'canvas' | null;
  
  // РАЗДЕЛЕННЫЕ cleanupFunctions
  private globalCleanupFunctions: (() => void)[]; // Для грида
  private modalCleanupFunctions: (() => void)[];  // Для модалки
  private canvasCleanupFunctions: (() => void)[]; // Для canvas

  constructor() {
    this.navigationManager = new NavigationManager();
    this.capsulesGrid = new UICapsulesGrid({
      onAdd: () => this.handleAddCapsuleClick(),
      onView: (id) => this.handleViewCapsule(id),
      onDelete: (id) => this.handleDeleteCapsule(id)
    });
  }
  
  // === ПУБЛИЧНЫЕ МЕТОДЫ ===
  
  async handleCapsulesOpen(): Promise<void> {
    this.mode = 'grid';
    await this.loadCapsules();
    this.capsulesGrid.render(this.capsules);
  }
  
  // === СОЗДАНИЕ НОВОЙ КАПСУЛЫ ===
  
  private async handleAddCapsuleClick(): Promise<void> {
    this.mode = 'selection';
    this.currentCapsuleId = null;
    
    await this.loadWardrobeItems();
    
    // Создаем модалку
    this.clothingModal = new UIClothingSelectionModal({
      wardrobeItems: this.wardrobeItems,
      onConfirm: (selectedItems) => this.handleClothingConfirmed(selectedItems),
      onCancel: () => this.handleClothingCancelled()
    });
    
    this.clothingModal.show();
  }
  
  private handleClothingConfirmed(selectedItems: WardrobeItem[]): void {
    this.mode = 'canvas';
    
    // Скрываем модалку
    this.clothingModal?.hide();
    this.clothingModal?.destroy();
    this.clothingModal = null;
    
    // Инициализируем canvas
    this.initializeCanvasEditor();
    
    // Загружаем выбранные элементы (БЕЗ сохраненных позиций)
    const items: CanvasItem[] = selectedItems.map(item => ({ item }));
    this.canvasEditor!.loadItems(items);
    
    // Настраиваем навигацию (возврат к модалке)
    this.navigationManager.push(() => {
      this.canvasEditor!.hide();
      this.handleAddCapsuleClick(); // Переоткрываем модалку
    }, 'Return to clothing selection');
  }
  
  private handleClothingCancelled(): void {
    this.clothingModal?.destroy();
    this.clothingModal = null;
    this.mode = 'grid';
    this.capsulesGrid.show();
  }
  
  // === РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕЙ КАПСУЛЫ ===
  
  private async handleViewCapsule(capsuleId: number): Promise<void> {
    this.mode = 'canvas';
    this.currentCapsuleId = capsuleId;
    
    // Загружаем данные капсулы
    const capsuleData = await this.loadCapsuleData(capsuleId);
    
    // Инициализируем canvas
    this.initializeCanvasEditor();
    
    // УНИФИЦИРОВАННАЯ ЗАГРУЗКА: восстанавливаем с сохраненными позициями
    await this.canvasEditor!.restoreState(capsuleData.canvasData);
    
    // Настраиваем навигацию (возврат к гриду)
    this.navigationManager.push(() => {
      this.canvasEditor!.hide();
      this.capsulesGrid.show();
    }, 'Return to capsules grid');
  }
  
  // === ИНИЦИАЛИЗАЦИЯ CANVAS EDITOR ===
  
  private initializeCanvasEditor(): void {
    if (this.canvasEditor) {
      // Canvas уже существует - просто показываем
      this.canvasEditor.show();
      return;
    }
    
    // Создаем новый canvas editor
    this.canvasEditor = new UICanvasEditor({
      containerId: 'capsules-canvas-container',
      canvasId: 'capsules-canvas',
      onAddItem: () => this.handleCanvasAddItem(),
      onSave: () => this.handleCanvasSave()
    });
    
    this.canvasEditor.show();
  }
  
  // === ОБРАБОТЧИКИ CANVAS КНОПОК ===
  
  private async handleCanvasAddItem(): Promise<void> {
    // Открываем upload фото
    await this.photoUploadManager.handlePhotoUpload();
    
    // После сохранения нового элемента - событие 'wardrobe:item-saved'
    // Обработчик добавит элемент на canvas
  }
  
  private async handleCanvasSave(): Promise<void> {
    const state = this.canvasEditor!.getState();
    
    if (this.currentCapsuleId) {
      // Обновление существующей капсулы
      await this.updateCapsule(this.currentCapsuleId, state);
    } else {
      // Создание новой капсулы
      await this.createCapsule(state);
    }
    
    // Возврат к гриду
    this.canvasEditor!.hide();
    this.navigationManager.clear();
    this.mode = 'grid';
    await this.loadCapsules();
    this.capsulesGrid.render(this.capsules);
  }
  
  // === ЗАКРЫТИЕ ===
  
  closeCapsules(): void {
    // Очистка навигации
    this.navigationManager.clear();
    
    // Очистка компонентов
    this.canvasEditor?.hide();
    this.canvasEditor?.destroy();
    this.canvasEditor = null;
    
    this.clothingModal?.hide();
    this.clothingModal?.destroy();
    this.clothingModal = null;
    
    this.capsulesGrid.hide();
    
    // Очистка обработчиков
    this.globalCleanupFunctions.forEach(cleanup => cleanup());
    this.globalCleanupFunctions = [];
    
    this.mode = null;
  }
  
  // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===
  
  private async loadWardrobeItems(): Promise<void> { /* ... */ }
  private async loadCapsules(): Promise<void> { /* ... */ }
  private async loadCapsuleData(id: number): Promise<any> { /* ... */ }
  private async createCapsule(state: CanvasState): Promise<void> { /* ... */ }
  private async updateCapsule(id: number, state: CanvasState): Promise<void> { /* ... */ }
  private async handleDeleteCapsule(id: number): Promise<void> { /* ... */ }
}
```

---

### Этап 5: Создание UICapsulesGrid

**Файл:** `client/src/modules/uiCapsulesGrid.ts`

**Ответственность:**
- Отображение грида капсул
- Кнопка "Добавить капсулу"
- Обработка кликов на карточки

**Интерфейс:**
```typescript
interface CapsulesGridConfig {
  onAdd: () => void;
  onView: (capsuleId: number) => void;
  onDelete: (capsuleId: number) => void;
}

class UICapsulesGrid {
  private config: CapsulesGridConfig;
  private cleanupFunctions: (() => void)[];

  constructor(config: CapsulesGridConfig) { }
  
  show(): void { }
  hide(): void { }
  render(capsules: StyleCapsule[]): void { }
  destroy(): void { }
  
  private setupEventListeners(): void { }
  private createCapsuleCard(capsule: StyleCapsule): HTMLElement { }
}
```

---

## 🔄 Последовательность реализации

### Шаг 1: Подготовка (1-2 часа)
- [ ] Создать резервную копию `uiCapsules.ts`
- [ ] Создать новые файлы для классов
- [ ] Настроить импорты и экспорты

### Шаг 2: Создание вспомогательных классов (3-4 часа)
- [ ] Реализовать `NavigationManager`
- [ ] Реализовать `UICapsulesGrid`
- [ ] Протестировать отдельно

### Шаг 3: Создание UIModalManager (5-7 часов)
- [ ] Реализовать базовую структуру с типами модалок
- [ ] Перенести методы Clothing Selection из UICapsulesManager
- [ ] Перенести методы Wardrobe Preview из UIWardrobeManager
- [ ] Унифицировать show/hide/cleanup логику
- [ ] Протестировать оба типа модалок отдельно

### Шаг 4: Создание UICanvasEditor (6-8 часов)
- [ ] Перенести методы инициализации canvas
- [ ] Реализовать унифицированный `loadItems()`
- [ ] Реализовать `restoreState()`
- [ ] Реализовать `addItem()`
- [ ] Тестирование:
  - [ ] Создание новой капсулы (без сохраненных позиций)
  - [ ] Редактирование капсулы (с сохраненными позициями)
  - [ ] Добавление нового элемента на canvas

### Шаг 5: Рефакторинг UICapsulesManager (4-5 часов)
- [ ] Удалить перенесенные методы
- [ ] Интегрировать новые классы
- [ ] Разделить cleanupFunctions на три категории
- [ ] Реализовать управление режимами через `mode`

### Шаг 6: Интеграция и тестирование (3-4 часа)
- [ ] Тестирование полного цикла:
  - [ ] Создание новой капсулы
  - [ ] Редактирование существующей капсулы
  - [ ] Добавление одежды на canvas
  - [ ] Сохранение капсулы
  - [ ] Навигация BackButton
  - [ ] Удаление капсулы
- [ ] Исправление багов
- [ ] Проверка cleanup функций

### Шаг 7: Финализация (1-2 часа)
- [ ] Удалить закомментированный код
- [ ] Обновить документацию
- [ ] Code review
- [ ] Merge в main

**Общее время:** 24-34 часа (увеличено на 2-3 часа из-за расширения UIModalManager)

---

## ⚠️ Риски и меры предосторожности

### Риск 1: Потеря функциональности при миграции
**Мера:** Создать checklist всех методов и проверить перенос каждого

### Риск 2: Проблемы с cleanup функциями
**Мера:** Разделить на три категории (global/modal/canvas) и тестировать каждую отдельно

### Риск 3: Fabric.js lifecycle
**Мера:** Правильная последовательность show() → initialize() → load()

### Риск 4: BackButton conflicts
**Мера:** Использовать NavigationManager с единственным обработчиком

---

## ✅ Критерии успеха

1. ✅ Кнопки "Добавить одежду" и "Сохранить" работают при редактировании
2. ✅ BackButton корректно возвращает:
   - Из canvas к модалке при создании новой капсулы
   - Из canvas к гриду при редактировании капсулы
3. ✅ Сохраненные позиции объектов восстанавливаются при редактировании
4. ✅ Новые объекты располагаются автоматически при создании
5. ✅ Нет memory leaks (обработчики корректно очищаются)
6. ✅ Код разделен на логические модули с четкой ответственностью
7. ✅ Нет дублирования кода между модулями

---

## 📊 Метрики улучшения

### До рефакторинга:
- **Строк кода:** 2237 (один файл)
- **Методов в классе:** ~45
- **Точек входа для canvas:** 2 (разные пути)
- **Обработчиков BackButton:** 3 (несвязанные)
- **Cleanup contexts:** 1 (все вместе)

### После рефакторинга:
- **UICapsulesManager:** ~500 строк (координация)
- **UIClothingSelectionModal:** ~300 строк
- **UICanvasEditor:** ~600 строк
- **UICapsulesGrid:** ~200 строк
- **NavigationManager:** ~100 строк
- **Точек входа для canvas:** 1 (унифицированный)
- **Обработчиков BackButton:** 1 (централизованный)
- **Cleanup contexts:** 3 (раздельные)

**Итого:** Код разделен на 5 файлов по ~300-600 строк каждый

---

## 🐛 Исправление текущего бага (временное решение)

Если нужно быстро исправить баг до рефакторинга:

**Проблема:** `setupCanvasAddButton()` и `setupCanvasSaveButton()` добавляют обработчики в `cleanupFunctions`, которые удаляются при `closeCapsules()`

**Решение:**
```typescript
// В UICapsulesManager добавить:
private canvasCleanupFunctions: (() => void)[] = [];

// В setupCanvasAddButton() и setupCanvasSaveButton():
// Заменить this.cleanupFunctions.push(...)
// На this.canvasCleanupFunctions.push(...)

// В hideCanvas():
private hideCanvas(): void {
  const canvasContainer = document.getElementById('capsules-canvas-container') as HTMLElement;
  if (canvasContainer) {
    canvasContainer.classList.add('hidden');
    this.isCanvasVisible = false;
  }

  // Скрываем кнопку сохранения
  const saveBtn = document.getElementById('canvas-save-capsule-btn') as HTMLElement;
  if (saveBtn) {
    saveBtn.classList.add('hidden');
  }

  // Очищаем ТОЛЬКО canvas обработчики
  this.canvasCleanupFunctions.forEach(cleanup => {
    try {
      cleanup();
    } catch (error) {
      logger.error('Error during canvas cleanup', error);
    }
  });
  this.canvasCleanupFunctions = [];

  // Очищаем Fabric.js canvas
  if (this.fabricCanvas) {
    this.fabricCanvas.dispose();
    this.fabricCanvas = null;
  }
}

// В closeCapsules() НЕ трогать canvasCleanupFunctions
```

Это исправит баг, но не решит проблему архитектуры.

---

## 📝 Дополнительные заметки

### Обратная совместимость
- Публичный API `UICapsulesManager` не должен измениться
- `uiCapsulesManager.handleCapsulesOpen()` остается точкой входа
- `uiCapsulesManager.closeCapsules()` остается точкой выхода

### Будущие улучшения (после рефакторинга)
- [ ] Добавить анимации переходов между режимами
- [ ] Реализовать undo/redo для canvas
- [ ] Добавить zoom и pan для canvas
- [ ] Реализовать drag-and-drop из модалки на canvas
- [ ] Добавить naming для капсул (сейчас генерируется автоматически)

---

## 🎬 Заключение

Рефакторинг решит основные проблемы:
1. ✅ **Баг с кнопками исправлен** через разделение cleanup contexts
2. ✅ **Унифицированная работа с canvas** через единый метод loadItems()
3. ✅ **Централизованная навигация** через NavigationManager
4. ✅ **Модульная архитектура** с четким разделением ответственности
5. ✅ **Упрощение поддержки** за счет меньших классов

Код станет более читаемым, тестируемым и расширяемым.

---

**Готов к началу реализации после согласования плана.**
