/**
 * Главная точка входа приложения TgStyle
 * Инициализирует все модули и запускает приложение
 */

// Импортируем стили

import type { TelegramWebApp } from '@/types/index';
import { APP_CONFIG, APP_EVENTS } from '@/utils/constants';
import { logger } from '@/modules/logger';
import { authManager } from '@/modules/auth';
import { uiManager } from '@/modules/uiManager';
import { historyManager } from '@/modules/history';
import { api } from '@/modules/api';
import { dataCacheManager } from '@/modules/dataCache';

/**
 * Класс главного приложения
 */
class TgStyleApp {
  private tg: TelegramWebApp | null = null;
  private isInitialized = false;
  private initStartTime = Date.now();

  /**
   * Обработка URL хэшей для shared анализов
   */
  private handleSharedAnalysis(): void {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(window.location.search);
    const tgStartParam = this.tg?.initDataUnsafe?.start_param;

    // Проверяем хэш (для прямых ссылок)
    if (hash.startsWith('#shared-analysis-')) {
      const analysisId = hash.replace('#shared-analysis-', '');
      logger.info('Found shared analysis in hash', { analysisId });
      this.showSharedAnalysis(analysisId);
      return;
    }

    // Проверяем параметры URL (для ссылок из бота через Mini App)
    const startAppParam = urlParams.get('startapp');
    if (startAppParam) {
      // Новый формат: analysis_xxx
      if (startAppParam.startsWith('analysis_')) {
        const analysisId = startAppParam.replace('analysis_', '');
        logger.info('Found shared analysis in startapp param', { analysisId });
        window.location.hash = `shared-analysis-${analysisId}`;
        this.showSharedAnalysis(analysisId);
        return;
      }
      // Старый формат: shared_xxx (для обратной совместимости)
      if (startAppParam.startsWith('shared_')) {
        const analysisId = startAppParam.replace('shared_', '');
        logger.info('Found shared analysis in startapp param (old format)', { analysisId });
        window.location.hash = `shared-analysis-${analysisId}`;
        this.showSharedAnalysis(analysisId);
        return;
      }
    }

    // Проверяем Telegram WebApp start_param (для Mini App ссылок)
    if (tgStartParam) {
      // Новый формат: analysis_xxx
      if (tgStartParam.startsWith('analysis_')) {
        const analysisId = tgStartParam.replace('analysis_', '');
        logger.info('Found shared analysis in Telegram start_param', { analysisId });
        window.location.hash = `shared-analysis-${analysisId}`;
        this.showSharedAnalysis(analysisId);
        return;
      }
      // Старый формат: shared_xxx (для обратной совместимости)
      if (tgStartParam.startsWith('shared_')) {
        const analysisId = tgStartParam.replace('shared_', '');
        logger.info('Found shared analysis in Telegram start_param (old format)', { analysisId });
        window.location.hash = `shared-analysis-${analysisId}`;
        this.showSharedAnalysis(analysisId);
        return;
      }
    }

    // Для обратной совместимости проверяем start параметр
    const startParam = urlParams.get('start');
    if (startParam) {
      // Новый формат: analysis_xxx
      if (startParam.startsWith('analysis_')) {
        const analysisId = startParam.replace('analysis_', '');
        window.location.hash = `shared-analysis-${analysisId}`;
        this.showSharedAnalysis(analysisId);
        return;
      }
      // Старый формат: shared_xxx
      if (startParam.startsWith('shared_')) {
        const analysisId = startParam.replace('shared_', '');
        window.location.hash = `shared-analysis-${analysisId}`;
        this.showSharedAnalysis(analysisId);
        return;
      }
    }
  }

  /**
   * Показать shared анализ другого пользователя
   */
  private async showSharedAnalysis(analysisId: string): Promise<void> {
    try {
      logger.info('Loading shared analysis from server', { analysisId });

      const { api } = await import('./modules/api.js');
      const apiUrl = `/shared-analysis/${analysisId}`;
      
      const response = await api.get(apiUrl);

      if ((response as any).success && (response as any).data) {
        logger.info('Shared analysis loaded from server', { 
          analysisId,
          hasPhoto: !!(response as any).data.photo,
          hasAnalysis: !!(response as any).data.analysis,
          historyItemId: (response as any).data.historyItemId
        });

        const data = (response as any).data;

        await uiManager.showSharedAnalysis(
          data.photo, 
          data.analysis, 
          data.timestamp, 
          data.historyItemId
        );
      } else {
        logger.warn('Server returned no data for shared analysis', { 
          analysisId,
          response 
        });
      }
    } catch (error) {
      logger.error('Failed to show shared analysis', { analysisId, error });
    }
  }

