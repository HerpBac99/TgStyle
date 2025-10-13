const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');
const { getAnalysisImageUrl, deleteAnalysisImage } = require('../utils/fileStorage');

// Импортируем Prisma клиент
const prisma = require('../lib/prisma');

/**
 * Получение пользователя из базы данных по Telegram ID
 */
async function getUserByTelegramId(telegramId) {
    try {
        const user = await prisma.user.findUnique({
            where: { 
                telegramId: BigInt(telegramId) 
            }
        });
        return user;
    } catch (error) {
        logger.error('Ошибка получения пользователя из БД', {
            telegramId,
            error: error.message
        });
        return null;
    }
}

/**
 * Валидация параметров пагинации
 */
function validatePaginationParams(page, limit) {
    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    
    // Ограничиваем лимит для защиты от больших запросов
    const maxLimit = 50;
    const validLimit = Math.min(Math.max(parsedLimit, 1), maxLimit);
    const validPage = Math.max(parsedPage, 1);
    
    return {
        page: validPage,
        limit: validLimit,
        offset: (validPage - 1) * validLimit
    };
}

/**
 * Проверка прав доступа к элементу истории
 */
async function checkHistoryItemAccess(historyItemId, userId) {
    try {
        const historyItem = await prisma.historyItem.findFirst({
            where: {
                id: parseInt(historyItemId),
                OR: [
                    { userId: userId }, // Владелец
                    { isPublic: true }  // Публичный доступ
                ]
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                        avatarUrl: true
                    }
                }
            }
        });
        
        return historyItem;
    } catch (error) {
        logger.error('Ошибка проверки доступа к элементу истории', {
            historyItemId,
            userId,
            error: error.message
        });
        return null;
    }
}

/**
 * GET /api/history
 * Получение истории анализов пользователя
 */
