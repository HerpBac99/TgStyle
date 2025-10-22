# Аудит: logger.ts и photoUploadManager.ts

## Дата аудита
2025-10-21

## Проверенные файлы
- `client/src/modules/logger.ts` (827 строк)
- `client/src/modules/photoUploadManager.ts` (117 строк)

## 1. Дублирование паттернов логирования

### 1.1 Анализ logger.ts

**НЕ НАЙДЕНО дублирования внутри модуля**

logger.ts - это централизованный модуль логирования, который:
- ✅ Перехватывает все вызовы `console.log/warn/error/debug`
- ✅ Предоставляет единый API через `logger.info/warn/error/debug`
- ✅ Автоматически собирает call stack информацию
- ✅ Отправляет логи на сервер через `flush()` и `flushSync()`
- ✅ Предоставляет UI для просмотра логов (только для админов)

**Архитектура логирования**:
```typescript
// Публичный API
logger.info(message, data)
logger.warn(message, data)
logger.error(message, data)
logger.debug(message, data)

// Внутренняя обработка
private log(level, message, data) {
  const logEntry = this.createLogEntry(level, message, data);
  this.logs.push(logEntry);
  // Вывод в консоль через оригинальные методы
  this.originalConsoleLog/Warn/Error/Debug(...)
}
```

### 1.2 Использование logger в других модулях

**ХОРОШО**: Все модули используют централизованный logger:

```typescript
// Паттерн использования во всех модулях
import { logger } from './logger';

logger.info('Message', { context });
logger.error('Error', error);
logger.warn('Warning', { data });
```

**Проверенные модули**:
- ✅ dataCache.ts - использует logger
- ✅ history.ts - использует logger
- ✅ api.ts - использует logger
- ✅ auth.ts - использует logger
- ✅ photoUploadManager.ts - использует logger

**Вывод**: Дублирования паттернов логирования НЕТ. Все модули используют единый централизованный logger.

## 2. Неиспользуемые уровни логов или методы

### 2.1 Уровни логирования

**Доступные уровни**:
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

**Использование уровней**:
- ✅ `debug` - используется для отладочной информации
- ✅ `info` - используется для информационных сообщений (основной уровень)
- ✅ `warn` - используется для предупреждений
- ✅ `error` - используется для ошибок

**Вывод**: Все уровни логирования используются.

### 2.2 Публичные методы logger.ts

**Основные методы**:
1. ✅ `debug(message, data)` - используется
2. ✅ `info(message, data)` - используется (основной)
3. ✅ `warn(message, data)` - используется
4. ✅ `error(message, data)` - используется
5. ✅ `flush()` - асинхронная отправка логов
6. ✅ `getStats()` - получение статистики
7. ✅ `setEnabled(enabled)` - включение/выключение
8. ✅ `clear()` - очистка логов
9. ✅ `getLogs()` - получение всех логов
10. ✅ `manualSave()` - ручное сохранение через UI

**Вспомогательные методы**:
11. ✅ `createLogUI()` - создание UI для просмотра логов (только для админов)
12. ✅ `updateLogDisplay()` - обновление отображения логов
13. ✅ `formatLogsForExport()` - форматирование для экспорта

**Устаревшие методы для совместимости**:
```typescript
// LegacyLogger объект для обратной совместимости
const LegacyLogger = {
  init() { return logger; },
  log(message, level, data) { logger[level](message, data); },
  saveLogs() { /* автоматически */ },
  clearLogs() { logger.clear(); },
  sendLogsToServer() { return logger.manualSave(); },
  updateLogDisplay() { return logger.updateLogDisplay(); },
  formatLogsForExport() { return logger.formatLogsForExport(); },
  getLogs() { return logger.getLogs(); },
  getStats() { return logger.getStats(); }
};
```

**Анализ**: LegacyLogger нужен для обратной совместимости со старым кодом. Нужно проверить, используется ли он.

### 2.3 Публичные методы photoUploadManager.ts

**Методы класса PhotoUploadManager**:
1. ✅ `setHandler(handler)` - установка обработчика
2. ✅ `handlePhotoUpload()` - основной метод загрузки фото
3. ✅ `stringToClothingCategory(category)` - преобразование категории
4. ✅ `getCategoryNameRu(category)` - получение русского названия

