# 📝 Система сохранения истории в TgStyle

Система сохранения истории в TgStyle представляет собой **двухуровневую архитектуру** с хранением данных как на клиенте (localStorage), так и на сервере (PostgreSQL база данных).

## 🏗️ Общая архитектура

```
Пользователь → Клиент (localStorage) ↔ Сервер (PostgreSQL)
      ↓              ↓
   UI отображение  Синхронизация
   Карусель       API эндпоинты
```

## 1️⃣ Клиентская сторона - localStorage

### HistoryManager (`client/src/modules/history.ts`)

**Инициализация:**
- При запуске приложения `loadFromStorage()` загружает историю из localStorage
- Валидирует данные с помощью `validateHistory()` и `validateHistoryItem()`
- Создает массив из 10 элементов с `{ isEmpty: true }` если история пустая

**Сохранение нового элемента:**
```typescript
addItem(item: HistoryItem): boolean {
  // Валидация элемента
  const validation = validateHistoryItem(item);

  // Поиск позиции для вставки (после последнего заполненного)
  const insertPosition = this.findInsertPosition();

  // Добавление в массив
  this.history[insertPosition] = { ...item, isEmpty: false };

  // Сохранение в localStorage
  this.saveToStorage();
}
```

**Структура HistoryItem:**
```typescript
interface HistoryItem {
  photo: string;           // base64 изображение
  timestamp: string;       // ISO дата создания
  sourceType: 'photo';     // источник (пока только фото)
  analysis?: string;       // результат анализа
  isEmpty?: boolean;       // флаг пустого слота
}
```

**Лимиты:**
- Максимум 10 элементов (`HISTORY_CONSTRAINTS.MAX_ITEMS`)
- При переполнении удаляется самый старый элемент
- Размер одного элемента ~4MB (base64 изображение без сжатия)
- **Сжатие отключено** для максимального качества анализа ИИ

## 2️⃣ Серверная сторона - PostgreSQL

### База данных (`db/prisma/schema.prisma`)

**Таблица User:**
```sql
CREATE TABLE users (
  id                  SERIAL PRIMARY KEY,
  telegramId          BIGINT UNIQUE,
  analysesCount       INT DEFAULT 3,      -- доступно анализов в неделю
  subscriptionType    VARCHAR DEFAULT 'free', -- 'free' | 'premium'
  subscriptionEndDate TIMESTAMP NULL,
  totalAnalyses       INT DEFAULT 0,      -- общее кол-во анализов
  weeklyResetDate     TIMESTAMP DEFAULT NOW()
);
```

**Таблица HistoryItem:**
```sql
CREATE TABLE history_items (
  id                 SERIAL PRIMARY KEY,
  userId             INT REFERENCES users(id),
  photoData          TEXT,                -- base64 изображение
  technicalAnalysis  TEXT,                -- результат FastVLM
  analysisText       TEXT NULL,           -- пользовательское описание
  isPublic           BOOLEAN DEFAULT true,
  createdAt          TIMESTAMP DEFAULT NOW()
);
```

## 3️⃣ Процесс сохранения анализа

### Шаг 1: Анализ изображения
1. Пользователь делает фото через камеру
2. **Изображение НЕ сжимается при отправке** (сжатие отключено для сохранения качества анализа ИИ)
3. Отправляется POST запрос на `/api/analyze`

### Шаг 2: Сжатие при сохранении в историю
1. После успешного анализа результат сохраняется в localStorage
2. **Проверяется размер элемента** (фото + текст анализа)
3. **Если размер > 2MB** → изображение сжимается до качества 50-90%
4. **Если сжатие не помогает** → используется оригинальное изображение
5. Сохраняется элемент с размером ≤ 2MB

### Шаг 3: Серверная обработка (`server/src/api/analyze.js`)

```javascript
// Валидация лимитов
const limitsCheck = checkAnalysisLimits(dbUser);
if (!limitsCheck.allowed) {
  return res.status(429).json({ error: 'Analysis limit exceeded' });
}

// Отправка в FastVLM AI
const analysisResult = await analyzeImage(imageBuffer, nickname);

// Сохранение в историю
const historyItem = await saveAnalysisToHistory(
  dbUser.id,
  photo,           // base64 изображение
  analysisResult.analysis // результат ИИ
);

// Обновление счетчиков (только для free пользователей)
if (dbUser.subscriptionType === 'free') {
  await updateUserCounters(dbUser.id);
}
```

