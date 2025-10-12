# Рефакторинг модулей Capsules и Wardrobe - Анализ и Рекомендации

## 📊 Текущее состояние

### Размеры файлов (строки кода)
```
uiCapsules.ts          1094 строк  ⚠️ БОЛЬШОЙ
uiWardrobe.ts           708 строк  ⚠️ СРЕДНИЙ
uiModalManager.ts       626 строк  ⚠️ СРЕДНИЙ
uiCanvasEditor.ts       737 строк  ⚠️ СРЕДНИЙ
photoUploadManager.ts   134 строк  ✅ НОРМАЛЬНЫЙ
dataCache.ts            381 строк  ✅ НОРМАЛЬНЫЙ
```

**Проблема:** `uiCapsules.ts` слишком большой (1094 строк) и берет на себя слишком много ответственности.

---

## 🔍 Анализ дублирования кода

### 1. **Дублирование: Загрузка данных с fallback на кэш**

**Локация:** `uiWardrobe.ts`, `uiCapsules.ts`

**Дублируется:**
```typescript
// В uiWardrobe.ts::loadWardrobeItems()
// В uiCapsules.ts::loadWardrobeItems()
// В uiCapsules.ts::loadCapsules()

// Один и тот же паттерн:
if (dataCacheManager.isDataLoaded()) {
  this.items = dataCacheManager.getItems();
  return;
}

if (dataCacheManager.isDataLoading()) {
  // Ждем максимум 3 секунды
  while (dataCacheManager.isDataLoading() && ...) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Fallback на сервер
const response = await fetch(`/api/...`);
```

**Повторяется:** 3 раза с минимальными изменениями

**Рекомендация:** ✅ Вынести в `dataCache.ts` как универсальный метод

---

### 2. **Дублирование: Обработка фото с классификацией**

**Локация:** `uiWardrobe.ts`, `uiCapsules.ts`

**Дублируется:**
```typescript
// createPhotoUploadHandler() - почти идентичная логика в обоих файлах:
// - processPhotoWithBackgroundRemoval
// - fileToBase64
// - stringToClothingCategory
// - handlePhotoPreviewConfirm
// - handlePhotoPreviewCancel
```

**Детали дублирования:**

| Метод | uiWardrobe.ts | uiCapsules.ts | Идентичность |
|-------|---------------|---------------|--------------|
| `fileToBase64()` | ✅ Есть | ✅ Есть | 100% |
| `stringToClothingCategory()` | ✅ Есть | ✅ Есть | 100% |
| `processPhotoWithBackgroundRemoval()` | ✅ Есть | ✅ Есть | 95% |
| `handlePhotoPreviewConfirm()` | ✅ Есть | ✅ Есть | 85% |

**Рекомендация:** ✅ Вынести общий код в `photoUploadManager.ts`

---

### 3. **Дублирование: Работа с API запросами**

**Локация:** `uiWardrobe.ts`, `uiCapsules.ts`, `dataCache.ts`

**Дублируется:**
```typescript
// Паттерн API запроса повторяется 10+ раз:
const initData = (window as any).Telegram?.WebApp?.initData || '';

const response = await fetch(`/api/...`, {
  method: 'GET/POST/PUT/DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ initData, ...data })
});

if (!response.ok) {
  throw new Error(`Server error: ${response.status}`);
}

const result = await response.json();

if (!result.success) {
  throw new Error(result.error || 'Failed to ...');
}
```

**Рекомендация:** ⚠️ Использовать существующий `api.ts`, но он не используется в этих модулях!

---

### 4. **Дублирование: WardrobeItem интерфейс**

**Локация:** Определен в **4 разных местах**

```typescript
// 1. uiWardrobe.ts (строка 14)
interface WardrobeItem { ... }

// 2. photoUploadManager.ts (строка 11) ✅ экспортируется
export interface WardrobeItem { ... }

// 3. dataCache.ts (строка 11) ✅ экспортируется
export interface WardrobeItem { ... }

// 4. uiCapsules.ts - импортируется из photoUploadManager
import { WardrobeItem } from './photoUploadManager';
```

**Проблема:** Дублирование типов приводит к рассинхронизации

**Рекомендация:** ✅ Создать `types/wardrobe.ts` с единым источником правды

---

## 🏗️ Архитектурные проблемы