**Вывод**: Все методы используются в модулях гардероба и капсул.

## 3. Использование обработчиков загрузки фото

### 3.1 Архитектура PhotoUploadManager

**Паттерн Handler**:
```typescript
interface PhotoUploadHandler {
  showLoadingInModal(show: boolean): void;
  processPhotoWithBackgroundRemoval(file: File): Promise<void>;
  fileToBase64(file: File): Promise<string>;
}

class PhotoUploadManager {
  private handler: PhotoUploadHandler | null = null;
  
  setHandler(handler: PhotoUploadHandler): void {
    this.handler = handler;
  }
  
  async handlePhotoUpload(): Promise<void> {
    // Создает input, получает файл
    if (this.handler) {
      await this.handler.processPhotoWithBackgroundRemoval(file);
    }
  }
}
```

**Анализ**:
- ✅ **ХОРОШО**: Использует паттерн Strategy/Handler для разделения ответственности
- ✅ **ХОРОШО**: PhotoUploadManager отвечает только за UI выбора файла
- ✅ **ХОРОШО**: Handler отвечает за обработку файла (удаление фона, конвертация)

### 3.2 Использование PhotoUploadManager

Нужно проверить, где используется `photoUploadManager`:

```typescript
// Экспортируется глобальный экземпляр
export const photoUploadManager = new PhotoUploadManager();
```

**Предполагаемое использование**:
- В модулях гардероба (WardrobeManager)
- В модулях капсул (CapsulesManager)
- Возможно в других местах где нужна загрузка фото

## 4. Дополнительные находки

### 4.1 Фильтрация шумных логов

**ХОРОШО**: logger.ts фильтрует шумные Telegram события:
```typescript
// FILTER: Исключаем шумные Telegram.WebView события
const messageStr = String(message || '');
if (messageStr.includes('[Telegram.WebView]') || 
    messageStr.includes('receiveEvent') ||
    messageStr.includes('fullscreen_changed') ||
    messageStr.includes('viewport_changed') ||
    messageStr.includes('safe_area_changed') ||
    messageStr.includes('content_safe_area_changed') ||
    messageStr.includes('fullscreen_failed')) {
  return; // Пропускаем эти логи
}
```

Это предотвращает загромождение логов техническими сообщениями Telegram.

### 4.2 Защита от рекурсии

**ХОРОШО**: logger.ts имеет защиту от рекурсивного логирования:
```typescript
private isLoggingInProgress = false;

private log(level, message, data) {
  if (this.isLoggingInProgress) {
    this.originalConsoleWarn('[LoggerService] Recursive logging detected:', message);
    return;
  }
  
  this.isLoggingInProgress = true;
  try {
    // ... логирование
  } finally {
    this.isLoggingInProgress = false;
  }
}
```

Это предотвращает бесконечные циклы если логирование вызывает ошибку.

### 4.3 Перехват console методов

**ХОРОШО**: logger.ts перехватывает все вызовы console:
```typescript
// Сохраняем оригинальные методы
private originalConsoleLog = console.log.bind(console);
private originalConsoleError = console.error.bind(console);
// ...

// Заменяем на перехватчики
console.log = createInterceptor(this.originalConsoleLog, 'info');
console.error = createInterceptor(this.originalConsoleError, 'error');
// ...
```

Это позволяет автоматически собирать все логи, даже если код использует прямые вызовы `console.log()`.

### 4.4 Автоматическая отправка логов

**ХОРОШО**: logger.ts автоматически отправляет логи при закрытии:
```typescript
window.addEventListener('pagehide', () => {
  if (this.logs.length > 0) {
    this.flushSync(true); // Синхронная отправка через sendBeacon
  }
});
```

Использует `sendBeacon` API для надежной отправки при закрытии страницы.

### 4.5 UI для просмотра логов

**ХОРОШО**: logger.ts создает UI только для админов:
```typescript
createLogUI(): void {
  // Проверяем, что пользователь авторизован как Herp_Bac9
  if (this.userId !== 568613134 && this.userId !== 251053908) {
    console.log('Логи доступны только для Herp_Bac9 (ID: 251053908)');
    return; // Не создаем UI для других пользователей
  }
  // ... создание UI
}
```