router.get('/', async (req, res) => {
    try {
        const { initData, page, limit, sortBy = 'createdAt', order = 'desc' } = req.query;

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

        // Получаем пользователя из БД
        const dbUser = await getUserByTelegramId(telegramUser.id);
        if (!dbUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found in database'
            });
        }

        // Валидация параметров пагинации
        const pagination = validatePaginationParams(page, limit);

        logger.info('Запрос истории пользователя', {
            userId: dbUser.id,
            page: pagination.page,
            limit: pagination.limit
        });

        // Получаем общее количество элементов
        const totalCount = await prisma.historyItem.count({
            where: { userId: dbUser.id }
        });

        // Получаем элементы истории с пагинацией
        const historyItems = await prisma.historyItem.findMany({
            where: { userId: dbUser.id },
            orderBy: { [sortBy]: order },
            skip: pagination.offset,
            take: pagination.limit,
            include: {
                _count: {
                    select: {
                        ratings: true,
                        comments: true
                    }
                }
            }
        });

        // Формируем ответ с photoUrl для новых записей
        const telegramId = telegramUser.id;
        const response = {
            success: true,
            history: historyItems.map(item => ({
                id: item.id,
                // NEW: используем photoUrl если есть photoPath, иначе legacy photoData
                photoUrl: item.photoPath ? getAnalysisImageUrl(telegramId, item.photoPath) : null,
                photoData: item.photoPath ? null : item.photoData,  // Legacy fallback
                analysisText: item.analysisText,
                technicalAnalysis: item.technicalAnalysis,
                isPublic: item.isPublic,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                ratingsCount: item._count.ratings,
                commentsCount: item._count.comments
            })),
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / pagination.limit),
                hasMore: pagination.offset + pagination.limit < totalCount
            }
        };

        return res.json(response);

    } catch (error) {
        logger.error('Ошибка получения истории', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/history/:id
 * Получение конкретного элемента истории
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { initData } = req.query;

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

        // Получаем пользователя из БД
        const dbUser = await getUserByTelegramId(telegramUser.id);
        if (!dbUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found in database'
            });
        }

        // Проверяем доступ к элементу истории
        const historyItem = await checkHistoryItemAccess(id, dbUser.id);
        if (!historyItem) {
            return res.status(404).json({
                success: false,
                error: 'History item not found or access denied'
            });
        }

        // Получаем комментарии и рейтинги
        const [comments, ratings] = await Promise.all([
            prisma.comment.findMany({
                where: { historyItemId: parseInt(id) },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            username: true,
                            avatarUrl: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.rating.findMany({
                where: { historyItemId: parseInt(id) },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            username: true
                        }
                    }
                }
            })
        ]);

        const telegramId = historyItem.user.telegramId || telegramUser.id;
        const response = {
            success: true,
            historyItem: {
                id: historyItem.id,
                // NEW: используем photoUrl если есть photoPath
                photoUrl: historyItem.photoPath ? getAnalysisImageUrl(telegramId, historyItem.photoPath) : null,
                photoData: historyItem.photoPath ? null : historyItem.photoData,  // Legacy fallback
                analysisText: historyItem.analysisText,
                technicalAnalysis: historyItem.technicalAnalysis,
                isPublic: historyItem.isPublic,
                createdAt: historyItem.createdAt,
                updatedAt: historyItem.updatedAt,
                user: historyItem.user,
                comments: comments.map(comment => ({
                    id: comment.id,
                    content: comment.content,
                    createdAt: comment.createdAt,
                    user: comment.user,
                    parentCommentId: comment.parentCommentId
                })),
                ratings: {
                    likes: ratings.filter(r => r.ratingType === 'like').length,
                    dislikes: ratings.filter(r => r.ratingType === 'dislike').length,
                    userRating: ratings.find(r => r.userId === dbUser.id)?.ratingType || null
                }
            }
        };

        return res.json(response);

    } catch (error) {
        logger.error('Ошибка получения элемента истории', {
            historyItemId: req.params.id,
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * PUT /api/history/:id
 * Обновление элемента истории (описание, видимость)
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { initData, analysisText, isPublic } = req.body;

        // Валидация Telegram initData
        if (!initData) {
            return res.status(400).json({
                success: false,
                error: 'Missing initData'
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

        // Получаем пользователя из БД
        const dbUser = await getUserByTelegramId(telegramUser.id);
        if (!dbUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found in database'
            });
        }

        // Проверяем что элемент принадлежит пользователю
        const historyItem = await prisma.historyItem.findFirst({
            where: {
                id: parseInt(id),
                userId: dbUser.id
            }
        });

        if (!historyItem) {
            return res.status(404).json({
                success: false,
                error: 'History item not found or access denied'
            });
        }

        // Подготавливаем данные для обновления
        const updateData = {
            updatedAt: new Date()
        };

        if (analysisText !== undefined) {
            updateData.analysisText = analysisText;
        }

        if (isPublic !== undefined) {
            updateData.isPublic = Boolean(isPublic);
        }

        // Обновляем элемент
        const updatedItem = await prisma.historyItem.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        logger.info('Элемент истории обновлен', {
            historyItemId: updatedItem.id,
            userId: dbUser.id,
            updatedFields: Object.keys(updateData)
        });

        return res.json({
            success: true,
            historyItem: {
                id: updatedItem.id,
                analysisText: updatedItem.analysisText,
                isPublic: updatedItem.isPublic,
                updatedAt: updatedItem.updatedAt
            }
        });

    } catch (error) {
        logger.error('Ошибка обновления элемента истории', {
            historyItemId: req.params.id,
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/history/:id
 * Удаление элемента истории
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { initData } = req.query;  // FIX: читаем из query, как в GET

        // Валидация Telegram initData
        if (!initData) {
            return res.status(400).json({
                success: false,
                error: 'Missing initData'
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

        // Получаем пользователя из БД
        const dbUser = await getUserByTelegramId(telegramUser.id);
        if (!dbUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found in database'
            });
        }

        // Проверяем что элемент принадлежит пользователю
        const historyItem = await prisma.historyItem.findFirst({
            where: {
                id: parseInt(id),
                userId: dbUser.id
            }
        });

        if (!historyItem) {
            return res.status(404).json({
                success: false,
                error: 'History item not found or access denied'
            });
        }

        // Удаляем файл фотографии с диска если есть photoPath
        if (historyItem.photoPath) {
            try {
                await deleteAnalysisImage(telegramUser.id, historyItem.photoPath);
                logger.info('Analysis image deleted from disk', {
                    telegramId: telegramUser.id,
                    photoPath: historyItem.photoPath
                });
            } catch (error) {
                logger.error('Failed to delete analysis image file', {
                    telegramId: telegramUser.id,
                    photoPath: historyItem.photoPath,
                    error: error.message
                });
                // Продолжаем удаление даже если файл не удалось удалить
            }
        }

        // Удаляем элемент (каскадное удаление комментариев и рейтингов происходит автоматически)
        await prisma.historyItem.delete({
            where: { id: parseInt(id) }
        });

        logger.info('Элемент истории удален', {
            historyItemId: parseInt(id),
            userId: dbUser.id,
            photoPathDeleted: !!historyItem.photoPath
        });

        return res.json({
            success: true,
            message: 'History item deleted successfully'
        });

    } catch (error) {
        logger.error('Ошибка удаления элемента истории', {
            historyItemId: req.params.id,
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/history/public
 * Получение публичной ленты анализов
 */
router.get('/public', async (req, res) => {
    try {
        const { page, limit, sortBy = 'createdAt', order = 'desc' } = req.query;

        // Валидация параметров пагинации
        const pagination = validatePaginationParams(page, limit);

        logger.info('Запрос публичной ленты', {
            page: pagination.page,
            limit: pagination.limit
        });

        // Получаем общее количество публичных элементов
        const totalCount = await prisma.historyItem.count({
            where: { isPublic: true }
        });

        // Получаем публичные элементы истории с пагинацией
        const historyItems = await prisma.historyItem.findMany({
            where: { isPublic: true },
            orderBy: { [sortBy]: order },
            skip: pagination.offset,
            take: pagination.limit,
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                        avatarUrl: true
                    }
                },
                _count: {
                    select: {
                        ratings: true,
                        comments: true
                    }
                }
            }
        });

        // Формируем ответ
        const response = {
            success: true,
            history: historyItems.map(item => ({
                id: item.id,
                photoData: item.photoData,
                analysisText: item.analysisText,
                technicalAnalysis: item.technicalAnalysis,
                createdAt: item.createdAt,
                user: item.user,
                ratingsCount: item._count.ratings,
                commentsCount: item._count.comments
            })),
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / pagination.limit),
                hasMore: pagination.offset + pagination.limit < totalCount
            }
        };

        return res.json(response);

    } catch (error) {
        logger.error('Ошибка получения публичной ленты', {
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
