/**
 * Middleware для валидации Telegram WebApp данных
 * Извлекает дублирующуюся логику валидации из всех API роутов
 */

const { validateTelegramWebAppData } = require('../utils/telegram');
const { getInitData } = require('../utils/authHelper');
const { logger } = require('../controllers/logsController');

/**
 * Middleware для обязательной валидации Telegram данных
 * Возвращает 401 если валидация не прошла
 */
function requireTelegramAuth(req, res, next) {
    try {
        // Получаем initData из headers или query
        const initData = getInitData(req);
        
        if (!initData) {
            logger.warn('Missing Telegram authentication data', {
                endpoint: req.originalUrl,
                method: req.method,
                ip: req.ip
            });
            
            return res.status(401).json({
                success: false,
                error: 'Missing Telegram authentication data'
            });
        }

        // Валидируем Telegram данные
        const validationResult = validateTelegramWebAppData(initData);
        
        if (!validationResult.isValid) {
            logger.warn('Invalid Telegram authentication', {
                endpoint: req.originalUrl,
                method: req.method,
                error: validationResult.error,
                ip: req.ip
            });
            
            return res.status(401).json({
                success: false,
                error: validationResult.error || 'Invalid Telegram authentication'
            });
        }

        // Добавляем данные пользователя в request для использования в роутах
        req.telegramUser = validationResult.data.user;
        req.telegramId = BigInt(validationResult.data.user.id);
        req.telegramData = validationResult.data;
        
        logger.debug('Telegram authentication successful', {
            endpoint: req.originalUrl,
            method: req.method,
            telegramId: req.telegramId.toString(),
            username: req.telegramUser.username
        });

        next();
        
    } catch (error) {
        logger.error('Error in Telegram auth middleware', {
            endpoint: req.originalUrl,
            method: req.method,
            error: error.message,
            stack: error.stack
        });
        
        return res.status(500).json({
            success: false,
            error: 'Internal authentication error'
        });
    }
}

/**
 * Middleware для опциональной валидации Telegram данных
 * Не возвращает ошибку если валидация не прошла, но добавляет данные если валидна
 */
function optionalTelegramAuth(req, res, next) {
    try {
        // Получаем initData из headers или query
        const initData = getInitData(req);
        
        if (!initData) {
            // Нет данных - продолжаем без авторизации
            req.telegramUser = null;
            req.telegramId = null;
            req.telegramData = null;
            return next();
        }

        // Валидируем Telegram данные
        const validationResult = validateTelegramWebAppData(initData);
        
        if (!validationResult.isValid) {
            logger.debug('Optional Telegram auth failed', {
                endpoint: req.originalUrl,
                method: req.method,
                error: validationResult.error
            });
            
            // Валидация не прошла - продолжаем без авторизации
            req.telegramUser = null;
            req.telegramId = null;
            req.telegramData = null;
            return next();
        }

        // Добавляем данные пользователя в request
        req.telegramUser = validationResult.data.user;
        req.telegramId = BigInt(validationResult.data.user.id);
        req.telegramData = validationResult.data;
        
        logger.debug('Optional Telegram authentication successful', {
            endpoint: req.originalUrl,
            method: req.method,
            telegramId: req.telegramId.toString(),
            username: req.telegramUser.username
        });

        next();
        
    } catch (error) {
        logger.error('Error in optional Telegram auth middleware', {
            endpoint: req.originalUrl,
            method: req.method,
            error: error.message
        });
        
        // При ошибке продолжаем без авторизации
        req.telegramUser = null;
        req.telegramId = null;
        req.telegramData = null;
        next();
    }
}

module.exports = {
    requireTelegramAuth,
    optionalTelegramAuth
};