### Проблема 1: **Бог-объект `uiCapsules.ts`**

**Ответственность UICapsulesManager (1094 строк):**
1. Управление гридом капсул
2. Управление модальным окном выбора одежды
3. Управление canvas редактором
4. Обработка фото загрузки
5. Классификация одежды
6. API запросы (CRUD капсул)
7. API запросы (чтение гардероба)
8. Управление состоянием (mode, selectedItems)
9. Навигация (BackButton)
10. Event handling (wardrobe:item-saved)

**Нарушает:** Single Responsibility Principle

**Рекомендация:** Разделить на несколько модулей (см. ниже)

---

### Проблема 2: **Прямые fetch вместо API клиента**

**Текущая ситуация:**
- Есть готовый `api.ts` с методами `get()`, `post()`, `put()`, `delete()`
- Но `uiWardrobe.ts` и `uiCapsules.ts` напрямую используют `fetch()`

**Проблемы:**
- Дублирование логики обработки ошибок
- Нет централизованного логирования запросов
- Сложно добавить retry логику или interceptors
- Неконсистентная обработка `initData`

**Рекомендация:** ✅ Мигрировать на `api.ts`

---

### Проблема 3: **Смешивание UI и бизнес-логики**

**Примеры:**
- `uiCapsules.ts` содержит и UI логику (модалки, canvas) и бизнес-логику (CRUD, сортировка)
- `uiWardrobe.ts` содержит и рендеринг грида и API запросы

**Рекомендация:** Разделить на слои (см. предложенную архитектуру)

---

## ✨ Предложенная архитектура

### Новая структура модулей

```
modules/
├── wardrobe/
│   ├── WardrobeManager.ts          // Координатор (100-150 строк)
│   ├── WardrobeGrid.ts             // UI грида (200-250 строк)
│   ├── WardrobeService.ts          // API запросы (100-150 строк)
│   └── types.ts                    // Типы и интерфейсы
│
├── capsules/
│   ├── CapsulesManager.ts          // Координатор (150-200 строк)
│   ├── CapsulesGrid.ts             // ✅ Уже есть (UICapsulesGrid)
│   ├── CapsulesService.ts          // API запросы (150-200 строк)
│   ├── CapsulesCanvas.ts           // ✅ Уже есть (UICanvasEditor)
│   └── types.ts                    // Типы и интерфейсы
│
├── shared/
│   ├── PhotoProcessor.ts           // 🆕 Обработка фото (200-250 строк)
│   ├── ItemSelector.ts             // 🆕 Выбор вещей (150-200 строк)
│   ├── DataLoader.ts               // 🆕 Загрузка с кэшем (100-150 строк)
│   └── types.ts                    // Общие типы
│
├── uiModalManager.ts               // ✅ Оставить как есть
├── dataCache.ts                    // ✅ Расширить функционал
└── api.ts                          // ✅ Использовать везде
```

---

## 🔧 Детальный план рефакторинга

### Этап 1: Создание общих сервисов (2-3 часа)

#### 1.1. Создать `modules/shared/types.ts`

```typescript
/**
 * Единый источник правды для типов
 */
export interface WardrobeItem {
  id: number;
  imageUrl: string;
  name?: string;
  category?: ClothingCategory;
  color?: string;
  material?: string;
  style?: string;
  fit?: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

export enum ClothingCategory {
  OUTERWEAR = 'OUTERWEAR',
  INNERWEAR = 'INNERWEAR',
  BODYWEAR = 'BODYWEAR',
  // ... остальные
}

export interface Capsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  items: CapsuleItem[];
  createdAt: string;
}

export interface CapsuleItem {
  id: number;
  wardrobeItemId: number;
  wardrobeItem: WardrobeItem;
}
```

**Миграция:**
- Заменить все импорты на `@/modules/shared/types`
- Удалить дублирующие определения

---

#### 1.2. Создать `modules/shared/DataLoader.ts`