### Функция saveAnalysisToHistory:
```javascript
async function saveAnalysisToHistory(userId, photoData, technicalAnalysis) {
  return await prisma.historyItem.create({
    data: {
      userId,
      photoData,           // base64 изображение
      technicalAnalysis,   // результат FastVLM
      analysisText: null,  // пользовательское описание
      isPublic: true,      // публичное по умолчанию
      createdAt: new Date()
    }
  });
}
```

### Функция updateUserCounters:
```javascript
async function updateUserCounters(userId) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      analysesCount: { decrement: 1 },  // -1 доступный анализ
      totalAnalyses: { increment: 1 },  // +1 общее количество
      updatedAt: new Date()
    }
  });
}
```

## 4️⃣ Синхронизация клиент-сервер

### На сервере:
- После успешного анализа возвращается `historyItemId` в ответе
- Клиент получает информацию о лимитах: `subscription.analysesLeft`

### На клиенте:
- Результат анализа сохраняется в localStorage через `analysisManager.saveToHistory()`
- UI обновляется для отображения нового элемента в карусели

## 5️⃣ Отображение истории в UI

### Карусель (`client/src/modules/ui.ts`)

```javascript
updateHistoryDisplay(): void {
  const filledItems = historyManager.getFilledItems();

  // Создание карт карусели
  this.createCarouselCards(filledItems);

  // Позиционирование (пустая карта всегда по центру)
  this.positionCarousel();

  // Обновление навигации
  this.updateCarouselNavigation();
}
```

**Логика позиционирования:**
- Пустая карта всегда на первой позиции (индекс 0) для новых фото
- Если история пустая → пустая карта в центре
- Если есть элементы → первый заполненный элемент (индекс 1) становится центральным

## 6️⃣ Особенности системы

### Двойное хранение:
- **localStorage**: Быстрый доступ, оффлайн работа, ограниченный размер
- **Сервер**: Надежное хранение, статистика, синхронизация между устройствами

### Лимиты и подписки:
- **Free**: 3 анализа в неделю, сбрасываются по понедельникам
- **Premium**: Безлимитные анализы
- Проверка происходит на сервере перед каждым анализом

### Валидация данных:
- Клиент: Проверка структуры, размера изображений
- Сервер: Проверка аутентификации, лимитов, корректности данных

### Обработка ошибок:
- При недоступности сервера → анализ не сохраняется в БД
- При ошибке localStorage → данные теряются, но анализ проходит
- Graceful degradation при проблемах с сетью

## 7️⃣ Потенциальные проблемы

1. **Размер localStorage**: Большие изображения могут превысить лимит (~5-10MB)
   - **Текущее решение**: Сжатие отключено, но можно добавить опциональное сжатие для больших файлов
2. **Синхронизация**: Данные на клиенте и сервере могут расходиться
3. **Производительность**: Большое количество элементов замедляет UI
4. **Безопасность**: Base64 изображения хранятся в открытом виде
5. **Размер передаваемых данных**: Большие изображения замедляют загрузку и анализ

## 📋 Полная карта вызовов - от запуска до сохранения

### 🚀 **Фаза 1: Запуск приложения**

#### **1.1 Инициализация клиента (`main.ts`)**
```
main.ts:373 → app.initialize()
├── main.ts:27 → TgStyleApp.initialize()
│   ├── main.ts:39 → initializeTelegram() - подключение к Telegram WebApp
│   ├── main.ts:42 → setupAppBehavior() - настройка поведения
│   ├── main.ts:45 → initializeUI() - инициализация UI
│   ├── main.ts:48 → performAuthentication() - авторизация
│   └── main.ts:51 → completeInitialization() - завершение
```

#### **1.2 Загрузка истории (`history.ts`)**
```
history.ts:30 → constructor() → loadFromStorage()
├── localStorage.getItem('tgStyleHistory') - чтение из localStorage
├── safeJsonParse() - безопасный парсинг JSON
├── validateHistory() - валидация данных
└── normalizeHistory() - нормализация массива до 10 элементов
```

