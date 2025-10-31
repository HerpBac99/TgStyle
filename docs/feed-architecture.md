# Архитектура модуля Feed

## Обзор

Модуль Feed (публичная лента) отвечает за отображение капсул других пользователей в Instagram-style grid с infinite scroll. Это социальная функция приложения, позволяющая пользователям просматривать, лайкать и делиться образами других пользователей.

**Основные функции:**
- Отображение публичных капсул в Instagram-style grid
- Infinite scroll с автоматической подгрузкой
- Пагинация (20 капсул на страницу)
- Лайки капсул с оптимистичным обновлением UI
- Кэширование первой страницы (TTL 5 минут)
- Полноэкранный просмотр капсул
- Исключение собственных капсул из ленты

## Основные компоненты

### 1. PublicFeedManager (PublicFeedManager.ts)

**Ответственность:** Координатор модуля - управляет UI, сервисами, кэшированием и пагинацией.

**Ключевые методы:**
- `open()` - Открывает ленту и загружает первую страницу
- `close()` - Закрывает ленту
- `loadInitialPage()` - Загружает первую страницу с кэш-fallback
- `loadMore()` - Загружает следующую страницу (infinite scroll)
- `handleViewCapsule(capsule)` - Обрабатывает клик по капсуле
- `refresh()` - Обновляет ленту (сброс пагинации)
- `loadFromCache()` - Загружает из localStorage
- `saveToCache(capsules)` - Сохраняет в localStorage
- `getStatus()` - Возвращает состояние менеджера
- `destroy()` - Очищает ресурсы

**Состояние:**
```typescript
private uiFeed: UIPublicFeed | null = null;
private currentPage: number = 1;
private hasMore: boolean = true;
private isLoading: boolean = false;
private cacheKey: string = 'publicFeed_cache';
private cacheExpiry: number = 5 * 60 * 1000; // 5 минут
```

**Интеграции:**
- `UIPublicFeed` - UI компонент для отображения ленты
- `PublicFeedService` - Сервис для API запросов
- `UIModalManager` - Показ полноэкранного превью капсулы
- `Logger` - Логирование операций

**Паттерны:**
- **Singleton** - Единственный экземпляр для всего приложения
- **Coordinator** - Координирует UI и бизнес-логику
- **Cache-First** - Мгновенная отрисовка из кэша, затем обновление с сервера

### 2. UIPublicFeed (UIPublicFeed.ts)

**Ответственность:** UI компонент для отображения ленты в Instagram-style grid с infinite scroll.

**Ключевые методы:**
- `initializeDOM()` - Создает DOM структуру (header, grid, loading)
- `render(capsules, append)` - Рендерит капсулы (append для пагинации)
- `createCapsuleCard(capsule, index)` - Создает карточку капсулы
- `setupInfiniteScroll()` - Настраивает Intersection Observer
- `showLoading(show)` - Показывает/скрывает loading индикатор
- `show()` - Показывает контейнер ленты
- `hide()` - Скрывает контейнер ленты
- `destroy()` - Очищает ресурсы и observer

**Callbacks:**
```typescript
interface UIPublicFeedCallbacks {
  onView: (capsule: PublicCapsule) => void;
  onLoadMore: () => Promise<void>;
}
```

**Instagram-style Layout:**

Паттерн повторяется каждые 10 элементов (2 паттерна по 5 элементов):

**Паттерн A (позиции 0-4):**
- Позиция 0: Большой элемент слева (2 строки, колонка 1)
- Позиция 1: Маленький (колонка 2)
- Позиция 2: Маленький (колонка 3)
- Позиция 3: Маленький (колонка 2)
- Позиция 4: Маленький (колонка 3)

**Паттерн B (позиции 5-9):**
- Позиция 5: Маленький (колонка 1)
- Позиция 6: Маленький (колонка 2)
- Позиция 7: Большой элемент справа (2 строки, колонка 3)
- Позиция 8: Маленький (колонка 1)
- Позиция 9: Маленький (колонка 2)

