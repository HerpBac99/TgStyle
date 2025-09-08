const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { logger, logSuccess, logWarning } = require('../controllers/logsController');

// Используем встроенный fetch в Node.js 18+

// Временно закомментировал TensorFlow
// const tf = require('@tensorflow/tfjs-node');
// const sharp = require('sharp');

// Проверка доступности FastVLM сервера
async function checkFastVLMHealth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch('http://127.0.0.1:3001/health', {
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Анализ изображения через FastVLM сервер
async function classifyImage(imageBuffer) {
    try {
        // Проверяем доступность FastVLM сервера
        const isHealthy = await checkFastVLMHealth();
        const currentTime = new Date().toTimeString().split(' ')[0];

        if (!isHealthy) {
            logger.warn('FastVLM сервер недоступен, используем симуляцию');
            return simulateClassification();
        }

        logger.info('Отправка запроса в FastVLM сервер');

        // Конвертируем изображение в base64
        const base64Image = imageBuffer.toString('base64');

        // Создаем промпт
        const prompt = "Describe in detail what clothing items you see in this image. What type, color, style and material? Please provide a detailed description in Russian language using fashion terms.";

        // Отправляем запрос в FastVLM сервер
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут

        const response = await fetch('http://127.0.0.1:3001/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_base64: base64Image,
                prompt: prompt
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();

            if (result.success) {
                logger.info('FastVLM анализ успешен', {
                    analysisLength: result.analysis.length
                });

                // Извлекаем тип одежды из анализа
                let analysisText = result.analysis || '';

                // Исправляем проблемы с кодировкой текста
                try {
                    // Проверяем и исправляем битый текст
                    if (analysisText.includes('�')) {
                        logger.warn('Обнаружен битый текст, исправляем кодировку');
                        // Попытка исправить распространенные проблемы с кодировкой
                        analysisText = analysisText
                            .replace(/�burgh/g, 'burgh')  // исправляем "�burgh" -> "burgh"
                            .replace(/пре�/g, 'пре')      // исправляем "пре�" -> "пре"
                            .replace(/�/g, '');           // удаляем оставшиеся символы замены
                    }

                    // Проверяем на другие проблемы с кодировкой
                    if (analysisText.includes('\ufffd')) {
                        analysisText = analysisText.replace(/\ufffd/g, '');
                    }

                    // Убеждаемся что текст не пустой после очистки
                    if (!analysisText.trim()) {
                        analysisText = 'Анализ выполнен, но текст описания недоступен.';
                    }
                } catch (encodingError) {
                    logger.error('Ошибка при обработке кодировки текста', {
                        error: encodingError.message,
                        originalText: analysisText.substring(0, 100)
                    });
                    analysisText = 'Анализ выполнен, но возникли проблемы с обработкой текста.';
                }

                const extractedType = extractClothingType(analysisText);

                return {
                    className: extractedType.className,
                    classNameRu: extractedType.classNameRu,
                    confidence: 95,
                    analysis: analysisText,
                    fastvlm: true
                };
            } else {
                logger.error('FastVLM сервер вернул ошибку', {
                    error: result.error
                });
                return simulateClassification();
            }
        } else {
            logger.error('FastVLM сервер недоступен', {
                status: response.status,
                statusText: response.statusText
            });
            return simulateClassification();
        }

    } catch (error) {
        logger.error('Ошибка при обращении к FastVLM серверу', {
            error: error.message,
            stack: error.stack
        });
        // В случае любой ошибки возвращаем симуляцию
        return simulateClassification();
    }
}

/**
 * Создает заглушку для результата классификации
 * @returns {Object} Результат классификации {className, confidence}
 */
function simulateClassification() {
    const CLASS_NAMES = ['dress', 'tshirt', 'pants', 'jacket'];
    const CLASS_NAMES_RU = {
        'dress': 'Платье',
        'tshirt': 'Футболка',
        'pants': 'Брюки',
        'jacket': 'Куртка',
        'unknown': 'Неизвестный тип'
    };
    
    const randomIndex = Math.floor(Math.random() * CLASS_NAMES.length);
    const className = CLASS_NAMES[randomIndex];
    const confidence = (70 + Math.random() * 25).toFixed(2); // 70-95%
    
    return {
        className,
        classNameRu: CLASS_NAMES_RU[className] || 'Повседневная одежда',
        confidence,
        simulated: true
    };
}

/**
 * Handle style analysis with AI (photo or Pinterest URL)
 * POST /api/analyze
 */
router.post('/', async (req, res) => {
    try {
        logger.info('Получен запрос на анализ изображения');
        const { photo, pinterestUrl, initData } = req.body;
        
        if ((!photo && !pinterestUrl) || !initData) {
            logger.error('Отсутствуют необходимые параметры в запросе', {
                hasPhoto: !!photo,
                hasPinterestUrl: !!pinterestUrl,
                hasInitData: !!initData
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }
        
        // Логируем размер фото
        if (photo) {
            const photoSize = (photo.length * 0.75) / 1024; // примерный размер в KB (base64 длиннее бинарных данных на ~33%)
            logger.info('Получено фото для анализа', {
                sizeKB: photoSize.toFixed(2)
            });
        }
        
        // Validate Telegram initData
        const validationResult = validateTelegramWebAppData(initData);
        
        if (!validationResult.isValid) {
            logger.error('Ошибка валидации Telegram initData', {
                error: validationResult.error
            });
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }
        
        // Extract user information
        const { user } = validationResult.data;
        logger.info('Запрос на анализ от пользователя', {
            userId: user.id,
            userName: user.first_name,
            sourceType: photo ? 'photo' : 'pinterest'
        });
        
        // Пропускаем поиск пользователя в MongoDB (работаем без БД)
        let userDoc = null;
        try {
            userDoc = await User.findOne({ telegramId: user.id });
        } catch (err) {
            logger.debug('Пропускаем поиск в БД, MongoDB не активна');
        }
        
        // Determine source type
        const sourceType = photo ? 'photo' : 'pinterest';
        logger.debug('Определен тип источника', { sourceType });
        
        let classification;
        let analysis;
        let comments;
        
        if (sourceType === 'photo') {
            try {
                // Декодируем base64 в бинарные данные
                const imageBuffer = Buffer.from(photo, 'base64');
                logger.debug('Изображение преобразовано из base64', {
                    sizeBytes: imageBuffer.length
                });
                
                // Проверяем, что изображение корректное
                if (imageBuffer.length < 100) {
                    throw new Error('Некорректное изображение (слишком маленький размер)');
                }
                
                // Классифицируем изображение через FastVLM
                const fastVLMResult = await classifyImage(imageBuffer);
                logger.debug('Получен результат от FastVLM', {
                    className: fastVLMResult.className,
                    confidence: fastVLMResult.confidence,
                    hasAnalysis: !!fastVLMResult.analysis,
                    analysisLength: fastVLMResult.analysis ? fastVLMResult.analysis.length : 0
                });
                
                // Используем анализ от FastVLM
                analysis = fastVLMResult.analysis || 'Анализ недоступен';
                
                // Сохраняем классификацию для истории
                classification = {
                    className: fastVLMResult.className,
                    classNameRu: fastVLMResult.classNameRu,
                    confidence: fastVLMResult.confidence
                };
                
                // Проверка на корректность результатов классификации
                if (!classification || !classification.className || !classification.confidence) {
                    logger.warn('Некорректные данные классификации, используем заглушку', {
                        classification: classification
                    });
                    // Создаем заглушку для классификации
                    classification = {
                        className: 'unknown',
                        classNameRu: 'Повседневная одежда',
                        confidence: 75 + Math.random() * 15
                    };
                    // И генерируем анализ для заглушки
                    analysis = generateAnalysisHTML(classification);
                }
                
                // Генерируем комментарии на основе классификации
                comments = generateComments(classification);
            } catch (imageError) {
                logger.error('Ошибка при обработке изображения', {
                    error: imageError.message,
                    stack: imageError.stack
                });
                
                // Создаем заглушку для ошибки
                classification = {
                    className: 'casual',
                    classNameRu: 'Повседневная одежда',
                    confidence: 80,
                    simulated: true
                };
                
                analysis = generateAnalysisHTML(classification, false, true);
                comments = generateComments(classification, false, true);
                
                logger.warn('Используем заглушку из-за ошибки обработки изображения', {
                    classification: classification
                });
            }
        } else {
            // Если это Pinterest URL, используем заглушку
            logger.info('Обработка Pinterest URL, используем симуляцию');
            const mockResult = simulateClassification();
            analysis = generateAnalysisHTML(mockResult, true);
            comments = generateComments(mockResult, true);
            classification = mockResult;
        }
        
        // Проверяем, что все необходимые данные существуют
        if (!classification || !analysis) {
            logger.error('Ошибка при формировании результатов анализа', {
                hasClassification: !!classification,
                hasAnalysis: !!analysis
            });
            return res.status(500).json({
                success: false,
                error: 'Failed to generate analysis results'
            });
        }
        
        try {
            // Save the analysis result to the user's history if MongoDB is available
            if (userDoc && userDoc.analysisHistory) {
                userDoc.analysisHistory.push({
                    timestamp: new Date(),
                    sourceType,
                    analysis
                });
                try {
                    await userDoc.save();
                    logSuccess('Анализ сохранен в историю пользователя', {
                        userId: user.id,
                        sourceType
                    });
                } catch (saveErr) {
                    logger.debug('Пропускаем сохранение в БД, MongoDB не активна');
                }
            } else {
                logWarning('Не сохраняем в историю, MongoDB не активна');
            }
        } catch (dbError) {
            logger.error('Ошибка при сохранении в базу данных', {
                error: dbError.message,
                stack: dbError.stack
            });
            // Продолжаем выполнение, так как ошибка БД не должна влиять на результат анализа
        }
        
        // Подготавливаем ответ
        const response = {
            success: true,
            analysis,
            comments,
            classification
        };

        logger.info('Отправляем результат анализа клиенту', {
            hasAnalysis: !!analysis,
            analysisLength: analysis ? analysis.length : 0,
            hasComments: !!comments,
            hasClassification: !!classification,
            classificationType: classification ? classification.className : 'none'
        });

        return res.json(response);
    } catch (error) {
        logger.error('Ошибка при анализе изображения', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
});

/**
 * Генерирует HTML для отображения результатов анализа
 * @param {Object} classification - Результат классификации
 * @param {boolean} isPinterest - Флаг, указывающий на источник (Pinterest URL)
 * @param {boolean} isError - Флаг, указывающий на ошибку при анализе
 * @returns {string} HTML для отображения в клиенте
 */
/**
 * Извлекает тип одежды из текста анализа FastVLM
 * @param {string} analysisText - Текст анализа от FastVLM
 * @returns {Object} Объект с className и classNameRu
 */
function extractClothingType(analysisText) {
    const text = analysisText.toLowerCase();
    
    // Словарь для поиска типов одежды в русском тексте
    const clothingTypes = {
        'платье': { className: 'dress', classNameRu: 'Платье' },
        'футболка': { className: 'tshirt', classNameRu: 'Футболка' },
        'рубашка': { className: 'shirt', classNameRu: 'Рубашка' },
        'брюки': { className: 'pants', classNameRu: 'Брюки' },
        'джинсы': { className: 'jeans', classNameRu: 'Джинсы' },
        'куртка': { className: 'jacket', classNameRu: 'Куртка' },
        'пиджак': { className: 'blazer', classNameRu: 'Пиджак' },
        'свитер': { className: 'sweater', classNameRu: 'Свитер' },
        'кардиган': { className: 'cardigan', classNameRu: 'Кардиган' },
        'юбка': { className: 'skirt', classNameRu: 'Юбка' },
        'блузка': { className: 'blouse', classNameRu: 'Блузка' },
        'пальто': { className: 'coat', classNameRu: 'Пальто' }
    };
    
    // Ищем упоминания типов одежды в тексте
    for (const [keyword, type] of Object.entries(clothingTypes)) {
        if (text.includes(keyword)) {
            return type;
        }
    }
    
    // Если не нашли конкретный тип, возвращаем общий
    return { className: 'clothing', classNameRu: 'Одежда' };
}

function generateAnalysisHTML(classification, isPinterest = false, isError = false) {
    const { className, classNameRu, confidence, simulated, fastvlm, analysis } = classification;
    
    // Если это анализ от FastVLM, показываем особый бейдж
    const fastvlmBadge = fastvlm ? 
        `<div style="background: linear-gradient(45deg, #81D8D0, #40a7e3); color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; display: inline-block; margin-bottom: 10px;">
            🤖 FastVLM AI Analysis
        </div>` : '';
    
    // Если есть детальный анализ от FastVLM, показываем его
    const detailedAnalysis = (fastvlm && analysis) ? 
        `<div class="analysis-item">
            <h3>Детальный анализ:</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; line-height: 1.6; white-space: pre-wrap;">
                ${analysis}
            </div>
        </div>` : '';
    
    // Текст ошибки
    const errorText = isError ?
        `<div style="color: #f44336; margin-top: 5px; font-size: 0.9em;">
            Примечание: возникла проблема при анализе изображения. Результат может быть не точным.
        </div>` : '';
    
    // Выбираем рекомендации в зависимости от типа одежды
    const recommendations = getRecommendationsForClass(className);
    
    return `
        ${fastvlmBadge}
        ${detailedAnalysis}
        <div class="analysis-item">
            <h3>Рекомендации:</h3>
            <ul>
                <li>${recommendations[0]}</li>
                <li>${recommendations[1]}</li>
            </ul>
        </div>
    `;
}

/**
 * Возвращает рекомендации в зависимости от класса одежды
 * @param {string} className - Класс одежды
 * @returns {Array} Массив из двух рекомендаций
 */
function getRecommendationsForClass(className) {
    const recommendations = {
        'dress': [
            'Это платье можно дополнить аксессуарами для создания более яркого образа.',
            'Попробуйте разные стили обуви, чтобы создать различные образы с этим платьем.'
        ],
        'tshirt': [
            'Футболку можно комбинировать с джинсами или брюками для повседневного образа.',
            'Добавьте стильный жакет или кардиган для более формального вида.'
        ],
        'pants': [
            'Эти брюки отлично сочетаются с рубашками и блузками различных стилей.',
            'Экспериментируйте с разной обувью для создания разных образов.'
        ],
        'jacket': [
            'Эта куртка добавит стиля вашему повседневному образу.',
            'Сочетайте с разными футболками и джинсами для создания различных комбинаций.'
        ]
    };
    
    // Если класс неизвестен, возвращаем общие рекомендации
    return recommendations[className] || [
        'Этот предмет одежды можно комбинировать с различными аксессуарами.',
        'Экспериментируйте с разными стилями, чтобы найти идеальное сочетание.'
    ];
}

/**
 * Генерирует комментарии на основе классификации
 * @param {Object} classification - Результат классификации
 * @param {boolean} isPinterest - Флаг, указывающий на источник (Pinterest URL)
 * @returns {Array} Массив комментариев
 */
function generateComments(classification, isPinterest = false) {
    const { className, classNameRu } = classification;
    
    // Базовые комментарии в зависимости от типа одежды
    const baseComments = {
        'dress': [
            `Это платье выглядит стильно и современно.`,
            `Такие платья популярны в этом сезоне.`,
            `Цветовая гамма платья хорошо подобрана.`
        ],
        'tshirt': [
            `Эта футболка отлично подойдет для повседневного стиля.`,
            `Футболки такого кроя подходят для разных типов фигуры.`,
            `Вы можете создать множество образов с этой футболкой.`
        ],
        'pants': [
            `Эти брюки отлично вписываются в современные тренды.`,
            `Такой фасон брюк универсален и подходит для разных случаев.`,
            `Брюки можно комбинировать с различными верхними элементами гардероба.`
        ],
        'jacket': [
            `Эта куртка добавит стиля вашему образу.`,
            `Куртка такого типа - отличный выбор для переходного сезона.`,
            `Обратите внимание на материал и качество пошива куртки.`
        ]
    };
    
    // Выбираем комментарии для данного типа одежды или используем общие
    const specificComments = baseComments[className] || [
        `Этот предмет одежды выглядит стильно.`,
        `Обратите внимание на качество материалов.`,
        `Можно комбинировать с разными элементами гардероба.`
    ];
    
    // Общие комментарии, которые применимы к любой одежде
    const generalComments = [
        `Обратите внимание на сочетание цветов в вашем образе.`,
        `Аксессуары могут значительно изменить восприятие наряда.`,
        `Правильно подобранная обувь завершит образ.`
    ];
    
    // Pinterest-специфические комментарии
    const pinterestComments = [
        `Ваша коллекция на Pinterest отражает хороший вкус.`,
        `Интересная подборка вдохновений на вашей доске.`,
        `Подобные образы популярны среди модных блогеров.`
    ];
    
    // Собираем все комментарии
    let allComments = [...specificComments, ...generalComments];
    
    // Если источник - Pinterest, добавляем соответствующие комментарии
    if (isPinterest) {
        allComments = [...pinterestComments, ...generalComments];
    }
    
    // Перемешиваем массив и выбираем 3-5 комментариев
    const shuffled = allComments.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3 + Math.floor(Math.random() * 3));
}

module.exports = router; 