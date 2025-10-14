# TgStyle Main Menu - Carousel History Documentation

## Обзор модуля uiMenu.ts

Модуль `uiMenu.ts` управляет главным меню главной закладки, включая карусель истории анализов, навигацию, долгосрочное нажатие для удаления элементов и обработку взаимодействия пользователя с историей.

## Основные компоненты

### Класс UIMenuManager

Центральный класс для управления главным меню и каруселью истории.

#### Конструктор UIMenuManager()
```typescript
constructor() {
  this.initializeElements();
  this.setupEventListeners();
}
```
**Теги поиска:** `ui_menu_constructor`, `carousel_initialization`, `dom_elements_setup`

**Что делает:**
- Инициализирует DOM элементы
- Настраивает обработчики событий
- Создает единственный экземпляр `uiMenuManager`

**Параметры:** нет

**Возвращает:** нет (конструктор)

#### initializeElements(): void
```typescript
private initializeElements(): void {
  this.elements = {
    userName: getElement(DOM_SELECTORS.USER_NAME),
    userPhoto: getElement(DOM_SELECTORS.USER_PHOTO),
    cameraBtn: getElement<HTMLButtonElement>(DOM_SELECTORS.CAMERA_BTN),
    historyCells: getElements(DOM_SELECTORS.HISTORY_CARDS),
    appContainer: getElement(DOM_SELECTORS.APP_CONTAINER),
  };
  logger.info('Menu DOM elements initialized', {
    hasUserName: !!this.elements.userName,
    hasUserPhoto: !!this.elements.userPhoto,
    hasCameraBtn: !!this.elements.cameraBtn,
    historyCellsCount: this.elements.historyCells.length,
    hasAppContainer: !!this.elements.appContainer,
  });
}
```
**Теги поиска:** `dom_elements_init`, `ui_selectors`, `element_caching`, `logging_elements`

**Что делает:**
- Кэширует ссылки на DOM элементы для быстрого доступа
- Логирует найденные элементы для отладки
- Использует константы селекторов из `DOM_SELECTORS`

**Параметры:** нет

**Возвращает:** void

#### setupEventListeners(): void
```typescript
private setupEventListeners(): void {
  window.addEventListener('history:updated', () => {
    logger.info('History updated from server, refreshing carousel');
    this.updateHistoryDisplay();
  });
  this.setupCameraButtonListener();
  this.setupGlobalEventListeners();
  logger.info('Menu event listeners setup completed');
}
```
**Теги поиска:** `event_listeners_setup`, `history_update_listener`, `camera_button_setup`, `global_listeners`

**Что делает:**
- Устанавливает обработчик обновления истории с сервера
- Настраивает кнопку камеры
- Устанавливает глобальные обработчики
- Логирует завершение настройки

**Параметры:** нет

**Возвращает:** void

## Управление историей

#### updateHistoryDisplay(): void
```typescript
updateHistoryDisplay(): void {
  const filledItems = historyManager.getFilledItems();
  const sortedItems = [...filledItems].reverse();
  logger.info('Updating history display', {
    filledItems: sortedItems.length,
    currentCenter: this.carouselState.currentCenterIndex
  });
  this.createCarouselCards(sortedItems);
  this.positionCarousel();
  this.updateCarouselNavigation();
}
```
**Теги поиска:** `history_display_update`, `carousel_refresh`, `filled_items_get`, `carousel_positioning`

**Что делает:**
- Получает заполненные элементы истории
- Реверсирует массив (старые → новые для карусели)
- Создает карты карусели
- Позиционирует карусель
- Обновляет навигацию

**Параметры:** нет

**Возвращает:** void

#### createCarouselCards(filledItems: HistoryItem[]): void
```typescript
private createCarouselCards(filledItems: HistoryItem[]): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  carousel.innerHTML = '';
  const totalCards = Math.max(1, filledItems.length + 1);
  this.carouselState.totalCards = totalCards;
  for (let i = 0; i < totalCards; i++) {
    const card = this.createCard(i, filledItems[i] || null);
    carousel.appendChild(card);
  }
  this.elements.historyCells = getElements(DOM_SELECTORS.HISTORY_CARDS);
  logger.info('Carousel cards created', { totalCards, filledItems: filledItems.length });
}
```
**Теги поиска:** `carousel_cards_create`, `dynamic_cards_generation`, `empty_card_creation`, `carousel_dom_update`

**Что делает:**
- Очищает контейнер карусели
- Создает минимум 1 карту (пустую для новых фото)
- Генерирует карты для каждого элемента истории + пустую
- Обновляет кэш элементов historyCells