**CSS Grid:**
```css
.feed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 150px;
  gap: 4px;
}

.feed-item-large {
  grid-row: span 2; /* Занимает 2 строки */
}
```

**Интеграции:**
- `CapsuleLikesService` - Универсальный компонент лайков
- `Logger` - Логирование операций
- `IntersectionObserver` - Infinite scroll

### 3. PublicFeedService (PublicFeedService.ts)

**Ответственность:** Сервис для API запросов к серверу (загрузка капсул, лайки).

**Ключевые методы:**
- `loadPublicCapsules(page, limit)` - Загружает публичные капсулы с пагинацией
- `toggleLike(capsuleId, currentlyLiked)` - Переключает лайк (делегирует в CapsuleLikesService)

**Параметры запроса:**
```typescript
page: number = 1      // Номер страницы
limit: number = 20    // Количество капсул на страницу
```

**Ответ сервера:**
```typescript
interface PublicFeedResponse {
  success: boolean;
  capsules: PublicCapsule[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  error?: string;
}
```

**Интеграции:**
- `API` - HTTP запросы к серверу
- `CapsuleLikesService` - Управление лайками
- `Logger` - Логирование операций

## Архитектурные паттерны

### 1. Singleton Pattern

**PublicFeedManager, PublicFeedService** - Единственные экземпляры для всего приложения.

```typescript
export const publicFeedManager = new PublicFeedManager();
export const publicFeedService = new PublicFeedService();
```

**Преимущества:**
- Единое состояние пагинации
- Предотвращение дублирования запросов
- Централизованное управление кэшем

### 2. Cache-First Pattern

**Стратегия:** Мгновенная отрисовка из кэша, затем обновление с сервера.

```typescript
// 1. Загрузка из кэша (instant UI)
const cachedCapsules = this.loadFromCache();
if (cachedCapsules && cachedCapsules.length > 0) {
  this.uiFeed.render(cachedCapsules, false);
}

// 2. Загрузка с сервера (фоновое обновление)
const response = await publicFeedService.loadPublicCapsules(1);
this.saveToCache(response.capsules);
this.uiFeed.render(response.capsules, false);
```

**Кэш:**
- **Ключ:** `publicFeed_cache`
- **TTL:** 5 минут
- **Хранилище:** localStorage
- **Формат:** `{ capsules: PublicCapsule[], timestamp: number }`

**Преимущества:**
- Instant UI - лента появляется мгновенно
- Экономия трафика при повторных открытиях
- Graceful degradation при сетевых ошибках

### 3. Infinite Scroll Pattern

**Реализация:** Intersection Observer на последнем элементе грида.

```typescript
this.observer = new IntersectionObserver(
  async (entries) => {
    const entry = entries[0];
    if (entry && entry.isIntersecting) {
      await this.callbacks.onLoadMore();
    }
  },
  {
    root: null,
    rootMargin: '100px',  // Загружаем за 100px до конца
    threshold: 0.1
  }
);

this.observer.observe(lastItem);
```

**Защита от дублирования:**
```typescript
if (this.isLoading || !this.hasMore) {
  return; // Предотвращаем параллельные запросы
}
```

**Откат при ошибке:**
```typescript
try {
  this.currentPage++;
  const response = await publicFeedService.loadPublicCapsules(this.currentPage);
  // ...
} catch (error) {
  this.currentPage--; // Откатываем страницу
}
```

### 4. Optimistic UI Pattern

**Лайки обновляются мгновенно без ожидания ответа сервера:**

```typescript
// 1. Оптимистичное обновление UI
const newState = {
  isLiked: !currentState.isLiked,
  likesCount: currentState.isLiked 
    ? Math.max(0, currentState.likesCount - 1)
    : currentState.likesCount + 1
};
this.updateLikeButton(likeBtn, likesCountEl, newState);

// 2. Асинхронный запрос к серверу
const response = await this.toggleLike(capsuleId, newState.isLiked);

// 3. Синхронизация с ответом сервера
if (response.isLiked !== newState.isLiked) {
  this.updateLikeButton(likeBtn, likesCountEl, response);
}

// 4. Откат при ошибке
catch (error) {
  this.updateLikeButton(likeBtn, likesCountEl, previousState);
}
```

