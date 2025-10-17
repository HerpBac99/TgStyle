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
  private userSubscription: {
    type: 'free' | 'premium';
    analysesLeft: number;
    totalAnalyses: number;
    weeklyResetDate: string;
    subscriptionEndDate?: string | null;
  } | null = null;

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

      // Отображение информации о подписке
      this.displaySubscriptionInfo();

    } catch (error) {
      logger.error('Error displaying user profile', error);
    }
  }

  /**
   * Отображение информации о подписке в UI
   */
  private displaySubscriptionInfo(): void {
    if (!this.userSubscription) return;

    try {
      // Ищем элементы для отображения подписки
      const subscriptionStatus = document.getElementById('subscription-status');
      const analysesLeft = document.getElementById('analyses-left');

      // Отображение статуса подписки
      if (subscriptionStatus) {
        const isPremium = this.userSubscription.type === 'premium';
        subscriptionStatus.textContent = isPremium ? 'Premium' : 'Free';
        subscriptionStatus.className = `subscription-status ${isPremium ? 'premium' : 'free'}`;
      }

      // Отображение оставшихся анализов
      if (analysesLeft) {
        const isUnlimited = this.userSubscription.type === 'premium';
        const leftCount = this.userSubscription.analysesLeft;
        
        if (isUnlimited) {
          analysesLeft.textContent = 'Unlimited';
          analysesLeft.className = 'analyses-left unlimited';
        } else {
          analysesLeft.textContent = leftCount.toString();
          analysesLeft.className = `analyses-left ${leftCount <= 1 ? 'low' : leftCount <= 3 ? 'medium' : 'high'}`;
        }
      }

    } catch (error) {
      logger.error('Error displaying subscription info', error);
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
        
        // Создаем базовую подписку для локального режима
        this.userSubscription = {
          type: 'free',
          analysesLeft: 3,
          totalAnalyses: 0,
          weeklyResetDate: new Date().toISOString()
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
            subscription: this.userSubscription
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
        
        // Сохраняем информацию о подписке если доступна
        if (response.user?.subscription) {
          this.userSubscription = response.user.subscription;
        } else {
          // Graceful fallback - создаем базовую подписку для совместимости
          this.userSubscription = {
            type: 'free',
            analysesLeft: 3,
            totalAnalyses: 0,
            weeklyResetDate: new Date().toISOString()
          };
          logger.warn('No subscription info from server, using fallback');
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
   * Получение информации о подписке
   */
  getSubscription() {
    return this.userSubscription;
  }

  /**
   * Проверка Premium статуса
   */
  isPremium(): boolean {
    return this.userSubscription?.type === 'premium';
  }

  /**
   * Получение количества оставшихся анализов
   */
  getAnalysesLeft(): number {
    return this.userSubscription?.analysesLeft || 0;
  }

  /**
   * Может ли пользователь выполнить анализ
   */
  canAnalyze(): boolean {
    if (!this.userSubscription) return false;
    return this.userSubscription.type === 'premium' || this.userSubscription.analysesLeft > 0;
  }

  /**
   * Обновление информации о подписке (после анализа или покупки)
   */
  updateSubscription(subscription: typeof this.userSubscription): void {
    if (subscription) {
      this.userSubscription = subscription;
      this.displaySubscriptionInfo();
      logger.info('Subscription updated', {
        type: subscription.type,
        analysesLeft: subscription.analysesLeft
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
      hasSubscription: !!this.userSubscription,
      subscriptionType: this.userSubscription?.type,
      analysesLeft: this.userSubscription?.analysesLeft,
      telegramVersion: this.tg?.version,
      platform: this.tg?.platform,
      colorScheme: this.tg?.colorScheme,
    };
  }
}

// Создаем глобальный экземпляр менеджера авторизации
export const authManager = new AuthManager();

export default authManager;