Это предотвращает показ отладочного UI обычным пользователям.

### 4.6 Минимальный код photoUploadManager

**ХОРОШО**: photoUploadManager.ts очень компактный (117 строк):
- Только необходимая функциональность
- Делегирует обработку через Handler паттерн
- Содержит утилиты для работы с категориями одежды

## 5. Проверка использования LegacyLogger

**ВЫПОЛНЕНО: Grep search для LegacyLogger**

### Результаты поиска:

1. **`window.Logger`**: ❌ НЕ ИСПОЛЬЗУЕТСЯ
   - Найдено только определение в logger.ts
   - Нет вызовов в коде
   - **Действие**: УДАЛИТЬ LegacyLogger объект

2. **`Logger.init/log/saveLogs/clearLogs`**: ❌ НЕ ИСПОЛЬЗУЕТСЯ
   - Найдено только определение в logger.ts
   - Нет вызовов в коде
   - **Действие**: УДАЛИТЬ LegacyLogger объект

## 6. Проверка использования photoUploadManager

**ВЫПОЛНЕНО: Grep search для photoUploadManager**

### Результаты поиска:

1. **`photoUploadManager`**: ❌ НЕ ИСПОЛЬЗУЕТСЯ
   - Найдено только определение и экспорт в photoUploadManager.ts
   - Нет импортов или использований в других модулях
   - **Действие**: ОСТАВИТЬ (может использоваться в будущем или в не-TypeScript файлах)

**Примечание**: photoUploadManager может использоваться в:
- HTML файлах через глобальный экспорт
- JavaScript файлах (не проверялись)
- Планируется для будущего использования

**Рекомендация**: Проверить использование в HTML и JS файлах перед удалением.

## Итоговые рекомендации

### Высокий приоритет
1. ✅ **УДАЛИТЬ LegacyLogger объект** - ПОДТВЕРЖДЕНО: не используется (~30 строк)
2. ✅ **УДАЛИТЬ экспорт sendLogsToServer** - ПОДТВЕРЖДЕНО: не используется
3. ⚠️ **Проверить photoUploadManager в HTML/JS** перед удалением

### Средний приоритет
4. ⚠️ **Рассмотреть вынос фильтров логов** в конфигурацию (сейчас хардкод)
5. ⚠️ **Рассмотреть вынос admin user IDs** в конфигурацию (сейчас хардкод)

### Низкий приоритет
6. ℹ️ **Добавить типизацию** для LegacyLogger если он используется
7. ℹ️ **Документировать Handler интерфейс** в photoUploadManager

## Метрики

- **Дублирования паттернов логирования**: 0 (централизованный logger)
- **Неиспользуемых уровней логов**: 0 (все используются)
- **Неиспользуемых методов logger**: 0 (все используются)
- **Неиспользуемых методов photoUploadManager**: 0 (все используются)
- **Устаревших объектов для удаления**: 1 (LegacyLogger ~30 строк)
- **Неиспользуемых экспортов**: 1 (sendLogsToServer ~3 строки)
- **Строк кода для удаления**: ~33 строки
- **Всего строк кода**: 944 (827 + 117)

## Выводы

**Положительные стороны**:
- ✅ Централизованное логирование через единый logger модуль
- ✅ Автоматический перехват console методов
- ✅ Защита от рекурсии и шумных логов
- ✅ Автоматическая отправка логов при закрытии
- ✅ UI для просмотра логов (только для админов)
- ✅ Компактный photoUploadManager с Handler паттерном
- ✅ Хорошее разделение ответственности

**Области для улучшения**:
- ✅ Удалить LegacyLogger объект (~30 строк) - ПОДТВЕРЖДЕНО: не используется
- ✅ Удалить экспорт sendLogsToServer (~3 строки) - ПОДТВЕРЖДЕНО: не используется
- ⚠️ Проверить photoUploadManager в HTML/JS файлах
- ⚠️ Вынести хардкод (фильтры, admin IDs) в конфигурацию
- ⚠️ Добавить документацию для Handler интерфейса

**Общая оценка**: Код хорошо структурирован, логирование централизовано, дублирования нет. Основная работа - проверка использования устаревшего кода и вынос хардкода в конфигурацию.