```typescript
/**
 * Универсальный загрузчик данных с fallback на кэш
 */
export class DataLoader {
  /**
   * Загрузить данные с умным fallback
   */
  async loadWithCacheFallback<T>(
    cacheKey: 'wardrobe' | 'capsules',
    apiEndpoint: string
  ): Promise<T[]> {
    // Проверяем кэш
    if (dataCacheManager.isDataLoaded()) {
      return this.getFromCache<T>(cacheKey);
    }

    // Ждем загрузку кэша
    if (dataCacheManager.isDataLoading()) {
      await this.waitForCache(3000);
      if (dataCacheManager.isDataLoaded()) {
        return this.getFromCache<T>(cacheKey);
      }
    }

    // Fallback на сервер
    return this.loadFromServer<T>(apiEndpoint);
  }

  private async waitForCache(maxWaitMs: number): Promise<void> {
    // ... реализация ожидания
  }

  private getFromCache<T>(cacheKey: string): T[] {
    // ... получение из кэша
  }

  private async loadFromServer<T>(endpoint: string): Promise<T[]> {
    // Используем api.ts
    const response = await api.get(endpoint);
    return response.data;
  }
}

export const dataLoader = new DataLoader();
```

**Использование:**
```typescript
// В uiWardrobe.ts
const items = await dataLoader.loadWithCacheFallback<WardrobeItem>(
  'wardrobe',
  '/wardrobe'
);

// В uiCapsules.ts
const capsules = await dataLoader.loadWithCacheFallback<Capsule>(
  'capsules',
  '/capsules'
);
```

**Преимущества:**
- ✅ Убирает 200+ строк дублирующего кода
- ✅ Единая точка для изменения логики загрузки
- ✅ Легко добавить retry, offline режим и т.д.

---

#### 1.3. Создать `modules/shared/PhotoProcessor.ts`

```typescript
/**
 * Универсальный процессор фото
 * Выносим ВСЮ логику обработки фото из ui модулей
 */
export class PhotoProcessor {
  /**
   * Конвертировать файл в base64
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Классифицировать одежду и удалить фон
   */
  async classifyAndRemoveBackground(imageBase64: string): Promise<{
    processedImage: string;
    classification: ClassificationResult;
  }> {
    const response = await api.post('/classify-clothing', {
      image_base64: imageBase64
    });

    return {
      processedImage: response.processed_image_base64,
      classification: {
        category: this.stringToCategory(response.classification.category),
        color: response.classification.color,
        material: response.classification.material,
        style: response.classification.style,
        fit: response.classification.fit,
        description: response.classification.description
      }
    };
  }

  /**
   * Сохранить вещь в гардероб
   */
  async saveToWardrobe(
    imageBase64: string,
    classification: ClassificationResult
  ): Promise<WardrobeItem> {
    const response = await api.post('/wardrobe', {
      imageBase64,
      category: classification.category,
      color: classification.color,
      material: classification.material,
      style: classification.style,
      fit: classification.fit,
      description: classification.description
    });

    return response.item;
  }

  private stringToCategory(category: string): ClothingCategory {
    // ... конверсия
  }
}

export const photoProcessor = new PhotoProcessor();
```

**Использование:**
```typescript
// В uiWardrobe.ts или uiCapsules.ts
const base64 = await photoProcessor.fileToBase64(file);
const result = await photoProcessor.classifyAndRemoveBackground(base64);
const item = await photoProcessor.saveToWardrobe(result.processedImage, result.classification);

// Отправляем событие
window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
  detail: { item }
}));
```

**Преимущества:**
- ✅ Убирает 400+ строк дублирующего кода
- ✅ Легко тестировать изолированно
- ✅ Единая точка для изменения логики обработки фото

---

### Этап 2: Разделение `uiCapsules.ts` (3-4 часа)

#### 2.1. Создать `modules/capsules/CapsulesService.ts`

