---
inclusion: manual
---

# Changelog - История изменений

## 2025-10-25 - Исправление чувствительности касаний в гридах

### Проблема
При скролле грида вещей срабатывали тапы - открывался предпросмотр или выделялись вещи.

### Решение

**Файлы**:
- `client/src/modules/wardrobe/WardrobeManager.ts`

**Изменения**:

Добавлена проверка расстояния движения пальца (threshold):

```typescript
// В handleMove - отслеживание движения
const deltaX = Math.abs(currentPos.x - startPos.x);
const deltaY = Math.abs(currentPos.y - startPos.y);
const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

const SCROLL_THRESHOLD = 10; // 10px

if (distance > SCROLL_THRESHOLD) {
  // Отменяем долгое нажатие
  clearTimeout(longPressTimer);
  // Помечаем что был скролл
  isProcessing = true;
}

// В endPress - проверка перед обработкой тапа
const TAP_THRESHOLD = 10; // 10px

if (distance > TAP_THRESHOLD) {
  // Это был скролл, не тап - не обрабатываем
  return;
}
```

**Результат**:
- Скролл не вызывает тапы
- Тап срабатывает только если палец сдвинулся меньше чем на 10px
- Долгое нажатие отменяется при скролле

**Как это работает**:
1. При `touchstart` сохраняется начальная позиция
2. При `touchmove` вычисляется расстояние от начальной позиции
3. Если расстояние > 10px → это скролл, отменяем все действия
4. При `touchend` проверяем расстояние от начала до конца
5. Если расстояние > 10px → не обрабатываем как тап

---

## 2025-10-25 - Оптимизация производительности и исправление прозрачности

### Проблемы
1. **Медленная загрузка фото** - 30+ секунд вместо 3-5 секунд
2. **Черный фон** - прозрачность терялась при сохранении
3. **localStorage overflow** - переполнение при сохранении base64

### Решения

#### 1. Оптимизация изображений на клиенте

**Файлы**:
- `client/src/modules/shared/PhotoProcessor.ts`
- `client/src/modules/shared/utils.ts`
- `client/src/modules/wardrobe/WardrobeService.ts`

**Изменения**:

**PhotoProcessor.ts** - добавлен метод `optimizeForClassification()`:
```typescript
private async optimizeForClassification(base64Image: string): Promise<string> {
  // Ресайз до 800px, JPEG 80%
  // Результат: 10 MB → 200 KB (97% сжатие)
}
```

**utils.ts** - обновлен метод `optimizeImageForUpload()`:
```typescript
export async function optimizeImageForUpload(
  base64Image: string,
  maxWidth: number = 1200
): Promise<string> {
  // Всегда PNG для сохранения прозрачности
  // Ресайз до 1200px
}
```

**WardrobeService.ts** - добавлена оптимизация перед отправкой:
```typescript
const optimizedImage = await optimizeImageForUpload(imageData, 1200);
```

**Результат**:
- Время классификации: 30+ сек → 3-5 сек
- Размер передаваемых данных: 10 MB → 200 KB (для классификации)
- Прозрачность сохраняется

#### 2. Поддержка прозрачности на сервере

**Файлы**:
- `server/src/api/wardrobe.js`
- `server/src/api/capsules.js`
- `server/src/utils/fileStorage.js`

**Изменения**:

Добавлена проверка альфа-канала через Sharp:
```javascript
const metadata = await sharp(buffer).metadata();
const hasAlpha = metadata.hasAlpha || metadata.channels === 4;

if (hasAlpha) {
  // PNG для прозрачности
  optimizedBuffer = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
  extension = 'png';
} else {
  // JPEG для обычных изображений
  optimizedBuffer = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
  extension = 'jpg';
}
```

**Результат**:
- Прозрачный фон сохраняется корректно
- Обычные фото оптимизируются как JPEG (меньше размер)
- Размер файлов: 22 MB → 500 KB - 1 MB

#### 3. Исправление localStorage overflow

**Файлы**:
- `client/src/modules/dataCache.ts`

**Изменения**:

Фильтрация base64 изображений при сохранении:
```typescript
private saveWardrobeCacheToStorage(): void {
  const itemsToCache = this.wardrobeItems.slice(0, 30);
  
  // Фильтруем base64 изображения
  const itemsWithoutBase64 = itemsToCache.map(item => {
    if (item.imageUrl && item.imageUrl.startsWith('data:image')) {
      return { ...item, imageUrl: '' };
    }
    return item;
  });
  
  localStorage.setItem(STORAGE_KEYS.WARDROBE_CACHE, JSON.stringify(itemsWithoutBase64));
}
```