#### **1.3 Отображение карусели (`ui.ts`)**
```
ui.ts:927 → init() → updateHistoryDisplay()
├── ui.ts:493 → updateHistoryDisplay()
│   ├── historyManager.getFilledItems() - получение заполненных элементов
│   ├── ui.ts:526 → createCarouselCards() - создание карточек
│   │   ├── totalCards = filledItems.length + 1 (пустая карточка)
│   │   ├── cards[0] = null (пустая карточка)
│   │   └── cards[1..n] = filledItems (заполненные в обратном порядке)
│   ├── ui.ts:678 → positionCarousel() - позиционирование
│   │   └── currentCenterIndex = Math.floor(totalCards / 2)
│   └── ui.ts:716 → updateCarouselNavigation() - точки навигации
```

---

### 📸 **Фаза 2: Процесс анализа фото**

#### **2.1 Захват фото (`camera.ts`)**
```
ui.ts:177 → handleCameraButtonClick() → handleHistoryCellClick(index=0)
├── Проверка лимитов: authManager.canAnalyze()
├── cameraManager.capturePhoto()
│   ├── camera.ts:32 → capturePhoto()
│   │   ├── camera.ts:79 → selectFile({preferCamera: true})
│   │   │   └── HTMLInputElement с capture="camera"
│   │   ├── camera.ts:125 → processImageFile(file)
│   │   │   ├── camera.ts:125 → validateFile() - размер, тип файла
│   │   │   ├── camera.ts:130 → readFileAsBase64() - чтение как base64
│   │   │   ├── camera.ts:133 → getImageDimensions() - размеры изображения
│   │   │   └── camera.ts:136 → create ImageData object
│   │   └── camera.ts:51 → автоматический анализ: analysisManager.analyzeImage()
```

#### **2.2 Отправка на сервер (`analysis.ts`)**
```
analysis.ts:264 → analyzeImage(imageBase64)
├── analysis.ts:268 → updateState('uploading')
├── analysis.ts:276 → prepareAnalysisRequest()
│   ├── imageBase64 + initData + platform info
│   └── analysis.ts:36 → request object
├── analysis.ts:285 → performAnalysisWithRetry()
│   ├── analysis.ts:52 → performAnalysisWithRetry()
│   │   └── analysis.ts:68 → api.analyzeImage(request)
│   │       └── POST /api/analyze с multipart/form-data
├── analysis.ts:287 → updateState('completed')
└── analysis.ts:294 → saveToHistory() + UI обновление
```

#### **2.3 Серверная обработка (`server/analyze.js`)**
```
routes/api.js → router.post('/analyze') → analyze.js:286
├── analyze.js:292 → проверка обязательных параметров
├── analyze.js:305 → validateTelegramWebAppData() - валидация Telegram
├── analyze.js:318 → извлечение данных пользователя
├── analyze.js:332 → getUserByTelegramId() - получение из БД
├── analyze.js:343 → checkAnalysisLimits() - проверка лимитов
│   ├── Free: analysesCount > 0
│   └── Premium: без ограничений
├── analyze.js:377 → декодирование base64 в Buffer
├── analyze.js:394 → проверка размера изображения
├── analyze.js:163 → analyzeImage() - FastVLM анализ
│   ├── analyze.js:165 → logger.info('Отправка в FastVLM')
│   ├── analyze.js:168 → base64 → Buffer
│   ├── analyze.js:179 → fetch() POST /analyze в FastVLM
│   ├── analyze.js:194 → JSON.parse() ответа
│   └── analyze.js:203 → cleanAnalysisText()
├── analyze.js:411 → saveAnalysisToHistory() - сохранение в БД
│   └── prisma.historyItem.create()
└── analyze.js:422 → updateUserCounters() - обновление счетчиков
    └── prisma.user.update({ analysesCount: decrement(1) })
```

---

### 💾 **Фаза 3: Сохранение в историю**

