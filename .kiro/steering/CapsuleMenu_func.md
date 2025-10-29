# Капсулы (CapsuleMenu) - Ключевые функции

## Последовательность выполнения методов

### 1. Переключение на вкладку капсул
- **Класс**: `UIManager` (uiManager.ts)
- **Метод**: `handleTabSwitch('capsules')`
- **Описание**: Скрывает все вкладки и показывает capsules-content

### 2. Открытие грида капсул
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleCapsulesOpen()`
- **Описание**: Загружает капсулы и показывает грид

### 3. Инвалидация старого кэша
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `invalidateOldCache()`
- **Описание**: Очищает кэш canvas состояний старше 1 часа

### 4. Загрузка капсул
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `loadCapsules()`
- **Описание**: Получает список капсул из кэша или с сервера

### 5. Загрузка капсул (сервис)
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `loadCapsules()`
- **Описание**: API запрос GET /api/capsules

### 6. Отображение грида
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `show()`
- **Описание**: Показывает контейнер грида капсул

### 7. Рендеринг грида
- **Класс**: `UICapsulesGrid` (uiCapsulesGrid.ts)
- **Метод**: `render()`
- **Описание**: Создает карточки капсул с thumbnail изображениями

### 8. Обработка клика "Создать капсулу"
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleAddCapsuleClick()`
- **Описание**: Запускает flow создания новой капсулы

### 9. Запуск flow создания
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `startNewCapsule()`
- **Описание**: Инициализирует режим 'create' и переходит к выбору вещей

### 10. Переход к выбору вещей
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToSelection()`
- **Описание**: Устанавливает этап 'selection' и вызывает callback

### 11. Показ модального окна выбора
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showSelectionModal()`
- **Описание**: Делегирует в CapsuleSelectionManager

### 12. Показ модального окна (Selection Manager)
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `showModal()`
- **Описание**: Открывает модальное окно с гридом вещей гардероба

### 13. Рендеринг грида выбора
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `renderSelectionGrid()`
- **Описание**: Отображает вещи гардероба для выбора

### 14. Обработка выбора вещей
- **Класс**: `CapsuleSelectionManager` (CapsuleSelectionManager.ts)
- **Метод**: `handleItemSelection()`
- **Описание**: Переключает состояние выбора вещи

### 15. Переход к canvas редактору
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToCanvas()`
- **Описание**: Переключает на этап 'canvas' и показывает редактор

### 16. Показ canvas редактора
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showCanvas()`
- **Описание**: Инициализирует и показывает Fabric.js canvas

### 17. Инициализация canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `getInstance()`
- **Описание**: Создает singleton экземпляр canvas редактора

### 18. Загрузка вещей на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `loadItems()`
- **Описание**: Размещает выбранные вещи на canvas с автоматическим позиционированием

### 19. Сортировка по слоям
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `sortItemsByLayer()`
- **Описание**: Упорядочивает вещи по z-index (обувь снизу, аксессуары сверху)

### 20. Сохранение состояния canvas
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `saveState()`
- **Описание**: Кэширует состояние canvas в память и localStorage

