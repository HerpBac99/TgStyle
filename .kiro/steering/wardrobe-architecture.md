# Архитектура модуля Гардероба

## Обзор

Модуль гардероба отвечает за:
- Добавление вещей через фото (с классификацией AI)
- Отображение и фильтрацию вещей
- Редактирование и удаление вещей
- Оптимистичное обновление UI
- Кэширование данных

## Ключевые компоненты

### 1. WardrobeManager (`client/src/modules/wardrobe/WardrobeManager.ts`)

**Роль**: Координатор UI и бизнес-логики

**Основные методы**:
- `handleWardrobeOpen(prefix)` - открытие гардероба (основной или модальный)
- `handlePhotoUpload(onItemAdded?)` - загрузка фото через input
- `processPhotoWithBackgroundRemoval(file)` - обработка фото через FastVLM
- `showPreviewModal(existingItem?)` - показ модального окна предпросмотра
- `confirmPreview()` - сохранение новой вещи (оптимистичное создание)
- `updateExistingItem(item)` - обновление существующей вещи
- `removeItem(itemId)` - удаление вещи
- `renderGrid(withAnimation, gridId)` - отрисовка грида вещей
- `createItemCard(item)` - создание карточки вещи с обработчиками

**Важные особенности**:
- Singleton паттерн: `export const wardrobeManager = new WardrobeManager()`
- Оптимистичное создание: вещь добавляется в UI сразу, затем синхронизируется с сервером
- Поддержка двух режимов: основной гардероб и модальное окно (для капсул)
- Долгое нажатие (600ms) для удаления, короткое для просмотра/выбора

### 2. WardrobeService (`client/src/modules/wardrobe/WardrobeService.ts`)

**Роль**: Бизнес-логика и API запросы

**Основные методы**:
- `loadWardrobe()` - загрузка с кэша или сервера
- `addItem(imageData, classification)` - создание вещи на сервере
- `updateItem(itemId, updates)` - обновление вещи
- `deleteItem(itemId)` - удаление вещи
- `filterByCategory(items, category)` - фильтрация по категории

**Важные особенности**:
- Singleton: `export const wardrobeService = new WardrobeService()`
- Оптимизирует изображение перед отправкой на сервер (PNG для прозрачности)
- Использует DataLoader для кэширования

### 3. PhotoProcessor (`client/src/modules/shared/PhotoProcessor.ts`)

**Роль**: Обработка фотографий через FastVLM

**Основные методы**:
- `classifyAndRemoveBackground(imageBase64)` - классификация + удаление фона
- `optimizeForClassification(base64Image)` - оптимизация для отправки на FastVLM (800px, JPEG 80%)
- `saveToWardrobe(imageBase64, classification)` - сохранение в гардероб

**Важные особенности**:
- Singleton: `export const photoProcessor = new PhotoProcessor()`
- Оптимизирует изображение ДО отправки на FastVLM (97% сжатие)
- Возвращает processed_image_base64 с удаленным фоном

### 4. DataCacheManager (`client/src/modules/dataCache.ts`)

**Роль**: Кэширование данных в памяти и localStorage

**Основные методы**:
- `getWardrobeItems()` - получить вещи из кэша
- `addWardrobeItem(item)` - добавить вещь в кэш
- `removeWardrobeItem(itemId)` - удалить вещь из кэша
- `updateWardrobeItemFields(itemId, updates)` - обновить поля вещи
- `replaceOptimisticItem(oldId, newItem)` - заменить временную вещь на реальную
- `saveWardrobeCacheToStorage()` - сохранить в localStorage (без base64!)

**Важные особенности**:
- Singleton: `export const dataCacheManager = new DataCacheManager()`
- Кэширует только первые 30 вещей в localStorage
- Фильтрует base64 изображения при сохранении (чтобы не переполнить localStorage)
- Предзагружает изображения в браузерный кэш

### 5. UIModalManager (`client/src/modules/uiModalManager.ts`)

**Роль**: Управление модальными окнами

**Основные методы**:
- `showItemModal(config)` - показать модальное окно вещи
- `showLoadingInModal(show)` - показать/скрыть loading
- `getCurrentModalData()` - получить текущие данные из модального окна
- `hide()` - скрыть модальное окно

**Важные особенности**:
- Singleton: `export const uiModalManager = new UIModalManager()`
- Поддерживает редактирование категории, цвета, материала
- Callbacks: onDataChange, onConfirm, onCancel

## Поток данных при добавлении вещи

### 1. Загрузка фото
```
User clicks "+" button
  → WardrobeManager.handlePhotoUpload()
    → Creates <input type="file">
    → User selects photo
    → WardrobeManager.processPhotoWithBackgroundRemoval(file)
```

