# Публичная лента (Feed) - Ключевые функции

## Последовательность выполнения методов

### 1. Переключение на вкладку ленты
- **Класс**: `UIManager` (uiManager.ts)
- **Метод**: `handleTabSwitch('feed')`
- **Описание**: Скрывает все вкладки и показывает feed-content

### 2. Открытие публичной ленты
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `open()`
- **Описание**: Инициализирует UI компонент и загружает первую страницу

### 3. Инициализация UI компонента
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `new UIPublicFeed(callbacks)`
- **Описание**: Создает экземпляр UIPublicFeed с callbacks для просмотра и загрузки

### 4. Показ контейнера ленты
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `show()`
- **Описание**: Отображает контейнер feed-content

### 5. Инициализация DOM структуры
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `initializeDOM()`
- **Описание**: Создает хедер, grid контейнер и loading индикатор

### 6. Загрузка первой страницы
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `loadInitialPage()`
- **Описание**: Загружает капсулы из кэша (instant UI) и затем с сервера

### 7. Загрузка из кэша
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `loadFromCache()`
- **Описание**: Проверяет localStorage кэш (TTL 5 минут)

### 8. Рендеринг из кэша
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `render(capsules, append=false)`
- **Описание**: Мгновенно отображает капсулы из кэша

### 9. Показ loading индикатора
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `showLoading(true)`
- **Описание**: Показывает спиннер загрузки

### 10. Загрузка капсул с сервера
- **Класс**: `PublicFeedService` (PublicFeedService.ts)
- **Метод**: `loadPublicCapsules(page, limit)`
- **Описание**: API запрос GET /capsules/public?page=1&limit=20

### 11. API запрос
- **Класс**: `API` (api.ts)
- **Метод**: `get('/capsules/public?page=1&limit=20')`
- **Описание**: Отправляет запрос на сервер с параметрами пагинации

### 12. Сохранение в кэш
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `saveToCache(capsules)`
- **Описание**: Сохраняет капсулы в localStorage с timestamp

### 13. Рендеринг свежих данных
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `render(capsules, append=false)`
- **Описание**: Обновляет отображение свежими данными с сервера

### 14. Создание карточек капсул
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `createCapsuleCard(capsule, index)`
- **Описание**: Создает карточку с Instagram-style позиционированием

### 15. Определение позиции в паттерне
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `createCapsuleCard()` (внутренняя логика)
- **Описание**: Вычисляет позицию элемента по паттерну (большие/маленькие карточки)

### 16. Создание изображения карточки
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `createCapsuleCard()` (создание imageDiv)
- **Описание**: Создает img элемент с lazy loading

### 17. Создание overlay карточки
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `createCapsuleCard()` (создание overlay)
- **Описание**: Добавляет автора и статистику поверх изображения

### 18. Создание компонента лайков
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `createLikeComponent(stats, capsuleId, {isLiked, likesCount}, 'feed')`
- **Описание**: Создает кнопку лайка с счетчиком для карточки

### 19. Настройка обработчика клика на карточку
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `card.addEventListener('click')`
- **Описание**: Подключает обработчик для просмотра капсулы

### 20. Настройка infinite scroll
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `setupInfiniteScroll()`
- **Описание**: Создает Intersection Observer для последнего элемента

### 21. Скрытие loading индикатора
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `showLoading(false)`
- **Описание**: Скрывает спиннер после загрузки

### 22. Обработка клика по карточке
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `callbacks.onView(capsule)`
- **Описание**: Вызывает callback для просмотра капсулы

### 23. Обработка просмотра капсулы
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `handleViewCapsule(capsule)`
- **Описание**: Проверяет наличие изображения и строит полный URL

### 24. Показ превью капсулы
- **Класс**: `UIModalManager` (uiModalManager.ts)
- **Метод**: `showCapsulePreview(fullImageUrl, onClose)`
- **Описание**: Открывает модальное окно с полноэкранным изображением

### 25. Обработка клика по кнопке лайка
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `likeBtn.addEventListener('click')`
- **Описание**: Обрабатывает клик с остановкой всплытия события

### 26. Оптимистичное обновление лайка
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `updateLikeButton(likeBtn, likesCountEl, newState)`
- **Описание**: Мгновенно обновляет UI до ответа сервера

### 27. Переключение лайка на сервере
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `toggleLike(capsuleId, isLiked)`
- **Описание**: Отправляет POST или DELETE запрос на сервер

### 28. API запрос лайка
- **Класс**: `API` (api.ts)
- **Метод**: `post('/capsule-likes/:id')` или `delete('/capsule-likes/:id')`
- **Описание**: Отправляет запрос с initData для аутентификации

### 29. Синхронизация с ответом сервера
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `updateLikeButton()` (повторно)
- **Описание**: Обновляет UI если данные сервера отличаются