**Параметры:**
- `filledItems: HistoryItem[]` - заполненные элементы истории

**Возвращает:** void

#### createCard(index: number, data: HistoryItem | null): HTMLElement
```typescript
private createCard(index: number, data: HistoryItem | null): HTMLElement {
  const card = this.createCardElement(index);
  const content = this.createCardContent();
  if (data && !data.isEmpty) {
    this.setupFilledCard(card, content, data);
  } else {
    this.setupEmptyCard(card, content, index);
  }
  card.appendChild(content);
  return card;
}
```
**Теги поиска:** `card_creation`, `filled_card_setup`, `empty_card_setup`, `card_content_assembly`

**Что делает:**
- Создает базовый элемент карты
- Создает контейнер контента
- Настраивает как заполненную или пустую карту
- Собирает и возвращает готовую карту

**Параметры:**
- `index: number` - индекс карты
- `data: HistoryItem | null` - данные истории или null

**Возвращает:** HTMLElement - готовая карта карусели

#### setupFilledCard(card: HTMLElement, content: HTMLElement, data: HistoryItem): void
```typescript
private setupFilledCard(card: HTMLElement, content: HTMLElement, data: HistoryItem): void {
  card.classList.add(CSS_CLASSES.FILLED);
  if (data.photoUrl) {
    card.style.backgroundImage = `url(${data.photoUrl})`;
  } else if (data.photo || data.photoData) {
    const photoData = data.photo || data.photoData;
    card.style.backgroundImage = `url(data:image/jpeg;base64,${photoData})`;
  }
  const caption = createElement('div', {
    class: 'history-card-caption',
  }, formatHistoryDate(data.timestamp));
  content.appendChild(caption);
  const realIndex = this.findRealHistoryIndex(data);
  this.addLongPressHandlers(card, realIndex);
  card.onclick = () => this.showSavedAnalysis(data);
}
```
**Теги поиска:** `filled_card_setup`, `background_image_set`, `caption_add`, `long_press_setup`, `click_handler_setup`

**Что делает:**
- Добавляет класс `filled` к карте
- Устанавливает фоновое изображение (приоритет photoUrl)
- Создает подпись с датой
- Настраивает обработчики долгого нажатия
- Устанавливает обработчик клика для показа анализа

**Параметры:**
- `card: HTMLElement` - элемент карты
- `content: HTMLElement` - контейнер контента
- `data: HistoryItem` - данные истории

**Возвращает:** void

#### setupEmptyCard(card: HTMLElement, content: HTMLElement, index: number): void
```typescript
private setupEmptyCard(card: HTMLElement, content: HTMLElement, index: number): void {
  const addButton = this.createAddButton();
  content.appendChild(addButton);
  card.onclick = () => this.handleHistoryCellClick(index);
}
```
**Теги поиска:** `empty_card_setup`, `add_button_create`, `empty_card_click_handler`

**Что делает:**
- Создает кнопку добавления для пустой карты
- Устанавливает обработчик клика для открытия камеры

**Параметры:**
- `card: HTMLElement` - элемент карты
- `content: HTMLElement` - контейнер контента
- `index: number` - индекс карты

**Возвращает:** void

