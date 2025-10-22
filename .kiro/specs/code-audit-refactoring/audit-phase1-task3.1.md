# Аудит: dataCache.ts и history.ts

## Дата аудита
2025-10-21

## Проверенные файлы
- `client/src/modules/dataCache.ts` (738 строк)
- `client/src/modules/history.ts` (478 строк)

## 1. Дублирование логики кеширования

### 1.1 Паттерны работы с localStorage

**НАЙДЕНО: Дублирование паттернов сохранения/загрузки из localStorage**

#### dataCache.ts
```typescript
// Загрузка из localStorage (3 идентичных метода)
private loadWardrobeCacheFromStorage(): void {
  const cached = localStorage.getItem(STORAGE_KEYS.WARDROBE_CACHE);
  const parsed = safeJsonParse<WardrobeItem[]>(cached, []);
  if (Array.isArray(parsed) && parsed.length > 0) {
    this.wardrobeItems = parsed;
  }
}

private loadCapsulesCacheFromStorage(): void {
  const cached = localStorage.getItem(STORAGE_KEYS.CAPSULES_CACHE);
  const parsed = safeJsonParse<Capsule[]>(cached, []);
  if (Array.isArray(parsed) && parsed.length > 0) {
    this.capsules = parsed;
  }
}

private loadPublicFeedCacheFromStorage(): void {
  const cached = localStorage.getItem(STORAGE_KEYS.PUBLIC_FEED_CACHE);
  const parsed = safeJsonParse<PublicFeedCapsule[]>(cached, []);
  if (Array.isArray(parsed) && parsed.length > 0) {
    this.publicFeed = parsed;
  }
}

// Сохранение в localStorage (3 идентичных метода)
private saveWardrobeCacheToStorage(): void {
  const itemsToCache = this.wardrobeItems.slice(0, WARDROBE_CONSTRAINTS.CACHE_ITEMS);
  const json = safeJsonStringify(itemsToCache);
  localStorage.setItem(STORAGE_KEYS.WARDROBE_CACHE, json);
}

private saveCapsulesCacheToStorage(): void {
  const json = safeJsonStringify(this.capsules);
  localStorage.setItem(STORAGE_KEYS.CAPSULES_CACHE, json);
}

private savePublicFeedCacheToStorage(): void {
  const json = safeJsonStringify(this.publicFeed);
  localStorage.setItem(STORAGE_KEYS.PUBLIC_FEED_CACHE, json);
}
```

#### history.ts
```typescript
private loadFromStorage(): void {
  const storedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
  const parsedHistory = safeJsonParse<HistoryItem[]>(storedHistory, []);
  if (!Array.isArray(parsedHistory)) {
    this.history = [];
    return;
  }
  // Валидация и фильтрация
  this.history = parsedHistory.filter(item => item && !('isEmpty' in item));
}

private saveToStorage(): void {
  const historyJson = safeJsonStringify(this.history);
  localStorage.setItem(STORAGE_KEYS.HISTORY, historyJson);
}
```

**Рекомендация**: Создать общую утилиту `LocalStorageCache<T>` в `client/src/modules/shared/LocalStorageCache.ts`:
```typescript
class LocalStorageCache<T> {
  constructor(private key: string) {}
  
  load(defaultValue: T): T {
    const cached = localStorage.getItem(this.key);
    return safeJsonParse<T>(cached, defaultValue);
  }
  
  save(data: T): void {
    const json = safeJsonStringify(data);
    localStorage.setItem(this.key, json);
  }
  
  clear(): void {
    localStorage.removeItem(this.key);
  }
}
```

### 1.2 Паттерны кеширования изображений

**НАЙДЕНО: Дублирование логики предзагрузки изображений**