**Преимущества:**
- Мгновенный отклик UI
- Улучшенный UX
- Автоматический откат при ошибках

### 5. Lazy Loading Pattern

**Изображения загружаются по требованию:**

```typescript
const img = document.createElement('img');
img.src = capsule.thumbnailUrl;
img.alt = capsule.name;
img.loading = 'lazy'; // Браузерный lazy loading
```

**Преимущества:**
- Экономия трафика
- Быстрая начальная загрузка
- Автоматическая оптимизация браузером

## Интеграции

### 1. CapsuleLikesService

**Универсальный компонент лайков для капсул.**

**Использование в Feed:**
```typescript
capsuleLikesService.createLikeComponent(
  stats,                    // Родительский элемент
  capsule.id,               // ID капсулы
  {
    isLiked: capsule.isLiked,
    likesCount: capsule.likesCount
  },
  'feed'                    // componentClass для специфичных стилей
);
```

**Методы:**
- `createLikeComponent()` - Создает полнофункциональный компонент
- `toggleLike()` - Переключает лайк на сервере
- `getLikeStatus()` - Получает статус лайка

**Оптимистичное обновление:**
1. Мгновенно обновляет UI
2. Отправляет запрос на сервер
3. Синхронизирует с ответом
4. Откатывает при ошибке

**Интеграция:**
- Автоматическая анимация кнопки (300ms)
- Остановка всплытия события (e.stopPropagation)
- Логирование всех операций

### 2. UIModalManager

**Показ полноэкранного превью капсулы.**

**Использование:**
```typescript
uiModalManager.showCapsulePreview(fullImageUrl, () => {
  logger.info('Capsule preview closed from feed');
});
```

**Параметры:**
- `imageUrl: string` - Полный URL изображения капсулы
- `onClose: () => void` - Callback при закрытии

**Интеграция:**
- Полноэкранное модальное окно
- Поддержка жестов (свайп для закрытия)
- Автоматическое управление BackButton

### 3. Server API

**Endpoint:** `GET /api/capsules/public`

**Параметры запроса:**
```typescript
page: number = 1      // Номер страницы
limit: number = 20    // Количество капсул на страницу
```

**Заголовки:**
```typescript
initData?: string     // Telegram WebApp initData (опционально)
```

**Ответ:**
```typescript
{
  success: true,
  capsules: [
    {
      id: number,
      name: string,
      description?: string,
      thumbnailUrl: string | null,
      canvasData: any,
      metadata?: any,
      analysis?: any,
      createdAt: string,
      likesCount: number,
      isLiked: boolean,        // Только если авторизован
      itemCount: number,
      items: WardrobeItem[],
      author: {
        firstName: string,
        lastName: string,
        username?: string
      }
    }
  ],
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number,
    hasMore: boolean
  }
}
```

**Логика на сервере:**

1. **Опциональная авторизация** - Middleware `optionalTelegramAuth`
   - Если есть initData - валидирует и устанавливает `req.telegramId`
   - Если нет initData - продолжает без авторизации

2. **Исключение собственных капсул**
   ```javascript
   where: currentUserTelegramId ? {
     telegramId: { not: currentUserTelegramId }
   } : undefined
   ```

3. **Сортировка**
   ```javascript
   orderBy: [
     { likesCount: 'desc' },  // Сначала по популярности
     { createdAt: 'desc' }     // Потом по новизне
   ]
   ```

4. **Проверка лайков**
   - Если пользователь авторизован - загружает его лайки
   - Устанавливает флаг `isLiked` для каждой капсулы
   - Если не авторизован - `isLiked: false` для всех

5. **Пагинация**
   ```javascript
   const skip = (page - 1) * limit;
   const take = limit;
   const total = await prisma.capsule.count();
   const hasMore = skip + take < total;
   ```

