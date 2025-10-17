### `client/src/main.ts`

Это главный файл клиентского приложения. Он отвечает за инициализацию и запуск всех основных модулей.

- **`new TgStyleApp()`**: Создает экземпляр основного класса приложения.
- **`app.initialize()`**: Запускает всю логику инициализации приложения, как только DOM-дерево будет готово.
    - **`initializeTelegram()`**: Инициализирует API Telegram WebApp, настраивает его базовое поведение (разворачивание окна, подтверждение закрытия) и создает глобальную переменную `window.tgStyleApi`.
    - **`setupAppBehavior()`**: Настраивает глобальное поведение приложения.
        - `setupGlobalEventHandlers()`: Устанавливает обработчики на глобальные события, такие как ошибки загрузки ресурсов, изменение размера окна и ориентации.
        - `setupMobileMeta()`: Устанавливает мета-теги для корректного отображения на мобильных устройствах (запрет зума).
    - **`initializeUI()`**: Вызывает [`uiManager.init()`](./uiManager.md#init) для инициализации всех компонентов пользовательского интерфейса.
    - **`performAuthentication()`**: Вызывает [`authManager.authenticate()`](./authManager.md#authenticate) для аутентификации пользователя через Telegram.
    - **`preloadAppData()`**: Параллельно запускает предзагрузку ключевых данных для быстрой работы приложения.
        - [`historyManager.loadHistoryFromServer()`](./historyManager.md#loadHistoryFromServer): Загружает историю анализов пользователя.
        - [`dataCacheManager.preloadData()`](./dataCacheManager.md#preloadData): Предзагружает другие данные, такие как гардероб и капсулы.
    - **[`handleSharedAnalysis()`](#handleSharedAnalysis)**: Проверяет URL на наличие хэша или параметров, указывающих на просмотр "пошаренного" результата анализа, и загружает его при необходимости.
    - **`window.addEventListener('hashchange', ...)`**: Добавляет слушатель событий для отслеживания изменений в URL, чтобы динамически вызывать `handleSharedAnalysis`.
    - **`completeInitialization()`**: Завершает процесс инициализации.
        - `this.tg.ready()`: Сообщает Telegram, что приложение готово к отображению.
        - `dispatchAppEvent(APP_EVENTS.READY, ...)`: Отправляет глобальное событие о готовности приложения.
        - `logModulesStats()`: Собирает и логирует статистику по ключевым модулям (auth, history, ui).
