# Правила разработки TgStyle

## Обзор

TgStyle - это Telegram Mini App для анализа стиля одежды с помощью AI. Проект состоит из трех основных частей: клиентского приложения (TypeScript/Vite), серверного API (Node.js/Express/Prisma), и AI-сервиса FastVLM (Python/Flask).

## Архитектурные принципы

### 1. Модульная архитектура

**Клиентская часть организована по модулям:**
```
client/src/modules/
├── analysis/           # Анализ стиля через AI
├── wardrobe/          # Управление гардеробом
├── capsules/          # Создание образов
├── publicFeed/        # Социальная лента
├── shared/            # Общие компоненты (ImageProcessingService, ModalService)
├── canvas/            # Canvas редактор (UICanvasEditor)
├── carousel/          # Карусель истории анализов
└── [core modules]     # Базовые модули (api, auth, cache, navigation)
```

**Каждый модуль должен:**
- Иметь четкую ответственность
- Минимизировать зависимости от других модулей
- Использовать событийную систему для связи
- Экспортировать singleton экземпляры

### 2. Dependency Injection

**Используется в сложных модулях (например, Capsules):**
```typescript
export class CapsulesManager {
  private flowManager: CapsuleFlowManager;
  private selectionManager: CapsuleSelectionManager;
  private stateManager: CanvasStateManager;
  private imageService: typeof imageProcessingService;
  private modalSvc: ModalService;
  
  constructor() {
    // Внедрение зависимостей через singleton экземпляры
    this.flowManager = capsuleFlowManager;
    this.selectionManager = capsuleSelectionManager;
    this.stateManager = canvasStateManager;
    this.imageService = imageProcessingService;
    this.modalSvc = modalService;
  }
}
```

### 3. Singleton Pattern

**Все основные менеджеры - singleton:**
```typescript
export const wardrobeManager = new WardrobeManager();
export const capsulesManager = new CapsulesManager();
export const analysisManager = new AnalysisManager();
export const uiCanvasEditor = UICanvasEditor.getInstance(config);
```

## Правила кодирования

### 1. TypeScript

**Строгая типизация:**
```typescript
// tsconfig.json настроен на строгий режим
"strict": true,
"exactOptionalPropertyTypes": true,
"noFallthroughCasesInSwitch": true,
"noImplicitReturns": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noUncheckedIndexedAccess": true,
"noPropertyAccessFromIndexSignature": true
```

**Обязательные типы для:**
- Все публичные методы
- Все интерфейсы API
- Все события и callbacks
- Все конфигурационные объекты
- Все состояния и данные

### 2. Именование

**Файлы и директории:**
- `camelCase` для файлов: `wardrobeManager.ts`
- `kebab-case` для CSS классов: `wardrobe-grid`
- `PascalCase` для классы: `WardrobeManager`
- `UPPER_CASE` для констант: `APP_CONFIG`

**Методы и переменные:**
- `camelCase` для методы: `handleWardrobeOpen()`
- Префиксы для приватных методов: `private _initializeCanvas()`
- Описательные имена: `loadWardrobeFromCache()` вместо `load()`
- Универсальные методы с параметрами: `handleWardrobeOpen(prefix = 'wardrobe')`

### 3. Структура файлов

**Каждый модуль должен содержать:**
```typescript
// 1. Импорты (сгруппированы)
import type { ... } from '@/types';
import { ... } from '@/modules/shared';
import { ... } from './internal';

// 2. Типы и интерфейсы
interface ModuleConfig { ... }
interface ModuleState { ... }

// 3. Константы
const MODULE_CONSTANTS = { ... };

// 4. Основной класс
export class ModuleManager {
  // Приватные поля
  private config: ModuleConfig;
  private state: ModuleState;
  
  // Конструктор
  constructor() { ... }
  
  // Публичные методы
  public async initialize() { ... }
  public getStatus() { ... }
  public destroy() { ... }
  
  // Приватные методы
  private setupEventHandlers() { ... }
  private cleanupResources() { ... }
}

// 5. Экспорт singleton
export const moduleManager = new ModuleManager();
```

### 4. Обработка ошибок

**Централизованная обработка:**
```typescript
// Используем logger для всех ошибок
logger.error('Operation failed', { context, error });

// Graceful degradation
try {
  const data = await api.getData();
  return data;
} catch (error) {
  logger.warn('API failed, using cache', error);
  return getCachedData();
}
```

**Пользовательские ошибки:**
- Показывать понятные сообщения
- Предоставлять альтернативные действия
- Логировать технические детали отдельно

## Паттерны интеграции

### 1. Событийная система

**Для связи между модулями:**
```typescript/
// Отправка события
window.dispatchEvent(new CustomEvent('wardrobe:item-added', {
  detail: { item: newItem }
}));

// Прослушивание события
window.addEventListener('wardrobe:item-added', (event) => {
  this.handleItemAdded(event.detail.item);
});

// Запрос рендеринга грида
window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
  detail: { gridId, items, mode: 'selection' }
}));
```

