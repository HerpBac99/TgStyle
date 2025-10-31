# Гардероб (Wardrobe) - Ключевые функции

## Последовательность выполнения методов

### 1. Переключение на вкладку гардероба
- **Класс**: `UIManager` (uiManager.ts)
- **Метод**: `handleTabSwitch('wardrobe')`
- **Описание**: Скрывает все вкладки и показывает wardrobe-content

### 2. Открытие гардероба
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handleWardrobeOpen(prefix='wardrobe')`
- **Описание**: Инициализирует гардероб с указанным префиксом (основной или модальный)

### 3. Установка текущего грида
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.currentGridId = gridId`
- **Описание**: Сохраняет ID активного грида для всех последующих операций

### 4. Создание фильтров
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `createFilters(filtersId)`
- **Описание**: Создает кнопки фильтров по категориям одежды

### 5. Загрузка из кэша (мгновенно)
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `loadWardrobeFromCache()`
- **Описание**: Загружает вещи из памяти dataCacheManager

### 6. Получение вещей из кэша
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `loadWardrobe()`
- **Описание**: Возвращает вещи из кэша через DataLoader

### 7. Рендеринг грида с анимацией
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `renderGrid(withAnimation=true, gridId)`
- **Описание**: Отрисовывает грид с анимацией появления карточек

### 8. Фильтрация вещей
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `filterByCategory(items, currentFilter)`
- **Описание**: Фильтрует вещи по выбранной категории

### 9. Создание карточек вещей
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `createItemCard(item)`
- **Описание**: Создает DOM элемент карточки с изображением и обработчиками

### 10. Настройка обработчиков событий
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `setupEventListeners(addBtnId)`
- **Описание**: Подключает обработчики к кнопке добавления и превью


### 11. Загрузка в фоне
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `loadWardrobeInBackground(gridId)`
- **Описание**: Загружает полные данные с сервера в фоне

### 12. Загрузка с сервера
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `loadFromServer()`
- **Описание**: API запрос GET /api/wardrobe

### 13. API запрос гардероба
- **Класс**: `API` (api.ts)
- **Метод**: `getWardrobe()`
- **Описание**: Отправляет запрос на сервер с initData для аутентификации

### 14. Проверка изменений данных
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `loadWardrobeInBackground()` (проверка)
- **Описание**: Сравнивает количество вещей и перерисовывает только при изменениях

### 15. Обработка клика по фильтру
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `btn.addEventListener('click')`
- **Описание**: Обновляет currentFilter и перерисовывает грид

### 16. Обновление кнопок фильтров
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `updateFilterButtons()`
- **Описание**: Добавляет/убирает класс active у кнопок фильтров

### 17. Обработка клика по кнопке добавления
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handlePhotoUpload(onItemAdded?)`
- **Описание**: Открывает выбор фото из камеры/галереи

### 18. Создание input для выбора файла
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `document.createElement('input')`
- **Описание**: Создает input[type="file"] для выбора изображения

### 19. Показ loading индикатора
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showLoadingInModal(true)`
- **Описание**: Показывает спиннер "Обрабатываем фото..."

### 20. Обработка фото с удалением фона
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `processPhotoWithBackgroundRemoval(file)`
- **Описание**: Конвертирует файл в base64 и отправляет на обработку

### 21. Конвертация файла в base64
- **Класс**: `Utils` (utils.ts)
- **Метод**: `fileToBase64(file)`
- **Описание**: Читает файл и конвертирует в base64 строку

### 22. Классификация и удаление фона
- **Класс**: `PhotoProcessor` (PhotoProcessor.ts)
- **Метод**: `classifyAndRemoveBackground(imageBase64)`
- **Описание**: Отправляет изображение на FastVLM для классификации

### 23. Оптимизация для классификации
- **Класс**: `PhotoProcessor` (PhotoProcessor.ts)
- **Метод**: `optimizeForClassification(base64Image)`
- **Описание**: Уменьшает изображение до 800px для быстрой передачи

### 24. API запрос классификации
- **Класс**: `API` (api.ts)
- **Метод**: `classifyClothing(imageBase64)`
- **Описание**: POST /api/classify-clothing - отправка на FastVLM сервер

