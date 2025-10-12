/**
 * API для работы с капсулами
 * Создание, получение, обновление и анализ капсул
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');

/**
 * Папка для хранения изображений капсул
 */
const CAPSULES_UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'capsules');

/**
 * Конвертировать base64 в Buffer и определить расширение
 */
function parseBase64Image(dataString) {
    const matches = dataString.match(/^data:image\/([a-z]+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
        throw new Error('Invalid base64 image format');
    }

    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    return { buffer, extension };
}

/**
 * Удалить старый файл миниатюры капсулы
 */
async function deleteOldCapsuleThumbnail(telegramId, oldFilename) {
    if (!oldFilename) return;
    
    try {
        const userDir = path.join(CAPSULES_UPLOADS_DIR, telegramId.toString());
        const oldFilePath = path.join(userDir, oldFilename);
        
        // Проверяем существует ли файл
        try {
            await fs.access(oldFilePath);
            // Файл существует - удаляем
            await fs.unlink(oldFilePath);
            logger.info('Old capsule thumbnail deleted', {
                telegramId: telegramId.toString(),
                filename: oldFilename
            });
        } catch (err) {
            // Файл не существует - ничего не делаем
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
    } catch (error) {
        logger.error('Error deleting old capsule thumbnail', { 
            error: error.message,
            filename: oldFilename 
        });
        // Не бросаем ошибку, чтобы не прерывать обновление капсулы
    }
}

/**
 * Сохранить thumbnail изображение капсулы на диск
 */
async function saveCapsuleThumbnail(telegramId, thumbnailImage) {
    try {
        // Создаем папку для пользователя если её нет
        const userDir = path.join(CAPSULES_UPLOADS_DIR, telegramId.toString());
        await fs.mkdir(userDir, { recursive: true });

        // Парсим base64
        const { buffer, extension } = parseBase64Image(thumbnailImage);

        // Генерируем уникальное имя файла: capsule_{telegramId}_{timestamp}.png
        const timestamp = Date.now();
        const filename = `capsule_${telegramId}_${timestamp}.${extension}`;
        const filePath = path.join(userDir, filename);

        // Сохраняем файл
        await fs.writeFile(filePath, buffer);

        logger.info('Capsule thumbnail saved', {
            telegramId: telegramId.toString(),
            filename,
            path: filePath
        });

        return filename;

    } catch (error) {
        logger.error('Error saving capsule thumbnail', { error: error.message });
        throw error;
    }
}

/**
 * Создать новую капсулу
 */
async function createCapsule(req, res) {
  try {
    const { initData, name, canvasData, thumbnailImage, itemIds } = req.body;

    // Валидация Telegram данных
    if (!initData) {
        return res.status(401).json({
            success: false,
            error: 'Missing Telegram authentication data'
        });
    }

    const validationResult = validateTelegramWebAppData(initData);
    if (!validationResult.isValid) {
        return res.status(401).json({
            success: false,
            error: validationResult.error || 'Invalid Telegram authentication'
        });
    }

    const telegramId = BigInt(validationResult.data.user.id);

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
      thumbnailPath = await saveCapsuleThumbnail(telegramId, thumbnailImage);
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

    // Создаем капсулу
    const capsule = await prisma.capsule.create({
      data: {
        telegramId: telegramId,
        name: name || null,
        canvasData: canvasData,
        thumbnailPath: thumbnailPath,
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
      itemCount: capsule.items.length
    });

    res.json({
      success: true,
      capsule: {
        id: capsule.id,
        name: capsule.name,
        thumbnailUrl: capsule.thumbnailPath ? `/uploads/capsules/${telegramId}/${capsule.thumbnailPath}` : null,
        canvasData: capsule.canvasData,
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
 */
async function getUserCapsules(req, res) {
  try {
    const { initData } = req.query;

    // Валидация Telegram данных
    if (!initData) {
        return res.status(401).json({
            success: false,
            error: 'Missing Telegram authentication data'
        });
    }

    const validationResult = validateTelegramWebAppData(initData);
    if (!validationResult.isValid) {
        return res.status(401).json({
            success: false,
            error: validationResult.error || 'Invalid Telegram authentication'
        });
    }

    const telegramId = BigInt(validationResult.data.user.id);
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

    res.json({
      success: true,
      capsules: capsules.map(capsule => ({
        id: capsule.id,
        name: capsule.name,
        thumbnailUrl: capsule.thumbnailPath ?
          `/uploads/capsules/${telegramId}/${capsule.thumbnailPath}` : null,
        canvasData: capsule.canvasData,
        analysis: capsule.analysis,
        createdAt: capsule.createdAt,
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

    res.json({
      success: true,
      capsule: {
        id: capsule.id,
        name: capsule.name,
        description: capsule.description,
        canvasData: capsule.canvasData,
        analysis: capsule.analysis,
        analysisDate: capsule.analysisDate,
        createdAt: capsule.createdAt,
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
    const { initData, canvasData, thumbnailImage, itemIds } = req.body;

    // Валидация Telegram данных
    if (!initData) {
        return res.status(401).json({
            success: false,
            error: 'Missing Telegram authentication data'
        });
    }

    const validationResult = validateTelegramWebAppData(initData);
    if (!validationResult.isValid) {
        return res.status(401).json({
            success: false,
            error: validationResult.error || 'Invalid Telegram authentication'
        });
    }

    const telegramId = BigInt(validationResult.data.user.id);

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
      await deleteOldCapsuleThumbnail(telegramId, capsule.thumbnailPath);
      // Сохраняем новый файл
      thumbnailPath = await saveCapsuleThumbnail(telegramId, thumbnailImage);
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

    logger.info(`Capsule updated: ${updatedCapsule.id} for user ${telegramId}`, {
      thumbnailPath: thumbnailPath,
      itemCount: updatedCapsule.items.length
    });

    res.json({
      success: true,
      capsule: {
        id: updatedCapsule.id,
        name: updatedCapsule.name,
        thumbnailUrl: updatedCapsule.thumbnailPath ? `/uploads/capsules/${telegramId}/${updatedCapsule.thumbnailPath}` : null,
        canvasData: updatedCapsule.canvasData,
        createdAt: updatedCapsule.createdAt,
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
    const { initData } = req.query;

    // Валидация Telegram данных
    if (!initData) {
        return res.status(401).json({
            success: false,
            error: 'Missing Telegram authentication data'
        });
    }

    const validationResult = validateTelegramWebAppData(initData);
    if (!validationResult.isValid) {
        return res.status(401).json({
            success: false,
            error: validationResult.error || 'Invalid Telegram authentication'
        });
    }

    const telegramId = BigInt(validationResult.data.user.id);

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
    await deleteOldCapsuleThumbnail(telegramId, capsule.thumbnailPath);

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
 * Получить публичные капсулы
 */
async function getPublicCapsules(req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const capsules = await prisma.capsule.findMany({
      where: {
        isPublic: true
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
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            avatarUrl: true
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
      where: { isPublic: true }
    });

    res.json({
      success: true,
      capsules: capsules.map(capsule => ({
        id: capsule.id,
        name: capsule.name,
        description: capsule.description,
        canvasData: capsule.canvasData,
        analysis: capsule.analysis,
        createdAt: capsule.createdAt,
        itemCount: capsule.items.length,
        author: capsule.user
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error getting public capsules:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Маршруты для капсул

/**
 * POST /api/capsules
 * Создать новую капсулу
 */
router.post('/', createCapsule);

/**
 * GET /api/capsules
 * Получить капсулы пользователя
 */
router.get('/', getUserCapsules);

/**
 * GET /api/capsules/:id
 * Получить капсулу по ID
 */
router.get('/:id', getCapsule);

/**
 * PUT /api/capsules/:id
 * Обновить капсулу
 */
router.put('/:id', updateCapsule);

/**
 * DELETE /api/capsules/:id
 * Удалить капсулу
 */
router.delete('/:id', deleteCapsule);

/**
 * GET /api/capsules/public
 * Получить публичные капсулы
 */
router.get('/public', getPublicCapsules);

module.exports = router;