### 2. Обработка фото
```
WardrobeManager.processPhotoWithBackgroundRemoval(file)
  → fileToBase64(file) // ~5-10 MB
  → PhotoProcessor.classifyAndRemoveBackground(base64)
    → PhotoProcessor.optimizeForClassification(base64) // 800px, JPEG 80% → ~200 KB
    → api.classifyClothing(optimizedImage) // → FastVLM server
      → FastVLM: анализ (1-2s) + удаление фона (1s) + постобработка (2s)
      → Returns: { processed_image_base64, classification }
  → WardrobeManager.showPreviewModal() // Показываем результат
```

### 3. Сохранение вещи (оптимистичное)
```
User clicks "✓" (confirm)
  → WardrobeManager.confirmPreview()
    → Создает optimisticItem с временным ID (Date.now())
    → wardrobeItems.unshift(optimisticItem) // Добавляем в начало
    → dataCacheManager.addWardrobeItem(optimisticItem)
    → renderGrid(false, currentGridId) // Мгновенная отрисовка
    
    → В фоне: WardrobeService.addItem(imageBase64, classification)
      → optimizeImageForUpload(imageBase64, 1200) // PNG для прозрачности
      → api.post('/wardrobe', { imageBase64: optimizedImage, ...classification })
        → Server: saveImageToDisk()
          → Sharp: проверяет hasAlpha
          → Если прозрачность → PNG, иначе → JPEG
          → Сохраняет в server/uploads/wardrobe/{telegramId}/
        → Returns: { item: { id, imageUrl, ...fields } }
      
      → Заменяем временную вещь на реальную:
        → wardrobeItems[tempIndex] = serverItem
        → dataCacheManager.replaceOptimisticItem(tempId, serverItem)
        → updateItemIdInDOM(tempId, realId, imageUrl) // Без перерисовки!
```

## Поток данных при редактировании вещи

```
User clicks on item card (short press)
  → WardrobeManager.showPreviewModal(existingItem)
    → Сохраняет originalItemData для сравнения
    → uiModalManager.showItemModal({ existingItem, allowEditCategory: true })
    
User edits fields and clicks "✓"
  → WardrobeManager.updateExistingItem(item)
    → Сравнивает с originalItemData
    → Если есть изменения:
      → Обновляет локально: wardrobeItems[index] = { ...item, ...updates }
      → renderGrid(false, currentGridId) // Мгновенная отрисовка
      → В фоне: wardrobeService.updateItem(itemId, updates)
        → dataCacheManager.updateWardrobeItemFields(itemId, updates)
        → api.updateWardrobeItem(itemId, updates)
```

## Поток данных при удалении вещи

```
User long-presses item card (600ms)
  → WardrobeManager.removeItem(itemId)
    → confirm('Удалить этот предмет из гардероба?')
    → wardrobeService.deleteItem(itemId)
      → api.deleteWardrobeItem(itemId)
      → Server: deleteImageFromDisk()
      → dataCacheManager.removeWardrobeItem(itemId)
    → wardrobeItems.splice(index, 1)
    → renderGrid(false, currentGridId)
```

## Два режима работы гардероба

### 1. Основной гардероб (prefix: 'wardrobe')
- Открывается через таб "Мой гардероб"
- Короткое нажатие → превью вещи
- Долгое нажатие → удаление

### 2. Модальное окно капсулы (prefix: 'capsules-modal')
- Открывается при создании/редактировании капсулы
- Короткое нажатие → выделение вещи (toggle)
- Долгое нажатие → удаление
- События: `wardrobe:item-selection-toggle` для связи с CapsulesManager

## Оптимизация изображений

### Клиент

**Для классификации** (`PhotoProcessor.optimizeForClassification`):
- Размер: 800px (max dimension)
- Формат: JPEG
- Качество: 80%
- Цель: быстрая передача на FastVLM (~200 KB вместо 10 MB)

**Для сохранения** (`optimizeImageForUpload`):
- Размер: 1200px (max width)
- Формат: PNG (всегда, для сохранения прозрачности)
- Цель: сохранить прозрачный фон от FastVLM

### Сервер

**Wardrobe** (`server/src/api/wardrobe.js`):
- Проверяет hasAlpha через Sharp
- Если прозрачность → PNG (quality 90, compressionLevel 9)
- Иначе → JPEG (quality 85, progressive)
- Размер: 1200x1200 (fit: inside)

**Capsules** (`server/src/api/capsules.js`):
- Аналогично wardrobe
- Размер: 800x800 (thumbnails)

**Analysis** (`server/src/utils/fileStorage.js`):
- Аналогично wardrobe
- Размер: 1200x1200

## Кэширование

### В памяти (DataCacheManager)
- Все вещи пользователя
- Мгновенный доступ
- Обновляется при каждом изменении

### localStorage
- Первые 30 вещей
- Без base64 изображений (только URL)
- Для быстрого старта приложения

### Браузерный кэш изображений
- Предзагрузка через Image()
- Приоритет: гардероб + капсулы
- Затем: история анализов

## Важные детали

### Оптимистичное создание
- Вещь появляется в UI мгновенно с временным ID
- Изображение показывается из base64 (пока не загрузится с сервера)
- После ответа сервера: ID обновляется в DOM без перерисовки
- Если ошибка: вещь удаляется из UI

