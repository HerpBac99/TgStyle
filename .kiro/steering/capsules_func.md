# Капсулы (Capsules) - Ключевые функции

## Последовательность выполнения методов

### FLOW СОЗДАНИЯ НОВОЙ КАПСУЛЫ

### 1. Переключение на вкладку капсул
- **Класс**: `UIManager` (uiManager.ts)
- **Метод**: `handleTabSwitch('capsules')`
- **Описание**: Скрывает все вкладки и показывает capsules-content

### 2. Открытие грида капсул
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleCapsulesOpen()`
- **Описание**: Инициализирует грид капсул и загружает данные

### 3. Инвалидация старого кэша
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `invalidateOldCache(60 * 60 * 1000)`
- **Описание**: Удаляет кэш состояний canvas старше 1 часа

### 4. Загрузка капсул
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `loadCapsules()`
- **Описание**: Загружает капсулы через DataLoader с кэш-fallback

### 5. Загрузка с кэш-fallback
- **Класс**: `DataLoader` (DataLoader.ts)
- **Метод**: `loadWithCacheFallback()`
- **Описание**: Сначала пытается загрузить из кэша, затем с сервера

### 6. Показ грида капсул
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `show()`
- **Описание**: Отображает контейнер грида капсул

### 7. Рендеринг грида
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `render(capsules)`
- **Описание**: Создает карточки капсул с кнопкой добавления

### 8. Обработка клика "Добавить капсулу"
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleAddCapsuleClick()`
- **Описание**: Скрывает грид и запускает flow создания

### 9. Запуск flow создания новой капсулы
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `startNewCapsule()`
- **Описание**: ДЕЛЕГИРУЕТ управление flow, устанавливает режим 'create'

### 10. Сброс состояния flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `resetState()`
- **Описание**: Очищает все данные предыдущего flow


### 11. Переход на этап выбора вещей
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToSelection()`
- **Описание**: Устанавливает currentStep='selection' и вызывает callback

### 12. Настройка навигации для selection
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setupNavigationForSelection()`
- **Описание**: Настраивает BackButton через navigationManager

### 13. Показ модального окна выбора вещей
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showSelectionModal()`
- **Описание**: Вызывается через callback из CapsuleFlowManager

### 14. Получение предвыбранных элементов
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `getSelectedItems()`
- **Описание**: Возвращает уже выбранные вещи (для возврата с canvas)

### 15. Единый метод выбора вещей
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showItemSelection(preselectedIds, 'new-capsule')`
- **Описание**: ДЕЛЕГИРУЕТ выбор в CapsuleSelectionManager

### 16. Показ модального окна выбора
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `show(preselectedIds)`
- **Описание**: Возвращает Promise с выбранными вещами

### 17. Загрузка гардероба для выбора
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `loadWardrobe()`
- **Описание**: Загружает вещи через DataLoader

### 18. Отправка события рендеринга грида
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `window.dispatchEvent('wardrobe:render-requested')`
- **Описание**: Запрашивает рендеринг грида у WardrobeManager

### 19. Рендеринг грида гардероба в модальном окне
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handleRenderRequest(detail)`
- **Описание**: Обрабатывает событие и рендерит грид в режиме 'selection'

### 20. Применение предвыбора
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `setSelectedItems(items)`
- **Описание**: Отмечает предвыбранные карточки классом 'selected'

### 21. Настройка обработчиков событий
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `setupEventHandlers(resolve)`
- **Описание**: Подключает обработчики кнопок и событий выделения

### 22. Обработка клика по карточке вещи
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `toggleItemSelection(item)`
- **Описание**: Отправляет событие 'wardrobe:item-selection-toggle'

### 23. Переключение выбора вещи
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `onItemToggle(item)`
- **Описание**: Добавляет/убирает вещь из selectedItems и обновляет UI

### 24. Обновление состояния кнопки "Далее"
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `updateNextButtonState()`
- **Описание**: Активирует кнопку если есть выбранные вещи

### 25. Обработка клика "Добавить вещь"
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `onAddItem()` callback
- **Описание**: Вызывает handleSelectionAddItem в CapsulesManager

### 26. Загрузка фото для новой вещи
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleWardrobePhotoUpload()`
- **Описание**: Отправляет событие 'wardrobe:photo-upload-requested'

