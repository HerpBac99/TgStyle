# TgStyle Main Menu - API Integration Documentation

## Обзор модуля api.ts

Модуль `api.ts` предоставляет HTTP клиент для взаимодействия с сервером TgStyle, включая обработку запросов, ответов, ошибок и авторизацию через Telegram WebApp.

## Основные компоненты

### Класс ApiClient

Базовый HTTP клиент с обработкой ошибок и таймаутами.

#### Конструктор ApiClient(baseUrl, defaultTimeout)
```typescript
constructor(baseUrl = API_URL, defaultTimeout = TIMEOUTS.AUTH_REQUEST) {
  this.baseUrl = baseUrl;
  this.defaultTimeout = defaultTimeout;
}
```
**Теги поиска:** `api_client_constructor`, `base_url_config`, `timeout_settings`

**Что делает:**
- Устанавливает базовый URL сервера
- Задает таймаут по умолчанию
- Создает базовый HTTP клиент

**Параметры:**
- `baseUrl: string` - базовый URL API (по умолчанию API_URL)
- `defaultTimeout: number` - таймаут по умолчанию

**Возвращает:** нет (конструктор)

## Основной HTTP метод

#### request<T>(endpoint, options, timeout): Promise<T>
```typescript
private async request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout = this.defaultTimeout
): Promise<T> {
  // Проверяем доступность сети
  if (!isOnline()) {
    throw createError(ERROR_CODES.NETWORK_ERROR, 'Нет подключения к интернету');
  }

  const url = `${this.baseUrl}${endpoint}`;
  const startTime = Date.now();

  try {
    logger.info(`API Request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeout),
    });

    const duration = Date.now() - startTime;
    logger.info(`API Response: ${response.status} ${response.statusText} (${duration}ms)`);

    // Логируем API запрос
    if (window.appLogger) {
      window.appLogger.info(`API Request`, {
        method: options.method || 'GET',
        url: endpoint,
        status: response.status,
        duration,
      });
    }

    // Обработка статусов ошибок
    if (!response.ok) {
      await this.handleHttpError(response);
    }

    // Проверяем Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      logger.error('API returned non-JSON response', {
        status: response.status,
        contentType,
        response: text.substring(0, 200),
      });
      throw createError(ERROR_CODES.SERVER_ERROR, 'Сервер вернул некорректный формат данных');
    }

    const data = await response.json() as T;
    logger.info('API Response Data', data);

    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.error(`API Timeout: ${url} (${duration}ms)`);
        throw createError(ERROR_CODES.NETWORK_ERROR, 'Превышено время ожидания ответа');
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        logger.error(`Network Error: ${url}`, error);
        throw createError(ERROR_CODES.NETWORK_ERROR, 'Ошибка сети');
      }
    }

    logger.error('API Request Failed', {
      url,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```
**Теги поиска:** `http_request_core`, `network_check`, `timeout_handling`, `error_processing`, `response_validation`, `logging_api_calls`

**Что делает:**
- Проверяет подключение к интернету
- Выполняет HTTP запрос с таймаутом
- Обрабатывает различные типы ошибок
- Валидирует ответ сервера
- Логирует запросы и ответы

**Параметры:**
- `endpoint: string` - путь к API эндпоинту
- `options: RequestInit` - опции fetch запроса
- `timeout: number` - таймаут запроса

**Возвращает:** Promise<T> - распарсенный JSON ответ

## Обработка HTTP ошибок

#### handleHttpError(response): Promise<never>
```typescript
private async handleHttpError(response: Response): Promise<never> {
  const status = response.status as HttpStatusCode;
  
  try {
    const errorData = await response.json();
    const message = errorData.error || errorData.message || response.statusText;
    
    switch (status) {
      case 400:
        throw createError(ERROR_CODES.NETWORK_ERROR, `Неверный запрос: ${message}`);
      case 401:
        throw createError(ERROR_CODES.AUTH_FAILED, `Ошибка авторизации: ${message}`);
      case 404:
        throw createError(ERROR_CODES.SERVER_ERROR, 'Запрашиваемый ресурс не найден');
      case 500:
        throw createError(ERROR_CODES.SERVER_ERROR, 'Внутренняя ошибка сервера');
      case 502:
        throw createError(ERROR_CODES.SERVER_ERROR, 'Сервер недоступен или перегружен');
      case 503:
        throw createError(ERROR_CODES.SERVER_ERROR, 'Сервис временно недоступен');
      default:
        throw createError(ERROR_CODES.SERVER_ERROR, `Ошибка сервера: ${status} ${message}`);
    }
  } catch (parseError) {
    // Если не удалось спарсить JSON ошибки
    throw createError(ERROR_CODES.SERVER_ERROR, `HTTP ${status}: ${response.statusText}`);
  }
}
```
**Теги поиска:** `http_error_handling`, `status_code_mapping`, `user_friendly_errors`, `json_error_parsing`

**Что делает:**
- Определяет тип ошибки по HTTP статусу
- Парсит JSON с сообщением ошибки
- Преобразует в пользовательские сообщения
- Выбрасывает соответствующие ошибки

**Параметры:**
- `response: Response` - HTTP ответ с ошибкой

**Возвращает:** never (всегда выбрасывает ошибку)

## Удобные HTTP методы

#### get<T>(endpoint, timeout?): Promise<T>
```typescript
async get<T>(endpoint: string, timeout?: number): Promise<T> {
  return this.request<T>(endpoint, { method: 'GET' }, timeout);
}
```
**Теги поиска:** `get_request_method`, `read_operations`, `safe_get_call`

**Что делает:**
- Выполняет GET запрос через request()

**Параметры:**
- `endpoint: string` - путь к ресурсу
- `timeout?: number` - опциональный таймаут

**Возвращает:** Promise<T> - данные от сервера

#### post<T>(endpoint, data?, timeout?): Promise<T>
```typescript
async post<T>(endpoint: string, data?: any, timeout?: number): Promise<T> {
  return this.request<T>(
    endpoint,
    {
      method: 'POST',
      ...(data && { body: JSON.stringify(data) }),
    },
    timeout
  );
}
```
**Теги поиска:** `post_request_method`, `create_operations`, `data_sending`

**Что делает:**
- Выполняет POST запрос с JSON данными

**Параметры:**
- `endpoint: string` - путь к ресурсу
- `data?: any` - данные для отправки
- `timeout?: number` - опциональный таймаут

**Возвращает:** Promise<T> - ответ сервера

#### put<T>(endpoint, data?, timeout?): Promise<T>
```typescript
async put<T>(endpoint: string, data?: any, timeout?: number): Promise<T> {
  return this.request<T>(
    endpoint,
    {
      method: 'PUT',
      ...(data && { body: JSON.stringify(data) }),
    },
    timeout
  );
}
```
**Теги поиска:** `put_request_method`, `update_operations`, `resource_modification`

**Что делает:**
- Выполняет PUT запрос для обновления ресурсов

**Параметры:**
- `endpoint: string` - путь к ресурсу
- `data?: any` - обновляемые данные
- `timeout?: number` - опциональный таймаут

**Возвращает:** Promise<T> - ответ сервера

#### delete<T>(endpoint, timeout?): Promise<T>
```typescript
async delete<T>(endpoint: string, timeout?: number): Promise<T> {
  return this.request<T>(endpoint, { method: 'DELETE' }, timeout);
}
```
**Теги поиска:** `delete_request_method`, `resource_deletion`, `removal_operations`

**Что делает:**
- Выполняет DELETE запрос для удаления ресурсов

**Параметры:**
- `endpoint: string` - путь к ресурсу
- `timeout?: number` - опциональный таймаут

**Возвращает:** Promise<T> - ответ сервера

## Специализированный клиент TgStyle

### Конструктор TgStyleApi()
```typescript
class TgStyleApi extends ApiClient {
  // Специфические методы для TgStyle API
}
```
**Теги поиска:** `tgstyle_api_client`, `specialized_client`, `inheritance_pattern`

**Что делает:**
- Наследуется от ApiClient
- Добавляет специфические методы для TgStyle

**Параметры:** наследуются от ApiClient

## Методы TgStyle API

#### authenticate(initData): Promise<AuthResponse>
```typescript
async authenticate(initData: string): Promise<AuthResponse> {
  const request: AuthRequest = { initData };
  const response = await this.post<AuthResponse>('/auth', request, TIMEOUTS.AUTH_REQUEST);
  
  if (response.success) {
    logger.info('Authentication successful', { userId: response.user?.id });
  } else {
    logger.error('Authentication failed', { error: response.error });
  }
  
  return response;
}
```
**Теги поиска:** `telegram_auth_api`, `user_authentication`, `initdata_validation`, `auth_response_handling`

**Что делает:**
- Отправляет запрос авторизации с Telegram initData
- Логирует успех/неудачу
- Возвращает данные пользователя и подписки

**Параметры:**
- `initData: string` - данные авторизации от Telegram

**Возвращает:** Promise<AuthResponse> - результат авторизации

#### analyzeImage(request): Promise<AnalysisResponse>
```typescript
async analyzeImage(request: AnalysisRequest): Promise<AnalysisResponse> {
  logger.info('Starting image analysis', {
    hasPhoto: !!request.photo,
    photoSize: request.photo?.length || 0,
    hasPinterestUrl: !!request.pinterestUrl,
  });

  const response = await this.post<AnalysisResponse>(
    '/analyze', 
    request, 
    TIMEOUTS.ANALYSIS_REQUEST
  );

  if (response.success) {
    logger.info('Image analysis successful', {
      hasClassification: false, // Server doesn't return classification
      hasAnalysis: !!response.analysis,
    });
  } else {
    logger.error('Image analysis failed', { error: response.error });
  }

  return response;
}
```
**Теги поиска:** `image_analysis_api`, `ai_processing_request`, `photo_analysis_flow`, `analysis_response_handling`

**Что делает:**
- Отправляет изображение на анализ ИИ
- Логирует параметры запроса и результат
- Возвращает результат анализа

**Параметры:**
- `request: AnalysisRequest` - запрос с изображением и метаданными

**Возвращает:** Promise<AnalysisResponse> - результат анализа ИИ

#### sendLogs(request): Promise<LogResponse>
```typescript
async sendLogs(request: LogRequest): Promise<LogResponse> {
  return this.post<LogResponse>('/log-client', request, TIMEOUTS.LOG_REQUEST);
}
```
**Теги поиска:** `client_logging_api`, `log_submission`, `error_reporting`

**Что делает:**
- Отправляет клиентские логи на сервер
- Используется для отладки и мониторинга

**Параметры:**
- `request: LogRequest` - логи для отправки

**Возвращает:** Promise<LogResponse> - подтверждение получения

## Служебные методы

#### ping(): Promise<boolean>
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
**Теги поиска:** `api_health_check`, `connectivity_test`, `server_ping`

**Что делает:**
- Проверяет доступность API сервера
- Используется для диагностики соединения

**Параметры:** нет

**Возвращает:** Promise<boolean> - true если сервер доступен

#### checkFastVLMHealth(): Promise<boolean>
```typescript
async checkFastVLMHealth(): Promise<boolean> {
  try {
    // В production FastVLM недоступен напрямую с клиента
    // Проверяем через основной API
    const response = await this.get('/health', TIMEOUTS.HEALTH_CHECK);
    return Boolean(response && typeof response === 'object');
  } catch (error) {
    logger.info('FastVLM health check failed', error);
    return false;
  }
}
```
**Теги поиска:** `fastvlm_health_check`, `ai_server_status`, `backend_health`

**Что делает:**
- Проверяет здоровье FastVLM сервера через основной API
- В продакшене FastVLM недоступен напрямую

**Параметры:** нет

**Возвращает:** Promise<boolean> - true если AI сервер здоров

## Константы и настройки

**TIMEOUTS:**
```typescript
AUTH_REQUEST: 10000,      // 10 секунд
ANALYSIS_REQUEST: 60000,  // 60 секунд
LOG_REQUEST: 5000,        // 5 секунд
HEALTH_CHECK: 3000        // 3 секунды
```
**Теги поиска:** `api_timeouts`, `request_limits`, `performance_settings`

**ERROR_CODES:**
```typescript
NETWORK_ERROR: 'network_error',
AUTH_FAILED: 'auth_failed',
SERVER_ERROR: 'server_error'
```
**Теги поиска:** `error_codes`, `error_types`, `error_handling_constants`

## Глобальный экземпляр

```typescript
export const api = new TgStyleApi();
```
**Теги поиска:** `global_api_instance`, `singleton_pattern`, `api_access`

**Что делает:**
- Создает глобальный экземпляр API клиента
- Доступен во всем приложении как `api`

## Процесс API запроса

```
1. api.method() вызывается
2. request() проверяет сеть
3. fetch() отправляет запрос с таймаутом
4. handleHttpError() обрабатывает ошибки
5. Валидация Content-Type
6. JSON парсинг ответа
7. Возврат данных или выбрасывание ошибки
```

**Теги поиска:** `api_request_flow`, `error_handling_flow`, `response_processing`

## Обработка ошибок

**Сетевые ошибки:**
- `Нет подключения к интернету` - проверка isOnline()
- `Ошибка сети` - TypeError при fetch
- `Превышено время ожидания` - AbortError

**Серверные ошибки:**
- 400: `Неверный запрос`
- 401: `Ошибка авторизации`
- 404: `Ресурс не найден`
- 500: `Внутренняя ошибка сервера`
- 502/503: `Сервер недоступен`

**Теги поиска:** `error_types`, `http_status_codes`, `user_messages`

## Логирование

**Логирование запросов:**
- Начало запроса с методом и URL
- Ответ с статусом и временем выполнения
- Данные ответа (для отладки)
- Ошибки с деталями

**Интеграция с appLogger:**
- Дополнительное логирование в клиентский логгер
- Метрики производительности

**Теги поиска:** `api_logging`, `performance_monitoring`, `debug_logging`

## Безопасность

**Заголовки:**
- `Content-Type: application/json` - для всех запросов
- Нет exposed credentials в коде

**Валидация:**
- Проверка сети перед запросами
- Валидация Content-Type ответов
- Обработка malformed JSON

**Теги поиска:** `api_security`, `headers_security`, `response_validation`