```typescript
/**
 * Бизнес-логика для работы с капсулами
 * Все API запросы вынесены сюда
 */
export class CapsulesService {
  /**
   * Загрузить все капсулы
   */
  async loadCapsules(): Promise<Capsule[]> {
    return dataLoader.loadWithCacheFallback<Capsule>(
      'capsules',
      '/capsules'
    );
  }

  /**
   * Загрузить конкретную капсулу
   */
  async loadCapsule(id: number): Promise<Capsule> {
    const response = await api.get(`/capsules/${id}`);
    return response.capsule;
  }

  /**
   * Создать капсулу
   */
  async createCapsule(data: {
    name: string;
    canvasData: any;
    thumbnailImage: string;
    itemIds: number[];
  }): Promise<Capsule> {
    const response = await api.post('/capsules', data);
    
    // Обновляем кэш
    dataCacheManager.addCapsule(response.capsule);
    
    return response.capsule;
  }

  /**
   * Обновить капсулу
   */
  async updateCapsule(id: number, data: {
    canvasData: any;
    thumbnailImage: string;
    itemIds: number[];
  }): Promise<Capsule> {
    const response = await api.put(`/capsules/${id}`, data);
    
    // Обновляем кэш
    dataCacheManager.updateCapsule(id, response.capsule);
    
    return response.capsule;
  }

  /**
   * Удалить капсулу
   */
  async deleteCapsule(id: number): Promise<void> {
    await api.delete(`/capsules/${id}`);
    
    // Обновляем кэш
    dataCacheManager.removeCapsule(id);
  }

  /**
   * Сортировать вещи по слоям
   */
  sortItemsByLayer(items: WardrobeItem[]): WardrobeItem[] {
    const layerOrder: Record<string, number> = {
      'LEGWEAR': 1,
      'BODYWEAR': 2,
      // ...
    };

    return items.sort((a, b) => {
      const aLayer = layerOrder[a.category?.toUpperCase() || ''] || 99;
      const bLayer = layerOrder[b.category?.toUpperCase() || ''] || 99;
      return aLayer - bLayer;
    });
  }
}

export const capsulesService = new CapsulesService();
```

**Преимущества:**
- ✅ Чистое разделение UI и бизнес-логики
- ✅ Легко тестировать API запросы
- ✅ Легко переиспользовать в других модулях

---

#### 2.2. Обновить `modules/capsules/CapsulesManager.ts`

```typescript
/**
 * Координатор капсул (упрощенный)
 * Только оркестрация компонентов
 */
export class CapsulesManager {
  private capsulesGrid: UICapsulesGrid;
  private canvasEditor: UICanvasEditor | null = null;
  private mode: CapsuleMode = 'grid';
  
  constructor() {
    this.capsulesGrid = new UICapsulesGrid({
      onAdd: () => this.handleAdd(),
      onView: (id) => this.handleView(id),
      onDelete: (id) => this.handleDelete(id)
    });
  }

  async handleCapsulesOpen(): Promise<void> {
    this.mode = 'grid';
    
    // Используем сервис
    const capsules = await capsulesService.loadCapsules();
    
    this.capsulesGrid.show();
    this.capsulesGrid.render(capsules);
  }

  private async handleAdd(): Promise<void> {
    // Загружаем гардероб через сервис
    const wardrobeItems = await dataLoader.loadWithCacheFallback<WardrobeItem>(
      'wardrobe',
      '/wardrobe'
    );

    // Показываем модалку
    uiModalManager.showClothingSelectionModal({
      wardrobeItems,
      onConfirm: (items) => this.handleItemsSelected(items)
    });
  }

  private async handleView(id: number): Promise<void> {
    // Загружаем капсулу через сервис
    const capsule = await capsulesService.loadCapsule(id);
    
    // Показываем на canvas
    this.showOnCanvas(capsule);
  }

  private async handleDelete(id: number): Promise<void> {
    await capsulesService.deleteCapsule(id);
    
    // Обновляем UI
    const capsules = await capsulesService.loadCapsules();
    this.capsulesGrid.render(capsules);
  }

  // ... остальные методы координации
}
```

**Результат:**
- ✅ Уменьшается с 1094 до ~300-400 строк
- ✅ Фокус только на координации компонентов
- ✅ Бизнес-логика вынесена в сервисы

---

### Этап 3: Унификация `uiWardrobe.ts` (2-3 часа)

#### 3.1. Создать `modules/wardrobe/WardrobeService.ts`

```typescript
/**
 * Бизнес-логика для работы с гардеробом
 */
export class WardrobeService {
  async loadWardrobe(): Promise<WardrobeItem[]> {
    return dataLoader.loadWithCacheFallback<WardrobeItem>(
      'wardrobe',
      '/wardrobe'
    );
  }

  async deleteItem(id: number): Promise<void> {
    await api.delete(`/wardrobe/${id}`);
    dataCacheManager.removeWardrobeItem(id);
  }

  filterByCategory(items: WardrobeItem[], category: string): WardrobeItem[] {
    if (category === 'ALL') return items;
    return items.filter(item => item.category?.toUpperCase() === category);
  }
}

export const wardrobeService = new WardrobeService();
```

