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
2. **Изображение НЕ сжимается** (сжатие отключено для сохранения качества анализа ИИ)
   - В `client/src/modules/camera.ts` (строка 150-151) есть комментарий: *"Сжатие изображений отключено для сохранения качества"*
3. Отправляется POST запрос на `/api/analyze`

### Шаг 2: Серверная обработка (`server/src/api/analyze.js`)

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
- Если история пустая → пустая карта в центре
- Если есть элементы → самый новый элемент становится центральным, пустая карта остается последней

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

## 🎯 Итог

Система сохранения истории в TgStyle обеспечивает:
- ✅ **Надежность**: Двойное хранение с fallback
- ✅ **Производительность**: Быстрая загрузка из localStorage
- ✅ **Масштабируемость**: Лимиты и подписки для монетизации
- ✅ **UX**: Красивая карусель с плавными анимациями
- ✅ **Аналитика**: Полная статистика использования

Архитектура позволяет легко расширять функциональность: добавлять комментарии, рейтинги, социальные функции и т.д. 🚀