### 27. Обработка загрузки фото
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handlePhotoUpload()`
- **Описание**: Открывает выбор файла и обрабатывает фото

### 28. Классификация и удаление фона
- **Класс**: `PhotoProcessor` (PhotoProcessor.ts)
- **Метод**: `classifyAndRemoveBackground(imageBase64)`
- **Описание**: Отправляет на FastVLM для классификации

### 29. Показ превью новой вещи
- **Класс**: `UIModalManager` (uiModalManager.ts)
- **Метод**: `showItemModal(config)`
- **Описание**: Показывает модальное окно с превью и данными

### 30. Сохранение новой вещи
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `addItem(imageBase64, classification)`
- **Описание**: POST /api/wardrobe - сохранение на сервере

### 31. Отправка события сохранения
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `window.dispatchEvent('wardrobe:item-saved')`
- **Описание**: Уведомляет другие модули о новой вещи

### 32. Восстановление визуального выделения
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `restoreVisualSelection()`
- **Описание**: Восстанавливает класс 'selected' после перерендера

### 33. Подтверждение выбора вещей
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `onConfirm()`
- **Описание**: Вызывает callback и возвращает selectedItems через resolve

### 34. Скрытие модального окна выбора
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `hide()`
- **Описание**: Скрывает модальное окно и очищает обработчики

### 35. Сохранение выбранных вещей в flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setSelectedItems(selectedItems)`
- **Описание**: Сохраняет выбранные вещи в состоянии flow

### 36. Переход на canvas
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToCanvas()`
- **Описание**: Устанавливает currentStep='canvas' и вызывает callback

### 37. Настройка навигации для canvas
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setupNavigationForCanvas()`
- **Описание**: Настраивает BackButton для возврата на selection

### 38. Показ canvas редактора
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showCanvas()`
- **Описание**: Вызывается через callback из CapsuleFlowManager

### 39. Инициализация canvas editor
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `initializeCanvasEditor()`
- **Описание**: Получает Singleton экземпляр UICanvasEditor

### 40. Получение Singleton canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `getInstance(config)`
- **Описание**: SINGLETON: Возвращает единственный экземпляр canvas


### 41. Проверка кэша состояния canvas
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `getCachedState(cacheKey)`
- **Описание**: ОПТИМИЗАЦИЯ: Проверяет наличие сохраненного состояния

### 42. Восстановление из кэша или загрузка вещей
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `itemsMatch(cachedIds, currentIds)`
- **Описание**: Сравнивает ID для решения о восстановлении из кэша

### 43. Загрузка вещей на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `loadItems(items)`
- **Описание**: Загружает вещи на canvas с сортировкой по слоям

### 44. Сортировка по слоям одежды
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `sortItemsByLayer(selectedItems)`
- **Описание**: Сортирует от нижнего слоя к верхнему (LEGWEAR → ACCESSORIES)

### 45. Инициализация Fabric.js canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `initializeCanvas()`
- **Описание**: Создает Fabric.js canvas с обработчиками событий

### 46. Добавление изображений на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `addImageToCanvas(item)`
- **Описание**: Создает fabric.Image объекты для каждой вещи

### 47. Сохранение состояния в кэш
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `saveState(canvasEditor, cacheKey)`
- **Описание**: Сохраняет canvasData, thumbnailImage, itemIds в кэш

### 48. Показ canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `show()`
- **Описание**: Отображает контейнер canvas редактора

### 49. Обработка изменений на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `canvas.on('object:modified')`
- **Описание**: Отправляет событие 'canvas:modified' при изменениях

### 50. Пометка состояния как dirty
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleCanvasModified()`
- **Описание**: ОПТИМИЗАЦИЯ: Помечает кэш как измененный

### 51. Обработка клика "Добавить одежду" на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `onAddItem()` callback
- **Описание**: Вызывает handleCanvasAddItem в CapsulesManager

### 52. Получение текущих вещей на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `getItemIds()`
- **Описание**: Возвращает массив ID вещей на canvas

### 53. Скрытие canvas для выбора
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `hide()`
- **Описание**: Скрывает canvas перед показом модального окна