#### createAddButton(): HTMLElement
```typescript
private createAddButton(): HTMLElement {
  const addButton = createElement('div', {
    class: 'add-analysis',
  });
  addButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12h14"></path>
    </svg>
  `;
  return addButton;
}
```
**Теги поиска:** `add_button_create`, `plus_icon_svg`, `empty_card_ui`

**Что делает:**
- Создает элемент кнопки добавления
- Добавляет SVG иконку плюса
- Возвращает готовую кнопку

**Параметры:** нет

**Возвращает:** HTMLElement - кнопка добавления

## Позиционирование карусели

#### positionCarousel(): void
```typescript
private positionCarousel(): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  const filledCount = historyManager.getFilledCount();
  if (filledCount === 0) {
    this.carouselState.currentCenterIndex = 0;
  } else {
    this.carouselState.currentCenterIndex = Math.min(filledCount, this.carouselState.totalCards - 1);
  }
  const offset = -this.carouselState.currentCenterIndex * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;
  carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;
  this.updateCenterCard();
  logger.info('Carousel positioned', {
    centerIndex: this.carouselState.currentCenterIndex,
    offset,
    filledCount
  });
}
```
**Теги поиска:** `carousel_positioning`, `center_card_calculation`, `transform_calculation`, `carousel_offset`

**Что делает:**
- Определяет центральную карту (пустая при первом запуске)
- Рассчитывает смещение для центрирования
- Применяет CSS transform
- Обновляет класс центральной карты

**Параметры:** нет

**Возвращает:** void

#### updateCenterCard(): void
```typescript
private updateCenterCard(): void {
  const cards = getElements(DOM_SELECTORS.HISTORY_CARDS);
  cards.forEach((card, index) => {
    if (index === this.carouselState.currentCenterIndex) {
      card.classList.add('center');
    } else {
      card.classList.remove('center');
    }
  });
}
```
**Теги поиска:** `center_card_update`, `active_card_class`, `carousel_state_sync`

**Что делает:**
- Добавляет класс `center` к центральной карте
- Убирает класс `center` у остальных карт

**Параметры:** нет

**Возвращает:** void

## Навигация карусели

#### updateCarouselNavigation(): void
```typescript
private updateCarouselNavigation(): void {
  const dotsContainer = getElement(DOM_SELECTORS.CAROUSEL_DOTS);
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';
  if (this.carouselState.totalCards > 1) {
    for (let i = 0; i < this.carouselState.totalCards; i++) {
      const dot = createElement('div', {
        class: `dot${i === this.carouselState.currentCenterIndex ? ' active' : ''}`,
        'data-dot': i.toString(),
      });
      dot.addEventListener('click', () => this.moveCarouselToPosition(i));
      dotsContainer.appendChild(dot);
    }
  }
  logger.info('Carousel navigation updated', {
    totalCards: this.carouselState.totalCards,
    currentCenter: this.carouselState.currentCenterIndex
  });
}
```
**Теги поиска:** `carousel_navigation_update`, `dots_creation`, `dot_click_handlers`, `navigation_dots`

**Что делает:**
- Очищает контейнер точек
- Создает точки только если больше 1 карты
- Добавляет активный класс центральной точке
- Устанавливает обработчики клика

**Параметры:** нет

**Возвращает:** void

#### moveCarouselToPosition(position: number): void
```typescript
private moveCarouselToPosition(position: number): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  if (position < 0 || position >= this.carouselState.totalCards) {
    return;
  }
  this.carouselState.currentCenterIndex = position;
  this.carouselSwipeState.currentPosition = position;
  const offset = -position * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;
  carousel.style.transition = `transform ${CAROUSEL_CONFIG.TRANSITION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
  carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;
  setTimeout(() => {
    carousel.style.transition = '';
  }, 300);
  this.updateCenterCard();
  this.updateActiveDot(position);
  logger.info('Carousel moved to position', {
    position,
    offset,
    totalCards: this.carouselState.totalCards
  });
}
```
**Теги поиска:** `carousel_move_to_position`, `smooth_animation`, `transition_cleanup`, `dot_update`

**Что делает:**
- Проверяет границы позиции
- Обновляет состояние карусели
- Применяет плавную анимацию перемещения
- Очищает transition после анимации
- Обновляет активную точку

**Параметры:**
- `position: number` - целевая позиция

**Возвращает:** void

## Свайп-управление

#### setupCarouselSwipe(): void
```typescript
private setupCarouselSwipe(): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  const touchStartCleanup = addEventListenerWithCleanup(
    carousel,
    'touchstart',
    this.handleCarouselTouchStart.bind(this),
    { passive: true }
  );
  const touchMoveCleanup = addEventListenerWithCleanup(
    carousel,
    'touchmove',
    this.handleCarouselTouchMove.bind(this),
    { passive: false }
  );
  const touchEndCleanup = addEventListenerWithCleanup(
    carousel,
    'touchend',
    this.handleCarouselTouchEnd.bind(this),
    { passive: true }
  );
  this.cleanupFunctions.push(touchStartCleanup, touchMoveCleanup, touchEndCleanup);
  logger.info('Carousel swipe handlers setup');
}
```
**Теги поиска:** `carousel_swipe_setup`, `touch_event_listeners`, `passive_listeners`, `cleanup_functions`

**Что делает:**
- Устанавливает обработчики touch событий
- Использует passive listeners для производительности
- Добавляет функции очистки в массив

**Параметры:** нет

**Возвращает:** void

#### handleCarouselTouchStart(event: TouchEvent): void
```typescript
private handleCarouselTouchStart(event: TouchEvent): void {
  const touch = event.touches[0];
  if (!touch) return;
  this.carouselSwipeState = {
    isDragging: true,
    startX: touch.clientX,
    currentX: touch.clientX,
    startTime: Date.now(),
    currentPosition: 0,
  };
}
```
**Теги поиска:** `touch_start_handler`, `swipe_state_init`, `touch_coordinates`

