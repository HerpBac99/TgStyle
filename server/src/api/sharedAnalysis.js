const express = require('express');
const router = express.Router();
const { logger } = require('../controllers/logsController');

// Глобальное хранилище shared анализов (в памяти)
// В будущем можно заменить на базу данных
if (!global.sharedAnalyses) {
    global.sharedAnalyses = new Map();
    logger.info('Shared analyses storage initialized');
}

/**
 * Сохранение shared анализа
 * POST /api/shared-analysis
 */
router.post('/', async (req, res) => {
    const { analysisId, photo, analysis, timestamp } = req.body;

    try {
        // Проверяем обязательные параметры
        if (!analysisId || !photo || !analysis || !timestamp) {
            logger.error('Отсутствуют параметры для shared анализа', {
                hasAnalysisId: !!analysisId,
                hasPhoto: !!photo,
                hasAnalysis: !!analysis,
                hasTimestamp: !!timestamp
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const sharedData = {
            analysisId,
            photo,
            analysis,
            timestamp,
            createdAt: new Date().toISOString()
        };

        global.sharedAnalyses.set(analysisId, sharedData);

        logger.info('Shared анализ сохранен', { analysisId });
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
 */
router.get('/:analysisId', async (req, res) => {
    const { analysisId } = req.params;

    try {
        const sharedData = global.sharedAnalyses.get(analysisId);

        if (!sharedData) {
            logger.warn('Shared анализ не найден', { analysisId });
            return res.status(404).json({
                success: false,
                error: 'Shared analysis not found'
            });
        }

        logger.info('Shared анализ получен', { analysisId });
        res.json({
            success: true,
            data: {
                photo: sharedData.photo,
                analysis: sharedData.analysis,
                timestamp: sharedData.timestamp
            }
        });

    } catch (error) {
        logger.error('Ошибка получения shared анализа', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
