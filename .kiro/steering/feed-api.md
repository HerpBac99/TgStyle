# API модуля Feed

## Обзор

Модуль Feed предоставляет API для работы с публичной лентой капсул других пользователей. API включает клиентские методы для загрузки ленты, пагинации, лайков и серверные endpoints для получения данных.

## Клиентские методы

### PublicFeedManager

**Файл:** `client/src/modules/publicFeed/PublicFeedManager.ts`

**Singleton:** `publicFeedManager`

#### open()

Открывает публичную ленту и загружает первую страницу с кэш-fallback.

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
import { publicFeedManager } from './modules/publicFeed/PublicFeedManager';

// Открыть ленту
await publicFeedManager.open();
```

**Flow выполнения:**
1. Инициализирует UI компонент `UIPublicFeed` с callbacks
2. Показывает контейнер ленты
3. Загружает из localStorage кэша (instant UI)
4. Загружает свежие данные с сервера в фоне
5. Обновляет отображение и сохраняет в кэш

**Интеграция:**
- Создает `UIPublicFeed` с callbacks для просмотра и загрузки
- Вызывает `loadInitialPage()` для загрузки данных
- Использует кэширование с TTL 5 минут

#### close()

Закрывает ленту и скрывает UI.

**Пример:**
```typescript
publicFeedManager.close();
```

#### refresh()

Обновляет ленту, сбрасывая пагинацию и перезагружая первую страницу.

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
await publicFeedManager.refresh();
```#### getSt
atus()

Получает текущее состояние менеджера ленты.

**Возвращает:** `object`

**Пример:**
```typescript
const status = publicFeedManager.getStatus();
console.log(status.currentPage); // 1
console.log(status.hasMore); // true
console.log(status.isLoading); // false
console.log(status.isOpen); // true
```

#### destroy()

Очищает ресурсы и сбрасывает состояние.

**Пример:**
```typescript
publicFeedManager.destroy();
```

### PublicFeedService

**Файл:** `client/src/modules/publicFeed/PublicFeedService.ts`

**Singleton:** `publicFeedService`

#### loadPublicCapsules(page?, limit?)

Загружает публичные капсулы с сервера с пагинацией.

**Параметры:**
- `page?: number` - Номер страницы (по умолчанию 1)
- `limit?: number` - Количество капсул на страницу (по умолчанию 20)

**Возвращает:** `Promise<PublicFeedResponse>`

**Пример:**
```typescript
import { publicFeedService } from './modules/publicFeed/PublicFeedService';

// Загрузить первую страницу
const response = await publicFeedService.loadPublicCapsules(1, 20);
console.log(response.capsules); // Массив капсул
console.log(response.pagination.hasMore); // Есть ли еще страницы

// Загрузить следующую страницу
const nextPage = await publicFeedService.loadPublicCapsules(2, 20);
```

**Интеграция:**
- Отправляет GET `/api/capsules/public?page=N&limit=M`
- Возвращает структурированный ответ с капсулами и пагинацией
- Логирует все операции через `logger`##
## toggleLike(capsuleId, currentlyLiked)

Переключает лайк на капсуле (делегирует в CapsuleLikesService).

**Параметры:**
- `capsuleId: number` - ID капсулы
- `currentlyLiked: boolean` - Текущий статус лайка

**Возвращает:** `Promise<{isLiked: boolean; likesCount: number}>`

**Пример:**
```typescript
const result = await publicFeedService.toggleLike(123, false);
console.log(result.isLiked); // true
console.log(result.likesCount); // 6
```

### UIPublicFeed

**Файл:** `client/src/modules/publicFeed/UIPublicFeed.ts`

#### constructor(callbacks)

Создает UI компонент ленты с callbacks.

**Параметры:**
- `callbacks: UIPublicFeedCallbacks` - Объект с методами `onView` и `onLoadMore`

**Пример:**
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
```

#### render(capsules, append?)

Рендерит капсулы в Instagram-style grid.

**Параметры:**
- `capsules: PublicCapsule[]` - Массив капсул для отображения
- `append?: boolean` - Добавить в конец (для пагинации) или заменить (по умолчанию false)

**Пример:**
```typescript
// Первая загрузка
uiFeed.render(capsules, false);

