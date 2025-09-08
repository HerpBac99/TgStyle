const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');

/**
 * Анализ изображения через FastVLM сервер
 */
async function analyzeImage(imageBuffer) {
    try {
        logger.info('Отправка запроса в FastVLM сервер');

        // Конвертируем изображение в base64
        const base64Image = imageBuffer.toString('base64');

        // Отправляем запрос в FastVLM сервер
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('http://127.0.0.1:3001/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_base64: base64Image
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();

            if (result.success) {
                logger.info('FastVLM анализ успешен', {
                    analysisLength: result.analysis ? result.analysis.length : 0
                });

                let analysisText = result.analysis || '';

                // Исправляем проблемы с кодировкой текста
                if (analysisText.includes('�') || analysisText.includes('\ufffd')) {
                    analysisText = analysisText.replace(/�/g, '').replace(/\ufffd/g, '');
                }

                if (!analysisText.trim()) {
                    analysisText = 'Анализ выполнен, но текст описания недоступен.';
                }

                return {
                    success: true,
                    analysis: analysisText,
                    fastvlm: true
                };
            } else {
                logger.error('FastVLM сервер вернул ошибку', { error: result.error });
                return { success: false, error: result.error };
            }
        } else {
            logger.error('FastVLM сервер недоступен', {
                status: response.status,
                statusText: response.statusText
            });
            return { success: false, error: 'FastVLM server unavailable' };
        }

    } catch (error) {
        logger.error('Ошибка при обращении к FastVLM серверу', {
            error: error.message
        });
        return { success: false, error: error.message };
    }
}

/**
 * Анализ изображения одежды
 * POST /api/analyze
 */
router.post('/', async (req, res) => {
    try {
        logger.info('Получен запрос на анализ изображения');

        const { photo, initData } = req.body;

        // Проверяем обязательные параметры
        if (!photo || !initData) {
            logger.error('Отсутствуют необходимые параметры', {
                hasPhoto: !!photo,
                hasInitData: !!initData
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: photo and initData'
            });
        }

        // Валидируем Telegram
        const validationResult = validateTelegramWebAppData(initData);
        if (!validationResult.isValid) {
            logger.error('Ошибка валидации Telegram', {
                error: validationResult.error
            });
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }

        logger.info('Валидация Telegram успешна');

        // Декодируем изображение
        let imageBuffer;
        try {
            imageBuffer = Buffer.from(photo, 'base64');
            logger.info('Изображение декодировано', {
                sizeBytes: imageBuffer.length
            });
        } catch (error) {
            logger.error('Ошибка декодирования изображения', {
                error: error.message
            });
            return res.status(400).json({
                success: false,
                error: 'Invalid image data'
            });
        }

        // Проверяем размер изображения
        if (imageBuffer.length < 100) {
            logger.error('Изображение слишком маленькое');
            return res.status(400).json({
                success: false,
                error: 'Image too small'
            });
        }

        // Отправляем на анализ в FastVLM
        const result = await analyzeImage(imageBuffer);

        if (result.success) {
            logger.info('Анализ завершен успешно');
            return res.json({
                success: true,
                analysis: result.analysis
            });
        } else {
            logger.error('Ошибка анализа', { error: result.error });
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        logger.error('Внутренняя ошибка сервера', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router; 