### 25. Получение результата классификации
- **Класс**: `PhotoProcessor` (PhotoProcessor.ts)
- **Метод**: `classifyAndRemoveBackground()` (возврат)
- **Описание**: Возвращает processedImage и classification данные

### 26. Сохранение данных для превью
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.currentPreviewImage = result.processedImage`
- **Описание**: Сохраняет обработанное изображение и классификацию

### 27. Скрытие loading индикатора
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showLoadingInModal(false)`
- **Описание**: Скрывает спиннер после обработки

### 28. Показ модального окна превью
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showPreviewModal(existingItem?)`
- **Описание**: Показывает модальное окно с изображением и данными классификации

### 29. Подготовка данных для модального окна
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showPreviewModal()` (подготовка modalData)
- **Описание**: Формирует объект ItemModalData с изображением и атрибутами

### 30. Показ универсального модального окна
- **Класс**: `UIModalManager` (uiModalManager.ts)
- **Метод**: `showItemModal(config)`
- **Описание**: Отображает модальное окно с редактируемыми полями

### 31. Обработка изменения данных в модальном окне
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `onDataChange(field, value)`
- **Описание**: Обновляет classification или existingItem при изменении полей

### 32. Подтверждение превью
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `confirmPreview()`
- **Описание**: Сохраняет вещь с оптимистичным обновлением UI

### 33. Получение финальных данных из модального окна
- **Класс**: `UIModalManager` (uiModalManager.ts)
- **Метод**: `getCurrentModalData()`
- **Описание**: Возвращает отредактированные пользователем данные

### 34. Скрытие модального окна
- **Класс**: `UIModalManager` (uiModalManager.ts)
- **Метод**: `hide()`
- **Описание**: Закрывает модальное окно превью

### 35. Создание оптимистичной вещи
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `confirmPreview()` (создание optimisticItem)
- **Описание**: Создает временную вещь с временным ID и base64 изображением

### 36. Добавление в начало массива
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.wardrobeItems.unshift(optimisticItem)`
- **Описание**: Добавляет оптимистичную вещь в начало локального массива

### 37. Добавление в кэш
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `addWardrobeItem(optimisticItem)`
- **Описание**: Сохраняет оптимистичную вещь в кэш

### 38. Мгновенная перерисовка грида
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `renderGrid(false, currentGridId)`
- **Описание**: Отрисовывает грид с новой вещью БЕЗ анимации

### 39. Оптимизация изображения для сервера
- **Класс**: `Utils` (utils.ts)
- **Метод**: `optimizeImageForUpload(imageData, 1200)`
- **Описание**: Уменьшает изображение до 1200px с сохранением прозрачности

### 40. Сохранение на сервер в фоне
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `addItem(imageBase64, classification)`
- **Описание**: POST /api/wardrobe - отправка вещи на сервер

### 41. API запрос создания вещи
- **Класс**: `API` (api.ts)
- **Метод**: `post('/wardrobe', data)`
- **Описание**: Отправляет изображение и атрибуты на сервер

### 42. Получение реальной вещи с сервера
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `addItem()` (возврат result.item)
- **Описание**: Возвращает вещь с реальным ID и URL изображения

### 43. Замена оптимистичной вещи на реальную
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.wardrobeItems[tempIndex] = serverItem`
- **Описание**: Заменяет временную вещь на реальную в локальном массиве

### 44. Замена в кэше
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `replaceOptimisticItem(tempId, serverItem)`
- **Описание**: Заменяет временную вещь на реальную в кэше

### 45. Обновление ID в DOM
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `updateItemIdInDOM(tempId, realId, imageUrl)`
- **Описание**: Обновляет data-item-id и src изображения без перерисовки

### 46. Отправка события сохранения
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `window.dispatchEvent('wardrobe:item-saved')`
- **Описание**: Уведомляет другие модули о сохранении вещи

