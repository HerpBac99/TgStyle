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
   * Универсальная обработка shared контента при инициализации
   * Проверяет все возможные источники параметров один раз
   */
  private handleShared(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const tgStartParam = this.tg?.initDataUnsafe?.start_param;
    let sharedId: string | null = null;
    let contentType: 'analysis' | 'capsule' | null = null;

    // Проверяем Telegram WebApp start_param (приоритет 1)
    if (tgStartParam) {
      if (tgStartParam.startsWith('analysis_')) {
        sharedId = tgStartParam.replace('analysis_', '');
        contentType = 'analysis';
        logger.info('Found shared analysis in Telegram start_param', { sharedId });
      } else if (tgStartParam.startsWith('capsule_')) {
        sharedId = tgStartParam.replace('capsule_', '');
        contentType = 'capsule';
        logger.info('Found shared capsule in Telegram start_param', { sharedId });
      } else if (tgStartParam.startsWith('shared_')) {
        sharedId = tgStartParam.replace('shared_', '');
        contentType = 'analysis'; // старый формат - всегда анализ
        logger.info('Found shared analysis in Telegram start_param (old format)', { sharedId });
      }
    }

    // Проверяем параметр startapp (приоритет 2)
    if (!sharedId) {
      const startAppParam = urlParams.get('startapp');
      if (startAppParam) {
        if (startAppParam.startsWith('analysis_')) {
          sharedId = startAppParam.replace('analysis_', '');
          contentType = 'analysis';
          logger.info('Found shared analysis in startapp param', { sharedId });
        } else if (startAppParam.startsWith('capsule_')) {
          sharedId = startAppParam.replace('capsule_', '');
          contentType = 'capsule';
          logger.info('Found shared capsule in startapp param', { sharedId });
        } else if (startAppParam.startsWith('shared_')) {
          sharedId = startAppParam.replace('shared_', '');
          contentType = 'analysis'; // старый формат - всегда анализ
          logger.info('Found shared analysis in startapp param (old format)', { sharedId });
        }
      }
    }

    // Проверяем параметр start (приоритет 3, для обратной совместимости)
    if (!sharedId) {
      const startParam = urlParams.get('start');
      if (startParam) {
        if (startParam.startsWith('analysis_')) {
          sharedId = startParam.replace('analysis_', '');
          contentType = 'analysis';
          logger.info('Found shared analysis in start param', { sharedId });
        } else if (startParam.startsWith('capsule_')) {
          sharedId = startParam.replace('capsule_', '');
          contentType = 'capsule';
          logger.info('Found shared capsule in start param', { sharedId });
        } else if (startParam.startsWith('shared_')) {
          sharedId = startParam.replace('shared_', '');
          contentType = 'analysis'; // старый формат - всегда анализ
          logger.info('Found shared analysis in start param (old format)', { sharedId });
        }
      }
    }

    // Проверяем hash (приоритет 4, для прямых ссылок)
    if (!sharedId) {
      const hash = window.location.hash;
      if (hash.startsWith('#shared-analysis-')) {
        sharedId = hash.replace('#shared-analysis-', '');
        contentType = 'analysis';
        logger.info('Found shared analysis in hash', { sharedId });
      } else if (hash.startsWith('#shared-capsule-')) {
        sharedId = hash.replace('#shared-capsule-', '');
        contentType = 'capsule';
        logger.info('Found shared capsule in hash', { sharedId });
      }
    }

    // Если нашли shared контент, загружаем его
    if (sharedId && contentType) {
      if (contentType === 'analysis') {
        this.showSharedAnalysis(sharedId);
      } else if (contentType === 'capsule') {
        this.showSharedCapsule(sharedId);
      }
    }
  }

  /**
   * Показать shared анализ другого пользователя
   */
  private async showSharedAnalysis(analysisId: string): Promise<void> {
    try {
      logger.info('Loading shared analysis from server', { analysisId });

      // Добавляем initData для проверки статуса лайка
      const initData = this.tg?.initData || '';
      const apiUrl = `/shared-analysis/${analysisId}?initData=${encodeURIComponent(initData)}`;

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
          data.historyItemId,
          data.likesCount,
          data.isLiked
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
   * Показать shared капсулу другого пользователя
   */
  private async showSharedCapsule(capsuleId: string): Promise<void> {
    try {
      logger.info('Loading shared capsule from server', { capsuleId });

      // Добавляем initData для проверки статуса лайка
      const initData = this.tg?.initData || '';
      const apiUrl = `/shared-capsule/${capsuleId}?initData=${encodeURIComponent(initData)}`;

      const response = await api.get(apiUrl);

      if ((response as any).success && (response as any).data) {
        logger.info('Shared capsule loaded from server', {
          capsuleId,
          hasImage: !!(response as any).data.thumbnailUrl,
          hasCanvasData: !!(response as any).data.canvasData,
          itemsCount: (response as any).data.items?.length || 0
        });

        const data = (response as any).data;

        await uiManager.showSharedCapsule(
          data.thumbnailUrl,
          data.name,
          data.canvasData,
          data.items,
          data.capsuleId,
          data.likesCount,
          data.isLiked,
          data.author
        );
      } else {
        logger.warn('Server returned no data for shared capsule', {
          capsuleId,
          response
        });
      }
    } catch (error) {
      logger.error('Failed to show shared capsule', { capsuleId, error });
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

      // Обрабатываем shared контент (один раз при инициализации)
      this.handleShared();

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

      // Инициализируем UI подписки из кэша (мгновенно)
      authManager.initializeSubscriptionUI();

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
      const startTime = performance.now();

      // Мгновенно отрисовываем карусель, используя данные из localStorage,
      // которые уже были загружены в конструкторе historyManager.
      uiManager.updateHistoryDisplay();

      const renderTime = performance.now() - startTime;
      logger.info('⚡ Optimistic UI render completed from cache', {
        renderTime: `${renderTime.toFixed(2)}ms`,
        historyItems: historyManager.getFilledCount()
      });
    } catch (error) {
      logger.warn('Failed to perform optimistic UI render', error);
    }
  }

  /**
   * Выполнение авторизации
   */
  private async performAuthentication(): Promise<void> {
    const authStartTime = performance.now();
    logger.info('⏱️ Starting authentication');

    try {
      const authResponse = await authManager.authenticate();
      const authDuration = performance.now() - authStartTime;

      if (authResponse.success) {
        logger.info('✅ Authentication successful', {
          duration: `${authDuration.toFixed(2)}ms`,
          analysesLeft: authResponse.user?.subscription?.analysesLeft
        });

        // Отправляем событие успешной авторизации
        this.dispatchAppEvent(APP_EVENTS.AUTH_SUCCESS, authResponse.user);
      } else {
        logger.error('❌ Authentication failed', {
          error: authResponse.error,
          duration: `${authDuration.toFixed(2)}ms`
        });

        // Отправляем событие неудачной авторизации
        this.dispatchAppEvent(APP_EVENTS.AUTH_FAILURE, { error: authResponse.error });
      }
    } catch (error) {
      const authDuration = performance.now() - authStartTime;
      logger.error('❌ Authentication error', {
        error,
        duration: `${authDuration.toFixed(2)}ms`
      });

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
   * Фоновая загрузка метаданных истории с сервера
   * Выполняется с низким приоритетом после инициализации для синхронизации лайков
   * OPTIMIZATION: Загружаем только метаданные (лайки, просмотры) без тяжелых данных
   */
  private async loadRemainingHistoryInBackground(): Promise<void> {
    const stats = historyManager.getStats();

    // Если истории мало, загружаем полностью
    if (stats.filledSlots < 10) {
      logger.info('Background history load decision', {
        filledSlots: stats.filledSlots,
        willLoad: true,
        reason: 'Loading full history (< 10 items)'
      });

      historyManager.loadHistoryFromServer().catch(err => {
        logger.error('Error loading history from server', err);
      });
      return;
    }

    // Если истории много, загружаем только метаданные для синхронизации лайков
    logger.info('Background metadata sync decision', {
      filledSlots: stats.filledSlots,
      willSync: true,
      reason: 'Syncing likes without reloading images'
    });

    try {
      const initData = window.Telegram?.WebApp?.initData || '';

      if (!initData) {
        logger.warn('No initData available for metadata sync');
        return;
      }

      const response = await api.get(`/history-metadata?initData=${encodeURIComponent(initData)}`) as any;

      if (response.success && response.metadata) {
        // Обновляем только метаданные в кэше без перерисовки
        historyManager.updateMetadata(response.metadata);
        logger.info('History metadata synced', {
          itemsCount: response.metadata.length
        });
      }
    } catch (err) {
      logger.error('Error syncing history metadata', err);
    }
  }

  /**
   * Завершение инициализации
   */
  private completeInitialization(): void {
    this.isInitialized = true;

    // Сообщаем Telegram что приложение готово к показу
    if (this.tg) {
      this.tg.ready();
      logger.info('⚡ Telegram WebApp ready() called - UI visible to user');
    }

    // Отправляем событие готовности приложения
    this.dispatchAppEvent(APP_EVENTS.READY, {
      initTime: Date.now() - this.initStartTime,
      features: APP_CONFIG.features,
    });

    // Логируем статистику всех модулей
    this.logModulesStats();

    logger.info('✅ TgStyle application fully initialized', {
      totalTime: `${Date.now() - this.initStartTime}ms`
    });
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