// Добавление следующей страницы
uiFeed.render(moreCapsules, true);
```####
 show() / hide()

Показывает или скрывает контейнер ленты.

**Пример:**
```typescript
uiFeed.show(); // Показать ленту
uiFeed.hide(); // Скрыть ленту
```

#### showLoading(show)

Показывает или скрывает индикатор загрузки.

**Параметры:**
- `show: boolean` - Показать или скрыть

**Пример:**
```typescript
uiFeed.showLoading(true); // Показать спиннер
uiFeed.showLoading(false); // Скрыть спиннер
```

#### destroy()

Очищает ресурсы, отключает Intersection Observer.

**Пример:**
```typescript
uiFeed.destroy();
```

### CapsuleLikesService

**Файл:** `client/src/modules/capsules/CapsuleLikesService.ts`

**Singleton:** `capsuleLikesService`

#### createLikeComponent(parentElement, capsuleId, initialData, componentClass?)

Создает полнофункциональный компонент лайков с оптимистичным обновлением.

**Параметры:**
- `parentElement: HTMLElement` - Родительский элемент
- `capsuleId: number` - ID капсулы
- `initialData: CapsuleLikeStatus` - Начальные данные `{isLiked, likesCount}`
- `componentClass?: string` - CSS класс для стилизации (например, 'feed')

**Пример:**
```typescript
import { capsuleLikesService } from './modules/capsules/CapsuleLikesService';

// В карточке ленты
capsuleLikesService.createLikeComponent(
  statsContainer,
  capsule.id,
  { isLiked: capsule.isLiked, likesCount: capsule.likesCount },
  'feed' // Добавит класс 'feed-like-btn'
);
```#
### toggleLike(capsuleId, isLiked)

Переключает лайк капсулы на сервере.

**Параметры:**
- `capsuleId: number` - ID капсулы
- `isLiked: boolean` - Новый статус лайка

**Возвращает:** `Promise<LikeApiResponse>`

**Пример:**
```typescript
const response = await capsuleLikesService.toggleLike(123, true);
console.log(response.success); // true
console.log(response.likesCount); // 6
```

#### getLikeStatus(capsuleId)

Получает текущий статус лайка капсулы.

**Параметры:**
- `capsuleId: number` - ID капсулы

**Возвращает:** `Promise<CapsuleLikeStatus | null>`

**Пример:**
```typescript
const status = await capsuleLikesService.getLikeStatus(123);
console.log(status?.isLiked); // false
console.log(status?.likesCount); // 5
```

## Серверные endpoints

### GET /api/capsules/public

Получает публичные капсулы с пагинацией и опциональной проверкой лайков.

**Параметры запроса (query):**
```typescript
{
  page?: number,    // Номер страницы (по умолчанию 1)
  limit?: number,   // Количество на страницу (по умолчанию 20)
  initData?: string // Telegram WebApp initData (опционально)
}
```

**Заголовки:**
```typescript
// Опциональная аутентификация через middleware optionalTelegramAuth
```

**Ответ (success):**
```typescript
{
  success: true,
  capsules: PublicCapsule[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number,
    hasMore: boolean
  }
}
```**Ответ
 (error):**
```typescript
{
  success: false,
  error: string
}
```

**Пример запроса:**
```javascript
// Без аутентификации
const response = await fetch('/api/capsules/public?page=1&limit=20');

// С аутентификацией для проверки лайков
const initData = window.Telegram.WebApp.initData;
const response = await fetch(`/api/capsules/public?page=1&limit=20&initData=${encodeURIComponent(initData)}`);

const result = await response.json();
console.log(result.capsules);
console.log(result.pagination.hasMore);
```

**Логика на сервере:**

1. **Опциональная аутентификация** - Middleware `optionalTelegramAuth`
   - Если есть initData - валидирует и устанавливает `req.telegramId`
   - Если нет initData - продолжает без авторизации

2. **Исключение собственных капсул**
   ```javascript
   where: currentUserTelegramId ? {
     telegramId: { not: currentUserTelegramId }
   } : undefined
   ```

3. **Сортировка по популярности и новизне**
   ```javascript
   orderBy: [
     { likesCount: 'desc' },  // Сначала по популярности
     { createdAt: 'desc' }     // Потом по новизне
   ]
   ```

4. **Проверка лайков пользователя**
   - Если авторизован - загружает лайки и устанавливает `isLiked`
   - Если не авторизован - `isLiked: false` для всех

5. **Пагинация**
   ```javascript
   const skip = (page - 1) * limit;
   const hasMore = skip + limit < total;
   ```

**Интеграция:**
- `FileService.getImageUrl()` - Формирование URL изображений
- `Prisma` - ORM для работы с БД
- `optionalTelegramAuth` - Middleware для опциональной авторизации#
## POST /api/capsule-likes/:capsuleId

Ставит лайк капсуле.

**Параметры URL:**
- `capsuleId: number` - ID капсулы

**Параметры запроса (body):**
```typescript
{
  initData: string  // Telegram WebApp initData
}
```

**Ответ (success):**
```typescript
{
  success: true,
  isLiked: true,
  likesCount: number
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string,
  isLiked?: boolean,
  likesCount?: number
}
```

**Коды ошибок:**
- `400` - Уже лайкнуто или отсутствуют параметры
- `401` - Невалидная аутентификация
- `404` - Пользователь или капсула не найдены
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const response = await fetch('/api/capsule-likes/123', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    initData: window.Telegram.WebApp.initData
  })
});

const result = await response.json();
console.log(result.likesCount);
```

