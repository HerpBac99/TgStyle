/**
 * Улучшенный логгер для TgStyle с перехватом console и Telegram интеграцией
 * Вдохновлено LoggerService и ClientLogger примерами
 */

import type { Logger, LogEntry, LogLevel } from '@/types/index';
import {
  API_URL,
  LOGGING_CONFIG,
  TIMEOUTS
} from '@/utils/constants';
import {
  generateSessionId,
  formatTimestamp,
  safeJsonStringify
} from '@/utils/helpers';

// Глобальные декларации для лучшей интеграции
declare global {
  interface Window {
    appLogger: typeof appLogger;
    clientLogger: TgStyleLogger;
    Logger: any;
  }
}

class TgStyleLogger implements Logger {
  private sessionId: string;
  private logs: LogEntry[] = [];
  private userId: number | undefined;
  private isEnabled = true;
  private isLoggingInProgress = false; // Защита от рекурсии

  // Сохраняем оригинальные методы консоли
  private originalConsoleLog: typeof console.log;
  private originalConsoleError: typeof console.error;
  private originalConsoleWarn: typeof console.warn;
  private originalConsoleDebug: typeof console.debug;

  constructor() {
    // Сохраняем оригинальные методы консоли
    this.originalConsoleLog = console.log.bind(console);
    this.originalConsoleWarn = console.warn.bind(console);
    this.originalConsoleError = console.error.bind(console);
    this.originalConsoleDebug = console.debug.bind(console);

    this.sessionId = this.initializeSession();
    this.setupErrorHandlers();
    this.setupConsoleInterception(); // Перехват console методов
    this.createLogUI(); // Инициализируем UI интерфейс
    this.setupAutoFlush(); // Автоматическая отправка

    // Автоматическая очистка логов предыдущей сессии
    this.clearPreviousSessionLogs();

    // Устанавливаем глобальный логгер для совместимости
    this.setupGlobalLogger();
  }