**Что делает:**
- Сохраняет начальные координаты касания
- Инициализирует состояние свайпа

**Параметры:**
- `event: TouchEvent` - событие начала касания

**Возвращает:** void

#### handleCarouselTouchMove(event: TouchEvent): void
```typescript
private handleCarouselTouchMove(event: TouchEvent): void {
  if (!this.carouselSwipeState.isDragging) return;
  const touch = event.touches[0];
  if (!touch) return;
  this.carouselSwipeState.currentX = touch.clientX;
  const deltaX = this.carouselSwipeState.currentX - this.carouselSwipeState.startX;
  if (Math.abs(deltaX) > 10) {
    event.preventDefault();
  }
}
```
**Теги поиска:** `touch_move_handler`, `swipe_prevention`, `delta_calculation`

**Что делает:**
- Обновляет текущие координаты
- Предотвращает вертикальный скролл при горизонтальном свайпе

**Параметры:**
- `event: TouchEvent` - событие движения касания

**Возвращает:** void

#### handleCarouselTouchEnd(): void
```typescript
private handleCarouselTouchEnd(): void {
  if (!this.carouselSwipeState.isDragging) return;
  const deltaX = this.carouselSwipeState.currentX - this.carouselSwipeState.startX;
  const deltaTime = Date.now() - this.carouselSwipeState.startTime;
  const velocity = Math.abs(deltaX) / deltaTime;
  if (Math.abs(deltaX) > CAROUSEL_CONFIG.SWIPE_THRESHOLD || velocity > CAROUSEL_CONFIG.SWIPE_VELOCITY_THRESHOLD) {
    if (deltaX > 0) {
      this.moveToPreviousCarouselItem();
    } else {
      this.moveToNextCarouselItem();
    }
  }
  this.carouselSwipeState.isDragging = false;
}
```
**Теги поиска:** `touch_end_handler`, `swipe_direction_detection`, `velocity_calculation`, `swipe_threshold`

**Что делает:**
- Вычисляет направление и скорость свайпа
- Определяет необходимость переключения
- Вызывает соответствующее перемещение

**Параметры:** нет

**Возвращает:** void

## Долгое нажатие для удаления

#### addLongPressHandlers(element: HTMLElement, index: number): void
```typescript
private addLongPressHandlers(element: HTMLElement, index: number): void {
  const startHandler = (e: MouseEvent | TouchEvent) => {
    this.startLongPress(e, element, index);
  };
  const endHandler = () => {
    this.endLongPress();
  };
  element.addEventListener('mousedown', startHandler);
  element.addEventListener('touchstart', startHandler, { passive: true });
  element.addEventListener('mouseup', endHandler);
  element.addEventListener('mouseleave', endHandler);
  element.addEventListener('touchend', endHandler);
  element.addEventListener('touchcancel', endHandler);
}
```
**Теги поиска:** `long_press_handlers`, `touch_mouse_events`, `press_start_end`

**Что делает:**
- Добавляет обработчики для начала и окончания нажатия
- Поддерживает как mouse так и touch события

**Параметры:**
- `element: HTMLElement` - элемент для обработки
- `index: number` - индекс элемента истории

**Возвращает:** void

#### startLongPress(event: MouseEvent | TouchEvent, element: HTMLElement, index: number): void
```typescript
private startLongPress(event: MouseEvent | TouchEvent, element: HTMLElement, index: number): void {
  if (this.longPressState.isActive) {
    return;
  }
  logger.info('Starting long press tracking', { index });
  const startX = event.type === 'touchstart'
    ? (event as TouchEvent).touches[0]?.clientX || 0
    : (event as MouseEvent).clientX;
  const startY = event.type === 'touchstart'
    ? (event as TouchEvent).touches[0]?.clientY || 0
    : (event as MouseEvent).clientY;
  this.longPressState.startPosition = { x: startX, y: startY };
  this.longPressState.targetElement = element;
  this.longPressState.targetIndex = index;
  this.longPressState.moveHandler = (moveEvent: MouseEvent | TouchEvent) => {
    this.handleLongPressMovement(moveEvent);
  };
  element.addEventListener('mousemove', this.longPressState.moveHandler);
  element.addEventListener('touchmove', this.longPressState.moveHandler, { passive: true });
  this.longPressState.pressTimer = window.setTimeout(() => {
    this.activateLongPress(element, index);
    event.preventDefault();
  }, CAROUSEL_CONFIG.LONG_PRESS_DELAY);
}
```
**Теги поиска:** `long_press_start`, `coordinate_capture`, `timer_start`, `move_handler_setup`

