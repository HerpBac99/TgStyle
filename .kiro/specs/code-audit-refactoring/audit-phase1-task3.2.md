# Аудит: api.ts и auth.ts

## Дата аудита
2025-10-21

## Проверенные файлы
- `client/src/modules/api.ts` (398 строк)
- `client/src/modules/auth.ts` (380 строк)

## 1. Дублирование обработки ошибок

### 1.1 Паттерны try-catch

**НАЙДЕНО: Дублирование паттернов обработки ошибок**

#### api.ts
```typescript
// Централизованная обработка в методе request()
private async request<T>(...): Promise<T> {
  try {
    // ... fetch logic
    if (!response.ok) {
      await this.handleHttpError(response);
    }
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw createError(ERROR_CODES.NETWORK_ERROR, 'Превышено время ожидания ответа');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw createError(ERROR_CODES.NETWORK_ERROR, 'Ошибка сети');
      }
    }
    throw error;
  }
}

// Специализированная обработка HTTP статусов
private async handleHttpError(response: Response): Promise<never> {
  const status = response.status as HttpStatusCode;
  try {
    const errorData = await response.json();
    const message = errorData.error || errorData.message || response.statusText;
    
    switch (status) {
      case 400: throw createError(ERROR_CODES.NETWORK_ERROR, `Неверный запрос: ${message}`);
      case 401: throw createError(ERROR_CODES.AUTH_FAILED, `Ошибка авторизации: ${message}`);
      case 404: throw createError(ERROR_CODES.SERVER_ERROR, 'Запрашиваемый ресурс не найден');
      case 500: throw createError(ERROR_CODES.SERVER_ERROR, 'Внутренняя ошибка сервера');
      case 502: throw createError(ERROR_CODES.SERVER_ERROR, 'Сервер недоступен или перегружен');
      case 503: throw createError(ERROR_CODES.SERVER_ERROR, 'Сервис временно недоступен');
      default: throw createError(ERROR_CODES.SERVER_ERROR, `Ошибка сервера: ${status} ${message}`);
    }
  } catch (parseError) {
    throw createError(ERROR_CODES.SERVER_ERROR, `HTTP ${status}: ${response.statusText}`);
  }
}
```

#### auth.ts
```typescript
// Обработка ошибок в authenticate()
async authenticate(): Promise<AuthResponse> {
  try {
    // ... authentication logic
    if (!initData) {
      logger.warn('InitData not available, continuing without server authentication');
      // Fallback logic
      return authResponse;
    }
    
    const response = await api.authenticate(initData);
    
    if (response.success) {
      this.isAuthenticated = true;
      // ...
    } else {
      logger.error('Server authentication failed', { error: response.error });
      throw createError(ERROR_CODES.AUTH_FAILED, response.error || 'Ошибка авторизации');
    }
    
    return response;
  } catch (error) {
    logger.error('Authentication failed', error);
    
    if (error instanceof Error && 'code' in error) {
      throw error;
    }
    
    throw createError(ERROR_CODES.AUTH_FAILED, 'Неизвестная ошибка авторизации');
  }
}

// Обработка ошибок в других методах
private setupTelegramApp(): void {
  if (!this.tg) return;
  try {
    this.tg.expand();
    this.tg.enableClosingConfirmation();
    // ...
  } catch (error) {
    logger.error('Error configuring Telegram WebApp', error);
  }
}

private displayUserProfile(): void {
  if (!this.user) return;
  try {
    // ... UI update logic
  } catch (error) {
    logger.error('Error displaying user profile', error);
  }
}
```

**Анализ**:
- ✅ **api.ts**: Централизованная обработка ошибок в базовом методе `request()` - ХОРОШО
- ✅ **auth.ts**: Консистентное использование try-catch с логированием - ХОРОШО
- ⚠️ **Паттерн**: Оба модуля используют `createError()` и `logger.error()` - консистентно
- ⚠️ **Различие**: api.ts выбрасывает ошибки, auth.ts иногда "проглатывает" (в setupTelegramApp, displayUserProfile)

**Рекомендация**: Паттерны обработки ошибок достаточно консистентны. Различия оправданы:
- api.ts - критические ошибки сети, должны прерывать выполнение
- auth.ts - некритические ошибки UI, не должны ломать приложение

### 1.2 Логирование ошибок

**ХОРОШО**: Оба модуля используют централизованный logger:
```typescript
import { logger } from './logger';
logger.error('Error message', error);
logger.warn('Warning message', { context });
logger.info('Info message', { data });
```

Логирование консистентно и структурировано.

## 2. Неиспользуемые API методы

### 2.1 Deprecated методы

**НАЙДЕНО: 1 deprecated метод**

