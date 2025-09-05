// Константы для системы логирования
const LOG_STORAGE_KEY = 'tgstyle_app_logs';
const MAX_STORED_LOGS = 1000;
// Глобальная переменная apiUrl, используемая всем приложением
window.apiUrl = 'https://tgstyle.flappy.crazedns.ru/api';

// Система логирования
const Logger = {
    logs: [],
    
    // Инициализация системы логирования
    init() {
        // Загружаем логи из localStorage, если они существуют
        try {
            const storedLogs = localStorage.getItem(LOG_STORAGE_KEY);
            if (storedLogs) {
                this.logs = JSON.parse(storedLogs);
                console.log(`Загружено ${this.logs.length} ранее сохраненных логов`);
            }
        } catch (error) {
            console.error('Ошибка при загрузке логов из localStorage:', error);
        }
        
        // Создаем UI для просмотра логов
        this.createLogUI();
        
        // Устанавливаем перехватчик для необработанных ошибок
        window.addEventListener('error', (event) => {
            this.log('Необработанная ошибка: ' + event.message, 'error', {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null
            });
            this.saveLogs();
        });
        
        console.log('Система логирования инициализирована');
        return this;
    },
    
    // Создание интерфейса для просмотра логов
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
        modalTitle.textContent = 'Журнал логов приложения';
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
            this.sendLogsToServer();
        });
        
        clearLogsBtn.addEventListener('click', () => {
            if (confirm('Очистить все логи?')) {
                this.clearLogs();
                this.updateLogDisplay();
            }
        });
        
        exitLogsBtn.addEventListener('click', () => {
            logModal.style.display = 'none';
        });
    },
    
    // Вывод логов в модальное окно
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
            
            // Форматируем лог
            logEntry.innerHTML = `
                <strong>[${log.timestamp}]</strong> 
                <span class="log-level">[${log.level.toUpperCase()}]</span> 
                <span class="log-message">${log.message}</span>
                <br><small class="log-caller">${log.caller}</small>
                ${log.data ? `<br><small class="log-data">${log.data}</small>` : ''}
            `;
            
            logContent.appendChild(logEntry);
        });
        
        // Прокручиваем к последнему логу
        logContent.scrollTop = logContent.scrollHeight;
    },
    
    // Форматирование логов для экспорта
    formatLogsForExport() {
        return this.logs.map(log => {
            return `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message} (${log.caller})${log.data ? '\n  Данные: ' + log.data : ''}`;
        }).join('\n');
    },
    
    // Сохранение логов в localStorage
    saveLogs() {
        try {
            // Обрезаем логи, если их слишком много
            if (this.logs.length > MAX_STORED_LOGS) {
                this.logs = this.logs.slice(-MAX_STORED_LOGS);
            }
            
            localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
        } catch (error) {
            console.error('Ошибка при сохранении логов в localStorage:', error);
        }
    },
    
    // Очистка логов
    clearLogs() {
        this.logs = [];
        this.saveLogs();
    },
    
    // Получение информации о вызывающей функции
    getCallerInfo() {
        try {
            const stackTrace = new Error().stack;
            const lines = stackTrace.split('\n');
            
            // Первая строка - это сам Error()
            // Вторая строка - это вызов текущего метода (log)
            // Третья строка - это вызов Logger.log или appLogger
            // Четвертая строка - это то, что нам нужно - вызывающая функция
            if (lines.length >= 4) {
                const callerLine = lines[3].trim();
                
                // Извлекаем имя функции и номер строки
                const functionMatch = callerLine.match(/at\s+([^\s]+)\s+\((.+):(\d+):(\d+)\)/);
                if (functionMatch) {
                    const [_, functionName, file, line, col] = functionMatch;
                    // Получаем только имя файла без пути
                    const fileName = file.split('/').pop();
                    return `${functionName} в ${fileName}:${line}`;
                }
                
                // Если не удалось извлечь по первому паттерну, пробуем другой паттерн
                const anonymousMatch = callerLine.match(/at\s+(.+):(\d+):(\d+)/);
                if (anonymousMatch) {
                    const [_, file, line, col] = anonymousMatch;
                    const fileName = file.split('/').pop();
                    return `${fileName}:${line}`;
                }
                
                // Возвращаем всю строку, если не удалось распарсить
                return callerLine.replace(/^\s*at\s+/, '');
            }
            
            return 'неизвестно';
        } catch (e) {
            return 'ошибка определения';
        }
    },
    
    // Основной метод логирования
    log(message, level = 'info', data = null, caller = null) {
        // Получаем информацию о вызывающей функции
        const callerInfo = caller || this.getCallerInfo();
        
        // Создаем метку времени
        const timestamp = new Date().toISOString();
        
        // Создаем объект лога
        const logEntry = {
            timestamp,
            level,
            message,
            caller: callerInfo,
            data: data ? JSON.stringify(data) : null
        };
        
        // Добавляем в массив логов
        this.logs.push(logEntry);
        
        // Логируем в консоль браузера
        const consoleMsg = `[${timestamp}] [${level.toUpperCase()}] ${message} (${callerInfo})`;
        switch (level) {
            case 'error':
                console.error(consoleMsg, data || '');
                break;
            case 'warn':
                console.warn(consoleMsg, data || '');
                break;
            case 'debug':
                console.debug(consoleMsg, data || '');
                break;
            default:
                console.log(consoleMsg, data || '');
        }
        
        // Сохраняем логи в localStorage
        this.saveLogs();
        
        return logEntry;
    },
    
    // Отправка логов на сервер
    sendLogsToServer() {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;
        
        // Показываем статус отправки
        const previousContent = logContent.innerHTML;
        logContent.innerHTML = '<div style="text-align: center; padding: 20px;">Отправка логов на сервер...</div>';
        
        // Собираем данные для отправки
        const logsData = {
            logs: this.logs,
            userAgent: navigator.userAgent,
            appVersion: '1.0.0', // Версия приложения
            timestamp: new Date().toISOString()
        };
        
        // Отправляем на сервер
        fetch(`${window.apiUrl}/log-error`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(logsData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ошибка: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                logContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #81c784;">Логи успешно отправлены на сервер!</div>';
                setTimeout(() => {
                    logContent.innerHTML = previousContent;
                }, 2000);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            logContent.innerHTML = `<div style="text-align: center; padding: 20px; color: #e57373;">Ошибка при отправке логов: ${error.message}</div>`;
            setTimeout(() => {
                logContent.innerHTML = previousContent;
            }, 3000);
        });
    }
};

/**
 * Функция-обёртка для совместимости с существующим кодом
 * Перенаправляет все вызовы appLogger в Logger.log
 */
function appLogger(message, level = 'info', data = null) {
    return Logger.log(message, level, data, 'appLogger');
}

// Экспортируем объект Logger и функцию appLogger
window.Logger = Logger;
window.appLogger = appLogger;