### 54. Повторный показ выбора с предвыбором
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showItemSelection(currentItemIds, 'canvas-add')`
- **Описание**: ИСПОЛЬЗУЕТ ЕДИНЫЙ МЕТОД с контекстом 'canvas-add'

### 55. Инкрементальное добавление новых вещей
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `addItems(canvasItems)`
- **Описание**: ОПТИМИЗАЦИЯ: Добавляет только новые вещи без перезагрузки

### 56. Инкрементальное удаление вещей
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `removeItems(itemIds)`
- **Описание**: ОПТИМИЗАЦИЯ: Удаляет только снятые с выбора вещи

### 57. Обработка удаления вещи с canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `onItemDeleted(itemId)` callback
- **Описание**: Вызывает handleCanvasItemDeleted в CapsulesManager

### 58. Синхронизация состояния flowManager
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleCanvasItemDeleted(itemId)`
- **Описание**: Обновляет selectedItems в flowManager после удаления

### 59. Обработка клика "Далее" на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `onNext()` callback
- **Описание**: Вызывает handleCanvasNext в CapsulesManager

### 60. Показ loading индикатора
- **Класс**: `ModalService` (ModalService.ts)
- **Метод**: `executeWithLoading(asyncFn, options, context)`
- **Описание**: ДЕЛЕГИРУЕТ показ loading с сообщением "Обрабатываем образ..."

### 61. Проверка кэша и флага dirty
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `isDirty(cacheKey)`
- **Описание**: ОПТИМИЗАЦИЯ: Проверяет нужна ли повторная обработка

### 62. Сохранение состояния с автообрезкой
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `saveState(canvasEditor, cacheKey)`
- **Описание**: Получает состояние через getState(false) с автообрезкой

### 63. Получение состояния canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `getState(includeWatermark=false)`
- **Описание**: Возвращает canvasData и thumbnailImage с обрезкой по содержимому

### 64. Автоматическая обрезка по содержимому
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `cropToContent()`
- **Описание**: Обрезает canvas по границам объектов на клиенте

### 65. Экспорт в base64
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `canvas.toDataURL()`
- **Описание**: Конвертирует canvas в PNG base64

### 66. Проверка кэша watermark
- **Класс**: `ImageProcessingService` (ImageProcessingService.ts)
- **Метод**: `getCachedImage(watermarkCacheKey)`
- **Описание**: ОПТИМИЗАЦИЯ: Проверяет кэш обработанного изображения

### 67. Добавление watermark
- **Класс**: `ImageProcessingService` (ImageProcessingService.ts)
- **Метод**: `addWatermark(thumbnailImage)`
- **Описание**: ДЕЛЕГИРУЕТ добавление watermark в ImageProcessingService

### 68. Кэширование watermark изображения
- **Класс**: `ImageProcessingService` (ImageProcessingService.ts)
- **Метод**: `cacheImage(watermarkCacheKey, imageWithWatermark)`
- **Описание**: Сохраняет обработанное изображение в кэш

### 69. Сохранение в flowManager
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setCanvasState(state)` и `setResultImage(imageWithWatermark)`
- **Описание**: Сохраняет состояние и результат в flow

### 70. Сохранение капсулы при нажатии "Далее"
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `saveCapsuleFromCanvas(state)`
- **Описание**: НОВАЯ ЛОГИКА: Сохраняет капсулу сразу, не дожидаясь "Готово"


### 71. Создание новой капсулы на сервере
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `createCapsule(data)`
- **Описание**: POST /api/capsules - создание с canvasData, thumbnailImage, itemIds

### 72. Установка capsuleId в flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setCapsuleId(created.id)`
- **Описание**: ВАЖНО: Устанавливает ID для кнопки like на результате

### 73. Добавление в кэш
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `addCapsule(created)`
- **Описание**: Сохраняет новую капсулу в кэш

### 74. Скрытие loading индикатора
- **Класс**: `ModalService` (ModalService.ts)
- **Метод**: `hideLoading()`
- **Описание**: Скрывает индикатор после обработки

### 75. Скрытие canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `hide()`
- **Описание**: Скрывает canvas перед показом результата

### 76. Переход на результат
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToResult()`
- **Описание**: Устанавливает currentStep='result' и вызывает callback

### 77. Настройка навигации для результата
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setupNavigationForResult()`
- **Описание**: НОВАЯ ЛОГИКА: BackButton закрывает результат (не возвращает на canvas)

