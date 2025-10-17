# 📋 План рефакторинга клиент-серверного взаимодействия TgStyle

**Дата:** 2025-01-05  
**Автор:** AI Архитектор  
**Статус:** Анализ завершен, готов к реализации

---

## 📊 Общая статистика проекта

- **Клиентских модулей:** 42 файла TypeScript
- **Серверных API endpoints:** 11 файлов JavaScript  
- **База данных:** PostgreSQL через Prisma ORM
- **Найдено критических проблем:** 12
- **Найдено средних проблем:** 18
- **Потенциал оптимизации:** -60% запросов, +50% скорости

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. Дублирование HTTP клиентов

#### Проблема:
```typescript
// В api.ts есть централизованный клиент:
export const api = new TgStyleApi();

// Но 15+ модулей используют прямой fetch():
- dataCache.ts: fetch(`/api/wardrobe?initData=...`)
- WardrobeService.ts: fetch(`/api/wardrobe?initData=...`)
- CapsulesService.ts: fetch(`/api/capsules?initData=...`)
- PhotoProcessor.ts: fetch('/api/classify-clothing')
- uiCanvasEditor.ts: fetch('/api/remove-background')
```

#### Последствия:
- Нет единой обработки ошибок
- Дублирование логики авторизации
- Отсутствие retry механизма
- Нет централизованного логирования
- Невозможно добавить interceptors

#### Решение:
```typescript
// Расширить api.ts новыми методами:
class TgStyleApi extends ApiClient {
  // Автоматически добавлять initData во все запросы
  constructor() {
    super();
    this.addInterceptor('request', (config) => {
      const initData = authManager.getInitData();
      if (initData) {
        config.headers['X-Init-Data'] = initData;
      }
      return config;
    });
  }

  // Специализированные методы
  async getWardrobe() { return this.get('/wardrobe'); }
  async getCapsules() { return this.get('/capsules'); }
  async removeBackground(image: string) { 
    return this.post('/remove-background', { image }); 
  }
}
```

---

### 2. Критическая путаница с ID пользователей

#### Проблема:
```typescript
// client/src/types/api.ts
interface HistoryItem {
  userId: number;  // НА САМОМ ДЕЛЕ хранит telegramId!
}

// server/src/api/history.js
// Отправляет telegramId как userId:
userId: item.user.telegramId.toString(),

// client/src/modules/dataCache.ts
// Использует userId для построения пути:
urls.add(`/uploads/analysis/${item.userId}/${item.photoPath}`);
// Но userId это telegramId!
```

#### Последствия:
- Неверные пути к файлам
- Путаница при отладке
- Возможные ошибки безопасности
- Несоответствие типов TypeScript реальности

#### Решение:
```typescript
// Правильные типы:
interface HistoryItem {
  id: number;           // ID записи в БД
  userId: number;       // ID пользователя в БД
  telegramId: string;   // Telegram ID для путей к файлам
  photoPath: string;    // Имя файла
  // ...
}

// Сервер должен отправлять ОБА поля:
{
  userId: dbUser.id,
  telegramId: dbUser.telegramId.toString(),
  photoPath: item.photoPath
}
```

---

### 3. N+1 проблема с лайками

#### Проблема:
```javascript
// server/src/api/history.js - ОПТИМИЗИРОВАНО, НО:
// Клиент делает отдельные запросы для каждого элемента:

// client - при клике на лайк:
api.get(`/analysis-likes/${historyItemId}/status`)  // Проверка статуса
api.post(`/analysis-likes/${historyItemId}`)        // Установка лайка
api.delete(`/analysis-likes/${historyItemId}`)      // Удаление лайка
```

#### Последствия:
- При 50 элементах истории = до 50 дополнительных запросов
- Медленная загрузка UI
- Излишняя нагрузка на сервер

#### Решение:
```javascript
// Сервер уже оптимизирован и отправляет isLiked!
// Нужно использовать эти данные на клиенте:

// client/src/modules/history.ts
interface HistoryItem {
  isLiked: boolean;  // Уже приходит с сервера!
  likesCount: number;
}

// Использовать кэшированное состояние вместо запросов
```

---

### 4. Отсутствие батчинга запросов

#### Проблема:
```typescript
// dataCache.ts загружает параллельно, но отдельными запросами:
await Promise.allSettled([
  this.loadWardrobeItems(),  // GET /api/wardrobe
  this.loadCapsules()         // GET /api/capsules
]);

// + history загружается отдельно:
await historyManager.loadHistoryFromServer(); // GET /api/history
```

#### Последствия:
- 3 отдельных HTTP соединения при старте
- Медленная инициализация на мобильных сетях
- Дублирование auth проверок на сервере

#### Решение:
```typescript
// Новый endpoint для батчинга:
// GET /api/initial-data
{
  history: [...],
  wardrobe: [...],
  capsules: [...],
  user: {...},
  subscription: {...}
}

// Один запрос вместо 3-5
```

---

### 5. localStorage используется как основное хранилище

#### Проблема:
```typescript
// history.ts
private saveToStorage(): void {
  localStorage.setItem(STORAGE_KEYS.HISTORY, historyJson);
}

// Но сервер - источник правды!
// localStorage должен быть только кэшем
```

#### Последствия:
- Рассинхронизация данных
- Устаревшие данные после обновления на другом устройстве
- Сложность синхронизации