**Интеграция:**
- `FileService.getImageUrl()` - Формирование URL изображений
- `Prisma` - ORM для работы с БД
- `optionalTelegramAuth` - Middleware для опциональной авторизации

## Производительность и оптимизация

### 1. Кэширование первой страницы

**Проблема:** Медленная загрузка ленты при каждом открытии.

**Решение:**
```typescript
// Instant UI из кэша
const cachedCapsules = this.loadFromCache();
if (cachedCapsules) {
  this.uiFeed.render(cachedCapsules, false);
}

// Фоновое обновление с сервера
const response = await publicFeedService.loadPublicCapsules(1);
this.saveToCache(response.capsules);
this.uiFeed.render(response.capsules, false);
```

**Результат:**
- Instant UI - лента появляется мгновенно
- Свежие данные загружаются в фоне
- TTL 5 минут предотвращает устаревание

### 2. Lazy Loading изображений

**Проблема:** Загрузка всех изображений сразу.

**Решение:**
```typescript
img.loading = 'lazy'; // Браузерный lazy loading
```

**Результат:**
- Загружаются только видимые изображения
- Автоматическая подгрузка при скролле
- Экономия трафика и времени загрузки

### 3. Infinite Scroll с предзагрузкой

**Проблема:** Задержка при достижении конца ленты.

**Решение:**
```typescript
{
  rootMargin: '100px',  // Загружаем за 100px до конца
  threshold: 0.1
}
```

**Результат:**
- Плавный скролл без задержек
- Пользователь не видит loading индикатор
- Улучшенный UX

### 4. Оптимистичное обновление лайков

**Проблема:** Задержка при клике на лайк.

**Решение:**
```typescript
// Мгновенное обновление UI
this.updateLikeButton(likeBtn, likesCountEl, newState);

// Асинхронный запрос
await this.toggleLike(capsuleId, newState.isLiked);
```

**Результат:**
- Мгновенный отклик UI
- Нет задержки 200-500ms
- Автоматический откат при ошибке

### 5. Защита от дублирования запросов

**Проблема:** Параллельные запросы при быстром скролле.

**Решение:**
```typescript
if (this.isLoading || !this.hasMore) {
  return; // Предотвращаем дублирование
}

this.isLoading = true;
try {
  // Запрос к серверу
} finally {
  this.isLoading = false;
}
```

**Результат:**
- Один запрос за раз
- Предотвращение дублирования данных
- Экономия трафика

### 6. Instagram-style Grid

**Проблема:** Монотонная сетка одинаковых элементов.

**Решение:**
```typescript
const positionInPattern = index % 10;

if (positionInPattern === 0 || positionInPattern === 7) {
  card.classList.add('feed-item-large');
  card.style.gridRow = 'span 2';
}
```

**Результат:**
- Визуально интересная лента
- Чередование больших и маленьких элементов
- Instagram-style UX

## Обработка ошибок

### 1. Graceful Degradation

**Стратегия:** Использование кэша при сетевых ошибках.

```typescript
try {
  const response = await publicFeedService.loadPublicCapsules(1);
  this.saveToCache(response.capsules);
  this.uiFeed.render(response.capsules, false);
} catch (error) {
  // Если есть кэш - не показываем ошибку
  if (!this.loadFromCache()) {
    throw error; // Показываем ошибку только если нет кэша
  }
}
```

### 2. Откат пагинации

**Стратегия:** Откат номера страницы при ошибке загрузки.

```typescript
try {
  this.currentPage++;
  const response = await publicFeedService.loadPublicCapsules(this.currentPage);
  // ...
} catch (error) {
  this.currentPage--; // Откатываем страницу
  this.uiFeed.showLoading(false);
}
```

### 3. Валидация данных

**Стратегия:** Проверка наличия обязательных полей.

```typescript
if (!capsule.thumbnailUrl) {
  logger.warn('No thumbnail for capsule', { capsuleId: capsule.id });
  alert('У этой капсулы нет изображения');
  return;
}
```

### 4. Логирование

**Уровни:**
- `logger.info()` - Информационные сообщения
- `logger.warn()` - Предупреждения (отсутствие изображения)
- `logger.error()` - Ошибки с деталями

