const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const fs = require('fs').promises;
const path = require('path');

/**
 * Сохранение shared анализа
 * POST /api/shared-analysis
 * Обновляет HistoryItem: добавляет shareId и делает isPublic = true
 */
router.post('/', async (req, res) => {
    const { analysisId, historyItemId } = req.body;

    try {
        // Проверяем обязательные параметры
        if (!analysisId || !historyItemId) {
            logger.error('Отсутствуют параметры для shared анализа', {
                hasAnalysisId: !!analysisId,
                hasHistoryItemId: !!historyItemId
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: analysisId and historyItemId'
            });
        }

        // Проверяем существование historyItem
        const historyItem = await prisma.historyItem.findUnique({
            where: { id: historyItemId }
        });

        if (!historyItem) {
            logger.error('HistoryItem not found', { historyItemId });
            return res.status(404).json({
                success: false,
                error: 'Analysis not found'
            });
        }

        // Обновляем HistoryItem: добавляем shareId и делаем публичным
        await prisma.historyItem.update({
            where: { id: historyItemId },
            data: {
                shareId: analysisId,
                isPublic: true
            }
        });

        logger.info('Shared анализ сохранен: HistoryItem обновлен', { analysisId, historyItemId });
        res.json({
            success: true,
            message: 'Shared analysis saved'
        });

    } catch (error) {
        logger.error('Ошибка сохранения shared анализа', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Получение shared анализа
 * GET /api/shared-analysis/:analysisId
 * Находит HistoryItem по shareId и загружает данные
 */
router.get('/:analysisId', async (req, res) => {
    const { analysisId } = req.params;

    try {
        // Ищем HistoryItem по shareId
        const historyItem = await prisma.historyItem.findUnique({
            where: { shareId: analysisId },
            include: {
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

        if (!historyItem) {
            logger.warn('Shared анализ не найден в БД', { analysisId });
            return res.status(404).json({
                success: false,
                error: 'Shared analysis not found'
            });
        }

        // Проверяем что анализ публичный
        if (!historyItem.isPublic) {
            logger.warn('Попытка доступа к приватному анализу', { analysisId, historyItemId: historyItem.id });
            return res.status(403).json({
                success: false,
                error: 'This analysis is private'
            });
        }

        // Загружаем фото с диска если есть photoPath
        let photoBase64 = null;
        if (historyItem.photoPath) {
            try {
                // Формируем путь: uploads/analysis/{telegramId}/{filename}
                const userFolder = historyItem.user.telegramId.toString();
                const photoFilePath = path.join(__dirname, '..', '..', 'uploads', 'analysis', userFolder, historyItem.photoPath);
                const photoBuffer = await fs.readFile(photoFilePath);
                photoBase64 = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
                
                logger.info('Фото загружено с диска', { 
                    photoPath: historyItem.photoPath,
                    fullPath: photoFilePath 
                });
            } catch (fileError) {
                logger.warn('Не удалось загрузить фото с диска, используем photoData', {
                    photoPath: historyItem.photoPath,
                    fullPath: path.join(__dirname, '..', '..', 'uploads', 'analysis', historyItem.user.telegramId.toString(), historyItem.photoPath),
                    error: fileError.message
                });
                // Fallback на photoData если есть
                if (historyItem.photoData) {
                    photoBase64 = historyItem.photoData;
                }
            }
        } else if (historyItem.photoData) {
            // Legacy: используем photoData
            photoBase64 = historyItem.photoData;
        }

        // Используем analysisText (пользовательский ответ стилиста)
        // technicalAnalysis хранится отдельно для технических целей
        const analysisText = historyItem.analysisText || historyItem.technicalAnalysis;  // fallback на technicalAnalysis для старых записей

        logger.info('Shared анализ загружен из БД', { 
            analysisId, 
            historyItemId: historyItem.id,
            hasPhoto: !!photoBase64,
            hasAnalysis: !!analysisText,
            analysisLength: analysisText?.length || 0,
            usingFallback: !historyItem.analysisText && !!historyItem.technicalAnalysis
        });

        res.json({
            success: true,
            data: {
                photo: photoBase64,
                analysis: analysisText,  // Креативный ответ стилиста
                timestamp: historyItem.createdAt.toISOString(),
                historyItemId: historyItem.id
            }
        });

    } catch (error) {
        logger.error('Ошибка получения shared анализа из БД', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
