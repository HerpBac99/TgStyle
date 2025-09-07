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
   * Получение всех логов
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }
}

// Создаем глобальный экземпляр логгера
export const logger = new TgStyleLogger();

// Совместимость с старым API
export function appLogger(message: string, level: LogLevel = 'info', data?: any): void {
  logger[level](message, data);
}

// Экспортируем в глобальную область для совместимости
declare global {
  interface Window {
    appLogger: typeof appLogger;
    clientLogger: TgStyleLogger;
  }
}

window.appLogger = appLogger;
window.clientLogger = logger;

export default logger;
