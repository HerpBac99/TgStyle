const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');
const { getInitData } = require('../utils/authHelper');
const FileService = require('../services/FileService');





// Удалено - больше не нужно получать пользователя

/**
 * POST /api/wardrobe
 * Создать новый предмет гардероба
 * FIXED: поддержка initData из headers (X-Init-Data) и request body
 */
router.post('/', async (req, res) => {
    try {
        const { imageBase64, name, category, subtype, color, material, style, fit, season, pattern, description, tags } = req.body;

        // FIXED: получаем initData из header или body
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

        // Валидация
        if (!imageBase64) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: imageBase64'
            });
        }

        logger.info('Creating wardrobe item', {
            telegramId: telegramId.toString(),
            name: name || 'unnamed',
            category: category || 'uncategorized'
        });

        // Сохраняем изображение на диск
        const imagePath = await FileService.saveWardrobeImage(telegramId, imageBase64);

        // Создаем запись в БД
        const wardrobeItem = await prisma.wardrobeItem.create({
            data: {
                telegramId,
                imagePath,
                name: name || null,
                category: category || null,
                subtype: subtype || null,
                color: color || null,
                material: material || null,
                style: style || null,
                fit: fit || null,
                season: season || null,
                pattern: pattern || null,
                description: description || null,
                tags: tags || []
            }
        });

        logger.info('Wardrobe item created', {
            id: wardrobeItem.id,
            telegramId: telegramId.toString()
        });

        // Формируем URL для доступа к изображению
        const imageUrl = FileService.getImageUrl(imagePath, 'wardrobe');

        return res.json({
            success: true,
            item: {
                id: wardrobeItem.id,
                imageUrl,
                name: wardrobeItem.name,
                category: wardrobeItem.category,
                subtype: wardrobeItem.subtype,
                color: wardrobeItem.color,
                material: wardrobeItem.material,
                style: wardrobeItem.style,
                fit: wardrobeItem.fit,
                season: wardrobeItem.season,
                pattern: wardrobeItem.pattern,
                description: wardrobeItem.description,
                tags: wardrobeItem.tags,
                createdAt: wardrobeItem.createdAt
            }
        });

    } catch (error) {
        logger.error('Error creating wardrobe item', {
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * GET /api/wardrobe
 * Получить все предметы гардероба пользователя
 * FIXED: поддержка initData из headers (X-Init-Data) и query параметров
 */
router.get('/', async (req, res) => {
    try {
        // FIXED: получаем initData из header или query параметра
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

        logger.info('Fetching wardrobe items', { telegramId: telegramId.toString() });

        // Получаем все предметы пользователя
        const items = await prisma.wardrobeItem.findMany({
            where: {
                telegramId
            },
            orderBy: {
                createdAt: 'desc'  // Новые вещи первыми
            }
        });

        // Формируем ответ с URL для изображений
        const itemsWithUrls = items.map(item => ({
            id: item.id,
            imageUrl: FileService.getImageUrl(item.imagePath, 'wardrobe'),
            name: item.name,
            category: item.category,
            subtype: item.subtype,
            color: item.color,
            material: item.material,
            style: item.style,
            fit: item.fit,
            season: item.season,
            pattern: item.pattern,
            description: item.description,
            tags: item.tags,
            createdAt: item.createdAt
        }));

        logger.info('Wardrobe items fetched', {
            telegramId: telegramId.toString(),
            count: items.length
        });

        return res.json({
            success: true,
            items: itemsWithUrls
        });

    } catch (error) {
        logger.error('Error fetching wardrobe items', {
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * PUT /api/wardrobe/:id
 * Обновить предмет гардероба
 * FIXED: поддержка initData из headers (X-Init-Data)
 */
router.put('/:id', async (req, res) => {
    try {
        const itemId = parseInt(req.params.id);
        const updates = req.body;

        // FIXED: получаем initData из header или query
        const initData = getInitData(req);

        // Валидация Telegram данных
        if (!initData) {
            return res.status(401).json({
                success: false,
                error: 'Missing Telegram authentication data'
            });
        }

        const validation = validateTelegramWebAppData(initData);
        if (!validation.isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid Telegram authentication data'
            });
        }

        const userId = validation.data.user.id;

        // Проверяем, что предмет принадлежит пользователю
        const existingItem = await prisma.wardrobeItem.findFirst({
            where: {
                id: itemId,
                telegramId: BigInt(userId)
            }
        });

        if (!existingItem) {
            return res.status(404).json({
                success: false,
                error: 'Item not found or access denied'
            });
        }

        logger.info('Updating wardrobe item with data', {
            itemId,
            updates,
            existingCategory: existingItem.category
        });

        // Готовим данные для обновления
        const updateData = {
            updatedAt: new Date()
        };

        // Проверяем категорию
        if (updates.category !== undefined && updates.category !== existingItem.category) {
            const validCategories = ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY', 'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES'];
            if (validCategories.includes(updates.category)) {
                updateData.category = updates.category;
            } else {
                logger.warn('Invalid category value', { category: updates.category });
            }
        }

        // Проверяем subtype
        if (updates.subtype !== undefined && updates.subtype !== existingItem.subtype) {
            updateData.subtype = updates.subtype;
        }

        // Проверяем color
        if (updates.color !== undefined && updates.color !== existingItem.color) {
            updateData.color = updates.color;
        }

        // Проверяем material
        if (updates.material !== undefined && updates.material !== existingItem.material) {
            updateData.material = updates.material;
        }

        // Проверяем style
        if (updates.style !== undefined && updates.style !== existingItem.style) {
            updateData.style = updates.style;
        }

        // Проверяем fit
        if (updates.fit !== undefined && updates.fit !== existingItem.fit) {
            updateData.fit = updates.fit;
        }

        // Проверяем season
        if (updates.season !== undefined && updates.season !== existingItem.season) {
            updateData.season = updates.season;
        }

        // Проверяем pattern
        if (updates.pattern !== undefined && updates.pattern !== existingItem.pattern) {
            updateData.pattern = updates.pattern;
        }

        // Проверяем description
        if (updates.description !== undefined && updates.description !== existingItem.description) {
            updateData.description = updates.description;
        }

        // Проверяем, есть ли реальные изменения
        const hasChanges = Object.keys(updateData).length > 1; // кроме updatedAt
        if (!hasChanges) {
            logger.info('No changes detected, skipping update', { itemId });
            return res.json({
                success: true,
                message: 'No changes to update'
            });
        }

        logger.info('Final update data', { updateData });

        // Обновляем предмет
        const updatedItem = await prisma.wardrobeItem.update({
            where: { id: itemId },
            data: updateData
        });

        // Преобразуем BigInt для JSON
        const result = {
            ...updatedItem,
            id: updatedItem.id.toString(),
            telegramId: updatedItem.telegramId.toString()
        };

        logger.info('Wardrobe item updated', {
            itemId,
            userId,
            updates: Object.keys(updates)
        });

        res.json({
            success: true,
            item: result
        });

    } catch (error) {
        logger.error('Error updating wardrobe item', {
            error: error.message,
            itemId: req.params.id
        });

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/wardrobe/:id
 * Удалить предмет гардероба
 * FIXED: поддержка initData из headers (X-Init-Data)
 */
router.delete('/:id', async (req, res) => {
    try {
        const itemId = parseInt(req.params.id);

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

        if (isNaN(itemId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid item ID'
            });
        }

        logger.info('Deleting wardrobe item', { telegramId: telegramId.toString(), itemId });

        // Проверяем что предмет принадлежит пользователю
        const item = await prisma.wardrobeItem.findUnique({
            where: { id: itemId }
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                error: 'Item not found'
            });
        }

        if (item.telegramId !== telegramId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Удаляем изображение с диска
        await FileService.deleteWardrobeImage(telegramId, item.imagePath);

        // Удаляем запись из БД
        await prisma.wardrobeItem.delete({
            where: { id: itemId }
        });

        logger.info('Wardrobe item deleted', { telegramId: telegramId.toString(), itemId });

        return res.json({
            success: true,
            message: 'Item deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting wardrobe item', {
            error: error.message,
            stack: error.stack,
            itemId: req.params.id
        });

        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

module.exports = router;