```typescript
/**
 * Проверка статуса лайка (DEPRECATED: используй isLiked из истории)
 */
async checkLikeStatus(historyItemId: number): Promise<any> {
  logger.info('Checking like status', { historyItemId });
  return this.get(`/analysis-likes/${historyItemId}/status`, TIMEOUTS.ANALYSIS_REQUEST);
}
```

**Анализ**:
- Метод помечен как DEPRECATED в комментарии
- Рекомендуется использовать `isLiked` из объекта истории
- Нужно проверить использование в коде

**Поиск использований**: Нужно проверить, используется ли этот метод где-либо в коде.

**Рекомендация**: 
1. Проверить использование через grep search
2. Если не используется - УДАЛИТЬ
3. Если используется - заменить на `isLiked` из истории, затем удалить

### 2.2 Потенциально неиспользуемые методы

**Методы для проверки**:

1. **`ping()`** - проверка доступности API
   ```typescript
   async ping(): Promise<boolean> {
     try {
       await this.get('/ping', TIMEOUTS.HEALTH_CHECK);
       return true;
     } catch (error) {
       logger.warn('API ping failed', error);
       return false;
     }
   }
   ```
   - Может использоваться для health checks
   - Нужно проверить использование

2. **`getInitialData()`** - батч загрузка начальных данных
   ```typescript
   async getInitialData(): Promise<{...}> {
     logger.info('Loading initial data batch');
     return this.get('/initial-data', TIMEOUTS.ANALYSIS_REQUEST);
   }
   ```
   - Оптимизация для загрузки всех данных одним запросом
   - Нужно проверить, используется ли вместо отдельных запросов

## 3. Консистентность обработки initData

### 3.1 Передача initData в API запросах

**НАЙДЕНО: Улучшенная консистентность**

#### api.ts - Автоматическое добавление initData
```typescript
private async request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout = this.defaultTimeout,
  skipInitData = false
): Promise<T> {
  // OPTIMIZED: Автоматически добавляем initData если не помечено как skipInitData
  let finalHeaders = {
    'Content-Type': 'application/json',
    ...options.headers,
  } as Record<string, string>;

  if (!skipInitData) {
    const initData = getInitData();
    if (initData) {
      finalHeaders['X-Init-Data'] = initData;
    }
  }
  
  const response = await fetch(url, {
    ...options,
    headers: finalHeaders,
    signal: AbortSignal.timeout(timeout),
  });
  // ...
}
```

**Анализ**:
- ✅ **ХОРОШО**: initData автоматически добавляется в заголовок `X-Init-Data`
- ✅ **ХОРОШО**: Параметр `skipInitData` для исключений (например, публичные эндпоинты)
- ✅ **ХОРОШО**: Функция `getInitData()` вынесена отдельно для избежания circular dependencies

#### auth.ts - Получение initData
```typescript
/**
 * Получение initData для API запросов
 */
getInitData(): string | undefined {
  return this.tg?.initData;
}
```

**Анализ**:
- ✅ **ХОРОШО**: Централизованный метод для получения initData
- ✅ **ХОРОШО**: Безопасный доступ через optional chaining

### 3.2 Валидация initData

**ХОРОШО**: Валидация выполняется в auth.ts перед отправкой на сервер:
```typescript
// Валидируем initData локально
const validation = validateTelegramInitData(initData);
if (!validation.isValid) {
  logger.error('Invalid Telegram initData', { errors: validation.errors });
  throw createError(ERROR_CODES.AUTH_FAILED, 'Некорректные данные авторизации');
}
```

### 3.3 Fallback логика

**ХОРОШО**: auth.ts имеет graceful fallback для режима разработки:
```typescript
if (!initData) {
  logger.warn('InitData not available, continuing without server authentication');
  
  // Создаем базовую подписку для локального режима
  this.userSubscription = {
    type: 'free',
    analysesLeft: 3,
    totalAnalyses: 0,
    weeklyResetDate: new Date().toISOString()
  };
  
  // В режиме разработки можем продолжить без авторизации
  const authResponse: AuthResponse = {
    success: true,
  };
  // ...
  return authResponse;
}
```

**Рекомендация**: Консистентность обработки initData на высоком уровне. Улучшений не требуется.

## 4. Дополнительные находки

### 4.1 Дублирование логирования в API методах

**НАЙДЕНО: Повторяющийся паттерн логирования**

Все методы TgStyleApi имеют идентичный паттерн:
```typescript
async createWardrobeItem(data: any): Promise<any> {
  logger.info('Creating wardrobe item');
  return this.post('/wardrobe', data, TIMEOUTS.ANALYSIS_REQUEST);
}

async deleteWardrobeItem(itemId: number): Promise<any> {
  logger.info('Deleting wardrobe item', { itemId });
  return this.delete(`/wardrobe/${itemId}`, TIMEOUTS.ANALYSIS_REQUEST);
}

async updateWardrobeItem(itemId: number, data: any): Promise<any> {
  logger.info('Updating wardrobe item', { itemId });
  return this.put(`/wardrobe/${itemId}`, data, TIMEOUTS.ANALYSIS_REQUEST);
}
```