### 2. API клиент

**Единый HTTP клиент:**
```typescript
// Все запросы через централизованный api
import { api } from '@/modules/api';

const response = await api.get('/wardrobe');
const result = await api.post('/capsules', data);
```

**Автоматическая аутентификация:**
- initData добавляется автоматически
- Retry логика встроена
- Централизованная обработка ошибок

### 3. Кэширование

**Трехуровневое кэширование:**
1. **Память** - мгновенный доступ (DataCacheManager, CanvasStateManager)
2. **localStorage** - быстрый доступ при перезагрузке
3. **Сервер** - источник истины

```typescript
// DataCacheManager управляет всем кэшированием
const items = dataCacheManager.getWardrobeItems(); // Из памяти
await dataCacheManager.syncWithServer(); // Синхронизация

// CanvasStateManager для состояний canvas
const state = canvasStateManager.getCachedState(cacheKey);
```

## Производительность

### 1. Оптимистичные обновления

**UI обновляется мгновенно:**
```typescript
// 1. Мгновенное обновление UI
this.updateUI(optimisticData);

// 2. Запрос к серверу в фоне
const serverData = await api.updateData(data);

// 3. Корректировка если нужно
if (serverData !== optimisticData) {
  this.updateUI(serverData);
}

// 4. Откат при ошибке
catch (error) {
  this.updateUI(previousData);
}
```

### 2. Lazy loading

**Загрузка по требованию:**
- Изображения с `loading="lazy"`
- Модули через dynamic imports
- Данные через Intersection Observer
- Прогрессивная загрузка изображений в карусели

### 3. Кэш-first стратегия

**Мгновенная отрисовка:**
```typescript
// Сначала из кэша
this.renderFromCache();

// Затем обновление с сервера
const freshData = await this.loadFromServer();
this.updateUI(freshData);

// Умная перерисовка только при изменениях
if (freshData.length !== cachedData.length) {
  this.updateUI(freshData);
}
```

### 4. Инкрементальные операции

**Избегание полной перезагрузки:**
```typescript
// Добавляем только новые элементы
const newItems = items.filter(item => !existingIds.has(item.id));
await this.addItems(newItems);

// Удаляем только снятые с выбора
const itemsToRemove = currentIds.filter(id => !selectedIds.has(id));
await this.removeItems(itemsToRemove);
```

## Тестирование

### 1. Типы тестов

**Обязательные тесты:**
- Unit тесты для бизнес-логики
- Integration тесты для API
- E2E тесты для критических flow

**Опциональные тесты:**
- Помечаются звездочкой `*` в tasks.md
- Могут быть пропущены для MVP
- Добавляются при необходимости

### 2. Тестовые данные

**Используем реальные данные:**
- Не используем моки для тестов функциональности
- Создаем тестовые fixtures
- Изолируем тесты друг от друга

## Безопасность

### 1. Аутентификация

**Telegram WebApp initData:**
- Валидация на сервере обязательна
- Проверка подписи через bot token
- Автоматическое добавление в заголовки

### 2. Данные пользователя

**Приватность:**
- Все данные привязаны к telegramId
- Проверка доступа на каждый запрос
- Нет публичных данных без явного разрешения

### 3. Файлы

**Загрузка изображений:**
- Валидация типов файлов
- Ограничение размера
- Оптимизация через Sharp
- Сохранение в изолированных папках

## Интеграции

### 1. FastVLM (AI сервис)

**Обязательные проверки:**
- Таймаут 60 секунд
- Fallback при недоступности
- Логирование всех запросов
- Оптимизация изображений перед отправкой

### 2. Telegram WebApp API

**Используемые функции:**
- `expand()` - разворачивание приложения
- `ready()` - уведомление о готовности
- `HapticFeedback` - тактильная обратная связь
- `openLink()` - открытие внешних ссылок

### 3. База данных

**Prisma ORM:**
- Строгая типизация схемы
- Миграции для изменений
- Индексы для производительности
- Каскадное удаление для целостности
- Денормализованные счетчики (likesCount, viewsCount)
- Составные индексы для частых запросов

## Развертывание

### 1. Сборка

**Vite конфигурация:**
- TypeScript компиляция
- Tree shaking для оптимизации
- Source maps для отладки
- Path aliases для удобства

### 2. Сервер

**Production требования:**
- HTTPS обязательно (Telegram Mini App)
- SSL сертификаты
- Graceful shutdown
- Логирование в файлы

### 3. Мониторинг

**Обязательные метрики:**
- Время ответа API
- Ошибки и их частота
- Использование памяти
- Количество активных пользователей

## Документация

### 1. Код

**Обязательные комментарии:**
- JSDoc для публичных методов
- Описание сложной бизнес-логики
- TODO для технического долга
- FIXME для известных проблем

