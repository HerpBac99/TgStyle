# 📱 TgStyle - Главная закладка (Main Tab) - Детальная документация

> **Версия:** 2.0.0  
> **Дата:** 13.10.2025  
> **Статус:** Актуально после рефакторинга истории

---

## 📋 Содержание

1. [Общая архитектура](#общая-архитектура)
2. [Точка входа - main.ts](#точка-входа---maints)
3. [Карусель истории](#карусель-истории)
4. [Процесс анализа](#процесс-анализа)
5. [Предзагрузка данных](#предзагрузка-данных)
6. [Управление историей](#управление-историей)
7. [Камера и захват фото](#камера-и-захват-фото)
8. [Все методы и их назначение](#все-методы-и-их-назначение)

---

## 🏗️ Общая архитектура

### Схема потока данных

```
┌──────────────┐
│   main.ts    │ ← Точка входа
└──────┬───────┘
       ↓
┌──────────────────────────────────────┐
│  Инициализация (последовательно):   │
│  1. Telegram WebApp                  │
│  2. UI компоненты                    │
│  3. Авторизация (authManager)        │
│  4. История с сервера (historyManager)│
│  5. Предзагрузка (dataCacheManager)  │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────┐
│  Главный экран   │
│  ┌────────────┐  │
│  │  Карусель  │  │ ← historyManager.getAllItems()
│  └────────────┘  │
│  ┌────────────┐  │
│  │ Кнопка [+] │  │ ← cameraManager.capturePhoto()
│  └────────────┘  │
└──────────────────┘
       ↓
┌──────────────────┐
│  Процесс анализа │
│  1. Захват фото  │ ← camera.ts
│  2. Выбор темы   │ ← uiAnalysis.ts
│  3. Отправка     │ ← api.analyzeImage()
│  4. Результат    │ ← Сервер сохраняет в БД
│  5. Обновление   │ ← loadHistoryFromServer()
└──────────────────┘
```

---

## 📍 Точка входа - main.ts

### Класс: `TgStyleApp`

Главный класс приложения, управляет жизненным циклом.

#### Свойства

```typescript
class TgStyleApp {
  private tg: TelegramWebApp | null = null;        // Ссылка на Telegram WebApp API
  private isInitialized = false;                   // Флаг инициализации
  private initStartTime = Date.now();              // Время начала запуска
}
```

---

### 🔄 Метод: `initialize()`

**Назначение:** Главная точка входа, запускает всё приложение.

**Вызывается:** Автоматически при загрузке DOM:
```typescript
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.initialize());
} else {
  app.initialize(); // DOM уже готов
}
```

**Последовательность выполнения:**

```typescript
async initialize(): Promise<void> {
  // 1. Инициализация Telegram WebApp
  this.initializeTelegram();
  
  // 2. Настройка поведения приложения
  this.setupAppBehavior();
  
  // 3. Инициализация UI
  this.initializeUI();
  
  // 4. Авторизация
  await this.performAuthentication();
  
  // 5. Предзагрузка данных
  await this.preloadAppData();
  
  // 6. Обработка shared ссылок
  this.handleSharedAnalysis();
  
  // 7. Завершение
  this.completeInitialization();
}
```

---

### 📱 Метод: `initializeTelegram()`

**Назначение:** Инициализирует Telegram WebApp API.

**Что делает:**

```typescript
private initializeTelegram(): void {
  this.tg = window.Telegram?.WebApp || null;
  
  if (!this.tg) {
    logger.warn('Telegram WebApp not available');
    return;
  }
  
  // Настройка Telegram:
  this.tg.expand();                     // Развернуть на весь экран
  this.tg.enableClosingConfirmation(); // Подтверждение при закрытии
  this.tg.disableVerticalSwipes();     // Запретить свайпы вниз
  this.tg.requestFullscreen();         // Полноэкранный режим
  this.tg.ready();                      // Уведомить о готовности
}
```

**Используется:**
- `window.Telegram.WebApp` - глобальный объект от Telegram
- Версия API проверяется: `this.tg.isVersionAtLeast('6.9')`

---

### 🎨 Метод: `setupAppBehavior()`

**Назначение:** Настраивает базовое поведение приложения.

**Что делает:**

```typescript
private setupAppBehavior(): void {
  // Запрещаем скроллинг body
  document.body.style.overflow = 'hidden';
  
  // Настраиваем глобальные обработчики
  this.setupGlobalEventHandlers();
  
  // Настраиваем мета-теги для мобильных
  this.setupMobileMeta();
}
```

**Глобальные обработчики:**
- `window 'error'` - логирование ошибок загрузки ресурсов
- `window 'resize'` - обработка изменения размера
- `window 'orientationchange'` - поворот экрана
- `document 'visibilitychange'` - возврат к приложению

---

### 🖼️ Метод: `initializeUI()`

**Назначение:** Инициализирует все UI компоненты.

**Что делает:**

```typescript
private initializeUI(): void {
  uiManager.init(); // Вызывает инициализацию всех UI модулей
}
```

**Под капотом `uiManager.init()` запускает:**
- `uiMenuManager.init()` - главное меню и карусель
- `uiAnalysisManager.init()` - экран анализа
- `uiCoreManager.init()` - базовые UI компоненты
- Event listeners для всех кнопок

---

### 🔐 Метод: `performAuthentication()`

**Назначение:** Выполняет авторизацию пользователя на сервере.

**Что делает:**

```typescript
private async performAuthentication(): Promise<void> {
  const authResponse = await authManager.authenticate();
  
  if (authResponse.success) {
    // Пользователь авторизован
    this.dispatchAppEvent(APP_EVENTS.AUTH_SUCCESS, authResponse.user);
  } else {
    // Ошибка авторизации, но продолжаем работу
    logger.warn('Authentication failed', authResponse.error);
    this.dispatchAppEvent(APP_EVENTS.AUTH_FAILURE, { error });
  }
}
```

**authManager.authenticate() делает:**
1. Получает `initData` из `window.Telegram.WebApp.initData`
2. Отправляет `POST /api/auth` с initData
3. Сервер валидирует подпись Telegram
4. Возвращает данные пользователя + подписку
5. Сохраняет в `authManager` для дальнейшего использования

**Используется далее:**
- Во всех API запросах (передается `initData` в query/body)
- Для отображения информации о подписке

---

### 📦 Метод: `preloadAppData()`

**Назначение:** Загружает все данные приложения (история, гардероб, капсулы).

**Что делает:**

```typescript
private async preloadAppData(): Promise<void> {
  // 1. Загружаем историю с сервера (ГЛАВНЫЙ ИСТОЧНИК)
  await historyManager.loadHistoryFromServer().catch(error => {
    logger.error('Error loading history from server', error);
    // Fallback: данные из localStorage уже загружены в constructor
  });
  
  // 2. Предзагружаем гардероб, капсулы, изображения (фон)
  dataCacheManager.preloadData().catch(error => {
    logger.error('Error during data preload', error);
  });
}
```

**Важно:**
- `loadHistoryFromServer()` - **синхронный** (await) - нужен для отображения карусели
- `preloadData()` - **асинхронный** (фон) - не блокирует инициализацию

**Детали см. в разделах:**
- [Управление историей](#управление-историей)
- [Предзагрузка данных](#предзагрузка-данных)

---

### ✅ Метод: `completeInitialization()`

**Назначение:** Завершает инициализацию, логирует статистику.

**Что делает:**

```typescript
private completeInitialization(): void {
  this.isInitialized = true;
  
  // Отправляем событие готовности
  this.dispatchAppEvent(APP_EVENTS.READY, {
    initTime: Date.now() - this.initStartTime,
    features: APP_CONFIG.features
  });
  
  // Логируем статистику модулей
  this.logModulesStats();
}
```

**Статистика включает:**
- `authManager.getAuthStats()` - статус авторизации
- `historyManager.getStats()` - количество элементов истории
- `uiManager.getStats()` - состояние UI компонентов
- `logger.getStats()` - количество логов

**После этого:**
- Приложение полностью готово к работе
- Карусель отображает историю
- Кнопка камеры активна

---

## 🎠 Карусель истории

### Ответственный модуль: `uiMenu.ts`

### Класс: `UIMenuManager`

Управляет главным меню, каруселью истории, навигацией.

---

### 🏗️ Структура карусели

```html
<div class="history-carousel-container">
  <div class="history-carousel">
    <!-- Динамически создаваемые карточки: -->
    <div class="history-card" data-index="0">
      <img src="/uploads/analysis/123/photo.jpg">
      <div class="history-date">12:30</div>
    </div>
    <div class="history-card" data-index="1">...</div>
    ...
    <div class="history-card empty" data-index="N">
      <button class="add-analysis">+</button>
    </div>
  </div>
  
  <div class="carousel-dots">
    <span class="dot active"></span>
    <span class="dot"></span>
    ...
  </div>
</div>
```

---

### 📊 Состояние карусели

```typescript
// В UIMenuManager:
private carouselState = {
  currentCenterIndex: 0,    // Индекс центральной карточки
  totalCards: 0             // Общее количество карточек
};

private carouselSwipeState = {
  isDragging: false,        // Активен ли свайп
  startX: 0,                // Начальная позиция касания
  currentX: 0,              // Текущая позиция
  startTime: 0,             // Время начала свайпа
  currentPosition: 0        // Текущая позиция карусели
};
```

---

### 🔄 Метод: `updateHistoryDisplay()`

**Назначение:** Обновляет отображение карусели истории.

**Вызывается:**
- После загрузки истории с сервера
- После добавления нового анализа
- После удаления элемента
- При событии `'history:updated'`

**Что делает:**

```typescript
updateHistoryDisplay(): void {
  // 1. Получаем заполненные элементы из historyManager
  const filledItems = historyManager.getFilledItems();
  
  // 2. NEW: Реверсируем массив для правильного порядка
  // Сервер возвращает desc (новые первые)
  // Карусель отображает asc (старые → новые слева направо)
  const sortedItems = [...filledItems].reverse();
  
  logger.info('Updating history display', {
    filledItems: sortedItems.length,
    currentCenter: this.carouselState.currentCenterIndex
  });
  
  // 3. Создаем карточки карусели
  this.createCarouselCards(sortedItems);
  
  // 4. Позиционируем карусель
  this.positionCarousel();
  
  // 5. Обновляем навигацию (точки)
  this.updateCarouselNavigation();
}
```

**Источник данных:**
```typescript
// historyManager.getFilledItems() возвращает:
[
  {
    id: "43",
    photoUrl: "/uploads/analysis/251053908/analysis_1760347457073.jpg",
    timestamp: "2025-10-13T09:24:17.075Z",
    analysis: "...",
    isEmpty: false
  },
  // ... ещё элементы
]
```

---

### 🏗️ Метод: `createCarouselCards(filledItems)`

**Назначение:** Создаёт HTML карточки для карусели.

**Параметры:**
- `filledItems: HistoryItem[]` - массив заполненных элементов истории

**Что делает:**

```typescript
private createCarouselCards(filledItems: HistoryItem[]): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  
  // 1. Очищаем карусель
  carousel.innerHTML = '';
  
  // 2. Рассчитываем общее количество карточек
  // Всегда минимум 1 (пустая карточка с +)
  const totalCards = Math.max(1, filledItems.length + 1);
  this.carouselState.totalCards = totalCards;
  
  // 3. Создаем карточки
  for (let i = 0; i < totalCards; i++) {
    const item = filledItems[i] || null;
    const card = this.createCard(i, item);
    carousel.appendChild(card);
  }
  
  // 4. Обновляем ссылку на карточки
  this.elements.historyCells = getElements(DOM_SELECTORS.HISTORY_CARDS);
  
  logger.info('Carousel cards created', { 
    totalCards, 
    filledItems: filledItems.length 
  });
}
```

---

### 🃏 Метод: `createCard(index, item)`

**Назначение:** Создаёт HTML элемент карточки.

**Параметры:**
- `index: number` - индекс карточки в карусели
- `item: HistoryItem | null` - данные элемента истории или null (пустая карточка)

**Что делает:**

```typescript
private createCard(index: number, item: HistoryItem | null): HTMLElement {
  const card = createElement('div', ['history-card']);
  card.dataset.index = String(index);
  
  if (!item) {
    // ПУСТАЯ КАРТОЧКА (кнопка +)
    card.classList.add('empty');
    const addBtn = createElement('button', ['add-analysis']);
    addBtn.innerHTML = `<svg>...</svg>`; // Иконка +
    addBtn.onclick = () => this.handleAddAnalysis();
    card.appendChild(addBtn);
  } else {
    // ЗАПОЛНЕННАЯ КАРТОЧКА
    const content = createElement('div', ['history-card-content']);
    
    // Изображение
    const img = createElement('img') as HTMLImageElement;
    
    // ПРИОРИТЕТ: photoUrl (сервер) > photoData (legacy)
    if (item.photoUrl) {
      img.src = this.makeAbsoluteUrl(item.photoUrl);
    } else if (item.photoData || item.photo) {
      img.src = `data:image/jpeg;base64,${item.photoData || item.photo}`;
    }
    
    img.alt = 'История анализа';
    img.loading = 'lazy';
    content.appendChild(img);
    
    // Дата
    const dateEl = createElement('div', ['history-date']);
    dateEl.textContent = formatHistoryDate(item.timestamp);
    content.appendChild(dateEl);
    
    card.appendChild(content);
    
    // Обработчик клика - открыть анализ
    card.onclick = () => this.handleHistoryCardClick(index, item);
  }
  
  return card;
}
```

**Важные детали:**
- Использует `photoUrl` (приоритет) - URL на сервере
- Fallback на `photoData` (base64) для старых записей
- `loading='lazy'` для оптимизации загрузки
- Дата форматируется как "12:30" или "Вчера 15:45"

---

### 📍 Метод: `positionCarousel()`

**Назначение:** Позиционирует карусель для отображения нужной карточки.

**Что делает:**

```typescript
private positionCarousel(): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  
  const filledCount = historyManager.getFilledCount();
  
  if (filledCount === 0) {
    // Нет истории - показываем пустую карточку в центре
    this.carouselState.currentCenterIndex = 0;
  } else {
    // Показываем самую новую (правую) карточку
    this.carouselState.currentCenterIndex = Math.min(
      filledCount, 
      this.carouselState.totalCards - 1
    );
  }
  
  // Рассчитываем смещение
  // Формула: -index * (CARD_WIDTH + GAP)
  const offset = -this.carouselState.currentCenterIndex * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;
  
  // Применяем transform
  carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;
  
  // Обновляем центральную карточку
  this.updateCenterCard();
  
  logger.info('Carousel positioned', {
    centerIndex: this.carouselState.currentCenterIndex,
    offset,
    filledCount
  });
}
```

**CAROUSEL_CONFIG константы:**
```typescript
CAROUSEL_CONFIG = {
  CARD_WIDTH: 200,           // Ширина карточки в пикселях
  CARD_GAP: 20,              // Расстояние между карточками
  TOTAL_CARD_WIDTH: 220,     // CARD_WIDTH + CARD_GAP
  CENTER_OFFSET: 100,        // Смещение для центрирования
  SWIPE_THRESHOLD: 20,       // Минимальное расстояние для свайпа
  TRANSITION_DURATION: 300   // Длительность анимации (мс)
}
```

---

### 🎯 Метод: `updateCenterCard()`

**Назначение:** Выделяет центральную карточку (добавляет класс `.center`).

**Что делает:**

```typescript
private updateCenterCard(): void {
  const cards = this.elements.historyCells;
  if (!cards || cards.length === 0) return;
  
  // Убираем класс center у всех
  cards.forEach(card => card.classList.remove('center'));
  
  // Добавляем класс center текущей
  const centerCard = cards[this.carouselState.currentCenterIndex];
  if (centerCard) {
    centerCard.classList.add('center');
  }
}
```

**CSS эффект:**
```css
.history-card {
  transform: scale(1);
  opacity: 0.85;
}

.history-card.center {
  z-index: 10;
  transform: scale(1.2);      /* Увеличение на 20% */
  box-shadow: var(--card-shadow-hover);
  filter: brightness(1.05);
}
```

---

### 🔵 Метод: `updateCarouselNavigation()`

**Назначение:** Обновляет точки навигации под каруселью.

**Что делает:**

```typescript
private updateCarouselNavigation(): void {
  const dotsContainer = getElement('.carousel-dots');
  if (!dotsContainer) return;
  
  // Очищаем
  dotsContainer.innerHTML = '';
  
  // Создаем точки
  for (let i = 0; i < this.carouselState.totalCards; i++) {
    const dot = createElement('span', ['dot']);
    
    // Активная точка
    if (i === this.carouselState.currentCenterIndex) {
      dot.classList.add('active');
    }
    
    // Клик по точке - перейти к карточке
    dot.onclick = () => this.moveToPosition(i);
    
    dotsContainer.appendChild(dot);
  }
  
  logger.info('Carousel navigation updated', {
    totalCards: this.carouselState.totalCards,
    currentCenter: this.carouselState.currentCenterIndex
  });
}
```

---

### 👆 Свайп по карусели

#### Метод: `setupCarouselSwipeHandlers()`

**Назначение:** Настраивает обработчики свайпа для карусели.

**Вызывается:** В `init()` при инициализации меню.

**Что делает:**

```typescript
private setupCarouselSwipeHandlers(): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  
  // Touch события
  carousel.addEventListener('touchstart', (e) => this.handleCarouselTouchStart(e));
  carousel.addEventListener('touchmove', (e) => this.handleCarouselTouchMove(e));
  carousel.addEventListener('touchend', (e) => this.handleCarouselTouchEnd(e));
  
  // Mouse события (для desktop)
  carousel.addEventListener('mousedown', (e) => this.handleCarouselTouchStart(e));
  carousel.addEventListener('mousemove', (e) => this.handleCarouselTouchMove(e));
  carousel.addEventListener('mouseup', (e) => this.handleCarouselTouchEnd(e));
  carousel.addEventListener('mouseleave', (e) => this.handleCarouselTouchEnd(e));
  
  logger.info('Carousel swipe handlers setup');
}
```

#### Метод: `handleCarouselTouchStart(event)`

**Назначение:** Начало свайпа.

```typescript
private handleCarouselTouchStart(event: MouseEvent | TouchEvent): void {
  this.carouselSwipeState.isDragging = true;
  
  // Получаем позицию касания
  const clientX = 'touches' in event ? event.touches[0]!.clientX : event.clientX;
  
  this.carouselSwipeState.startX = clientX;
  this.carouselSwipeState.currentX = clientX;
  this.carouselSwipeState.startTime = Date.now();
  this.carouselSwipeState.currentPosition = this.carouselState.currentCenterIndex;
  
  // Отключаем плавный переход на время свайпа
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (carousel) {
    carousel.style.transition = 'none';
  }
}
```

#### Метод: `handleCarouselTouchMove(event)`

**Назначение:** Движение пальца/мыши.

```typescript
private handleCarouselTouchMove(event: MouseEvent | TouchEvent): void {
  if (!this.carouselSwipeState.isDragging) return;
  
  const clientX = 'touches' in event ? event.touches[0]!.clientX : event.clientX;
  this.carouselSwipeState.currentX = clientX;
  
  // Рассчитываем смещение
  const deltaX = clientX - this.carouselSwipeState.startX;
  
  // Двигаем карусель
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (carousel) {
    const currentOffset = -this.carouselSwipeState.currentPosition * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;
    const newOffset = currentOffset + deltaX;
    
    carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${newOffset}px))`;
  }
  
  event.preventDefault();
}
```

#### Метод: `handleCarouselTouchEnd(event)`

**Назначение:** Конец свайпа - определяет направление и переключает карточку.

```typescript
private handleCarouselTouchEnd(event: MouseEvent | TouchEvent): void {
  if (!this.carouselSwipeState.isDragging) return;
  
  this.carouselSwipeState.isDragging = false;
  
  // Рассчитываем параметры свайпа
  const deltaX = this.carouselSwipeState.currentX - this.carouselSwipeState.startX;
  const deltaTime = Date.now() - this.carouselSwipeState.startTime;
  const velocity = Math.abs(deltaX) / deltaTime;
  
  // Определяем направление
  const threshold = CAROUSEL_CONFIG.SWIPE_THRESHOLD; // 20px
  const velocityThreshold = CAROUSEL_CONFIG.SWIPE_VELOCITY_THRESHOLD; // 0.1
  
  if (Math.abs(deltaX) > threshold || velocity > velocityThreshold) {
    if (deltaX > 0) {
      // Свайп вправо - предыдущая карточка
      this.moveToPreviousCarouselItem();
    } else {
      // Свайп влево - следующая карточка
      this.moveToNextCarouselItem();
    }
  } else {
    // Слишком маленький свайп - возвращаемся к текущей
    this.moveToPosition(this.carouselState.currentCenterIndex);
  }
}
```

---

### ▶️ Метод: `moveToNextCarouselItem()`

**Назначение:** Переход к следующей карточке (свайп влево).

```typescript
private moveToNextCarouselItem(): void {
  const nextPosition = Math.min(
    this.carouselState.currentCenterIndex + 1,
    this.carouselState.totalCards - 1
  );
  
  this.moveToPosition(nextPosition);
  
  logger.info('Carousel moved to next item', { position: nextPosition });
}
```

### ◀️ Метод: `moveToPreviousCarouselItem()`

**Назначение:** Переход к предыдущей карточке (свайп вправо).

```typescript
private moveToPreviousCarouselItem(): void {
  const prevPosition = Math.max(
    this.carouselState.currentCenterIndex - 1,
    0
  );
  
  this.moveToPosition(prevPosition);
  
  logger.info('Carousel moved to previous item', { position: prevPosition });
}
```

---

### 🎯 Метод: `moveToPosition(position)`

**Назначение:** Перемещает карусель к указанной позиции с анимацией.

```typescript
private moveToPosition(position: number): void {
  const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
  if (!carousel) return;
  
  // Ограничиваем позицию
  position = Math.max(0, Math.min(position, this.carouselState.totalCards - 1));
  
  // Обновляем состояние
  this.carouselState.currentCenterIndex = position;
  this.carouselSwipeState.currentPosition = position;
  
  // Рассчитываем смещение
  const offset = -position * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;
  
  // Применяем с анимацией
  carousel.style.transition = `transform ${CAROUSEL_CONFIG.TRANSITION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
  carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;
  
  // Убираем transition после анимации
  setTimeout(() => {
    carousel.style.transition = '';
  }, CAROUSEL_CONFIG.TRANSITION_DURATION);
  
  // Обновляем центральную карточку и навигацию
  this.updateCenterCard();
  this.updateCarouselNavigation();
  
  logger.info('Carousel moved to position', {
    position,
    offset,
    totalCards: this.carouselState.totalCards
  });
}
```

---

## 🖼️ Процесс анализа

### Полный поток анализа

```
1. [Кнопка +] → handleAddAnalysis()
         ↓
2. cameraManager.capturePhoto()
         ↓
3. Event: 'photo:captured' → uiAnalysisManager
         ↓
4. Показывает экран выбора темы
         ↓
5. Пользователь выбирает тему
         ↓
6. analysisManager.analyzeImage(base64, theme)
         ↓
7. POST /api/analyze → Server
         ↓
8. Server:
   - Sharp .rotate() (EXIF fix)
   - .resize(800, 800)
   - Сохраняет файл на диск
   - Создаёт запись в БД
   - Возвращает { photoUrl, analysis }
         ↓
9. Client: historyManager.loadHistoryFromServer()
         ↓
10. Event: 'history:updated'
         ↓
11. updateHistoryDisplay() → Карусель обновлена!
```

---

### 📷 Шаг 1: Захват фото

#### Метод: `handleAddAnalysis()`

**Назначение:** Обработчик клика по кнопке "+" (пустая карточка).

**Где:** `uiMenu.ts`

```typescript
private handleAddAnalysis(): void {
  logger.info('Add analysis button clicked');
  
  // Запускаем захват фото
  cameraManager.capturePhoto().then(result => {
    if (result.success && result.image) {
      logger.info('Photo captured successfully for analysis');
      // Событие 'photo:captured' уже отправлено внутри capturePhoto()
    } else {
      logger.error('Photo capture failed', result.error);
    }
  }).catch(error => {
    logger.error('Error capturing photo', error);
  });
}
```

---

### 📸 camera.ts - Захват фото

#### Метод: `capturePhoto()`

**Назначение:** Открывает диалог выбора фото (камера/галерея).

```typescript
async capturePhoto(): Promise<PhotoCaptureResult> {
  logger.info('Starting photo capture');
  
  try {
    // 1. Открываем диалог выбора файла
    const file = await this.selectFile({ preferCamera: true });
    
    // 2. Обрабатываем файл
    const imageData = await this.processImageFile(file);
    
    // 3. Сохраняем как текущее изображение
    this.currentImageData = imageData;
    
    logger.info('Photo captured successfully', {
      width: imageData.width,
      height: imageData.height,
      originalSize: Math.round(imageData.originalSize / 1024) + 'KB'
    });
    
    // 4. Отправляем событие
    window.dispatchEvent(new CustomEvent('photo:captured', {
      detail: { imageData }
    }));
    
    return {
      success: true,
      image: imageData
    };
  } catch (error) {
    logger.error('Photo capture failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}
```

#### Метод: `selectFile(options)`

**Назначение:** Создаёт `<input type="file">` для выбора изображения.

```typescript
private selectFile(options: Partial<CameraOptions> = {}): Promise<File> {
  return new Promise((resolve, reject) => {
    // Создаём скрытый input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*'; // Telegram переопределит это
    input.style.display = 'none';
    
    // Обработчик выбора файла
    input.addEventListener('change', (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      
      if (file) {
        resolve(file);
      } else {
        reject(new Error('Файл не выбран'));
      }
      
      document.body.removeChild(input);
    });
    
    // Обработчик отмены
    input.addEventListener('cancel', () => {
      reject(new Error('Выбор файла отменен'));
      document.body.removeChild(input);
    });
    
    // Добавляем и кликаем
    document.body.appendChild(input);
    input.click();
  });
}
```

**Важно:**
- Telegram WebApp **автоматически** показывает нативный диалог (Камера/Галерея/Файлы)
- На iOS работает как встроенный picker
- На Android - выбор источника

#### Метод: `processImageFile(file)`

**Назначение:** Обрабатывает выбранный файл.

```typescript
private async processImageFile(file: File): Promise<ImageData> {
  // 1. Валидация
  this.validateFile(file); // Проверка типа, размера
  
  // 2. Чтение как base64
  const base64 = await this.readFileAsBase64(file);
  
  // 3. Получение размеров
  const dimensions = await this.getImageDimensions(base64);
  
  // 4. Создание объекта ImageData
  const imageData: ImageData = {
    base64: base64.split(',')[1]!, // Убираем "data:image/jpeg;base64,"
    originalSize: file.size,
    width: dimensions.width,
    height: dimensions.height,
    format: this.detectImageFormat(file)
  };
  
  // 5. Валидация
  const validation = validateImageData(imageData);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }
  
  return imageData;
}
```

**Валидация файла:**
```typescript
private validateFile(file: File): void {
  // Размер (макс 25MB)
  const maxSizeBytes = IMAGE_CONSTRAINTS.MAX_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`Размер файла превышает ${IMAGE_CONSTRAINTS.MAX_SIZE_MB}MB`);
  }
  
  // Формат (JPEG, PNG, WebP)
  if (!IMAGE_CONSTRAINTS.ALLOWED_FORMATS.includes(file.type as any)) {
    throw new Error(`Неподдерживаемый тип файла: ${file.type}`);
  }
}
```

---

### 🎨 Шаг 2: Выбор темы анализа

#### uiAnalysisManager - обработчик события

```typescript
// В init():
window.addEventListener('photo:captured', (event: CustomEvent) => {
  const { imageData } = event.detail;
  this.handlePhotoCaptured(imageData);
});
```

#### Метод: `handlePhotoCaptured(imageData)`

**Назначение:** Показывает экран анализа с выбором темы.

```typescript
private handlePhotoCaptured(imageData: ImageData): void {
  logger.info('Photo captured event received');
  
  // 1. Сохраняем изображение
  this.currentImageData = imageData;
  
  // 2. Показываем экран анализа
  this.showAnalysisScreen(imageData.base64);
  
  // 3. Показываем выбор темы
  this.showThemeSelection();
}
```

#### Метод: `showAnalysisScreen(base64)`

**Назначение:** Отображает экран анализа.

```typescript
private showAnalysisScreen(base64Image: string): void {
  const screen = getElement('#analysis-screen');
  const photo = getElement<HTMLImageElement>('#analysis-photo');
  
  if (!screen || !photo) return;
  
  // Устанавливаем изображение
  photo.src = `data:image/jpeg;base64,${base64Image}`;
  
  // Показываем экран
  screen.classList.remove('hidden');
  
  // Скрываем главный экран
  const mainContent = getElement('.main-content');
  if (mainContent) {
    mainContent.style.display = 'none';
  }
  
  logger.info('Analysis screen shown');
}
```

#### Метод: `showThemeSelection()`

**Назначение:** Показывает сетку тем для анализа.

```typescript
private showThemeSelection(): void {
  const themeSelection = getElement('#analysis-theme-selection');
  const themeGrid = getElement('#analysis-theme-grid');
  
  if (!themeSelection || !themeGrid) return;
  
  // Очищаем сетку
  themeGrid.innerHTML = '';
  
  // Создаём карточки тем
  FASHION_THEMES.forEach((theme, index) => {
    const card = this.createThemeCard(theme, index);
    themeGrid.appendChild(card);
  });
  
  // Показываем
  themeSelection.classList.remove('hidden');
  
  logger.info('Theme selection shown', { 
    themesCount: FASHION_THEMES.length 
  });
}
```

**FASHION_THEMES константа:**
```typescript
const FASHION_THEMES = [
  {
    id: 'casual',
    name: 'Повседневный',
    description: 'Для прогулок и встреч',
    emoji: '👕'
  },
  {
    id: 'office',
    name: 'Офис',
    description: 'Для работы в офисе',
    emoji: '💼'
  },
  // ... ещё 6 тем
];
```

#### Метод: `createThemeCard(theme, index)`

**Назначение:** Создаёт HTML карточку темы.

```typescript
private createThemeCard(theme: FashionTheme, index: number): HTMLElement {
  const card = createElement('div', ['theme-card']);
  
  // Анимация появления
  card.style.animationDelay = `${index * 0.1}s`;
  card.classList.add('theme-card-animated', 'theme-card-cascade');
  
  // Содержимое
  card.innerHTML = `
    <div class="theme-emoji">${theme.emoji}</div>
    <div class="theme-name">${theme.name}</div>
    <div class="theme-description">${theme.description}</div>
  `;
  
  // Обработчик клика
  card.onclick = () => this.handleThemeSelected(theme);
  
  return card;
}
```

#### Метод: `handleThemeSelected(theme)`

**Назначение:** Обработка выбора темы - запуск анализа.

```typescript
private handleThemeSelected(theme: FashionTheme): void {
  logger.info('Theme selected', { themeId: theme.id, themeName: theme.name });
  
  // Скрываем выбор темы
  const themeSelection = getElement('#analysis-theme-selection');
  if (themeSelection) {
    themeSelection.classList.add('theme-selection-fade-out');
    setTimeout(() => {
      themeSelection.classList.add('hidden');
    }, 400);
  }
  
  // Показываем индикатор загрузки
  this.showLoadingIndicator();
  
  // Запускаем анализ
  this.startAnalysis(theme);
}
```

---

### 🔍 Шаг 3: Запуск анализа

#### Метод: `startAnalysis(theme)`

**Назначение:** Отправляет запрос на анализ.

```typescript
private async startAnalysis(theme: FashionTheme): Promise<void> {
  if (!this.currentImageData) {
    logger.error('No image data for analysis');
    return;
  }
  
  try {
    // 1. Импортируем analysisManager
    const { analysisManager } = await import('./analysis.js');
    
    // 2. Запускаем анализ (с темой)
    const response = await analysisManager.analyzeImage(
      this.currentImageData.base64,
      theme.description // "Для работы в офисе"
    );
    
    // 3. Скрываем загрузку
    this.hideLoadingIndicator();
    
    // 4. Показываем результат
    this.showAnalysisResult(response.analysis);
    
    logger.info('Analysis completed successfully');
  } catch (error) {
    logger.error('Analysis failed', error);
    this.hideLoadingIndicator();
    this.showAnalysisError(error);
  }
}
```

---

### 📤 analysisManager.analyzeImage()

**Файл:** `analysis.ts`

**Назначение:** Координирует процесс анализа.

```typescript
async analyzeImage(imageBase64: string, themeDescription?: string): Promise<AnalysisResponse> {
  logger.info('Starting image analysis', { themeDescription });
  
  try {
    // 1. Обновляем состояние - загрузка
    this.updateState({
      status: 'uploading',
      progress: 10,
      currentStep: 'Подготовка изображения...'
    });
    
    // 2. Подготавливаем запрос
    const request = this.prepareAnalysisRequest(imageBase64, themeDescription);
    
    // 3. Обновляем состояние - обработка
    this.updateState({
      status: 'processing',
      progress: 30,
      currentStep: 'Отправка на анализ...'
    });
    
    // 4. Отправляем на сервер
    const response = await api.analyzeImage(request);
    
    // 5. Проверяем успешность
    if (!response.success) {
      throw new Error('Сервер временно недоступен. Попробуйте позже.');
    }
    
    // 6. Обновляем состояние - завершено
    this.updateState({
      status: 'completed',
      progress: 100,
      currentStep: 'Анализ завершен'
    });
    
    // 7. Перезагружаем историю с сервера
    const { historyManager } = await import('./history.js');
    await historyManager.loadHistoryFromServer().catch(error => {
      logger.warn('Failed to reload history from server after analysis', error);
    });
    
    // 8. Обновляем UI
    const { uiManager } = await import('./uiManager.js');
    uiManager.updateHistoryDisplay();
    
    // 9. Обновляем подписку
    if (response.subscription) {
      authManager.updateSubscription(response.subscription);
    }
    
    logger.info('Automatic image analysis completed successfully');
    return response;
    
  } catch (error) {
    logger.error('Automatic image analysis failed', error);
    this.updateState({
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
    throw error;
  }
}
```

#### Метод: `prepareAnalysisRequest()`

**Назначение:** Подготавливает объект запроса.

```typescript
private prepareAnalysisRequest(imageBase64: string, themeDescription?: string): AnalysisRequest {
  const initData = authManager.getInitData();
  
  const request: AnalysisRequest = {
    photo: imageBase64,             // Base64 изображения
    platform: navigator.platform,   // "iPhone", "Win32", etc.
    userAgent: navigator.userAgent  // Для логирования
  };
  
  if (initData) {
    request.initData = initData; // Для авторизации
  }
  
  if (themeDescription) {
    request.theme = themeDescription; // "Для работы в офисе"
  }
  
  return request;
}
```

---

### 🌐 api.analyzeImage() - отправка на сервер

**Файл:** `api.ts`

```typescript
async analyzeImage(request: AnalysisRequest): Promise<AnalysisResponse> {
  return this.post<AnalysisResponse>('/analyze', request, {
    timeout: TIMEOUTS.ANALYSIS_REQUEST // 60 секунд
  });
}
```

**POST /api/analyze на сервере:**

```javascript
// server/src/api/analyze.js
router.post('/', async (req, res) => {
  const { photo, initData, theme } = req.body;
  
  // 1. Валидация initData
  const validation = validateTelegramWebAppData(initData);
  if (!validation.isValid) {
    return res.status(401).json({ success: false, error: 'Invalid initData' });
  }
  
  // 2. Получаем пользователя
  const user = await getUserByTelegramId(validation.data.user.id);
  
  // 3. Проверяем лимиты
  if (user.subscription.analysesLeft <= 0) {
    return res.status(403).json({ success: false, error: 'No analyses left' });
  }
  
  // 4. Оптимизируем изображение через Sharp
  const optimizedPhoto = await optimizeImageForStorage(photo);
  // Sharp: .rotate() → .resize(800,800) → .jpeg(85%)
  
  // 5. Сохраняем файл на диск
  const photoPath = await saveAnalysisImage(user.telegramId, optimizedPhoto);
  // server/uploads/analysis/251053908/analysis_1760347457073.jpg
  
  // 6. Отправляем на FastVLM для анализа
  const fastVLMResponse = await axios.post('http://127.0.0.1:3001/analyze', {
    photo: optimizedPhoto,
    theme: theme || 'casual'
  });
  
  // 7. Сохраняем в БД
  const historyItem = await saveAnalysisToHistory(
    user.id,
    user.telegramId,
    optimizedPhoto,
    fastVLMResponse.data.analysis
  );
  
  // 8. Обновляем счетчики пользователя
  await updateUserCounters(user.id, { analysesLeft: -1 });
  
  // 9. Возвращаем результат
  return res.json({
    success: true,
    analysis: fastVLMResponse.data.analysis,
    photoUrl: `/uploads/analysis/${user.telegramId}/${photoPath}`,
    subscription: {
      type: user.subscription.type,
      analysesLeft: user.subscription.analysesLeft - 1
    }
  });
});
```

**optimizeImageForStorage():**

```javascript
async function optimizeImageForStorage(base64Image) {
  const imageBuffer = Buffer.from(cleanBase64, 'base64');
  
  // Sharp обработка
  const optimizedBuffer = await sharp(imageBuffer)
    .rotate()                    // ✅ EXIF orientation fix (автоматически)
    .resize(800, 800, {
      fit: 'inside',             // Сохраняет пропорции
      withoutEnlargement: true   // Не увеличивает маленькие изображения
    })
    .jpeg({
      quality: 85,               // 85% качество
      progressive: true
    })
    .toBuffer();
  
  return optimizedBuffer.toString('base64');
}
```

**saveAnalysisImage():**

```javascript
// server/src/utils/fileStorage.js
async function saveAnalysisImage(telegramId, base64Data) {
  // Путь: server/uploads/analysis/{telegramId}/
  const userDir = path.join(ANALYSIS_DIR, String(telegramId));
  
  // Создаём директорию если нет
  await fs.mkdir(userDir, { recursive: true });
  
  // Имя файла: analysis_{timestamp}.jpg
  const filename = `analysis_${Date.now()}.jpg`;
  const filepath = path.join(userDir, filename);
  
  // Декодируем base64 и сохраняем
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(filepath, buffer);
  
  logger.info('Analysis image saved', {
    telegramId,
    filename,
    sizeKB: Math.round(buffer.length / 1024)
  });
  
  return filename; // "analysis_1760347457073.jpg"
}
```

---

### 🔄 Шаг 4: Обновление истории

После того как сервер сохранил анализ в БД, клиент **перезагружает историю**:

```typescript
// В analysisManager.analyzeImage():

// 7. Перезагружаем историю с сервера
const { historyManager } = await import('./history.js');
await historyManager.loadHistoryFromServer();

// 8. Обновляем UI
const { uiManager } = await import('./uiManager.js');
uiManager.updateHistoryDisplay();
```

#### historyManager.loadHistoryFromServer()

**Назначение:** Загружает актуальную историю с сервера.

**Подробно см. в разделе:** [Управление историей](#управление-историей)

**Кратко:**
1. GET /api/history?initData=...&limit=50&order=desc
2. Сервер возвращает массив HistoryItem с photoUrl
3. Нормализует до 50 элементов (добавляет пустые)
4. Сохраняет в localStorage как кэш
5. Отправляет событие 'history:updated'

**Событие 'history:updated':**

```typescript
// В uiMenu.ts init():
window.addEventListener('history:updated', () => {
  logger.info('History updated from server, refreshing carousel');
  this.updateHistoryDisplay();
});
```

**Результат:**
- Карусель автоматически обновляется
- Новый анализ появляется **справа** (самый новый)
- Пользователь видит результат

---

## 📦 Предзагрузка данных

### Модуль: dataCache.ts

**Назначение:** Предзагружает гардероб, капсулы и изображения в фоне.

---

### Метод: `preloadData()`

**Вызывается:** В `main.ts` после авторизации.

**Что делает:**

```typescript
async preloadData(): Promise<void> {
  if (this.isLoading || this.isLoaded) {
    logger.info('Data already loading or loaded');
    return;
  }
  
  this.isLoading = true;
  const startTime = Date.now();
  
  try {
    logger.info('Starting data preload');
    
    // 1. Загружаем данные параллельно
    const [wardrobeResponse, capsulesResponse] = await Promise.allSettled([
      this.loadWardrobeItems(),
      this.loadCapsules()
    ]);
    
    // 2. Обрабатываем результаты
    if (wardrobeResponse.status === 'fulfilled') {
      this.wardrobeItems = wardrobeResponse.value;
      logger.info('Wardrobe items loaded', { count: this.wardrobeItems.length });
    }
    
    if (capsulesResponse.status === 'fulfilled') {
      this.capsules = capsulesResponse.value;
      logger.info('Capsules loaded', { count: this.capsules.length });
    }
    
    // 3. Собираем все URL изображений
    const imageUrls = this.collectImageUrls();
    logger.info('Collected image URLs', { count: imageUrls.length });
    
    // 4. Кэшируем изображения (фон, не блокирует)
    this.cacheImages(imageUrls).catch(error => {
      logger.error('Error caching images', error);
    });
    
    this.isLoaded = true;
    const loadTime = Date.now() - startTime;
    
    logger.info('Data preload completed', {
      wardrobeCount: this.wardrobeItems.length,
      capsulesCount: this.capsules.length,
      imageUrlsCount: imageUrls.length,
      loadTime: loadTime + 'ms'
    });
    
  } catch (error) {
    logger.error('Error during data preload', error);
  } finally {
    this.isLoading = false;
  }
}
```

---

### Метод: `loadWardrobeItems()`

**Назначение:** Загружает элементы гардероба с сервера.

```typescript
private async loadWardrobeItems(): Promise<WardrobeItem[]> {
  try {
    const initData = window.Telegram?.WebApp?.initData || '';
    
    const response = await fetch(`/api/wardrobe?initData=${encodeURIComponent(initData)}`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to load wardrobe items');
    }
    
    return result.items || [];
  } catch (error) {
    logger.error('Error loading wardrobe items', error);
    return [];
  }
}
```

---

### Метод: `loadCapsules()`

**Назначение:** Загружает капсулы с сервера.

```typescript
private async loadCapsules(): Promise<Capsule[]> {
  try {
    const initData = window.Telegram?.WebApp?.initData || '';
    
    const response = await fetch(`/api/capsules?initData=${encodeURIComponent(initData)}`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to load capsules');
    }
    
    return result.capsules || [];
  } catch (error) {
    logger.error('Error loading capsules', error);
    return [];
  }
}
```

---

### Метод: `collectImageUrls()`

**Назначение:** Собирает все URL изображений для предзагрузки.

```typescript
private collectImageUrls(): string[] {
  const urls = new Set<string>();
  
  // 1. Изображения из гардероба
  this.wardrobeItems.forEach(item => {
    if (item.imageUrl) {
      urls.add(item.imageUrl);
    }
  });
  
  // 2. Миниатюры капсул
  this.capsules.forEach(capsule => {
    if (capsule.thumbnailUrl) {
      urls.add(capsule.thumbnailUrl);
    }
    
    // Изображения элементов капсулы
    capsule.items?.forEach(capsuleItem => {
      if (capsuleItem.wardrobeItem?.imageUrl) {
        urls.add(capsuleItem.wardrobeItem.imageUrl);
      }
    });
  });
  
  // 3. NEW: Изображения из истории анализов
  const historyItems = historyManager.getAllItems();
  historyItems.forEach((item: HistoryItem) => {
    if (!item.isEmpty && item.photoUrl) {
      urls.add(item.photoUrl);
    }
  });
  
  return Array.from(urls);
}
```

---

### Метод: `cacheImages(imageUrls)`

**Назначение:** Предзагружает изображения через Image() объекты.

```typescript
private async cacheImages(imageUrls: string[]): Promise<void> {
  if (imageUrls.length === 0) {
    logger.info('No images to cache');
    return;
  }
  
  try {
    const startTime = Date.now();
    let cachedCount = 0;
    let failedCount = 0;
    
    logger.info('Starting image caching', { 
      totalCount: imageUrls.length 
    });
    
    // Кэшируем порциями по 5 для контроля нагрузки
    const batchSize = 5;
    
    for (let i = 0; i < imageUrls.length; i += batchSize) {
      const batch = imageUrls.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (relativeUrl) => {
          return new Promise<{ url: string; success: boolean }>((resolve, reject) => {
            try {
              // Конвертируем в абсолютный URL
              const absoluteUrl = this.makeAbsoluteUrl(relativeUrl);
              
              // Создаем Image объект для предзагрузки
              const img = new Image();
              
              img.onload = () => {
                logger.debug('Image preloaded successfully', { url: absoluteUrl });
                resolve({ url: absoluteUrl, success: true });
              };
              
              img.onerror = (error) => {
                logger.warn('Failed to preload image', { url: absoluteUrl, error });
                reject(new Error(`Failed to load: ${absoluteUrl}`));
              };
              
              // Начинаем загрузку
              img.src = absoluteUrl;
              
            } catch (error) {
              logger.warn('Failed to cache image', { url: relativeUrl, error });
              reject(error);
            }
          });
        })
      );
      
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          cachedCount++;
        } else {
          failedCount++;
        }
      });
      
      // Небольшая задержка между батчами
      if (i + batchSize < imageUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const cacheTime = Date.now() - startTime;
    
    logger.info('Image caching completed', {
      totalCount: imageUrls.length,
      cached: cachedCount,
      failed: failedCount,
      cacheTime: cacheTime + 'ms'
    });
    
  } catch (error) {
    logger.error('Error caching images', error);
  }
}
```

**Результат предзагрузки:**
- Все изображения в браузерном кэше
- Мгновенное отображение гардероба/капсул/истории
- Улучшенный UX

---

## 📚 Управление историей

### Модуль: history.ts

**Назначение:** Единственный источник правды для истории анализов.

---

### Класс: `HistoryManager`

#### Свойства:

```typescript
class HistoryManager {
  private history: HistoryItem[] = [];              // Массив элементов истории
  private maxItems = HISTORY_CONSTRAINTS.MAX_ITEMS; // 50
  
  constructor() {
    this.loadFromStorage(); // Загружаем localStorage как кэш
  }
}
```

---

### 💾 Метод: `loadFromStorage()`

**Назначение:** Загружает историю из localStorage (кэш).

**Вызывается:** В конструкторе при создании экземпляра.

```typescript
private loadFromStorage(): void {
  try {
    const storedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
    
    if (!storedHistory) {
      this.history = this.createEmptyHistory();
      logger.info('Created empty history - no data in localStorage');
      return;
    }
    
    const parsedHistory = safeJsonParse<HistoryItem[]>(storedHistory, []);
    
    if (!Array.isArray(parsedHistory)) {
      logger.warn('Invalid history format, creating new');
      this.history = this.createEmptyHistory();
      return;
    }
    
    // Валидация
    const validation = validateHistory(parsedHistory);
    if (!validation.isValid) {
      logger.error('History validation failed', { errors: validation.errors });
      this.history = this.createEmptyHistory();
      return;
    }
    
    if (validation.warnings.length > 0) {
      logger.warn('History warnings', { warnings: validation.warnings });
    }
    
    // Нормализуем до 50 элементов
    this.history = this.normalizeHistory(parsedHistory);
    
    const filledCount = this.history.filter(item => item && !item.isEmpty).length;
    
    logger.info('History loaded from storage successfully', {
      totalItems: this.history.length,
      filledItems: filledCount,
      emptyItems: this.history.length - filledCount
    });
    
  } catch (error) {
    logger.error('Error loading history from storage', error);
    this.history = this.createEmptyHistory();
  }
}
```

---

### 🌐 Метод: `loadHistoryFromServer()`

**Назначение:** **ОСНОВНОЙ ИСТОЧНИК** - загружает историю с сервера.

**Вызывается:**
- В `main.ts` при инициализации (после авторизации)
- После каждого нового анализа
- При обновлении истории

```typescript
async loadHistoryFromServer(): Promise<boolean> {
  try {
    logger.info('Loading history from server');
    
    // 1. Получаем initData для авторизации
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      throw new Error('No Telegram initData available');
    }
    
    // 2. Формируем запрос GET /api/history
    const queryParams = new URLSearchParams({
      initData,
      limit: '50',
      sortBy: 'createdAt',
      order: 'desc' // Сервер возвращает новые первые
    });
    
    const response = await api.get<ServerHistoryResponse>(`/history?${queryParams.toString()}`);
    
    if (!response.success || !response.history) {
      throw new Error('Failed to load history from server');
    }
    
    logger.info('History loaded from server', {
      itemsCount: response.history.length,
      total: response.pagination?.total
    });
    
    // 3. Преобразуем серверные данные в HistoryItem
    const serverItems = response.history.map((item: ServerHistoryItem) => {
      const result: Partial<HistoryItem> & { timestamp: string } = {
        timestamp: item.createdAt,
        id: String(item.id),
        sourceType: 'photo' as const,
        isEmpty: false
      };
      
      // Добавляем только существующие поля
      if (item.photoUrl) result.photoUrl = item.photoUrl;
      if (item.photoData) {
        result.photoData = item.photoData;
        result.photo = item.photoData;
      }
      if (item.technicalAnalysis) result.analysis = item.technicalAnalysis;
      else if (item.analysisText) result.analysis = item.analysisText;
      
      return result as HistoryItem;
    });
    
    // 4. Нормализуем до 50 элементов (добавляем пустые)
    this.history = this.normalizeHistory(serverItems);
    
    // 5. Сохраняем в localStorage как кэш
    this.saveToStorage();
    
    logger.info('History synced from server', {
      filledItems: this.getFilledCount(),
      totalSlots: this.maxItems
    });
    
    // 6. Уведомляем UI об обновлении
    window.dispatchEvent(new CustomEvent('history:updated', {
      detail: { source: 'server', itemsCount: this.getFilledCount() }
    }));
    
    return true;
    
  } catch (error) {
    logger.error('Failed to load history from server', error);
    // Fallback: данные из localStorage уже загружены в constructor
    logger.info('Using localStorage as fallback');
    return false;
  }
}
```

**Формат серверного ответа:**

```typescript
interface ServerHistoryResponse {
  success: boolean;
  history: ServerHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface ServerHistoryItem {
  id: number;
  photoUrl?: string;           // "/uploads/analysis/123/photo.jpg"
  photoData?: string;          // legacy base64
  analysisText?: string;       // user description
  technicalAnalysis?: string;  // AI analysis
  createdAt: string;           // ISO timestamp
  isPublic: boolean;
}
```

---

### ➕ Метод: `addItem(item)`

**Назначение:** Добавляет новый элемент в историю.

**⚠️ ВАЖНО:** Этот метод **НЕ** используется после рефакторинга!
- Сервер сам сохраняет в БД
- Клиент только вызывает `loadHistoryFromServer()`

**Оставлен для:**
- Совместимости
- Возможного offline режима

```typescript
addItem(item: HistoryItem): boolean {
  try {
    // Валидация
    const validation = validateHist