### 47. Вызов callback добавления
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.onItemAddedCallback(serverItem)`
- **Описание**: Вызывает callback если был передан (для модальных окон)

### 48. Отправка события добавления
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `window.dispatchEvent('wardrobe:item-added')`
- **Описание**: Уведомляет другие модули о добавлении вещи

### 49. Обработка ошибки сохранения
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `confirmPreview()` (catch блок)
- **Описание**: Удаляет оптимистичную вещь и перерисовывает грид при ошибке

### 50. Обработка клика по карточке (короткое нажатие)
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `card.addEventListener('touchend')`
- **Описание**: Обрабатывает короткое нажатие (менее 500ms) на карточку

### 51. Проверка движения пальца
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `endPress()` (проверка distance)
- **Описание**: Вычисляет расстояние движения и отменяет тап если был скролл

### 52. Определение режима работы
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `endPress()` (проверка isModalGrid)
- **Описание**: Проверяет currentGridId для определения режима (выделение или превью)

### 53. Переключение выделения (в модальном окне)
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `toggleItemSelection(item)`
- **Описание**: Отправляет событие 'wardrobe:item-selection-toggle' для CapsulesManager

### 54. Показ превью существующей вещи (в основном гардеробе)
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showPreviewModal(existingItem)`
- **Описание**: Показывает модальное окно с данными существующей вещи

### 55. Сохранение оригинальных данных
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.originalItemData = {...}`
- **Описание**: Сохраняет оригинальные данные для сравнения изменений

### 56. Обработка долгого нажатия (600ms)
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `card.addEventListener('touchstart')` (setTimeout)
- **Описание**: Запускает таймер долгого нажатия для удаления

### 57. Тактильная обратная связь
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `Telegram.WebApp.HapticFeedback.notificationOccurred('warning')`
- **Описание**: Вибрация при долгом нажатии

### 58. Показ подтверждения удаления
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `confirm('Удалить этот предмет из гардероба?')`
- **Описание**: Показывает нативное подтверждение удаления

### 59. Удаление вещи
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `removeItem(itemId)`
- **Описание**: Удаляет вещь с сервера и из локального массива

### 60. API запрос удаления
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `deleteItem(itemId)`
- **Описание**: DELETE /api/wardrobe/:id - удаление на сервере

### 61. Удаление из кэша
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `removeWardrobeItem(itemId)`
- **Описание**: Удаляет вещь из кэша

### 62. Удаление из локального массива
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.wardrobeItems.splice(index, 1)`
- **Описание**: Удаляет вещь из локального массива

### 63. Перерисовка после удаления
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `renderGrid(false, currentGridId)`
- **Описание**: Перерисовывает грид без удаленной вещи

### 64. Обработка touchmove для отмены долгого нажатия
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `card.addEventListener('touchmove')`
- **Описание**: Отменяет долгое нажатие если палец сдвинулся

### 65. Проверка выхода за границы карточки
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handleMove()` (проверка cardRect)
- **Описание**: Отменяет долгое нажатие если палец вышел за границы

### 66. Обновление существующей вещи
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `updateExistingItem(item)`
- **Описание**: Обновляет вещь с проверкой изменений

### 67. Проверка изменений полей
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `updateExistingItem()` (сравнение с originalItemData)
- **Описание**: Сравнивает каждое поле с оригинальными данными

### 68. Оптимистичное обновление в массиве
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.wardrobeItems[index] = {...item, ...updates}`
- **Описание**: Обновляет вещь в локальном массиве мгновенно

### 69. Мгновенная перерисовка с изменениями
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `renderGrid(false, currentGridId)`
- **Описание**: Перерисовывает грид с обновленными данными

### 70. Синхронизация с сервером в фоне
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `updateItem(itemId, updates)`
- **Описание**: PUT /api/wardrobe/:id - отправка изменений на сервер

### 71. Оптимистичное обновление кэша
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `updateWardrobeItemFields(itemId, updates)`
- **Описание**: Обновляет поля вещи в кэше

### 72. API запрос обновления
- **Класс**: `API` (api.ts)
- **Метод**: `updateWardrobeItem(itemId, updates)`
- **Описание**: Отправляет только измененные поля на сервер

### 73. Отмена превью
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `cancelPreview()`
- **Описание**: Очищает currentPreviewImage и currentClassification

### 74. Обработка запроса рендеринга через событие
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handleRenderRequest(detail)`
- **Описание**: Обрабатывает событие 'wardrobe:render-requested' для модальных окон

### 75. Установка грида для модального окна
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.currentGridId = detail.gridId`
- **Описание**: Устанавливает активный грид для модального окна

