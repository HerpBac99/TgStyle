# Гардероб (WardrobeMenu) - Ключевые функции

## Последовательность выполнения методов

### 1. Переключение на вкладку гардероба
- **Класс**: `UIManager` (uiManager.ts)
- **Метод**: `handleTabSwitch('wardrobe')`
- **Описание**: Скрывает все вкладки и показывает wardrobe-content

### 2. Открытие гардероба
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handleWardrobeOpen()`
- **Описание**: Универсальный метод для основного гардероба и модальных окон

### 3. Создание фильтров
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `createFilters()`
- **Описание**: Создает кнопки фильтрации по категориям одежды

### 4. Загрузка гардероба из кэша
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `loadWardrobeFromCache()`
- **Описание**: Мгновенная загрузка вещей из dataCacheManager

### 5. Загрузка гардероба (сервис)
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `loadWardrobe()`
- **Описание**: Получает вещи из кэша или с сервера

### 6. Отрисовка грида вещей
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `renderGrid()`
- **Описание**: Создает сетку карточек вещей с анимацией

### 7. Создание карточки вещи
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `createItemCard()`
- **Описание**: Создает DOM элемент карточки с изображением и обработчиками

### 8. Настройка обработчиков событий
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `setupEventListeners()`
- **Описание**: Подключает обработчики для кнопки добавления и модального окна

### 9. Фоновая загрузка полных данных
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `loadWardrobeInBackground()`
- **Описание**: Обновляет данные с сервера если они изменились

### 10. Обработка клика "Добавить вещь"
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `handlePhotoUpload()`
- **Описание**: Открывает file picker для выбора фото

### 11. Обработка загрузки фото
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `processPhotoWithBackgroundRemoval()`
- **Описание**: Обрабатывает фото через FastVLM для классификации

### 12. Оптимизация для классификации
- **Класс**: `PhotoProcessor` (PhotoProcessor.ts)
- **Метод**: `optimizeForClassification()`
- **Описание**: Сжимает изображение до 800px, JPEG 80% для быстрой отправки

### 13. Классификация и удаление фона
- **Класс**: `PhotoProcessor` (PhotoProcessor.ts)
- **Метод**: `classifyAndRemoveBackground()`
- **Описание**: Отправляет запрос на FastVLM API для анализа одежды

### 14. Показ модального окна предпросмотра
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showPreviewModal()`
- **Описание**: Отображает результат классификации для подтверждения

### 15. Подтверждение добавления вещи
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `confirmPreview()`
- **Описание**: Оптимистично добавляет вещь в UI и синхронизирует с сервером

### 16. Добавление вещи (сервис)
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `addItem()`
- **Описание**: Оптимизирует изображение и отправляет на сервер

### 17. Оптимизация для загрузки
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `optimizeImageForUpload()`
- **Описание**: Подготавливает PNG 1200px для сохранения прозрачности

### 18. Обновление кэша
- **Класс**: `DataCacheManager` (dataCache.ts)
- **Метод**: `addWardrobeItem()`
- **Описание**: Добавляет новую вещь в кэш памяти и localStorage

### 19. Обработка клика по вещи (короткое нажатие)
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `showPreviewModal()` (для существующей вещи)
- **Описание**: Показывает модальное окно для просмотра/редактирования

### 20. Обработка долгого нажатия
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `removeItem()`
- **Описание**: Показывает подтверждение и удаляет вещь

### 21. Удаление вещи (сервис)
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `deleteItem()`
- **Описание**: Удаляет с сервера и обновляет кэш

### 22. Фильтрация по категории
- **Класс**: `WardrobeService` (WardrobeService.ts)
- **Метод**: `filterByCategory()`
- **Описание**: Фильтрует массив вещей по выбранной категории

### 23. Обновление кнопок фильтров
- **Класс**: `WardrobeManager` (WardrobeManager.ts)
- **Метод**: `updateFilterButtons()`
- **Описание**: Обновляет активное состояние кнопок фильтрации