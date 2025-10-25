const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const { logger } = require('../controllers/logsController');

/**
 * Константы для FastVLM интеграции
 */
const FASTVLM_CONFIG = {
    HOST: 'http://127.0.0.1',
    PORT: 3001,
    TIMEOUT: 120000, // 120 секунд (классификация + удаление фона может занять время)
    ENDPOINT: '/classify_clothing'
};

/**
 * Классификация одежды через FastVLM сервер
 * POST /api/classify-clothing
 */
router.post('/', async (req, res) => {
    try {
        const { image_base64 } = req.body;

        // Проверяем наличие изображения
        if (!image_base64) {
            logger.error('No image provided for clothing classification');
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: image_base64'
            });
        }

        logger.info('Sending request to FastVLM for clothing classification', {
            imageSize: image_base64.length
        });

        const url = `${FASTVLM_CONFIG.HOST}:${FASTVLM_CONFIG.PORT}${FASTVLM_CONFIG.ENDPOINT}`;

        // Создаем AbortController для таймаута
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            logger.warn('Clothing classification request timeout');
        }, FASTVLM_CONFIG.TIMEOUT);

        // Отправляем запрос в FastVLM сервер
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_base64
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();

            if (result.success) {
                logger.info('Clothing classified successfully', {
                    processingTime: result.timing?.total_time,
                    category: result.classification?.category,
                    subtype: result.classification?.subtype,
                    color: result.classification?.color
                });

                return res.json({
                    success: true,
                    classification: result.classification,
                    processed_image_base64: result.processed_image_base64,
                    raw_analysis: result.raw_analysis,
                    timing: result.timing,
                    image_info: result.image_info
                });
            } else {
                logger.error('FastVLM clothing classification failed', {
                    error: result.error
                });
                return res.status(500).json({
                    success: false,
                    error: result.error || 'Clothing classification failed'
                });
            }
        } else {
            logger.error('FastVLM server error', {
                status: response.status,
                statusText: response.statusText,
                url
            });

            return res.status(502).json({
                success: false,
                error: `FastVLM server error: ${response.status} ${response.statusText}`
            });
        }

    } catch (error) {
        // Обработка различных типов ошибок
        if (error.name === 'AbortError') {
            logger.error('Clothing classification request timeout');
            return res.status(504).json({
                success: false,
                error: 'Request timeout'
            });
        }

        logger.error('Error in clothing classification', {
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

module.exports = router;
