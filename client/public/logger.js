// Максимальное количество хранимых логов в локальном хранилище
const MAX_STORED_LOGS = 500;

// Цвета логов для разных типов сообщений
const LOG_COLORS = {
  info: '#4CAF50',    // Зеленый для информационных сообщений
  warn: '#FF9800',    // Оранжевый для предупреждений
  error: '#F44336',   // Красный для ошибок
  debug: '#2196F3'    // Синий для отладочных сообщений
};

// Константы для логгера
const STORAGE_KEY = 'app_logs'; // Ключ для хранения логов в localStorage
const LOG_ERROR_API = 'api/log-error'; // Путь к API для отправки логов

// Класс для управления логированием
class Logger {
  constructor() {
    this.logs = [];
    this.logElement = null;
    this.clearButton = null;
    this.sendButton = null;
    this.initialized = false;
  }

  // Инициализация логгера, загрузка сохраненных логов
  async init() {
    if (this.initialized) return;
    
    try {
      const savedLogs = localStorage.getItem(STORAGE_KEY);
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
      }
      
      this.initialized = true;
      this.createLogUi();
      console.log('Логгер инициализирован успешно');
    } catch (err) {
      console.error('Ошибка при инициализации логгера:', err);
    }
  }

  // Создание UI для отображения логов
  createLogUi() {
    try {
      // Создаем контейнер для логов, если его еще нет
      if (!document.getElementById('logContainer')) {
        const logContainer = document.createElement('div');
        logContainer.id = 'logContainer';
        logContainer.style.display = 'none';
        logContainer.style.position = 'fixed';
        logContainer.style.bottom = '0';
        logContainer.style.left = '0';
        logContainer.style.right = '0';
        logContainer.style.maxHeight = '50vh';
        logContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        logContainer.style.color = 'white';
        logContainer.style.padding = '10px';
        logContainer.style.overflow = 'auto';
        logContainer.style.zIndex = '10000';
        logContainer.style.borderTop = '1px solid #444';
        logContainer.style.fontFamily = 'monospace';
        logContainer.style.fontSize = '12px';
        
        // Добавляем заголовок и кнопки управления
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '10px';
        
        const title = document.createElement('div');
        title.textContent = 'Логи приложения';
        title.style.fontWeight = 'bold';
        
        const buttonsContainer = document.createElement('div');
        
        // Кнопка очистки логов
        this.clearButton = document.createElement('button');
        this.clearButton.textContent = 'Очистить';
        this.clearButton.style.marginRight = '10px';
        this.clearButton.style.padding = '3px 8px';
        this.clearButton.style.backgroundColor = '#444';
        this.clearButton.style.color = 'white';
        this.clearButton.style.border = 'none';
        this.clearButton.style.borderRadius = '3px';
        this.clearButton.style.cursor = 'pointer';
        this.clearButton.onclick = () => this.clearLogs();
        
        // Кнопка отправки логов на сервер
        this.sendButton = document.createElement('button');
        this.sendButton.textContent = 'Отправить на сервер';
        this.sendButton.style.padding = '3px 8px';
        this.sendButton.style.backgroundColor = '#2196F3';
        this.sendButton.style.color = 'white';
        this.sendButton.style.border = 'none';
        this.sendButton.style.borderRadius = '3px';
        this.sendButton.style.cursor = 'pointer';
        this.sendButton.onclick = () => this.sendLogsToServer();
        
        // Создаем элемент для отображения логов
        this.logElement = document.createElement('div');
        this.logElement.id = 'logEntries';
        
        // Собираем структуру UI
        buttonsContainer.appendChild(this.clearButton);
        buttonsContainer.appendChild(this.sendButton);
        header.appendChild(title);
        header.appendChild(buttonsContainer);
        logContainer.appendChild(header);
        logContainer.appendChild(this.logElement);
        document.body.appendChild(logContainer);
        
        // Добавляем кнопку для показа/скрытия логов
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Логи';
        toggleButton.style.position = 'fixed';
        toggleButton.style.bottom = '10px';
        toggleButton.style.right = '10px';
        toggleButton.style.padding = '5px 10px';
        toggleButton.style.backgroundColor = '#333';
        toggleButton.style.color = 'white';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '5px';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.zIndex = '10001';
        toggleButton.onclick = () => {
          const isVisible = logContainer.style.display !== 'none';
          logContainer.style.display = isVisible ? 'none' : 'block';
          toggleButton.textContent = isVisible ? 'Логи' : 'Скрыть';
        };
        document.body.appendChild(toggleButton);
      }
      
      // Отображаем существующие логи
      this.renderLogs();
      
    } catch (err) {
      console.error('Ошибка при создании UI для логов:', err);
    }
  }

  // Отрисовка всех логов
  renderLogs() {
    if (!this.logElement) return;
    
    // Очищаем текущее содержимое
    this.logElement.innerHTML = '';
    
    // Отображаем логи в обратном порядке (новые сверху)
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const log = this.logs[i];
      const entry = document.createElement('div');
      entry.style.marginBottom = '5px';
      entry.style.borderLeft = `3px solid ${LOG_COLORS[log.type] || '#999'}`;
      entry.style.paddingLeft = '5px';
      entry.innerHTML = `<span style="color: #999;">[${log.timestamp}]</span> <span style="color: ${LOG_COLORS[log.type] || '#999'}">${log.type.toUpperCase()}</span>: ${log.message}`;
      
      this.logElement.appendChild(entry);
    }
  }

  // Функция логирования
  log(type, message, data = null) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        type,
        message,
        data,
        timestamp
      };
      
      // Добавляем новую запись в начало массива
      this.logs.push(logEntry);
      
      // Ограничиваем количество хранимых логов
      if (this.logs.length > MAX_STORED_LOGS) {
        this.logs = this.logs.slice(-MAX_STORED_LOGS);
      }
      
      // Сохраняем логи в localStorage
      this.saveLogs();
      
      // Отображаем в UI, если он создан
      if (this.logElement) {
        this.renderLogs();
      }
      
      // Дублируем важные логи в консоль
      if (type === 'error') {
        console.error(`[${timestamp}] ${message}`, data);
      } else if (type === 'warn') {
        console.warn(`[${timestamp}] ${message}`, data);
      }
      
      return logEntry;
    } catch (err) {
      console.error('Ошибка при логировании:', err);
    }
  }

  // Методы для разных типов логов
  info(message, data = null) {
    return this.log('info', message, data);
  }
  
  warn(message, data = null) {
    return this.log('warn', message, data);
  }
  
  error(message, data = null) {
    return this.log('error', message, data);
  }
  
  debug(message, data = null) {
    return this.log('debug', message, data);
  }

  // Сохранение логов в localStorage
  saveLogs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (err) {
      console.error('Ошибка при сохранении логов:', err);
    }
  }

  // Очистка логов
  clearLogs() {
    this.logs = [];
    this.saveLogs();
    if (this.logElement) {
      this.renderLogs();
    }
  }

  // Отправка логов на сервер
  async sendLogsToServer() {
    try {
      if (!this.logs.length) {
        console.warn('Нет логов для отправки на сервер');
        return;
      }
      
      // Устанавливаем состояние кнопки "отправка"
      if (this.sendButton) {
        this.sendButton.textContent = 'Отправка...';
        this.sendButton.disabled = true;
      }
      
      // Формируем данные для отправки
      const logData = {
        logs: this.logs,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        sessionId: Date.now().toString()
      };
      
      // Формируем URL API (учитываем возможные относительные пути)
      const apiUrl = new URL(LOG_ERROR_API, window.location.origin).href;
      console.log('Отправка логов на сервер:', apiUrl);
      
      // Отправляем на сервер
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logData)
      });
      
      console.log('Статус ответа от сервера:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Логи успешно отправлены на сервер:', result);
        this.log('info', 'Логи успешно отправлены на сервер', { status: response.status });
      } else {
        const error = await response.text();
        console.error('Ошибка при отправке логов:', error);
        this.log('error', 'Ошибка при отправке логов на сервер', { status: response.status, error });
      }
    } catch (err) {
      console.error('Исключение при отправке логов на сервер:', err);
      this.log('error', `Ошибка при отправке логов: ${err.message}`);
    } finally {
      // Восстанавливаем состояние кнопки
      if (this.sendButton) {
        this.sendButton.textContent = 'Отправить на сервер';
        this.sendButton.disabled = false;
      }
    }
  }
}

// Создаем экземпляр логгера для использования в приложении
const appLogger = new Logger();

// Инициализируем логгер после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализируем логгер');
    appLogger.init();
}); 