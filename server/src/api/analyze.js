const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');

// Путь к модели относительно корня проекта
const MODEL_PATH = path.join(__dirname, '../../../clothing_model.h5');

// Параметры изображения (такие же, как в Python-скрипте)
const IMG_HEIGHT = 224;
const IMG_WIDTH = 224;
const CLASS_NAMES = ['dress', 'tshirt', 'pants', 'jacket'];

// Русские названия для классов одежды
const CLASS_NAMES_RU = {
    'dress': 'Платье',
    'tshirt': 'Футболка',
    'pants': 'Брюки',
    'jacket': 'Куртка',
    'unknown': 'Неизвестный тип'
};

// Добавляем функцию для преобразования модели h5 в формат, поддерживаемый tfjs
async function convertH5ToTfjsFormat() {
    try {
        const h5Path = MODEL_PATH;
        const outputDir = path.join(__dirname, '../../../tfjs_model');
        
        // Проверяем существование файла модели h5
        if (!fs.existsSync(h5Path)) {
            console.error(`Файл модели .h5 не найден по пути: ${h5Path}`);
            return false;
        }
        
        // Проверяем, существует ли уже сконвертированная модель
        if (fs.existsSync(path.join(outputDir, 'model.json'))) {
            console.log('Уже существует сконвертированная модель, используем её');
            return true;
        }
        
        console.log('Модель в формате h5 требует конвертацию для использования в TensorFlow.js');
        console.log('Рекомендуется использовать утилиту tensorflowjs_converter для преобразования:');
        console.log('```');
        console.log('pip install tensorflowjs');
        console.log(`tensorflowjs_converter --input_format keras ${h5Path} ${outputDir}`);
        console.log('```');
        
        console.log('В текущем режиме будет использована симуляция классификации');
        
        return false;
    } catch (error) {
        console.error('Ошибка при проверке конвертации модели:', error);
        return false;
    }
}

// Загрузка модели TensorFlow
let model;
async function loadModel() {
    try {
        console.log(`Загрузка модели из ${MODEL_PATH}...`);
        
        // Проверяем существование файла модели
        if (!fs.existsSync(MODEL_PATH)) {
            console.error(`Файл модели не найден по пути: ${MODEL_PATH}`);
            console.error('Текущая директория:', __dirname);
            model = null;
            
            // Проверяем доступные файлы в директории
            try {
                const rootDir = path.join(__dirname, '../../..');
                console.log('Содержимое корневой директории:');
                fs.readdirSync(rootDir).forEach(file => {
                    console.log(file);
                });
            } catch (e) {
                console.error('Ошибка при проверке директории:', e);
            }
            
            return;
        }
        
        console.log('Файл модели найден, начинаем загрузку...');
        
        // Проверяем, требуется ли конвертация модели h5
        const isTfjsFormatAvailable = await convertH5ToTfjsFormat();
        
        if (isTfjsFormatAvailable) {
            // Если есть сконвертированная модель, загружаем её
            const tfjsModelPath = `file://${path.join(__dirname, '../../../tfjs_model/model.json')}`;
            try {
                model = await tf.loadLayersModel(tfjsModelPath);
                console.log('Модель успешно загружена из сконвертированного формата');
                return;
            } catch (err) {
                console.error('Ошибка при загрузке сконвертированной модели:', err);
            }
        }
        
        // Если сконвертированная модель недоступна, пробуем прямые методы загрузки
        try {
            // Загружаем модель через tfjs-node
            model = await tf.loadLayersModel(`file://${MODEL_PATH}`);
            console.log('Модель успешно загружена через loadLayersModel');
            
            // Проверяем, что модель корректно загружена
            if (model) {
                // Печатаем сводку модели
                console.log('Сводка модели:');
                model.summary();
                
                // Пробуем вывести слои модели
                const layers = model.layers;
                console.log(`Модель содержит ${layers.length} слоев`);
            }
        } catch (layersModelError) {
            console.warn(`Не удалось загрузить через loadLayersModel: ${layersModelError.message}`);
            
            try {
                // Альтернативный способ загрузки для .h5 формата
                model = await tf.node.loadSavedModel(MODEL_PATH);
                console.log('Модель успешно загружена через loadSavedModel');
            } catch (savedModelError) {
                console.error(`Не удалось загрузить через loadSavedModel: ${savedModelError.message}`);
                
                // Последняя попытка через другой метод
                try {
                    model = await tf.loadGraphModel(`file://${MODEL_PATH}`);
                    console.log('Модель успешно загружена через loadGraphModel');
                } catch (graphModelError) {
                    console.error(`Не удалось загрузить через loadGraphModel: ${graphModelError.message}`);
                    model = null;
                }
            }
        }
    } catch (err) {
        console.error('Ошибка при загрузке модели:', err);
        // Создаем заглушку, если модель не может быть загружена
        model = null;
    }
    
    if (!model) {
        console.warn('Модель не была загружена. Будет использоваться симуляция результатов.');
    }
}

