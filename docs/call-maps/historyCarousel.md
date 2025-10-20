### Жизненный цикл карусели истории (`history-carousel-container`)

Карусель истории — это динамический компонент, который отображает прошлые анализы пользователя. Его работа основана на четком разделении ответственности между модулями: `historyManager` управляет данными, а `uiMenuManager` отвечает за их визуализацию.

#### 1. Инициализация и загрузка данных

1.  **`main.ts`**: При запуске приложения метод `app.initialize()` параллельно запускает два ключевых процесса:
    *   **`initializeUI()`**: Вызывает `uiManager.init()`, который, в свою очередь, вызывает `uiMenuManager.init()`. На этом этапе подготавливаются DOM-элементы и устанавливаются обработчики событий для карусели (например, свайпы).
    *   **`preloadAppData()`**: Вызывает `historyManager.loadHistoryFromServer()`. Этот метод отправляет GET-запрос на сервер (`/history`) для получения списка анализов.

2.  **`history.ts`**:
    *   `loadHistoryFromServer()` получает данные с сервера.
    *   Сохраняет их в локальном массиве `this.history` и кэширует в `localStorage`.
    *   **Ключевой шаг**: После успешной загрузки `historyManager` генерирует глобальное событие `window.dispatchEvent(new CustomEvent('history:updated'))`, сигнализируя всему приложению, что данные истории обновились.

#### 2. Отрисовка и обновление UI

1.  **`uiManager.ts`**: Этот модуль не слушает событие `history:updated` напрямую. Вместо этого, обновление происходит по другой логике:
    *   В `main.ts`, после завершения `preloadAppData`, вызывается `uiManager.init()`.
    *   Внутри `uiManager.init()` вызывается метод `this.updateHistoryDisplay()`.
    *   Этот метод является прокси и напрямую вызывает `uiMenuManager.updateHistoryDisplay()`.

2.  **`uiMenu.ts`**:
    *   **`updateHistoryDisplay()`** — это центральный метод, отвечающий за отрисовку карусели.
    *   Он получает актуальные данные из `historyManager.getAllItems()`.
    *   Данные сортируются в обратном порядке (`.reverse()`), чтобы новые анализы были справа.
    *   Вызывается приватный метод **`createCarouselCards(sortedItems)`**.

#### 3. Создание карточек карусели

1.  **`createCarouselCards(items)`**:
    *   Находит DOM-элемент карусели (`#history-carousel-container`) и полностью **очищает** его (`carousel.innerHTML = ''`).
    *   Определяет общее количество карточек: `items.length + 1` (одна дополнительная карточка для добавления нового фото).
    *   В цикле для каждого элемента данных (и для одной пустой ячейки) вызывается метод `createCard(index, data)`.

2.  **`createCard(index, data)`**:
    *   Создает `div` с классом `history-card`.
    *   Если `data` существует (это не пустая ячейка):
        *   Вызывается `setupFilledCard()`.
        *   Карточке добавляется фоновое изображение (`backgroundImage`) на основе `data.photoPath` и `data.telegramId`.
        *   Создается подпись (`.history-card-caption`) с датой и блоком лайков.
        *   На карточку вешаются обработчики: `click` для просмотра анализа (`showSavedAnalysis`) и `long-press` для входа в режим удаления.
    *   Если `data` равно `null` (пустая ячейка):
        *   Вызывается `setupEmptyCard()`.
        *   Внутрь добавляется кнопка с иконкой "+".
        *   На карточку вешается обработчик `click`, который вызывает `handleHistoryCellClick()`, что в конечном итоге приводит к открытию камеры.

3.  **Позиционирование**:
    *   После создания всех карточек вызывается `positionCarousel()`, который вычисляет `transform: translateX(...)` для контейнера карусели, чтобы последняя (самая новая) или пустая карточка оказалась в центре экрана.

#### Схема вызовов

```mermaid
graph TD
    subgraph "1. Запуск приложения"
        A[main.ts: initialize] --> B[uiManager.init];
        A --> C[historyManager.loadHistoryFromServer];
    end

    subgraph "2. Загрузка данных"
        C --> D[GET /history];
        D --> E[historyManager сохраняет данные];
        E --> F[dispatch('history:updated')];
    end
    
    subgraph "3. Отрисовка UI"
        B --> G[uiMenuManager.init];
        G --> H[uiMenuManager.updateHistoryDisplay];
        H --> I[historyManager.getAllItems];
        I --> J[uiMenuManager.createCarouselCards];
        J --> K[Создание и добавление карточек в DOM];
        K --> L[uiMenuManager.positionCarousel];
    end

    F -.-> M((Событие history:updated НЕ используется для первичной отрисовки));

```
