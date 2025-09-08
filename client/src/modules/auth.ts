/**
 * Модуль авторизации через Telegram WebApp
 */

import type { 
  TelegramWebApp, 
  TelegramUser,
  AuthResponse 
} from '@/types/index.js';
import { validateTelegramInitData } from '@/utils/validation.js';
import { createError, ERROR_CODES } from '@/utils/helpers.js';
import { logger } from './logger';
import { api } from './api.js';

/**
 * Класс для управления авторизацией
 */
class AuthManager {
  private tg: TelegramWebApp | null = null;
  private user: TelegramUser | null = null;
  private isAuthenticated = false;

  constructor() {
    this.initializeTelegram();
  }

  /**
   * Инициализация Telegram WebApp
   */
  private initializeTelegram(): void {
    this.tg = window.Telegram?.WebApp || null;
    
    if (!this.tg) {
      logger.warn('Telegram WebApp not available');
      return;
    }

    logger.info('Telegram WebApp initialized', {
      version: this.tg.version,
      platform: this.tg.platform,
      colorScheme: this.tg.colorScheme,
      isExpanded: this.tg.isExpanded,
    });

    // Настраиваем Telegram WebApp
    this.setupTelegramApp();
  }

  /**
   * Настройка Telegram WebApp
   */
  private setupTelegramApp(): void {
    if (!this.tg) return;

    try {
      // Разворачиваем приложение
      this.tg.expand();
      
      // Включаем подтверждение закрытия
      this.tg.enableClosingConfirmation();
      
      // Входим в полноэкранный режим если поддерживается
      if (this.tg.isVersionAtLeast('6.9') && this.tg.requestFullscreen) {
        logger.info('Requesting fullscreen mode');
        this.tg.requestFullscreen();
      }

      // Применяем цвет фона
      this.applyTheme();

      // Уведомляем Telegram что приложение готово
      this.tg.ready();
      
      logger.info('Telegram WebApp configured successfully');
    } catch (error) {
      logger.error('Error configuring Telegram WebApp', error);
    }
  }

  /**
   * Применение темы приложения
   */
  private applyTheme(): void {
    if (!this.tg) return;

    try {
      // Устанавливаем цвет фона в Telegram
      const tiffanyColor = '#81D8D0';
      this.tg.setBackgroundColor(tiffanyColor);
      
      // Также применяем принудительно через CSS
      document.body.style.backgroundColor = tiffanyColor;
      
      const appContainer = document.querySelector('.app-container') as HTMLElement;
      if (appContainer) {
        appContainer.style.backgroundColor = tiffanyColor;
      }

      logger.debug('Theme applied successfully', { color: tiffanyColor });
    } catch (error) {
      logger.error('Error applying theme', error);
    }
  }

  /**
   * Получение данных пользователя из Telegram
   */
  private extractUserData(): TelegramUser | null {
    if (!this.tg?.initDataUnsafe?.user) {
      logger.warn('User data not available in Telegram');
      return null;
    }

    const user = this.tg.initDataUnsafe.user;
    logger.debug('User data extracted', {
      id: user.id,
      firstName: user.first_name,
      hasPhoto: !!user.photo_url,
    });

    return user;
  }

  /**
   * Отображение информации о пользователе в UI
   */
  private displayUserProfile(): void {
    if (!this.user) return;

    try {
      const userName = document.getElementById('user-name');
      const userPhoto = document.getElementById('user-photo');

      if (userName) {
        userName.textContent = this.user.first_name || '';
      }

      if (userPhoto && this.user.photo_url) {
        (userPhoto as HTMLElement).style.backgroundImage = `url(${this.user.photo_url})`;
      }

      logger.debug('User profile displayed');
    } catch (error) {
      logger.error('Error displaying user profile', error);
    }
  }

  /**
   * Основной метод авторизации
   */
  async authenticate(): Promise<AuthResponse> {
    logger.info('Starting authentication process');

    try {
      // Извлекаем данные пользователя
      this.user = this.extractUserData();
      this.displayUserProfile();

      // Применяем тему приложения
      this.applyTheme();

      // Получаем initData для валидации на сервере
      const initData = this.tg?.initData;
      
      if (!initData) {
        logger.warn('InitData not available, continuing without server authentication');
        // В режиме разработки можем продолжить без авторизации
        const authResponse: AuthResponse = {
          success: true,
        };

        if (this.user) {
          authResponse.user = {
            id: String(this.user.id),
            telegramId: this.user.id,
            firstName: this.user.first_name,
            ...(this.user.last_name && { lastName: this.user.last_name }),
            ...(this.user.username && { username: this.user.username }),
          };
        }

        return authResponse;
      }

      // Валидируем initData локально
      const validation = validateTelegramInitData(initData);
      if (!validation.isValid) {
        logger.error('Invalid Telegram initData', { errors: validation.errors });
        throw createError(ERROR_CODES.AUTH_FAILED, 'Некорректные данные авторизации');
      }

      if (validation.warnings.length > 0) {
        logger.warn('Telegram initData warnings', { warnings: validation.warnings });
      }

      // Отправляем на сервер для валидации
      logger.debug('Sending initData to server for validation');
      const response = await api.authenticate(initData);

      if (response.success) {
        this.isAuthenticated = true;
        logger.info('Authentication successful');
      } else {
        logger.error('Server authentication failed', { error: response.error });
        throw createError(ERROR_CODES.AUTH_FAILED, response.error || 'Ошибка авторизации');
      }

      return response;

    } catch (error) {
      logger.error('Authentication failed', error);
      
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      
      throw createError(ERROR_CODES.AUTH_FAILED, 'Неизвестная ошибка авторизации');
    }
  }

  /**
   * Получение текущего пользователя
   */
  getCurrentUser(): TelegramUser | null {
    return this.user;
  }

  /**
   * Проверка статуса авторизации
   */
  isUserAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Получение Telegram WebApp объекта
   */
  getTelegram(): TelegramWebApp | null {
    return this.tg;
  }

  /**
   * Получение initData для API запросов
   */
  getInitData(): string | undefined {
    return this.tg?.initData;
  }


  /**
   * Показ подтверждающего диалога через Telegram (silent fallback)
   */
  showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.tg?.showConfirm) {
        this.tg.showConfirm(message, resolve);
      } else {
        // Silent fallback - логируем и подтверждаем
        logger.info('Silent confirm', { message });
        resolve(true);
      }
    });
  }

  /**
   * Генерация вибрации (если поддерживается)
   */
  vibrate(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    try {
      if (this.tg?.HapticFeedback?.impactOccurred) {
        this.tg.HapticFeedback.impactOccurred(type);
      } else if (navigator.vibrate) {
        const duration = type === 'light' ? 10 : type === 'medium' ? 20 : 30;
        navigator.vibrate(duration);
      }
    } catch (error) {
      logger.debug('Vibration not supported', error);
    }
  }

  /**
   * Закрытие приложения
   */
  close(): void {
    if (this.tg?.close) {
      this.tg.close();
    } else {
      window.close();
    }
  }

  /**
   * Получение статистики авторизации
   */
  getAuthStats() {
    return {
      isAuthenticated: this.isAuthenticated,
      hasTelegram: !!this.tg,
      hasUser: !!this.user,
      telegramVersion: this.tg?.version,
      platform: this.tg?.platform,
      colorScheme: this.tg?.colorScheme,
    };
  }
}

// Создаем глобальный экземпляр менеджера авторизации
export const authManager = new AuthManager();

export default authManager;