### Прозрачность фона
- FastVLM возвращает PNG с прозрачным фоном
- Клиент сохраняет как PNG (не конвертирует в JPEG!)
- Сервер проверяет hasAlpha и выбирает формат
- Результат: прозрачный фон сохраняется корректно

### Производительность
- Оптимизация ДО отправки на FastVLM: 10 MB → 200 KB (97% сжатие)
- Время классификации: 1-2 секунды (вместо 30+ секунд)
- Оптимистичное создание: UI обновляется мгновенно
- Кэширование: мгновенная загрузка при повторном открытии

### Обработка ошибок
- localStorage overflow: фильтруем base64 при сохранении
- Сетевые ошибки: показываем alert, откатываем оптимистичные изменения
- Ошибки FastVLM: fallback на оригинальное фото

## API Endpoints

### GET /api/wardrobe
- Получить все вещи пользователя
- Auth: X-Init-Data header
- Response: `{ success: true, items: WardrobeItem[] }`

### POST /api/wardrobe
- Создать новую вещь
- Body: `{ imageBase64, category, subtype, color, material, style, fit, season, pattern, description }`
- Response: `{ success: true, item: WardrobeItem }`

### PUT /api/wardrobe/:id
- Обновить вещь
- Body: `Partial<WardrobeItem>`
- Response: `{ success: true, item: WardrobeItem }`

### DELETE /api/wardrobe/:id
- Удалить вещь
- Response: `{ success: true }`

### POST /api/classify-clothing
- Классификация одежды через FastVLM
- Body: `{ image_base64 }`
- Response: `{ success: true, classification, processed_image_base64, timing }`

## Типы данных

```typescript
interface WardrobeItem {
  id: number;
  imageUrl: string;
  name?: string;
  category: ClothingCategory;
  subtype?: string;
  color: string;
  material?: string;
  style?: string;
  fit?: string;
  season?: string;
  pattern?: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

interface ClassificationResult {
  category: ClothingCategory;
  subtype?: string;
  color: string;
  material?: string;
  style?: string;
  fit?: string;
  season?: string;
  pattern?: string;
  description?: string;
}

enum ClothingCategory {
  OUTERWEAR = 'OUTERWEAR',
  INNERWEAR = 'INNERWEAR',
  BODYWEAR = 'BODYWEAR',
  FULLBODY = 'FULLBODY',
  LEGWEAR = 'LEGWEAR',
  FOOTWEAR = 'FOOTWEAR',
  HEADWEAR = 'HEADWEAR',
  ACCESSORIES = 'ACCESSORIES'
}
```

## Связь с другими модулями

### CapsulesManager
- Использует WardrobeManager для отображения модального окна выбора вещей
- Слушает событие `wardrobe:item-selection-toggle`
- Слушает событие `wardrobe:item-saved` для синхронизации новых вещей

### UIModalManager
- Используется для показа модального окна предпросмотра/редактирования
- Управляет состоянием формы и валидацией

### DataCacheManager
- Централизованное хранилище данных
- Используется всеми модулями для кэширования

## Частые проблемы и решения

### Проблема: Черный фон вместо прозрачного
**Причина**: Конвертация PNG → JPEG теряет прозрачность
**Решение**: Всегда использовать PNG для изображений с прозрачностью

### Проблема: Медленная загрузка фото (30+ секунд)
**Причина**: Отправка огромного изображения (10 MB) на FastVLM
**Решение**: Оптимизация ДО отправки (800px, JPEG 80%)

### Проблема: localStorage overflow
**Причина**: Сохранение base64 изображений в кэш
**Решение**: Фильтровать base64 при сохранении в localStorage

### Проблема: Вещь не появляется после добавления
**Причина**: Ошибка при сохранении на сервер
**Решение**: Проверить логи, откатить оптимистичное создание

## Команды для отладки

```bash
# Проверка типов
npm run type-check

# Сборка
npm run build

# Логи клиента
logs/client/

# Логи сервера
# Смотреть в консоли сервера

# Тест FastVLM
python fastvlm-server/test_classify_clothing.py
```

## Метрики производительности

- **Классификация**: 1-2 секунды (FastVLM)
- **Удаление фона**: 0.5-1 секунда (FastVLM)
- **Сохранение на сервер**: 1-2 секунды
- **Общее время добавления вещи**: 3-5 секунд
- **Загрузка гардероба из кэша**: мгновенно (<100ms)
- **Загрузка гардероба с сервера**: 100-200ms

## Следующие улучшения

- [ ] Batch загрузка вещей (несколько фото сразу)
- [ ] Поиск по вещам (по цвету, категории, тегам)
- [ ] Сортировка (по дате, категории, цвету)
- [ ] Экспорт/импорт гардероба
- [ ] Статистика использования вещей
- [ ] Рекомендации по сочетанию вещей