### 30. Обработка ошибки лайка
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `updateLikeButton()` (откат)
- **Описание**: Откатывает изменения UI при ошибке

### 31. Достижение конца ленты
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `IntersectionObserver callback`
- **Описание**: Срабатывает когда последний элемент становится видимым

### 32. Загрузка следующей страницы
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `loadMore()`
- **Описание**: Проверяет флаги isLoading и hasMore перед загрузкой

### 33. Показ loading для пагинации
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `showLoading(true)`
- **Описание**: Показывает спиннер внизу ленты

### 34. Увеличение номера страницы
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `this.currentPage++`
- **Описание**: Инкрементирует счетчик страниц

### 35. Загрузка следующей страницы с сервера
- **Класс**: `PublicFeedService` (PublicFeedService.ts)
- **Метод**: `loadPublicCapsules(page, limit)`
- **Описание**: API запрос GET /capsules/public?page=N&limit=20

### 36. Обновление флага hasMore
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `this.hasMore = response.pagination.hasMore`
- **Описание**: Сохраняет информацию о наличии следующих страниц

### 37. Рендеринг новых капсул
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `render(capsules, append=true)`
- **Описание**: Добавляет новые карточки в конец грида

### 38. Добавление карточек в DOM
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `gridContainer.appendChild(card)`
- **Описание**: Добавляет каждую новую карточку в grid

### 39. Обновление Intersection Observer
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `setupInfiniteScroll()`
- **Описание**: Переподключает observer к новому последнему элементу

### 40. Скрытие loading после пагинации
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `showLoading(false)`
- **Описание**: Скрывает спиннер после загрузки страницы

### 41. Обработка ошибки загрузки
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `this.currentPage--` (откат)
- **Описание**: Откатывает номер страницы при ошибке

### 42. Обновление ленты (refresh)
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `refresh()`
- **Описание**: Сбрасывает состояние и перезагружает первую страницу

### 43. Закрытие ленты
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `close()`
- **Описание**: Скрывает контейнер ленты

### 44. Скрытие контейнера
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `hide()`
- **Описание**: Устанавливает display: none для feed-content

### 45. Получение статуса менеджера
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `getStatus()`
- **Описание**: Возвращает currentPage, hasMore, isLoading, isOpen

### 46. Очистка ресурсов
- **Класс**: `PublicFeedManager` (PublicFeedManager.ts)
- **Метод**: `destroy()`
- **Описание**: Очищает UI компонент и сбрасывает состояние

### 47. Отключение Intersection Observer
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `observer.disconnect()`
- **Описание**: Отключает observer при очистке

### 48. Очистка грида
- **Класс**: `UIPublicFeed` (UIPublicFeed.ts)
- **Метод**: `gridContainer.innerHTML = ''`
- **Описание**: Удаляет все карточки из DOM

## Важные особенности

### Оптимизация производительности
- **Кэширование**: Первая загрузка из localStorage (TTL 5 минут) для instant UI
- **Lazy loading**: Изображения загружаются с атрибутом loading="lazy"
- **Infinite scroll**: Автоматическая подгрузка при достижении конца ленты
- **Пагинация**: Загрузка по 20 капсул за раз

### Instagram-style layout
- **Паттерн A (0-4)**: Большой элемент слева (2 строки), маленькие справа
- **Паттерн B (5-9)**: Маленькие слева, большой элемент справа (2 строки)
- **Повторение**: Паттерн повторяется каждые 10 элементов
- **Grid**: 3 колонки с автоматическим позиционированием

### Оптимистичное обновление
- **Лайки**: UI обновляется мгновенно, синхронизация с сервером в фоне
- **Откат**: Автоматический откат изменений при ошибке
- **Анимация**: Плавная анимация кнопки лайка (300ms)

### Обработка ошибок
- **Graceful degradation**: Использование кэша при сетевых ошибках
- **Откат пагинации**: Декремент currentPage при ошибке загрузки
- **Валидация**: Проверка наличия изображения перед показом превью

### Интеграция с другими модулями
- **UIModalManager**: Показ полноэкранного превью капсулы
- **CapsuleLikesService**: Универсальный компонент лайков
- **API**: Централизованные HTTP запросы с аутентификацией

### Кэширование
- **localStorage**: Первые 20 капсул с timestamp
- **TTL**: 5 минут для кэша
- **Инвалидация**: Автоматическая очистка устаревшего кэша

### Пагинация
- **Размер страницы**: 20 капсул
- **Infinite scroll**: Intersection Observer с rootMargin 100px
- **Флаг hasMore**: Контроль наличия следующих страниц
- **Защита от дублирования**: Флаг isLoading предотвращает параллельные запросы