  /**
   * Основной метод инициализации 
   * @description Основной метод инициализации приложения
   * 
   */
  async initialize(): Promise<void> {
    try {
      // Инициализируем Telegram WebApp
      this.initializeTelegram();

      // Настраиваем базовые стили и поведение
      this.setupAppBehavior();

      // Инициализируем UI (создает менеджеры, historyManager загружает кэш)
      this.initializeUI();

      // Мгновенно отрисовываем UI из кэша localStorage
      this.optimisticUIRender();

      // Выполняем авторизацию
      await this.performAuthentication();

      // Предзагружаем данные в фоне
      this.preloadAppData();

      // Обрабатываем shared анализы
      this.handleSharedAnalysis();

      // Добавляем слушатель изменений хэша
      window.addEventListener('hashchange', () => {
        this.handleSharedAnalysis();
      });

      // Завершаем инициализацию
      this.completeInitialization();

      logger.info('TgStyle application initialized successfully', {
        initTime: Date.now() - this.initStartTime + 'ms',
      });

    } catch (error) {
      logger.error('Failed to initialize TgStyle application', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Инициализация Telegram WebApp
   * 
   * @description Инициализация Telegram WebApp
   * создаем глобальную переменную API для доступа из других модулей
   */
  private initializeTelegram(): void {
    this.tg = window.Telegram?.WebApp || null;

    // Создаем глобальную переменную API для доступа из других модулей
    (window as any).tgStyleApi = api;

    if (!this.tg) {
      logger.warn('Telegram WebApp not available, running in standalone mode');
      return;
    }

    // Настраиваем базовые параметры Telegram
    try {
      // Разворачиваем приложение
      this.tg.expand();
      
      // Включаем подтверждение закрытия
      this.tg.enableClosingConfirmation();
      
      // Запрещаем вертикальные swipe жесты
      this.tg.disableVerticalSwipes();

      // Входим в полноэкранный режим если поддерживается
      if (this.tg.isVersionAtLeast('6.9') && this.tg.requestFullscreen) {
        this.tg.requestFullscreen();
      }
    } catch (error) {
      logger.error('Error configuring Telegram WebApp', error);
    }
  }

  /**
   * Настройка базового поведения приложения
   */
  private setupAppBehavior(): void {
    // Запрещаем скроллинг body
    document.body.style.overflow = 'hidden';

    // Настраиваем обработчики глобальных событий
    this.setupGlobalEventHandlers();

    // Устанавливаем мета-теги для мобильных устройств
    this.setupMobileMeta();

    logger.info('App behavior configured');
  }

  /**
   * Настройка глобальных обработчиков событий
   */
  private setupGlobalEventHandlers(): void {
    // Обработка ошибок загрузки ресурсов
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        logger.error('Resource loading error', {
          source: (event.target as any)?.src || (event.target as any)?.href,
          message: event.message,
        });
      }
    });

    // Обработка изменения размера окна
    window.addEventListener('resize', () => {
      logger.debug('Window resized', {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    });

    // Обработка изменения ориентации
    window.addEventListener('orientationchange', () => {
      logger.debug('Orientation changed');
      // Небольшая задержка для корректного получения новых размеров
      setTimeout(() => {
        this.handleOrientationChange();
      }, 100);
    });

    // Обработка возврата к приложению
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        logger.info('App became visible, refreshing state');
        this.refreshAppState();
      }
    });