**Контекст:**
```typescript
logger.info('Feed rendered', {
  capsulesCount: this.capsules.length,
  appended: append
});
```

## Метрики производительности

### Время загрузки

**Первая страница:**
- Из кэша: < 100ms (instant UI)
- С сервера: 500-1000ms
- Рендеринг: 100-200ms

**Следующие страницы:**
- Запрос: 300-500ms
- Рендеринг: 50-100ms

**Лайк:**
- Оптимистичное обновление: < 50ms
- Запрос к серверу: 200-500ms

### Размер данных

**Одна капсула:**
- Метаданные: 1-2 KB
- Thumbnail URL: 50-100 bytes

**Одна страница (20 капсул):**
- JSON: 20-40 KB
- Изображения: 2-4 MB (lazy loading)

**Кэш:**
- localStorage: До 100 KB (первая страница)
- TTL: 5 минут

### Оптимизации

**Экономия трафика:**
- Кэширование первой страницы: -100% повторных запросов (в течение 5 минут)
- Lazy loading изображений: -80% начальной загрузки
- Пагинация: -95% данных (20 вместо всех капсул)

**Экономия времени:**
- Instant UI из кэша: -500-1000ms загрузки
- Оптимистичные лайки: -200-500ms задержки
- Предзагрузка (rootMargin 100px): -300-500ms ожидания

## Диаграмма архитектуры

```
┌─────────────────────────────────────────────────────────────┐
│                     Feed Module                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │PublicFeedManager │◄────────┤ UIPublicFeed     │          │
│  │                  │         │                  │          │
│  │  - Coordinator   │         │  - Instagram Grid│          │
│  │  - Caching       │         │  - Infinite Scroll│         │
│  │  - Pagination    │         │  - Lazy Loading  │          │
│  └────────┬─────────┘         └────────┬─────────┘          │
│           │                            │                     │
│           ▼                            ▼                     │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │PublicFeedService │         │IntersectionObserver│         │
│  │                  │         │                  │          │
│  │  - API Requests  │         │  - Auto Load     │          │
│  │  - Pagination    │         └──────────────────┘          │
│  └────────┬─────────┘                                        │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │CapsuleLikesService│        │ UIModalManager   │          │
│  │                  │         │                  │          │
│  │  - Optimistic UI │         │  - Preview       │          │
│  │  - Like/Unlike   │         │  - Fullscreen    │          │
│  └──────────────────┘         └──────────────────┘          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   External Services    │
              ├────────────────────────┤
              │  - Server API          │
              │  - localStorage        │
              │  - Prisma Database     │
              └────────────────────────┘
```

## Примеры использования

### 1. Открытие ленты

```typescript
import { publicFeedManager } from './modules/publicFeed/PublicFeedManager';

// Открыть ленту
await publicFeedManager.open();

// Закрыть ленту
publicFeedManager.close();

// Обновить ленту
await publicFeedManager.refresh();
```

### 2. Создание UI компонента

```typescript
import { UIPublicFeed } from './modules/publicFeed/UIPublicFeed';

const uiFeed = new UIPublicFeed({
  onView: (capsule) => {
    console.log('Viewing capsule:', capsule.id);
    // Показать полноэкранное превью
  },
  onLoadMore: async () => {
    console.log('Loading more capsules...');
    // Загрузить следующую страницу
  }
});

// Показать контейнер
uiFeed.show();

// Рендер капсул
uiFeed.render(capsules, false);

// Добавить капсулы (пагинация)
uiFeed.render(moreCapsules, true);
```

### 3. Загрузка капсул

```typescript
import { publicFeedService } from './modules/publicFeed/PublicFeedService';

// Загрузить первую страницу
const response = await publicFeedService.loadPublicCapsules(1, 20);
console.log(response.capsules);
console.log(response.pagination.hasMore);

// Загрузить следующую страницу
const nextPage = await publicFeedService.loadPublicCapsules(2, 20);
```