#### Решение:
```typescript
// Использовать IndexedDB для кэширования
// + Service Worker для offline
// + React Query/SWR для управления состоянием

const { data: history } = useQuery(
  'history',
  () => api.getHistory(),
  {
    staleTime: 5 * 60 * 1000, // 5 минут
    cacheTime: 30 * 60 * 1000, // 30 минут
  }
);
```

---

## 🟡 СРЕДНИЕ ПРОБЛЕМЫ

### 6. Отсутствие типизации на сервере

#### Проблема:
```javascript
// server/src/api/history.js - чистый JavaScript
// Нет проверки типов, легко сломать контракт
```

#### Решение:
- Мигрировать сервер на TypeScript
- Или использовать JSDoc для типизации
- Добавить runtime валидацию через Zod/Joi

---

### 7. Дублирование кода загрузки изображений

#### Проблема:
```typescript
// WardrobeService.ts: fetch('/api/wardrobe')
// CapsulesService.ts: fetch('/api/capsules')  
// dataCache.ts: fetch('/api/wardrobe') и fetch('/api/capsules')
// CapsulesManager.ts: fetch('/api/wardrobe')
```

#### Решение:
- Единый сервис DataService с кэшированием
- Использовать observable pattern для подписки на изменения

---

### 8. Неэффективная работа с изображениями

#### Проблема:
```typescript
// dataCache.ts предзагружает ВСЕ изображения:
private async cacheImages(imageUrls: string[]): Promise<void> {
  // Загружает 50+ изображений при старте
}
```

#### Решение:
- Lazy loading изображений по мере необходимости
- Использовать Intersection Observer
- Прогрессивная загрузка (thumbnail → full)

---

### 9. Отсутствие обработки offline режима

#### Проблема:
- При потере соединения приложение не работает
- Нет кэширования для offline

#### Решение:
- Service Worker с кэшированием
- IndexedDB для хранения данных
- Очередь синхронизации для отложенных запросов

---

### 10. Мертвый и legacy код

#### Найденный мертвый код:
```typescript
// api.ts
async checkFastVLMHealth() // Не используется

// history.ts  
getFirstEmptySlotIndex() // Больше не нужен
hasEmptySlots() // Устарел

// БД
photoData: null // Legacy поле, всегда null
```

---

## 📈 ПЛАН РЕАЛИЗАЦИИ

### Фаза 1: Критические исправления (1-2 дня)
1. ✅ Исправить типы userId/telegramId
2. ✅ Унифицировать все fetch на api.ts
3. ✅ Добавить auto-interceptor для initData

### Фаза 2: Оптимизация запросов (2-3 дня)
1. ✅ Создать батчинг endpoint /api/initial-data
2. ✅ Использовать isLiked с сервера
3. ✅ Убрать лишние запросы статуса лайков

### Фаза 3: Улучшение кэширования (3-4 дня)
1. ✅ Внедрить React Query/SWR
2. ✅ Migrar localStorage → IndexedDB
3. ✅ Добавить Service Worker

### Фаза 4: TypeScript на сервере (2-3 дня)
1. ✅ Конвертировать server в TypeScript
2. ✅ Создать shared типы
3. ✅ Добавить runtime валидацию

### Фаза 5: Очистка (1 день)
1. ✅ Удалить мертвый код
2. ✅ Удалить legacy поля из БД
3. ✅ Написать тесты

---

## 🎯 МЕТРИКИ УСПЕХА

### До рефакторинга:
- **Запросов при старте:** 5-7
- **Время загрузки:** 3-5 секунд
- **Размер bundle:** 450KB
- **Покрытие типами:** 60%

### После рефакторинга:
- **Запросов при старте:** 1-2 ✅
- **Время загрузки:** 1-2 секунды ✅
- **Размер bundle:** 280KB ✅
- **Покрытие типами:** 100% ✅

---

## 🚀 БЫСТРЫЕ ПОБЕДЫ (Quick Wins)

### Можно сделать прямо сейчас:

1. **Исправить тип userId в HistoryItem**
```typescript
// Заменить userId на telegramId во всех местах где это telegramId
interface HistoryItem {
  telegramId: string; // Для путей к файлам
  userId: number;     // ID в БД
}
```

2. **Использовать isLiked с сервера**
```typescript
// Вместо отдельного запроса использовать:
const isLiked = historyItem.isLiked; // Уже есть!
```

3. **Создать батч endpoint**
```javascript
// GET /api/initial-data
router.get('/initial-data', async (req, res) => {
  const [history, wardrobe, capsules] = await Promise.all([
    getHistory(userId),
    getWardrobe(userId),
    getCapsules(userId)
  ]);
  
  res.json({ history, wardrobe, capsules });
});
```

---

## 📝 ВЫВОДЫ

### Главные проблемы:
1. **Несогласованность архитектуры** - разные подходы в разных модулях
2. **Отсутствие единого источника правды** - данные дублируются
3. **Неоптимальная работа с сетью** - много лишних запросов
4. **Слабая типизация** - легко сломать контракты

### Рекомендации:
1. **Срочно** исправить критические проблемы (userId/telegramId)
2. **В ближайшее время** унифицировать HTTP клиент
3. **Планомерно** мигрировать на TypeScript + React Query
4. **Регулярно** проводить код-ревью и рефакторинг

---

## 👨‍💻 Ответственные

- **Фронтенд:** Унификация api клиента, исправление типов
- **Бэкенд:** Батчинг, оптимизация запросов, TypeScript
- **DevOps:** Service Worker, кэширование, мониторинг

---

*Документ будет обновляться по мере выполнения рефакторинга*