**Обработка на сервере:**

1. Валидация Telegram initData
2. Получение пользователя из БД
3. Проверка существования капсулы
4. Проверка не лайкнул ли уже
5. Атомарная транзакция:
   - Создание записи в `CapsuleLike`
   - Инкремент `likesCount` в `Capsule`
6. Возврат нового статуса#
## DELETE /api/capsule-likes/:capsuleId

Удаляет лайк с капсулы.

**Параметры URL:**
- `capsuleId: number` - ID капсулы

**Параметры запроса (query):**
```typescript
{
  initData: string  // Telegram WebApp initData
}
```

**Ответ (success):**
```typescript
{
  success: true,
  isLiked: false,
  likesCount: number
}
```

**Ответ (error):**
```typescript
{
  success: false,
  error: string,
  isLiked?: boolean,
  likesCount?: number
}
```

**Коды ошибок:**
- `404` - Лайк не найден
- `401` - Невалидная аутентификация
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const initData = encodeURIComponent(window.Telegram.WebApp.initData);
const response = await fetch(`/api/capsule-likes/123?initData=${initData}`, {
  method: 'DELETE'
});

const result = await response.json();
console.log(result.likesCount);
```

**Обработка на сервере:**

1. Валидация initData
2. Получение пользователя из БД
3. Проверка существования лайка
4. Атомарная транзакция:
   - Удаление записи из `CapsuleLike`
   - Декремент `likesCount` в `Capsule`
5. Возврат нового статуса### GET /ap
i/capsule-likes/:capsuleId/status

Получает статус лайка для текущего пользователя.

**Параметры URL:**
- `capsuleId: number` - ID капсулы

**Параметры запроса (query):**
```typescript
{
  initData?: string  // Telegram WebApp initData (опционально)
}
```

**Ответ:**
```typescript
{
  success: true,
  isLiked: boolean,
  likesCount: number
}
```

**Коды ошибок:**
- `404` - Капсула не найдена
- `500` - Внутренняя ошибка сервера

**Пример запроса:**
```javascript
const initData = encodeURIComponent(window.Telegram.WebApp.initData);
const response = await fetch(`/api/capsule-likes/123/status?initData=${initData}`);

const result = await response.json();
console.log(result.isLiked);
console.log(result.likesCount);
```

**Обработка на сервере:**

1. Получение `Capsule` с `likesCount`
2. Если нет initData - возвращает `isLiked: false`
3. Валидация initData (если есть)
4. Получение пользователя из БД
5. Проверка наличия лайка в таблице `CapsuleLike`
6. Возврат статуса

## Примеры использования

### Полный flow загрузки ленты

```typescript
import { publicFeedManager } from './modules/publicFeed/PublicFeedManager';

// Открыть ленту
await publicFeedManager.open();

// Проверить статус
const status = publicFeedManager.getStatus();
console.log(`Страница: ${status.currentPage}, Есть еще: ${status.hasMore}`);

// Обновить ленту
await publicFeedManager.refresh();

// Закрыть ленту
publicFeedManager.close();
```#
## Создание UI компонента

```typescript
import { UIPublicFeed } from './modules/publicFeed/UIPublicFeed';
import { uiModalManager } from './modules/uiModalManager';

const uiFeed = new UIPublicFeed({
  onView: (capsule) => {
    console.log('Viewing capsule:', capsule.id);
    
    if (!capsule.thumbnailUrl) {
      alert('У этой капсулы нет изображения');
      return;
    }
    
    // Показать полноэкранное превью
    const fullImageUrl = BASE_URL + capsule.thumbnailUrl;
    uiModalManager.showCapsulePreview(fullImageUrl, () => {
      console.log('Preview closed');
    });
  },
  onLoadMore: async () => {
    console.log('Loading more capsules...');
    // Загрузить следующую страницу через publicFeedManager
  }
});