### 76. Обновление локальных данных
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.wardrobeItems = detail.items`
- **Описание**: Обновляет локальный массив вещей для рендеринга

### 77. Отправка события завершения рендеринга
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `window.dispatchEvent('wardrobe:grid-rendered')`
- **Описание**: Уведомляет CapsulesManager о завершении рендеринга

### 78. Получение статуса менеджера
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `getStatus()`
- **Описание**: Возвращает initialized, itemsCount, currentFilter, hasPreviewImage

### 79. Очистка ресурсов
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `destroy()`
- **Описание**: Удаляет все обработчики событий

### 80. Удаление обработчиков
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `this.cleanupFunctions.forEach(cleanup => cleanup())`
- **Описание**: Вызывает все функции очистки

## Важные особенности

### Оптимизация производительности
- **Трехуровневое кэширование**: Память (dataCacheManager) → localStorage → Браузерный кэш
- **Мгновенная загрузка**: Первая отрисовка из памяти, затем фоновая синхронизация с сервером
- **Оптимистичное создание**: UI обновляется мгновенно, синхронизация с сервером в фоне
- **Оптимистичное обновление**: Изменения применяются мгновенно, отправка на сервер в фоне
- **Умная перерисовка**: Грид перерисовывается только при реальных изменениях данных
- **Оптимизация изображений**: 800px для классификации, 1200px для хранения

### Оптимистичное создание вещей
- **Временный ID**: Используется Date.now() для временной идентификации
- **Base64 изображение**: Отображается сразу, заменяется на URL после сохранения
- **Мгновенный UI**: Вещь появляется в гриде до ответа сервера
- **Замена данных**: Временная вещь заменяется на реальную без перерисовки
- **Откат при ошибке**: Временная вещь удаляется если сервер вернул ошибку

### Обработка касаний
- **Короткое нажатие (< 500ms)**: Превью в основном гардеробе, выделение в модальном окне
- **Долгое нажатие (600ms)**: Удаление вещи с подтверждением
- **Определение скролла**: Threshold 10px для отмены тапа при скролле
- **Выход за границы**: Отмена долгого нажатия если палец вышел за карточку
- **Защита от дублирования**: Флаг isProcessing предотвращает параллельные операции

### Универсальность
- **Два режима работы**: Основной гардероб (превью) и модальное окно (выделение)
- **Префиксная система**: Все ID элементов формируются с префиксом (wardrobe, capsules-modal)
- **Событийная система**: Связь с другими модулями через CustomEvent
- **Callback поддержка**: onItemAdded callback для уведомления о добавлении

### Интеграция с FastVLM
- **Классификация одежды**: Автоматическое определение категории, цвета, материала
- **Удаление фона**: Автоматическая обработка изображения
- **Оптимизация запросов**: Уменьшение изображения до 800px для классификации
- **Fallback**: Показ оригинального фото при ошибке классификации

### Редактирование данных
- **Универсальное модальное окно**: UIModalManager для новых и существующих вещей
- **Редактируемые поля**: Категория, подтип, цвет, материал, стиль
- **Проверка изменений**: Сравнение с originalItemData перед отправкой на сервер
- **Оптимистичное обновление**: UI обновляется мгновенно, синхронизация в фоне

### Фильтрация
- **9 категорий**: ALL, OUTERWEAR, INNERWEAR, BODYWEAR, FULLBODY, LEGWEAR, FOOTWEAR, HEADWEAR, ACCESSORIES
- **Мгновенная фильтрация**: Перерисовка без анимации при смене фильтра
- **Сохранение состояния**: currentFilter сохраняется между переключениями

### Обработка ошибок
- **Graceful degradation**: Fallback на оригинальное фото при ошибке классификации
- **Откат оптимистичных операций**: Удаление временных вещей при ошибке сохранения
- **Понятные сообщения**: Alert с описанием ошибки для пользователя
- **Логирование**: Подробное логирование всех операций для отладки

### Анимации
- **Анимация появления**: Каскадная анимация карточек при первом открытии (0.4s + задержка)
- **Без анимации**: При фильтрации, обновлении, удалении для быстрого отклика
- **Тактильная обратная связь**: Вибрация при долгом нажатии через Telegram WebApp API

### Кэширование
- **DataCacheManager**: Центральное хранилище данных в памяти
- **Синхронизация**: Автоматическое обновление кэша при всех операциях
- **Замена оптимистичных вещей**: replaceOptimisticItem для замены временных данных
- **Обновление полей**: updateWardrobeItemFields для частичного обновления