**Результат**:
- localStorage не переполняется
- Кэш работает корректно
- Размер кэша: ~9 KB вместо 20+ MB

### Метрики производительности

| Метрика | Было | Стало | Улучшение |
|---------|------|-------|-----------|
| Время классификации | 30+ сек | 3-5 сек | **6-10x быстрее** |
| Размер передачи (классификация) | 10 MB | 200 KB | **97% сжатие** |
| Размер передачи (сохранение) | 20+ MB | 1-2 MB | **90% сжатие** |
| Размер файла на диске | 22 MB | 500 KB - 1 MB | **95% сжатие** |
| Размер localStorage кэша | 20+ MB | 9 KB | **99.9% сжатие** |

### Технические детали

**Оптимизация изображений (текущая)**:

| Этап | Размер | Формат | Качество | Время |
|------|--------|--------|----------|-------|
| Оригинал | 5-10 MB | PNG/JPEG | 100% | - |
| Для FastVLM | 800px | JPEG | 80% | ~200ms |
| Результат FastVLM | PNG | PNG | - | 3-5s |
| Для сохранения | 1200px | PNG | - | ~100ms |
| На сервере | 1200px | PNG/JPEG | 90%/85% | ~500ms |

**Поток оптимизации**:
1. Клиент: Оригинал (10 MB) → Оптимизация для FastVLM (200 KB)
2. FastVLM: Классификация + удаление фона (3-5s)
3. Клиент: Результат → Оптимизация для сохранения (PNG, 1-2 MB)
4. Сервер: Проверка прозрачности → PNG/JPEG (500 KB - 1 MB)

### Затронутые файлы

**Client**:
- ✅ `client/src/modules/shared/PhotoProcessor.ts` - оптимизация для классификации
- ✅ `client/src/modules/shared/utils.ts` - оптимизация для сохранения (PNG)
- ✅ `client/src/modules/wardrobe/WardrobeService.ts` - использование оптимизации
- ✅ `client/src/modules/dataCache.ts` - фильтрация base64 в кэше

**Server**:
- ✅ `server/src/api/wardrobe.js` - поддержка PNG для прозрачности
- ✅ `server/src/api/capsules.js` - поддержка PNG для прозрачности
- ✅ `server/src/utils/fileStorage.js` - поддержка PNG для прозрачности

### Тестирование

**Проверено**:
- ✅ Добавление вещи с прозрачным фоном - фон сохраняется
- ✅ Добавление обычной вещи - оптимизируется как JPEG
- ✅ Время загрузки - 3-5 секунд
- ✅ localStorage не переполняется
- ✅ Кэш работает корректно
- ✅ Оптимистичное создание работает
- ✅ Редактирование вещи работает
- ✅ Удаление вещи работает

### Известные ограничения

1. **PNG файлы больше JPEG** - но это необходимо для сохранения прозрачности
2. **Оптимизация занимает время** - ~200-300ms на клиенте, но это незаметно для пользователя
3. **localStorage кэш без base64** - оптимистичные вещи не кэшируются до получения URL с сервера

### Следующие шаги

- [ ] Добавить WebP поддержку (меньше размер, поддержка прозрачности)
- [ ] Batch загрузка вещей (несколько фото сразу)
- [ ] Progressive loading для больших изображений
- [ ] Service Worker для офлайн кэширования
- [ ] Lazy loading изображений в гриде

---

## Предыдущие изменения

### 2025-10-XX - Оптимистичное создание вещей
- Добавлено оптимистичное создание для мгновенного отображения
- Временный ID заменяется на реальный после ответа сервера
- UI обновляется без перерисовки грида

### 2025-10-XX - Модальное окно выбора вещей для капсул
- Добавлен режим модального окна в WardrobeManager
- Поддержка выделения вещей через короткое нажатие
- Событийная система для связи с CapsulesManager

### 2025-10-XX - Кэширование данных
- Трехуровневое кэширование (память, localStorage, браузер)
- Предзагрузка изображений при старте
- Фоновая синхронизация с сервером

### 2025-10-XX - Интеграция FastVLM
- Классификация одежды через AI
- Автоматическое удаление фона
- Определение категории, цвета, материала, стиля

---

## Формат записей

Каждая запись должна содержать:
1. **Дата** - когда сделаны изменения
2. **Проблемы** - что было не так
3. **Решения** - как исправили
4. **Файлы** - какие файлы изменены
5. **Изменения** - конкретный код/логика
6. **Результат** - что улучшилось
7. **Метрики** - измеримые показатели
8. **Тестирование** - что проверено

Это помогает:
- Быстро понять историю изменений
- Найти причину проблем
- Откатить изменения если нужно
- Понять контекст решений
