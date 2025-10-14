# TgStyle Main Menu - UI Manager Documentation

## Обзор модуля uiManager.ts

Модуль `uiManager.ts` является центральным координатором всех UI компонентов главной закладки TgStyle. Он управляет переключением между закладками (main, wardrobe, capsules), координирует работу всех UI менеджеров и обрабатывает глобальные события приложения.

## Основные компоненты

### Класс UIManager

Центральный класс для управления всем пользовательским интерфейсом приложения.

#### Конструктор UIManager()
```typescript
constructor() {
  this.initializeAll();
}
```
**Теги поиска:** `ui_manager_init`, `main_ui_coordinator`, `ui_initialization`

**Что делает:**
- Вызывает `initializeAll()` для полной инициализации всех UI компонентов
- Создает единственный экземпляр `uiManager` для всего приложения

**Параметры:** нет

**Возвращает:** нет (конструктор)

#### initializeAll(): void
```typescript
private initializeAll(): void {
  logger.info('Initializing main UI Manager');
  try {
    uiMenuManager.init();
    uiAnalysisManager.init();
    uiCoreManager.init();
    this.setupTabsListeners();
    this.setupGlobalEventListeners();
    logger.info('All UI modules initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize UI modules', error);
    throw error;
  }
}
```
**Теги поиска:** `ui_modules_init`, `tab_listeners_setup`, `global_event_listeners`, `ui_initialization_error`

**Что делает:**
- Инициализирует все UI менеджеры (menu, analysis, core)
- Настраивает обработчики закладок
- Настраивает глобальные обработчики событий
- Логирует успешную инициализацию или ошибки

**Параметры:** нет

**Возвращает:** void

**Исключения:** выбрасывает ошибку при неудачной инициализации любого модуля

#### setupTabsListeners(): void
```typescript
private setupTabsListeners(): void {
  const tabButtons = document.querySelectorAll('.tab-button');
  logger.info('Setting up tab listeners', { foundButtons: tabButtons.length });
  tabButtons.forEach(button => {
    button.addEventListener('click', this.handleTabClick.bind(this));
  });
}
```
**Теги поиска:** `tab_buttons_setup`, `tab_click_handlers`, `navigation_setup`

**Что делает:**
- Находит все кнопки закладок с классом `.tab-button`
- Добавляет обработчики клика к каждой кнопке
- Логирует количество найденных кнопок

**Параметры:** нет

**Возвращает:** void

#### handleTabClick(event: Event): void
```typescript
private handleTabClick(event: Event): void {
  const button = event.target as HTMLElement;
  const tabButton = button.closest('.tab-button') as HTMLElement;
  if (!tabButton) return;
  const tabName = tabButton.dataset['tab'];
  if (!tabName) return;
  logger.info('Tab clicked', { tab: tabName });
  // Убираем активный класс у всех закладок
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  // Добавляем активный класс к нажатой закладке
  tabButton.classList.add('active');
  this.handleTabSwitch(tabName);
}
```
**Теги поиска:** `tab_click_handler`, `active_tab_switch`, `tab_navigation`, `data_tab_attribute`

**Что делает:**
- Определяет нажатую кнопку закладки
- Извлекает имя закладки из `data-tab` атрибута
- Снимает активный класс со всех закладок
- Добавляет активный класс к нажатой закладке
- Вызывает `handleTabSwitch()` для переключения контента

**Параметры:**
- `event: Event` - событие клика

**Возвращает:** void

#### handleTabSwitch(tabName: string): void
```typescript
private handleTabSwitch(tabName: string): void {
  const mainContent = document.querySelector('.main-content') as HTMLElement;
  const wardrobeContent = document.querySelector('.wardrobe-content') as HTMLElement;
  const capsulesContent = document.querySelector('.capsules-content') as HTMLElement;
  const clothesContainerMain = document.getElementById('wardrobe-clothes-container') as HTMLElement;

  logger.info('Tab switch called', { tabName });

  switch (tabName) {
    case 'main':
      if (mainContent) mainContent.classList.remove('hidden');
      if (wardrobeContent) wardrobeContent.classList.add('hidden');
      if (clothesContainerMain) clothesContainerMain.classList.add('hidden');
      if (capsulesContent) capsulesContent.classList.add('hidden');
      uiMenuManager.updateHistoryDisplay();
      break;
    // ... другие case'ы
  }
}
```
**Теги поиска:** `tab_switch_logic`, `content_visibility`, `main_content_show`, `wardrobe_content_hide`, `capsules_content_hide`, `history_display_update`

**Что делает:**
- Управляет видимостью контейнеров контента разных закладок
- Для закладки 'main': показывает `.main-content`, скрывает wardrobe и capsules, обновляет историю
- Для закладки 'wardrobe': показывает `.wardrobe-content`, скрывает main и capsules
- Для закладки 'capsules': показывает `.capsules-content`, скрывает main и wardrobe

