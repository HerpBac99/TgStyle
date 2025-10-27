/**
 * API для работы с shared капсулами
 * Получение публичных капсул по shareId
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { requireTelegramAuth, optionalTelegramAuth } = require('../middleware/telegramAuth');
const FileService = require('../services/FileService');

/**
 * Получить shared капсулу по shareId
 * GET /shared-capsule/:shareId
 */
async function getSharedCapsule(req, res) {
  try {
    const { shareId } = req.params;
    const { initData } = req.query;

    logger.info('Loading shared capsule', { shareId });

    // Ищем капсулу по shareId
    const capsule = await prisma.capsule.findUnique({
      where: {
        shareId: shareId
      },
      include: {
        items: {
          select: {
            id: true,
            imagePath: true,
            description: true,
            color: true,
            material: true,
            style: true,
            fit: true,
            category: true,
            subtype: true,
            season: true,
            pattern: true
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            telegramId: true
          }
        }
      }
    });

    if (!capsule) {
      logger.warn('Shared capsule not found', { shareId });
      return res.status(404).json({
        success: false,
        error: 'Capsule not found'
      });
    }

    // Увеличиваем счетчик просмотров
    await prisma.capsule.update({
      where: { id: capsule.id },
      data: {
        viewsCount: {
          increment: 1
        }
      }
    });

    // Проверяем лайк текущего пользователя если он авторизован
    let isLiked = false;
    let currentUser = null;

    if (initData) {
      try {
        // Парсим initData для получения telegramId
        const urlParams = new URLSearchParams(initData);
        const userParam = urlParams.get('user');
        
        if (userParam) {
          const userData = JSON.parse(decodeURIComponent(userParam));
          const telegramId = BigInt(userData.id);
          
          currentUser = await prisma.user.findUnique({
            where: { telegramId }
          });

          if (currentUser) {
            const userLike = await prisma.capsuleLike.findUnique({
              where: {
                userId_capsuleId: {
                  userId: currentUser.id,
                  capsuleId: capsule.id
                }
              }
            });
            isLiked = !!userLike;
          }
        }
      } catch (parseError) {
        logger.warn('Failed to parse initData for like check', { parseError });
      }
    }

    logger.info('Shared capsule loaded successfully', {
      shareId,
      capsuleId: capsule.id,
      authorTelegramId: capsule.user.telegramId.toString(),
      itemsCount: capsule.items.length,
      isLiked,
      viewsCount: capsule.viewsCount + 1
    });

    res.json({
      success: true,
      data: {
        capsuleId: capsule.id,
        name: capsule.name,
        description: capsule.description,
        thumbnailUrl: FileService.getImageUrl(capsule.thumbnailPath, 'capsule', capsule.user.telegramId),
        canvasData: capsule.canvasData,
        metadata: capsule.metadata,
        analysis: capsule.analysis,
        createdAt: capsule.createdAt,
        likesCount: capsule.likesCount || 0,
        viewsCount: capsule.viewsCount + 1,
        isLiked: isLiked,
        items: capsule.items.map(item => ({
          id: item.id,
          imagePath: item.imagePath,
          imageUrl: FileService.getImageUrl(item.imagePath, 'wardrobe', capsule.user.telegramId),
          description: item.description,
          color: item.color,
          material: item.material,
          style: item.style,
          fit: item.fit,
          category: item.category,
          subtype: item.subtype,
          season: item.season,
          pattern: item.pattern
        })),
        author: {
          firstName: capsule.user.firstName,
          lastName: capsule.user.lastName,
          username: capsule.user.username
        }
      }
    });

  } catch (error) {
    logger.error('Error loading shared capsule', { shareId: req.params.shareId, error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Создать shareId для капсулы (для sharing)
 * POST /shared-capsule
 */
async function createSharedCapsule(req, res) {
  try {
    const { capsuleId, shareId } = req.body;

    // Telegram данные уже валидированы middleware
    const telegramId = req.telegramId;

    logger.info('Creating shared capsule', { capsuleId, shareId, telegramId: telegramId.toString() });

    // Проверяем что капсула принадлежит пользователю
    const capsule = await prisma.capsule.findFirst({
      where: {
        id: parseInt(capsuleId),
        telegramId: telegramId
      }
    });

    if (!capsule) {
      return res.status(404).json({
        success: false,
        error: 'Capsule not found or access denied'
      });
    }

    // Удаляем префикс "capsule_" для хранения в БД
    const cleanShareId = shareId.startsWith('capsule_') 
      ? shareId.replace('capsule_', '') 
      : shareId;

    // Обновляем капсулу с shareId и делаем её публичной
    const updatedCapsule = await prisma.capsule.update({
      where: { id: parseInt(capsuleId) },
      data: {
        shareId: cleanShareId,
        isPublic: true
      }
    });

    logger.info('Capsule shared successfully', {
      capsuleId,
      shareId: cleanShareId,
      telegramId: telegramId.toString()
    });

    res.json({
      success: true,
      shareId: cleanShareId,
      capsule: {
        id: updatedCapsule.id,
        shareId: cleanShareId,
        isPublic: updatedCapsule.isPublic
      }
    });

  } catch (error) {
    logger.error('Error creating shared capsule', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Маршруты
router.get('/:shareId', getSharedCapsule);
router.post('/', requireTelegramAuth, createSharedCapsule);

module.exports = router;