### 21. Переход к результату
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToResult()`
- **Описание**: Переключает на этап 'result' для финального просмотра

### 22. Показ экрана результата
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `showResultScreen()`
- **Описание**: Генерирует финальное изображение с watermark

### 23. Удаление фона
- **Класс**: `ImageProcessingService` (ImageProcessingService.ts)
- **Метод**: `removeBackground()`
- **Описание**: Отправляет canvas изображение на FastVLM для удаления фона

### 24. Добавление watermark
- **Класс**: `ImageProcessingService` (ImageProcessingService.ts)
- **Метод**: `addWatermark()`
- **Описание**: Накладывает логотип на финальное изображение

### 25. Сохранение капсулы
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `saveCapsule()`
- **Описание**: Сохраняет капсулу на сервер с canvas данными

### 26. Создание капсулы (сервис)
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `createCapsule()`
- **Описание**: API запрос POST /api/capsules

### 27. Обновление кэша капсул
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `addCapsule()`
- **Описание**: Добавляет новую капсулу в кэш

### 28. Завершение flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `complete()`
- **Описание**: Очищает состояние и возвращает к гриду капсул

### 29. Обработка клика по существующей капсуле
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `handleViewCapsule()`
- **Описание**: Запускает flow редактирования существующей капсулы

### 30. Запуск flow редактирования
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `startEditCapsule()`
- **Описание**: Инициализирует режим 'edit' и сразу переходит к canvas

### 31. Загрузка данных капсулы
- **Класс**: `CapsulesService` (CapsulesService.ts)
- **Метод**: `loadCapsule()`
- **Описание**: API запрос GET /api/capsules/:id для получения canvas данных

### 32. Восстановление состояния canvas
- **Класс**: `CanvasStateManager` (CanvasStateManager.ts)
- **Метод**: `restoreState()`
- **Описание**: Загружает сохраненное состояние canvas из JSON

### 33. Обработка BackButton навигации
- **Класс**: `NavigationManager` (navigationManager.ts)
- **Метод**: `push()` / `pop()`
- **Описание**: Управляет стеком обработчиков для Telegram BackButton

### 34. Очистка canvas
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `cleanupCanvas()`
- **Описание**: Принудительная очистка canvas для предотвращения конфликтов

### 35. Получение singleton экземпляра canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `getInstance()`
- **Описание**: Возвращает единственный экземпляр canvas редактора (Singleton pattern)

### 36. Обновление конфигурации canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `updateConfig()`
- **Описание**: Обновляет callbacks при повторном вызове getInstance

### 37. Инициализация Fabric.js canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `initializeCanvas()`
- **Описание**: Создает Fabric.js canvas и настраивает обработчики

### 38. Настройка кнопок canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `setupCanvasButtons()`
- **Описание**: Подключает обработчики кнопок "Добавить одежду" и "Далее"

### 39. Добавление элементов на canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `addItems()`
- **Описание**: Добавляет новые вещи на canvas с автопозиционированием

### 40. Удаление элементов с canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `removeItems()`
- **Описание**: Удаляет выбранные элементы с canvas

### 41. Получение ID элементов canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `getItemIds()`
- **Описание**: Возвращает массив ID всех элементов на canvas

### 42. Загрузка сгенерированной капсулы
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `loadGeneratedCapsule()`
- **Описание**: Загружает AI-сгенерированную капсулу на canvas

### 43. Сохранение состояния canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `toJSON()`
- **Описание**: Сериализует состояние canvas в JSON для сохранения

### 44. Восстановление состояния canvas
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `loadFromJSON()`
- **Описание**: Восстанавливает canvas из сохраненного JSON состояния

### 45. Генерация thumbnail изображения
- **Класс**: `UICanvasEditor` (uiCanvasEditor.ts)
- **Метод**: `toDataURL()`
- **Описание**: Создает base64 изображение canvas для thumbnail

### 46. Начало создания новой капсулы (Flow)
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `startNewCapsule()`
- **Описание**: Инициализирует flow создания в режиме 'create'

### 47. Начало редактирования капсулы (Flow)
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `editCapsule()`
- **Описание**: Инициализирует flow редактирования в режиме 'edit'

### 48. Переход между этапами flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `moveToSelection()` / `moveToCanvas()` / `moveToResult()`
- **Описание**: Управляет переходами между этапами создания капсулы

### 49. Обработка навигации назад
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `goBack()`
- **Описание**: Возвращает на предыдущий этап с сохранением состояния

### 50. Установка callbacks flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setCallbacks()`
- **Описание**: Настраивает callback функции для событий flow

### 51. Получение состояния flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `getState()` / `getCurrentStep()` / `getCapsuleId()`
- **Описание**: Возвращает текущее состояние flow для других модулей

### 52. Сохранение выбранных элементов
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setSelectedItems()`
- **Описание**: Сохраняет выбранные вещи в состоянии flow

### 53. Сохранение состояния canvas в flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setCanvasState()`
- **Описание**: Сохраняет состояние canvas для восстановления

### 54. Сохранение результата с watermark
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `setResultImage()`
- **Описание**: Сохраняет финальное изображение с watermark

### 55. Завершение flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `complete()`
- **Описание**: Завершает flow и очищает состояние

### 56. Отмена flow
- **Класс**: `CapsuleFlowManager` (CapsuleFlowManager.ts)
- **Метод**: `cancel()`
- **Описание**: Отменяет flow и возвращает к гриду капсул

### 57. Управление BackButton навигацией
- **Класс**: `NavigationManager` (navigationManager.ts)
- **Метод**: `push()` / `pop()` / `clear()`
- **Описание**: Управляет стеком обработчиков для Telegram BackButton

### 58. Обработка ошибок с fallback
- **Класс**: `CapsuleErrorHandler` (CapsuleErrorHandler.ts)
- **Метод**: `handleWithFallback()`
- **Описание**: Обрабатывает ошибки с graceful degradation

### 59. Создание контекста ошибки
- **Класс**: `CapsuleErrorHandler` (CapsuleErrorHandler.ts)
- **Метод**: `createContext()`
- **Описание**: Создает контекст для детального логирования ошибок

### 60. Очистка всех ресурсов
- **Класс**: `CapsulesManager` (CapsulesManager.ts)
- **Метод**: `destroy()`
- **Описание**: Удаляет обработчики событий и очищает все ресурсы