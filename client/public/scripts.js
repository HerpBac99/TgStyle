let tg = window.Telegram.WebApp;
// Проверяем, доступна ли функция логирования из logger.js
if (typeof window.appLogger !== 'function') {
    // Временная функция логирования, если logger.js не загрузился
    window.appLogger = function(message, level = 'info', data = null) {
        console[level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'log')](message, data || '');
    };
    console.warn('Logger не загружен, используется временный логгер');
}

// Используем apiUrl из logger.js
if (!window.apiUrl) {
    window.apiUrl = 'https://flappy.keenetic.link/api';
    console.warn('apiUrl не найден, используется значение по умолчанию');
}

// Initialize Telegram WebApp
tg.expand();
tg.enableClosingConfirmation();

// DOM Elements - User Profile
const userName = document.getElementById('user-name');
const userPhoto = document.getElementById('user-photo');

// DOM Elements - History Grid
const historyCells = document.querySelectorAll('.history-cell');

// Camera button
const cameraBtn = document.getElementById('camera-btn');

// Global variables
let photoData = null;
let currentAnalysisData = null;
let isTgThemeApplied = false; // Флаг для отслеживания применения темы Telegram
const STORAGE_KEY = 'tgStyleHistory'; // Ключ для хранения истории анализов
const MAX_HISTORY_ITEMS = 4; // Максимальное количество элементов истории

// Константы для логирования перенесены в logger.js

/**
 * Принудительно устанавливает цвет фона
 * Используется для обхода ограничений Telegram WebApp на переопределение стилей
 * Выполняется только если текущий фон не соответствует нужному
 */
function ensureBackgroundColor() {
    // Проверяем текущий цвет фона
    const currentBgColor = getComputedStyle(document.body).backgroundColor;
    const targetColor = '#81D8D0';
    
    // RGB-эквивалент для #81D8D0 = rgb(129, 216, 208)
    const targetRgb = 'rgb(129, 216, 208)';
    
    // Если цвет не соответствует нужному и флаг не установлен, применяем стили
    if ((currentBgColor !== targetColor && currentBgColor !== targetRgb) || !isTgThemeApplied) {
        appLogger('Применяем тему приложения', 'info', {
            currentBgColor,
            targetColor
        });
        
        // Устанавливаем стиль напрямую через JavaScript
        document.body.style.backgroundColor = targetColor;
        
        // Применяем к другим элементам, если нужно
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.backgroundColor = targetColor;
        }
        
        // Устанавливаем флаг
        isTgThemeApplied = true;
    }
}

/**
 * Загружает и отображает информацию о профиле пользователя
 * Использует данные из Telegram WebApp
 */
function loadUserProfile() {
    appLogger('Загрузка профиля пользователя', 'info');
    
    try {
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            userName.textContent = user.first_name || '';
            
            appLogger('Данные пользователя получены', 'debug', {
                firstName: user.first_name,
                hasPhoto: !!user.photo_url
            });
            
            // Устанавливаем фото пользователя, если оно доступно
            if (user.photo_url) {
                userPhoto.style.backgroundImage = `url(${user.photo_url})`;
            }
        } else {
            appLogger('Данные пользователя недоступны', 'warn');
        }
    } catch (error) {
        appLogger('Ошибка при загрузке профиля', 'error', error);
    }
}

/**
 * Проверяет авторизацию пользователя и инициализирует приложение
 */
