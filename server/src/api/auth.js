const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
// const User = require('../models/User'); // Убрали MongoDB
const { logger } = require('../controllers/logsController');

/**
 * Handle Telegram authentication
 * POST /api/auth
 */
router.post('/', async (req, res) => {
    const { initData } = req.body;
    try {
        
        if (!initData) {
            logger.info('Попытка аутентификации без initData');
            return res.status(400).json({
                success: false,
                error: 'No initData provided'
            });
        }
        
        // Validate Telegram initData
        const validationResult = validateTelegramWebAppData(initData);
        
        if (!validationResult.isValid) {
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }
        
        // Extract user information
        const { user } = validationResult.data;

        // Возвращаем данные пользователя без MongoDB
        logger.info('Пользователь аутентифицирован', {
            userId: user.id,
            userName: user.first_name,
            userLastName: user.last_name || '',
            userUsername: user.username || ''
        });

        return res.json({
            success: true,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name || '',
                username: user.username || ''
            }
        });
    } catch (error) {
        logger.error('Ошибка аутентификации Telegram', {
            error: error.message,
            stack: error.stack,
            initData: initData ? initData.substring(0, 100) + '...' : 'undefined'
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router; 