### 2. База знаний в `/docs`

**Структура документации:**
```
docs/
├── analysis-architecture.md    # Архитектура модуля Analysis
├── analysis-api.md            # API модуля Analysis
├── capsules-architecture.md   # Архитектура модуля Capsules
├── capsules-api.md           # API модуля Capsules
├── wardrobe-architecture.md  # Архитектура модуля Wardrobe
├── wardrobe-api.md          # API модуля Wardrobe
├── feed-architecture.md     # Архитектура модуля Feed
├── feed-api.md             # API модуля Feed
└── server.md               # Серверная архитектура
```

**Содержание каждого модуля:**
- **Architecture файлы:** Компоненты, паттерны, интеграции, производительность, диаграммы
- **API файлы:** Клиентские методы, серверные endpoints, примеры использования, коды ошибок

**Принципы документации:**
- Актуальность: документация обновляется вместе с кодом
- Полнота: каждый публичный метод и endpoint документирован
- Примеры: реальные примеры использования для каждого API
- Архитектурные решения: обоснование выбора паттернов и подходов

### 3. API

**Документация endpoints:**
- Параметры запроса
- Формат ответа
- Коды ошибок
- Примеры использования

### 4. Архитектура

**Steering файлы:**
- Flow функций для каждого модуля
- Архитектура модулей
- API документация
- Общие правила и паттерны

## Запрещенные практики

### 1. Антипаттерны

**Не делать:**
- Прямые DOM манипуляции без менеджеров
- Глобальные переменные (кроме singleton)
- Синхронные операции с сетью
- Мутации пропсов/параметров
- Игнорирование ошибок
- Дублирование логики между модулями
- Создание нескольких экземпляров singleton классов

### 2. Производительность

**Избегать:**
- Загрузки всех данных сразу
- Блокирующих операций в UI потоке
- Дублирования HTTP запросов
- Утечек памяти в event listeners
- Неоптимизированных изображений
- Полной перезагрузки при инкрементальных изменениях
- Повторной обработки уже кэшированных данных

### 3. Безопасность

**Запрещено:**
- Хранение секретов в клиенте
- Доверие клиентским данным
- Пропуск валидации на сервере
- Логирование чувствительных данных
- Использование eval() или innerHTML
- Отправка itemIds при обновлении капсул (только при создании)

## Процесс разработки

### 1. Новые функции

**Обязательные этапы:**
1. Создание спецификации (requirements → design → tasks)
2. Код-ревью всех изменений
3. Тестирование функциональности
4. Обновление документации в `/docs`

**Работа с базой знаний:**
- При изменении архитектуры модуля → обновить соответствующий `*-architecture.md`
- При добавлении/изменении API → обновить соответствующий `*-api.md`
- При рефакторинге → проверить актуальность всех связанных документов
- Новые паттерны и решения → добавить в архитектурную документацию

### 2. Рефакторинг

**Принципы:**
- Не ломать существующий функционал
- Сохранять обратную совместимость API
- Обновлять тесты вместе с кодом
- Документировать изменения в `/docs`

**Обновление документации при рефакторинге:**
- Изменение сигнатур методов → обновить примеры в API документации
- Изменение архитектурных паттернов → обновить диаграммы и описания
- Удаление устаревших методов → удалить из документации
- Новые интеграции → добавить в соответствующие разделы

### 3. Отладка

**Инструменты:**
- Logger для структурированного логирования
- Browser DevTools для клиента
- Prisma Studio для БД
- Postman для API тестирования

## Использование базы знаний

### Для разработчиков

**При работе с модулем:**
1. Сначала изучить `*-architecture.md` для понимания структуры
2. Использовать `*-api.md` как справочник по методам и endpoints
3. Следовать архитектурным паттернам из документации
4. Обновлять документацию при внесении изменений

**При отладке:**
- Проверить flow выполнения в architecture файлах
- Найти примеры использования в API файлах
- Изучить интеграции между модулями

**При добавлении функций:**
- Следовать существующим паттернам из документации
- Добавить новые методы в соответствующий API файл
- Обновить архитектурные диаграммы при необходимости

### Для AI агентов

**Обязательное изучение перед работой:**
- Прочитать architecture файл соответствующего модуля
- Изучить API документацию для понимания доступных методов
- Понять интеграции между модулями
- Следовать документированным паттернам и принципам

**При генерации кода:**
- Использовать примеры из API документации как шаблоны
- Следовать архитектурным решениям из документации
- Не изобретать новые паттерны без обоснования
- Обновлять документацию при внесении изменений

## Заключение

Эти правила обеспечивают:
- Консистентность кода
- Высокую производительность
- Легкость поддержки
- Безопасность данных
- Качественный UX
- Актуальную и полную документацию

При нарушении правил - обязательно документировать причину и план исправления.

**База знаний в `/docs` является обязательной для изучения перед работой с любым модулем системы.**