async function checkAuth() {
    try {
        appLogger('Начало процесса авторизации', 'info');
        
        // Загружаем профиль и применяем цвет фона
        loadUserProfile();
        ensureBackgroundColor();
        
        // Загружаем сохраненную историю анализов
        loadHistoryFromStorage();
        
        const initData = tg.initData;
        if (!initData) {
            appLogger('InitData отсутствует, продолжаем без авторизации', 'warn');
            // Продолжаем без авторизации для локального тестирования
            return;
        }
        
        appLogger('Отправка данных на сервер для авторизации', 'debug');
        
        try {
            const response = await fetch(`${window.apiUrl}/auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ initData })
            });
            
            // Проверяем статус ответа
            if (response.status >= 500) {
                const statusText = response.statusText || 'Ошибка сервера';
                appLogger(`Ошибка сервера ${response.status}: ${statusText}`, 'error');
                
                // Если это 502 ошибка - Bad Gateway
                if (response.status === 502) {
                    const errorMsg = 'Ошибка 502 Bad Gateway: Сервер недоступен или перегружен. ' +
                                    'Попробуйте позже или обратитесь к администратору.';
                    displayError(errorMsg);
                    
                    // Попытка подробной диагностики
                    appLogger('Диагностика: проверка доступности API', 'debug');
                    try {
                        const pingResponse = await fetch(`${window.apiUrl}/ping`, { 
                            method: 'GET',
                            mode: 'no-cors'
                        });
                        appLogger(`Статус пинга: ${pingResponse.status}`, 'debug');
                    } catch (pingError) {
                        appLogger('Сервер полностью недоступен', 'error', {
                            error: pingError.message
                        });
                    }
                    
                    return;
                }
                
                throw new Error(`Ошибка сервера: ${response.status} ${statusText}`);
            }

            // Проверяем ответ сервера на JSON формат
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                // Если ответ не в формате JSON, получаем текст и логируем его
                const textResponse = await response.text();
                appLogger('Сервер вернул не-JSON ответ', 'error', {
                    status: response.status,
                    text: textResponse.substring(0, 200) // Логируем только начало (может быть большим)
                });
                throw new Error(`Сервер вернул некорректный формат данных: ${textResponse.substring(0, 50)}...`);
            }

            const data = await response.json();
            appLogger('Получен ответ от сервера', 'debug', data);

            if (data.success) {
                appLogger('Авторизация успешна', 'info');
                // Инициализация завершена, все готово для использования
            } else {
                const errorMsg = 'Ошибка авторизации: ' + data.error;
                appLogger(errorMsg, 'error');
                displayError(errorMsg);
            }
        } catch (fetchError) {
            // Обработка ошибок сети
            appLogger('Ошибка сети при выполнении запроса', 'error', {
                message: fetchError.message,
                type: fetchError.name
            });
            
            // Проверяем, не отключен ли интернет
            if (!navigator.onLine) {
                displayError('Нет подключения к интернету. Пожалуйста, проверьте соединение.');
            } else {
                displayError('Ошибка сети: ' + fetchError.message);
            }
            
            throw fetchError;
        }
    } catch (error) {
        const errorMsg = 'Ошибка: ' + error.message;
        appLogger('Исключение при авторизации', 'error', {
            message: error.message,
            stack: error.stack
        });
        displayError(errorMsg);
    }
}

/**
 * Отображает сообщение об ошибке
 * @param {string} message - Текст сообщения об ошибке
 */
function displayError(message) {
    appLogger('Отображение ошибки: ' + message, 'error');
    // Создаем временный элемент для отображения ошибки
    const errorElement = document.createElement('div');
    errorElement.className = 'error';
    errorElement.textContent = message;
    errorElement.style.position = 'fixed';
    errorElement.style.top = '50%';
    errorElement.style.left = '50%';
    errorElement.style.transform = 'translate(-50%, -50%)';
    errorElement.style.padding = '20px';
    errorElement.style.zIndex = '9999';
    document.body.appendChild(errorElement);
    
    // Удаляем элемент через 3 секунды
    setTimeout(() => {
        document.body.removeChild(errorElement);
    }, 3000);
}

// Photo capture using Telegram API
cameraBtn.addEventListener('click', (event) => {
    appLogger('Кнопка камеры нажата, открытие камеры Telegram', 'info');
    event.stopPropagation();
    
    try {
        appLogger('Проверка доступных методов Telegram API', 'debug', {
            methods: Object.keys(tg).filter(key => typeof tg[key] === 'function')
        });
        
        // Открываем камеру напрямую, без диалога выбора
        showFileSelection(true); // Всегда предпочитаем камеру
    } catch (error) {
        appLogger('Ошибка при открытии камеры', 'error', {
            message: error.message,
            stack: error.stack
        });
        showFileSelection(true);
    }
});

/**
 * Показывает стандартный выбор файла через <input>
 * @param {boolean} preferCamera - Предпочитать использование камеры (для мобильных устройств)
 */
function showFileSelection(preferCamera = false) {
    appLogger(`Показываем выбор файла (предпочтение камеры: ${preferCamera})`, 'info');
    
    // Создаем input для выбора файла
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    
    // Если предпочтительна камера, добавляем атрибут capture
    if (preferCamera) {
        fileInput.setAttribute('capture', 'camera');
    }
    
    fileInput.style.display = 'none';
    
    // Обработчик выбора файла
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            appLogger('Файл выбран', 'debug', {
                name: file.name,
                size: file.size,
                type: file.type
            });
            
            // Читаем файл как base64
            const reader = new FileReader();
            reader.onload = function(event) {
                // Получаем данные base64
                const base64 = event.target.result.split(',')[1];
                photoData = base64;
                
                // Показываем превью в полноэкранном режиме
                showFullscreenPreview(event.target.result);
                
                appLogger('Фото загружено и отображено в полноэкранном режиме', 'info', {
                    size: base64.length
                });
            };
            reader.onerror = function(error) {
                appLogger('Ошибка при чтении файла', 'error', {
                    message: error.message
                });
                displayError('Не удалось прочитать файл: ' + error.message);
            };
            reader.readAsDataURL(file);
        } else {
            appLogger('Файл не выбран', 'warn');
        }
        
        // Удаляем input из DOM
        document.body.removeChild(fileInput);
    });
    
    // Добавляем в DOM и вызываем клик
    document.body.appendChild(fileInput);
    fileInput.click();
}

/**
 * Сжимает изображение перед отправкой на сервер
 * @param {string} base64Image - Изображение в формате base64
 * @param {number} maxSizeMB - Максимальный размер в МБ
 * @param {number} maxWidth - Максимальная ширина в пикселях
 * @returns {Promise<string>} - Сжатое изображение в формате base64
 */
async function compressImage(base64Image, maxSizeMB = 1.5, maxWidth = 1280) {
    appLogger('Сжатие изображения перед отправкой', 'info');
    
    return new Promise((resolve, reject) => {
        try {
            // Создаем изображение для получения размеров
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = function() {
                let width = img.width;
                let height = img.height;
                
                // Вычисляем новые размеры, сохраняя пропорции
                if (width > maxWidth) {
                    const ratio = maxWidth / width;
                    width = maxWidth;
                    height = Math.floor(height * ratio);
                }
                
                // Устанавливаем размеры canvas
                canvas.width = width;
                canvas.height = height;
                
                // Отрисовываем изображение на canvas с новыми размерами
                ctx.drawImage(img, 0, 0, width, height);
                
                // Получаем сжатое изображение в формате base64
                // Регулируем качество JPEG для достижения нужного размера
                let quality = 0.9; // Начальное качество
                let compressed = canvas.toDataURL('image/jpeg', quality);
                
                // Проверяем размер и при необходимости уменьшаем качество
                const getCurrentSize = (base64) => {
                    // Примерный размер в байтах (base64 длиннее бинарных данных на ~33%)
                    return Math.ceil((base64.length - base64.indexOf(',') - 1) * 0.75);
                };
                
                // Постепенно уменьшаем качество, пока не достигнем нужного размера
                let currentSize = getCurrentSize(compressed);
                const maxSize = maxSizeMB * 1024 * 1024; // Перевод МБ в байты
                
                while (currentSize > maxSize && quality > 0.1) {
                    quality -= 0.05;
                    compressed = canvas.toDataURL('image/jpeg', quality);
                    currentSize = getCurrentSize(compressed);
                }
                
                // Удаляем префикс Data URL и возвращаем только base64
                const base64Data = compressed.split(',')[1];
                
                appLogger('Изображение успешно сжато', 'info', {
                    originalSize: base64Image.length,
                    compressedSize: base64Data.length,
                    quality: quality.toFixed(2),
                    dimensions: `${width}x${height}`
                });
                
                resolve(base64Data);
            };
            
            img.onerror = function() {
                reject(new Error('Не удалось загрузить изображение для сжатия'));
            };
            
            // Устанавливаем источник изображения
            img.src = `data:image/jpeg;base64,${base64Image}`;
        } catch (error) {
            appLogger('Ошибка при сжатии изображения', 'error', error);
            reject(error);
        }
    });
}

/**
 * Показывает полноэкранный предпросмотр загруженного фото
 * @param {string} imgSrc - Источник изображения (data URL)
 */
function showFullscreenPreview(imgSrc) {
    appLogger('Отображение фото в полноэкранном режиме', 'info');
    
    // Проверяем, если элемент полноэкранного предпросмотра уже существует, удаляем его
    const existingPreview = document.getElementById('fullscreen-preview');
    if (existingPreview) {
        document.body.removeChild(existingPreview);
    }
    
    // Создаем контейнер для полноэкранного просмотра
    const previewContainer = document.createElement('div');
    previewContainer.id = 'fullscreen-preview';
    previewContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #000;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 0;
    `;
    
    // Создаем изображение
    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = `
        width: 100%;
        height: calc(100% - 70px);
        object-fit: contain;
    `;
    
    // Создаем кнопки управления
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        width: 100%;
        height: 70px;
        background-color: #18191a;
        padding: 10px 20px;
    `;
    
    // Кнопка "назад" (ранее - Отмена)
    const backButton = document.createElement('button');
    backButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
    `;
    backButton.style.cssText = `
        background-color: transparent;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: none;
    `;
    
    // Кнопка стрелка вверх (Анализировать)
    const analyzeButton = document.createElement('button');
    analyzeButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
    `;
    analyzeButton.style.cssText = `
        background-color: #81D8D0;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: none;
    `;
    
    // Добавляем обработчики событий
    analyzeButton.addEventListener('click', async () => {
        // Меняем иконку кнопки на лоадер
        analyzeButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="16"></circle>
            </svg>
        `;
        
        // Добавляем анимацию вращения
        const style = document.createElement('style');
        style.textContent = `
            .spinner {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        // Отключаем кнопку во время анализа
        analyzeButton.disabled = true;
        
        try {
            appLogger('Отправка фото на сервер для анализа', 'info');
            
            // Сжимаем изображение перед отправкой
            const compressedPhotoData = await compressImage(photoData, 1.5, 1280);
            
            // Отправляем фото на сервер для анализа
            const response = await fetch(`${window.apiUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    photo: compressedPhotoData,
                    platform: navigator.platform,
                    userAgent: navigator.userAgent,
                    initData: tg.initData || null
                })
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Проверяем наличие данных классификации в ответе
                if (!result.classification) {
                    appLogger('Отсутствуют данные классификации в ответе сервера', 'warn', result);
                    result.classification = {
                        classNameRu: 'Неизвестный тип',
                        confidence: '0'
                    };
                }
                
                appLogger('Анализ успешно завершен', 'info', {
                    classification: result.classification
                });
                
                // Создаем объект с данными анализа с дополнительными проверками
                currentAnalysisData = {
                    photo: photoData, // Сохраняем оригинал фото в истории
                    analysis: result.analysis || '',
                    comments: result.comments || [],
                    classification: result.classification,
                    timestamp: new Date().toISOString()
                };
                
                // Логируем данные перед сохранением
                appLogger('Данные для сохранения в историю', 'debug', {
                    hasPhoto: !!currentAnalysisData.photo,
                    photoLength: currentAnalysisData.photo ? currentAnalysisData.photo.length : 0,
                    classification: currentAnalysisData.classification,
                    timestamp: currentAnalysisData.timestamp
                });
                
                // Сохраняем в историю
                const saveResult = saveCurrentAnalysis(currentAnalysisData);
                
                // Проверяем результат сохранения
                if (!saveResult) {
                    appLogger('Предупреждение: не удалось сохранить анализ в историю', 'warn');
                }
                
                // Закрываем предпросмотр
                document.body.removeChild(previewContainer);
                
                // Показываем всплывающее уведомление с результатом
                showClassificationToast(result.classification);
            } else {
                throw new Error(result.error || 'Ошибка при анализе фото');
            }
        } catch (error) {
            appLogger('Ошибка при анализе фото', 'error', {
                message: error.message,
                stack: error.stack
            });
            
            // Возвращаем иконку и состояние кнопки
            analyzeButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
            `;
            analyzeButton.disabled = false;
            
            // Показываем ошибку
            displayError('Ошибка при анализе: ' + error.message);
        }
    });
    
    backButton.addEventListener('click', () => {
        // Закрываем предпросмотр без сохранения
        document.body.removeChild(previewContainer);
        photoData = null;
    });
    
    // Собираем все вместе
    buttonContainer.appendChild(backButton);
    buttonContainer.appendChild(analyzeButton);
    
    previewContainer.appendChild(img);
    previewContainer.appendChild(buttonContainer);
    
    // Добавляем в DOM
    document.body.appendChild(previewContainer);
}

/**
 * Показывает всплывающее уведомление с результатами классификации
 * @param {Object} classificationData - Данные классификации {classNameRu, confidence}
 */
function showClassificationToast(classificationData) {
    appLogger('Отображение результатов классификации', 'info');
    
    try {
        // Проверяем наличие необходимых свойств
        if (!classificationData || typeof classificationData !== 'object') {
            appLogger('Некорректные данные классификации', 'error', classificationData);
            return;
        }
        
        // Получаем данные и используем значения по умолчанию, если свойства отсутствуют
        const classNameRu = classificationData.classNameRu || 'Неизвестный тип';
        const confidence = classificationData.confidence || '0';
        
        // Создаем элемент для уведомления
        const toast = document.createElement('div');
        toast.className = 'classification-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            font-size: 16px;
            text-align: center;
            z-index: 2000;
            min-width: 250px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
        `;
        
        // Добавляем результаты классификации
        toast.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">Результат анализа:</div>
            <div>${classNameRu}</div>
            <div style="margin-top: 5px; font-size: 14px; opacity: 0.8;">Уверенность: ${confidence}%</div>
        `;
        
        // Добавляем в DOM
        document.body.appendChild(toast);
        
        // Анимация появления
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        }, 10);
        
        // Автоматическое скрытие через 4 секунды
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            toast.style.opacity = '0';
            
            // Удаляем элемент после анимации
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 4000);
    } catch (error) {
        appLogger('Ошибка при отображении результатов классификации', 'error', {
            message: error.message,
            stack: error.stack,
            data: classificationData
        });
    }
}

/**
 * Сохраняет текущий анализ в историю
 * @param {Object} analysisData - Данные анализа для сохранения
 * @returns {boolean} - Успешно ли выполнено сохранение
 */
function saveCurrentAnalysis(analysisData) {
    try {
        appLogger('Попытка сохранения анализа в историю', 'info');
        
        // Проверяем, что analysisData - объект
        if (!analysisData || typeof analysisData !== 'object') {
            appLogger('Ошибка при сохранении: некорректные данные анализа', 'error', { analysisData });
            return false;
        }
        
        // Оптимизируем размер фото перед сохранением
        if (analysisData.photo) {
            try {
                const MAX_LENGTH = 100000; // Максимальная длина base64 строки (примерно 75KB)
                
                if (analysisData.photo.length > MAX_LENGTH) {
                    appLogger('Сжатие фото перед сохранением', 'info', {
                        originalSize: Math.round(analysisData.photo.length / 1024) + 'KB'
                    });
                    
                    // Создаём изображение для манипуляции размером
                    const img = new Image();
                    img.src = `data:image/jpeg;base64,${analysisData.photo}`;
                    
                    // Когда изображение загружено, уменьшаем его
                    img.onload = function() {
                        // Создаём canvas для уменьшения изображения
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Определяем новый размер (уменьшаем пропорционально)
                        let width = img.width;
                        let height = img.height;
                        const aspectRatio = width / height;
                        
                        // Уменьшаем изображение, пока оно не станет достаточно маленьким
                        let quality = 0.8;
                        let newBase64 = analysisData.photo;
                        
                        // Пробуем постепенно уменьшать размер, пока не достигнем нужного
                        while (newBase64.length > MAX_LENGTH && (width > 200 || quality > 0.4)) {
                            // Уменьшаем размеры
                            if (width > 200) {
                                width = width * 0.8;
                                height = width / aspectRatio;
                            } else {
                                // Если размер уже минимальный, уменьшаем качество
                                quality -= 0.1;
                            }
                            
                            // Устанавливаем размеры canvas
                            canvas.width = width;
                            canvas.height = height;
                            
                            // Рисуем изображение на canvas с новыми размерами
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            // Получаем новую base64 строку
                            newBase64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                            
                            appLogger('Попытка сжатия изображения', 'debug', {
                                width,
                                height,
                                quality,
                                newSize: Math.round(newBase64.length / 1024) + 'KB'
                            });
                        }
                        
                        // Обновляем фото в данных анализа
                        analysisData.photo = newBase64;
                        
                        // Если все равно слишком большое, обрезаем и добавляем индикатор
                        if (newBase64.length > MAX_LENGTH) {
                            appLogger('Фото всё ещё слишком большое, обрезаем', 'warn', {
                                finalSize: Math.round(newBase64.length / 1024) + 'KB',
                                limit: Math.round(MAX_LENGTH / 1024) + 'KB'
                            });
                            analysisData.photo = newBase64.substring(0, MAX_LENGTH) + '...';
                        }
                        
                        appLogger('Фото сжато перед сохранением', 'info', {
                            originalSize: Math.round(analysisData.photo.length / 1024) + 'KB',
                            finalSize: Math.round(analysisData.photo.length / 1024) + 'KB'
                        });
                        
                        // Продолжаем процесс сохранения
                        completeAnalysisSave(analysisData);
                    };
                    
                    img.onerror = function() {
                        appLogger('Ошибка при загрузке изображения для сжатия', 'error');
                        // Сохраняем без оптимизации (может быть обрезано)
                        if (analysisData.photo.length > MAX_LENGTH) {
                            analysisData.photo = analysisData.photo.substring(0, MAX_LENGTH) + '...';
                        }
                        completeAnalysisSave(analysisData);
                    };
                    
                    // Возвращаем true, так как сохранение будет выполнено асинхронно
                    return true;
                } else {
                    // Фото уже имеет подходящий размер
                    completeAnalysisSave(analysisData);
                    return true;
                }
            } catch (e) {
                appLogger('Ошибка при оптимизации фото', 'error', e);
                // Пытаемся сохранить без оптимизации
                completeAnalysisSave(analysisData);
                return true;
            }
        } else {
            // Нет фото, просто сохраняем
            completeAnalysisSave(analysisData);
            return true;
        }
    } catch (error) {
        appLogger('Ошибка при сохранении анализа', 'error', error);
        return false;
    }
}

/**
 * Завершает процесс сохранения анализа после оптимизации фото
 * @param {Object} analysisData - Данные анализа для сохранения
 */
function completeAnalysisSave(analysisData) {
    try {
        // Получаем текущую историю из хранилища
        let history = getHistoryFromStorage();
        
        // Если история не является массивом, инициализируем пустым массивом
        if (!Array.isArray(history)) {
            history = [];
        }
        
        // Добавляем метку времени
        analysisData.timestamp = new Date().toISOString();
        
        // Ищем пустой слот или создаем новый в истории
        let emptySlotIndex = history.findIndex(item => !item || item.isEmpty);
        
        if (emptySlotIndex !== -1) {
            // Если нашли пустой слот, заполняем его
            history[emptySlotIndex] = analysisData;
        } else {
            // Иначе добавляем новый элемент в начало массива
            history.unshift(analysisData);
            
            // Если история превышает MAX_HISTORY_SIZE, удаляем старые элементы
            if (history.length > MAX_HISTORY_ITEMS) {
                history = history.slice(0, MAX_HISTORY_ITEMS);
            }
        }
        
        // Сохраняем обновленную историю
        saveHistoryToStorage(history);
        
        // Обновляем отображение ячеек истории
        updateHistoryCells(history);
        
        appLogger('Анализ успешно сохранен в историю', 'info');
        return true;
    } catch (error) {
        appLogger('Ошибка при завершении сохранения анализа', 'error', error);
        return false;
    }
}

/**
 * Получает историю анализов из localStorage
 * @returns {Array} - Массив с сохраненными анализами
 */
function getHistoryFromStorage() {
    try {
        const storedHistory = localStorage.getItem(STORAGE_KEY);
        if (!storedHistory) {
            return new Array(MAX_HISTORY_ITEMS).fill(null);
        }
        
        try {
            const parsedHistory = JSON.parse(storedHistory);
            
            // Проверяем, что parsedHistory - массив
            if (!Array.isArray(parsedHistory)) {
                appLogger('История не является массивом', 'warn');
                return new Array(MAX_HISTORY_ITEMS).fill(null);
            }
            
            // Обеспечиваем нужную длину массива
            const result = parsedHistory.slice(0, MAX_HISTORY_ITEMS);
            while (result.length < MAX_HISTORY_ITEMS) {
                result.push(null);
            }
            
            return result;
        } catch (parseError) {
            appLogger('Ошибка при парсинге истории', 'error', parseError);
            return new Array(MAX_HISTORY_ITEMS).fill(null);
        }
    } catch (error) {
        appLogger('Ошибка при загрузке истории из localStorage', 'error', error);
        return new Array(MAX_HISTORY_ITEMS).fill(null);
    }
}

/**
 * Сохраняет историю анализов в localStorage
 * @param {Array} history - Массив с историей анализов для сохранения
 */
function saveHistoryToStorage(history) {
    try {
        // Создаем копию массива для безопасного сохранения
        const safeHistory = Array.isArray(history) ? [...history] : new Array(MAX_HISTORY_ITEMS).fill(null);
        
        // Сохраняем только 4 элемента (MAX_HISTORY_ITEMS)
        const trimmedHistory = safeHistory.slice(0, MAX_HISTORY_ITEMS);
        
        // Проверяем размер данных перед сохранением
        const historyJSON = JSON.stringify(trimmedHistory);
        const historySize = new Blob([historyJSON]).size;
        
        // Лимит localStorage обычно 5MB (5 * 1024 * 1024 байт)
        const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB (с запасом)
        
        if (historySize > MAX_STORAGE_SIZE) {
            appLogger('История слишком большая для сохранения в localStorage', 'warn', {
                size: historySize,
                limit: MAX_STORAGE_SIZE
            });
            
            // Очищаем данные фото в истории, чтобы уменьшить размер
            const reducedHistory = trimmedHistory.map(item => {
                if (item && !item.isEmpty) {
                    // Сохраняем только миниатюру (первые 10000 символов base64)
                    const photoPrefix = item.photo?.substring(0, 10000);
                    return {
                        ...item,
                        photo: photoPrefix ? photoPrefix + '...' : null
                    };
                }
                return item;
            });
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedHistory));
            appLogger('Сохранена уменьшенная версия истории', 'info');
        } else {
            localStorage.setItem(STORAGE_KEY, historyJSON);
        }
    } catch (error) {
        appLogger('Ошибка при сохранении истории в localStorage', 'error', error);
    }
}

/**
 * Загружает историю из localStorage и обновляет отображение ячеек
 */
function loadHistoryFromStorage() {
    const history = getHistoryFromStorage();
    updateHistoryCells(history);
}

/**
 * Обновляет отображение ячеек истории на основе данных
 * @param {Array} historyData - Массив с историей анализов
 */
function updateHistoryCells(historyData) {
    // Если данные не переданы, загружаем из localStorage
    const history = historyData || getHistoryFromStorage();
    
    // Проверяем, что history - массив
    if (!Array.isArray(history)) {
        appLogger('История не является массивом при обновлении ячеек', 'error', { history });
        return;
    }
    
    // Перебираем все ячейки и обновляем их содержимое
    historyCells.forEach((cell, index) => {
        // Проверяем наличие элемента в истории для данного индекса
        const data = index < history.length ? history[index] : null;
        
        // Очищаем содержимое ячейки
        const contentDiv = cell.querySelector('.history-cell-content');
        if (!contentDiv) {
            appLogger(`Не найден контейнер содержимого для ячейки ${index}`, 'error');
            return;
        }
        
        contentDiv.innerHTML = '';
        
        // Удаляем все классы, кроме базового
        cell.className = 'history-cell';
        
        // Удаляем все существующие обработчики событий
        cell.onclick = null;
        
        // Таймер для долгого нажатия
        let pressTimer;
        let isLongPress = false;
        
        if (data && !data.isEmpty) {
            // Это заполненная ячейка
            cell.classList.add('filled');
            
            // Устанавливаем фоновое изображение, если есть фото
            if (data.photo) {
                // Проверяем, что photo - строка
                if (typeof data.photo === 'string') {
                    try {
                        // Дополнительная проверка для отладки проблем с отображением
                        appLogger(`Установка фона для ячейки ${index}`, 'debug', {
                            photoLength: data.photo.length,
                            photoStart: data.photo.substring(0, 30) + '...',
                            photoEnd: '...' + data.photo.substring(data.photo.length - 30),
                            isTruncated: data.photo.endsWith('...')
                        });
                        
                        // Если фото было обрезано при сохранении в localStorage, добавим предупреждение
                        if (data.photo.endsWith('...')) {
                            appLogger(`Фото в ячейке ${index} было обрезано при сохранении`, 'warn');
                            // Можно показать предупреждение пользователю или попытаться загрузить полное фото
                        }
                        
                        // Устанавливаем backgroundImage
                        cell.style.backgroundImage = `url(data:image/jpeg;base64,${data.photo})`;
                        
                        // Проверяем, успешно ли установлено изображение
                        setTimeout(() => {
                            // Значение должно быть не пустым, если изображение установлено
                            const actualBg = window.getComputedStyle(cell).backgroundImage;
                            if (actualBg === 'none' || actualBg === '') {
                                appLogger(`Ошибка установки фона для ячейки ${index}`, 'error', {
                                    computedStyle: actualBg
                                });
                                
                                // Добавляем индикатор ошибки загрузки
                                const errorOverlay = document.createElement('div');
                                errorOverlay.className = 'photo-error-overlay';
                                errorOverlay.textContent = 'Ошибка загрузки';
                                cell.appendChild(errorOverlay);
                            }
                        }, 100);
                    } catch (e) {
                        appLogger(`Ошибка при установке фона для ячейки ${index}`, 'error', e);
                        cell.style.backgroundImage = '';
                        
                        // Добавляем индикатор ошибки
                        const errorOverlay = document.createElement('div');
                        errorOverlay.className = 'photo-error-overlay';
                        errorOverlay.textContent = 'Ошибка загрузки';
                        cell.appendChild(errorOverlay);
                    }
                } else {
                    appLogger(`Некорректный формат фото в ячейке ${index}`, 'warn', { photoType: typeof data.photo });
                    cell.style.backgroundImage = '';
                }
            } else {
                cell.style.backgroundImage = '';
            }
            
            // Создаем подпись с датой сохранения
            const caption = document.createElement('div');
            caption.className = 'history-cell-caption';
            
            // Форматируем дату
            try {
                const date = new Date(data.savedAt || data.timestamp || 0);
                const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`;
                caption.textContent = formattedDate;
            } catch (e) {
                appLogger(`Ошибка при форматировании даты для ячейки ${index}`, 'error', e);
                caption.textContent = 'Дата не определена';
            }
            
            contentDiv.appendChild(caption);
            
            // Добавляем обработчики событий для длительного нажатия
            cell.addEventListener('mousedown', startLongPress);
            cell.addEventListener('touchstart', startLongPress, { passive: true });
            
            cell.addEventListener('mouseup', endLongPress);
            cell.addEventListener('mouseleave', endLongPress);
            cell.addEventListener('touchend', endLongPress);
            cell.addEventListener('touchcancel', endLongPress);
            
            // Общая переменная для обработчика движения
            let moveHandler;
            
            // Функция для начала длительного нажатия
            function startLongPress(e) {
                // Если это уже режим удаления, не начинаем новый таймер
                if (isLongPress) return;
                
                // Запоминаем начальную позицию для определения скролла/свайпа
                const startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
                const startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
                
                // Определяем обработчик движения для отмены долгого нажатия при скролле/свайпе
                moveHandler = function(moveEvent) {
                    const currentX = moveEvent.type.includes('touch') ? moveEvent.touches[0].clientX : moveEvent.clientX;
                    const currentY = moveEvent.type.includes('touch') ? moveEvent.touches[0].clientY : moveEvent.clientY;
                    
                    // Если пользователь переместил палец/курсор более чем на 10px, отменяем долгое нажатие
                    if (Math.abs(currentX - startX) > 10 || Math.abs(currentY - startY) > 10) {
                        clearTimeout(pressTimer);
                        cell.removeEventListener('mousemove', moveHandler);
                        cell.removeEventListener('touchmove', moveHandler);
                    }
                };
                
                // Добавляем обработчики движения
                cell.addEventListener('mousemove', moveHandler);
                cell.addEventListener('touchmove', moveHandler, { passive: true });
                
                // Запускаем таймер через 500мс
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    appLogger('Активирован режим удаления для ячейки истории', 'info', { index });
                    
                    // Добавляем класс режима удаления
                    cell.classList.add('delete-mode');
                    
                    // Добавляем тактильную обратную связь на поддерживаемых устройствах
                    if (window.navigator && window.navigator.vibrate) {
                        window.navigator.vibrate(50); // 50 мс вибрации
                    }
                    
                    // Добавляем кнопку удаления
                    addDeleteButton();
                    
                    // Предотвращаем клик после длительного нажатия
                    e.preventDefault();
                }, 500);
            }
            
            // Функция для окончания длительного нажатия
            function endLongPress() {
                // Очищаем таймер
                clearTimeout(pressTimer);
                
                // Удаляем обработчики движения, если они были установлены
                if (moveHandler) {
                    cell.removeEventListener('mousemove', moveHandler);
                    cell.removeEventListener('touchmove', moveHandler);
                }
                
                // Если не было длительного нажатия, обрабатываем как обычный клик
                if (!isLongPress) {
                    cell.onclick = () => showSavedAnalysis(data);
                }
            }
            
            // Функция для добавления кнопки удаления
            function addDeleteButton() {
                // Создаем кнопку удаления
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-history-btn';
                deleteButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Удалить
                `;
                
                // Добавляем обработчик клика на кнопку удаления
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Предотвращаем всплытие события
                    
                    appLogger('Запрос на удаление элемента истории', 'info', { index });
                    
                    // Блокируем кнопку и меняем текст
                    deleteButton.disabled = true;
                    deleteButton.innerHTML = 'Удаление...';
                    deleteButton.style.opacity = '0.7';
                    
                    // Запрашиваем подтверждение удаления
                    if (confirm('Удалить этот элемент из истории?')) {
                        // Удаляем элемент из истории
                        deleteHistoryItem(index);
                        
                        // Сразу скрываем кнопку
                        deleteButton.style.opacity = '0';
                        setTimeout(() => {
                            if (deleteButton.parentNode) {
                                deleteButton.parentNode.removeChild(deleteButton);
                            }
                        }, 300);
                    } else {
                        // Если отменено, разблокируем кнопку
                        deleteButton.disabled = false;
                        deleteButton.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Удалить
                        `;
                        deleteButton.style.opacity = '1';
                    }
                });
                
                // Добавляем кнопку в ячейку
                cell.appendChild(deleteButton);
                
                // Добавляем обработчик для выхода из режима удаления при клике в другом месте
                document.addEventListener('click', documentClickHandler);
            }
            
            // Обработчик клика в документе для выхода из режима удаления
            function documentClickHandler(e) {
                // Если клик был не на ячейке или ее дочерних элементах
                if (!cell.contains(e.target)) {
                    resetCell();
                }
            }
            
            // Функция для сброса состояния ячейки
            function resetCell() {
                // Сбрасываем флаг режима удаления
                isLongPress = false;
                
                // Удаляем класс режима удаления
                cell.classList.remove('delete-mode');
                
                // Возвращаем исходный размер
                cell.style.transform = '';
                
                // Удаляем кнопку удаления, если она есть
                const deleteButton = cell.querySelector('.delete-history-btn');
                if (deleteButton) {
                    deleteButton.remove();
                }
                
                // Удаляем обработчик клика в документе
                document.removeEventListener('click', documentClickHandler);
                
                // Восстанавливаем обработчик клика для просмотра
                cell.onclick = () => showSavedAnalysis(data);
            }
            
            // Устанавливаем обработчик клика для просмотра сохраненной фотографии
            cell.onclick = () => showSavedAnalysis(data);
        } else {
            // Это пустая ячейка
            cell.style.backgroundImage = '';
            
            // Добавляем кнопку "+"
            const addButton = document.createElement('div');
            addButton.className = 'add-analysis';
            addButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"></path>
                </svg>
            `;
            contentDiv.appendChild(addButton);
            
            // Устанавливаем обработчик клика для создания нового анализа
            cell.onclick = () => cameraBtn.click();
        }
    });
}

/**
 * Показывает сохраненную фотографию в режиме предпросмотра
 * @param {Object} analysisData - Данные сохраненного анализа
 */
function showSavedAnalysis(analysisData) {
    try {
        appLogger('Показ сохраненной фотографии', 'info');
        
        // Проверяем наличие данных
        if (!analysisData || !analysisData.photo) {
            appLogger('Отсутствуют данные для показа', 'error', { analysisData });
            displayError('Не удалось загрузить данные фотографии');
            return;
        }
        
        // Проверяем, существует ли уже предпросмотр
        let photoPreview = document.getElementById('photo-preview-container');
        
        // Если предпросмотр уже открыт, закрываем его
        if (photoPreview) {
            closePhotoPreview();
            return;
        }
        
        // Проверяем, не обрезано ли фото (если содержит "...")
        let photoData = analysisData.photo;
        if (typeof photoData === 'string' && photoData.endsWith('...')) {
            appLogger('Обнаружено обрезанное фото, загружаем оригинал', 'info');
            // Попытка получить оригинальное фото через API (если реализовано)
            // Пока просто отображаем уменьшенную версию
        }
        
        // Создаем новый контейнер предпросмотра
        photoPreview = document.createElement('div');
        photoPreview.id = 'photo-preview-container';
        photoPreview.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            bottom: 20px;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 15px;
            opacity: 0;
            transform: scale(0.95);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
        
        // Создаем контейнер для содержимого (изображение и информация)
        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
        `;
        
        // Создаем изображение внутри контейнера
        const img = document.createElement('img');
        try {
            img.src = `data:image/jpeg;base64,${photoData}`;
        } catch (e) {
            appLogger('Ошибка при установке источника изображения', 'error', e);
            img.src = ''; // Пустой источник
        }
        
        img.style.cssText = `
            max-width: 100%;
            max-height: 80%;
            object-fit: contain;
            border-radius: 10px;
            margin-bottom: 10px;
        `;
        
        // Добавляем обработчик ошибки загрузки изображения
        img.onerror = function() {
            appLogger('Ошибка загрузки изображения', 'error');
            img.style.display = 'none'; // Скрываем изображение
            
            // Добавляем заместитель
            const errorPlaceholder = document.createElement('div');
            errorPlaceholder.textContent = 'Не удалось загрузить изображение';
            errorPlaceholder.style.cssText = `
                background-color: rgba(255, 0, 0, 0.2);
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 10px;
            `;
            contentContainer.insertBefore(errorPlaceholder, img.nextSibling);
        };
        
        // Добавляем информацию о классификации, если она есть
        let infoContainer = document.createElement('div');
        if (analysisData.classification) {
            try {
                // Получаем данные классификации или используем значения по умолчанию
                const classification = analysisData.classification || {};
                const classNameRu = classification.classNameRu || 'Неизвестный тип';
                const confidence = classification.confidence || '0';
                
                infoContainer.style.cssText = `
                    background-color: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 10px;
                    font-size: 16px;
                    text-align: center;
                    margin-bottom: 10px;
                    width: 90%;
                `;
                infoContainer.innerHTML = `<strong>Определено:</strong> ${classNameRu} (уверенность: ${confidence}%)`;
            } catch (e) {
                appLogger('Ошибка при отображении данных классификации', 'error', e);
                infoContainer.style.cssText = `height: 10px;`;
            }
        } else {
            infoContainer.style.cssText = `height: 10px;`;
        }
        
        // Добавляем дату фотографии
        const dateCaption = document.createElement('div');
        dateCaption.className = 'date-caption';
        
        // Форматируем дату
        try {
            const date = new Date(analysisData.savedAt || analysisData.timestamp || 0);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`;
            dateCaption.textContent = formattedDate;
        } catch (e) {
            appLogger('Ошибка при форматировании даты', 'error', e);
            dateCaption.textContent = 'Дата не определена';
        }
        
        // Обработчик закрытия при клике на изображение
        photoPreview.addEventListener('click', closePhotoPreview);
        
        // Собираем всё вместе
        contentContainer.appendChild(img);
        contentContainer.appendChild(infoContainer);
        contentContainer.appendChild(dateCaption);
        
        photoPreview.appendChild(contentContainer);
        document.body.appendChild(photoPreview);
        
        // Запускаем анимацию появления после добавления в DOM
        setTimeout(() => {
            photoPreview.style.opacity = '1';
            photoPreview.style.transform = 'scale(1)';
        }, 10);
    } catch (error) {
        appLogger('Ошибка при показе сохраненной фотографии', 'error', {
            message: error.message,
            stack: error.stack,
            data: analysisData
        });
        displayError('Ошибка при отображении фотографии');
    }
}

/**
 * Закрывает предпросмотр фотографии с анимацией
 */
function closePhotoPreview() {
    const photoPreview = document.getElementById('photo-preview-container');
    if (!photoPreview) return;
    
    appLogger('Закрытие предпросмотра фотографии', 'info');
    
    // Запускаем анимацию исчезновения
    photoPreview.style.opacity = '0';
    photoPreview.style.transform = 'scale(0.95)';
    
    // Удаляем элемент после завершения анимации
    setTimeout(() => {
        if (photoPreview.parentNode) {
            photoPreview.parentNode.removeChild(photoPreview);
        }
    }, 300); // Длительность анимации 300мс
}

// Добавляем проверку цвета фона при изменении видимости окна
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        appLogger('Приложение стало видимым', 'debug');
        // Когда пользователь возвращается к приложению, проверяем применение темы
        ensureBackgroundColor();
    }
});

// Выполняем инициализацию сразу, а не ждем событие DOMContentLoaded
(function initApp() {
    // Инициализируем систему логирования
    Logger.init();
    
    appLogger('Немедленная инициализация приложения', 'info', {
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
    });
    
    // Запрещаем скроллинг
    document.body.style.overflow = 'hidden';
    
    // Входим в полноэкранный режим если версия Telegram >= 6.9
    if (tg.isVersionAtLeast('6.9')) {
        appLogger('Запрос полноэкранного режима в Telegram', 'info');
        tg.requestFullscreen();
    }
    
    // Применяем цвет фона принудительно
    ensureBackgroundColor();
    
    // Загружаем профиль пользователя
    loadUserProfile();
    
    // Начинаем авторизацию
    checkAuth();
})();

/**
 * Удаляет элемент из истории по индексу
 * @param {number} index - Индекс элемента для удаления
 */
function deleteHistoryItem(index) {
    try {
        appLogger('Удаление элемента истории', 'info', { index });
        
        // Получаем текущую историю
        const history = getHistoryFromStorage();
        
        // Проверяем, что история - массив и индекс корректный
        if (!Array.isArray(history) || index < 0 || index >= history.length) {
            appLogger('Некорректный индекс или история не является массивом', 'error', { index, history });
            return false;
        }
        
        // Помечаем ячейку как пустую или заменяем на null
        history[index] = null;
        
        // Сохраняем обновленную историю
        saveHistoryToStorage(history);
        
        // Обновляем отображение
        updateHistoryCells(history);
        
        appLogger('Элемент истории успешно удален', 'success', { index });
        return true;
    } catch (error) {
        appLogger('Ошибка при удалении элемента истории', 'error', {
            message: error.message,
            stack: error.stack,
            index
        });
        return false;
    }
}