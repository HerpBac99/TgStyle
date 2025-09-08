/**
 * Упрощенный логгер для TgStyle с выводом в терминал сервера
 */

import type { Logger, LogEntry, LogLevel } from '@/types/index.js';
import { 
  API_URL,
  LOGGING_CONFIG,
  TIMEOUTS
} from '@/utils/constants.js';
import { 
  generateSessionId,
  formatTimestamp,
  safeJsonStringify
} from '@/utils/helpers.js';

class TgStyleLogger implements Logger {
  private sessionId: string;
  private logs: LogEntry[] = [];
  private userId: number | undefined;
  private isEnabled = true;

  constructor() {
    this.sessionId = this.initializeSession();
    this.setupErrorHandlers();
    this.createLogUI(); // Инициализируем UI интерфейс

    // Автоматическая очистка логов предыдущей сессии
    this.clearPreviousSessionLogs();
  }

  /**
   * Инициализация сессии логгера
   */
  private initializeSession(): string {
    // Получаем ID пользователя из Telegram если доступен
    const telegramUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    this.userId = telegramUserId;
    const sessionId = generateSessionId(this.userId);
    
    console.log(`🚀 TgStyle Logger v2.0 инициализирован. Session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Настройка автоматических обработчиков ошибок
   */
  private setupErrorHandlers(): void {
    // Перехват JavaScript ошибок
    window.addEventListener('error', (event) => {
      this.error('JavaScript Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    // Перехват необработанных промисов
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason,
        stack: event.reason?.stack,
      });
    });

    // Автоматическая отправка логов при закрытии приложения
    window.addEventListener('beforeunload', () => {
      this.flushSync();
    });

    window.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.flush();
      }
    });
  }

  /**
   * Создание лог записи
   */
  private createLogEntry(level: LogLevel, message: string, data?: any): LogEntry {
    const timestamp = new Date().toISOString();
    const timeFormatted = formatTimestamp(timestamp);
    
    // Получаем информацию о вызывающем коде
    const stack = new Error().stack;
    let caller = 'Unknown';
    
    if (stack) {
      const stackLines = stack.split('\n');
      // Ищем первую строку, которая не относится к логгеру
      for (let i = 3; i < stackLines.length && i < 8; i++) {
        const line = stackLines[i];
        if (line && !line.includes('Logger') && !line.includes('createLogEntry')) {
          const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
                       line.match(/at\s+(.+?):(\d+):(\d+)/);
          if (match) {
            const funcName = match[1] || 'Anonymous';
            const fileName = (match[2] || match[1] || '').split('/').pop();
            const lineNum = match[3] || match[2] || 'Unknown';
            caller = `${funcName} in ${fileName}:${lineNum}`;
            break;
          }
        }
      }
    }

    const logEntry: LogEntry = {
      level,
      message: `[${timeFormatted}] [${caller}] ${message}`,
      data,
      timestamp,
      sessionId: this.sessionId,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    return logEntry;
  }

  /**
   * Вывод лога в консоль и сохранение
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.isEnabled) return;

    const logEntry = this.createLogEntry(level, message, data);
    this.logs.push(logEntry);

    // Выводим в консоль браузера
    const consoleMethod = console[level] || console.log;
    const consoleMessage = `[${level.toUpperCase()}] ${logEntry.message}`;
    
    if (data) {
      consoleMethod(consoleMessage, data);
    } else {
      consoleMethod(consoleMessage);
    }

    // Отправляем на сервер если накопилось много логов
    if (this.logs.length >= LOGGING_CONFIG.MAX_LOGS_IN_MEMORY) {
      this.flush();
    }
  }

  /**
   * Debug уровень логирования
   */
  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  /**
   * Info уровень логирования
   */
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  /**
   * Warning уровень логирования
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  /**
   * Error уровень логирования
   */
  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  /**
   * Асинхронная отправка логов на сервер
   */
  async flush(): Promise<void> {
    if (this.logs.length === 0) return;

    const logsToSend = [...this.logs];
    this.logs = []; // Очищаем буфер

    try {
      const response = await fetch(`${API_URL}/log-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: safeJsonStringify({
          sessionId: this.sessionId,
          logs: logsToSend,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          appVersion: '2.0.0',
        }),
        signal: AbortSignal.timeout(TIMEOUTS.LOG_REQUEST),
      });

      if (response.ok) {
        console.log(`✅ Отправлено ${logsToSend.length} логов на сервер`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('⚠️ Ошибка отправки логов:', error);
      // Возвращаем логи обратно в буфер
      this.logs.unshift(...logsToSend);
    }
  }

