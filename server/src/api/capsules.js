/**
 * API для работы с капсулами
 * Создание, получение, обновление и анализ капсул
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { requireTelegramAuth, optionalTelegramAuth } = require('../middleware/telegramAuth');
const wardrobeUsageService = require('../services/wardrobeUsageService');
const capsuleSimilarityService = require('../services/capsuleSimilarityService');
const FileService = require('../services/FileService');
const SmartCapsuleGenerator = require('../services/SmartCapsuleGenerator');



/**
 * Константы для FastVLM интеграции
 */
const FASTVLM_CONFIG = {
  HOST: 'http://127.0.0.1',
  PORT: 3001,
  TIMEOUT: 60000, // 60 секунд для генерации капсул
  ENDPOINT: '/generate-capsules'
};



/**
 * Создать новую капсулу
 */
async function createCapsule(req, res) {
  try {
    const { name, canvasData, thumbnailImage, itemIds, metadata } = req.body;

    // Telegram данные уже валидированы middleware
    const telegramId = req.telegramId;

    // Валидация входных данных
    if (!canvasData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: canvasData'
      });
    }

    // Сохраняем thumbnail изображение если оно передано
    let thumbnailPath = null;
    if (thumbnailImage) {
      thumbnailPath = await FileService.saveCapsuleThumbnail(telegramId, thumbnailImage);
    }

    // Проверяем, что у пользователя есть доступ к wardrobe items
    const wardrobeItemIds = itemIds || [];
    if (wardrobeItemIds.length > 0) {
      const userItems = await prisma.wardrobeItem.findMany({
        where: {
          telegramId: telegramId,
          id: { in: wardrobeItemIds }
        },
        select: { id: true }
      });

      const userItemIds = userItems.map(item => item.id);
      const invalidItems = wardrobeItemIds.filter(id => !userItemIds.includes(id));

      if (invalidItems.length > 0) {
        return res.status(403).json({
          success: false,
          error: `User does not have access to wardrobe items: ${invalidItems.join(', ')}`
        });
      }
    }

    // Подготовка metadata для автогенерированных капсул
    let capsuleMetadata = null;
    if (metadata) {
      capsuleMetadata = {
        source: metadata.source || 'manual', // 'ai_generated' или 'manual'
        recommendations: metadata.recommendations || null,
        reasoning: metadata.reasoning || null,
        season: metadata.season || null,
        description: metadata.description || null
      };
    }

    // Создаем капсулу
    const capsule = await prisma.capsule.create({
      data: {
        telegramId: telegramId,
        name: name || null,
        canvasData: canvasData,
        thumbnailPath: thumbnailPath,
        metadata: capsuleMetadata,
        items: wardrobeItemIds.length > 0 ? {
          connect: wardrobeItemIds.map(id => ({ id }))
        } : undefined
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
            fit: true
          }
        }
      }
    });

    logger.info(`Capsule created: ${capsule.id} for user ${telegramId}`, {
      name: name,
      thumbnailPath: thumbnailPath,
      itemCount: capsule.items.length,
      source: capsuleMetadata?.source || 'manual'
    });

    res.json({
      success: true,
      capsule: {
        id: capsule.id,
        name: capsule.name,
        thumbnailUrl: FileService.getImageUrl(capsule.thumbnailPath, 'capsule', telegramId),
        canvasData: capsule.canvasData,
        metadata: capsule.metadata,
        createdAt: capsule.createdAt,
        itemCount: capsule.items.length,
        items: capsule.items
      }
    });

  } catch (error) {
    console.error('Error creating capsule:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Получить капсулы пользователя
 * FIXED: поддержка initData из headers (X-Init-Data)
 */
async function getUserCapsules(req, res) {
  try {
    // Telegram данные уже валидированы middleware
    const telegramId = req.telegramId;

    // Получаем пользователя для проверки лайков
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const capsules = await prisma.capsule.findMany({
      where: {
        telegramId: telegramId
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
            fit: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take
    });

    const total = await prisma.capsule.count({
      where: { telegramId: telegramId }
    });

    // Получаем лайки текущего пользователя для этих капсул
    const userLikes = await prisma.capsuleLike.findMany({
      where: {
        userId: user.id,
        capsuleId: {
          in: capsules.map(c => c.id)
        }
      }
    });

    const likedCapsuleIds = new Set(userLikes.map(like => like.capsuleId));

    res.json({
      success: true,
      capsules: capsules.map(capsule => ({
        id: capsule.id,
        name: capsule.name,
        thumbnailUrl: FileService.getImageUrl(capsule.thumbnailPath, 'capsule', telegramId),
        canvasData: capsule.canvasData,
        metadata: capsule.metadata,
        analysis: capsule.analysis,
        createdAt: capsule.createdAt,
        likesCount: capsule.likesCount || 0,
        isLiked: likedCapsuleIds.has(capsule.id),
        itemCount: capsule.items.length,
        items: capsule.items
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error getting user capsules:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Получить капсулу по ID
 */
async function getCapsule(req, res) {
  try {
    const { id } = req.params;
    const { telegramId } = req.query;

    const capsule = await prisma.capsule.findFirst({
      where: {
        id: parseInt(id),
        telegramId: telegramId ? BigInt(telegramId) : undefined
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
            fit: true
          }
        }
      }
    });

    if (!capsule) {
      return res.status(404).json({
        success: false,
        error: 'Capsule not found'
      });
    }

    // Проверяем лайк текущего пользователя на эту капсулу
    let isLiked = false;
    if (telegramId) {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) }
      });

      if (user) {
        const userLike = await prisma.capsuleLike.findUnique({
          where: {
            userId_capsuleId: {
              userId: user.id,
              capsuleId: parseInt(id)
            }
          }
        });
        isLiked = !!userLike;
      }
    }

    res.json({
      success: true,
      capsule: {
        id: capsule.id,
        name: capsule.name,
        description: capsule.description,
        thumbnailUrl: FileService.getImageUrl(capsule.thumbnailPath, 'capsule', capsule.telegramId),
        canvasData: capsule.canvasData,
        metadata: capsule.metadata,
        analysis: capsule.analysis,
        analysisDate: capsule.analysisDate,
        createdAt: capsule.createdAt,
        likesCount: capsule.likesCount || 0,
        isLiked: isLiked,
        itemCount: capsule.items.length,
        items: capsule.items
      }
    });

  } catch (error) {
    console.error('Error getting capsule:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Обновить капсулу
 */
async function updateCapsule(req, res) {
  try {
    const { id } = req.params;
    const { canvasData, thumbnailImage, itemIds } = req.body;

    // Telegram данные уже валидированы middleware
    const telegramId = req.telegramId;

    // Получаем пользователя для проверки лайков
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    const capsule = await prisma.capsule.findFirst({
      where: {
        id: parseInt(id),
        telegramId: telegramId
      }
    });

    if (!capsule) {
      return res.status(404).json({
        success: false,
        error: 'Capsule not found or access denied'
      });
    }

    // Сохраняем thumbnail изображение если оно передано
    let thumbnailPath = capsule.thumbnailPath; // сохраняем старый путь по умолчанию
    if (thumbnailImage) {
      // Удаляем старый файл перед сохранением нового
      await FileService.deleteOldCapsuleThumbnail(telegramId, capsule.thumbnailPath);
      // Сохраняем новый файл
      thumbnailPath = await FileService.saveCapsuleThumbnail(telegramId, thumbnailImage);
    }

    // Обновляем связи с wardrobe items если переданы новые
    const updateData = {
      canvasData: canvasData || capsule.canvasData,
      thumbnailPath: thumbnailPath
    };

    // Проверяем доступ к wardrobe items если они переданы
    const wardrobeItemIds = itemIds || [];
    if (wardrobeItemIds.length > 0) {
      const userItems = await prisma.wardrobeItem.findMany({
        where: {
          telegramId: telegramId,
          id: { in: wardrobeItemIds }
        },
        select: { id: true }
      });

      const userItemIds = userItems.map(item => item.id);
      const invalidItems = wardrobeItemIds.filter(id => !userItemIds.includes(id));

      if (invalidItems.length > 0) {
        return res.status(403).json({
          success: false,
          error: `User does not have access to wardrobe items: ${invalidItems.join(', ')}`
        });
      }

      updateData.items = {
        set: wardrobeItemIds.map(id => ({ id }))
      };
    }

    const updatedCapsule = await prisma.capsule.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        items: {
          select: {
            id: true,
            imagePath: true,
            description: true,
            color: true,
            material: true,
            style: true,
            fit: true
          }
        }
      }
    });

    // Проверяем лайк текущего пользователя на эту капсулу
    let isLiked = false;
    if (user) {
      const userLike = await prisma.capsuleLike.findUnique({
        where: {
          userId_capsuleId: {
            userId: user.id,
            capsuleId: parseInt(id)
          }
        }
      });
      isLiked = !!userLike;
    }

    logger.info(`Capsule updated: ${updatedCapsule.id} for user ${telegramId}`, {
      thumbnailPath: thumbnailPath,
      itemCount: updatedCapsule.items.length
    });

    res.json({
      success: true,
      capsule: {
        id: updatedCapsule.id,
        name: updatedCapsule.name,
        thumbnailUrl: FileService.getImageUrl(updatedCapsule.thumbnailPath, 'capsule', telegramId),
        canvasData: updatedCapsule.canvasData,
        metadata: updatedCapsule.metadata,
        createdAt: updatedCapsule.createdAt,
        likesCount: updatedCapsule.likesCount || 0,
        isLiked: isLiked,
        itemCount: updatedCapsule.items.length,
        items: updatedCapsule.items
      }
    });

  } catch (error) {
    console.error('Error updating capsule:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Удалить капсулу
 */
async function deleteCapsule(req, res) {
  try {
    const { id } = req.params;

    // Telegram данные уже валидированы middleware
    const telegramId = req.telegramId;

    const capsule = await prisma.capsule.findFirst({
      where: {
        id: parseInt(id),
        telegramId: telegramId
      }
    });

    if (!capsule) {
      return res.status(404).json({
        success: false,
        error: 'Capsule not found or access denied'
      });
    }

    // Удаляем файл миниатюры перед удалением капсулы
    await FileService.deleteOldCapsuleThumbnail(telegramId, capsule.thumbnailPath);

    await prisma.capsule.delete({
      where: { id: parseInt(id) }
    });

    logger.info(`Capsule deleted: ${id} for user ${telegramId}`);

    res.json({
      success: true,
      message: 'Capsule deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting capsule:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Генерация 3 вариантов капсул через Gemini AI
 * POST /api/capsules/generate
 */
async function generateCapsules(req, res) {
  try {
    const { excludeCombinations } = req.body;

    // Telegram данные уже валидированы middleware
    const telegramId = req.telegramId;

    logger.info('Capsule generation requested', {
      telegramId: telegramId.toString(),
      excludeCombinations: excludeCombinations?.length || 0
    });

    // Получаем все вещи гардероба с полными данными (9 полей)
    // ВАЖНО: embedding загружаем через raw SQL, т.к. это Unsupported тип в Prisma
    const wardrobeItemsBase = await prisma.wardrobeItem.findMany({
      where: { telegramId },
      select: {
        id: true,
        category: true,
        subtype: true,
        color: true,
        material: true,
        fit: true,
        style: true,
        season: true,
        pattern: true,
        description: true,
        imagePath: true
      }
    });

    // Загружаем embeddings через raw SQL для вещей с векторами
    const itemIds = wardrobeItemsBase.map(item => item.id);
    const embeddings = await prisma.$queryRaw`
      SELECT id, embedding::text as embedding
      FROM wardrobe_items
      WHERE id = ANY(${itemIds}::int[])
      AND embedding IS NOT NULL
    `;

    // Создаем map для быстрого доступа к embeddings
    const embeddingsMap = new Map();
    for (const row of embeddings) {
      try {
        // Парсим vector из PostgreSQL формата в JSON array
        const vectorStr = row.embedding.replace(/[\[\]]/g, '');
        const vector = vectorStr.split(',').map(v => parseFloat(v.trim()));
        embeddingsMap.set(row.id, vector);
      } catch (e) {
        logger.warn('Failed to parse embedding', { itemId: row.id, error: e.message });
      }
    }

    // Объединяем данные
    const wardrobeItems = wardrobeItemsBase.map(item => ({
      ...item,
      embedding: embeddingsMap.get(item.id) || null
    }));

    // Проверка минимального количества вещей
    if (wardrobeItems.length < 3) {
      logger.warn('Insufficient wardrobe items for generation', {
        telegramId: telegramId.toString(),
        itemCount: wardrobeItems.length
      });
      return res.status(400).json({
        success: false,
        error: 'Недостаточно вещей в гардеробе (минимум 3)'
      });
    }

    // Получаем существующие капсулы для вычисления usageCount
    const existingCapsules = await prisma.capsule.findMany({
      where: { telegramId },
      select: { id: true, canvasData: true }
    });

    logger.info('Loaded wardrobe and capsules', {
      telegramId: telegramId.toString(),
      wardrobeItemsCount: wardrobeItems.length,
      existingCapsulesCount: existingCapsules.length
    });

    // Вычисляем usageCount для каждой вещи
    const itemsWithUsage = wardrobeUsageService.calculateUsageStats(
      wardrobeItems,
      existingCapsules
    );

    // Приоритизируем редко используемые вещи (1-3)
    const prioritizedItems = wardrobeUsageService.prioritizeRarelyUsedItems(itemsWithUsage);

    // Определяем текущий сезон и месяц
    const currentSeason = wardrobeUsageService.getCurrentSeason();
    const currentMonth = wardrobeUsageService.getCurrentMonth();

    logger.info('Usage stats calculated', {
      telegramId: telegramId.toString(),
      currentSeason,
      currentMonth,
      unusedItems: itemsWithUsage.filter(i => i.usageCount === 0).length,
      rarelyUsedItems: itemsWithUsage.filter(i => i.usageCount >= 1 && i.usageCount <= 3).length,
      popularItems: itemsWithUsage.filter(i => i.usageCount > 3).length
    });

    // Используем новый умный генератор капсул
    const smartGenerator = new SmartCapsuleGenerator();
    
    // Подготавливаем данные существующих капсул
    const existingCapsulesData = existingCapsules.map(c => ({
      itemIds: wardrobeUsageService.extractItemIdsFromCanvas(c.canvasData)
    }));

    logger.info('Generating capsules with smart algorithm', {
      telegramId: telegramId.toString(),
      itemsCount: prioritizedItems.length,
      currentSeason,
      existingCapsulesCount: existingCapsulesData.length
    });

    // Генерируем капсулы через умный алгоритм
    const generatedCapsules = await smartGenerator.generateCapsules(
      prioritizedItems,
      currentSeason,
      existingCapsulesData,
      excludeCombinations || []
    );

    logger.info('Capsules generated by smart algorithm', {
      telegramId: telegramId.toString(),
      capsulesCount: generatedCapsules.length
    });

    // Проверяем уникальность и обогащаем данными
    const enrichedCapsules = generatedCapsules.map(capsule => {
      const isUnique = capsuleSimilarityService.isUnique(
        capsule.itemIds,
        existingCapsulesData,
        70 // порог 70% (немного снижен для большего разнообразия)
      );

      return {
        ...capsule,
        isUnique
      };
    });

    logger.info('Capsule generation completed', {
      telegramId: telegramId.toString(),
      totalGenerated: enrichedCapsules.length,
      uniqueCapsules: enrichedCapsules.filter(c => c.isUnique).length,
    });

    res.json({
      success: true,
      capsules: enrichedCapsules
    });

  } catch (error) {
    logger.error('Error in capsule generation', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Получить публичные капсулы
 */
async function getPublicCapsules(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Получаем текущего пользователя для проверки лайков и исключения его капсул
    // Данные могут быть null если пользователь не авторизован (optional middleware)
    let currentUser = null;
    const currentUserTelegramId = req.telegramId;

    if (currentUserTelegramId) {
      currentUser = await prisma.user.findUnique({
        where: { telegramId: currentUserTelegramId }
      });
    }

    // Загружаем капсулы всех пользователей, КРОМЕ текущего
    const capsules = await prisma.capsule.findMany({
      where: currentUserTelegramId ? {
        telegramId: {
          not: currentUserTelegramId
        }
      } : undefined,
      include: {
        items: {
          select: {
            id: true,
            imagePath: true,
            description: true,
            color: true,
            material: true,
            style: true,
            fit: true
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            avatarUrl: true,
            telegramId: true
          }
        }
      },
      orderBy: [
        { likesCount: 'desc' },  // Сначала по популярности
        { createdAt: 'desc' }     // Потом по новизне
      ],
      skip,
      take
    });

    const total = await prisma.capsule.count({
      where: currentUserTelegramId ? {
        telegramId: {
          not: currentUserTelegramId
        }
      } : undefined
    });

    // Получаем лайки текущего пользователя если он авторизован
    let userLikes = [];
    if (currentUser) {
      userLikes = await prisma.capsuleLike.findMany({
        where: {
          userId: currentUser.id,
          capsuleId: {
            in: capsules.map(c => c.id)
          }
        }
      });
    }

    const likedCapsuleIds = new Set(userLikes.map(like => like.capsuleId));

    res.json({
      success: true,
      capsules: capsules.map(capsule => ({
        id: capsule.id,
        name: capsule.name,
        description: capsule.description,
        thumbnailUrl: FileService.getImageUrl(capsule.thumbnailPath, 'capsule', capsule.user.telegramId),
        canvasData: capsule.canvasData,
        metadata: capsule.metadata,
        analysis: capsule.analysis,
        createdAt: capsule.createdAt,
        likesCount: capsule.likesCount || 0,
        isLiked: likedCapsuleIds.has(capsule.id),
        itemCount: capsule.items.length,
        items: capsule.items,
        author: {
          firstName: capsule.user.firstName,
          lastName: capsule.user.lastName,
          username: capsule.user.username
        }
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + take < total
      }
    });

  } catch (error) {
    logger.error('Error getting public capsules', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Маршруты для капсул

/**
 * POST /api/capsules/generate
 * Генерация 3 вариантов капсул через Gemini AI
 * ВАЖНО: Должен быть ПЕРЕД POST /api/capsules
 * Требует обязательной авторизации
 */
router.post('/generate', requireTelegramAuth, generateCapsules);

/**
 * POST /api/capsules
 * Создать новую капсулу
 * Требует обязательной авторизации
 */
router.post('/', requireTelegramAuth, createCapsule);

/**
 * GET /api/capsules
 * Получить капсулы пользователя
 * Требует обязательной авторизации
 */
router.get('/', requireTelegramAuth, getUserCapsules);

/**
 * GET /api/capsules/public
 * Получить публичные капсулы (ДОЛЖЕН БЫТЬ ПЕРЕД /:id)
 * Опциональная авторизация для проверки лайков
 */
router.get('/public', optionalTelegramAuth, getPublicCapsules);

/**
 * GET /api/capsules/:id
 * Получить капсулу по ID
 * Не требует авторизации (публичный доступ)
 */
router.get('/:id', getCapsule);

/**
 * PUT /api/capsules/:id
 * Обновить капсулу
 * Требует обязательной авторизации
 */
router.put('/:id', requireTelegramAuth, updateCapsule);

/**
 * DELETE /api/capsules/:id
 * Удалить капсулу
 * Требует обязательной авторизации
 */
router.delete('/:id', requireTelegramAuth, deleteCapsule);

module.exports = router;
