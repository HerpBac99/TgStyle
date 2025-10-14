# TgStyle Main Menu - Analysis Process Documentation

## Обзор модуля analysis.ts

Модуль `analysis.ts` управляет процессом анализа изображений через API, включая подготовку запросов, отправку на сервер, обработку ответов и сохранение результатов в истории.

## Основные компоненты

### Класс AnalysisManager

Центральный класс для управления анализом изображений.

#### Конструктор AnalysisManager()
```typescript
class AnalysisManager {
  private currentState: AnalysisState = {
    status: 'idle',
    progress: 0,
  };
}
```
**Теги поиска:** `analysis_manager_constructor`, `analysis_state_init`, `progress_tracking`

**Что делает:**
- Инициализирует менеджер анализа
- Устанавливает начальное состояние 'idle'
- Создает единственный экземпляр `analysisManager`

**Параметры:** нет

**Возвращает:** нет (конструктор)

## Подготовка анализа

#### prepareAnalysisRequest(imageBase64: string, themeDescription?: string): AnalysisRequest
```typescript
private prepareAnalysisRequest(imageBase64: string, themeDescription?: string): AnalysisRequest {
  const initData = authManager.getInitData();

  const request: AnalysisRequest = {
    photo: imageBase64,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  };

  if (initData) {
    request.initData = initData;
  }

  if (themeDescription) {
    request.theme = themeDescription;
  }

  return request;
}
```
**Теги поиска:** `analysis_request_preparation`, `telegram_auth_integration`, `platform_info_collection`, `theme_description_add`

**Что делает:**
- Получает данные авторизации от authManager
- Создает базовый запрос с фото и метаданными платформы
- Добавляет initData для серверной авторизации
- Добавляет описание темы если указано

**Параметры:**
- `imageBase64: string` - изображение в base64
- `themeDescription?: string` - опциональное описание темы анализа

**Возвращает:** AnalysisRequest - подготовленный запрос для API

## Управление состоянием

#### updateState(newState: Partial<AnalysisState>): void
```typescript
private updateState(newState: Partial<AnalysisState>): void {
  this.currentState = { ...this.currentState, ...newState };
  logger.debug('Analysis state updated', this.currentState);
  
  // Можно добавить событие для обновления UI
  this.dispatchStateChangeEvent();
}
```
**Теги поиска:** `state_update`, `analysis_progress_tracking`, `ui_state_sync`, `event_dispatch`

**Что делает:**
- Обновляет текущее состояние анализа
- Логирует изменения состояния
- Отправляет событие изменения состояния

**Параметры:**
- `newState: Partial<AnalysisState>` - частичное обновление состояния

**Возвращает:** void

#### dispatchStateChangeEvent(): void
```typescript
private dispatchStateChangeEvent(): void {
  const event = new CustomEvent('analysisStateChange', {
    detail: { ...this.currentState },
  });
  window.dispatchEvent(event);
}
```
**Теги поиска:** `state_change_event`, `ui_notification`, `progress_update_broadcast`

**Что делает:**
- Создает и отправляет событие изменения состояния анализа
- Позволяет UI компонентам реагировать на изменения

**Параметры:** нет

**Возвращает:** void

## Геттеры и сеттеры состояния

#### getCurrentState(): AnalysisState
```typescript
getCurrentState(): AnalysisState {
  return { ...this.currentState };
}
```
**Теги поиска:** `current_state_getter`, `analysis_status_check`, `progress_info_access`

**Что делает:**
- Возвращает копию текущего состояния анализа

**Параметры:** нет

**Возвращает:** AnalysisState - текущее состояние анализа

#### resetState(): void
```typescript
resetState(): void {
  this.currentState = {
    status: 'idle',
    progress: 0,
  };
}
```
**Теги поиска:** `state_reset`, `analysis_cleanup`, `initial_state_restore`

**Что делает:**
- Сбрасывает состояние анализа к начальному

**Параметры:** нет

**Возвращает:** void