### 78. Показ экрана результата
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showResultScreen()`
- **Описание**: Вызывается через callback из CapsuleFlowManager

### 79. Инициализация экрана результата
- **Класс**: `UICanvasResultScreen` (uiCanvasResultScreen.ts)
- **Метод**: `new UICanvasResultScreen(config)`
- **Описание**: Создает экран с callbacks для save, share, done, close

### 80. Получение информации о пользователе
- **Класс**: `AuthManager` (auth.ts)
- **Метод**: `getCurrentUser()`
- **Описание**: Получает данные текущего пользователя (автора капсулы)

### 81. Показ результата с кнопками
- **Класс**: `UICanvasResultScreen` (uiCanvasResultScreen.ts)
- **Метод**: `show(imageBase64, capsuleId, showButtons=true, showEditButton=false, author)`
- **Описание**: Отображает изображение с watermark, кнопками like, share и автором

### 82. Создание компонента лайков
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `createLikeComponent(stats, capsuleId, {isLiked, likesCount}, 'result')`
- **Описание**: Создает кнопку лайка для экрана результата

### 83. Создание кнопки share
- **Класс**: `CapsulesSharing` (CapsulesSharing.ts)
- **Метод**: `createShareButton()`
- **Описание**: Создает кнопку поделиться для экрана результата

### 84. Обработка клика по лайку
- **Класс**: `CapsuleLikesService` (CapsuleLikesService.ts)
- **Метод**: `toggleLike(capsuleId, isLiked)`
- **Описание**: Переключает лайк с оптимистичным обновлением UI

### 85. API запрос лайка
- **Класс**: `API` (api.ts)
- **Метод**: `post('/capsule-likes/:id')` или `delete('/capsule-likes/:id')`
- **Описание**: Отправляет запрос с initData для аутентификации

### 86. Обработка клика "Поделиться"
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleResultShare()`
- **Описание**: Вызывает CapsulesSharing для шеринга

### 87. Шеринг капсулы
- **Класс**: `CapsulesSharing` (CapsulesSharing.ts)
- **Метод**: `shareCapsule(canvasEditor, capsuleName, capsuleId, resultImage)`
- **Описание**: Делится через Web Share API или Telegram

### 88. Обработка клика "Закрыть"
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleResultClose()`
- **Описание**: Завершает flow (капсула уже сохранена)

### 89. Завершение flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `complete()`
- **Описание**: Очищает навигацию и вызывает callback onComplete

### 90. Обработка завершения flow
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleFlowComplete()`
- **Описание**: Очищает кэш, canvas и возвращается к гриду

### 91. Очистка кэша временной капсулы
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `clearCacheForKey('temp-canvas')`
- **Описание**: Удаляет временный кэш после успешного сохранения

### 92. Очистка canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `clear()`
- **Описание**: Удаляет все объекты с canvas

### 93. Скрытие экрана результата
- **Класс**: `UICanvasResultScreen` (uiCanvasResultScreen.ts)
- **Метод**: `hide()`
- **Описание**: Скрывает экран результата

### 94. Показ грида капсул
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `show()` и `render(capsules)`
- **Описание**: Возвращается к гриду с обновленным списком капсул



### FLOW РЕДАКТИРОВАНИЯ СУЩЕСТВУЮЩЕЙ КАПСУЛЫ

### 95. Обработка клика по карточке капсулы
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `onView(capsuleId)` callback
- **Описание**: Вызывает handleViewCapsule в CapsulesManager

### 96. Просмотр капсулы
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleViewCapsule(capsuleId)`
- **Описание**: Скрывает грид и показывает результат с кнопкой редактирования

### 97. Получение капсулы из кэша
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `getCapsules()`
- **Описание**: Ищет капсулу в кэше для быстрого отображения

### 98. Загрузка данных капсулы с сервера
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `loadCapsule(capsuleId)`
- **Описание**: GET /api/capsules/:id - загрузка полных данных если нет в кэше

### 99. Показ результата капсулы
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showCapsuleResult(capsuleId, thumbnailUrl, author)`
- **Описание**: Показывает экран с кнопкой редактирования

### 100. Пересоздание экрана результата
- **Класс**: `UICanvasResultScreen` (uiCanvasResultScreen.ts)
- **Метод**: `destroy()` и `new UICanvasResultScreen()`
- **Описание**: ИСПРАВЛЕНО: Всегда пересоздает с правильным capsuleId

### 101. Показ с кнопкой редактирования
- **Класс**: `UICanvasResultScreen` (uiCanvasResultScreen.ts)
- **Метод**: `show(thumbnailUrl, capsuleId, showButtons=true, showEditButton=true, author)`
- **Описание**: Отображает с кнопками like, share, edit и автором

### 102. Настройка BackButton для возврата
- **Класс**: `NavigationManager` (navigationManager.ts)
- **Метод**: `push(handler, description)`
- **Описание**: Настраивает возврат на грид с очисткой canvas

