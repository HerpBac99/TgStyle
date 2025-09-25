const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');

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
    // Если пользователь не найден в БД - разрешаем анализ (fallback)
    if (!user) {
        return {
            allowed: true,
            reason: 'user_not_found_fallback'
        };
    }

    // Проверяем активность Premium подписки
    const isPremiumActive = user.subscriptionType === 'premium' && 
                           user.subscriptionEndDate && 
                           new Date(user.subscriptionEndDate) > new Date();

    if (isPremiumActive) {
        return {
            allowed: true,
            reason: 'premium_subscription',
            subscription: 'premium'
        };
    }

    // Для Free пользователей проверяем лимиты
    if (user.subscriptionType === 'free') {
        if (user.analysesCount <= 0) {
            return {
                allowed: false,
                reason: 'weekly_limit_exceeded',
                analysesLeft: 0,
                weeklyResetDate: user.weeklyResetDate
            };
        }

        return {
            allowed: true,
            reason: 'free_subscription_limit_ok',
            analysesLeft: user.analysesCount,
            weeklyResetDate: user.weeklyResetDate
        };
    }

    // Неизвестный тип подписки - разрешаем как fallback
    return {
        allowed: true,
        reason: 'unknown_subscription_fallback'
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
                    decrement: 1 // Уменьшаем количество доступных анализов
                },
                totalAnalyses: {
                    increment: 1 // Увеличиваем общий счетчик
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
 * Сохранение результата анализа в истории
 */
async function saveAnalysisToHistory(userId, photoData, technicalAnalysis) {
    try {
        const historyItem = await prisma.historyItem.create({
            data: {
                userId,
                photoData, // base64 изображения
                technicalAnalysis, // результат FastVLM
                analysisText: null, // пользовательское описание пока пустое
                isPublic: true, // по умолчанию публичное
                createdAt: new Date()
            }
        });

        logger.info('Анализ сохранен в историю', {
            historyItemId: historyItem.id,
            userId,
            photoSize: photoData.length
        });

        return historyItem;
    } catch (error) {
        logger.error('Ошибка сохранения анализа в историю', {
            userId,
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
    TIMEOUT: 30000, // 30 секунд
    ENDPOINT: '/analyze'
};

/**
 * Анализирует изображение через FastVLM сервер
 * @param {Buffer} imageBuffer - Буфер изображения
 * @param {string} nickname - Никнейм пользователя для логирования
 * @returns {Promise<Object>} Результат анализа
 */
async function analyzeImage(imageBuffer, nickname) {
    try {
        logger.info('Отправка запроса в FastVLM сервер');

        // Конвертируем изображение в base64
        const base64Image = imageBuffer.toString('base64');
        const url = `${FASTVLM_CONFIG.HOST}:${FASTVLM_CONFIG.PORT}${FASTVLM_CONFIG.ENDPOINT}`;

        // Создаем AbortController для таймаута
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            logger.warn('FastVLM запрос прерван по таймауту');
        }, FASTVLM_CONFIG.TIMEOUT);

        // Отправляем запрос в FastVLM сервер
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_base64: base64Image,
                prompt: 'Опиши одежду на фото',
                nickname: nickname
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();

            if (result.success && result.analysis) {
                logger.info('FastVLM анализ успешен', {
                    analysisLength: result.analysis.length
                });

                // Обрабатываем и очищаем текст анализа
                let analysisText = cleanAnalysisText(result.analysis);

                return {
                    success: true,
                    analysis: analysisText,
                    fastvlm: true,
                    model: result.model_used || 'llava'
                };
            } else {
                logger.error('FastVLM сервер вернул ошибку', {
                    error: result.error,
                    status: response.status
                });
                return {
                    success: false,
                    error: result.error || 'FastVLM analysis failed'
                };
            }
        } else {
            logger.error('FastVLM сервер недоступен', {
                status: response.status,
                statusText: response.statusText,
                url
            });

            return {
                success: false,
                error: `FastVLM server error: ${response.status} ${response.statusText}`
            };
        }

    } catch (error) {
        // Обработка различных типов ошибок
        if (error.name === 'AbortError') {
            logger.error('FastVLM запрос отменен по таймауту');
            return { success: false, error: 'FastVLM timeout' };
        }

        logger.error(' Ошибка при обращении к FastVLM серверу', {
            error: error.message,
            stack: error.stack
        });

        return {
            success: false,
            error: error.message || 'FastVLM communication error'
        };
    }
}

/**
 * Очищает и исправляет текст анализа от проблем с кодировкой
 * @param {string} text - Исходный текст анализа
 * @returns {string} Очищенный текст
 */
function cleanAnalysisText(text) {
    if (!text || typeof text !== 'string') {
        return 'Анализ выполнен, но текст описания недоступен.';
    }

    let cleanedText = text;

    // Исправляем проблемы с кодировкой UTF-8
    if (cleanedText.includes('�') || cleanedText.includes('\ufffd')) {
        cleanedText = cleanedText.replace(/�/g, '').replace(/\ufffd/g, '');
        logger.debug('Исправлены проблемы с кодировкой текста');
    }

    // Удаляем лишние пробелы и пустые строки
    cleanedText = cleanedText.trim();

    // Проверяем, что текст не пустой после очистки
    if (!cleanedText) {
        return 'Анализ выполнен, но текст описания недоступен.';
    }

    return cleanedText;
}

/**
 * Анализ изображения одежды
 * POST /api/analyze
 */
router.post('/', async (req, res) => {
    const { photo, initData } = req.body;
    let dbUser = null;
    let historyItem = null;

    try {
        // Проверяем обязательные параметры
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

        // Валидируем Telegram
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

        logger.info('Валидация Telegram успешна');

        // Получаем информацию о пользователе из Telegram
        const telegramUser = validationResult.data.user;
        logger.info('Данные пользователя Telegram', {
            telegramId: telegramUser?.id,
            username: telegramUser?.username,
            firstName: telegramUser?.first_name,
            lastName: telegramUser?.last_name
        });

        const nickname = telegramUser?.username ||
                        `${telegramUser?.first_name || ''}${telegramUser?.last_name || ''}`.trim() ||
                        `user_${telegramUser?.id || 'unknown'}`;

        // Получаем пользователя из базы данных
        try {
            dbUser = await getUserByTelegramId(telegramUser.id);
            
            if (dbUser) {
                logger.info('Пользователь найден в БД', {
                    userId: dbUser.id,
                    subscriptionType: dbUser.subscriptionType,
                    analysesLeft: dbUser.analysesCount
                });

                // Проверяем лимиты анализа
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
                        message: 'Превышен недельный лимит анализов',
                        analysesLeft: limitsCheck.analysesLeft,
                        weeklyResetDate: limitsCheck.weeklyResetDate,
                        subscriptionType: dbUser.subscriptionType
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
            // Продолжаем без проверки лимитов (fallback)
        }

        // Декодируем изображение
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

        // Проверяем размер изображения
        if (imageBuffer.length < 100) {
            logger.error('Изображение слишком маленькое');
            return res.status(400).json({
                success: false,
                error: 'Image too small'
            });
        }

        logger.info(`Начинаем анализ для пользователя: ${nickname}`);

        // Отправляем на анализ в FastVLM
        const analysisResult = await analyzeImage(imageBuffer, nickname);

        if (analysisResult.success) {
            logger.info('FastVLM анализ завершен успешно');

            // Сохраняем результат в базе данных и обновляем счетчики
            try {
                if (dbUser) {
                    // Сохраняем в историю
                    historyItem = await saveAnalysisToHistory(
                        dbUser.id, 
                        photo, // base64 изображения
                        analysisResult.analysis
                    );

                    // Обновляем счетчики только для free пользователей
                    if (dbUser.subscriptionType === 'free') {
                        await updateUserCounters(dbUser.id);
                        logger.info('Счетчики пользователя обновлены после анализа');
                    }
                } else {
                    logger.warn('Пользователь не найден в БД, анализ не сохранен в историю');
                }
            } catch (dbError) {
                logger.error('Ошибка сохранения результата в БД', {
                    error: dbError.message,
                    userId: dbUser?.id
                });
                // Продолжаем, несмотря на ошибку БД
            }

            // Возвращаем результат анализа
            const response = {
                success: true,
                analysis: analysisResult.analysis,
                model: analysisResult.model || 'llava'
            };

            // Добавляем информацию о лимитах если пользователь найден
            if (dbUser) {
                const updatedUser = await getUserByTelegramId(telegramUser.id);
                if (updatedUser) {
                    response.subscription = {
                        type: updatedUser.subscriptionType,
                        analysesLeft: updatedUser.subscriptionType === 'premium' ? -1 : updatedUser.analysesCount,
                        totalAnalyses: updatedUser.totalAnalyses
                    };
                }
            }

            // Добавляем ID сохраненного элемента истории
            if (historyItem) {
                response.historyItemId = historyItem.id;
            }

            return res.json(response);

        } else {
            logger.error('Ошибка анализа FastVLM', { error: analysisResult.error });
            return res.status(500).json({
                success: false,
                error: analysisResult.error,
                message: 'Ошибка при анализе изображения'
            });
        }

    } catch (error) {
        logger.error('Критическая ошибка при анализе', {
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