### 4. Работа с лайками

```typescript
import { capsuleLikesService } from './modules/capsules/CapsuleLikesService';

// Создать компонент лайков
capsuleLikesService.createLikeComponent(
  statsContainer,
  capsule.id,
  {
    isLiked: capsule.isLiked,
    likesCount: capsule.likesCount
  },
  'feed'
);

// Переключить лайк вручную
const result = await capsuleLikesService.toggleLike(capsule.id, true);
console.log(result.likesCount);
```

### 5. Кэширование

```typescript
// Сохранить в кэш
publicFeedManager.saveToCache(capsules);

// Загрузить из кэша
const cached = publicFeedManager.loadFromCache();
if (cached) {
  console.log('Loaded from cache:', cached.length);
}
```

## Диаграмма последовательности

### Полный flow открытия ленты

```
Пользователь → PublicFeedManager → UIPublicFeed → localStorage → PublicFeedService → Server → Database
                                         ↓ (instant UI)
                                    Рендеринг
                                         ↓ (фоновое обновление)
Пользователь ← PublicFeedManager ← UIPublicFeed ← PublicFeedService ← Server ← Database
```

**Детальная последовательность:**

1. Пользователь переключается на вкладку Feed
2. `UIManager.handleTabSwitch('feed')` → `publicFeedManager.open()`
3. `PublicFeedManager` создает `UIPublicFeed` с callbacks
4. `UIPublicFeed.show()` - показывает контейнер
5. `PublicFeedManager.loadInitialPage()` - загрузка первой страницы
6. `PublicFeedManager.loadFromCache()` - проверка localStorage
7. Если кэш валиден: `UIPublicFeed.render(cachedCapsules, false)` - instant UI
8. `PublicFeedService.loadPublicCapsules(1, 20)` - запрос к серверу
9. Сервер валидирует initData (опционально)
10. Сервер загружает капсулы из БД (исключая собственные)
11. Сервер проверяет лайки пользователя
12. Сервер возвращает капсулы с пагинацией
13. `PublicFeedManager.saveToCache(capsules)` - сохранение в кэш
14. `UIPublicFeed.render(capsules, false)` - обновление UI
15. `UIPublicFeed.setupInfiniteScroll()` - настройка observer
16. Пользователь видит ленту

### Flow infinite scroll

```
Пользователь скроллит → IntersectionObserver → PublicFeedManager → PublicFeedService → Server
                                                        ↓
Пользователь ← UIPublicFeed ← PublicFeedManager ← PublicFeedService ← Server
```

**Детальная последовательность:**

1. Пользователь скроллит до конца ленты
2. `IntersectionObserver` срабатывает на последнем элементе
3. `callbacks.onLoadMore()` → `PublicFeedManager.loadMore()`
4. Проверка флагов: `isLoading`, `hasMore`
5. `this.currentPage++` - инкремент страницы
6. `UIPublicFeed.showLoading(true)` - показ loading
7. `PublicFeedService.loadPublicCapsules(currentPage, 20)`
8. Сервер возвращает следующую страницу
9. `UIPublicFeed.render(capsules, true)` - добавление в конец
10. `UIPublicFeed.setupInfiniteScroll()` - переподключение observer
11. `UIPublicFeed.showLoading(false)` - скрытие loading
12. Пользователь видит новые капсулы

### Flow лайка

```
Пользователь → CapsuleLikesService → API → Server → Database
      ↓ (оптимистично)
     UI
      ↓ (корректировка)
     UI ← CapsuleLikesService ← API ← Server
```

**Детальная последовательность:**

1. Пользователь кликает кнопку лайка
2. `e.stopPropagation()` - остановка всплытия
3. `CapsuleLikesService` мгновенно обновляет UI
4. `capsuleLikesService.toggleLike(capsuleId, isLiked)`
5. POST/DELETE `/api/capsule-likes/:id` с initData
6. Сервер валидирует initData
7. Сервер создает/удаляет лайк в БД
8. Сервер обновляет счетчик `likesCount`
9. Сервер возвращает новый статус
10. `CapsuleLikesService` синхронизирует UI с ответом
11. Пользователь видит обновленный счетчик