### 103. Обработка клика "Редактировать"
- **Класс**: `UICanvasResultScreen` (uiCanvasResultScreen.ts)
- **Метод**: `onEdit()` callback
- **Описание**: Вызывает handleEditCapsuleWithCleanup в CapsulesManager

### 104. Редактирование с принудительной очисткой
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleEditCapsuleWithCleanup(capsuleId)`
- **Описание**: НОВЫЙ МЕТОД: Гарантирует очистку canvas перед загрузкой

### 105. Принудительная очистка canvas
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `cleanupCanvas()`
- **Описание**: Уничтожает canvas и очищает кэш состояний

### 106. Уничтожение canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `destroy()`
- **Описание**: Удаляет Fabric.js canvas и обработчики событий

### 107. Очистка кэша состояний
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `clearCache()`
- **Описание**: Удаляет все сохраненные состояния canvas

### 108. Запуск flow редактирования
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleEditCapsule(capsuleId)`
- **Описание**: Вызывается после очистки canvas

### 109. Начало редактирования в flowManager
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `editCapsule(capsuleId)`
- **Описание**: ДЕЛЕГИРУЕТ управление flow, устанавливает режим 'edit'

### 110. Установка состояния редактирования
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `resetState()` с mode='edit', currentStep='canvas'
- **Описание**: Пропускает selection, сразу переходит на canvas

### 111. Генерация ключа кэша
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `cacheKey = 'capsule-${capsuleId}'`
- **Описание**: Создает уникальный ключ для кэширования состояния

### 112. Проверка кэша перед загрузкой
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `getCachedState(cacheKey)`
- **Описание**: ОПТИМИЗАЦИЯ: Проверяет кэш перед запросом к серверу

### 113. Загрузка данных капсулы с сервера
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `loadCapsule(capsuleId)`
- **Описание**: GET /api/capsules/:id - получение canvasData и itemIds

### 114. Создание состояния для кэширования
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `cachedState = { canvasData, thumbnailImage, itemIds, timestamp, isDirty }`
- **Описание**: Формирует объект CanvasState из данных сервера

### 115. Инициализация canvas editor
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `initializeCanvasEditor()`
- **Описание**: Получает Singleton экземпляр UICanvasEditor

### 116. Восстановление состояния canvas
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `restoreState(canvasEditor, cachedState)`
- **Описание**: Восстанавливает canvasData через canvas editor

### 117. Восстановление через canvas editor
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `restoreState(canvasData)`
- **Описание**: Загружает JSON в Fabric.js canvas

### 118. Загрузка JSON в Fabric.js
- **Класс**: `fabric.Canvas` (Fabric.js)
- **Метод**: `loadFromJSON(canvasData, callback)`
- **Описание**: Восстанавливает все объекты на canvas

### 119. Сохранение в кэш
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `saveState(canvasEditor, cacheKey)`
- **Описание**: Сохраняет состояние для будущего использования

### 120. Показ canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `show()`
- **Описание**: Отображает canvas с загруженной капсулой

### 121. Редактирование на canvas
- **Описание**: Пользователь перемещает, масштабирует, удаляет вещи
- **События**: 'object:modified', 'object:removed', 'canvas:modified'

### 122. Обработка клика "Далее"
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `onNext()` callback
- **Описание**: Вызывает handleCanvasNext в CapsulesManager (аналогично созданию)

### 123. Обновление существующей капсулы
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `updateCapsule(capsuleId, { canvasData, thumbnailImage })`
- **Описание**: PUT /api/capsules/:id - ВАЖНО: НЕ отправляем itemIds при обновлении

### 124. Обновление в кэше
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `updateCapsule(capsuleId, updated)`
- **Описание**: Обновляет капсулу в кэше

### 125. Обновление в массиве
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `this.capsules[index] = updated`
- **Описание**: Обновляет капсулу в локальном массиве

### 126. Переход на результат
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToResult()`
- **Описание**: Показывает экран результата (аналогично созданию)

### 127. Завершение flow редактирования
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `complete()`
- **Описание**: Возвращается к гриду с обновленной капсулой



### FLOW ВОЗВРАТА НАЗАД (NAVIGATION)

### 128. Обработка нажатия BackButton
- **Класс**: `NavigationManager` (navigationManager.ts)
- **Метод**: `handleBackButton()`
- **Описание**: Вызывает последний обработчик из стека

### 129. Возврат с результата
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `complete()` (из setupNavigationForResult)
- **Описание**: НОВАЯ ЛОГИКА: Закрывает результат и возвращается к гриду

### 130. Возврат с canvas
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `goBack()`
- **Описание**: Вызывает onGoBack callback для сохранения состояния

### 131. Сохранение состояния перед возвратом
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleGoBack()`
- **Описание**: Сохраняет состояние canvas в stateManager