  /**
   * Инициализация сессии логгера
   */
  private initializeSession(): string {
    // Получаем ID пользователя из Telegram если доступен
    const telegramUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    this.userId = telegramUserId;
    const sessionId = generateSessionId(this.userId);
    
    console.log(`TgStyle Logger v2.0 инициализирован. Session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Настройка перехвата методов console
   */
  private setupConsoleInterception(): void {
    // Определяем метод-перехватчик
    const createInterceptor = (originalMethod: Function, level: LogLevel) => {
      return (...args: any[]) => {
        // Проверяем, не происходит ли рекурсия
        if (this.isLoggingInProgress) {
          originalMethod.apply(console, args);
          return;
        }

        // Первый аргумент обычно является сообщением
        const message = args[0];

        // Остальные аргументы считаем данными
        let data: any = undefined;
        if (args.length > 1) {
          // Если есть только один дополнительный аргумент и это объект, используем его напрямую
          data = args.length === 2 && typeof args[1] === 'object' ? args[1] : args.slice(1);
        }

        // Логируем через наш логгер
        this.log(level, message, data);
      };
    };

    // Заменяем стандартные методы console нашими перехватчиками
    console.log = createInterceptor(this.originalConsoleLog, 'info');
    console.debug = createInterceptor(this.originalConsoleDebug, 'debug');
    console.warn = createInterceptor(this.originalConsoleWarn, 'warn');
    console.error = createInterceptor(this.originalConsoleError, 'error');
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
  }

  /**
   * Настройка автоматической отправки логов
   */
  private setupAutoFlush(): void {
    // Простая логика: сохраняем логи только при закрытии страницы
    // pagehide - самый надежный обработчик для мобильных и Telegram

    window.addEventListener('pagehide', () => {
      if (this.logs.length > 0) {
        // Тихая отправка при закрытии страницы
        this.flushSync(true);
      }
    });
  }

  /**
   * Установка глобального логгера для совместимости
   */
  private setupGlobalLogger(): void {
    window.appLogger = {
      info: (message: string, data?: any) => this.info(message, data),
      debug: (message: string, data?: any) => this.debug(message, data),
      warn: (message: string, data?: any) => this.warn(message, data),
      error: (message: string, data?: any) => this.error(message, data),
    };

    window.clientLogger = this;
  }

  /**
   * Получение call stack для клиентского логирования
   */
  private getCallStack(): { function: string; file: string; line: string; fullStack: string } {
    try {
      const stack = new Error().stack;
      if (stack) {
        const lines = stack.split('\n');

        // В production режиме stack trace может быть укороченным
        // Ищем первую строку которая не относится к логгеру
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]?.trim();
          if (!line) continue;

          // Пропускаем строки самого логгера
          if (line.includes('Logger') ||
              line.includes('getCallStack') ||
              line.includes('createLogEntry') ||
              line.includes('log(') ||
              line === 'Error') {
            continue;
          }

          // Ищем строки с "at" - это call stack entries
          if (line.startsWith('at ')) {
            // Упрощенный парсинг для production режима
            // Убираем "at " в начале
            const callInfo = line.substring(3);

            // Разбираем оставшуюся часть
            let funcName = 'Anonymous';
            let fileName = 'Unknown';
            let lineNum = '0';

            // Ищем скобки - это указывает на формат "functionName (file.js:123:456)"
            const bracketStart = callInfo.indexOf('(');
            const bracketEnd = callInfo.lastIndexOf(')');

            if (bracketStart !== -1 && bracketEnd !== -1 && bracketEnd > bracketStart) {
              // Есть скобки - формат "functionName (file.js:123:456)"
              funcName = callInfo.substring(0, bracketStart).trim();
              const location = callInfo.substring(bracketStart + 1, bracketEnd);

              // Разбираем location
              const colonIndex = location.lastIndexOf(':');
              if (colonIndex !== -1) {
                const fileAndLine = location.substring(0, colonIndex);
                const linePart = location.substring(colonIndex + 1);

                // Разбираем file:line
                const lastColon = fileAndLine.lastIndexOf(':');
                if (lastColon !== -1) {
                  fileName = fileAndLine.substring(0, lastColon);
                  lineNum = fileAndLine.substring(lastColon + 1);
                } else {
                  fileName = fileAndLine;
                  lineNum = linePart;
                }

                // Очищаем имя файла
                if (fileName.includes('/')) {
                  fileName = fileName.split('/').pop() || 'Unknown';
                }
                if (fileName.includes('?')) {
                  fileName = fileName.split('?')[0] ?? 'Unknown';
                }
                if (fileName.endsWith('.js')) {
                  fileName = fileName.slice(0, -3);
                }
              }
            } else {
              // Нет скобок - формат "file.js:123:456"
              const colonIndex = callInfo.lastIndexOf(':');
              if (colonIndex !== -1) {
                fileName = callInfo.substring(0, colonIndex);
                lineNum = callInfo.substring(colonIndex + 1);

                // Очищаем имя файла
                if (fileName.includes('/')) {
                  fileName = fileName.split('/').pop() || 'Unknown';
                }
                if (fileName.includes('?')) {
                  fileName = fileName.split('?')[0] ?? 'Unknown';
                }
                if (fileName.endsWith('.js')) {
                  fileName = fileName.slice(0, -3);
                }
              }
            }

            // Очищаем имя функции
            if (funcName && funcName.includes('<')) {
              funcName = funcName.split('<')[0]?.trim() || 'Anonymous';
            }

            return {
              function: funcName,
              file: fileName,
              line: lineNum,
              fullStack: lines.slice(Math.max(0, i-1), Math.min(lines.length, i+2)).join(' | ')
            };
          }
        }

        // Если ничего не нашли, попробуем взять первую подходящую строку
        const relevantLine = lines.find(line =>
          line && line.trim().startsWith('at ') &&
          !line.includes('Logger') && !line.includes('Error')
        );

        if (relevantLine) {
          return {
            function: 'External',
            file: 'Unknown',
            line: '0',
            fullStack: relevantLine.trim()
          };
        }
      }
    } catch (e) {
      // Игнорируем ошибки получения stack trace
    }

    return {
      function: 'Unknown',
      file: 'Unknown',
      line: 'Unknown',
      fullStack: 'Stack not available'
    };
  }

  /**
   * Создание лог записи
   */
  private createLogEntry(level: LogLevel, message: string, data?: any): LogEntry {
    const timestamp = new Date().toISOString();
    const timeFormatted = formatTimestamp(timestamp);

    // Получаем информацию о вызывающем коде
    const callStack = this.getCallStack();
    const caller = `${callStack.function} in ${callStack.file}:${callStack.line}`;

    const logEntry: LogEntry = {
      level,
      message: `[${timeFormatted}] ${message}`,
      data,
      timestamp,
      sessionId: this.sessionId,
      userAgent: navigator.userAgent,
      url: window.location.href,
      caller,
    };

    return logEntry;
  }

  /**
   * Вывод лога в консоль и сохранение
   */
  private log(level: LogLevel, message: string, data?: any): void {
    // Проверка на рекурсию
    if (this.isLoggingInProgress) {
      this.originalConsoleWarn('[LoggerService] Recursive logging detected:', message);
      return;
    }

    if (!this.isEnabled) return;

    // FILTER: Исключаем шумные Telegram.WebView события которые загромождают логи
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

    this.isLoggingInProgress = true;

    try {
      const logEntry = this.createLogEntry(level, message, data);

      // Выводим в консоль браузера
      const consoleMessage = `[${level.toUpperCase()}] ${logEntry.message}`;

      // Подготовка данных для вывода в консоль
      const outputData = data !== undefined ? (Array.isArray(data) ? data : [data]) : [];

      // Используем прямые ссылки на нативные методы консоли
      switch (level) {
        case 'error':
          this.originalConsoleError(consoleMessage, ...outputData);
          break;
        case 'warn':
          this.originalConsoleWarn(consoleMessage, ...outputData);
          break;
        case 'debug':
          this.originalConsoleDebug(consoleMessage, ...outputData);
          break;
        default:
          this.originalConsoleLog(consoleMessage, ...outputData);
      }

      this.logs.push(logEntry);

      // Ограничиваем количество логов в памяти
      if (this.logs.length >= LOGGING_CONFIG.MAX_LOGS_IN_MEMORY) {
        // Удаляем старые логи
        this.logs.splice(0, Math.floor(LOGGING_CONFIG.MAX_LOGS_IN_MEMORY / 2));
      }
    } finally {
      this.isLoggingInProgress = false;
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
   * Отправка данных с повторными попытками в случае ошибки
   */
  private async sendWithRetry(url: string, data: any, retries: number): Promise<any> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeJsonStringify(data),
        signal: AbortSignal.timeout(TIMEOUTS.LOG_REQUEST)
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      const delay = 2 ** (3 - retries) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      this.warn(`Retrying to send logs... (${retries - 1} attempts left)`);
      return this.sendWithRetry(url, data, retries - 1);
    }
  }

  /**
   * Асинхронная отправка логов на сервер
   */
  async flush(): Promise<void> {
    if (this.logs.length === 0) return;

    const logsToSend = [...this.logs];
    // НЕ очищаем буфер - логи остаются в рамках сессии

    // Сбор данных о пользователе и приложении
    let telegramUserData: any = null;
    if (window.Telegram?.WebApp?.initDataUnsafe) {
      telegramUserData = window.Telegram.WebApp.initDataUnsafe.user;
    }

    let finalUsername = 'unknown_user';
    if (telegramUserData?.username) {
      finalUsername = telegramUserData.username;
    } else if (telegramUserData?.first_name) {
      finalUsername = telegramUserData.first_name;
    } else if (telegramUserData?.id) {
      finalUsername = `Player_${telegramUserData.id}`;
    }

    const logsData = {
      sessionId: this.sessionId,
      logs: logsToSend,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      appVersion: '2.0.0',
      userData: telegramUserData,
      userId: telegramUserData?.id,
      username: telegramUserData?.username || finalUsername,
      isTelegramMiniApp: !!window.Telegram?.WebApp
    };

    // Тихая отправка - без логирования
    try {
      const data = await this.sendWithRetry(`${API_URL}/log-client`, logsData, 3);
      // Тихий успех - логи уже сохранены на сервере
      return data;
    } catch (error) {
      this.error('Failed to send logs to server after multiple retries', error as Error);
      // При ошибке логи остаются в массиве для следующей попытки
      throw error; // Пробрасываем ошибку выше
    }
  }

  /**
   * Синхронная отправка логов (для beforeunload и скрытия)
   */
  private flushSync(closeApp: boolean = false): void {
    if (this.logs.length === 0) return;

    try {
      // Сбор данных о пользователе
      let telegramUserData: any = null;
      if (window.Telegram?.WebApp?.initDataUnsafe) {
        telegramUserData = window.Telegram.WebApp.initDataUnsafe.user;
      }

      let finalUsername = 'unknown_user';
      if (telegramUserData?.username) {
        finalUsername = telegramUserData.username;
      } else if (telegramUserData?.first_name) {
        finalUsername = telegramUserData.first_name;
      } else if (telegramUserData?.id) {
        finalUsername = `Player_${telegramUserData.id}`;
      }

      const payload = safeJsonStringify({
        sessionId: this.sessionId,
        logs: this.logs,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        appVersion: '2.0.0',
        userData: telegramUserData,
        userId: telegramUserData?.id,
        username: telegramUserData?.username || finalUsername,
        closeApp
      });

      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(`${API_URL}/log-client`, blob);

      if (sent) {
        // Тихий успех - логи отправлены, но остаются в сессии
      } else {
        // Тихая ошибка - sendBeacon не удался, логи будут потеряны
      }
    } catch (error) {
      // Тихая обработка ошибок при отправке логов
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
    // Проверяем, что пользователь авторизован как Herp_Bac9
    if (this.userId !== 568613134
      //&& this.userId !== 251053908
    ) {
      console.log('Логи доступны только для Herp_Bac9 (ID: 251053908)');
      return; // Не создаем UI для других пользователей
    }

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
      font-family: 'Manrope', sans-serif;
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
        .then(() => this.info('Logs copied to clipboard'))
        .catch(err => this.error('Copy error', { error: err.message }));
    });

    sendLogsBtn.addEventListener('click', () => {
      this.manualSave();
    });

    clearLogsBtn.addEventListener('click', () => {
      // Очищаем логи без подтверждения
      this.logs = [];
      this.updateLogDisplay();
      this.info('Logs cleared');
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
      // Silent mode - не логируем начало сохранения

      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;

        // Показываем индикатор загрузки
        tg.MainButton.setText('💾 Сохранение...');
        tg.MainButton.showProgress();

        // Принудительно сохраняем все логи
        await this.flush().catch(err => {
          this.originalConsoleError('Ошибка flushLogs в manualSave:', err);
          throw err;
        });

        // Показываем успех
        tg.MainButton.setText('✅ Логи сохранены');
        tg.MainButton.hideProgress();
        tg.MainButton.color = '#4CAF50'; // Зеленый цвет
        tg.showAlert('Логи успешно сохранены на сервере!');

        // Возвращаем кнопку в исходное состояние через 3 секунды
        setTimeout(() => {
          tg.MainButton.setText('💾 Сохранить логи');
          tg.MainButton.color = '#FF6B6B';
        }, 3000);

      } else {
        // Для браузера просто сохраняем
        await this.flush().catch(err => {
          this.originalConsoleError('Ошибка flushLogs в браузере:', err);
          throw err;
        });
        alert('Логи сохранены!');
      }

      // Silent mode - не логируем успешное завершение

    } catch (error) {
      this.originalConsoleError('Manual Save Error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error('Manual Save Failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.MainButton.setText('❌ Ошибка сохранения');
        tg.MainButton.hideProgress();
        tg.MainButton.color = '#F44336'; // Красный цвет для ошибки
        tg.showAlert('Ошибка сохранения логов: ' + errorMessage);

        // Возвращаем кнопку в исходное состояние через 3 секунды
        setTimeout(() => {
          tg.MainButton.setText('💾 Сохранить логи');
          tg.MainButton.color = '#FF6B6B';
        }, 3000);
      } else {
        alert('Ошибка сохранения логов: ' + errorMessage);
      }
    }
  }
}

// Создаем глобальный экземпляр логгера
export const logger = new TgStyleLogger();

// Основной API логгера
export const appLogger = {
  info: (message: string, data?: any) => logger.info(message, data),
  debug: (message: string, data?: any) => logger.debug(message, data),
  warn: (message: string, data?: any) => logger.warn(message, data),
  error: (message: string, data?: any) => logger.error(message, data),
};

// Экспортируем в глобальную область
window.appLogger = appLogger;
window.clientLogger = logger;

export default logger;
