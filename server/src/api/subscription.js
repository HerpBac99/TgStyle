const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');

// Импортируем Prisma клиент
const prisma = require('../lib/prisma');

/**
 * Получение информации о подписке пользователя
 * GET /api/subscription/:userId
 */
router.get('/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const userInfo = {
            analysesLeft: user.analysesCount,
            totalAnalyses: user.totalAnalyses
        };

        logger.info('Информация о пользователе получена', {
            userId: user.id,
            analysesLeft: userInfo.analysesLeft
        });

        res.json({
            success: true,
            user: userInfo
        });

    } catch (error) {
        logger.error('Ошибка получения информации о подписке', {
            userId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Удален endpoint для обновления подписки - система упрощена

module.exports = router;