**Анализ**:
- Каждый метод логирует перед вызовом
- Логирование можно переместить в базовый метод `request()`

**Рекомендация**: 
- **Низкий приоритет**: Текущий подход явный и читаемый
- Можно добавить автоматическое логирование в `request()`, но это может быть избыточно
- Оставить как есть для явности

### 4.2 Типизация API ответов

**НАЙДЕНО: Слабая типизация**

Большинство методов возвращают `Promise<any>`:
```typescript
async getWardrobe(): Promise<any>
async getCapsules(): Promise<any>
async getHistory(limit = 50, page = 1): Promise<any>
```

**Рекомендация**: 
- **Средний приоритет**: Создать интерфейсы для API ответов
- Улучшит type safety и автодополнение
- Пример:
```typescript
interface WardrobeResponse {
  success: boolean;
  items: WardrobeItem[];
  error?: string;
}

async getWardrobe(): Promise<WardrobeResponse>
```

### 4.3 Использование createError

**ХОРОШО**: Оба модуля используют централизованную функцию `createError()`:
```typescript
import { createError, ERROR_CODES } from '@/utils/helpers';

throw createError(ERROR_CODES.AUTH_FAILED, 'Ошибка авторизации');
throw createError(ERROR_CODES.NETWORK_ERROR, 'Нет подключения к интернету');
```

Это обеспечивает консистентность структуры ошибок.

### 4.4 Subscription management в auth.ts

**ХОРОШО**: Централизованное управление подпиской:
```typescript
getSubscription()
isPremium(): boolean
getAnalysesLeft(): number
canAnalyze(): boolean
updateSubscription(subscription)
```

Все методы работают с единым источником данных `this.userSubscription`.

### 4.5 Telegram WebApp интеграция

**ХОРОШО**: auth.ts правильно работает с Telegram WebApp API:
- Проверка версии: `this.tg.isVersionAtLeast('6.9')`
- Graceful fallback для неподдерживаемых функций
- Haptic feedback с fallback на navigator.vibrate

## 5. Проверка использования deprecated метода

**ВЫПОЛНЕНО: Grep search для неиспользуемых методов**

### Результаты поиска:

1. **`checkLikeStatus`**: ❌ НЕ ИСПОЛЬЗУЕТСЯ
   - Найдено только определение в api.ts
   - Нет вызовов в коде
   - **Действие**: УДАЛИТЬ

2. **`ping()`**: ❌ НЕ ИСПОЛЬЗУЕТСЯ
   - Найдено только определение в api.ts
   - Нет вызовов в коде
   - **Действие**: УДАЛИТЬ

3. **`getInitialData()`**: ❌ НЕ ИСПОЛЬЗУЕТСЯ
   - Найдено только определение в api.ts
   - Нет вызовов в коде
   - Вместо него используются отдельные методы: `getWardrobe()`, `getCapsules()`, `getHistory()`
   - **Действие**: УДАЛИТЬ

## Итоговые рекомендации

### Высокий приоритет
1. ✅ **УДАЛИТЬ `checkLikeStatus()`** - ПОДТВЕРЖДЕНО: не используется
2. ✅ **УДАЛИТЬ `ping()`** - ПОДТВЕРЖДЕНО: не используется
3. ✅ **УДАЛИТЬ `getInitialData()`** - ПОДТВЕРЖДЕНО: не используется

### Средний приоритет
4. ⚠️ **Добавить типизацию API ответов** - создать интерфейсы вместо `any`

### Низкий приоритет
5. ℹ️ **Рассмотреть автоматическое логирование** в базовом методе `request()` (опционально)

## Метрики

- **Неиспользуемых методов для удаления**: 3 (`checkLikeStatus`, `ping`, `getInitialData`)
- **Дублирования обработки ошибок**: 0 (паттерны консистентны)
- **Проблем с initData**: 0 (обработка консистентна)
- **Методов с типом `any`**: ~15 (можно улучшить типизацию)
- **Строк кода для удаления**: ~40 строк (3 неиспользуемых метода)

## Выводы

**Положительные стороны**:
- ✅ Централизованная обработка ошибок в api.ts
- ✅ Консистентное использование logger
- ✅ Автоматическое добавление initData в заголовки
- ✅ Graceful fallback для режима разработки
- ✅ Правильная работа с Telegram WebApp API

**Области для улучшения**:
- ✅ Удалить 3 неиспользуемых метода: `checkLikeStatus`, `ping`, `getInitialData`
- ⚠️ Улучшить типизацию API ответов

**Общая оценка**: Код хорошо структурирован, обработка ошибок консистентна, initData обрабатывается правильно. Основная работа - удаление deprecated кода и улучшение типизации.
