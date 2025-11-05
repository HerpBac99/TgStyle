const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');
const sharp = require('sharp');
const { 
  saveAnalysisImage, 
  getAnalysisImageUrl,
  deleteAnalysisImage,
  cleanupOldAnalyses 
} = require('../utils/fileStorage');

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
 * Проверка лимитов анализа для пользователя
 */
function checkAnalysisLimits(user) {
    if (!user) {
        return {
            allowed: true,
            reason: 'user_not_found_fallback'
        };
    }

    if (user.analysesCount <= 0) {
        return {
            allowed: false,
            reason: 'limit_exceeded',
            analysesLeft: 0
        };
    }

    return {
        allowed: true,
        reason: 'limit_ok',
        analysesLeft: user.analysesCount
    };
}

/**
 * Обновление счетчиков пользователя после успешного анализа
 */
async function updateUserCounters(userId) {
    try {
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                analysesCount: {
                    decrement: 1
                },
                totalAnalyses: {
                    increment: 1
                },
                updatedAt: new Date()
            }
        });

        logger.info('Счетчики пользователя обновлены', {
            userId,
            analysesLeft: updatedUser.analysesCount,
            totalAnalyses: updatedUser.totalAnalyses
        });

        return updatedUser;
    } catch (error) {
        logger.error('Ошибка обновления счетчиков пользователя', {
            userId,
            error: error.message
        });
        return null;
    }
}

/**
 * Оптимизация изображения для хранения в истории
 */
