/**
 * API для работы с капсулами
 * Создание, получение, обновление и анализ капсул
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');
const { getInitData } = require('../utils/authHelper');
const wardrobeUsageService = require('../services/wardrobeUsageService');
const capsuleSimilarityService = require('../services/capsuleSimilarityService');

/**
 * Папка для хранения изображений капсул
 */
const CAPSULES_UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'capsules');

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
 * Сохранить thumbnail изображение капсулы на диск с оптимизацией
 */
async function saveCapsuleThumbnail(telegramId, thumbnailImage) {
    try {
        // Создаем папку для пользователя если её нет
        const userDir = path.join(CAPSULES_UPLOADS_DIR, telegramId.toString());
        await fs.mkdir(userDir, { recursive: true });

        // Парсим base64
        const { buffer } = parseBase64Image(thumbnailImage);

        // Проверяем наличие альфа-канала (прозрачности)
        const metadata = await sharp(buffer).metadata();
        const hasAlpha = metadata.hasAlpha || metadata.channels === 4;

        let optimizedBuffer;
        let extension;

        if (hasAlpha) {
            // Для изображений с прозрачностью используем PNG
            optimizedBuffer = await sharp(buffer)
                .rotate()
                .resize(800, 800, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .png({
                    quality: 90,
                    compressionLevel: 9
                })
                .toBuffer();
            extension = 'png';
        } else {
            // Для обычных изображений используем JPEG
            optimizedBuffer = await sharp(buffer)
                .rotate()
                .resize(800, 800, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({
                    quality: 80,
                    progressive: true
                })
                .toBuffer();
            extension = 'jpg';
        }

        // Генерируем уникальное имя файла
        const timestamp = Date.now();
        const filename = `capsule_${telegramId}_${timestamp}.${extension}`;
        const filePath = path.join(userDir, filename);

        // Сохраняем оптимизированный файл
        await fs.writeFile(filePath, optimizedBuffer);

        logger.info('Capsule thumbnail saved', {
            telegramId: telegramId.toString(),
            filename,
            hasAlpha,
            format: extension,
            originalSizeKB: Math.round(buffer.length / 1024),
            optimizedSizeKB: Math.round(optimizedBuffer.length / 1024)
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
    const { name, canvasData, thumbnailImage, itemIds, metadata } = req.body;

    // Валидация Telegram данных из headers (как в других эндпоинтах)
    const initData = getInitData(req);
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
        thumbnailUrl: capsule.thumbnailPath ? `/uploads/capsules/${telegramId}/${capsule.thumbnailPath}` : null,
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
    // FIXED: получаем initData из header или query
    const initData = getInitData(req);

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
        thumbnailUrl: capsule.thumbnailPath ?
          `/uploads/capsules/${telegramId}/${capsule.thumbnailPath}` : null,
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

    // Валидация Telegram данных из headers (как в других эндпоинтах)
    const initData = getInitData(req);
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
        thumbnailUrl: updatedCapsule.thumbnailPath ? `/uploads/capsules/${telegramId}/${updatedCapsule.thumbnailPath}` : null,
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
    
    // FIXED: получаем initData из header или query
    const initData = getInitData(req);

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
 * Генерация 3 вариантов капсул через Gemini AI
 * POST /api/capsules/generate
 */
async function generateCapsules(req, res) {
  try {
    const { excludeCombinations } = req.body;

    // Валидация Telegram данных из headers
    const initData = getInitData(req);
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

    logger.info('Capsule generation requested', {
      telegramId: telegramId.toString(),
      excludeCombinations: excludeCombinations?.length || 0
    });

    // Получаем все вещи гардероба с полными данными (9 полей)
    const wardrobeItems = await prisma.wardrobeItem.findMany({
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

    // Подготавливаем данные для FastVLM
    const existingCapsulesData = existingCapsules.map(c => ({
      itemIds: wardrobeUsageService.extractItemIdsFromCanvas(c.canvasData)
    }));

    const requestPayload = {
      wardrobeItems: prioritizedItems,
      currentSeason,
      currentMonth,
      existingCapsules: existingCapsulesData,
      excludeCombinations: excludeCombinations || []
    };

    // Отправляем запрос в FastVLM для mock генерации (временно вместо Gemini)
    const url = `${FASTVLM_CONFIG.HOST}:${FASTVLM_CONFIG.PORT}/generate-capsules-mock`;

    logger.info('Sending request to FastVLM Mock', {
      telegramId: telegramId.toString(),
      url,
      itemsCount: prioritizedItems.length,
      wardrobeItems: prioritizedItems.map(item => ({
        id: item.id,
        category: item.category,
        color: item.color,
        usageCount: item.usageCount,
        imagePath: item.imagePath
      }))
    });

    // Создаем AbortController для таймаута
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.warn('Capsule generation request timeout', {
        telegramId: telegramId.toString()
      });
    }, FASTVLM_CONFIG.TIMEOUT);

    let fastvlmResponse;
    try {
      fastvlmResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        logger.error('FastVLM request timeout', {
          telegramId: telegramId.toString()
        });
        return res.status(504).json({
          success: false,
          error: 'Генерация заняла слишком много времени. Попробуйте снова'
        });
      }

      logger.error('FastVLM request failed', {
        telegramId: telegramId.toString(),
        error: fetchError.message
      });
      return res.status(502).json({
        success: false,
        error: 'Не удалось подключиться к сервису генерации'
      });
    }

    // Проверяем ответ от FastVLM
    if (!fastvlmResponse.ok) {
      const errorText = await fastvlmResponse.text();
      logger.error('FastVLM server error', {
        telegramId: telegramId.toString(),
        status: fastvlmResponse.status,
        statusText: fastvlmResponse.statusText,
        error: errorText
      });

      // Проверяем на rate limit (429)
      if (fastvlmResponse.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Превышен дневной лимит генераций. Попробуйте завтра'
        });
      }

      return res.status(502).json({
        success: false,
        error: 'Не удалось сгенерировать капсулы. Попробуйте позже'
      });
    }

    const generated = await fastvlmResponse.json();

    if (!generated.success) {
      logger.error('FastVLM generation failed', {
        telegramId: telegramId.toString(),
        error: generated.error
      });
      return res.status(500).json({
        success: false,
        error: generated.error || 'Не удалось сгенерировать капсулы'
      });
    }

    logger.info('Capsules generated by FastVLM', {
      telegramId: telegramId.toString(),
      capsulesCount: generated.capsules?.length || 0
    });

    // Проверяем уникальность сгенерированных капсул
    const enrichedCapsules = generated.capsules.map(capsule => {
      const isUnique = capsuleSimilarityService.isUnique(
        capsule.itemIds,
        existingCapsulesData,
        80 // порог 80%
      );

      // Получаем полные данные вещей для каждой капсулы с правильными imageUrl
      const capsuleItems = wardrobeItems.filter(item => 
        capsule.itemIds.includes(item.id)
      ).map(item => ({
        ...item,
        imageUrl: item.imagePath ? `/uploads/${item.imagePath.replace(/\\/g, '/')}` : null
      }));

      return {
        ...capsule,
        isUnique,
        items: capsuleItems
      };
    });

    logger.info('Capsule generation completed', {
      telegramId: telegramId.toString(),
      totalGenerated: enrichedCapsules.length,
      uniqueCapsules: enrichedCapsules.filter(c => c.isUnique).length,
      generatedCapsules: enrichedCapsules.map(capsule => ({
        id: capsule.id,
        name: capsule.name,
        itemIds: capsule.itemIds,
        itemsWithImages: capsule.items.map(item => ({
          id: item.id,
          category: item.category,
          imagePath: item.imagePath,
          imageUrl: item.imagePath ? `/uploads/wardrobe/${telegramId}/${item.imagePath}` : null
        }))
      }))
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
    const initData = getInitData(req) || '';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Получаем текущего пользователя для проверки лайков и исключения его капсул
    let currentUser = null;
    let currentUserTelegramId = null;
    if (initData) {
      const validation = validateTelegramWebAppData(initData);
      if (validation.isValid) {
        const telegramId = BigInt(validation.data.user.id);
        currentUserTelegramId = telegramId;
        currentUser = await prisma.user.findUnique({
          where: { telegramId }
        });
      }
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
        thumbnailUrl: capsule.thumbnailPath ?
          `/uploads/capsules/${capsule.user.telegramId}/${capsule.thumbnailPath}` : null,
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
 */
router.post('/generate', generateCapsules);

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
 * GET /api/capsules/public
 * Получить публичные капсулы (ДОЛЖЕН БЫТЬ ПЕРЕД /:id)
 */
router.get('/public', getPublicCapsules);

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

module.exports = router;