**Что делает:**
- Захватывает начальные координаты
- Сохраняет состояние долгого нажатия
- Устанавливает обработчик движения
- Запускает таймер активации

**Параметры:**
- `event: MouseEvent | TouchEvent` - событие начала нажатия
- `element: HTMLElement` - целевой элемент
- `index: number` - индекс элемента

**Возвращает:** void

#### activateLongPress(element: HTMLElement, index: number): void
```typescript
private activateLongPress(element: HTMLElement, index: number): void {
  logger.info('Long press activated', { index });
  this.longPressState.isActive = true;
  element.classList.add(CSS_CLASSES.DELETE_MODE);
  this.triggerHapticFeedback();
  this.addDeleteButton(element, index);
  this.longPressState.documentClickHandler = (event: Event) => {
    if (!element.contains(event.target as Node)) {
      this.exitDeleteMode();
    }
  };
  document.addEventListener('click', this.longPressState.documentClickHandler);
}
```
**Теги поиска:** `long_press_activate`, `delete_mode_enter`, `haptic_feedback`, `delete_button_add`, `document_click_handler`

**Что делает:**
- Активирует режим удаления
- Добавляет CSS класс и кнопку удаления
- Вызывает тактильную обратную связь
- Устанавливает глобальный обработчик клика

**Параметры:**
- `element: HTMLElement` - элемент для удаления
- `index: number` - индекс элемента

**Возвращает:** void

#### handleDeleteClick(button: HTMLButtonElement, index: number): Promise<void>
```typescript
private async handleDeleteClick(button: HTMLButtonElement, index: number): Promise<void> {
  logger.info('Delete button clicked', { index });
  this.disableDeleteButton(button);
  try {
    const confirmed = await this.requestDeleteConfirmation();
    if (confirmed) {
      await this.performDelete(button, index);
    } else {
      this.restoreDeleteButton(button);
    }
  } catch (error) {
    logger.error('Failed to delete history item', error);
    this.restoreDeleteButton(button);
    this.logError('Ошибка при удалении элемента');
  }
}
```
**Теги поиска:** `delete_click_handler`, `confirmation_request`, `delete_perform`, `error_handling`

**Что делает:**
- Блокирует кнопку и показывает загрузку
- Запрашивает подтверждение
- Выполняет удаление или восстанавливает кнопку

**Параметры:**
- `button: HTMLButtonElement` - кнопка удаления
- `index: number` - индекс элемента

**Возвращает:** Promise<void>

## Показ анализа

#### showSavedAnalysis(analysisData: HistoryItem): void
```typescript
private showSavedAnalysis(analysisData: HistoryItem): void {
  logger.info('Showing saved analysis');
  const hasPhoto = analysisData.photoUrl || analysisData.photo || analysisData.photoData;
  if (!hasPhoto) {
    this.logError('Не удалось загрузить данные фотографии');
    return;
  }
  // ... настройка элементов экрана ...
  if (analysisData.photoUrl) {
    savedAnalysisPhoto.src = analysisData.photoUrl;
  } else {
    const photoData = analysisData.photo || analysisData.photoData;
    savedAnalysisPhoto.src = `data:image/jpeg;base64,${photoData}`;
  }
  // ... обработка текста анализа ...
  savedAnalysisScreen.classList.remove('hidden');
  this.currentPreview = savedAnalysisScreen;
  logger.info('Saved analysis displayed');
}
```
**Теги поиска:** `saved_analysis_show`, `photo_loading`, `analysis_text_processing`, `fullscreen_display`

**Что делает:**
- Проверяет наличие фото в данных
- Настраивает элементы экрана анализа
- Устанавливает изображение (приоритет photoUrl)
- Обрабатывает текст анализа с markdown
- Показывает полноэкранный экран

**Параметры:**
- `analysisData: HistoryItem` - данные сохраненного анализа

**Возвращает:** void

## Обработчики кнопок

#### setupCameraButtonListener(): void
```typescript
private setupCameraButtonListener(): void {
  if (this.elements.cameraBtn) {
    const cleanup = addEventListenerWithCleanup(
      this.elements.cameraBtn,
      'click',
      this.handleCameraButtonClick.bind(this)
    );
    this.cleanupFunctions.push(cleanup);
  }
}
```
**Теги поиска:** `camera_button_listener`, `cleanup_function_add`, `event_listener_setup`