#### **3.1 Сжатие и сохранение (`analysis.ts`)**
```
analysis.ts:99 → saveToHistory(response, imageBase64)
├── analysis.ts:101 → получение изображения
├── analysis.ts:110 → расчет размера (фото + текст)
│   └── cameraManager.calculateHistoryItemSize()
├── analysis.ts:120 → проверка: размер > 2MB?
│   ├── Да → сжатие: cameraManager.compressImage()
│   └── Нет → использование оригинала
├── analysis.ts:166 → создание historyItem
│   ├── photo: сжатое/оригинальное изображение
│   ├── analysis: текст анализа
│   ├── timestamp: ISO дата
│   └── sourceType: 'photo'
└── analysis.ts:181 → historyManager.addItem(historyItem)
```

#### **3.2 Сохранение в localStorage (`history.ts`)**
```
history.ts:126 → addItem(item)
├── history.ts:129 → validateHistoryItem()
├── history.ts:144 → findInsertPosition() - позиция вставки
├── history.ts:153 → this.history[insertPosition] = item
└── history.ts:167 → saveToStorage()
    └── localStorage.setItem('tgStyleHistory', JSON)
```

#### **3.3 Обновление UI (`ui.ts`)**
```
analysis.ts:298 → uiManager.updateHistoryDisplay()
├── ui.ts:493 → updateHistoryDisplay()
│   ├── historyManager.getFilledItems()
│   ├── ui.ts:526 → createCarouselCards() - пересоздание карточек
│   ├── ui.ts:678 → positionCarousel() - перепозиционирование
│   └── ui.ts:716 → updateCarouselNavigation() - обновление точек
├── analysis.ts:302 → authManager.updateSubscription() - счетчики
└── ui.ts:198 → showAnalysisResult() - показ результата
```

---

### 🎯 **Фаза 4: Взаимодействие с историей**

#### **4.1 Просмотр истории**
```
ui.ts:214 → handleHistoryCellClick(index)
├── index === 0 → пустая карточка
│   └── handleCameraButtonClick() → новая фотка
└── index > 0 → заполненная карточка
    ├── filledItems = historyManager.getFilledItems()
    ├── item = filledItems[index - 1]
    └── ui.ts:426 → showSavedAnalysis(item)
```

#### **4.2 Карусель и навигация**
```
ui.ts:799 → setupCarouselSwipe()
├── touchstart → handleCarouselTouchStart()
├── touchmove → handleCarouselTouchMove()
├── touchend → handleCarouselTouchEnd()
│   ├── moveToNextCarouselItem() / moveToPreviousCarouselItem()
│   └── ui.ts:746 → moveCarouselToPosition()
└── ui.ts:716 → updateCarouselNavigation() - точки
```

#### **4.3 Удаление элементов**
```
ui.ts:963 → addLongPressHandlers()
├── mousedown/touchstart → startLongPress()
├── таймер 500ms → activateLongPress()
├── ui.ts:1145 → addDeleteButton()
├── click на кнопку → handleDeleteClick()
│   ├── showConfirmDialog()
│   ├── historyManager.removeItem(index)
│   └── updateHistoryDisplay()
└── ui.ts:1404 → exitDeleteMode()
```

---

### 📊 **Карта данных и состояний**

#### **Data Flow:**
```
Фото → Base64 → CameraManager → AnalysisManager → API → Server
                        ↓                    ↓           ↓
                  ImageData → AnalysisRequest → FastVLM → HistoryItem
                        ↓                    ↓           ↓
               localStorage ← UI Update ← Response ← DB Save
```

#### **State Flow:**
```
Idle → Uploading → Processing → Completed → History Saved → UI Updated
```

#### **Error Handling:**
```
Network Error → Retry (3 attempts) → Fallback
DB Error → Continue without saving → Log error
UI Error → Graceful degradation → Continue
```

### 🎯 **Итог**

Система сохранения истории в TgStyle обеспечивает:
- ✅ **Надежность**: Двойное хранение с fallback
- ✅ **Производительность**: Быстрая загрузка из localStorage
- ✅ **Масштабируемость**: Лимиты и подписки для монетизации
- ✅ **UX**: Красивая карусель с плавными анимациями
- ✅ **Аналитика**: Полная статистика использования

Архитектура позволяет легко расширять функциональность: добавлять комментарии, рейтинги, социальные функции и т.д. 🚀