    // Слушатель для обновления истории после фоновой загрузки
    window.addEventListener('history:updated', (event: any) => {
      if (event.detail?.source === 'server') {
        logger.info('History updated from server, refreshing UI with position preservation');
        uiManager.updateHistoryDisplay({ preservePosition: true });
      }
    });
  }

  /**
   * Настройка мета-тегов для мобильных устройств
   */
  private setupMobileMeta(): void {
    // Предотвращаем зум при двойном касании
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
      );
    }
  }

  /**
   * @description Инициализация UI
   * вызываем метод init из uiManager
   */
  private initializeUI(): void {
    try {
      uiManager.init();
      logger.info('UI initialized successfully');
    } catch (error) {
      logger.error('Error initializing UI', error);
      throw error;
    }
  }

  /**
   * Оптимистичная отрисовка UI из кэша
   */
  private optimisticUIRender(): void {
    try {
      // Мгновенно отрисовываем карусель, используя данные из localStorage,
      // которые уже были загружены в конструкторе historyManager.
      uiManager.updateHistoryDisplay();
      logger.info('Optimistic UI render completed from cache.');
    } catch (error) {
      logger.warn('Failed to perform optimistic UI render', error);
    }
  }

  /**
   * Выполнение авторизации
   */
  private async performAuthentication(): Promise<void> {
    logger.info('Starting authentication');

    try {
      const authResponse = await authManager.authenticate();
      
      if (authResponse.success) {
        // Отправляем событие успешной авторизации
        this.dispatchAppEvent(APP_EVENTS.AUTH_SUCCESS, authResponse.user);
      } else {
        logger.error('Authentication failed', { error: authResponse.error });
        
        // Отправляем событие неудачной авторизации
        this.dispatchAppEvent(APP_EVENTS.AUTH_FAILURE, { error: authResponse.error });
      }
    } catch (error) {
      logger.error('Authentication error', error);
      
      // Отправляем событие ошибки авторизации
      this.dispatchAppEvent(APP_EVENTS.AUTH_FAILURE, { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Предзагрузка данных приложения - ТОЛЬКО КРИТИЧЕСКИЕ ДАННЫЕ
   * Остальное грузится по требованию (lazy loading)
   */
  private preloadAppData(): void {
    logger.info('Starting app data preload in background');

    Promise.allSettled([
      dataCacheManager.preloadData().catch(err => {
        logger.error('Error during data preload', err);
      })
    ]);

    // Фоновая загрузка остальной истории (низкий приоритет)
    // Загружаем только после того как приложение готово
    setTimeout(() => {
      this.loadRemainingHistoryInBackground();
    }, 1000);
  }

  /**
   * Фоновая загрузка остальной истории (элементы 11-50)
   * Выполняется с низким приоритетом после инициализации
   */
  private loadRemainingHistoryInBackground(): void {
    const stats = historyManager.getStats();
    if (stats.filledSlots < 10) {
      // Если истории меньше 10 элементов, грузим все
      historyManager.loadHistoryFromServer().catch(err => {
        logger.error('Error loading remaining history', err);
      });
    }
    // Если история уже большая (>= 10), не грузим дополнительно при старте
    logger.info('Background history load decision', { 
      filledSlots: stats.filledSlots,
      willLoad: stats.filledSlots < 10 
    });
  }

  /**
   * Завершение инициализации
   */
  private completeInitialization(): void {
    this.isInitialized = true;

    if (this.tg) {
      this.tg.ready();
    }

    // Отправляем событие готовности приложения
    this.dispatchAppEvent(APP_EVENTS.READY, {
      initTime: Date.now() - this.initStartTime,
      features: APP_CONFIG.features,
    });

    // Логируем статистику всех модулей
    this.logModulesStats();

    logger.info('TgStyle application is ready for use');
  }

  /**
   * Обработка ошибки инициализации
   */
  private handleInitializationError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка инициализации';
    
    // Отправляем событие ошибки
    this.dispatchAppEvent(APP_EVENTS.ERROR_OCCURRED, {
      error: errorMessage,
      stage: 'initialization',
    });

    // Показываем ошибку пользователю
    // Ошибка запуска приложения (silent)
    logger.error('App initialization error', { errorMessage });
  }

  /**
   * Обработка изменения ориентации
   */
  private handleOrientationChange(): void {
    // Принудительно применяем стили после изменения ориентации
    uiManager.init();
    
    logger.info('Orientation change handled');
  }

  /**
   * Обновление состояния приложения
   */
  private refreshAppState(): void {
    // Обновляем отображение истории
    uiManager.updateHistoryDisplay();
    logger.info('App state refreshed');
  }

  /**
   * Отправка события приложения
   */
  private dispatchAppEvent(type: string, payload?: any): void {
    const event = new CustomEvent(type, {
      detail: {
        type,
        payload,
        timestamp: Date.now(),
      },
    });
    
    window.dispatchEvent(event);
  }

  /**
   * Логирование статистики модулей
   */
  private logModulesStats(): void {
    try {
      const stats = {
        auth: authManager.getAuthStats(),
        history: historyManager.getStats(),
        ui: uiManager.getStats(),
        logger: logger.getStats(),
      };

      logger.info('Modules statistics', stats);
    } catch (error) {
      logger.warn('Error collecting modules stats', error);
    }
  }

  /**
   * Получение состояния приложения
   */
  getAppState() {
    return {
      isInitialized: this.isInitialized,
      hasTelegram: !!this.tg,
      initTime: Date.now() - this.initStartTime,
      config: APP_CONFIG,
    };
  }

  /**
   * Перезапуск приложения
   */
  async restart(): Promise<void> {
    logger.info('Restarting application');
    
    // Сбрасываем состояние
    this.isInitialized = false;
    this.initStartTime = Date.now();
    
    // Очищаем UI
    uiManager.destroy();
    
    // Повторно инициализируем
    await this.initialize();
  }

  /**
   * Закрытие приложения
   */
  shutdown(): void {
    logger.info('Shutting down application');
    
    // Очищаем ресурсы UI
    uiManager.destroy();
    
    // Закрываем Telegram WebApp если возможно
    if (this.tg?.close) {
      this.tg.close();
    }
  }
}

// Создаем и запускаем приложение
const app = new TgStyleApp();

// Запускаем инициализацию когда DOM готов
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.initialize();
  });
} else {
  // DOM уже готов
  app.initialize();
}

export default app;
