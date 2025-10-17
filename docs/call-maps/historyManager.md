### `client/src/modules/history.ts`

Этот модуль управляет историей анализов пользователя, включая загрузку, сохранение, добавление и удаление элементов. Он использует как локальное хранилище (localStorage) для кэширования, так и сервер для основного источника данных.

<a name="loadHistoryFromServer"></a>
- **`loadHistoryFromServer()`**: Асинхронный метод, который загружает историю анализов с бэкенда.
    - **`window.Telegram?.WebApp?.initData`**: Получает `initData` из Telegram WebApp, которая необходима для аутентификации запроса на сервере.
    - **`api.get<ServerHistoryResponse>(`/history?${queryParams.toString()}`)`**: Отправляет GET-запрос к API бэкенда для получения списка истории анализов. Включает `initData` в параметры запроса для аутентификации.
    - **Преобразование данных**: Полученные с сервера данные преобразуются в формат `HistoryItem[]`.
    - **`this.history = serverItems.slice(0, this.maxItems)`**: Обновляет локальный массив истории, обрезая его до максимального количества элементов.
    - **`saveToStorage()`**: Сохраняет обновленную историю в `localStorage` для кэширования.
    - **`window.dispatchEvent(new CustomEvent('history:updated', ...))`**: Отправляет глобальное событие `history:updated`, чтобы другие части UI могли отреагировать на изменение истории.

<a name="loadFromStorage"></a>
- **`loadFromStorage()`**: Приватный метод, вызываемый в конструкторе, для загрузки истории из `localStorage` при старте приложения. Служит как кэш или источник данных в автономном режиме.
    - **`localStorage.getItem(STORAGE_KEYS.HISTORY)`**: Пытается получить строку истории из `localStorage`.
    - **`safeJsonParse<HistoryItem[]>(storedHistory, [])`**: Безопасно парсит JSON-строку в массив объектов `HistoryItem`.
    - **`validateHistory(parsedHistory)`**: Выполняет валидацию загруженных данных, чтобы предотвратить ошибки из-за поврежденного кэша.

<a name="saveToStorage"></a>
- **`saveToStorage()`**: Приватный метод, сохраняющий текущее состояние `this.history` в `localStorage`.
    - **`safeJsonStringify(this.history)`**: Безопасно преобразует массив истории в JSON-строку.
    - **`localStorage.setItem(STORAGE_KEYS.HISTORY, historyJson)`**: Сохраняет JSON-строку в `localStorage`.
