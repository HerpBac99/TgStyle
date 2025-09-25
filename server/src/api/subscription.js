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

        // Проверяем активность Premium подписки
        const isPremiumActive = user.subscriptionType === 'premium' && 
                               user.subscriptionEndDate && 
                               new Date(user.subscriptionEndDate) > new Date();

        const subscriptionInfo = {
            type: user.subscriptionType,
            isActive: isPremiumActive || user.subscriptionType === 'free',
            analysesLeft: isPremiumActive ? -1 : user.analysesCount,
            totalAnalyses: user.totalAnalyses,
            weeklyResetDate: user.weeklyResetDate,
            subscriptionEndDate: user.subscriptionEndDate
        };

        logger.info('Информация о подписке получена', {
            userId: user.id,
            subscriptionType: user.subscriptionType,
            analysesLeft: subscriptionInfo.analysesLeft
        });

        res.json({
            success: true,
            subscription: subscriptionInfo
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

/**
 * Обновление подписки пользователя
 * POST /api/subscription/:userId/upgrade
 */
router.post('/:userId/upgrade', async (req, res) => {
    const { userId } = req.params;
    const { subscriptionType, duration } = req.body;
    
    try {
        if (!['free', 'premium'].includes(subscriptionType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subscription type'
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        let updateData = {
            subscriptionType,
            updatedAt: new Date()
        };

        // Если это премиум подписка, устанавливаем дату окончания
        if (subscriptionType === 'premium' && duration) {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + duration); // duration в днях
            updateData.subscriptionEndDate = endDate;
        } else if (subscriptionType === 'free') {
            updateData.subscriptionEndDate = null;
            updateData.analysesCount = 3; // Восстанавливаем лимит для free
        }

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(userId) },
            data: updateData
        });

        logger.info('Подписка пользователя обновлена', {
            userId: updatedUser.id,
            oldType: user.subscriptionType,
            newType: subscriptionType,
            endDate: updateData.subscriptionEndDate
        });

        res.json({
            success: true,
            message: 'Subscription updated successfully',
            subscription: {
                type: updatedUser.subscriptionType,
                subscriptionEndDate: updatedUser.subscriptionEndDate
            }
        });

    } catch (error) {
        logger.error('Ошибка обновления подписки', {
            userId,
            subscriptionType,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;