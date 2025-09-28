// Подключаем модуль для работы с файловой системой
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

// Импорт логгера Winston
const { logger } = require('../src/controllers/logsController');

// Импорт роутера для shared анализов
const sharedAnalysisRouter = require('../src/api/sharedAnalysis');

/**
 * Универсальный маршрут для логирования клиентских данных
 * POST /api/log-client
 */
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
            disableServerTerminalOutput = false
        } = req.body;

        // Валидация входных данных
        if (!logs || !Array.isArray(logs)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный формат логов'
            });
        }

        // Создаем директорию для логов
        const logDir = path.join(__dirname, '../../logs/client');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Определяем имя файла
        const fileName = logFileName ||
            `${username || 'unknown'}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
        const logFile = path.join(logDir, fileName);

        // Форматируем лог-запись
        const logEntry = formatLogEntry({
            sessionId,
            username,
            userId,
            timestamp,
            userAgent,
            appVersion,
            isTelegramMiniApp,
            logs
        });

        // Записываем в файл
        fs.appendFileSync(logFile, logEntry, 'utf8');

        // Логируем в консоль сервера (если не отключено)
        if (!disableServerTerminalOutput) {
            logger.info('Клиентские логи сохранены', {
                logFile: fileName,
                logCount: logs.length,
                username: username || 'unknown'
            });
        }

        res.json({
            success: true,
            logFile: fileName,
            logCount: logs.length
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

/**
 * Форматирует лог-запись для записи в файл
 */
function formatLogEntry(data) {
    const {
        sessionId,
        username,
        userId,
        timestamp,
        userAgent,
        appVersion,
        isTelegramMiniApp,
        logs
    } = data;

    return `
=== НАЧАЛО ЛОГА ===
${sessionId ? `Session ID: ${sessionId}` : ''}
Username: ${username || 'unknown'}
User ID: ${userId || 'unknown'}
Время: ${timestamp}
User Agent: ${userAgent}
Версия приложения: ${appVersion}
Telegram Mini App: ${isTelegramMiniApp ? 'Да' : 'Нет'}
--- Записи логов ---
${logs.map(log => {
    const timeFormatted = new Date(log.timestamp).toTimeString().split(' ')[0];
    return `[${timeFormatted}] [${log.level.toUpperCase()}] ${log.message}${
        log.caller && log.caller !== 'Unknown in Unknown:Unknown' ? ` (${log.caller})` : ''
    }${log.data ? '\n  Данные: ' + JSON.stringify(log.data, null, 2) : ''}`;
}).join('\n')}
=== КОНЕЦ ЛОГА ===

`;
}

/**
 * Простой эндпоинт для проверки доступности API
 * GET /api/ping
 */
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        message: 'API доступно',
        timestamp: new Date().toISOString()
    });
});

// Регистрация роутера для shared анализов
router.use('/shared-analysis', sharedAnalysisRouter);

module.exports = router; 