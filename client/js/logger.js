/**
 * Клиентский логгер для TgStyle Mini App
 * Собирает логи на клиенте и отправляет их на сервер для сохранения
 */

// Глобальная переменная apiUrl, используемая всем приложением
window.apiUrl = 'https://tgstyle.flappy.crazedns.ru/api';

class ClientLogger {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.logs = [];
        this.maxLogsInMemory = 50; // Максимум логов в памяти перед отправкой
        this.isEnabled = true; // Всегда включено для TgStyle

        this.init();
    }

    /**
     * Инициализация логгера
     */
    init() {
        console.log(`TgStyle Client Logger инициализирован. Session ID: ${this.sessionId}`);

        // Логируем начало сессии
        this.info('Session Started', {
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            isTelegramMiniApp: !!window.Telegram?.WebApp,
            telegramVersion: window.Telegram?.WebApp?.version
        });

        this.setupTelegramFeatures();

        // Настраиваем автоматическую отправку логов
        this.setupAutoFlush();

        // Настраиваем обработчики событий
        this.setupEventHandlers();

        // Создаем UI для просмотра логов (для совместимости)
        this.createLogUI();

        return this;
    }

    /**
     * Генерация уникального ID сессии
     */
    generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);

        // Добавляем информацию о пользователе Telegram если доступна
        if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            const userId = window.Telegram.WebApp.initDataUnsafe.user.id;
            return `tgstyle_${userId}_${timestamp}_${random}`;
        }

        return `tgstyle_client_${timestamp}_${random}`;
    }

    /**
     * Настройка Telegram Mini App специфичных функций
     */
    setupTelegramFeatures() {
        if (!window.Telegram?.WebApp) return;

        const tg = window.Telegram.WebApp;

        // Настраиваем кнопку "Сохранить логи" в режиме разработки
        if (this.isEnabled) {
            // Настраиваем кнопку "Назад" для автосохранения
            tg.BackButton.show();
            tg.BackButton.onClick(() => {
                this.info('Back Button Pressed - Auto Saving Logs');
                this.flushLogs(true);
                // Даем время на отправку логов, затем закрываем
                setTimeout(() => {
                    tg.close();
                }, 500);
            });
        }
    }

    /**
     * Настройка отправки логов только при выходе из приложения
     */
    setupAutoFlush() {
        // Только отправка при выходе из приложения, без периодической отправки

        // Настройка для Telegram Mini App
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;

            // Отслеживаем событие потери фокуса (когда пользователь сворачивает Telegram)
            window.addEventListener('blur', () => {
                this.info('App Lost Focus - Saving Logs');
                this.flushLogs(true);
            });

            // Событие скрытия страницы
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.info('App Hidden - Saving Logs');
                    this.flushLogs(true);
                }
            });

            // Событие beforeunload (работает не всегда в Telegram)
            window.addEventListener('beforeunload', () => {
                this.info('App Beforeunload - Saving Logs');
                this.flushLogs(true);
            });

            // Событие pagehide (более надежное для мобильных)
            window.addEventListener('pagehide', () => {
                this.info('App Pagehide - Saving Logs');
                this.flushLogs(true);
            });
        } else {
            // Стандартные события для браузера
            window.addEventListener('beforeunload', () => {
                this.flushLogs(true);
            });

            // Убираем visibilitychange для браузера, чтобы не было автоматической отправки
            // document.addEventListener('visibilitychange', () => {
            //     if (document.hidden && this.logs.length > 0) {
            //         this.flushLogs();
            //     }
            // });
        }
    }

    /**
     * Настройка обработчиков событий для автоматического логирования
     */
    setupEventHandlers() {
        // Логируем ошибки JavaScript
        window.addEventListener('error', (event) => {
            this.error('JavaScript Error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });

        // Логируем необработанные промисы
        window.addEventListener('unhandledrejection', (event) => {
            this.error('Unhandled Promise Rejection', {
                reason: event.reason,
                stack: event.reason?.stack
            });
        });

        // Логируем клики по кнопкам
        document.addEventListener('click', (event) => {
            if (event.target.tagName === 'BUTTON' || event.target.classList.contains('button')) {
                this.info('Button Click', {
                    buttonText: event.target.textContent.trim(),
                    buttonId: event.target.id,
                    buttonClass: event.target.className
                });
            }
        });
    }

    /**
     * Получение call stack для клиентского логирования
     */
    getCallStack() {
        try {
            const stack = new Error().stack;
            if (stack) {
                const lines = stack.split('\n');
                // Ищем первую строку которая не относится к логгеру
                for (let i = 3; i < lines.length && i < 8; i++) {
                    const line = lines[i];
                    if (line && !line.includes('ClientLogger') && !line.includes('createLogEntry')) {
                        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
                        if (match) {
                            return {
                                function: match[1] || 'Anonymous',
                                file: match[2] ? match[2].split('/').pop() : 'Unknown',
                                line: match[3] || 'Unknown',
                                fullStack: lines.slice(1, 5).join(' | ')
                            };
                        }
                        // Альтернативный формат для старых браузеров
                        const altMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
                        if (altMatch) {
                            return {
                                function: 'Anonymous',
                                file: altMatch[1] ? altMatch[1].split('/').pop() : 'Unknown',
                                line: altMatch[2] || 'Unknown',
                                fullStack: lines.slice(1, 5).join(' | ')
                            };
                        }
                    }
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
    createLogEntry(level, message, data = {}) {
        if (!this.isEnabled) return;

        const now = new Date();
        const timestamp = now.toISOString();
        const timeFormatted = now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
        const callStack = this.getCallStack();

        // Формируем сообщение в формате [время]: [откуда вызван] сообщение
        const formattedMessage = `[${timeFormatted}]: [${callStack.function} in ${callStack.file}:${callStack.line}] ${message}`;

        const logEntry = {
            sessionId: this.sessionId,
            level,
            message: formattedMessage,
            originalMessage: message,
            data,
            callStack,
            timestamp,
            url: window.location.href,
            userAgent: navigator.userAgent
        };

        // Добавляем в локальный массив
        this.logs.push(logEntry);

        // Выводим в консоль браузера с форматированием
        const consoleMethod = console[level] || console.log;
        consoleMethod(`[${level.toUpperCase()}] ${formattedMessage}`, data);

        // Отправляем если накопилось много логов
        if (this.logs.length >= this.maxLogsInMemory) {
            this.flushLogs();
        }
    }

    /**
     * Логирование уровня DEBUG
     */
    debug(message, data = {}) {
        this.createLogEntry('debug', message, data);
    }

    /**
     * Логирование уровня INFO
     */
    info(message, data = {}) {
        this.createLogEntry('info', message, data);
    }

    /**
     * Логирование уровня WARN
     */
    warn(message, data = {}) {
        this.createLogEntry('warn', message, data);
    }

    /**
     * Логирование уровня ERROR
     */
    error(message, data = {}) {
        this.createLogEntry('error', message, data);
    }

    /**
     * Логирование пользовательских действий
     */
    logUserAction(action, data = {}) {
        this.info(`User Action: ${action}`, data);
    }

    /**
     * Логирование API запросов
     */
    logApiRequest(method, url, status, duration, data = {}) {
        this.info('API Request', {
            method,
            url,
            status,
            duration,
            ...data
        });
    }

    /**
     * Отправка логов на сервер
     */
    async flushLogs(sync = false) {
        if (!this.isEnabled || this.logs.length === 0) return;

        const logsToSend = [...this.logs];
        this.logs = []; // Очищаем локальный массив

        const payload = {
            sessionId: this.sessionId,
            logs: logsToSend,
            timestamp: new Date().toISOString()
        };

        try {
            if (sync) {
                // Синхронная отправка для события beforeunload
                // sendBeacon требует Blob с правильным Content-Type
                const blob = new Blob([JSON.stringify(payload)], {
                    type: 'application/json'
                });
                const sent = navigator.sendBeacon(`${window.apiUrl}/log-error`, blob);
                if (!sent) {
                    console.warn('sendBeacon failed, возвращаем логи в очередь');
                    this.logs.unshift(...logsToSend);
                } else {
                    console.log(`Отправлено ${logsToSend.length} логов через sendBeacon`);
                }
            } else {
                // Асинхронная отправка
                const response = await fetch(`${window.apiUrl}/log-error`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                console.log(`✅ Отправлено ${logsToSend.length} логов на сервер:`, result);
            }
        } catch (error) {
            console.error('❌ Ошибка отправки логов:', error);
            // Возвращаем логи обратно в массив при ошибке
            this.logs.unshift(...logsToSend);
            throw error; // Пробрасываем ошибку выше для обработки
        }
    }

    /**
     * Принудительная отправка всех логов
     */
    async flush() {
        await this.flushLogs();
    }

    /**
     * Ручное сохранение логов (вызывается кнопкой в Telegram)
     */
    async manualSave() {
        try {
            this.info('Manual Save Started');
            if (window.Telegram?.WebApp) {
                const tg = window.Telegram.WebApp;

                // Показываем индикатор загрузки
                tg.MainButton.setText('💾 Сохранение...');
                tg.MainButton.showProgress();

                // Принудительно сохраняем все логи
                await this.flushLogs().catch(err => {
                    console.error('Ошибка flushLogs в manualSave:', err);
                    throw err;
                });

                // Показываем успех
                tg.MainButton.setText('✅ Логи сохранены');
                tg.MainButton.hideProgress();
                tg.MainButton.color = '#4CAF50'; // Зеленый цвет

                // Показываем уведомление
                tg.showAlert('Логи успешно сохранены на сервере!');

                // Возвращаем кнопку в исходное состояние через 3 секунды
                setTimeout(() => {
                    tg.MainButton.setText('💾 Сохранить логи');
                    tg.MainButton.color = '#FF6B6B';
                }, 3000);

            } else {
                // Для браузера просто сохраняем
                await this.flushLogs().catch(err => {
                    console.error('Ошибка flushLogs в браузере:', err);
                    throw err;
                });
                alert('Логи сохранены!');
            }

            this.info('Manual Save Completed Successfully');

        } catch (error) {
            console.error('Manual Save Error:', error);
            this.error('Manual Save Failed', {
                error: error.message,
                stack: error.stack
            });

            if (window.Telegram?.WebApp) {
                const tg = window.Telegram.WebApp;
                tg.MainButton.setText('❌ Ошибка сохранения');
                tg.MainButton.hideProgress();
                tg.MainButton.color = '#F44336'; // Красный цвет для ошибки
                tg.showAlert('Ошибка сохранения логов: ' + error.message);

                // Возвращаем кнопку в исходное состояние через 3 секунды
                setTimeout(() => {
                    tg.MainButton.setText('💾 Сохранить логи');
                    tg.MainButton.color = '#FF6B6B';
                }, 3000);
            } else {
                alert('Ошибка сохранения логов: ' + error.message);
            }
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
            maxLogsInMemory: this.maxLogsInMemory,
            // flushInterval убрана - автоматическая отправка отключена
            isTelegramMiniApp: !!window.Telegram?.WebApp,
            telegramUser: window.Telegram?.WebApp?.initDataUnsafe?.user
        };
    }

    // Создание интерфейса для просмотра логов (упрощенная версия для совместимости)
    createLogUI() {
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
            z-index: 9999;
            cursor: pointer;
        `;
        
        // Создаем модальное окно для просмотра логов
        const logModal = document.createElement('div');
        logModal.id = 'log-modal';
        logModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: none;
            flex-direction: column;
            color: white;
            font-family: monospace;
            padding: 10px;
        `;
        
        // Создаем заголовок и кнопки управления
        const modalHeader = document.createElement('div');
        modalHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        `;
        
        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Журнал логов TgStyle';
        modalTitle.style.margin = '0';
        
        // Создаем контейнер для содержимого логов
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
        
        // Создаем панель инструментов для работы с логами
        const logToolbar = document.createElement('div');
        logToolbar.style.cssText = `
            display: flex;
            justify-content: flex-start;
            gap: 10px;
            margin-top: 10px;
        `;
        
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
        
        // Добавляем стиль для кнопок
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
        
        // Собираем структуру UI
        modalHeader.appendChild(modalTitle);
        
        logToolbar.appendChild(copyLogsBtn);
        logToolbar.appendChild(sendLogsBtn);
        logToolbar.appendChild(clearLogsBtn);
        logToolbar.appendChild(exitLogsBtn);
        
        logModal.appendChild(modalHeader);
        logModal.appendChild(logContent);
        logModal.appendChild(logToolbar);
        
        document.head.appendChild(style);
        document.body.appendChild(viewLogsBtn);
        document.body.appendChild(logModal);
        
        // События для кнопок
        viewLogsBtn.addEventListener('click', () => {
            this.updateLogDisplay();
            logModal.style.display = 'flex';
        });
        
        copyLogsBtn.addEventListener('click', () => {
            const logText = this.formatLogsForExport();
            navigator.clipboard.writeText(logText)
                .then(() => {
                    alert('Логи скопированы в буфер обмена');
                })
                .catch(err => {
                    console.error('Ошибка при копировании логов:', err);
                    alert('Не удалось скопировать логи: ' + err.message);
                });
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
     * Вывод логов в модальное окно
     */
    updateLogDisplay() {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;
        
        logContent.innerHTML = '';
        
        if (this.logs.length === 0) {
            logContent.innerHTML = '<em>Нет записей в журнале</em>';
            return;
        }
        
        const logsToShow = this.logs.slice(-500); // Показываем до 500 последних логов для производительности
        
        logsToShow.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${log.level}`;
            
            // Форматируем лог для отображения
            logEntry.innerHTML = `
                <strong>[${this.formatTimestamp(log.timestamp)}]</strong>
                <span class="log-level">[${log.level.toUpperCase()}]</span> 
                <span class="log-message">${log.originalMessage || log.message}</span>
                <br><small class="log-caller">${log.callStack ? `${log.callStack.function} in ${log.callStack.file}:${log.callStack.line}` : 'Unknown'}</small>
                ${log.data && Object.keys(log.data).length > 0 ? `<br><small class="log-data">${JSON.stringify(log.data)}</small>` : ''}
            `;
            
            logContent.appendChild(logEntry);
        });
        
        // Прокручиваем к последнему логу
        logContent.scrollTop = logContent.scrollHeight;
    }
    
    /**
     * Форматирование timestamp для отображения
     */
    formatTimestamp(isoString) {
        const date = new Date(isoString);
        return date.toTimeString().split(' ')[0] + '.' + date.getMilliseconds().toString().padStart(3, '0');
    }

    /**
     * Форматирование логов для экспорта
     */
    formatLogsForExport() {
        return this.logs.map(log => {
            const timeFormatted = this.formatTimestamp(log.timestamp);
            const caller = log.callStack ? `${log.callStack.function} in ${log.callStack.file}:${log.callStack.line}` : 'Unknown';
            return `[${timeFormatted}] [${log.level.toUpperCase()}] ${log.originalMessage || log.message} (${caller})${log.data && Object.keys(log.data).length > 0 ? '\n  Данные: ' + JSON.stringify(log.data) : ''}`;
        }).join('\n');
    }
}

// Создаем глобальный экземпляр логгера
window.clientLogger = new ClientLogger();

/**
 * Функции-обёртки для совместимости с существующим кодом
 * Перенаправляют все вызовы в новый ClientLogger
 */
function appLogger(message, level = 'info', data = null) {
    const dataObj = data ? { legacyData: data } : {};
    window.clientLogger.createLogEntry(level, message, dataObj);
    return window.clientLogger.logs[window.clientLogger.logs.length - 1];
}

// Устаревший объект Logger для совместимости
const Logger = {
    init() {
        return window.clientLogger;
    },
    log(message, level = 'info', data = null, caller = null) {
        const dataObj = data ? { legacyData: data, caller } : { caller };
        return window.clientLogger.createLogEntry(level, message, dataObj);
    },
    saveLogs() {
        // Логи автоматически сохраняются в новом логгере
    },
    clearLogs() {
        window.clientLogger.logs = [];
    },
    sendLogsToServer() {
        return window.clientLogger.manualSave();
    },
    updateLogDisplay() {
        return window.clientLogger.updateLogDisplay();
    },
    formatLogsForExport() {
        return window.clientLogger.formatLogsForExport();
    }
};

// Экспортируем для совместимости
window.Logger = Logger;
window.appLogger = appLogger;
