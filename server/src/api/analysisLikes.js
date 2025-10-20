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

    // Проверяем не лайкнул ли уже (ищем лайк именно с ratingType 'like')
    const existingLike = await prisma.rating.findFirst({
      where: {
        userId: user.id,
        historyItemId: parseInt(historyItemId),
        ratingType: 'like'
      }
    });

    if (existingLike) {
      return res.status(400).json({
        success: false,
        error: 'Already liked',
        isLiked: true,
        likesCount: historyItem.likesCount
      });
    }
    
    const [ratingResult, updatedItem] = await prisma.$transaction([
      prisma.rating.create({
        data: {
          userId: user.id,
          historyItemId: parseInt(historyItemId),
          ratingType: 'like'
        }
      }),
      prisma.historyItem.update({
        where: { id: parseInt(historyItemId) },
        data: { likesCount: { increment: 1 } }
      })
    ]);

    const likesCount = updatedItem.likesCount;

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
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
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

    // Проверяем существование лайка (ищем лайк именно с ratingType 'like')
    const like = await prisma.rating.findFirst({
      where: {
        userId: user.id,
        historyItemId: parseInt(historyItemId),
        ratingType: 'like'
      }
    });

    if (!like) {
      // Получаем текущий счетчик из HistoryItem
      const historyItem = await prisma.historyItem.findUnique({
        where: { id: parseInt(historyItemId) },
        select: { likesCount: true }
      });

      return res.status(404).json({
        success: false,
        error: 'Like not found',
        isLiked: false,
        likesCount: historyItem?.likesCount || 0
      });
    }

    // Атомарно: удаляем лайк + уменьшаем счетчик
    const [_, updatedItem] = await prisma.$transaction([
      prisma.rating.deleteMany({
        where: {
          userId: user.id,
          historyItemId: parseInt(historyItemId),
          ratingType: 'like'
        }
      }),
      prisma.historyItem.update({
        where: { id: parseInt(historyItemId) },
        data: { likesCount: { decrement: 1 } }
      })
    ]);

    const likesCount = updatedItem.likesCount;

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

    // Получаем HistoryItem с счетчиком
    const historyItem = await prisma.historyItem.findUnique({
      where: { id: parseInt(historyItemId) },
      select: { likesCount: true }
    });

    if (!historyItem) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found'
      });
    }

    // Валидация
    if (!initData) {
      // Если нет auth data - возвращаем не лайкнуто
      return res.json({
        success: true,
        isLiked: false,
        likesCount: historyItem.likesCount
      });
    }

    const validation = validateTelegramWebAppData(initData);
    if (!validation.isValid) {
      // Если невалидно - возвращаем не лайкнуто
      return res.json({
        success: true,
        isLiked: false,
        likesCount: historyItem.likesCount
      });
    }

    const telegramId = BigInt(validation.data.user.id);

    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.json({
        success: true,
        isLiked: false,
        likesCount: historyItem.likesCount
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

    const likesCount = historyItem.likesCount;

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
