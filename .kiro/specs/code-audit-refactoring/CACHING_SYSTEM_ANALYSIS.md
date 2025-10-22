# Анализ системы кэширования TgStyle

## Дата анализа
2025-10-22

## Обзор

Система кэширования в TgStyle использует **3 уровня кэширования**:
1. **localStorage** - для данных (JSON)
2. **HTTP Cache** - для изображений (браузерный кэш)
3. **Memory Cache** - для предзагрузки изображений (Image objects)

---

## 1. localStorage Кэширование (Данные)

### Что кэшируется:

| Ключ | Данные | Размер | Обновление |
|------|--------|--------|------------|
| `tgStyleHistory` | История анализов (49 элементов) | ~50KB | При каждом изменении |
| `tgStyleWardrobeCache` | Гардероб (24 элемента) | ~8KB | При загрузке с сервера |
| `tgStyleCapsulesCache` | Капсулы (10 элементов) | ~31KB | При загрузке с сервера |
| `tgStylePublicFeedCache` | Публичная лента | ~? | При загрузке с сервера |
| `tgStyleSubscription` | Подписка пользователя | ~0.5KB | После авторизации |

**Итого: ~90KB в localStorage**

### Когда записывается:

**История (`historyManager`):**
- При загрузке из localStorage в конструкторе
- При добавлении нового анализа (`addItem()`)
- При удалении анализа (`removeItem()`)
- При обновлении лайка (`updateItemLikeStatus()`)
- При загрузке с сервера (`loadHistoryFromServer()`)

**Гардероб (`dataCacheManager`):**
- При загрузке из localStorage в конструкторе
- После успешной загрузки с сервера (`preloadData()`)

**Капсулы (`dataCacheManager`):**
- При загрузке из localStorage в конструкторе
- После успешной загрузки с сервера (`preloadData()`)

**Подписка (`authManager`):**
- После успешной авторизации (`authenticate()`)
- При обновлении UI подписки (`displaySubscriptionInfo()`)

### Когда удаляется:

- **Никогда автоматически не удаляется**
- Только при явном вызове `clear()` или `clearAllCache()`
- При ошибках валидации (сбрасывается в `[]`)

---

## 2. HTTP Cache (Изображения)

### Настройки сервера:

```javascript
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '365d',      // Кэш на 1 год
  immutable: true,     // Файлы не изменяются
  etag: true,          // ETag для валидации
  lastModified: true   // Last-Modified заголовок
}));
```

### Что кэшируется:

- **Все изображения** из `/uploads/analysis/{telegramId}/{photoPath}`
- **Все изображения** из `/uploads/wardrobe/{imageUrl}`
- **Все изображения** из `/uploads/capsules/{thumbnailUrl}`

### Когда записывается:

- **Автоматически браузером** при первой загрузке изображения
- Браузер проверяет заголовки `Cache-Control`, `ETag`, `Last-Modified`

### Когда удаляется:

- **Через 365 дней** (maxAge)
- При очистке кэша браузера пользователем
- При переполнении кэша браузера (автоматически)

---

## 3. Memory Cache (Предзагрузка изображений)

### Что делает `preloadCachedImages()`:

```typescript
// В конструкторе dataCacheManager
this.preloadCachedImages();
```

**Загружает в память браузера:**
- Гардероб: 24 изображения
- Капсулы: 10 изображений (thumbnails + items)
- Публичная лента: N изображений

**Метод:** Создает `Image` объекты и устанавливает `img.src = url`

### Зачем это нужно:

- Браузер загружает изображения в фоне
- Изображения попадают в HTTP Cache
- При следующем запросе браузер берет из кэша (мгновенно)

---

## 4. Дублирование загрузки изображений

### Проблема: `updateHistoryDisplay()` вызывается 2 раза

Из логов:
```
10:04:27.162 - 🎨 updateHistoryDisplay() called (1-й раз)
10:04:27.168 - 🎨 updateHistoryDisplay() called (2-й раз)
```

**Причина:**
1. Вызов из `uiManager.init()` → `uiMenuManager.init()` → `updateHistoryDisplay()`
2. Вызов из `main.ts` → `optimisticUIRender()` → `uiManager.updateHistoryDisplay()`

**Последствия:**
- Карусель создается 2 раза
- Изображения загружаются 2 раза (дубликаты запросов)
- Лишние 5ms на отрисовку

### Проблема: Дублирование загрузки фоновых изображений

Из логов:
```
10:04:27.XXX - Starting background image loading (1-й раз)
10:04:27.XXX - Starting background image loading (2-й раз)
```