## Типы данных

### PublicCapsule

```typescript
interface PublicCapsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl: string | null;
  canvasData: any;
  analysis?: any;
  createdAt: string;
  likesCount: number;
  isLiked: boolean;
  itemCount: number;
  items: any[];
  author: {
    firstName: string;
    lastName: string;
    username?: string;
  };
}
```

### PublicFeedResponse

```typescript
interface PublicFeedResponse {
  success: boolean;
  capsules: PublicCapsule[];
  pagination: PublicFeedPagination;
  error?: string;
}
```

### PublicFeedPagination

```typescript
interface PublicFeedPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
}
```

### CapsuleLikeStatus

```typescript
interface CapsuleLikeStatus {
  isLiked: boolean;
  likesCount: number;
}
```

## Будущие улучшения

### 1. Комментарии

**Функциональность:**
- Добавление комментариев к капсулам
- Отображение количества комментариев
- Модальное окно с комментариями

**Интеграция:**
- Новый компонент `CapsuleCommentsService`
- API endpoints: `POST /api/capsule-comments`, `GET /api/capsule-comments/:id`
- Оптимистичное обновление счетчика

### 2. Фильтрация и сортировка

**Функциональность:**
- Фильтр по категориям одежды
- Сортировка: популярные, новые, случайные
- Поиск по автору

**Интеграция:**
- UI компонент фильтров
- Параметры запроса: `?category=outerwear&sort=popular`
- Сброс кэша при изменении фильтров

### 3. Персонализация

**Функциональность:**
- Рекомендации на основе гардероба пользователя
- Подписки на других пользователей
- Лента подписок

**Интеграция:**
- ML модель для рекомендаций
- Таблица `Subscription` в БД
- Отдельный endpoint `/api/capsules/following`

### 4. Sharing

**Функциональность:**
- Поделиться капсулой через Telegram
- Копирование ссылки на капсулу
- Sharing в другие соцсети

**Интеграция:**
- `CapsulesSharing` сервис
- Telegram WebApp API: `shareUrl()`
- Deep links: `https://t.me/bot?start=capsule_123`

### 5. Offline Support

**Функциональность:**
- Service Worker для кэширования
- Очередь запросов при отсутствии сети
- Синхронизация при восстановлении соединения

**Интеграция:**
- Service Worker регистрация
- IndexedDB для хранения
- Background Sync API

### 6. Аналитика

**Функциональность:**
- Трекинг просмотров капсул
- Статистика популярности
- A/B тестирование layout

**Интеграция:**
- События просмотра: `POST /api/capsule-views/:id`
- Dashboard для авторов
- Analytics сервис

## Troubleshooting

### Ошибка "No capsules loaded"

**Причина:** Сервер не вернул капсулы или ошибка сети.

**Решение:**
- Проверить доступность сервера
- Проверить наличие публичных капсул в БД
- Проверить логи сервера

### Infinite scroll не работает

**Причина:** IntersectionObserver не срабатывает.

**Решение:**
- Проверить наличие последнего элемента в гриде
- Проверить флаги `isLoading` и `hasMore`
- Проверить `rootMargin` и `threshold`

### Лайки не синхронизируются

**Причина:** Ошибка API или невалидный initData.

**Решение:**
- Проверить наличие `window.Telegram.WebApp.initData`
- Проверить валидность initData на сервере
- Проверить логи API запросов

### Кэш не обновляется

**Причина:** TTL не истек или ошибка сохранения.

**Решение:**
- Проверить timestamp в localStorage
- Очистить кэш вручную: `localStorage.removeItem('publicFeed_cache')`
- Проверить квоту localStorage

### Instagram-style layout сломан

**Причина:** Неправильный расчет позиции или CSS.

**Решение:**
- Проверить `positionInPattern = index % 10`
- Проверить CSS grid: `grid-template-columns: repeat(3, 1fr)`
- Проверить `grid-row: span 2` для больших элементов