/**
 * Обрабатывает изображение для передачи в модель классификации
 * @param {Buffer} imageBuffer - Буфер изображения (из base64)
 * @returns {tf.Tensor} Тензор, готовый для подачи в модель
 */
async function preprocessImage(imageBuffer) {
    try {
        // Изменяем размер и преобразуем изображение согласно Python-скрипту
        const preprocessedImage = await sharp(imageBuffer)
            .resize(IMG_WIDTH, IMG_HEIGHT)
            .toFormat('jpeg')
            .toBuffer();
        
        // Создаем тензор из буфера изображения
        const tensor = tf.node.decodeImage(preprocessedImage, 3);
        
        // Нормализуем (0-1) как в Python-скрипте
        const normalized = tensor.div(tf.scalar(255));
        
        // Добавляем размерность батча
        const batched = normalized.expandDims(0);
        
        return batched;
    } catch (err) {
        console.error('Ошибка при предобработке изображения:', err);
        throw err;
    }
}

/**
 * Классифицирует изображение с помощью модели TensorFlow
 * @param {Buffer} imageBuffer - Буфер изображения (из base64)
 * @returns {Object} Результат классификации {className, confidence}
 */
async function classifyImage(imageBuffer) {
    try {
        // Проверяем наличие модели
        if (!model) {
            console.warn('Модель не загружена, возвращаем заглушку...');
            return simulateClassification();
        }
        
        console.log('Начинаем предобработку изображения...');
        const inputTensor = await preprocessImage(imageBuffer);
        console.log('Изображение успешно предобработано');
        
        // Выполняем предсказание
        console.log('Запуск модели для предсказания...');
        let predictions;
        let predictionData;
        
        try {
            // Выполняем предсказание аналогично Python-скрипту
            predictions = await model.predict(inputTensor);
            predictionData = await predictions.data();
            
            console.log('Получены данные предсказания:', predictionData);
            
            // Проверяем, что получили валидные данные
            if (!predictionData || predictionData.length !== CLASS_NAMES.length) {
                console.error('Некорректные данные предсказания:', predictionData, 'ожидалось', CLASS_NAMES.length, 'классов');
                return simulateClassification();
            }
        } catch (predictionError) {
            console.error('Ошибка при выполнении предсказания:', predictionError);
            return simulateClassification();
        }
        
        // Находим класс с наибольшей вероятностью аналогично Python-скрипту
        let maxIndex = 0;
        let maxValue = predictionData[0];
        
        for (let i = 1; i < predictionData.length; i++) {
            if (predictionData[i] > maxValue) {
                maxIndex = i;
                maxValue = predictionData[i];
            }
        }
        
        // Проверяем, что индекс не выходит за пределы массива
        if (maxIndex >= CLASS_NAMES.length) {
            console.error('Индекс класса выходит за пределы допустимых значений:', maxIndex);
            return simulateClassification();
        }
        
        const className = CLASS_NAMES[maxIndex];
        const confidence = maxValue * 100;
        
        console.log(`Результат классификации: ${className} (${confidence.toFixed(2)}%)`);
        
        // Очищаем память
        tf.dispose(inputTensor);
        tf.dispose(predictions);
        
        // Формируем результат с проверкой на валидность
        const result = {
            className,
            classNameRu: CLASS_NAMES_RU[className] || CLASS_NAMES_RU.unknown,
            confidence: confidence.toFixed(2)
        };
        
        // Дополнительно проверяем структуру результата
        if (!result.className || !result.classNameRu || !result.confidence) {
            console.error('Некорректная структура результата:', result);
            return simulateClassification();
        }
        
        return result;
    } catch (err) {
        console.error('Ошибка при классификации изображения:', err);
        return simulateClassification();
    }
}

/**
 * Создает заглушку для результата классификации
 * @returns {Object} Результат классификации {className, confidence}
 */
