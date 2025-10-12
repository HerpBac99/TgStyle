# База знаний: Клиентская часть TgStyle

## Оглавление

1. [Общая архитектура](#общая-архитектура)
2. [Основные модули](#основные-модули)
3. [Точка входа - main.ts](#точка-входа---maints)
4. [Модуль авторизации - auth.ts](#модуль-авторизации---authts)
5. [API клиент - api.ts](#api-клиент---apits)
6. [Камера и загрузка фото - camera.ts](#камера-и-загрузка-фото---camerats)
7. [Анализ изображений - analysis.ts](#анализ-изображений---analysists)
8. [История анализов - history.ts](#история-анализов---historyts)
9. [Логирование - logger.ts](#логирование---loggerts)
10. [UI менеджеры](#ui-менеджеры)
11. [Утилиты и хелперы](#утилиты-и-хелперы)

---

## Общая архитектура

Клиентская часть построена на TypeScript с использованием модульной архитектуры. Каждый модуль отвечает за свою область функциональности и экспортирует singleton экземпляр для глобального использования.

### Основные принципы

- **Модульность**: каждая функциональность изолирована в отдельном модуле
- **Singleton паттерн**: модули экспортируют единственный экземпляр класса
- **Event-driven**: коммуникация между модулями через CustomEvents
- **TypeScript**: строгая типизация для надежности кода

---

## Основные модули

### Структура модулей

```
client/src/modules/
├── main.ts                 # Точка входа приложения
├── auth.ts                 # Управление авторизацией
├── api.ts                  # HTTP клиент
├── camera.ts               # Работа с камерой
├── analysis.ts             # Анализ изображений
├── history.ts              # История анализов
├── logger.ts               # Логирование
├── navigationManager.ts    # Навигация с BackButton
├── photoUploadManager.ts   # Загрузка фото
├── uiManager.ts           # Главный UI менеджер
├── uiCore.ts              # Базовые UI компоненты
├── uiModalManager.ts      # Модальные окна
├── uiMenu.ts              # Главное меню
├── uiAnalysis.ts          # UI анализа
├── uiWardrobe.ts          # UI гардероба
├── uiCapsules.ts          # UI капсул
├── uiCapsulesGrid.ts      # Грид капсул
└── uiCanvasEditor.ts      # Редактор изображений
```

---

## Точка входа - main.ts

### Класс: TgStyleApp

Главный класс приложения, координирующий инициализацию всех модулей.

#### Методы

##### `initialize(): Promise<void>`

Основной метод инициализации приложения.

**Что делает:**
- Инициализирует Telegram WebApp
- Настраивает базовое поведение приложения
- Инициализирует UI
- Выполняет авторизацию
- Обрабатывает shared анализы из URL

**Пример:**
```typescript
const app = new TgStyleApp();
await app.initialize();
```

##### `initializeTelegram(): void`

Инициализирует Telegram WebApp SDK.

**Что делает:**
- Получает объект `window.Telegram.WebApp`
- Разворачивает приложение
- Включает подтверждение закрытия
- Запрещает вертикальные swipe жесты
- Входит в полноэкранный режим (если поддерживается)
- Уведомляет Telegram что приложение готово

##### `setupAppBehavior(): void`

Настройка базового поведения приложения.

**Что делает:**
- Запрещает скроллинг body
- Настраивает обработчики глобальных событий
- Устанавливает мета-теги для мобильных устройств

##### `setupGlobalEventHandlers(): void`

Настройка глобальных обработчиков событий.

**Обрабатывает:**
- Ошибки загрузки ресурсов
- Изменение размера окна
- Изменение ориентации устройства
- Возврат к приложению (visibility change)

##### `handleSharedAnalysis(): void`

Обработка URL хэшей для shared анализов.

**Что делает:**
- Проверяет хэш URL на наличие `#shared-analysis-{id}`
- Проверяет URL параметры `startapp=shared_{id}`
- Проверяет Telegram WebApp `start_param`
- Показывает shared анализ если найден

##### `showSharedAnalysis(analysisId: string): Promise<void>`

Показывает shared анализ другого пользователя.

**Параметры:**
- `analysisId` - ID анализа для отображения

**Что делает:**
- Ищет данные в localStorage
- Если не найдено, запрашивает с сервера
- Показывает анализ через uiManager

##### `performAuthentication(): Promise<void>`

Выполнение авторизации пользователя.

**Что делает:**
- Вызывает authManager.authenticate()
- Отправляет события успеха/неудачи
- Продолжает работу даже при ошибке авторизации

##### `getAppState()`

Получение текущего состояния приложения.

**Возвращает:**
```typescript
{
  isInitialized: boolean;
  hasTelegram: boolean;
  initTime: number;
  config: AppConfig;
}
```

##### `restart(): Promise<void>`

Перезапуск приложения.

**Что делает:**
- Сбрасывает состояние инициализации
- Очищает UI
- Повторно инициализирует приложение

##### `shutdown(): void`

Закрытие приложения.

**Что делает:**
- Очищает ресурсы UI
- Закрывает Telegram WebApp

---

## Модуль авторизации - auth.ts

### Класс: AuthManager

Управляет авторизацией через Telegram WebApp.

#### Методы

##### `authenticate(): Promise<AuthResponse>`

Основной метод авторизации.

**Что делает:**
1. Извлекает данные пользователя из Telegram
2. Отображает профиль пользователя в UI
3. Валидирует initData локально
4. Отправляет initData на сервер для валидации
5. Сохраняет информацию о подписке
6. Обновляет UI с информацией о подписке

**Возвращает:**
```typescript
interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    telegramId: number;
    firstName: string;
    lastName?: string;
    username?: string;
    subscription: SubscriptionInfo;
  };
  error?: string;
}
```

##### `getCurrentUser(): TelegramUser | null`

Получение текущего авторизованного пользователя.

**Возвращает:**
- Объект TelegramUser или null если не авторизован

##### `isUserAuthenticated(): boolean`

Проверка статуса авторизации.

**Возвращает:**
- `true` если пользователь авторизован, иначе `false`

##### `getTelegram(): TelegramWebApp | null`

Получение Telegram WebApp объекта.

**Возвращает:**
- Объект Telegram WebApp или null

##### `getInitData(): string | undefined`

Получение initData для API запросов.

**Возвращает:**
- Строка initData или undefined

##### `getSubscription()`

Получение информации о подписке пользователя.

**Возвращает:**
```typescript
{
  type: 'free' | 'premium';
  analysesLeft: number;
  totalAnalyses: number;
  weeklyResetDate: string;
  subscriptionEndDate?: string | null;
}
```

##### `isPremium(): boolean`

Проверка Premium статуса.

**Возвращает:**
- `true` если у пользователя Premium подписка

##### `getAnalysesLeft(): number`

Получение количества оставшихся анализов.

**Возвращает:**
- Количество доступных анализов

##### `canAnalyze(): boolean`

Проверка возможности выполнить анализ.

**Возвращает:**
- `true` если пользователь может выполнить анализ

##### `updateSubscription(subscription): void`

Обновление информации о подписке.

**Параметры:**
- `subscription` - новая информация о подписке

##### `vibrate(type: 'light' | 'medium' | 'heavy'): void`

Генерация вибрации (если поддерживается).

**Параметры:**
- `type` - тип вибрации (light/medium/heavy)

##### `close(): void`

Закрытие приложения через Telegram API.

---

## API клиент - api.ts

### Класс: ApiClient

Базовый класс для выполнения HTTP запросов.

#### Методы

##### `request<T>(endpoint: string, options?: RequestInit, timeout?: number): Promise<T>`

Выполнение HTTP запроса с обработкой ошибок.

**Параметры:**
- `endpoint` - путь к API endpoint
- `options` - опции fetch запроса
- `timeout` - таймаут в миллисекундах

**Что делает:**
- Проверяет доступность сети
- Выполняет fetch запрос с таймаутом
- Логирует запрос и ответ
- Обрабатывает HTTP ошибки
- Валидирует Content-Type ответа

**Возвращает:**
- Promise с данными типа T

**Обработка ошибок:**
- `AbortError` - превышен таймаут
- `TypeError` - ошибка сети
- HTTP ошибки по кодам (400, 401, 404, 500, 502, 503)

##### `get<T>(endpoint: string, timeout?: number): Promise<T>`

GET запрос.

**Параметры:**
- `endpoint` - путь к API endpoint
- `timeout` - таймаут в миллисекундах

##### `post<T>(endpoint: string, data?: any, timeout?: number): Promise<T>`

POST запрос.

**Параметры:**
- `endpoint` - путь к API endpoint
- `data` - данные для отправки
- `timeout` - таймаут в миллисекундах

##### `put<T>(endpoint: string, data?: any, timeout?: number): Promise<T>`

PUT запрос.

##### `delete<T>(endpoint: string, timeout?: number): Promise<T>`

DELETE запрос.

##### `ping(): Promise<boolean>`

Проверка доступности API.

**Возвращает:**
- `true` если API доступен, иначе `false`

### Класс: TgStyleApi extends ApiClient

Специализированный API клиент для TgStyle.

#### Методы

##### `authenticate(initData: string): Promise<AuthResponse>`

Авторизация пользователя.

**Параметры:**
- `initData` - данные инициализации из Telegram WebApp

**Возвращает:**
```typescript
interface AuthResponse {
  success: boolean;
  user?: UserData;
  error?: string;
}
```

##### `analyzeImage(request: AnalysisRequest): Promise<AnalysisResponse>`

Анализ изображения одежды.

**Параметры:**
```typescript
interface AnalysisRequest {
  photo: string;              // base64 изображение
  platform: string;           // платформа пользователя
  userAgent: string;          // user agent браузера
  initData?: string;          // данные Telegram
  theme?: string;             // тема анализа
}
```

**Возвращает:**
```typescript
interface AnalysisResponse {
  success: boolean;
  analysis?: string;          // текст анализа
  multi_pass_results?: {      // результаты многопроходного анализа
    person: string;
    clothing: string;
    legs: string;
    shoes: string;
    accessories_head: string;
    accessories_hand: string;
  };
  subscription?: SubscriptionInfo;
  error?: string;
}
```

##### `sendLogs(request: LogRequest): Promise<LogResponse>`

Отправка логов на сервер.

**Параметры:**
```typescript
interface LogRequest {
  sessionId: string;
  logs: LogEntry[];
  timestamp: string;
  userAgent: string;
  appVersion: string;
}
```

##### `checkFastVLMHealth(): Promise<boolean>`

Проверка здоровья FastVLM сервера.

**Возвращает:**
- `true` если сервер доступен

---

## Камера и загрузка фото - camera.ts

### Класс: CameraManager

Управляет захватом фото и обработкой изображений.

#### Методы

##### `capturePhoto(): Promise<PhotoCaptureResult>`

Захват фото через камеру или галерею.

**Что делает:**
1. Создает input[type="file"] с accept="image/*"
2. Telegram автоматически показывает диалог выбора (камера/галерея)
3. Обрабатывает выбранный файл
4. Валидирует изображение
5. Сохраняет данные изображения
6. Отправляет событие 'photo:captured'

**Возвращает:**
```typescript
interface PhotoCaptureResult {
  success: boolean;
  image?: ImageData;
  error?: string;
}
```

##### `getCurrentImage(): ImageData | null`

Получение текущего загруженного изображения.

**Возвращает:**
```typescript
interface ImageData {
  base64: string;        // base64 без префикса
  originalSize: number;  // размер в байтах
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'gif';
}
```

##### `clearCurrentImage(): void`

Очистка текущего изображения из памяти.

##### `getImageForAnalysis(): string | null`

Получение изображения для анализа (всегда оригинал).

**Возвращает:**
- base64 строка изображения без префикса

##### `resizeImageForStorage(base64Image: string): Promise<string>`

Resize изображения до 800x800px для localStorage.

**Параметры:**
- `base64Image` - base64 изображение

**Что делает:**
- Создает Image из base64
- Вычисляет новые размеры (макс 800x800, пропорции сохраняются)
- Рисует на canvas с новыми размерами
- Конвертирует в JPEG качества 0.85
- Возвращает оптимизированное base64

**Возвращает:**
- Оптимизированное base64 изображение

##### `compressImage(base64Image: string, quality: number): Promise<string>`

Сжатие изображения до указанного качества.

**Параметры:**
- `base64Image` - base64 изображение
- `quality` - качество JPEG (0.0 - 1.0)

**Возвращает:**
- Сжатое base64 изображение

##### `calculateHistoryItemSize(imageBase64: string, analysisText?: string): number`

Расчет размера элемента истории в MB.

**Параметры:**
- `imageBase64` - base64 изображение
- `analysisText` - текст анализа (опционально)

**Возвращает:**
- Размер в мегабайтах

---

## Анализ изображений - analysis.ts

### Класс: AnalysisManager

Управляет процессом анализа изображений.

#### Методы

##### `analyzeImage(imageBase64: string, themeDescription?: string): Promise<AnalysisResponse>`

Анализ изображения с указанной темой.

**Параметры:**
- `imageBase64` - base64 изображение для анализа
- `themeDescription` - тема анализа (casual, formal, sport и т.д.)

**Что делает:**
1. Обновляет состояние: 'uploading'
2. Подготавливает запрос с initData
3. Обновляет состояние: 'processing'
4. Отправляет запрос на сервер через api.analyzeImage()
5. Обновляет состояние: 'completed'
6. Сохраняет результат в историю
7. Обновляет UI (показывает экран анализа, результат)
8. Обновляет информацию о подписке

**Возвращает:**
```typescript
interface AnalysisResponse {
  success: boolean;
  analysis?: string;
  multi_pass_results?: MultiPassResults;
  subscription?: SubscriptionInfo;
  error?: string;
}
```

**Обработка ошибок:**
- При ошибке обновляет состояние на 'error'
- Показывает user-friendly сообщение
- Логирует подробную информацию

##### `getCurrentState(): AnalysisState`

Получение текущего состояния анализа.

**Возвращает:**
```typescript
interface AnalysisState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;           // 0-100
  currentStep?: string;       // описание текущего шага
  error?: string;
}
```

##### `resetState(): void`

Сброс состояния анализа в 'idle'.

##### `isAnalyzing(): boolean`

Проверка, выполняется ли анализ в данный момент.

**Возвращает:**
- `true` если статус 'uploading' или 'processing'

##### `cancelAnalysis(): void`

Отмена текущего анализа.

---

## История анализов - history.ts

### Класс: HistoryManager

Управляет историей анализов в localStorage.

#### Методы

##### `addItem(item: HistoryItem): boolean`

Добавление нового элемента в историю.

**Параметры:**
```typescript
interface HistoryItem {
  id?: string;
  photo: string;               // base64 изображение
  analysis?: string;           // текст анализа
  timestamp: string;           // ISO дата
  sourceType: 'photo' | 'pinterest';
  isEmpty?: boolean;
}
```

**Что делает:**
1. Валидирует элемент
2. Добавляет timestamp если отсутствует
3. Генерирует уникальный ID
4. Проверяет доступное место в localStorage
5. Удаляет старые элементы при необходимости
6. Вставляет элемент в историю
7. Сохраняет в localStorage

**Возвращает:**
- `true` если успешно добавлено

##### `removeItem(index: number): boolean`

Удаление элемента из истории по индексу.

**Параметры:**
- `index` - индекс элемента (0-based)

**Возвращает:**
- `true` если успешно удалено

##### `getItem(index: number): HistoryItem | null`

Получение элемента истории по индексу.

**Параметры:**
- `index` - индекс элемента

**Возвращает:**
- HistoryItem или null если не найдено

##### `getAllItems(): HistoryItem[]`

Получение всей истории (включая пустые слоты).

**Возвращает:**
- Массив всех элементов истории

##### `getFilledItems(): HistoryItem[]`

Получение только заполненных элементов истории.

**Возвращает:**
- Массив заполненных элементов (isEmpty !== true)

##### `getFilledItem(index: number): HistoryItem | null`

Получение заполненного элемента по индексу в массиве заполненных.

**Параметры:**
- `index` - индекс в массиве заполненных элементов

##### `clear(): void`

Очистка всей истории.

##### `getFilledCount(): number`

Получение количества заполненных элементов.

**Возвращает:**
- Количество элементов с isEmpty !== true

##### `hasEmptySlots(): boolean`

Проверка наличия свободных слотов.

**Возвращает:**
- `true` если есть пустые слоты

##### `getFirstEmptySlotIndex(): number`

Получение индекса первого пустого слота.

**Возвращает:**
- Индекс первого пустого слота или -1

##### `exportToJson(): string`

Экспорт истории в JSON.

**Возвращает:**
- JSON строка с историей

##### `importFromJson(jsonString: string): boolean`

Импорт истории из JSON.

**Параметры:**
- `jsonString` - JSON строка с историей

**Возвращает:**
- `true` если успешно импортировано

##### `getStats()`

Получение статистики истории.

**Возвращает:**
```typescript
{
  totalSlots: number;
  filledSlots: number;
  emptySlots: number;
  totalDataSize: string;     // размер в KB
  oldestItem: string | null; // ISO дата
  newestItem: string | null; // ISO дата
}
```

---

## Логирование - logger.ts

### Класс: TgStyleLogger

Улучшенный логгер с перехватом console и отправкой на сервер.

#### Методы

##### `info(message: string, data?: any): void`

Логирование информационного сообщения.

**Параметры:**
- `message` - текст сообщения
- `data` - дополнительные данные (опционально)

##### `debug(message: string, data?: any): void`

Логирование отладочного сообщения.

##### `warn(message: string, data?: any): void`

Логирование предупреждения.

##### `error(message: string, data?: any): void`

Логирование ошибки.

##### `flush(): Promise<void>`

Асинхронная отправка логов на сервер.

**Что делает:**
- Собирает все логи из буфера
- Добавляет метаданные (user, session, device)
- Отправляет на сервер с повторными попытками
- НЕ очищает буфер (логи остаются в сессии)

##### `manualSave(): Promise<void>`

Ручное сохранение логов с Telegram UI.

**Что делает:**
- Показывает индикатор загрузки в MainButton
- Отправляет логи на сервер
- Показывает результат через Telegram alert
- Обновляет цвет и текст кнопки

##### `clear(): void`

Очистка всех логов из памяти.

##### `getLogs(): LogEntry[]`

Получение всех логов из буфера.

**Возвращает:**
- Массив записей логов

##### `getStats()`

Получение статистики логгера.

**Возвращает:**
```typescript
{
  sessionId: string;
  logsInMemory: number;
  isEnabled: boolean;
  userId?: number;
  isTelegramMiniApp: boolean;
}
```

##### `setEnabled(enabled: boolean): void`

Включение/выключение логгера.

**Параметры:**
- `enabled` - true для включения, false для отключения

##### `updateLogDisplay(): void`

Обновление отображения логов в UI (только для разработчиков).

**Доступно только для:** userId === 251053908 или 568613134

---

## UI менеджеры

### UIManager (uiManager.ts)

Главный менеджер UI, координирующий все UI модули.

#### Методы

##### `init(): void`

Инициализация UI после загрузки.

##### `updateHistoryDisplay(): void`

Обновление отображения истории в главном меню.

##### `showSubscriptionModal(): void`

Показать модальное окно покупки подписки.

##### `showSharedAnalysis(photoBase64: string, analysisText: string, timestamp: string): Promise<void>`

Показать shared анализ другого пользователя.

##### `showToast(message: string, type: 'success' | 'error' | 'info'): void`

Показать toast уведомление.

##### `showAnalysisResult(result: string): void`

Показать результат анализа.

##### `getStats()`

Получение статистики всех UI модулей.

##### `destroy(): void`

Очистка всех ресурсов UI.

### UICoreManager (uiCore.ts)

Базовые UI компоненты: модальные окна, тосты, диалоги.

#### Методы

##### `showSubscriptionModal(): void`

Показать модальное окно покупки подписки.

**Что делает:**
- Обновляет дату еженедельного сброса лимитов
- Показывает модальное окно
- Настраивает обработчики событий
- Генерирует вибрацию

##### `hideSubscriptionModal(): void`

Скрыть модальное окно подписки.

##### `showToast(message: string, type: 'success' | 'error' | 'info'): void`

Показать toast уведомление.

**Параметры:**
- `message` - текст сообщения
- `type` - тип уведомления (success/error/info)

**Что делает:**
- Создает toast элемент с соответствующим стилем
- Добавляет в DOM
- Показывает с fade-in анимацией
- Автоматически скрывает через 3 секунды

##### `showConfirmDialog(message: string): Promise<boolean>`

Показать диалог подтверждения через Telegram.

**Параметры:**
- `message` - текст сообщения

**Возвращает:**
- Promise<boolean> - true если подтверждено

##### `init(): void`

Инициализация менеджера.

##### `destroy(): void`

Очистка ресурсов.

### UIModalManager (uiModalManager.ts)

Универсальный менеджер модальных окон.

#### Методы для Clothing Selection Modal

##### `showClothingSelectionModal(config: ClothingSelectionModalConfig): void`

Показать модалку выбора одежды для капсул.

**Параметры:**
```typescript
interface ClothingSelectionModalConfig {
  modalId: string;
  wardrobeItems: WardrobeItem[];
  selectedItemIds?: Set<number>;
  onConfirm: (selectedItems: WardrobeItem[]) => void;
  onCancel: () => void;
}
```

**Что делает:**
- Инициализирует выбранные элементы
- Создает фильтры по категориям
- Рендерит грид с элементами одежды
- Настраивает обработчики событий

##### `renderClothingGrid(items: WardrobeItem[]): void` (private)

Рендерит грид с элементами одежды.

**Что делает:**
- Фильтрует элементы по текущему фильтру
- Создает карточки для каждого элемента
- Обновляет состояние кнопки "Далее"

##### `setActiveFilter(filterValue: string): void` (private)

Установить активный фильтр категорий.

**Параметры:**
- `filterValue` - значение фильтра ('ALL' или название категории)

#### Методы для Wardrobe Preview Modal

##### `showWardrobePreviewModal(config: WardrobePreviewModalConfig): void`

Показать модалку предпросмотра для гардероба.

**Параметры:**
```typescript
interface WardrobePreviewModalConfig {
  modalId: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

##### `clearPreviewModal(): void`

Очистить модальное окно предпросмотра.

**Что делает:**
- Очищает изображение
- Очищает информацию о классификации
- Скрывает элементы информации

##### `showLoadingInModal(show: boolean): void`

Показать/скрыть индикатор загрузки в модальном окне.

##### `showImageInModal(base64: string): void`

Показать изображение в модальном окне предпросмотра.

##### `showClassificationInfo(category, color, material?, style?, fit?, description?): void`

Показать информацию о классификации одежды в модальном окне.

**Параметры:**
- `category` - категория одежды
- `color` - цвет
- `material` - материал (опционально)
- `style` - стиль (опционально)
- `fit` - посадка (опционально)
- `description` - описание (опционально)

#### Универсальные методы

##### `hide(): void`

Скрыть текущую модалку.

##### `destroy(): void`

Уничтожить менеджер модалок и очистить ресурсы.

---

## Утилиты и хелперы

### validation.ts

Утилиты для валидации данных.

#### Функции

##### `validateTelegramInitData(initData: string): ValidationResult`

Валидация initData из Telegram WebApp.

**Параметры:**
- `initData` - строка initData

**Возвращает:**
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

##### `validateImageData(imageData: ImageData): ValidationResult`

Валидация данных изображения.

##### `validateHistory(history: HistoryItem[]): ValidationResult`

Валидация массива истории.

##### `validateHistoryItem(item: HistoryItem): ValidationResult`

Валидация отдельного элемента истории.

### helpers.ts

Вспомогательные функции.

#### Функции

##### `getElement(selector: string): HTMLElement | null`

Безопасное получение элемента DOM.

##### `createElement(tag: string, options?: object): HTMLElement`

Создание элемента DOM с опциями.

##### `createError(code: string, message: string): Error`

Создание объекта ошибки с кодом.

##### `isOnline(): boolean`

Проверка доступности сети.

##### `safeJsonParse<T>(json: string, fallback: T): T`

Безопасный парсинг JSON с fallback.

##### `safeJsonStringify(obj: any): string`

Безопасная сериализация в JSON.

##### `formatTimestamp(isoString: string): string`

Форматирование timestamp в читаемый вид.

##### `generateSessionId(userId?: number): string`

Генерация уникального ID сессии.

##### `isImageFile(file: File): boolean`

Проверка, является ли файл изображением.

##### `getFileExtension(filename: string): string`

Получение расширения файла.

### constants.ts

Константы приложения.

#### Константы

##### `API_URL`

URL API сервера.

##### `APP_CONFIG`

Конфигурация приложения:
```typescript
{
  version: string;
  environment: 'development' | 'production';
  features: {
    fastvlm: boolean;
    pinterest: boolean;
    history: boolean;
  };
}
```

##### `TIMEOUTS`

Таймауты для различных операций:
```typescript
{
  AUTH_REQUEST: number;
  ANALYSIS_REQUEST: number;
  LOG_REQUEST: number;
  HEALTH_CHECK: number;
}
```

##### `IMAGE_CONSTRAINTS`

Ограничения для изображений:
```typescript
{
  MAX_SIZE_MB: number;
  MAX_WIDTH: number;
  MAX_HEIGHT: number;
  ALLOWED_FORMATS: string[];
  COMPRESSION_QUALITY: number;
}
```

##### `HISTORY_CONSTRAINTS`

Ограничения для истории:
```typescript
{
  MAX_ITEMS: number;
  MAX_ITEM_SIZE_MB: number;
}
```

##### `STORAGE_KEYS`

Ключи для localStorage:
```typescript
{
  HISTORY: string;
  SETTINGS: string;
  USER: string;
}
```

##### `ERROR_CODES`

Коды ошибок:
```typescript
{
  AUTH_FAILED: string;
  NETWORK_ERROR: string;
  SERVER_ERROR: string;
  STORAGE_ERROR: string;
  VALIDATION_ERROR: string;
}
```

##### `APP_EVENTS`

События приложения:
```typescript
{
  READY: string;
  AUTH_SUCCESS: string;
  AUTH_FAILURE: string;
  ERROR_OCCURRED: string;
}
```

---

## События (CustomEvents)

### Системные события

#### `analysisStateChange`

Отправляется при изменении состояния анализа.

**detail:**
```typescript
{
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  currentStep?: string;
  error?: string;
}
```

#### `showAnalysisScreen`

Отправляется для показа экрана анализа.

**detail:**
```typescript
{
  imageBase64: string;
  analysis?: string;
}
```

#### `photo:captured`

Отправляется после захвата/выбора фото.

**detail:**
```typescript
{
  imageData: ImageData;
}
```

### Приложение события

#### `APP_EVENTS.READY`

Приложение готово к работе.

#### `APP_EVENTS.AUTH_SUCCESS`

Успешная авторизация.

#### `APP_EVENTS.AUTH_FAILURE`

Ошибка авторизации.

#### `APP_EVENTS.ERROR_OCCURRED`

Произошла ошибка.

---

## Лучшие практики

### 1. Использование модулей

Всегда импортируйте singleton экземпляры:

```typescript
import { authManager } from './modules/auth';
import { logger } from './modules/logger';
import { api } from './modules/api';
```

### 2. Обработка ошибок

Всегда обрабатывайте ошибки:

```typescript
try {
  const response = await api.analyzeImage(request);
  if (!response.success) {
    throw new Error(response.error);
  }
  // обработка успеха
} catch (error) {
  logger.error('Analysis failed', error);
  // показ ошибки пользователю
}
```

### 3. Логирование

Используйте соответствующие уровни логирования:

```typescript
logger.debug('Debug information', { data });
logger.info('User action', { action: 'photo_upload' });
logger.warn('Warning condition', { condition });
logger.error('Error occurred', error);
```

### 4. События

Подписывайтесь на события для реактивности:

```typescript
window.addEventListener('analysisStateChange', (event: CustomEvent) => {
  const state = event.detail;
  // обработка изменения состояния
});
```

### 5. Очистка ресурсов

Всегда очищайте ресурсы при уничтожении:

```typescript
class MyModule {
  private cleanupFunctions: (() => void)[] = [];
  
  init() {
    const handler = () => { /* ... */ };
    element.addEventListener('click', handler);
    
    this.cleanupFunctions.push(() => {
      element.removeEventListener('click', handler);
    });
  }
  
  destroy() {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
  }
}
```

---

## Debugging

### Console логи

Все логи автоматически перехватываются и отправляются на сервер.

### Просмотр логов (только для разработчиков)

Если userId === 251053908 или 568613134:
- Кнопка "🔍 Логи" в правом нижнем углу
- Модальное окно с логами
- Копирование/отправка/очистка логов

### Chrome DevTools

1. Откройте DevTools (F12)
2. Перейдите в Console
3. Фильтруйте по уровням (Info, Warning, Error)

### Network запросы

1. Откройте DevTools → Network
2. Фильтр "XHR" для API запросов
3. Проверяйте статусы и payload

---

## Типы данных

Все TypeScript типы находятся в `client/src/types/`.

### Основные типы

#### TelegramWebApp

```typescript
interface TelegramWebApp {
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  isExpanded: boolean;
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
  };
  ready(): void;
  expand(): void;
  close(): void;
  enableClosingConfirmation(): void;
  disableVerticalSwipes(): void;
  showConfirm(message: string, callback: (confirmed: boolean) => void): void;
  // ... и другие методы
}
```

#### ImageData

```typescript
interface ImageData {
  base64: string;
  originalSize: number;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'gif';
}
```

#### HistoryItem

```typescript
interface HistoryItem {
  id?: string;
  photo: string;
  analysis?: string;
  timestamp: string;
  sourceType: 'photo' | 'pinterest';
  isEmpty?: boolean;
  multi_pass_results?: MultiPassResults;
}
```

---

**Конец документации клиентской части.**