**Параметры:**
- `tabName: string` - имя закладки ('main', 'wardrobe', 'capsules')

**Возвращает:** void

## Глобальные обработчики событий

#### setupGlobalEventListeners(): void
```typescript
private setupGlobalEventListeners(): void {
  window.addEventListener('analysisStateChange', this.handleAnalysisStateChange.bind(this) as EventListener);
  window.addEventListener('showAnalysisScreen', this.handleShowAnalysisScreen.bind(this) as EventListener);
  window.addEventListener('photo:captured', this.handlePhotoCaptured.bind(this) as EventListener);
  document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
  logger.info('Global UI event listeners setup');
}
```
**Теги поиска:** `global_event_listeners`, `analysis_state_events`, `photo_capture_events`, `visibility_change_handler`

**Что делает:**
- Устанавливает глобальные обработчики событий для всего приложения
- `analysisStateChange` - изменение состояния анализа
- `showAnalysisScreen` - показ экрана анализа
- `photo:captured` - захват фото
- `visibilitychange` - изменение видимости страницы

**Параметры:** нет

**Возвращает:** void

#### handleAnalysisStateChange(event: CustomEvent): void
```typescript
private handleAnalysisStateChange(event: CustomEvent): void {
  const state = event.detail;
  logger.info('Analysis state changed', state);
  // Обработка состояния ошибки теперь происходит в самом UI анализа
  // При ошибке UI анализа покажет сообщение об ошибке вместо результата
}
```
**Теги поиска:** `analysis_state_change_handler`, `analysis_error_handling`, `ui_analysis_coordination`

**Что делает:**
- Логирует изменение состояния анализа
- Делегирует обработку ошибок UI менеджеру анализа

**Параметры:**
- `event: CustomEvent` - событие с деталями состояния анализа

**Возвращает:** void

#### handleShowAnalysisScreen(event: CustomEvent): void
```typescript
private handleShowAnalysisScreen(event: CustomEvent): void {
  const { imageBase64, analysis } = event.detail;
  logger.info('Showing analysis screen from event', { hasImage: !!imageBase64, hasAnalysis: !!analysis });
  uiAnalysisManager.showFullscreenPreview(imageBase64);
  if (analysis) {
    uiAnalysisManager.showAnalysisResult(analysis);
  }
}
```
**Теги поиска:** `show_analysis_screen_handler`, `fullscreen_preview_show`, `analysis_result_display`

**Что делает:**
- Извлекает изображение и результат анализа из события
- Показывает полноэкранный превью через `uiAnalysisManager`
- Если есть результат анализа, отображает его

**Параметры:**
- `event: CustomEvent` - событие с imageBase64 и analysis

**Возвращает:** void

#### handlePhotoCaptured(event: CustomEvent): void
```typescript
private handlePhotoCaptured(event: CustomEvent): void {
  uiAnalysisManager.handlePhotoCaptured(event);
}
```
**Теги поиска:** `photo_captured_handler`, `photo_capture_delegation`, `ui_analysis_coordination`

**Что делает:**
- Делегирует обработку захвата фото менеджеру анализа

**Параметры:**
- `event: CustomEvent` - событие захвата фото

**Возвращает:** void

#### handleVisibilityChange(): void
```typescript
private handleVisibilityChange(): void {
  if (document.hidden && uiMenuManager.getStats().longPressActive) {
    uiMenuManager.exitDeleteModePublic();
  }
}
```
**Теги поиска:** `visibility_change_handler`, `long_press_cleanup`, `delete_mode_exit`

**Что делает:**
- При сворачивании страницы проверяет активен ли режим долгого нажатия
- Если да, выходит из режима удаления для предотвращения зависания UI

**Параметры:** нет

**Возвращает:** void

## Публичные методы

#### showSubscriptionModal(): void
```typescript
showSubscriptionModal(): void {
  uiCoreManager.showSubscriptionModal();
}
```
**Теги поиска:** `subscription_modal_show`, `premium_upgrade_prompt`, `ui_core_delegation`

**Что делает:**
- Делегирует показ модального окна подписки менеджеру core UI

**Параметры:** нет

**Возвращает:** void

#### showSharedAnalysis(): Promise<void>
```typescript
async showSharedAnalysis(photoBase64: string, analysisText: string, timestamp: string): Promise<void> {
  await uiCoreManager.showSharedAnalysis(photoBase64, analysisText, timestamp);
}
```
**Теги поиска:** `shared_analysis_show`, `analysis_sharing_display`, `async_ui_operation`

**Что делает:**
- Делегирует показ расшаренного анализа менеджеру core UI

**Параметры:**
- `photoBase64: string` - изображение в base64
- `analysisText: string` - текст анализа
- `timestamp: string` - время анализа

**Возвращает:** Promise<void>

#### showToast(): void
```typescript
showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  uiCoreManager.showToast(message, type);
}
```
**Теги поиска:** `toast_notification_show`, `user_feedback_display`, `ui_notification`