**Причина:** Каждый вызов `updateHistoryDisplay()` запускает `loadVisibleCardImages()` → фоновая загрузка

**Последствия:**
- Каждое фоновое изображение загружается 2 раза
- Лишние сетевые запросы (хотя из HTTP кэша)

---

## 5. Рекомендации по рефакторингу

### Высокий приоритет:

**1. Убрать дублирование `updateHistoryDisplay()`**
- Удалить вызов из `uiManager.init()` ИЛИ из `optimisticUIRender()`
- Оставить только один вызов

**2. Добавить флаг для предотвращения повторной загрузки**
```typescript
private isLoadingImages = false;

private loadVisibleCardImages(): void {
  if (this.isLoadingImages) return;
  this.isLoadingImages = true;
  // ... загрузка
}
```

### Средний приоритет:

**3. Оптимизировать `preloadCachedImages()`**
- Сейчас загружает гардероб + капсулы параллельно
- Можно добавить приоритизацию (сначала гардероб, потом капсулы)

**4. Добавить очистку старого кэша**
- localStorage может переполниться
- Добавить проверку размера и очистку старых данных

### Низкий приоритет:

**5. Добавить Service Worker**
- Для более продвинутого кэширования
- Для offline режима

**6. Добавить метрики кэша**
- Сколько данных в localStorage
- Сколько изображений в HTTP кэше
- Hit rate кэша

---

## 6. Текущая последовательность загрузки

### При запуске приложения:

```
1. dataCache конструктор
   ├─ loadWardrobeCacheFromStorage() → localStorage
   ├─ loadCapsulesCacheFromStorage() → localStorage
   ├─ loadPublicFeedCacheFromStorage() → localStorage
   └─ preloadCachedImages() → HTTP запросы (фон)

2. historyManager конструктор
   └─ loadFromStorage() → localStorage

3. authManager конструктор
   └─ loadSubscriptionFromCache() → localStorage

4. uiManager.init()
   └─ uiMenuManager.init()
      └─ updateHistoryDisplay() ← ПЕРВЫЙ ВЫЗОВ
         └─ loadVisibleCardImages() → HTTP запросы

5. optimisticUIRender()
   └─ uiManager.updateHistoryDisplay() ← ВТОРОЙ ВЫЗОВ (ДУБЛИКАТ!)
      └─ loadVisibleCardImages() → HTTP запросы (дубликаты)

6. authenticate()
   └─ displaySubscriptionInfo()
      └─ localStorage.setItem('tgStyleSubscription')

7. preloadAppData() (фон)
   └─ dataCacheManager.preloadData()
      ├─ loadWardrobeItems() → API запрос
      ├─ loadCapsules() → API запрос
      ├─ saveWardrobeCacheToStorage() → localStorage
      └─ saveCapsulesCacheToStorage() → localStorage
```

---

## 7. Метрики производительности (из логов)

### Время загрузки:

| Операция | Время | Источник |
|----------|-------|----------|
| History loaded from storage | ~1ms | localStorage |
| Wardrobe cache loaded | ~1ms | localStorage |
| Capsules cache loaded | ~1ms | localStorage |
| Subscription loaded from cache | ~1ms | localStorage |
| Carousel rendered (DOM ready) | ~5ms | DOM |
| Card image loaded (HTTP cache) | ~10-50ms | HTTP Cache |
| Card image loaded (first time) | ~1500ms | Network |
| Authentication | ~1800ms | API |
| Total app initialization | ~1800ms | - |

### Размеры данных:

| Тип данных | Количество | Размер |
|------------|------------|--------|
| История | 49 элементов | ~50KB |
| Гардероб | 24 элемента | ~8KB |
| Капсулы | 10 элементов | ~31KB |
| Подписка | 1 объект | ~0.5KB |
| **Итого localStorage** | - | **~90KB** |

---

## 8. Выводы

### Положительные стороны:

✅ Трехуровневое кэширование работает эффективно
✅ HTTP кэш с `maxAge: 365d` дает мгновенную загрузку
✅ localStorage кэш дает мгновенный старт приложения
✅ Данные синхронизируются с сервером в фоне

### Проблемы:

❌ Дублирование вызова `updateHistoryDisplay()` (2 раза)
❌ Дублирование загрузки фоновых изображений (2 раза)
❌ Нет очистки старого кэша в localStorage
❌ Нет метрик использования кэша

### Приоритет рефакторинга:

1. **Высокий**: Убрать дублирование `updateHistoryDisplay()`
2. **Высокий**: Добавить флаг предотвращения повторной загрузки
3. **Средний**: Оптимизировать `preloadCachedImages()`
4. **Низкий**: Добавить метрики и очистку кэша