#### isAnalyzing(): boolean
```typescript
isAnalyzing(): boolean {
  return ['uploading', 'processing'].includes(this.currentState.status);
}
```
**Теги поиска:** `analyzing_check`, `analysis_in_progress`, `busy_state_detection`

**Что делает:**
- Проверяет, выполняется ли анализ в данный момент

**Параметры:** нет

**Возвращает:** boolean - true если анализ выполняется

#### cancelAnalysis(): void
```typescript
cancelAnalysis(): void {
  if (this.isAnalyzing()) {
    this.updateState({
      status: 'idle',
      progress: 0,
      error: 'Анализ отменен пользователем',
    });
    logger.info('Analysis cancelled by user');
  }
}
```
**Теги поиска:** `analysis_cancel`, `user_cancellation`, `state_reset_on_cancel`

**Что делает:**
- Отменяет текущий анализ если он выполняется
- Устанавливает состояние ошибки

**Параметры:** нет

**Возвращает:** void

## Основной процесс анализа

#### analyzeImage(imageBase64: string, themeDescription?: string): Promise<AnalysisResponse>
```typescript
async analyzeImage(imageBase64: string, themeDescription?: string): Promise<AnalysisResponse> {
  logger.info('Starting image analysis', { themeDescription });

  try {
    // Обновляем состояние
    this.updateState({
      status: 'uploading',
      progress: 10,
      currentStep: 'Подготовка изображения...',
    });

    // Подготавливаем запрос
    const request = this.prepareAnalysisRequest(imageBase64, themeDescription);
    
    this.updateState({
      status: 'processing',
      progress: 30,
      currentStep: 'Отправка на анализ...',
    });

    // Отправляем на анализ
    const response = await api.analyzeImage(request);

    // Проверяем успешность ответа от сервера
    if (!response.success) {
      // Показываем user-friendly сообщение вместо технических ошибок
      const userFriendlyMessage = 'Сервер временно недоступен. Попробуйте позже.';
      throw new Error(userFriendlyMessage);
    }

    this.updateState({
      status: 'completed',
      progress: 100,
      currentStep: 'Анализ завершен',
    });

    // Перезагружаем историю с сервера (сервер уже сохранил через /api/analyze)
    // NEW: Перезагружаем историю с сервера для получения актуальных данных
    const { historyManager } = await import('./history.js');
    await historyManager.loadHistoryFromServer().catch(error => {
      logger.warn('Failed to reload history from server after analysis', error);
    });

    // ОБНОВЛЯЕМ UI ПОСЛЕ СОХРАНЕНИЯ
    const { uiManager } = await import('./uiManager.js');
    const { authManager } = await import('./auth.js');

    // Показываем экран анализа с изображением
    window.dispatchEvent(new CustomEvent('showAnalysisScreen', {
      detail: { imageBase64, analysis: response.analysis }
    }));

    // Обновляем карусель истории (event history:updated уже вызовется автоматически)
    uiManager.updateHistoryDisplay();

    // Обновляем информацию о подписке (если вернулся новый статус)
    if (response.subscription) {
      authManager.updateSubscription(response.subscription);
    }

    // Показываем результат в UI
    if (response.analysis) {
      uiManager.showAnalysisResult(response.analysis);
    }

    logger.info('Automatic image analysis completed successfully');
    return response;

  } catch (error) {
    logger.error('Automatic image analysis failed', error);

    this.updateState({
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка анализа',
    });

    throw error;
  }
}
```
**Теги поиска:** `main_analysis_method`, `image_analysis_flow`, `api_request_processing`, `ui_update_after_analysis`, `error_handling_analysis`, `history_reload`, `subscription_update`

**Что делает:**
- Начинает анализ изображения с заданной темой
- Обновляет состояние прогресса (uploading → processing → completed)
- Отправляет запрос через api.analyzeImage()
- Перезагружает историю с сервера
- Обновляет UI (показывает результат, обновляет карусель)
- Обновляет информацию о подписке если нужно