  /**
   * Синхронная отправка логов (для beforeunload)
   */
  private flushSync(): void {
    if (this.logs.length === 0) return;

    try {
      const payload = safeJsonStringify({
        sessionId: this.sessionId,
        logs: this.logs,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        appVersion: '2.0.0',
      });

      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(`${API_URL}/log-error`, blob);
      
      if (sent) {
        console.log(`📤 Отправлено ${this.logs.length} логов через sendBeacon`);
        this.logs = [];
      }
    } catch (error) {
      console.error('❌ Ошибка синхронной отправки логов:', error);
    }
  }

  /**
   * Получение статистики логгера
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      logsInMemory: this.logs.length,
      isEnabled: this.isEnabled,
      userId: this.userId,
      isTelegramMiniApp: !!window.Telegram?.WebApp,
    };
  }

  /**
   * Включение/выключение логгера
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Очистка логов
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Очистка логов предыдущей сессии (вызывается при запуске приложения)
   */
  clearPreviousSessionLogs(): void {
    const previousLogsCount = this.logs.length;
    this.clear();
    this.info('Previous session logs cleared', {
      previousLogsCount,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Получение всех логов
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Создание UI интерфейса для просмотра логов
   */
  createLogUI(): void {
    // Создаем кнопку просмотра логов
    const viewLogsBtn = document.createElement('button');
    viewLogsBtn.id = 'view-logs-btn';
    viewLogsBtn.textContent = '🔍 Логи';
    viewLogsBtn.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 8px 12px;
      background-color: rgba(0, 0, 0, 0.6);
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      z-index: 100000; /* Очень высокий z-index, чтобы быть выше всех превью */
      cursor: pointer;
      pointer-events: auto; /* Убеждаемся что клики работают */
    `;

    // Создаем модальное окно
    const logModal = document.createElement('div');
    logModal.id = 'log-modal';
    logModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.9);
      z-index: 100001; /* Еще выше чем кнопка */
      display: none;
      flex-direction: column;
      color: white;
      font-family: monospace;
      padding: 10px;
    `;

    // Заголовок модального окна
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = 'Журнал логов TgStyle';
    modalTitle.style.margin = '0';

    // Контейнер для логов
    const logContent = document.createElement('div');
    logContent.id = 'log-content';
    logContent.style.cssText = `
      flex: 1;
      overflow-y: auto;
      background-color: rgba(0, 0, 0, 0.5);
      padding: 10px;
      border-radius: 4px;
      font-size: 11px;
      white-space: pre-wrap;
    `;

    // Панель инструментов
    const logToolbar = document.createElement('div');
    logToolbar.style.cssText = `
      display: flex;
      justify-content: flex-start;
      gap: 10px;
      margin-top: 10px;
    `;

    // Кнопки
    const copyLogsBtn = document.createElement('button');
    copyLogsBtn.textContent = 'Копировать';
    copyLogsBtn.className = 'log-btn';

    const sendLogsBtn = document.createElement('button');
    sendLogsBtn.textContent = 'Отправить';
    sendLogsBtn.className = 'log-btn';

    const clearLogsBtn = document.createElement('button');
    clearLogsBtn.textContent = 'Очистить';
    clearLogsBtn.className = 'log-btn';

    const exitLogsBtn = document.createElement('button');
    exitLogsBtn.textContent = 'Выход';
    exitLogsBtn.className = 'log-btn';

    // Стили для кнопок
    const style = document.createElement('style');
    style.textContent = `
      .log-btn {
        padding: 6px 12px;
        background-color: #40a7e3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .log-btn:hover {
        background-color: #2c7db2;
      }
      .log-entry {
        margin-bottom: 4px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .log-info { color: #90caf9; }
      .log-debug { color: #80deea; }
      .log-warn { color: #ffcc80; }
      .log-error { color: #ef9a9a; }
    `;

    // Собираем структуру
    logToolbar.appendChild(copyLogsBtn);
    logToolbar.appendChild(sendLogsBtn);
    logToolbar.appendChild(clearLogsBtn);
    logToolbar.appendChild(exitLogsBtn);

    logModal.appendChild(modalTitle);
    logModal.appendChild(logContent);
    logModal.appendChild(logToolbar);

    document.head.appendChild(style);
    document.body.appendChild(viewLogsBtn);
    document.body.appendChild(logModal);

    // Обработчики событий
    viewLogsBtn.addEventListener('click', () => {
      this.updateLogDisplay();
      logModal.style.display = 'flex';
    });

    copyLogsBtn.addEventListener('click', () => {
      const logText = this.formatLogsForExport();
      navigator.clipboard.writeText(logText)
        .then(() => alert('Логи скопированы в буфер обмена'))
        .catch(err => alert('Ошибка копирования: ' + err.message));
    });

    sendLogsBtn.addEventListener('click', () => {
      this.manualSave();
    });

    clearLogsBtn.addEventListener('click', () => {
      if (confirm('Очистить все логи?')) {
        this.logs = [];
        this.updateLogDisplay();
      }
    });

    exitLogsBtn.addEventListener('click', () => {
      logModal.style.display = 'none';
    });
  }

  /**
   * Обновление отображения логов в UI
   */
  updateLogDisplay(): void {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    logContent.innerHTML = '';

    if (this.logs.length === 0) {
      logContent.innerHTML = '<em>Нет записей в журнале</em>';
      return;
    }

    const logsToShow = this.logs.slice(-500); // Показываем до 500 последних

    logsToShow.forEach(log => {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry log-${log.level}`;

      logEntry.innerHTML = `
        <strong>[${this.formatTimestamp(log.timestamp)}]</strong>
        <span class="log-level">[${log.level.toUpperCase()}]</span>
        <span class="log-message">${log.message}</span>
        ${log.data ? `<br><small class="log-data">${safeJsonStringify(log.data)}</small>` : ''}
      `;

      logContent.appendChild(logEntry);
    });

    // Прокручиваем к последнему логу
    logContent.scrollTop = logContent.scrollHeight;
  }

  /**
   * Форматирование timestamp для отображения
   */
  private formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toTimeString().split(' ')[0] + '.' + date.getMilliseconds().toString().padStart(3, '0');
  }

  /**
   * Форматирование логов для экспорта
   */
  formatLogsForExport(): string {
    return this.logs.map(log => {
      const timeFormatted = this.formatTimestamp(log.timestamp);
      return `[${timeFormatted}] [${log.level.toUpperCase()}] ${log.message}${log.data ? '\n  Данные: ' + safeJsonStringify(log.data) : ''}`;
    }).join('\n');
  }

  /**
   * Ручное сохранение логов с Telegram UI
   */
  async manualSave(): Promise<void> {
    try {
      this.info('Manual Save Started');

      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;

        // Показываем прогресс
        tg.MainButton.setText('💾 Сохранение...');
        tg.MainButton.showProgress();

        // Сохраняем логи
        await this.flush();

        // Показываем успех
        tg.MainButton.setText('✅ Логи сохранены');
        tg.MainButton.hideProgress();
        tg.showAlert('Логи успешно сохранены на сервере!');

        // Возвращаем кнопку в исходное состояние
        setTimeout(() => {
          tg.MainButton.setText('💾 Сохранить логи');
        }, 3000);

      } else {
        // Для браузера
        await this.flush();
        alert('Логи сохранены!');
      }

      this.info('Manual Save Completed Successfully');

    } catch (error) {
      console.error('Manual Save Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error('Manual Save Failed', { error: errorMessage });

      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.MainButton.setText('❌ Ошибка сохранения');
        tg.MainButton.hideProgress();
        tg.showAlert('Ошибка сохранения логов: ' + errorMessage);
      } else {
        alert('Ошибка сохранения логов: ' + errorMessage);
      }
    }
  }
}

// Создаем глобальный экземпляр логгера
export const logger = new TgStyleLogger();

// Совместимость с старым API
export function appLogger(message: string, level: LogLevel = 'info', data?: any): void {
  logger[level](message, data);
}

// Устаревший объект Logger для совместимости
const LegacyLogger = {
  init() {
    return logger;
  },
  log(message: string, level: LogLevel = 'info', data?: any) {
    logger[level](message, data);
  },
  saveLogs() {
    // Логи автоматически сохраняются в новом логгере
  },
  clearLogs() {
    logger.clear();
  },
  sendLogsToServer() {
    return logger.manualSave();
  },
  updateLogDisplay() {
    return logger.updateLogDisplay();
  },
  formatLogsForExport() {
    return logger.formatLogsForExport();
  }
};

// Экспортируем в глобальную область для совместимости
declare global {
  interface Window {
    appLogger: typeof appLogger;
    clientLogger: TgStyleLogger;
    Logger: typeof LegacyLogger;
  }
}

window.appLogger = appLogger;
window.clientLogger = logger;
window.Logger = LegacyLogger;

export default logger;
