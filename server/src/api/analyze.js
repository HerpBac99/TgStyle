const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');

/**
 * Константы для FastVLM интеграции
 */
const FASTVLM_CONFIG = {
    HOST: 'http://127.0.0.1',
    PORT: 3001,
    TIMEOUT: 30000, // 30 секунд
    ENDPOINT: '/analyze'
};

/**
 * Анализирует изображение через FastVLM сервер
 * @param {Buffer} imageBuffer - Буфер изображения
 * @param {string} nickname - Никнейм пользователя для логирования
 * @returns {Promise<Object>} Результат анализа
 */
async function analyzeImage(imageBuffer, nickname) {
    try {
        logger.info('Отправка запроса в FastVLM сервер');

        // Конвертируем изображение в base64
        const base64Image = imageBuffer.toString('base64');
        const url = `${FASTVLM_CONFIG.HOST}:${FASTVLM_CONFIG.PORT}${FASTVLM_CONFIG.ENDPOINT}`;

        // Создаем AbortController для таймаута
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            logger.warn('FastVLM запрос прерван по таймауту');
        }, FASTVLM_CONFIG.TIMEOUT);

        // Отправляем запрос в FastVLM сервер
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_base64: base64Image,
                prompt: 'Опиши одежду на фото',
                nickname: nickname
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();

            if (result.success && result.analysis) {
                logger.info('FastVLM анализ успешен', {
                    analysisLength: result.analysis.length
                });

                // Обрабатываем и очищаем текст анализа
                let analysisText = cleanAnalysisText(result.analysis);

                return {
                    success: true,
                    analysis: analysisText,
                    fastvlm: true,
                    model: result.model_used || 'llava'
                };
            } else {
                logger.error('FastVLM сервер вернул ошибку', {
                    error: result.error,
                    status: response.status
                });
                return {
                    success: false,
                    error: result.error || 'FastVLM analysis failed'
                };
            }
        } else {
            logger.error('FastVLM сервер недоступен', {
                status: response.status,
                statusText: response.statusText,
                url
            });

            return {
                success: false,
                error: `FastVLM server error: ${response.status} ${response.statusText}`
            };
        }

    } catch (error) {
        // Обработка различных типов ошибок
        if (error.name === 'AbortError') {
            logger.error('FastVLM запрос отменен по таймауту');
            return { success: false, error: 'FastVLM timeout' };
        }

        logger.error(' Ошибка при обращении к FastVLM серверу', {
            error: error.message,
            stack: error.stack
        });

        return {
            success: false,
            error: error.message || 'FastVLM communication error'
        };
    }
}

/**
 * Очищает и исправляет текст анализа от проблем с кодировкой
 * @param {string} text - Исходный текст анализа
 * @returns {string} Очищенный текст
 */
function cleanAnalysisText(text) {
    if (!text || typeof text !== 'string') {
        return 'Анализ выполнен, но текст описания недоступен.';
    }

    let cleanedText = text;

    // Исправляем проблемы с кодировкой UTF-8
    if (cleanedText.includes('�') || cleanedText.includes('\ufffd')) {
        cleanedText = cleanedText.replace(/�/g, '').replace(/\ufffd/g, '');
        logger.debug('Исправлены проблемы с кодировкой текста');
    }

    // Удаляем лишние пробелы и пустые строки
    cleanedText = cleanedText.trim();

    // Проверяем, что текст не пустой после очистки
    if (!cleanedText) {
        return 'Анализ выполнен, но текст описания недоступен.';
    }

    return cleanedText;
}

/**
 * Анализ изображения одежды
 * POST /api/analyze
 */
router.post('/', async (req, res) => {
    try {

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

        // Получаем информацию о пользователе для логирования
        const userInfo = validationResult.data.user;
        logger.info('Данные пользователя Telegram', {
            userId: userInfo?.id,
            username: userInfo?.username,
            firstName: userInfo?.first_name,
            lastName: userInfo?.last_name
        });

        const nickname = userInfo?.username ||
                        `${userInfo?.first_name || ''}${userInfo?.last_name || ''}`.trim() ||
                        `user_${userInfo?.id || 'unknown'}`;

        logger.info(`Используемый nickname для анализа: ${nickname}`);

        // Отправляем на анализ в FastVLM
        const result = await analyzeImage(imageBuffer, nickname);

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