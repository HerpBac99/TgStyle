/**
 * API для батчинга начальных данных
 * ОПТИМИЗАЦИЯ: один запрос вместо 3-5
 * Возвращает историю, гардероб, капсулы и информацию о пользователе
 */

const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { getInitData } = require('../utils/authHelper');
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');

/**
 * GET /api/initial-data
 * Загрузка всех начальных данных в одном запросе
 * OPTIMIZED: один запрос вместо 3-5, значительно ускоряет инициализацию
 * FIXED: поддержка initData из headers (X-Init-Data) и query параметров
 */
router.get('/', async (req, res) => {
    try {
        const { limit = '50', page = '1' } = req.query;

        // FIXED: получаем initData из header или query параметра
        const initData = getInitData(req);

        // Валидация Telegram initData
        if (!initData) {
            return res.status(400).json({
                success: false,
                error: 'Missing initData parameter'
            });
        }

        const validationResult = validateTelegramWebAppData(initData);
        if (!validationResult.isValid) {
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }

        const telegramUser = validationResult.data.user;
        const parsedLimit = Math.min(parseInt(limit) || 50, 100);
        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const offset = (parsedPage - 1) * parsedLimit;

        logger.info('Loading initial data batch', {
            telegramId: telegramUser.id,
            limit: parsedLimit,
            page: parsedPage
        });

        const startTime = Date.now();

        // Получаем пользователя из БД
        const dbUser = await prisma.user.findUnique({
            where: { 
                telegramId: BigInt(telegramUser.id) 
            }
        });

        if (!dbUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found in database'
            });
        }

        // BATCH: Загружаем все данные параллельно
        const [
            historyItems,
            historyTotal,
            wardrobeItems,
            capsules,
            userLikes
        ] = await Promise.all([
            // История анализов
            prisma.historyItem.findMany({
                where: { userId: dbUser.id },
                orderBy: { createdAt: 'desc' },
                skip: offset,
                take: parsedLimit,
                include: {
                    user: {
                        select: {
                            id: true,
                            telegramId: true
                        }
                    },
                    _count: {
                        select: {
                            ratings: true,
                            comments: true
                        }
                    }
                }
            }),

            // Общее количество элементов истории
            prisma.historyItem.count({
                where: { userId: dbUser.id }
            }),

            // Гардероб пользователя
            prisma.wardrobeItem.findMany({
                where: { telegramId: BigInt(telegramUser.id) },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: {
                    id: true,
                    imagePath: true,
                    name: true,
                    category: true,
                    color: true,
                    material: true,
                    style: true,
                    fit: true,
                    description: true,
                    tags: true,
                    createdAt: true
                }
            }),

            // Капсулы пользователя
            prisma.capsule.findMany({
                where: { telegramId: BigInt(telegramUser.id) },
                orderBy: { createdAt: 'desc' },
                take: 50,
                include: {
                    items: {
                        select: {
                            id: true,
                            imagePath: true,
                            name: true,
                            category: true,
                            color: true,
                            material: true,
                            style: true,
                            fit: true
                        }
                    }
                }
            }),

            // Лайки текущего пользователя для всех элементов истории
            prisma.rating.findMany({
                where: {
                    userId: dbUser.id,
                    historyItem: {
                        userId: dbUser.id
                    },
                    ratingType: 'like'
                },
                select: { historyItemId: true }
            })
        ]);

        // Преобразуем лайки в Set для быстрого поиска
        const userLikedIds = new Set(userLikes.map(like => like.historyItemId));

        // Формируем ответ
        const response = {
            success: true,
            data: {
                user: {
                    id: dbUser.id,
                    telegramId: dbUser.telegramId.toString(),
                    firstName: dbUser.firstName,
                    lastName: dbUser.lastName,
                    username: dbUser.username,
                    avatarUrl: dbUser.avatarUrl
                },
                analysesLeft: dbUser.analysesCount,
                totalAnalyses: dbUser.totalAnalyses || 0,
                history: {
                    items: historyItems.map(item => ({
                        id: item.id,
                        telegramId: item.user.telegramId.toString(),
                        photoPath: item.photoPath || null,
                        photoData: item.photoPath ? null : item.photoData,
                        analysisText: item.analysisText,
                        technicalAnalysis: item.technicalAnalysis,
                        isPublic: item.isPublic,
                        shareId: item.shareId || null,
                        likesCount: item.likesCount || 0,
                        viewsCount: item.viewsCount || 0,
                        isLiked: userLikedIds.has(item.id),
                        createdAt: item.createdAt,
                        updatedAt: item.updatedAt,
                        ratingsCount: item._count.ratings,
                        commentsCount: item._count.comments
                    })),
                    pagination: {
                        page: parsedPage,
                        limit: parsedLimit,
                        total: historyTotal,
                        totalPages: Math.ceil(historyTotal / parsedLimit),
                        hasMore: offset + parsedLimit < historyTotal
                    }
                },
                wardrobe: {
                    items: wardrobeItems.map(item => ({
                        id: item.id,
                        imageUrl: item.imagePath ? `/uploads/${item.imagePath}` : null,
                        name: item.name,
                        category: item.category,
                        color: item.color,
                        material: item.material,
                        style: item.style,
                        fit: item.fit,
                        description: item.description,
                        tags: item.tags || [],
                        createdAt: item.createdAt
                    })),
                    count: wardrobeItems.length
                },
                capsules: {
                    items: capsules.map(capsule => ({
                        id: capsule.id,
                        name: capsule.name,
                        description: capsule.description,
                        thumbnailUrl: capsule.thumbnailPath ? `/uploads/capsules/${capsule.telegramId}/${capsule.thumbnailPath}` : null,
                        items: capsule.items.map(item => ({
                            id: item.id,
                            imagePath: item.imagePath,
                            name: item.name,
                            category: item.category,
                            color: item.color,
                            material: item.material,
                            style: item.style,
                            fit: item.fit
                        })),
                        createdAt: capsule.createdAt
                    })),
                    count: capsules.length
                }
            },
            meta: {
                loadTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }
        };

        logger.info('Initial data batch loaded successfully', {
            userId: dbUser.id,
            historyCount: historyItems.length,
            wardrobeCount: wardrobeItems.length,
            capsulesCount: capsules.length,
            loadTime: Date.now() - startTime
        });

        return res.json(response);

    } catch (error) {
        logger.error('Error loading initial data batch', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
