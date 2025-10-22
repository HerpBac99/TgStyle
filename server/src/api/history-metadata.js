const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');

/**
 * Получение метаданных истории (лайки, просмотры) без тяжелых данных
 * GET /api/history-metadata
 * Возвращает только ID, likesCount, viewsCount, isLiked для быстрой синхронизации
 */
router.get('/', async (req, res) => {
    try {
        const { initData } = req.query;

        if (!initData) {
            return res.status(400).json({
                success: false,
                error: 'Missing initData'
            });
        }

        // Валидация Telegram данных
        const validationResult = validateTelegramWebAppData(initData);
        if (!validationResult.isValid) {
            logger.warn('Invalid Telegram WebApp data for metadata', {
                error: validationResult.error
            });
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication'
            });
        }

        const telegramId = validationResult.data.user.id;

        // Получаем пользователя из БД
        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(telegramId) }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Получаем только метаданные истории пользователя
        const historyItems = await prisma.historyItem.findMany({
            where: {
                userId: user.id
            },
            select: {
                id: true,
                likesCount: true,
                viewsCount: true,
                updatedAt: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 50
        });

        // Получаем информацию о лайках пользователя
        const userLikes = await prisma.rating.findMany({
            where: {
                userId: user.id,
                historyItemId: {
                    in: historyItems.map(item => item.id)
                },
                ratingType: 'like'
            },
            select: {
                historyItemId: true
            }
        });

        const likedItemIds = new Set(userLikes.map(like => like.historyItemId));

        // Формируем ответ с метаданными
        const metadata = historyItems.map(item => ({
            id: item.id,
            likesCount: item.likesCount || 0,
            viewsCount: item.viewsCount || 0,
            isLiked: likedItemIds.has(item.id),
            updatedAt: item.updatedAt.toISOString()
        }));

        logger.info('History metadata loaded', {
            userId: user.id,
            telegramId: telegramId,
            itemsCount: metadata.length
        });

        res.json({
            success: true,
            metadata: metadata
        });

    } catch (error) {
        logger.error('Error loading history metadata', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
