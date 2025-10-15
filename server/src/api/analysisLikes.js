/**
 * API для работы с лайками анализов
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');

/**
 * POST /api/analysis-likes/:historyItemId
 * Поставить лайк анализу
 */
router.post('/:historyItemId', async (req, res) => {
  try {
    const { historyItemId } = req.params;
    const { initData } = req.body;

    // Валидация
    if (!initData) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication data'
      });
    }

    const validation = validateTelegramWebAppData(initData);
    if (!validation.isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication'
      });
    }

    const telegramId = BigInt(validation.data.user.id);

    // Получаем пользователя из БД
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Проверяем существование анализа
    const historyItem = await prisma.historyItem.findUnique({
      where: { id: parseInt(historyItemId) }
    });

    if (!historyItem) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found'
      });
    }

    // Проверяем не лайкнул ли уже
    const existingLike = await prisma.rating.findUnique({
      where: {
        userId_historyItemId: {
          userId: user.id,
          historyItemId: parseInt(historyItemId)
        }
      }
    });

    if (existingLike) {
      // Получаем текущее количество лайков
      const likesCount = await prisma.rating.count({
        where: { historyItemId: parseInt(historyItemId) }
      });

      return res.status(400).json({
        success: false,
        error: 'Already liked',
        isLiked: true,
        likesCount
      });
    }

    // Создаем лайк
    await prisma.rating.create({
      data: {
        userId: user.id,
        historyItemId: parseInt(historyItemId),
        ratingType: 'like'
      }
    });

    // Получаем общее количество лайков
    const likesCount = await prisma.rating.count({
      where: { historyItemId: parseInt(historyItemId) }
    });

    logger.info('Analysis liked', {
      userId: user.id,
      historyItemId: parseInt(historyItemId),
      likesCount
    });

    res.json({
      success: true,
      isLiked: true,
      likesCount
    });

  } catch (error) {
    logger.error('Error liking analysis', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/analysis-likes/:historyItemId
 * Удалить лайк с анализа
 */
router.delete('/:historyItemId', async (req, res) => {
  try {
    const { historyItemId } = req.params;
    const { initData } = req.query;

    // Валидация
    if (!initData) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication data'
      });
    }

    const validation = validateTelegramWebAppData(initData);
    if (!validation.isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication'
      });
    }

    const telegramId = BigInt(validation.data.user.id);

    // Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Проверяем существование лайка
    const like = await prisma.rating.findUnique({
      where: {
        userId_historyItemId: {
          userId: user.id,
          historyItemId: parseInt(historyItemId)
        }
      }
    });

    if (!like) {
      // Получаем текущее количество лайков
      const likesCount = await prisma.rating.count({
        where: { historyItemId: parseInt(historyItemId) }
      });

      return res.status(404).json({
        success: false,
        error: 'Like not found',
        isLiked: false,
        likesCount
      });
    }

    // Удаляем лайк
    await prisma.rating.delete({
      where: {
        userId_historyItemId: {
          userId: user.id,
          historyItemId: parseInt(historyItemId)
        }
      }
    });

    // Получаем обновленное количество лайков
    const likesCount = await prisma.rating.count({
      where: { historyItemId: parseInt(historyItemId) }
    });

    logger.info('Analysis unliked', {
      userId: user.id,
      historyItemId: parseInt(historyItemId),
      likesCount
    });

    res.json({
      success: true,
      isLiked: false,
      likesCount
    });

  } catch (error) {
    logger.error('Error unliking analysis', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/analysis-likes/:historyItemId/status
 * Получить статус лайка для текущего пользователя
 */
router.get('/:historyItemId/status', async (req, res) => {
  try {
    const { historyItemId } = req.params;
    const { initData } = req.query;

    // Валидация
    if (!initData) {
      // Если нет auth data - возвращаем не лайкнуто
      const likesCount = await prisma.rating.count({
        where: { historyItemId: parseInt(historyItemId) }
      });

      return res.json({
        success: true,
        isLiked: false,
        likesCount
      });
    }

    const validation = validateTelegramWebAppData(initData);
    if (!validation.isValid) {
      // Если невалидно - возвращаем не лайкнуто
      const likesCount = await prisma.rating.count({
        where: { historyItemId: parseInt(historyItemId) }
      });

      return res.json({
        success: true,
        isLiked: false,
        likesCount
      });
    }

    const telegramId = BigInt(validation.data.user.id);

    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      const likesCount = await prisma.rating.count({
        where: { historyItemId: parseInt(historyItemId) }
      });

      return res.json({
        success: true,
        isLiked: false,
        likesCount
      });
    }

    // Проверяем наличие лайка
    const like = await prisma.rating.findUnique({
      where: {
        userId_historyItemId: {
          userId: user.id,
          historyItemId: parseInt(historyItemId)
        }
      }
    });

    // Получаем общее количество лайков
    const likesCount = await prisma.rating.count({
      where: { historyItemId: parseInt(historyItemId) }
    });

    res.json({
      success: true,
      isLiked: !!like,
      likesCount
    });

  } catch (error) {
    logger.error('Error checking like status', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
