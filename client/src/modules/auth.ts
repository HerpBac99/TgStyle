/**
 * Модуль авторизации через Telegram WebApp
 */

import type {
  TelegramWebApp,
  TelegramUser,
  AuthResponse
} from '@/types/index';
import { validateTelegramInitData } from '@/utils/validation';
import { createError, ERROR_CODES } from '@/utils/helpers';
import { logger } from './logger';
import { api } from './api';

/**
 * Класс для управления авторизацией
 */
class AuthManager {
  private tg: TelegramWebApp | null = null;
  private user: TelegramUser | null = null;
  private isAuthenticated = false;
  private userLimits: {
    analysesLeft: number;
    totalAnalyses: number;
  } | null = null;

  constructor() {
    this.initializeTelegram();
    this.loadSubscriptionFromCache();
  }

  /**
   * Загрузка лимитов из кэша для мгновенного отображения
   */
  private loadSubscriptionFromCache(): void {
    try {
      const cached = localStorage.getItem('tgStyleLimits');
      if (cached) {
        this.userLimits = JSON.parse(cached);
        logger.debug('⚡ User limits loaded from cache (instant)', {
          analysesLeft: this.userLimits?.analysesLeft
        });
      }
    } catch (e) {
      logger.warn('Failed to load user limits from cache', e);
    }
  }

  /**
   * Инициализация UI лимитов после загрузки DOM
   * Вызывается из main.ts после initializeUI()
   */
  initializeSubscriptionUI(): void {
    if (this.userLimits) {
      this.displaySubscriptionInfo();
      logger.debug('⚡ User limits UI initialized from cache');
    }
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
        this.tg.requestFullscreen();
      }

      // Минимизируем заголовок для экономии места
      this.minimizeHeader();
    } catch (error) {
      logger.error('Error configuring Telegram WebApp', error);
    }
  }

  /**
   * Минимизация заголовка Telegram WebApp для освобождения места
   */
  private minimizeHeader(): void {
    if (!this.tg) return;

    try {
      // Устанавливаем цвет заголовка таким же как фон приложения
      // чтобы визуально скрыть его
      this.tg.setHeaderColor('#81D8D0');
      this.tg.setBackgroundColor('#81D8D0');

    } catch (error) {
      logger.warn('Error minimizing Telegram header', error);
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

      // Отображение информации о лимитах
      this.displaySubscriptionInfo();

    } catch (error) {
      logger.error('Error displaying user profile', error);
    }
  }

  /**
   * Отображение информации о подписке в UI
   */
  private displaySubscriptionInfo(): void {
    if (!this.userLimits) return;

    try {
      const startTime = performance.now();

      // Ищем элементы для отображения лимитов
      const analysesLeft = document.getElementById('analyses-left');

      // Отображение оставшихся анализов
      if (analysesLeft) {
        const leftCount = this.userLimits.analysesLeft;
        analysesLeft.textContent = leftCount.toString();
        analysesLeft.className = `analyses-left ${leftCount <= 1 ? 'low' : leftCount <= 3 ? 'medium' : 'high'}`;

        logger.debug('⏱️ User limits UI updated', {
          analysesLeft: leftCount,
          updateTime: `${(performance.now() - startTime).toFixed(2)}ms`
        });
      }

      // Сохраняем лимиты в localStorage для быстрой загрузки при следующем запуске
      try {
        localStorage.setItem('tgStyleLimits', JSON.stringify(this.userLimits));
      } catch (e) {
        logger.warn('Failed to cache user limits', e);
      }

    } catch (error) {
      logger.error('Error displaying user limits info', error);
    }
  }

  /**
   * Основной метод авторизации
   */
  async authenticate(): Promise<AuthResponse> {

    try {
      // Извлекаем данные пользователя
      this.user = this.extractUserData();
      this.displayUserProfile();

      // Получаем initData для валидации на сервере
      const initData = this.tg?.initData;

      if (!initData) {
        logger.warn('InitData not available, continuing without server authentication');

        // Создаем базовые лимиты для локального режима
        this.userLimits = {
          analysesLeft: 10,
          totalAnalyses: 0
        };

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
            analysesLeft: this.userLimits?.analysesLeft ?? 10,
            totalAnalyses: this.userLimits?.totalAnalyses ?? 0
          };
        }

        // Обновляем отображение профиля
        this.displayUserProfile();

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
      const response = await api.authenticate(initData);

      if (response.success) {
        this.isAuthenticated = true;

        // Сохраняем информацию о лимитах если доступна
        if (response.user) {
          this.userLimits = {
            analysesLeft: response.user.analysesLeft ?? 10, // Используем ?? вместо || чтобы 0 не заменялось на 10
            totalAnalyses: response.user.totalAnalyses ?? 0
          };
        } else {
          // Graceful fallback - создаем базовые лимиты для совместимости
          this.userLimits = {
            analysesLeft: 10,
            totalAnalyses: 0
          };
          logger.warn('No user info from server, using fallback');
        }

        // Обновляем отображение профиля с новой информацией
        this.displayUserProfile();

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
      logger.info('Vibration not supported', error);
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
   * Получение информации о лимитах
   */
  getUserLimits() {
    return this.userLimits;
  }

  /**
   * Получение количества оставшихся анализов
   */
  getAnalysesLeft(): number {
    return this.userLimits?.analysesLeft || 0;
  }

  /**
   * Может ли пользователь выполнить анализ
   */
  canAnalyze(): boolean {
    if (!this.userLimits) return false;
    return this.userLimits.analysesLeft > 0;
  }

  /**
   * Обновление информации о лимитах (после анализа)
   */
  updateUserLimits(limits: typeof this.userLimits): void {
    if (limits) {
      this.userLimits = limits;
      this.displaySubscriptionInfo();
      logger.info('User limits updated', {
        analysesLeft: limits.analysesLeft
      });
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
      hasLimits: !!this.userLimits,
      analysesLeft: this.userLimits?.analysesLeft,
      telegramVersion: this.tg?.version,
      platform: this.tg?.platform,
      colorScheme: this.tg?.colorScheme,
    };
  }
}

// Создаем глобальный экземпляр менеджера авторизации
export const authManager = new AuthManager();

export default authManager;
