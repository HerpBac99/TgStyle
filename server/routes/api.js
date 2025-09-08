// Подключаем модуль для работы с файловой системой
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

// Импорт логгера Winston
const { logger, logSuccess, logWarning } = require('../src/controllers/logsController');

// Маршрут для логирования ошибок клиента
router.post('/log-error', async (req, res) => {
    try {
        const { logs, userAgent, appVersion, timestamp } = req.body;
        
        // Создаем директорию для логов, если ее нет (в папке logs/client корня проекта)
        const logDir = path.join(__dirname, '../../logs/client');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Формируем имя файла с датой
        const date = new Date().toISOString().split('T')[0];
        const logFile = path.join(logDir, `client_logs_${date}.txt`);
        
        // Выводим клиентские логи в единый формат
        if (Array.isArray(logs)) {
            logs.forEach((log, index) => {
                const timestamp = new Date(log.timestamp).toTimeString().split(' ')[0];
                console.log(`[${timestamp}] [CLIENT] [${log.level.toUpperCase()}] ${log.message}`);
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
    logs.map(log => `[${log.timestamp}] [${log.level}] ${log.message} (${log.caller}) ${log.data ? '\n  Данные: ' + log.data : ''}`).join('\n') :
    'Неверный формат логов'
}
=== КОНЕЦ ЛОГА ===
\n`;

        // Записываем в файл (добавляем в конец)
        fs.appendFileSync(logFile, logEntry);

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