### 132. Сохранение в временный кэш
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `saveState(canvasEditor, 'temp-canvas')`
- **Описание**: Сохраняет для возможности продолжения

### 133. Определение предыдущего этапа
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `goBack()` (switch по currentStep)
- **Описание**: Canvas → Selection (create) или Grid (edit)

### 134. Возврат на selection
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToSelection()`
- **Описание**: Только для режима 'create'

### 135. Восстановление выбора с предвыбором
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showSelectionModal()` с getSelectedItems()
- **Описание**: Показывает модальное окно с уже выбранными вещами

### 136. Возврат с selection
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `cancel()`
- **Описание**: Отменяет flow и возвращается к гриду

### 137. Обработка отмены flow
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleFlowCancel()`
- **Описание**: Очищает кэш, canvas и показывает грид

### 138. Очистка временного кэша
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `clearCacheForKey('temp-canvas')`
- **Описание**: Удаляет временный кэш при отмене

### 139. Очистка canvas при отмене
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `clear()`
- **Описание**: Удаляет все объекты с canvas

### 140. Скрытие всех UI компонентов
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `resultScreen.hide()`, `selectionManager.hide()`
- **Описание**: Скрывает все модальные окна и экраны

### 141. Очистка навигации
- **Класс**: `NavigationManager` (navigationManager.ts)
- **Метод**: `clear()`
- **Описание**: Удаляет все обработчики из стека

### 142. Показ грида
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `show()`
- **Описание**: Возвращается к гриду капсул



### FLOW УДАЛЕНИЯ КАПСУЛЫ

### 143. Обработка долгого нажатия на карточку
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `card.addEventListener('touchstart')` (setTimeout 600ms)
- **Описание**: Запускает таймер долгого нажатия

### 144. Тактильная обратная связь
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `Telegram.WebApp.HapticFeedback.notificationOccurred('warning')`
- **Описание**: Вибрация при долгом нажатии

### 145. Показ подтверждения удаления
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `confirm('Удалить эту капсулу?')`
- **Описание**: Показывает нативное подтверждение

### 146. Обработка удаления
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `onDelete(capsuleId)` callback
- **Описание**: Вызывает handleDeleteCapsule в CapsulesManager

### 147. Удаление капсулы
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `deleteCapsule(capsuleId)`
- **Описание**: DELETE /api/capsules/:id - удаление на сервере

### 148. Удаление из кэша
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `removeCapsule(capsuleId)`
- **Описание**: Удаляет капсулу из кэша

### 149. Удаление из массива
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `this.capsules.splice(index, 1)`
- **Описание**: Удаляет капсулу из локального массива

### 150. Перерисовка грида
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `render(capsules)`
- **Описание**: Перерисовывает грид без удаленной капсулы



## Важные особенности

### Архитектура с Dependency Injection
- **Делегирование задач**: CapsulesManager делегирует задачи специализированным модулям
- **CapsuleFlowManager**: Управление переходами между этапами (selection → canvas → result)
- **CapsuleSelectionManager**: Выбор вещей из гардероба с предвыбором
- **CanvasStateManager**: Сохранение, восстановление и кэширование состояния canvas
- **ImageProcessingService**: Обработка изображений (watermark, оптимизация)
- **ModalService**: Показ loading индикаторов и модальных окон

### Singleton паттерн
- **UICanvasEditor**: Единственный экземпляр canvas редактора
- **Предотвращение конфликтов**: Гарантирует что всегда работаем с одним canvas
- **Принудительная очистка**: cleanupCanvas() перед загрузкой новой капсулы

### Оптимизация производительности
- **Трехуровневое кэширование**: Память (CanvasStateManager) → DataCacheManager → Сервер
- **Кэш состояний canvas**: Сохранение canvasData, thumbnailImage, itemIds
- **Флаг dirty**: Помечает измененные состояния для избежания повторной обработки
- **Инвалидация старого кэша**: Автоматическая очистка кэша старше 1 часа
- **Кэш watermark**: Избегает повторного добавления watermark
- **Инкрементальные операции**: addItems/removeItems вместо полной перезагрузки

### Автоматическая обрезка изображений
- **Обрезка на клиенте**: cropToContent() обрезает canvas по границам объектов
- **Экономия трафика**: Отправка только нужной части изображения
- **Улучшение UX**: Результат без лишних пустых областей

### Единый flow для создания и редактирования
- **Режим 'create'**: selection → canvas → result
- **Режим 'edit'**: canvas → result (пропускает selection)
- **Сохранение состояния**: Возможность вернуться назад без потери данных
- **Предвыбор вещей**: При возврате с canvas на selection

### Новая логика сохранения
- **Сохранение при "Далее"**: Капсула сохраняется сразу при переходе на результат
- **Кнопка "Готово" удалена**: Больше не нужна, капсула уже сохранена
- **Кнопка "Закрыть"**: Просто завершает flow без дополнительного сохранения
- **BackButton на результате**: Закрывает результат и возвращается к гриду

### Навигация через NavigationManager
- **Стек обработчиков**: Каждый этап добавляет свой обработчик BackButton
- **Автоматическая очистка**: navigationManager.clear() при завершении flow
- **Сохранение перед возвратом**: onGoBack callback для сохранения состояния

### Событийная система
- **'wardrobe:render-requested'**: Запрос рендеринга грида гардероба
- **'wardrobe:grid-rendered'**: Уведомление о завершении рендеринга
- **'wardrobe:item-selection-toggle'**: Переключение выбора вещи
- **'wardrobe:item-saved'**: Уведомление о сохранении новой вещи
- **'wardrobe:item-added'**: Уведомление о добавлении вещи
- **'wardrobe:photo-upload-requested'**: Запрос загрузки фото
- **'canvas:modified'**: Уведомление об изменении canvas

### Интеграция с другими модулями
- **WardrobeManager**: Рендеринг грида в режиме 'selection'
- **WardrobeService**: Загрузка вещей и добавление новых
- **PhotoProcessor**: Классификация и удаление фона
- **UIModalManager**: Показ превью новых вещей
- **CapsuleLikesService**: Универсальный компонент лайков
- **CapsulesSharing**: Шеринг капсул через Telegram

### Обработка ошибок
- **CapsuleErrorHandler**: Централизованная обработка ошибок с fallback
- **Graceful degradation**: Fallback на кэш при сетевых ошибках
- **Откат операций**: Очистка временных данных при ошибках
- **Понятные сообщения**: Alert с описанием ошибки для пользователя

### Сортировка по слоям одежды
- **Правильный порядок**: LEGWEAR → BODYWEAR → INNERWEAR → FULLBODY → FOOTWEAR → OUTERWEAR → HEADWEAR → ACCESSORIES
- **Автоматическая сортировка**: При загрузке вещей на canvas
- **Визуальная корректность**: Верхняя одежда всегда поверх нижней

### Metadata для AI-generated капсул
- **Сохранение контекста**: isGenerated, source, recommendations, reasoning
- **Отслеживание происхождения**: Различие между ручными и AI-generated капсулами
- **Будущие улучшения**: Возможность показа рекомендаций и reasoning

### Оптимистичное обновление
- **Лайки**: UI обновляется мгновенно, синхронизация с сервером в фоне
- **Откат**: Автоматический откат изменений при ошибке
- **Анимация**: Плавная анимация кнопки лайка

### Watermark
- **Автоматическое добавление**: При переходе на результат
- **Кэширование**: Избегает повторной обработки
- **Fallback**: Использование оригинального изображения при ошибке

### Очистка ресурсов
- **Автоматическая очистка**: При завершении или отмене flow
- **Очистка кэша**: Удаление временных данных
- **Очистка canvas**: Удаление всех объектов
- **Очистка обработчиков**: Удаление event listeners

### Предотвращение конфликтов
- **Принудительная очистка**: cleanupCanvas() перед загрузкой капсулы
- **Пересоздание экрана результата**: Гарантирует правильный capsuleId
- **Singleton canvas**: Предотвращает создание нескольких экземпляров

### Восстановление визуального выделения
- **После добавления вещи**: restoreVisualSelection() восстанавливает класс 'selected'
- **После перерендера**: Сохранение состояния выбора при обновлении грида
- **Улучшение UX**: Пользователь не теряет выбор при добавлении новой вещи