**Что делает:**
- Показывает toast уведомление через core UI менеджер

**Параметры:**
- `message: string` - текст сообщения
- `type: 'success' | 'error' | 'info'` - тип уведомления (по умолчанию 'info')

**Возвращает:** void

#### updateHistoryDisplay(): void
```typescript
updateHistoryDisplay(): void {
  uiMenuManager.updateHistoryDisplay();
}
```
**Теги поиска:** `history_display_update`, `carousel_refresh`, `ui_menu_delegation`

**Что делает:**
- Обновляет отображение истории через menu менеджер

**Параметры:** нет

**Возвращает:** void

#### showAnalysisResult(): void
```typescript
showAnalysisResult(result: string): void {
  uiAnalysisManager.showAnalysisResult(result);
}
```
**Теги поиска:** `analysis_result_display`, `ai_response_show`, `ui_analysis_delegation`

**Что делает:**
- Показывает результат анализа через analysis менеджер

**Параметры:**
- `result: string` - текст результата анализа

**Возвращает:** void

#### getStats()
```typescript
getStats() {
  return {
    menuManager: uiMenuManager.getStats(),
    analysisManager: {
      hasCurrentImage: !!uiAnalysisManager.getCurrentThemeImage?.(),
      hasAnalysisData: !!uiAnalysisManager.getCurrentAnalysisData?.(),
      hasLamodaUrl: !!uiAnalysisManager.getCurrentLamodaUrl?.()
    },
    wardrobeManager: uiWardrobeManager.getStatus(),
    capsulesManager: uiCapsulesManager.getStatus(),
  };
}
```
**Теги поиска:** `ui_stats_get`, `manager_status_collection`, `debugging_info`

**Что делает:**
- Собирает статистику от всех UI менеджеров
- Возвращает объект с состояниями каждого менеджера

**Параметры:** нет

**Возвращает:** объект с статистикой всех менеджеров

#### init(): void
```typescript
init(): void {
  this.updateHistoryDisplay();
}
```
**Теги поиска:** `ui_init`, `post_load_initialization`, `history_initial_display`

**Что делает:**
- Инициализирует UI после загрузки страницы
- Обновляет отображение истории

**Параметры:** нет

**Возвращает:** void

#### destroy(): void
```typescript
destroy(): void {
  logger.info('Destroying main UI Manager');
  try {
    uiMenuManager.destroy();
    uiAnalysisManager.destroy();
    uiCoreManager.destroy();
    uiWardrobeManager.destroy();
    uiCapsulesManager.destroy();
    logger.info('All UI modules destroyed successfully');
  } catch (error) {
    logger.error('Failed to destroy UI modules', error);
  }
}
```
**Теги поиска:** `ui_destroy`, `cleanup_resources`, `manager_shutdown`, `memory_cleanup`

**Что делает:**
- Уничтожает все UI менеджеры
- Очищает ресурсы при закрытии приложения
- Логирует успешное уничтожение или ошибки

**Параметры:** нет

**Возвращает:** void

## Глобальные переменные и обратная совместимость

```typescript
declare global {
  var currentPreview: HTMLElement | null;
  var currentAnalysisData: any;
  var currentLamodaUrl: string | null;
}

globalThis.currentPreview = null;
globalThis.currentAnalysisData = uiAnalysisManager.getCurrentAnalysisData?.() || {};
globalThis.currentLamodaUrl = uiAnalysisManager.getCurrentLamodaUrl?.() || null;
```
**Теги поиска:** `global_variables`, `backward_compatibility`, `legacy_support`

**Что делает:**
- Объявляет глобальные переменные для обратной совместимости
- Инициализирует их значениями из соответствующих менеджеров

## Взаимодействие с другими модулями

**Импортируемые менеджеры:**
- `uiMenuManager` - управление главным меню и каруселью
- `uiAnalysisManager` - управление анализом изображений
- `uiCoreManager` - общие компоненты UI (модалы, toast'ы)
- `uiWardrobeManager` - управление гардеробом
- `uiCapsulesManager` - управление капсулами

**Теги поиска:** `module_imports`, `ui_coordination`, `manager_interaction`

## События приложения

**Отправляемые события:**
- нет (uiManager в основном получает события)

**Получаемые события:**
- `analysisStateChange` - изменение состояния анализа
- `showAnalysisScreen` - запрос показа экрана анализа
- `photo:captured` - захват нового фото

**Теги поиска:** `custom_events`, `event_driven_architecture`, `ui_communication`

## Жизненный цикл

1. **Создание**: `new UIManager()` → `initializeAll()`
2. **Инициализация**: `init()` после загрузки страницы
3. **Работа**: обработка событий и переключение закладок
4. **Уничтожение**: `destroy()` при закрытии приложения

**Теги поиска:** `lifecycle`, `initialization_flow`, `cleanup_process`