---

### Этап 4: Миграция на `api.ts` (1-2 часа)

#### 4.1. Расширить `api.ts` методами для капсул и гардероба

```typescript
// В api.ts
class TgStyleApi extends ApiClient {
  // Wardrobe
  async getWardrobe(): Promise<WardrobeItem[]> {
    return this.get('/wardrobe');
  }

  async createWardrobeItem(data: CreateWardrobeItemDto): Promise<WardrobeItem> {
    return this.post('/wardrobe', data);
  }

  async deleteWardrobeItem(id: number): Promise<void> {
    return this.delete(`/wardrobe/${id}`);
  }

  // Capsules
  async getCapsules(): Promise<Capsule[]> {
    return this.get('/capsules');
  }

  async getCapsule(id: number): Promise<Capsule> {
    return this.get(`/capsules/${id}`);
  }

  async createCapsule(data: CreateCapsuleDto): Promise<Capsule> {
    return this.post('/capsules', data);
  }

  async updateCapsule(id: number, data: UpdateCapsuleDto): Promise<Capsule> {
    return this.put(`/capsules/${id}`, data);
  }

  async deleteCapsule(id: number): Promise<void> {
    return this.delete(`/capsules/${id}`);
  }
}
```

#### 4.2. Удалить все прямые `fetch()` вызовы

**Было (в каждом модуле):**
```typescript
const initData = (window as any).Telegram?.WebApp?.initData || '';
const response = await fetch(`/api/wardrobe`, {
  method: 'GET',
  headers: { ... }
});
// 20 строк обработки...
```

**Стало:**
```typescript
const items = await api.getWardrobe();
```

**Результат:** Убирается ~300 строк дублирующего кода

---

## 📈 Итоговые метрики после рефакторинга

### Было:
```
uiCapsules.ts          1094 строк  ⚠️
uiWardrobe.ts           708 строк  ⚠️
uiModalManager.ts       626 строк
uiCanvasEditor.ts       737 строк
photoUploadManager.ts   134 строк
dataCache.ts            381 строк
────────────────────────────────
ИТОГО:                 3680 строк
```

### Станет:
```
# Capsules
CapsulesManager.ts      ~300 строк  ✅ (-794)
CapsulesService.ts      ~150 строк  🆕
CapsulesGrid.ts          200 строк  (уже есть)
CapsulesCanvas.ts        737 строк  (уже есть)

# Wardrobe
WardrobeManager.ts      ~250 строк  ✅ (-458)
WardrobeService.ts      ~100 строк  🆕
WardrobeGrid.ts         ~250 строк  🆕 (выделить из Manager)

# Shared
PhotoProcessor.ts       ~200 строк  🆕
DataLoader.ts           ~100 строк  🆕
types.ts                 ~50 строк  🆕

# Existing (без изменений)
uiModalManager.ts        626 строк
dataCache.ts             381 строк  (+50 новых методов)
────────────────────────────────
ИТОГО:                 ~3344 строк  ✅ (-336 строк, -9%)
```

### Но главное - не количество, а качество:

**Улучшения:**
- ✅ Каждый файл < 400 строк (легко читать)
- ✅ Single Responsibility для каждого класса
- ✅ Нет дублирования кода
- ✅ Легко тестировать (изолированные сервисы)
- ✅ Легко расширять (четкие границы)
- ✅ Единый API клиент
- ✅ Единые типы

---

## 🎯 Приоритезация задач

### Must Have (Критично):
1. ✅ **Создать `shared/types.ts`** - унифицировать типы (30 мин)
2. ✅ **Создать `shared/DataLoader.ts`** - убрать дублирование загрузки (1 час)
3. ✅ **Миграция на `api.ts`** - убрать прямые fetch (2 часа)

### Should Have (Важно):
4. ✅ **Создать `shared/PhotoProcessor.ts`** - вынести обработку фото (2 часа)
5. ✅ **Создать `CapsulesService.ts`** - бизнес-логика капсул (2 часа)
6. ✅ **Создать `WardrobeService.ts`** - бизнес-логика гардероба (1 час)