**Что делает:**
- Устанавливает обработчик клика по кнопке камеры
- Добавляет функцию очистки в массив

**Параметры:** нет

**Возвращает:** void

#### handleCameraButtonClick(event: Event): Promise<void>
```typescript
private async handleCameraButtonClick(event: Event): Promise<void> {
  await uiAnalysisManager.handleCameraButtonClick(event);
}
```
**Теги поиска:** `camera_button_click_handler`, `ui_analysis_delegation`, `async_camera_capture`

**Что делает:**
- Делегирует обработку клика менеджеру анализа

**Параметры:**
- `event: Event` - событие клика

**Возвращает:** Promise<void>

#### handleHistoryCellClick(index: number): void
```typescript
private handleHistoryCellClick(index: number): void {
  const historyItem = historyManager.getFilledItem(index);
  if (historyItem) {
    logger.info('History cell clicked', { index });
    this.showSavedAnalysis(historyItem);
  } else {
    logger.info('Empty history cell clicked, checking limits', { index });
    if (!authManager.canAnalyze()) {
      logger.info('Analysis limit reached, showing subscription modal', {
        analysesLeft: authManager.getAnalysesLeft(),
        isPremium: authManager.isPremium()
      });
      uiCoreManager.showSubscriptionModal();
      return;
    }
    logger.info('Limits check passed, opening camera', { index });
    this.handleCameraButtonClick(new Event('click'));
  }
}
```
**Теги поиска:** `history_cell_click_handler`, `filled_item_check`, `limit_check`, `subscription_modal_show`, `camera_open`

**Что делает:**
- Получает элемент истории по индексу
- Если элемент заполнен, показывает анализ
- Если пустой, проверяет лимиты и открывает камеру или показывает подписку

**Параметры:**
- `index: number` - индекс ячейки истории

**Возвращает:** void

## Инициализация и очистка

#### init(): void
```typescript
init(): void {
  logger.info('Initializing Menu UI Manager');
  this.setupCarouselNavigation();
  this.updateHistoryDisplay();
  logger.info('Menu UI Manager initialized successfully');
}
```
**Теги поиска:** `menu_init`, `carousel_navigation_setup`, `history_initial_display`

**Что делает:**
- Настраивает навигацию карусели
- Обновляет отображение истории

**Параметры:** нет

**Возвращает:** void

#### destroy(): void
```typescript
destroy(): void {
  logger.info('Destroying Menu UI Manager');
  this.closePreview();
  if (this.longPressState.isActive) {
    this.exitDeleteMode();
  }
  this.cleanupFunctions.forEach(cleanup => cleanup());
  this.cleanupFunctions = [];
  logger.info('Menu UI Manager destroyed');
}
```
**Теги поиска:** `menu_destroy`, `preview_close`, `delete_mode_exit`, `event_listeners_cleanup`

**Что делает:**
- Закрывает превью если открыто
- Выходит из режима удаления если активен
- Очищает все обработчики событий

**Параметры:** нет

**Возвращает:** void

## Статистика и отладка

#### getStats()
```typescript
getStats() {
  return {
    elementsInitialized: Object.values(this.elements).filter(Boolean).length,
    totalElements: Object.keys(this.elements).length,
    hasPreview: !!this.currentPreview,
    eventListenersCount: this.cleanupFunctions.length,
    historyCellsCount: this.elements.historyCells.length,
    longPressActive: this.longPressState.isActive,
  };
}
```
**Теги поиска:** `menu_stats_get`, `debugging_info`, `ui_state_tracking`

**Что делает:**
- Возвращает статистику состояния меню менеджера
- Используется для отладки и мониторинга

**Параметры:** нет

**Возвращает:** объект со статистикой

## Константы и конфигурация

**Используемые константы:**
- `DOM_SELECTORS` - селекторы DOM элементов
- `CSS_CLASSES` - CSS классы для стилизации
- `CAROUSEL_CONFIG` - настройки карусели (ширина карт, задержки, пороги)

**Теги поиска:** `constants_usage`, `configuration_values`, `carousel_settings`

## Взаимодействие с другими модулями

**Импортируемые модули:**
- `historyManager` - управление данными истории
- `authManager` - проверка авторизации и лимитов
- `uiCoreManager` - общие UI компоненты
- `uiAnalysisManager` - управление анализом

**Теги поиска:** `module_dependencies`, `inter_module_communication`, `data_flow`