**Параметры:**
- `imageBase64: string` - изображение в base64 формате
- `themeDescription?: string` - опциональное описание темы для анализа

**Возвращает:** Promise<AnalysisResponse> - результат анализа от сервера

**Исключения:** выбрасывает ошибку при неудаче анализа

## Статистика и отладка

#### getStats()
```typescript
getStats() {
  return {
    currentStatus: this.currentState.status,
    progress: this.currentState.progress,
    isAnalyzing: this.isAnalyzing(),
    hasResult: false, // Result always undefined since we don't use classification
    hasError: !!this.currentState.error,
  };
}
```
**Теги поиска:** `analysis_stats_get`, `debugging_info`, `analysis_state_summary`

**Что делает:**
- Возвращает статистику текущего состояния анализа

**Параметры:** нет

**Возвращает:** объект со статистикой анализа

## Интеграция с другими модулями

**Импортируемые модули:**
- `logger` - логирование операций
- `api` - HTTP клиент для запросов
- `authManager` - получение данных авторизации

**Динамически импортируемые модули:**
- `historyManager` - перезагрузка истории после анализа
- `uiManager` - обновление UI после анализа
- `authManager` - обновление подписки

**Теги поиска:** `module_dependencies`, `dynamic_imports`, `ui_coordination`

## События

**Отправляемые события:**
- `analysisStateChange` - изменение состояния анализа с прогрессом
- `showAnalysisScreen` - запрос показа экрана анализа с результатом

**Теги поиска:** `analysis_events`, `ui_communication`, `state_broadcasting`

## Процесс анализа

```
1. analyzeImage() вызывается с изображением и темой
2. updateState() → status: 'uploading', progress: 10
3. prepareAnalysisRequest() создает запрос с фото, initData, темой
4. updateState() → status: 'processing', progress: 30
5. api.analyzeImage() отправляет запрос на сервер
6. Проверка response.success
7. updateState() → status: 'completed', progress: 100
8. Динамический импорт historyManager
9. loadHistoryFromServer() обновляет историю
10. Динамический импорт uiManager и authManager
11. Отправка события showAnalysisScreen
12. uiManager.updateHistoryDisplay() обновляет карусель
13. authManager.updateSubscription() если есть новые данные
14. uiManager.showAnalysisResult() показывает результат
15. Возврат response
```

**Теги поиска:** `analysis_workflow`, `step_by_step_process`, `ui_update_flow`, `server_integration`

## Обработка ошибок

**Типы ошибок:**
- Сетевые ошибки при отправке на сервер
- response.success === false (сервер недоступен)
- Ошибки при перезагрузке истории
- Ошибки при обновлении UI

**Обработка:**
- Логирование всех ошибок
- Установка состояния 'error'
- Выбрасывание ошибки для обработки выше

**Теги поиска:** `error_handling`, `network_errors`, `server_errors`, `ui_update_errors`

## Оптимизации

**Динамические импорты:**
- Модули импортируются только при необходимости
- Снижает размер бандла
- Улучшает производительность загрузки

**Теги поиска:** `dynamic_imports_benefit`, `bundle_size_optimization`, `lazy_loading`

## Состояния анализа

```typescript
interface AnalysisState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number; // 0-100
  currentStep?: string; // Описание текущего шага
  error?: string; // Сообщение об ошибке
}
```

**Теги поиска:** `analysis_states`, `progress_tracking`, `status_types`

## Взаимодействие с сервером

**API запрос:**
```typescript
POST /api/analyze
{
  "photo": "base64_image_data",
  "platform": "Win32",
  "userAgent": "Mozilla/5.0...",
  "initData": "telegram_auth_data",
  "theme": "optional_theme_description"
}
```

**Ответ сервера:**
```typescript
{
  "success": true,
  "analysis": "AI analysis result text",
  "subscription": { /* optional subscription update */ }
}
```

**Теги поиска:** `api_contract`, `server_request_format`, `server_response_format`
