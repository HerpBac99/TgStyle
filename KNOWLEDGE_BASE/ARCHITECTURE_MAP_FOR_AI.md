# TgStyle - Карта архитектуры и вызовов для AI агента

**Версия:** 2.0.0  
**Последнее обновление:** 2025-10-16  
**Статус:** Актуально для production

---

## 📋 ОГЛАВЛЕНИЕ

- [1. Полная цепочка инициализации](#1-полная-цепочка-инициализации)
- [2. Карта данных (Data Flow)](#2-карта-данных-data-flow)
- [3. Модули и их зависимости](#3-модули-и-их-зависимости)
- [4. API эндпоинты](#4-api-эндпоинты)
- [5. Типы данных](#5-типы-данных)
- [6. Проблемные места](#6-проблемные-места)

---

## 1. Полная цепочка инициализации

### #INIT #STARTUP #ENTRY-POINT

**Точка входа:** `client/src/main.ts`

```
Window Load Event (DOM ready)
  ↓
app.initialize() [TgStyleApp.initialize()]
  │
  ├─→ this.initializeTelegram() #INIT #TELEGRAM
  │     └─→ window.Telegram?.WebApp
  │     └─→ this.tg.expand() / .enableClosingConfirmation() / .ready()
  │     └─→ (window as any).tgStyleApi = api [GLOBAL]
  │
  ├─→ this.setupAppBehavior() #INIT #SETUP
  │     └─→ document.body.style.overflow = 'hidden'
  │     └─→ setupGlobalEventHandlers()
  │     └─→ setupMobileMeta()
  │
  ├─→ this.initializeUI() #INIT #UI
  │     └─→ uiManager.init()
  │
  ├─→ this.performAuthentication() #INIT #AUTH
  │     └─→ authManager.authenticate()
  │           └─→ api.post('/auth', { initData })
  │           └─→ authManager создается в модуле auth.ts
  │
  ├─→ this.preloadAppData() #INIT #DATA
  │     └─→ historyManager.loadHistoryFromServer() #DATA #CAROUSEL
  │           └─→ HistoryManager инициализируется в конструкторе
  │               ├─→ private loadFromStorage() - загружает из localStorage
  │               ├─→ validateHistory() - валидирует данные
  │               └─→ this.history: HistoryItem[] - хранит все элементы
  │     └─→ dataCacheManager.preloadData() - фоновая загрузка
  │
  ├─→ this.handleSharedAnalysis() #SHARED-ANALYSIS
  │
  └─→ this.completeInitialization() #INIT #COMPLETE
        └─→ this.dispatchAppEvent(APP_EVENTS.READY)
        └─→ this.logModulesStats()
```

---

## 2. Карта данных (Data Flow)

### #DATA-FLOW #CAROUSEL #RENDER

**Сценарий:** Отображение карусели истории

```
uiManager.init()
  ↓
uiManager.updateHistoryDisplay()
  ↓
uiMenuManager.updateHistoryDisplay() [FILE: uiMenu.ts, LINE: ~428]
  ├─→ const filledItems = historyManager.getFilledItems()
  │     └─→ HistoryManager метод: возвращает массив заполненных элементов
  │     └─→ ИСТОЧНИК: this.history массив (инициализирован в конструкторе)
  │     └─→ ВАЛИДАЦИЯ: validateHistoryItem() для каждого элемента
  │
  ├─→ const sortedItems = [...filledItems].reverse()
  │     └─→ ТРАНСФОРМАЦИЯ: сортировка old→new (сервер возвращает new→old)
  │
  ├─→ this.createCarouselCards(sortedItems)
  │     └─→ Динамическое создание DOM элементов
  │     └─→ FOR EACH item:
  │           └─→ this.createCard(index, data)
  │               ├─→ this.createCardElement(index)
  │               ├─→ this.createCardContent()
  │               └─→ this.setupFilledCard(card, content, data) [LINE: ~505]
  │                   ├─→ if (data.photoUrl) card.style.backgroundImage
  │                   ├─→ else data.photo || data.photoData (base64)
  │                   │
  │                   ├─→ NEW: Загрузка лайков #LIKES
  │                   │   ├─→ if (data.id)
  │                   │   ├─→ const historyItemId = parseInt(data.id)
  │                   │   ├─→ this.loadCarouselLikeStatus(historyItemId, likeBtn, likesCountEl)
  │                   │   │     └─→ api.get(`/analysis-likes/${historyItemId}/status`)
  │                   │   │     └─→ Обновляет UI: likeBtn.classList.add('liked')
  │                   │   └─→ likeBtn.addEventListener('click', likeClickHandler) #EVENT
  │                   │
  │                   └─→ this.addLongPressHandlers(card, realIndex) #DELETE-MODE
  │                       └─→ element.addEventListener('mousedown/touchstart')
  │
  ├─→ this.positionCarousel() - позиционирование карусели
  │
  └─→ this.updateCarouselNavigation() - создание точек навигации
```

### #INITIALIZATION-CHAIN

**Инициализация historyManager в детялях:**

```
TgStyleApp.initialize() 
  ↓
this.preloadAppData()
  ↓
historyManager.loadHistoryFromServer()
  ├─→ HistoryManager созда́ется при импорте модуля auth.ts
  │     └─→ constructor() вызывается АВТОМАТИЧЕСКИ
  │         └─→ this.loadFromStorage()
  │             ├─→ localStorage.getItem(STORAGE_KEYS.HISTORY)
  │             ├─→ validateHistory(parsedHistory)
  │             ├─→ this.history = [...] // инициализируется
  │             └─→ СОСТОЯНИЕ: массив HistoryItem[]
  │
  └─→ NEW: Затем запрашивает данные с сервера
        └─→ api.get('/history?limit=50...')
        └─→ Обновляет this.history новыми данными
        └─→ Синхронизирует localStorage
        └─→ Отправляет 'history:updated' событие
            └─→ uiMenuManager слушает это событие
                └─→ Вызывает updateHistoryDisplay() ЗАНОВО
```

---

## 3. Модули и их зависимости

### #MODULES #DEPENDENCIES

| Модуль | Файл | Тип | Инициализация | Зависимости |
|--------|------|-----|--------------|-------------|
| **authManager** | `auth.ts` | Singleton | Constructor при импорте | `api`, `logger` |
| **historyManager** | `history.ts` | Singleton | Constructor при импорте | `api`, `logger`, `validation` |
| **uiManager** | `uiManager.ts` | Singleton | Вызов `init()` | `uiMenuManager`, `uiAnalysisManager`, `uiCoreManager`, `wardrobeManager`, `capsulesManager` |
| **uiMenuManager** | `uiMenu.ts` | Singleton | Автоматически через import | `historyManager`, `authManager`, `logger` |
| **uiAnalysisManager** | `uiAnalysis.ts` | Singleton | Автоматически через import | `api`, `logger` |
| **uiCoreManager** | `uiCore.ts` | Singleton | Автоматически через import | `authManager`, `logger` |
| **api** | `api.ts` | Singleton | Вызов методов | - |
| **logger** | `logger.ts` | Singleton | Автоматически через import | - |
| **dataCacheManager** | `dataCache.ts` | Singleton | Фоновая инициализация | `historyManager`, `api`, `logger` |

---

## 4. API эндпоинты

### #API #ENDPOINTS #VALIDATION

#### История #HISTORY

```
GET /history?initData=...&limit=50&sortBy=createdAt&order=desc
├─→ ВАЛИДАЦИЯ: validateTelegramWebAppData(initData)
├─→ ВОЗВРАЩАЕТ: { success: true, data: HistoryItem[] }
├─→ СТОРУДЯ: localStorage via historyManager
└─→ ВЫЗЫВАЮЩИЙ: historyManager.loadHistoryFromServer() [history.ts LINE: ~200]
    └─→ После загрузки отправляет 'history:updated' событие

POST /auth
├─→ ТЕЛО: { initData }
├─→ ВАЛИДАЦИЯ: validateTelegramWebAppData(initData)
├─→ ВОЗВРАЩАЕТ: { success: true, user: UserData, subscription: SubscriptionData }
└─→ ВЫЗЫВАЮЩИЙ: authManager.authenticate() [auth.ts]

GET|POST|DELETE /analysis-likes/{historyItemId}
├─→ GET /status - получить статус лайка текущего пользователя
│   ├─→ ПАРАМЕТРЫ: historyItemId, initData (query)
│   ├─→ ВОЗВРАЩАЕТ: { success: true, isLiked: boolean, likesCount: number }
│   └─→ ВЫЗЫВАЮЩИЙ: uiMenuManager.loadCarouselLikeStatus() [uiMenu.ts LINE: ~310]
│
├─→ POST - добавить лайк
│   ├─→ ПАРАМЕТРЫ: historyItemId (path), { initData } (body)
│   ├─→ ВОЗВРАЩАЕТ: { success: true, isLiked: true, likesCount: number }
│   └─→ ВЫЗЫВАЮЩИЙ: uiMenuManager.handleCarouselLikeClick() [uiMenu.ts LINE: ~345]
│
└─→ DELETE - удалить лайк
    ├─→ ПАРАМЕТРЫ: historyItemId (path), initData (query)
    ├─→ ВОЗВРАЩАЕТ: { success: true, isLiked: false, likesCount: number }
    └─→ ВЫЗЫВАЮЩИЙ: uiMenuManager.handleCarouselLikeClick() [uiMenu.ts LINE: ~345]
```

---

## 5. Типы данных

### #TYPES #DATA-STRUCTURE #VALIDATION

#### HistoryItem

```typescript
interface HistoryItem {
  id?: string;                    // Optional, может быть string или число
  photo?: string;                 // Base64 encoded (LEGACY)
  photoUrl?: string;              // URL to file (PREFERRED)
  photoData?: string;             // Alias for photo
  analysis?: string;              // LLM analysis text
  timestamp: string;              // ISO 8601 datetime
  savedAt?: string;               // When saved
  sourceType?: 'photo' | 'pinterest';
  isEmpty?: boolean;              // Flag for empty slots
}

ВАЛИДАЦИЯ: utils/validation.ts validateHistoryItem()
  ├─→ Проверяет типы всех полей
  ├─→ Проверяет timestamp формат
  ├─→ Возвращает { isValid: boolean, errors: string[] }
  └─→ ВЫЗЫВАЕТСЯ ИЗ:
      ├─→ historyManager.loadFromStorage() [history.ts LINE: ~40]
      └─→ historyManager.addItem() [history.ts LINE: ~150]

ПРОБЛЕМА: id может быть string или number
  └─→ setupFilledCard() использует: typeof data.id === 'string' ? parseInt() : data.id
  └─→ НУЖНО: Унифицировать тип на number в интерфейсе
```

#### Carousel State

```typescript
private carouselState = {
  currentCenterIndex: number;    // Индекс элемента в центре
  totalCards: number;             // Общее количество карт
  containerWidth: number;         // Ширина контейнера
}

ХРАНИТСЯ: UIMenuManager приватный член [uiMenu.ts LINE: ~97]
ОБНОВЛЯЕТСЯ: 
  ├─→ updateHistoryDisplay() → createCarouselCards()
  ├─→ moveCarouselToPosition()
  └─→ positionCarousel()
```

---

## 6. Проблемные места

### #ISSUES #REFACTORING #OPTIMIZATION

#### 6.1 Дублирование Like методов

```
ПРОБЛЕМА: Два похожих метода для лайков:
  1. loadCarouselLikeStatus() [uiMenu.ts LINE: ~310]
  2. loadAndUpdateLikeStatus() [uiMenu.ts LINE: ~400] (в saved-analysis-screen)

РЕКОМЕНДАЦИЯ:
  └─→ Создать общий метод loadLikeStatus(historyItemId, elements)
      └─→ Будет использоваться обоими местами
      └─→ ФАЙЛ: uiMenu.ts
      └─→ СВЯЗАНО: handleCarouselLikeClick(), handleSavedAnalysisLikeClick()
```

#### 6.2 Тип данных id неоднозначен

```
ПРОБЛЕМА: HistoryItem.id?: string но используется как число в некоторых местах
  ├─→ setupFilledCard() [uiMenu.ts LINE: ~523]: parseInt(data.id)
  ├─→ loadCarouselLikeStatus() [uiMenu.ts LINE: ~312]: принимает number
  ├─→ server API: /analysis-likes/{historyItemId} - ожидает число
  └─→ БД: id - число (PRIMARY KEY)

РЕШЕНИЕ:
  1. Изменить интерфейс: id: number (убрать ?)
  2. Обновить все места где используется data.id
  3. ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЯ:
     ├─→ types/api.ts - interface HistoryItem
     ├─→ uiMenu.ts - setupFilledCard() LINE: ~523
     ├─→ history.ts - все операции с id
     └─→ validation.ts - validateHistoryItem()
```

#### 6.3 Неэффективный findRealHistoryIndex()

```
ПРОБЛЕМА: O(n) поиск с Map каждый раз при создании карточки
  ├─→ Вызывается: setupFilledCard() [uiMenu.ts LINE: ~540]
  ├─→ Используется для: addLongPressHandlers()
  └─→ При 50 карточках = 50 поисков O(n)

ОПТИМИЗАЦИЯ:
  1. Передать index напрямую из createCard()
  2. Убрать поиск по композитному ключу
  3. Экономия: 50 итераций → 0
  4. ФАЙЛ: uiMenu.ts МЕТОД: setupFilledCard()
```

#### 6.4 Повторные запросы likes

```
ПРОБЛЕМА: Каждая карточка загружает статус лайка отдельно
  ├─→ N карточек = N запросов при инициализации
  ├─→ ВЫЗОВОВ: loadCarouselLikeStatus() в setupFilledCard() LINE: ~530
  └─→ Нет кэширования между повторными открытиями

ОПТИМИЗАЦИЯ:
  1. Загрузить все статусы лайков одним запросом при preloadAppData()
  2. Кэшировать результаты в uiMenuManager
  3. Использовать кэш при отображении карточек
  4. НОВЫЙ ENDPOINT: GET /analysis-likes/batch?ids=[...]
  5. ФАЙЛЫ:
     ├─→ server/src/api/analysisLikes.js - добавить batch endpoint
     ├─→ uiMenu.ts - использовать кэш
     └─→ dataCache.ts - хранить кэш лайков
```

#### 6.5 Обработка events не консистентна

```
ПРОБЛЕМА: Разные способы передачи событий:
  ├─→ 'history:updated' - CustomEvent слушатель в constructor
  ├─→ click listeners - прямые обработчики
  ├─→ 'photo:captured' - CustomEvent
  └─→ Нет единого паттерна

ПАТТЕРН:
  1. Использовать EventEmitter или единую систему
  2. ФАЙЛЫ:
     ├─→ utils/eventBus.ts - создать центральный EventBus
     └─→ Обновить все события через него
```

#### 6.6 localStorage sync неполный

```
ПРОБЛЕМА: После api.get('/history') синхронизация может не пройти
  ├─→ historyManager.loadHistoryFromServer() обновляет this.history
  ├─→ Но updateHistoryDisplay() вызывается ВНЕ этого метода
  ├─→ Возможна race condition между setState и updateUI
  └─→ ФАЙЛ: history.ts LINE: ~200

РЕШЕНИЕ:
  1. loadHistoryFromServer() должен вернуть данные
  2. Вызывающий код должен явно вызвать updateHistoryDisplay()
  3. Или сделать это внутри метода как side-effect
```

---

## 7. Карта вызовов при изменении данных

### #UPDATE-FLOW #DATABASE-CHANGES #RELATED-CHANGES

#### Если изменить поле в HistoryItem

```
Шаг 1: Изменить тип в types/api.ts
  └─→ interface HistoryItem { newField?: string }

Шаг 2: ПРОВЕРИТЬ И ОБНОВИТЬ:
  ├─→ validation.ts validateHistoryItem() - добавить проверку нового поля
  ├─→ history.ts:
  │   ├─→ loadFromStorage() - обработать старые данные без поля
  │   ├─→ normalizeHistory() - если нужна миграция
  │   └─→ createEmptyHistory() - добавить поле в пустую историю
  │
  ├─→ uiMenu.ts:
  │   ├─→ setupFilledCard() - отобразить новое поле если нужно
  │   └─→ showSavedAnalysis() - обновить для saved-analysis-screen
  │
  ├─→ server - UPDATE API:
  │   ├─→ Добавить поле в Prisma schema
  │   ├─→ Создать миграцию: npx prisma migrate dev --name add_new_field
  │   └─→ Обновить API endpoints которые возвращают HistoryItem
  │
  └─→ database - Обновить БД со всеми зависимостями:
      ├─→ ALTER TABLE history_items ADD COLUMN new_field ...
      └─→ Миграция OLD данных если нужно
```

#### Если добавить новый API endpoint

```
ЧЕКЛИСТ:
  1. server/src/api/newModule.js - создать endpoint
  2. server/server.js - зарегистрировать router
  3. types/api.ts - добавить interface для request/response
  4. client/src/modules/api.ts - добавить метод в ApiClient
  5. Где используется - обновить импорты и вызовы
  6. Добавить валидацию в server/src/utils/validation.ts
  7. Документировать в ARCHITECTURE_MAP_FOR_AI.md секция 4
```

---

## 8. Event система

### #EVENTS #EVENT-DRIVEN

```
СОЗДАНИЕ СОБЫТИЯ (в listener или пользовательском коде):
  window.dispatchEvent(new CustomEvent('history:updated', {
    detail: { data }
  }));

СЛУШАНИЕ СОБЫТИЯ:
  window.addEventListener('history:updated', () => {
    this.updateHistoryDisplay();
  });

ТЕКУЩИЕ СОБЫТИЯ В ПРИЛОЖЕНИИ:
  ├─→ 'history:updated' - Слушатель: uiMenuManager constructor [uiMenu.ts LINE: ~170]
  │                      Генератор: historyManager.loadHistoryFromServer() [history.ts LINE: ~200]
  │
  ├─→ 'photo:captured' - Слушатель: uiManager [uiManager.ts]
  │                      Генератор: cameraManager или пользовательский код
  │
  ├─→ 'auth:success' - Генератор: main.ts [main.ts LINE: ~250]
  │
  ├─→ 'app:ready' - Генератор: main.ts completeInitialization() [main.ts LINE: ~300]
  │
  └─→ #НОВОЕ: 'analysis:liked' - Генератор: uiMenuManager.handleCarouselLikeClick()
                                  Слушатель: ?
                                  РЕКОМЕНДАЦИЯ: Обновить другие части UI
```

---

## 9. Кэширование и состояние

### #STATE #CACHING #MEMORY

```
UIMenuManager внутреннее состояние:
  ├─→ private carouselState - позиция, индекс, размеры
  ├─→ private longPressState - долгое нажатие, удаление
  ├─→ private carouselSwipeState - свайп
  ├─→ private currentPreview - текущий открытый экран
  └─→ private elements - кэш DOM элементов

historyManager внутреннее состояние:
  ├─→ private history: HistoryItem[] - основной массив в памяти
  ├─→ private maxItems = 50 - максимум элементов
  └─→ localStorage - STORAGE_KEYS.HISTORY (синхронизация)

ПРОБЛЕМА: Если данные меняются на сервере, локальный кэш не обновится
  └─→ РЕШЕНИЕ: Периодический refresh или soft-refresh при фокусе приложения
```

---

## ТЕГИ ДЛЯ GREP ПОИСКА

Используйте эти теги для быстрого поиска в документе:

- `#INIT` - инициализация
- `#STARTUP` - запуск приложения
- `#ENTRY-POINT` - точка входа
- `#TELEGRAM` - Telegram WebApp API
- `#SETUP` - настройка
- `#UI` - пользовательский интерфейс
- `#AUTH` - аутентификация
- `#DATA` - данные
- `#CAROUSEL` - карусель истории
- `#LIKES` - система лайков
- `#RENDER` - отрисовка
- `#DATA-FLOW` - поток данных
- `#INITIALIZATION-CHAIN` - цепочка инициализации
- `#MODULES` - модули
- `#DEPENDENCIES` - зависимости
- `#API` - API endpoints
- `#ENDPOINTS` - конкретные endpoints
- `#VALIDATION` - валидация
- `#TYPES` - типы данных
- `#DATA-STRUCTURE` - структура данных
- `#ISSUES` - проблемы
- `#REFACTORING` - рефакторинг
- `#OPTIMIZATION` - оптимизация
- `#UPDATE-FLOW` - поток обновления
- `#DATABASE-CHANGES` - изменения БД
- `#RELATED-CHANGES` - связанные изменения
- `#EVENTS` - события
- `#EVENT-DRIVEN` - событийно-ориентированный паттерн
- `#STATE` - состояние
- `#CACHING` - кэширование
- `#MEMORY` - память
- `#DELETE-MODE` - режим удаления
- `#LIKES` - лайки
- `#EVENT` - события

---

## ПРИМЕРЫ ПОИСКА ДЛЯ AI

```bash
# Найти все места где используется historyManager
grep -n "#INITIALIZATION-CHAIN\|#CAROUSEL\|#DATA" ARCHITECTURE_MAP_FOR_AI.md

# Найти все проблемы которые связаны с БД
grep -n "#DATABASE-CHANGES\|#RELATED-CHANGES" ARCHITECTURE_MAP_FOR_AI.md

# Найти эндпоинты API
grep -n "#API\|#ENDPOINTS" ARCHITECTURE_MAP_FOR_AI.md

# Найти типы данных которые нужно менять вместе
grep -n "#TYPES\|#DATA-STRUCTURE" ARCHITECTURE_MAP_FOR_AI.md
```

---

**КОНЕЦ ДОКУМЕНТА**

*Этот документ должен быть основной справкой для AI агента при работе с TgStyle*
