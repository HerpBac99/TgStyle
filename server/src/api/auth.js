const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');

// Импортируем Prisma клиент
const prisma = require('../lib/prisma');

/**
 * Получение даты следующего понедельника для weekly reset
 */
function getNextMondayDate() {
    const now = new Date();
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7; // 1 = понедельник
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0); // Начало дня
    return nextMonday;
}

/**
 * Проверка и обновление weekly reset для пользователя
 */
async function checkAndUpdateWeeklyReset(user) {
    const now = new Date();
    const resetDate = new Date(user.weeklyResetDate);
    
    // Если время сброса прошло, обновляем лимиты
    if (now > resetDate && user.subscriptionType === 'free') {
        logger.info('Выполняется weekly reset для пользователя', {
            userId: user.id,
            telegramId: user.telegramId,
            oldResetDate: user.weeklyResetDate,
            newResetDate: getNextMondayDate()
        });

        // Обновляем лимиты и дату следующего сброса
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                analysesCount: 3, // Восстанавливаем лимит
                weeklyResetDate: getNextMondayDate(),
                updatedAt: new Date()
            }
        });

        return updatedUser;
    }
    
    return user;
}

/**
 * Создание или обновление пользователя в базе данных
 */
async function createOrUpdateUser(telegramUserData) {
    const telegramId = BigInt(telegramUserData.id);
    
    try {
        // Ищем существующего пользователя
        let user = await prisma.user.findUnique({
            where: { telegramId }
        });

        if (user) {
            // Обновляем данные существующего пользователя
            logger.info('Обновление существующего пользователя', { 
                userId: user.id, 
                telegramId: user.telegramId 
            });

            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    firstName: telegramUserData.first_name,
                    lastName: telegramUserData.last_name || null,
                    username: telegramUserData.username || null,
                    avatarUrl: telegramUserData.photo_url || null,
                    updatedAt: new Date(),
                    isActive: true
                }
            });

            // Проверяем и обновляем weekly reset
            user = await checkAndUpdateWeeklyReset(user);
        } else {
            // Создаем нового пользователя
            logger.info('Создание нового пользователя', { telegramId });

            user = await prisma.user.create({
                data: {
                    telegramId,
                    firstName: telegramUserData.first_name,
                    lastName: telegramUserData.last_name || null,
                    username: telegramUserData.username || null,
                    avatarUrl: telegramUserData.photo_url || null,
                    analysesCount: 10, // Стартовый лимит для free пользователей
                    subscriptionType: 'free',
                    subscriptionEndDate: null,
                    totalAnalyses: 0,
                    weeklyResetDate: getNextMondayDate(),
                    isActive: true
                }
            });

            logger.info('Новый пользователь создан', { 
                userId: user.id, 
                telegramId: user.telegramId 
            });
        }

        return user;
    } catch (error) {
        logger.error('Ошибка при создании/обновлении пользователя', {
            telegramId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Формирование ответа с информацией о пользователе и подписке
 */
function formatUserResponse(user) {
    // Проверяем активность Premium подписки
    const isPremiumActive = user.subscriptionType === 'premium' && 
                           user.subscriptionEndDate && 
                           new Date(user.subscriptionEndDate) > new Date();

    return {
        id: user.id,
        telegramId: user.telegramId.toString(), // Конвертируем BigInt в строку
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        subscription: {
            type: user.subscriptionType,
            isActive: isPremiumActive || user.subscriptionType === 'free',
            analysesLeft: isPremiumActive ? -1 : user.analysesCount, // -1 означает безлимитно
            totalAnalyses: user.totalAnalyses,
            weeklyResetDate: user.weeklyResetDate,
            subscriptionEndDate: user.subscriptionEndDate
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

/**
 * Handle Telegram authentication
 * POST /api/auth
 */
router.post('/', async (req, res) => {
    const { initData } = req.body;
    let dbUser = null;
    
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
            logger.error('Ошибка валидации Telegram initData', {
                error: validationResult.error
            });
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }
        
        // Extract user information from Telegram
        const { user: telegramUser } = validationResult.data;

        logger.info('Telegram данные пользователя получены', {
            telegramId: telegramUser.id,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name || '',
            username: telegramUser.username || ''
        });

        // Работа с базой данных
        try {
            // Создаем или обновляем пользователя в PostgreSQL
            dbUser = await createOrUpdateUser(telegramUser);
            
            logger.info('Пользователь успешно аутентифицирован через PostgreSQL', {
                userId: dbUser.id,
                telegramId: dbUser.telegramId,
                subscriptionType: dbUser.subscriptionType,
                analysesLeft: dbUser.analysesCount
            });

            // Возвращаем полные данные пользователя с информацией о подписке
            const userResponse = formatUserResponse(dbUser);
            
            return res.json({
                success: true,
                user: userResponse,
                message: 'Authentication successful'
            });

        } catch (dbError) {
            // Fallback: если база данных недоступна, работаем без неё
            logger.error('Ошибка работы с базой данных, используем fallback', {
                error: dbError.message,
                stack: dbError.stack,
                telegramId: telegramUser.id
            });

            // Возвращаем минимальные данные из Telegram без информации о подписке
            return res.json({
                success: true,
                user: {
                    id: telegramUser.id,
                    telegramId: telegramUser.id.toString(),
                    firstName: telegramUser.first_name,
                    lastName: telegramUser.last_name || null,
                    username: telegramUser.username || null,
                    avatarUrl: telegramUser.photo_url || null,
                    subscription: {
                        type: 'free',
                        isActive: true,
                        analysesLeft: 3, // Дефолтный лимит при fallback
                        totalAnalyses: 0,
                        weeklyResetDate: getNextMondayDate(),
                        subscriptionEndDate: null
                    }
                },
                message: 'Authentication successful (database unavailable)',
                fallback: true
            });
        }

    } catch (error) {
        logger.error('Критическая ошибка аутентификации', {
            error: error.message,
            stack: error.stack,
            initData: initData ? initData.substring(0, 100) + '...' : 'undefined',
            hasDbUser: !!dbUser
        });
        
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Ошибка сервера при аутентификации'
        });
    }
});

module.exports = router; 