#### dataCache.ts
```typescript
// Два метода с похожей логикой кеширования изображений
private async cachePriorityImages(imageUrls: string[]): Promise<void> {
  const results = await Promise.allSettled(
    imageUrls.map(relativeUrl => {
      return new Promise<void>((resolve, reject) => {
        const absoluteUrl = this.makeAbsoluteUrl(relativeUrl);
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load: ${absoluteUrl}`));
        img.src = absoluteUrl;
      });
    })
  );
}

private async cacheImages(imageUrls: string[]): Promise<void> {
  // Почти идентичная логика, но с батчами
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (relativeUrl) => {
        return new Promise<{ url: string; success: boolean }>((resolve, reject) => {
          const absoluteUrl = this.makeAbsoluteUrl(relativeUrl);
          const img = new Image();
          img.onload = () => resolve({ url: absoluteUrl, success: true });
          img.onerror = () => reject(new Error(`Failed to load: ${absoluteUrl}`));
          img.src = absoluteUrl;
        });
      })
    );
  }
}
```

**Рекомендация**: Объединить в один метод с параметром `useBatching`:
```typescript
private async cacheImages(imageUrls: string[], options?: { 
  useBatching?: boolean; 
  batchSize?: number; 
  batchDelay?: number 
}): Promise<void>
```

## 2. Неиспользуемые методы

### 2.1 dataCache.ts

**НЕ НАЙДЕНО неиспользуемых методов** - все публичные методы используются:
- `preloadData()` - вызывается из main.ts
- `getWardrobeItems()`, `getCapsules()`, `getPublicFeed()` - используются в UI модулях
- `addWardrobeItem()`, `updateWardrobeItem()`, `removeWardrobeItem()` - используются в WardrobeManager
- `addCapsule()`, `updateCapsule()`, `removeCapsule()` - используются в CapsulesManager
- `setPublicFeed()`, `updatePublicFeedLike()` - используются в PublicFeedManager
- `isDataLoaded()`, `isDataLoading()` - используются для проверки состояния
- `clearAllCache()`, `getStats()` - используются для управления кешем

### 2.2 history.ts

**НАЙДЕНО: Потенциально неиспользуемые методы**

1. **`exportToJson()`** - экспорт истории в JSON
   - Не найдено использований в коде
   - Может быть полезен для будущего функционала
   - **Рекомендация**: Оставить, но добавить комментарий "// Future feature"

2. **`importFromJson()`** - импорт истории из JSON
   - Не найдено использований в коде
   - Парный метод к exportToJson
   - **Рекомендация**: Оставить, но добавить комментарий "// Future feature"

3. **`getStats()`** - получение статистики истории
   - Не найдено использований в коде
   - Может быть полезен для отладки
   - **Рекомендация**: Оставить для отладки

4. **`hasEmptySlots()`** - проверка наличия свободных слотов
   - Не найдено использований в коде
   - Логика устарела (история теперь динамическая, не фиксированная)
   - **Рекомендация**: УДАЛИТЬ

5. **`getFirstEmptySlotIndex()`** - получение индекса первого пустого слота
   - Не найдено использований в коде
   - Логика устарела
   - **Рекомендация**: УДАЛИТЬ

## 3. Паттерны использования localStorage

### 3.1 Ключи localStorage

**ХОРОШО**: Все ключи централизованы в `constants.ts`:
```typescript
export const STORAGE_KEYS = {
  HISTORY: 'tgStyleHistory',
  USER_SETTINGS: 'tgStyleUserSettings',
  LOGS: 'tgStyleLogs',
  WARDROBE_CACHE: 'tgStyleWardrobeCache',
  CAPSULES_CACHE: 'tgStyleCapsulesCache',
  PUBLIC_FEED_CACHE: 'tgStylePublicFeedCache',
} as const;
```

### 3.2 Обработка ошибок localStorage

**НАЙДЕНО: Несогласованная обработка ошибок**

#### dataCache.ts
```typescript
// Все методы загрузки имеют try-catch с логированием
try {
  const cached = localStorage.getItem(STORAGE_KEYS.WARDROBE_CACHE);
  // ...
} catch (error) {
  logger.error('Error loading wardrobe cache from storage', error);
  this.wardrobeItems = [];
}
```

#### history.ts
```typescript
// Метод saveToStorage выбрасывает ошибку
private saveToStorage(): void {
  try {
    const historyJson = safeJsonStringify(this.history);
    localStorage.setItem(STORAGE_KEYS.HISTORY, historyJson);
  } catch (error) {
    logger.error('Error saving history to storage', error);
    throw createError(ERROR_CODES.STORAGE_ERROR, 'Не удалось сохранить историю');
  }
}
```

**Рекомендация**: Стандартизировать обработку ошибок - либо всегда логировать и продолжать, либо всегда выбрасывать ошибку.

### 3.3 Валидация данных из localStorage

**НАЙДЕНО: Разные подходы к валидации**

#### dataCache.ts
```typescript
// Простая проверка типа и длины
const parsed = safeJsonParse<WardrobeItem[]>(cached, []);
if (Array.isArray(parsed) && parsed.length > 0) {
  this.wardrobeItems = parsed;
}
```

#### history.ts
```typescript
// Полная валидация через validateHistory
const parsedHistory = safeJsonParse<HistoryItem[]>(storedHistory, []);
const validation = validateHistory(parsedHistory);
if (!validation.isValid) {
  logger.error('History validation failed', { errors: validation.errors });
  this.history = [];
  return;
}
```

**Рекомендация**: Добавить валидацию для dataCache или упростить валидацию для history (если полная валидация избыточна).

## 4. Дополнительные находки

### 4.1 Дублирование логики сбора URL изображений

**dataCache.ts** имеет метод `collectImageUrls()` который собирает URL из:
- wardrobeItems
- capsules
- history (через historyManager)

Этот метод тесно связан с `historyManager.getAllItems()`, что создает зависимость между модулями.

**Рекомендация**: Рассмотреть создание отдельного сервиса `ImageCollectorService` для централизации логики сбора URL изображений.

### 4.2 Использование safeJsonParse/safeJsonStringify

**ХОРОШО**: Оба модуля используют безопасные утилиты из `helpers.ts`:
- `safeJsonParse<T>(jsonString, defaultValue)` - безопасный парсинг с fallback
- `safeJsonStringify(obj, defaultValue)` - безопасный stringify

Это предотвращает падение приложения при ошибках парсинга.

### 4.3 Логирование

**ХОРОШО**: Оба модуля используют централизованный `logger` модуль:
```typescript
import { logger } from './logger';
logger.info('Message', { context });
logger.error('Error', error);
```

## Итоговые рекомендации

### Высокий приоритет
1. ✅ **Создать `LocalStorageCache<T>` утилиту** для устранения дублирования паттернов localStorage
2. ✅ **Объединить методы кеширования изображений** в один с параметрами
3. ✅ **Удалить устаревшие методы** из history.ts: `hasEmptySlots()`, `getFirstEmptySlotIndex()`

### Средний приоритет
4. ✅ **Стандартизировать обработку ошибок** localStorage (единый подход)
5. ✅ **Добавить валидацию** для dataCache или упростить для history

### Низкий приоритет
6. ⚠️ **Рассмотреть создание ImageCollectorService** для централизации логики сбора URL
7. ⚠️ **Добавить комментарии "Future feature"** к exportToJson/importFromJson

## Метрики

- **Дублирующихся паттернов**: 8 (6 методов localStorage + 2 метода кеширования изображений)
- **Неиспользуемых методов**: 2 (hasEmptySlots, getFirstEmptySlotIndex)
- **Потенциально неиспользуемых**: 3 (exportToJson, importFromJson, getStats)
- **Строк кода для рефакторинга**: ~150 строк
- **Потенциальное сокращение кода**: ~80-100 строк после рефакторинга
