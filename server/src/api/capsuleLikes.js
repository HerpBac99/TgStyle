/**
 * API для работы с лайками капсул
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');

/**
 * POST /api/capsule-likes/:capsuleId
 * Поставить лайк капсуле
 */
router.post('/:capsuleId', async (req, res) => {
  try {
    const { capsuleId } = req.params;
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

    // Проверяем существование капсулы
    const capsule = await prisma.capsule.findUnique({
      where: { id: parseInt(capsuleId) }
    });

    if (!capsule) {
      return res.status(404).json({
        success: false,
        error: 'Capsule not found'
      });
    }

    // Проверяем не лайкнул ли уже
    const existingLike = await prisma.capsuleLike.findUnique({
      where: {
        userId_capsuleId: {
          userId: user.id,
          capsuleId: parseInt(capsuleId)
        }
      }
    });

    if (existingLike) {
      return res.status(400).json({
        success: false,
        error: 'Already liked',
        isLiked: true,
        likesCount: capsule.likesCount
      });
    }
    
    // Атомарно: создаем лайк + увеличиваем счетчик
    const [likeResult, updatedCapsule] = await prisma.$transaction([
      prisma.capsuleLike.create({
        data: {
          userId: user.id,
          capsuleId: parseInt(capsuleId)
        }
      }),
      prisma.capsule.update({
        where: { id: parseInt(capsuleId) },
        data: { likesCount: { increment: 1 } }
      })
    ]);

    const likesCount = updatedCapsule.likesCount;

    logger.info('Capsule liked', {
      userId: user.id,
      capsuleId: parseInt(capsuleId),
      likesCount
    });

    res.json({
      success: true,
      isLiked: true,
      likesCount
    });
  } catch (error) {
    logger.error('Error liking capsule', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * DELETE /api/capsule-likes/:capsuleId
 * Удалить лайк с капсулы
 */
router.delete('/:capsuleId', async (req, res) => {
  try {
    const { capsuleId } = req.params;
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
    const like = await prisma.capsuleLike.findUnique({
      where: {
        userId_capsuleId: {
          userId: user.id,
          capsuleId: parseInt(capsuleId)
        }
      }
    });

    if (!like) {
      // Получаем текущий счетчик из Capsule
      const capsule = await prisma.capsule.findUnique({
        where: { id: parseInt(capsuleId) },
        select: { likesCount: true }
      });

      return res.status(404).json({
        success: false,
        error: 'Like not found',
        isLiked: false,
        likesCount: capsule?.likesCount || 0
      });
    }

    // Атомарно: удаляем лайк + уменьшаем счетчик
    const [_, updatedCapsule] = await prisma.$transaction([
      prisma.capsuleLike.deleteMany({
        where: {
          userId: user.id,
          capsuleId: parseInt(capsuleId)
        }
      }),
      prisma.capsule.update({
        where: { id: parseInt(capsuleId) },
        data: { likesCount: { decrement: 1 } }
      })
    ]);

    const likesCount = updatedCapsule.likesCount;

    logger.info('Capsule unliked', {
      userId: user.id,
      capsuleId: parseInt(capsuleId),
      likesCount
    });

    res.json({
      success: true,
      isLiked: false,
      likesCount
    });

  } catch (error) {
    logger.error('Error unliking capsule', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/capsule-likes/:capsuleId/status
 * Получить статус лайка для текущего пользователя
 */
router.get('/:capsuleId/status', async (req, res) => {
  try {
    const { capsuleId } = req.params;
    const { initData } = req.query;

    // Получаем Capsule с счетчиком
    const capsule = await prisma.capsule.findUnique({
      where: { id: parseInt(capsuleId) },
      select: { likesCount: true }
    });

    if (!capsule) {
      return res.status(404).json({
        success: false,
        error: 'Capsule not found'
      });
    }

    // Валидация
    if (!initData) {
      // Если нет auth data - возвращаем не лайкнуто
      return res.json({
        success: true,
        isLiked: false,
        likesCount: capsule.likesCount
      });
    }

    const validation = validateTelegramWebAppData(initData);
    if (!validation.isValid) {
      // Если невалидно - возвращаем не лайкнуто
      return res.json({
        success: true,
        isLiked: false,
        likesCount: capsule.likesCount
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
        likesCount: capsule.likesCount
      });
    }

    // Проверяем наличие лайка
    const like = await prisma.capsuleLike.findUnique({
      where: {
        userId_capsuleId: {
          userId: user.id,
          capsuleId: parseInt(capsuleId)
        }
      }
    });

    const likesCount = capsule.likesCount;

    res.json({
      success: true,
      isLiked: !!like,
      likesCount
    });

  } catch (error) {
    logger.error('Error checking capsule like status', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
