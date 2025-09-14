// Подключаем модуль для работы с файловой системой
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

// Импорт логгера Winston
const { logger, logSuccess, logWarning } = require('../src/controllers/logsController');

// Безопасная функция JSON.stringify
function safeJsonStringify(obj, defaultValue = '{}') {
    try {
        return JSON.stringify(obj);
    } catch (error) {
        return defaultValue;
    }
}

// Новый маршрут для клиентских логов (без вывода в терминал сервера)
router.post('/log-client', async (req, res) => {
    try {
        const { 
            sessionId,
            username,
            userId,
            logFileName,
            logs, 
            userAgent, 
            appVersion, 
            timestamp,
            isTelegramMiniApp,
            disableServerTerminalOutput
        } = req.body;
        
        // Создаем директорию для логов, если ее нет
        const logDir = path.join(__dirname, '../../logs/client');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Используем переданное имя файла или создаем стандартное
        const fileName = logFileName || `${username || 'unknown'}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
        const logFile = path.join(logDir, fileName);
        
        // НЕ выводим логи в терминал сервера (согласно требованию)
        // Только сохраняем в файл
        
        // Форматируем данные для записи в файл
        const logEntry = `
=== НАЧАЛО ЛОГА ===
Session ID: ${sessionId}
Username: ${username || 'unknown'}
User ID: ${userId || 'unknown'}
Время: ${timestamp}
User Agent: ${userAgent}
Версия приложения: ${appVersion}
Telegram Mini App: ${isTelegramMiniApp ? 'Да' : 'Нет'}
--- Записи логов ---
${Array.isArray(logs) ?
    logs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${log.data ? '\n  Данные: ' + JSON.stringify(log.data, null, 2) : ''}`).join('\n') :
    'Неверный формат логов'
}
=== КОНЕЦ ЛОГА ===

`;

        // Записываем в файл (добавляем в конец)
        fs.writeFileSync(logFile, logEntry);

        // Логируем только факт сохранения (без деталей, чтобы не засорять терминал)
        if (!disableServerTerminalOutput) {
            logger.info('Клиентские логи сохранены', { 
                logFile: fileName, 
                logCount: Array.isArray(logs) ? logs.length : 0,
                username: username || 'unknown'
            });
        }
        
        res.json({ 
            success: true,
            logFile: fileName,
            logCount: Array.isArray(logs) ? logs.length : 0
        });
    } catch (error) {
        logger.error('Ошибка при сохранении клиентских логов', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            success: false, 
            error: 'Не удалось сохранить логи на сервере' 
        });
    }
});

// Старый маршрут для логирования ошибок клиента (оставлен для совместимости)
router.post('/log-error', async (req, res) => {
    try {
        const { logs, userAgent, appVersion, timestamp } = req.body;
        
        // Создаем директорию для логов, если ее нет (в папке logs/client корня проекта)
        const logDir = path.join(__dirname, '../../logs/client');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Формируем имя файла с датой и временем для каждого сохранения
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const logFile = path.join(logDir, `client_logs_${date}_${time}.txt`);
        
        // Логируем только в файл, без вывода в терминал
        if (Array.isArray(logs)) {
            logs.forEach((log, index) => {
                // Тихий режим - логи только в файл
            });
        }

        // Форматируем данные для записи в файл
        const logEntry = `
=== НАЧАЛО ЛОГА ===
Время: ${timestamp}
User Agent: ${userAgent}
Версия приложения: ${appVersion}
--- Записи логов ---
${Array.isArray(logs) ?
    logs.map(log => {
        const timeFormatted = new Date(log.timestamp).toTimeString().split(' ')[0];
        return `[${timeFormatted}] [${log.level.toUpperCase()}] ${log.message}${log.caller && log.caller !== 'Unknown in Unknown:Unknown' ? ` (${log.caller})` : ''}${log.data ? '\n  Данные: ' + safeJsonStringify(log.data) : ''}`;
    }).join('\n') :
    'Неверный формат логов'
}
=== КОНЕЦ ЛОГА ===
\n`;

        // Записываем в файл (добавляем в конец)
        fs.writeFileSync(logFile, logEntry);

        logger.info('Логи клиента сохранены', { logFile, logCount: logs.length });
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Ошибка при сохранении логов клиента', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            success: false, 
            error: 'Не удалось сохранить логи на сервере' 
        });
    }
});

// Маршрут для конвертации модели h5 в формат tfjs
router.post('/convert-model', async (req, res) => {
    try {
        const h5Path = path.join(__dirname, '../../clothing_model.h5');
        const outputDir = path.join(__dirname, '../../tfjs_model');
        
        // Проверяем существование файла модели
        if (!fs.existsSync(h5Path)) {
            return res.status(404).json({
                success: false,
                error: 'Файл модели не найден'
            });
        }
        
        // Проверяем, существует ли уже сконвертированная модель
        if (fs.existsSync(path.join(outputDir, 'model.json'))) {
            return res.json({
                success: true,
                message: 'Модель уже сконвертирована',
                modelPath: outputDir
            });
        }
        
        // Создаем директорию для выходных файлов, если ее нет
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Проверяем, есть ли у нас Python и tensorflowjs
        exec('python -c "import tensorflowjs"', (error) => {
            if (error) {
                logger.error('Ошибка проверки tensorflowjs', {
                    error: error.message,
                    command: 'python -c "import tensorflowjs"'
                });
                return res.status(500).json({
                    success: false,
                    error: 'Требуется установить tensorflowjs через pip',
                    command: 'pip install tensorflowjs'
                });
            }
            
            // Выполняем команду конвертации модели
            const command = `python -m tensorflowjs.converters.converter --input_format keras ${h5Path} ${outputDir}`;
            
            logger.info('Начинаем конвертацию модели TensorFlow', { command });
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error('Ошибка конвертации модели TensorFlow', {
                        error: error.message,
                        stderr: stderr,
                        command: command
                    });
                    return res.status(500).json({
                        success: false,
                        error: 'Ошибка при конвертации модели',
                        details: error.message,
                        stderr: stderr
                    });
                }
                
                logger.info('Модель TensorFlow успешно сконвертирована', {
                    outputDir,
                    stdout: stdout.substring(0, 200) // Логируем только первые 200 символов stdout
                });
                
                return res.json({
                    success: true,
                    message: 'Модель успешно сконвертирована',
                    modelPath: outputDir,
                    stdout: stdout
                });
            });
        });
    } catch (error) {
        logger.error('Ошибка при конвертации модели', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера',
            details: error.message
        });
    }
});

// Простой эндпоинт для проверки доступности API
router.get('/ping', (req, res) => {
    res.json({ success: true, message: 'API доступно' });
});

module.exports = router; 