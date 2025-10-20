### План рефакторинга системы лайков

**Цель:** Создать единый, переиспользуемый сервис для управления UI и логикой лайков, чтобы устранить дублирование кода и повысить надежность системы.

---

#### **Шаг 1: Создание универсального UI-сервиса в `AnalysisLikesService.ts`**

**Задача:** Превратить `AnalysisLikesService` в полноценный сервис, управляющий не только API-запросами, но и созданием DOM-компонентов.

1.  **Файл:** `client/src/modules/analysis/AnalysisLikesService.ts`
2.  **Новый публичный метод:** `createLikeComponent`
    *   **Назначение:** Станет единой точкой входа для создания компонента лайков в любом месте приложения.
    *   **Аргументы:**
        *   `parentElement: HTMLElement`: DOM-элемент, куда будет встроен компонент.
        *   `entityId: number`: ID сущности (на данный момент `historyItemId`).
        *   `initialData: { isLiked: boolean, likesCount: number }`: Начальные данные для мгновенной отрисовки.
    *   **Внутренняя логика:**
        1.  **Создание DOM:** Создает `div.likes-container`, `button.like-btn` и `span.likes-count` с необходимыми классами и иконками.
        2.  **Начальная отрисовка:** Устанавливает начальное количество лайков и класс `liked` на основе `initialData`.
        3.  **Добавление в DOM:** Вставляет готовый компонент в `parentElement`.
        4.  **Обработчик клика (с оптимистичным UI):**
            *   При клике **немедленно** обновляет UI (инкрементирует/декрементирует счетчик, переключает класс `liked`).
            *   Асинхронно вызывает соответствующий метод API (`likeAnalysis` или `unlikeAnalysis`).
            *   В блоке `catch` (при ошибке сервера) **молча откатывает UI** к предыдущему состоянию и логирует ошибку.

---

#### **Шаг 2: Рефакторинг карусели истории в `uiMenu.ts`**

**Задача:** Заменить текущую реализацию лайков в карусели на вызов нового сервиса.

1.  **Файл:** `client/src/modules/uiMenu.ts`
2.  **Метод:** `setupFilledCard()`
3.  **Действия:**
    *   Полностью **удалить** код, создающий `.carousel-likes-container` и его содержимое.
    *   Полностью **удалить** метод `handleCarouselLikeClick`.
    *   В `setupFilledCard()` добавить один вызов нового сервиса:
        ```typescript
        analysisLikesService.createLikeComponent(
          caption, // Родительский элемент
          data.id,
          { isLiked: !!data.isLiked, likesCount: data.likesCount || 0 }
        );
        ```

---

#### **Шаг 3: Интеграция в экран результата анализа в `uiAnalysis.ts`**

**Задача:** Добавить компонент лайков в блок с действиями на экране показа результата анализа.

1.  **Файл:** `client/src/modules/uiAnalysis.ts`
2.  **Метод:** `showAnalysisResult()`
3.  **Действия:**
    *   Найти DOM-элемент `.result-actions`.
    *   Очистить его перед добавлением новых кнопок.
    *   Получить актуальные данные о лайках из `historyManager.getItemById(historyItemId)`.
    *   Вызвать новый сервис для создания компонента:
        ```typescript
        const resultActions = getElement(DOM_SELECTORS.RESULT_ACTIONS);
        if (resultActions && historyItemId) {
          const historyItem = historyManager.getItemById(historyItemId);
          if (historyItem) {
            analysisLikesService.createLikeComponent(
              resultActions,
              historyItemId,
              { isLiked: !!historyItem.isLiked, likesCount: historyItem.likesCount || 0 }
            );
          }
        }
        ```

---

#### **Шаг 4: Рефакторинг экрана "Поделиться" в `uiCore.ts`**

**Задача:** Заменить текущую реализацию лайков на экране "поделиться" на вызов нового сервиса.

1.  **Файл:** `client/src/modules/uiCore.ts`
2.  **Метод:** `showSharedAnalysis()`
3.  **Действия:**
    *   Найти и **удалить** существующий код, который создает и обрабатывает кнопку лайка.
    *   Найти родительский контейнер для кнопок (`#shared-analysis-actions`).
    *   Получить начальные данные о лайках (они приходят с сервера в этом методе).
    *   Вызвать новый сервис:
        ```typescript
        const actionsContainer = getElement('#shared-analysis-actions');
        if (actionsContainer && historyItemId) {
          // ... (получаем initialLikeStatus из ответа сервера)
          analysisLikesService.createLikeComponent(
            actionsContainer,
            historyItemId,
            initialLikeStatus
          );
        }
        ```
