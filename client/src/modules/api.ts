/**
 * API клиент для взаимодействия с сервером TgStyle
 */

import type {
  AuthRequest,
  AuthResponse,
  AnalysisRequest,
  AnalysisResponse,
  LogRequest,
  LogResponse,
  HttpStatusCode,
} from '@/types/index';
import {
  API_URL,
  TIMEOUTS,
  ERROR_CODES
} from '@/utils/constants';
import {
  createError,
  isOnline
} from '@/utils/helpers';
import { logger } from './logger';

/**
 * Базовый класс для API запросов
 */
class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(baseUrl = API_URL, defaultTimeout = TIMEOUTS.AUTH_REQUEST) {
    this.baseUrl = baseUrl;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Выполнение HTTP запроса с обработкой ошибок
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeout = this.defaultTimeout
  ): Promise<T> {
    // Проверяем доступность сети
    if (!isOnline()) {
      throw createError(ERROR_CODES.NETWORK_ERROR, 'Нет подключения к интернету');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {
      logger.info(`API Request: ${options.method || 'GET'} ${url}`);

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(timeout),
      });

      const duration = Date.now() - startTime;
      logger.info(`API Response: ${response.status} ${response.statusText} (${duration}ms)`);

      // Логируем API запрос
      if (window.appLogger) {
        window.appLogger.info(`API Request`, {
          method: options.method || 'GET',
          url: endpoint,
          status: response.status,
          duration,
        });
      }

      // Обработка статусов ошибок
      if (!response.ok) {
        await this.handleHttpError(response);
      }

      // Проверяем Content-Type
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        logger.error('API returned non-JSON response', {
          status: response.status,
          contentType,
          response: text.substring(0, 200),
        });
        throw createError(ERROR_CODES.SERVER_ERROR, 'Сервер вернул некорректный формат данных');
      }

      const data = await response.json() as T;
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(`API Timeout: ${url} (${duration}ms)`);
          throw createError(ERROR_CODES.NETWORK_ERROR, 'Превышено время ожидания ответа');
        }
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          logger.error(`Network Error: ${url}`, error);
          throw createError(ERROR_CODES.NETWORK_ERROR, 'Ошибка сети');
        }
      }

      logger.error('API Request Failed', {
        url,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Обработка HTTP ошибок
   */
  private async handleHttpError(response: Response): Promise<never> {
    const status = response.status as HttpStatusCode;
    
    try {
      const errorData = await response.json();
      const message = errorData.error || errorData.message || response.statusText;
      
      switch (status) {
        case 400:
          throw createError(ERROR_CODES.NETWORK_ERROR, `Неверный запрос: ${message}`);
        case 401:
          throw createError(ERROR_CODES.AUTH_FAILED, `Ошибка авторизации: ${message}`);
        case 404:
          throw createError(ERROR_CODES.SERVER_ERROR, 'Запрашиваемый ресурс не найден');
        case 500:
          throw createError(ERROR_CODES.SERVER_ERROR, 'Внутренняя ошибка сервера');
        case 502:
          throw createError(ERROR_CODES.SERVER_ERROR, 'Сервер недоступен или перегружен');
        case 503:
          throw createError(ERROR_CODES.SERVER_ERROR, 'Сервис временно недоступен');
        default:
          throw createError(ERROR_CODES.SERVER_ERROR, `Ошибка сервера: ${status} ${message}`);
      }
    } catch (parseError) {
      // Если не удалось спарсить JSON ошибки
      throw createError(ERROR_CODES.SERVER_ERROR, `HTTP ${status}: ${response.statusText}`);
    }
  }

  /**
   * GET запрос
   */
  async get<T>(endpoint: string, timeout?: number): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' }, timeout);
  }

  /**
   * POST запрос
   */
  async post<T>(endpoint: string, data?: any, timeout?: number): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        ...(data && { body: JSON.stringify(data) }),
      },
      timeout
    );
  }

  /**
   * PUT запрос
   */
  async put<T>(endpoint: string, data?: any, timeout?: number): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'PUT',
        ...(data && { body: JSON.stringify(data) }),
      },
      timeout
    );
  }

  /**
   * DELETE запрос
   */
  async delete<T>(endpoint: string, timeout?: number): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' }, timeout);
  }

  /**
   * Проверка доступности API
   */
  async ping(): Promise<boolean> {
    try {
      await this.get('/ping', TIMEOUTS.HEALTH_CHECK);
      return true;
    } catch (error) {
      logger.warn('API ping failed', error);
      return false;
    }
  }
}

/**
 * Специализированный API клиент для TgStyle
 */
class TgStyleApi extends ApiClient {
  /**
   * Авторизация пользователя
   */
  async authenticate(initData: string): Promise<AuthResponse> {
    const request: AuthRequest = { initData };
    const response = await this.post<AuthResponse>('/auth', request, TIMEOUTS.AUTH_REQUEST);
    
    if (response.success) {
      logger.info('Authentication successful', { userId: response.user?.id });
    } else {
      logger.error('Authentication failed', { error: response.error });
    }
    
    return response;
  }

  /**
   * Анализ изображения
   */
  async analyzeImage(request: AnalysisRequest): Promise<AnalysisResponse> {
    logger.info('Starting image analysis', {
      hasPhoto: !!request.photo,
      photoSize: request.photo?.length || 0,
      hasPinterestUrl: !!request.pinterestUrl,
    });

    const response = await this.post<AnalysisResponse>(
      '/analyze', 
      request, 
      TIMEOUTS.ANALYSIS_REQUEST
    );

    if (response.success) {
      logger.info('Image analysis successful', {
        hasClassification: false, // Server doesn't return classification
        hasAnalysis: !!response.analysis,
      });
    } else {
      logger.error('Image analysis failed', { error: response.error });
    }

    return response;
  }

  /**
   * Отправка логов на сервер
   */
  async sendLogs(request: LogRequest): Promise<LogResponse> {
    return this.post<LogResponse>('/log-client', request, TIMEOUTS.LOG_REQUEST);
  }

  /**
   * Проверка здоровья FastVLM сервера
   */
  async checkFastVLMHealth(): Promise<boolean> {
    try {
      // В production FastVLM недоступен напрямую с клиента
      // Проверяем через основной API
      const response = await this.get('/health', TIMEOUTS.HEALTH_CHECK);
      return Boolean(response && typeof response === 'object');
    } catch (error) {
      logger.info('FastVLM health check failed', error);
      return false;
    }
  }
}

// Создаем глобальный экземпляр API клиента
export const api = new TgStyleApi();

// Экспортируем базовый класс для возможного расширения
export { ApiClient };
export default api;