// Показать контейнер
uiFeed.show();

// Рендер капсул
uiFeed.render(capsules, false);

// Добавить капсулы (пагинация)
uiFeed.render(moreCapsules, true);
```

### Работа с лайками

```typescript
import { capsuleLikesService } from './modules/capsules/CapsuleLikesService';

// Создать компонент лайков в карточке ленты
const statsContainer = document.querySelector('.feed-item-stats');
capsuleLikesService.createLikeComponent(
  statsContainer,
  capsule.id,
  {
    isLiked: capsule.isLiked,
    likesCount: capsule.likesCount
  },
  'feed' // CSS класс для стилизации
);

// Ручное переключение лайка
const result = await capsuleLikesService.toggleLike(capsule.id, true);
console.log(`Лайков: ${result.likesCount}`);

// Получить статус лайка
const status = await capsuleLikesService.getLikeStatus(capsule.id);
console.log(`Лайкнуто: ${status?.isLiked}`);
```### Паг
инация

```typescript
import { publicFeedService } from './modules/publicFeed/PublicFeedService';

// Загрузить первую страницу
const firstPage = await publicFeedService.loadPublicCapsules(1, 20);
console.log(`Загружено: ${firstPage.capsules.length}`);
console.log(`Всего страниц: ${firstPage.pagination.pages}`);
console.log(`Есть еще: ${firstPage.pagination.hasMore}`);

// Загрузить следующую страницу
if (firstPage.pagination.hasMore) {
  const secondPage = await publicFeedService.loadPublicCapsules(2, 20);
  console.log(`Загружено еще: ${secondPage.capsules.length}`);
}

// Infinite scroll через UI компонент
const uiFeed = new UIPublicFeed({
  onView: (capsule) => { /* ... */ },
  onLoadMore: async () => {
    // Автоматически вызывается при достижении конца ленты
    const nextPage = await publicFeedService.loadPublicCapsules(currentPage + 1);
    uiFeed.render(nextPage.capsules, true); // append = true
  }
});
```

### Прямой вызов API

```typescript
// Загрузка капсул без аутентификации
const response = await fetch('/api/capsules/public?page=1&limit=10');
const result = await response.json();

result.capsules.forEach(capsule => {
  console.log(`${capsule.name} от ${capsule.author.firstName}`);
  console.log(`Лайков: ${capsule.likesCount}, Вещей: ${capsule.itemCount}`);
});

// Загрузка с проверкой лайков
const initData = window.Telegram.WebApp.initData;
const authResponse = await fetch(`/api/capsules/public?page=1&limit=10&initData=${encodeURIComponent(initData)}`);
const authResult = await authResponse.json();

authResult.capsules.forEach(capsule => {
  console.log(`Лайкнуто мной: ${capsule.isLiked}`);
});

// Лайк капсулы
const likeResponse = await fetch('/api/capsule-likes/123', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ initData: window.Telegram.WebApp.initData })
});

const likeResult = await likeResponse.json();
console.log(`Новое количество лайков: ${likeResult.likesCount}`);
```## 
Типы данных

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
  isLiked: boolean;        // Только если авторизован
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

### UIPublicFeedCallbacks

```typescript
interface UIPublicFeedCallbacks {
  onView: (capsule: PublicCapsule) => void;
  onLoadMore: () => Promise<void>;
}
```## О
птимизации и best practices

### Кэширование первой страницы

Первая страница кэшируется в localStorage с TTL 5 минут для instant UI:

```typescript
// Мгновенная отрисовка из кэша
const cachedCapsules = this.loadFromCache();
if (cachedCapsules) {
  this.uiFeed.render(cachedCapsules, false);
}

// Фоновое обновление с сервера
const response = await publicFeedService.loadPublicCapsules(1);
this.saveToCache(response.capsules);
this.uiFeed.render(response.capsules, false);
```

### Оптимистичное обновление лайков

Лайки обновляются мгновенно без ожидания ответа сервера:

```typescript
// 1. Мгновенное обновление UI
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

### Infinite Scroll с предзагрузкой

Intersection Observer с rootMargin для плавного скролла:

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
```

### Instagram-style Grid

Чередование больших и маленьких элементов по паттерну:

```typescript
const positionInPattern = index % 10;

if (positionInPattern === 0 || positionInPattern === 7) {
  card.classList.add('feed-item-large');
  card.style.gridRow = 'span 2';
}
```

### Защита от дублирования запросов

Флаги для предотвращения параллельных запросов:

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