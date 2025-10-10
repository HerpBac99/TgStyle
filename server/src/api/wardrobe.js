const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');

/**
 * Папка для хранения изображений гардероба
 */
const WARDROBE_UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'wardrobe');

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
 * Сохранить изображение на диск
 */
async function saveImageToDisk(telegramId, imageBase64) {
    try {
        // Создаем папку для пользователя если её нет
        const userDir = path.join(WARDROBE_UPLOADS_DIR, telegramId.toString());
        await fs.mkdir(userDir, { recursive: true });
        
        // Парсим base64
        const { buffer, extension } = parseBase64Image(imageBase64);
        
        // Генерируем уникальное имя файла: item_{telegramId}_{уникальныйКлюч}.png
        const randomString = Math.random().toString(36).substring(2, 10);
        const filename = `item_${telegramId}_${randomString}.${extension}`;
        const filePath = path.join(userDir, filename);
        
        // Сохраняем файл
        await fs.writeFile(filePath, buffer);
        
        // Возвращаем относительный путь для БД
        const relativePath = path.join('wardrobe', telegramId.toString(), filename);
        
        logger.info('Image saved to disk', { 
            telegramId, 
            filename,
            size: buffer.length 
        });
        
        return relativePath;
        
    } catch (error) {
        logger.error('Error saving image to disk', { 
            telegramId, 
            error: error.message 
        });
        throw error;
    }
}

/**
 * Удалить изображение с диска
 */
async function deleteImageFromDisk(imagePath) {
    try {
        const fullPath = path.join(WARDROBE_UPLOADS_DIR, '..', imagePath);
        await fs.unlink(fullPath);
        logger.info('Image deleted from disk', { imagePath });
    } catch (error) {
        // Не бросаем ошибку если файл уже удален
        logger.warn('Failed to delete image from disk', { 
            imagePath, 
            error: error.message 
        });
    }
}

// Удалено - больше не нужно получать пользователя

/**
 * POST /api/wardrobe
 * Создать новый предмет гардероба
 */
router.post('/', async (req, res) => {
    try {
        const { initData, imageBase64, name, category, color, material, style, fit, description, tags } = req.body;
        
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
        const imagePath = await saveImageToDisk(telegramId, imageBase64);
        
        // Создаем запись в БД
        const wardrobeItem = await prisma.wardrobeItem.create({
            data: {
                telegramId,
                imagePath,
                name: name || null,
                category: category || null,
                color: color || null,
                material: material || null,
                style: style || null,
                fit: fit || null,
                description: description || null,
                tags: tags || []
            }
        });
        
        logger.info('Wardrobe item created', { 
            id: wardrobeItem.id, 
            telegramId: telegramId.toString() 
        });
        
        // Формируем URL для доступа к изображению
        const imageUrl = `/uploads/${imagePath}`;
        
        return res.json({
            success: true,
            item: {
                id: wardrobeItem.id,
                imageUrl,
                name: wardrobeItem.name,
                category: wardrobeItem.category,
                color: wardrobeItem.color,
                material: wardrobeItem.material,
                style: wardrobeItem.style,
                fit: wardrobeItem.fit,
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
 */
router.get('/', async (req, res) => {
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
        
        logger.info('Fetching wardrobe items', { telegramId: telegramId.toString() });
        
        // Получаем все предметы пользователя
        const items = await prisma.wardrobeItem.findMany({
            where: {
                telegramId
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        
        // Формируем ответ с URL для изображений
        const itemsWithUrls = items.map(item => ({
            id: item.id,
            imageUrl: `/uploads/${item.imagePath}`,
            name: item.name,
            category: item.category,
            color: item.color,
            material: item.material,
            style: item.style,
            fit: item.fit,
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
 * DELETE /api/wardrobe/:id
 * Удалить предмет гардероба
 */
router.delete('/:id', async (req, res) => {
    try {
        const { initData } = req.query;
        const itemId = parseInt(req.params.id);
        
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
        await deleteImageFromDisk(item.imagePath);
        
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