### Nice to Have (Желательно):
7. ⚠️ **Разделить `CapsulesManager`** - координатор + UI (3 часа)
8. ⚠️ **Разделить `WardrobeManager`** - координатор + грид (2 часа)

**Общее время:** ~13-15 часов работы

---

## 🚀 Быстрые победы (Quick Wins)

Если нет времени на полный рефакторинг, можно сделать минимальные изменения:

### Quick Win #1: Унифицировать типы (30 минут)

```typescript
// Создать client/src/types/wardrobe.ts
export interface WardrobeItem { ... }
export enum ClothingCategory { ... }

// Заменить все импорты
import { WardrobeItem } from '@/types/wardrobe';
```

**Результат:** Убирает дублирование типов, единый источник правды

---

### Quick Win #2: Вынести `fileToBase64` в утилиты (15 минут)

```typescript
// Создать client/src/utils/image.ts
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Использовать везде
import { fileToBase64 } from '@/utils/image';
```

**Результат:** Убирает 30 строк дублирования

---

### Quick Win #3: Добавить методы в `dataCache.ts` (1 час)

```typescript
// В dataCache.ts
class DataCacheManager {
  /**
   * Универсальная загрузка с fallback
   */
  async loadWithFallback<T>(
    cacheGetter: () => T[],
    serverLoader: () => Promise<T[]>
  ): Promise<T[]> {
    if (this.isDataLoaded()) {
      return cacheGetter();
    }

    if (this.isDataLoading()) {
      await this.waitForLoad();
      if (this.isDataLoaded()) {
        return cacheGetter();
      }
    }

    return serverLoader();
  }

  private async waitForLoad(maxMs: number = 3000): Promise<void> {
    const start = Date.now();
    while (this.isDataLoading() && (Date.now() - start) < maxMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Использование
const items = await dataCacheManager.loadWithFallback(
  () => dataCacheManager.getWardrobeItems(),
  () => this.loadFromServer()
);
```

**Результат:** Убирает 150 строк дублирующей логики ожидания кэша

---

## ⚠️ Риски и предостережения

### Риск 1: Breaking Changes

**Проблема:** Изменение архитектуры может сломать существующий код

**Митигация:**
- Делать рефакторинг поэтапно
- Сохранять обратную совместимость через facades
- Тестировать после каждого этапа

### Риск 2: Увеличение количества файлов

**Проблема:** С 6 файлов станет ~15 файлов

**Митигация:**
- Четкая структура папок
- Хорошие названия файлов
- index.ts для реэкспорта

### Риск 3: Время на рефакторинг

**Проблема:** 13-15 часов работы

**Митигация:**
- Начать с Quick Wins (2 часа, большая польза)
- Делать поэтапно по приоритету
- Измерять результаты на каждом этапе

---

## 📝 Выводы и рекомендации

### Главные проблемы текущего кода:

1. ⚠️ **Дублирование:** ~500 строк повторяющегося кода
2. ⚠️ **Бог-объекты:** `uiCapsules.ts` слишком большой (1094 строк)
3. ⚠️ **Смешение ответственностей:** UI + бизнес-логика + API в одном файле
4. ⚠️ **Нет переиспользования:** `api.ts` не используется
5. ⚠️ **Дублирование типов:** `WardrobeItem` определен 4 раза

### Что делать в первую очередь:

**Минимальный план (2-3 часа):**
1. ✅ Создать `shared/types.ts` - унифицировать типы
2. ✅ Добавить `loadWithFallback` в `dataCache.ts`
3. ✅ Вынести `fileToBase64` в утилиты

**Результат:** Убирается ~200 строк дублирования, код становится чище

**Полный план (13-15 часов):**
1. Создать все `shared/` модули
2. Создать все `*Service.ts` модули
3. Упростить координаторы
4. Мигрировать на `api.ts`

**Результат:** Современная архитектура, легкая поддержка, масштабируемость

### Мое мнение:

Код **работает хорошо**, но **сложен в поддержке**. Рекомендую:
- **Краткосрочно:** Quick Wins (2-3 часа)
- **Среднесрочно:** Полный рефакторинг (13-15 часов)

Вложения окупятся при первом же добавлении новой фичи! 🚀

---

**Дата анализа:** 2025-01-12  
**Версия:** 1.0  
**Автор:** AI Code Reviewer
