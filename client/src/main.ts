/**
 * Главная точка входа приложения TgStyle
 * Инициализирует все модули и запускает приложение
 */

// Импортируем стили

import type { TelegramWebApp } from '@/types/index';
import { APP_CONFIG, APP_EVENTS } from '@/utils/constants';
import { logger } from '@/modules/logger';
import { authManager } from '@/modules/auth';
import { uiManager } from '@/modules/ui';
import { historyManager } from '@/modules/history';

/**
 * Класс главного приложения
 */
class TgStyleApp {
  private tg: TelegramWebApp | null = null;
  private isInitialized = false;
  private initStartTime = Date.now();

  /**
   * Основной метод инициализации приложения
   */
  async initialize(): Promise<void> {
    logger.info('Starting TgStyle application', {
      version: APP_CONFIG.version,
      environment: APP_CONFIG.environment,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });

    try {
      // Инициализируем Telegram WebApp
      this.initializeTelegram();

      // Настраиваем базовые стили и поведение
      this.setupAppBehavior();

      // Инициализируем UI
      this.initializeUI();

      // Выполняем авторизацию
      await this.performAuthentication();

      // Завершаем инициализацию
      this.completeInitialization();

      logger.info('✅ TgStyle application initialized successfully', {
        initTime: Date.now() - this.initStartTime + 'ms',
      });

    } catch (error) {
      logger.error('❌ Failed to initialize TgStyle application', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Инициализация Telegram WebApp
   */
  private initializeTelegram(): void {
    logger.info('Initializing Telegram WebApp', {
      isWebApp: !!window.Telegram?.WebApp,
      userAgent: navigator.userAgent.split(' ')[0]
    });

    this.tg = window.Telegram?.WebApp || null;

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

      // Уведомляем Telegram что приложение готово
      this.tg.ready();

      logger.info('Telegram WebApp configured', {
        version: this.tg.version,
        platform: this.tg.platform,
        colorScheme: this.tg.colorScheme,
        isExpanded: this.tg.isExpanded,
      });

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

    logger.debug('App behavior configured');
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
      logger.info('Window resized', {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    });

    // Обработка изменения ориентации
    window.addEventListener('orientationchange', () => {
      logger.info('Orientation changed');
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

    // Устанавливаем цвет статус-бара
    const themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    themeColor.content = '#81D8D0'; // Tiffany цвет
    document.head.appendChild(themeColor);
  }

  /**
   * Инициализация UI
   */
  private initializeUI(): void {
    logger.info('Initializing UI');
    
    try {
      uiManager.init();
      logger.info('UI initialized successfully');
    } catch (error) {
      logger.error('Error initializing UI', error);
      throw error;
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
        logger.info('Authentication successful', {
          userId: authResponse.user?.id,
          hasUser: !!authResponse.user,
        });
        
        // Отправляем событие успешной авторизации
        this.dispatchAppEvent(APP_EVENTS.AUTH_SUCCESS, authResponse.user);
      } else {
        logger.warn('Authentication failed', { error: authResponse.error });
        
        // Отправляем событие неудачной авторизации
        this.dispatchAppEvent(APP_EVENTS.AUTH_FAILURE, { error: authResponse.error });
        
        // В Telegram Mini App продолжаем работу даже без авторизации
        logger.info('Continuing without server authentication');
      }
    } catch (error) {
      logger.error('Authentication error', error);
      
      // Отправляем событие ошибки авторизации
      this.dispatchAppEvent(APP_EVENTS.AUTH_FAILURE, { error: error instanceof Error ? error.message : 'Unknown error' });
      
      // В Telegram Mini App не прерываем инициализацию
      logger.info('Continuing despite authentication error');
    }
  }

  /**
   * Завершение инициализации
   */
  private completeInitialization(): void {
    this.isInitialized = true;

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
    
    // Принудительно применяем цвет фона
    const targetColor = '#81D8D0';
    document.body.style.backgroundColor = targetColor;
    
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
    logger.info('App event dispatched', { type, payload });
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

// Экспортируем экземпляр приложения для отладки
declare global {
  interface Window {
    tgStyleApp: TgStyleApp;
  }
}

window.tgStyleApp = app;

export default app;