function simulateClassification() {
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
        console.log('Получен запрос на анализ изображения');
        const { photo, pinterestUrl, initData } = req.body;
        
        if ((!photo && !pinterestUrl) || !initData) {
            console.error('Отсутствуют необходимые параметры в запросе');
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }
        
        // Логируем размер фото
        if (photo) {
            const photoSize = (photo.length * 0.75) / 1024; // примерный размер в KB (base64 длиннее бинарных данных на ~33%)
            console.log(`Размер полученного фото: ${photoSize.toFixed(2)} KB`);
        }
        
        // Validate Telegram initData
        const validationResult = validateTelegramWebAppData(initData);
        
        if (!validationResult.isValid) {
            console.error('Ошибка валидации Telegram initData:', validationResult.error);
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }
        
        // Extract user information
        const { user } = validationResult.data;
        console.log(`Запрос от пользователя: ${user.id} (${user.first_name})`);
        
        // Get user from database или create if not exists
        let userDoc = await User.findOne({ telegramId: user.id });
        
        if (!userDoc) {
            console.log(`Пользователь не найден, создаем нового: ${user.id}`);
            userDoc = new User({
                telegramId: user.id,
                firstName: user.first_name,
                lastName: user.last_name || '',
                username: user.username || '',
                registeredAt: new Date()
            });
            try {
                await userDoc.save();
                console.log(`Пользователь успешно создан: ${user.id}`);
            } catch (saveErr) {
                console.error(`Ошибка при создании пользователя: ${saveErr.message}`);
            }
        }
        
        // Determine source type
        const sourceType = photo ? 'photo' : 'pinterest';
        console.log(`Тип источника: ${sourceType}`);
        
        let classification;
        let analysis;
        let comments;
        
        if (sourceType === 'photo') {
            try {
                // Декодируем base64 в бинарные данные
                const imageBuffer = Buffer.from(photo, 'base64');
                console.log(`Изображение успешно преобразовано из base64, размер: ${imageBuffer.length} байт`);
                
                // Проверяем, что изображение корректное
                if (imageBuffer.length < 100) {
                    throw new Error('Некорректное изображение (слишком маленький размер)');
                }
                
                // Классифицируем изображение
                classification = await classifyImage(imageBuffer);
                console.log('Результат классификации:', classification);
                
                // Проверка на корректность результатов классификации
                if (!classification || !classification.className || !classification.confidence) {
                    console.error('Некорректные данные классификации');
                    // Создаем заглушку для классификации
                    classification = {
                        className: 'unknown',
                        classNameRu: 'Повседневная одежда',
                        confidence: 75 + Math.random() * 15
                    };
                }
                
                // Создаем HTML для отображения результатов
                analysis = generateAnalysisHTML(classification);
                
                // Генерируем комментарии на основе классификации
                comments = generateComments(classification);
            } catch (imageError) {
                console.error('Ошибка при обработке изображения:', imageError);
                
                // Создаем заглушку для ошибки
                classification = {
                    className: 'casual',
                    classNameRu: 'Повседневная одежда',
                    confidence: 80,
                    simulated: true
                };
                
                analysis = generateAnalysisHTML(classification, false, true);
                comments = generateComments(classification, false, true);
                
                console.log('Используем заглушку из-за ошибки обработки:', classification);
            }
        } else {
            // Если это Pinterest URL, используем заглушку
            console.log('Используем заглушку для Pinterest URL');
            const mockResult = simulateClassification();
            analysis = generateAnalysisHTML(mockResult, true);
            comments = generateComments(mockResult, true);
            classification = mockResult;
        }
        
        // Проверяем, что все необходимые данные существуют
        if (!classification || !analysis) {
            console.error('Ошибка при формировании результатов анализа');
            return res.status(500).json({
                success: false,
                error: 'Failed to generate analysis results'
            });
        }
        
        try {
            // Save the analysis result to the user's history
            if (userDoc.analysisHistory) {
                userDoc.analysisHistory.push({
                    timestamp: new Date(),
                    sourceType,
                    analysis
                });
                await userDoc.save();
                console.log('Анализ успешно сохранен в историю пользователя');
            } else {
                console.warn('Не удалось сохранить в историю - отсутствует поле analysisHistory');
            }
        } catch (dbError) {
            console.error('Ошибка при сохранении в базу данных:', dbError);
            // Продолжаем выполнение, так как ошибка БД не должна влиять на результат анализа
        }
        
        // Подготавливаем ответ
        const response = {
            success: true,
            analysis,
            comments,
            classification
        };
        
        console.log('Отправляем результат анализа клиенту');
        return res.json(response);
    } catch (error) {
        console.error('Ошибка при анализе:', error);
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
function generateAnalysisHTML(classification, isPinterest = false, isError = false) {
    const { className, classNameRu, confidence, simulated } = classification;
    
    // Если заглушка, указываем это
    const simulatedWarning = simulated ? 
        `<div style="color: #ff9800; margin-top: 5px; font-size: 0.9em;">
            Примечание: результат симулирован, так как модель недоступна.
        </div>` : '';
    
    // Pinterest-специфический текст
    const pinterestText = isPinterest ? 
        `<div class="analysis-item">
            <h3>Анализ Pinterest доски:</h3>
            <p>На основе вдохновения с Pinterest, ваш стиль отражает современные тенденции.</p>
        </div>` : '';
    
    // Текст ошибки
    const errorText = isError ?
        `<div style="color: #f44336; margin-top: 5px; font-size: 0.9em;">
            Примечание: возникла проблема при анализе изображения. Результат может быть не точным.
        </div>` : '';
    
    // Выбираем рекомендации в зависимости от типа одежды
    const recommendations = getRecommendationsForClass(className);
    
    return `
        <div class="analysis-item">
            <h3>Определенный тип одежды:</h3>
            <p><strong>${classNameRu}</strong> (уверенность: ${confidence}%)</p>
            ${simulatedWarning}
            ${errorText}
        </div>
        ${pinterestText}
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

// Загружаем модель при запуске
loadModel();

module.exports = router; 