async function optimizeImageForStorage(base64Image) {
    try {
        let cleanBase64 = base64Image;
        if (base64Image.includes(',')) {
            cleanBase64 = base64Image.split(',')[1];
        }

        const imageBuffer = Buffer.from(cleanBase64, 'base64');

        const optimizedBuffer = await sharp(imageBuffer)
            .rotate()
            .resize(800, 800, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({
                quality: 85,
                progressive: true
            })
            .toBuffer();

        const optimizedBase64 = optimizedBuffer.toString('base64');

        const originalSize = Math.round(imageBuffer.length / 1024);
        const optimizedSize = Math.round(optimizedBuffer.length / 1024);

        logger.info('Image optimized for storage', {
            originalSizeKB: originalSize,
            optimizedSizeKB: optimizedSize,
            compressionRatio: ((originalSize - optimizedSize) / originalSize * 100).toFixed(1) + '%'
        });

        return optimizedBase64;

    } catch (error) {
        logger.error('Error optimizing image for storage', {
            error: error.message,
            stack: error.stack
        });
        return base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    }
}

/**
 * Сохранение результата анализа в истории
 */
async function saveAnalysisToHistory(userId, telegramId, photoData, analysisText, technicalAnalysis) {
    try {
        const optimizedPhotoData = await optimizeImageForStorage(photoData);
        const photoPath = await saveAnalysisImage(telegramId, `data:image/jpeg;base64,${optimizedPhotoData}`);
        
        logger.info('Analysis image saved to disk', {
            userId,
            telegramId,
            photoPath,
            optimizedSizeKB: Math.round(optimizedPhotoData.length / 1024)
        });

        const historyCount = await prisma.historyItem.count({
            where: { userId }
        });

        if (historyCount >= 50) {
            const oldestItem = await prisma.historyItem.findFirst({
                where: { userId },
                orderBy: { createdAt: 'asc' },
                select: { id: true, createdAt: true, photoPath: true }
            });

            if (oldestItem) {
                if (oldestItem.photoPath) {
                    await deleteAnalysisImage(telegramId, oldestItem.photoPath);
                }
                
                await prisma.historyItem.delete({
                    where: { id: oldestItem.id }
                });

                logger.info('Deleted oldest history item', {
                    userId,
                    deletedItemId: oldestItem.id,
                    photoPath: oldestItem.photoPath
                });
            }
        }

        const historyItem = await prisma.historyItem.create({
            data: {
                userId,
                photoPath,
                photoData: null,
                analysisText,
                technicalAnalysis,
                isPublic: false,
                createdAt: new Date()
            }
        });

        await cleanupOldAnalyses(telegramId, 50);

        logger.info('Analysis saved to history', {
            historyItemId: historyItem.id,
            userId,
            photoPath,
            totalHistoryItems: Math.min(historyCount + 1, 50)
        });

        return historyItem;
        
    } catch (error) {
        logger.error('Failed to save analysis to history', {
            userId,
            telegramId,
            error: error.message,
            stack: error.stack
        });
        return null;
    }
}

/**
 * Константы для FastVLM интеграции
 */
const FASTVLM_CONFIG = {
    HOST: 'http://127.0.0.1',
    PORT: 3001,
    TIMEOUT: 60000,
    ENDPOINT: '/analyze_gemini'  // NEW: используем новый эндпоинт
};

/**
 * Анализирует изображение через FastVLM Gemini Direct
 */
async function analyzeImageGemini(imageBuffer, nickname, theme) {
    try {
        logger.info('🚀 Отправка запроса в FastVLM (Gemini Direct)');

        const base64Image = imageBuffer.toString('base64');
        const url = `${FASTVLM_CONFIG.HOST}:${FASTVLM_CONFIG.PORT}${FASTVLM_CONFIG.ENDPOINT}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            logger.warn('FastVLM Gemini запрос прерван по таймауту');
        }, FASTVLM_CONFIG.TIMEOUT);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_base64: base64Image,
                nickname: nickname,
                topic: theme || 'casual'
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();

            if (result.success && result.analysis) {
                logger.info('✅ FastVLM Gemini анализ успешен', {
                    analysisLength: result.analysis.length,
                    geminiTime: result.timing?.gemini_time || 0,
                    totalTime: result.timing?.total_time || 0
                });

                return {
                    success: true,
                    analysis: result.analysis,
                    technical_analysis: result.technical_analysis || '',
                    fastvlm: true,
                    model: result.model_used || 'gemini_direct',
                    timing: result.timing
                };
            } else {
                logger.error('FastVLM Gemini сервер вернул ошибку', {
                    error: result.error,
                    status: response.status
                });
                return {
                    success: false,
                    error: result.error || 'FastVLM Gemini analysis failed'
                };
            }
        } else {
            logger.error('FastVLM Gemini сервер недоступен', {
                status: response.status,
                statusText: response.statusText,
                url
            });

            return {
                success: false,
                error: `FastVLM Gemini server error: ${response.status} ${response.statusText}`
            };
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            logger.error('FastVLM Gemini запрос отменен по таймауту');
            return { success: false, error: 'FastVLM Gemini timeout' };
        }

        logger.error('Ошибка при обращении к FastVLM Gemini серверу', {
            error: error.message,
            stack: error.stack
        });

        return {
            success: false,
            error: error.message || 'FastVLM Gemini communication error'
        };
    }
}

/**
 * Анализ изображения одежды через Gemini Direct
 * POST /api/analyze_gemini
 */
router.post('/', async (req, res) => {
    const { photo, initData, theme } = req.body;
    let dbUser = null;
    let historyItem = null;

    try {
        if (!photo || !initData) {
            logger.error('Отсутствуют необходимые параметры', {
                hasPhoto: !!photo,
                hasInitData: !!initData
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: photo and initData'
            });
        }

        const validationResult = validateTelegramWebAppData(initData);
        if (!validationResult.isValid) {
            logger.error('Ошибка валидации Telegram', {
                error: validationResult.error
            });
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }

        logger.info('✅ Валидация Telegram успешна (Gemini Direct)');

        const telegramUser = validationResult.data.user;
        logger.info('Данные пользователя Telegram', {
            telegramId: telegramUser?.id,
            username: telegramUser?.username,
            firstName: telegramUser?.first_name
        });

        const nickname = telegramUser?.username ||
                        `${telegramUser?.first_name || ''}${telegramUser?.last_name || ''}`.trim() ||
                        `user_${telegramUser?.id || 'unknown'}`;

        try {
            dbUser = await getUserByTelegramId(telegramUser.id);
            
            if (dbUser) {
                logger.info('Пользователь найден в БД', {
                    userId: dbUser.id,
                    analysesLeft: dbUser.analysesCount
                });

                const limitsCheck = checkAnalysisLimits(dbUser);
                
                if (!limitsCheck.allowed) {
                    logger.warn('Превышен лимит анализов', {
                        userId: dbUser.id,
                        reason: limitsCheck.reason,
                        analysesLeft: limitsCheck.analysesLeft
                    });
                    
                    return res.status(429).json({
                        success: false,
                        error: 'Analysis limit exceeded',
                        message: 'Превышен лимит анализов',
                        analysesLeft: limitsCheck.analysesLeft
                    });
                }

                logger.info('Проверка лимитов пройдена', {
                    reason: limitsCheck.reason,
                    analysesLeft: limitsCheck.analysesLeft
                });
            } else {
                logger.warn('Пользователь не найден в БД, продолжаем без проверки лимитов');
            }
        } catch (dbError) {
            logger.error('Ошибка работы с БД при проверке пользователя', {
                error: dbError.message,
                telegramId: telegramUser.id
            });
        }

        let imageBuffer;
        try {
            imageBuffer = Buffer.from(photo, 'base64');
            logger.info('Изображение декодировано', {
                sizeBytes: imageBuffer.length
            });
        } catch (error) {
            logger.error('Ошибка декодирования изображения', {
                error: error.message
            });
            return res.status(400).json({
                success: false,
                error: 'Invalid image data'
            });
        }

        if (imageBuffer.length < 100) {
            logger.error('Изображение слишком маленькое');
            return res.status(400).json({
                success: false,
                error: 'Image too small'
            });
        }

        logger.info(`🚀 Начинаем Gemini Direct анализ для пользователя: ${nickname}`);

        const analysisResult = await analyzeImageGemini(imageBuffer, nickname, theme);

        if (analysisResult.success) {
            logger.info('✅ FastVLM Gemini анализ завершен успешно');

            try {
                if (dbUser) {
                    historyItem = await saveAnalysisToHistory(
                        dbUser.id,
                        telegramUser.id,
                        photo,
                        analysisResult.analysis,
                        analysisResult.technical_analysis
                    );

                    await updateUserCounters(dbUser.id);
                    logger.info('Счетчики пользователя обновлены после Gemini анализа');
                } else {
                    logger.warn('Пользователь не найден в БД, анализ не сохранен в историю');
                }
            } catch (dbError) {
                logger.error('Ошибка сохранения результата в БД', {
                    error: dbError.message,
                    userId: dbUser?.id
                });
            }

            const response = {
                success: true,
                analysis: analysisResult.analysis,
                model: analysisResult.model || 'gemini_direct',
                timing: analysisResult.timing
            };

            if (dbUser) {
                const updatedUser = await getUserByTelegramId(telegramUser.id);
                if (updatedUser) {
                    response.analysesLeft = updatedUser.analysesCount;
                    response.totalAnalyses = updatedUser.totalAnalyses;
                }
            }

            if (historyItem) {
                response.historyItemId = historyItem.id;
            }

            return res.json(response);

        } else {
            logger.error('Ошибка Gemini Direct анализа', { error: analysisResult.error });
            return res.status(500).json({
                success: false,
                error: analysisResult.error,
                message: 'Ошибка при анализе изображения через Gemini'
            });
        }

    } catch (error) {
        logger.error('Критическая ошибка при Gemini анализе', {
            error: error.message,
            stack: error.stack,
            hasDbUser: !!dbUser,
            hasHistoryItem: !!historyItem
        });
        
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Внутренняя ошибка сервера'
        });
    }
});

module.exports = router;
