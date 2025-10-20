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
 * Получить initData из Telegram WebApp
 * Вынесено в отдельную функцию чтобы избежать circular dependencies
 */
function getInitData(): string {
  try {
    return (window as any).Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

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
    timeout = this.defaultTimeout,
    skipInitData = false
  ): Promise<T> {
    // Проверяем доступность сети
    if (!isOnline()) {
      throw createError(ERROR_CODES.NETWORK_ERROR, 'Нет подключения к интернету');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {

      // OPTIMIZED: Автоматически добавляем initData если не помечено как skipInitData
      let finalHeaders = {
        'Content-Type': 'application/json',
        ...options.headers,
      } as Record<string, string>;

      if (!skipInitData) {
        const initData = getInitData();
        if (initData) {
          finalHeaders['X-Init-Data'] = initData;
        }
      }

      const response = await fetch(url, {
        ...options,
        headers: finalHeaders,
        signal: AbortSignal.timeout(timeout),
      });

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
  async get<T>(endpoint: string, timeout?: number, skipInitData = false): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' }, timeout, skipInitData);
  }

  /**
   * POST запрос
   */
  async post<T>(endpoint: string, data?: any, timeout?: number, skipInitData = false): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        ...(data && { body: JSON.stringify(data) }),
      },
      timeout,
      skipInitData
    );
  }

  /**
   * PUT запрос
   */
  async put<T>(endpoint: string, data?: any, timeout?: number, skipInitData = false): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'PUT',
        ...(data && { body: JSON.stringify(data) }),
      },
      timeout,
      skipInitData
    );
  }

  /**
   * DELETE запрос
   */
  async delete<T>(endpoint: string, timeout?: number, skipInitData = false): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' }, timeout, skipInitData);
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
    
    if (!response.success) {
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
   * BATCH: Загрузка всех начальных данных
   * Оптимизация: вместо 3-5 запросов делаем 1 батч запрос
   */
  async getInitialData(): Promise<{
    history: any[];
    wardrobe: any[];
    capsules: any[];
    user: any;
    subscription: any;
  }> {
    logger.info('Loading initial data batch');
    return this.get('/initial-data', TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Получение гардероба пользователя
   */
  async getWardrobe(): Promise<any> {
    logger.info('Loading wardrobe items');
    return this.get('/wardrobe', TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Получение капсул пользователя
   */
  async getCapsules(): Promise<any> {
    logger.info('Loading capsules');
    return this.get('/capsules', TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Получение истории анализов
   */
  async getHistory(limit = 50, page = 1): Promise<any> {
    logger.info('Loading history', { limit, page });
    return this.get(`/history?limit=${limit}&page=${page}`, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Удаление фона с изображения
   */
  async removeBackground(image: string): Promise<any> {
    logger.info('Removing background from image');
    return this.post('/remove-background', { image_base64: image }, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Классификация одежды на изображении
   */
  async classifyClothing(image: string): Promise<any> {
    logger.info('Classifying clothing in image');
    return this.post('/classify-clothing', { image_base64: image }, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Создание нового предмета гардероба
   */
  async createWardrobeItem(data: any): Promise<any> {
    logger.info('Creating wardrobe item');
    return this.post('/wardrobe', data, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Удаление предмета гардероба
   */
  async deleteWardrobeItem(itemId: number): Promise<any> {
    logger.info('Deleting wardrobe item', { itemId });
    return this.delete(`/wardrobe/${itemId}`, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Обновление предмета гардероба
   */
  async updateWardrobeItem(itemId: number, data: any): Promise<any> {
    logger.info('Updating wardrobe item', { itemId });
    return this.put(`/wardrobe/${itemId}`, data, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Создание капсулы
   */
  async createCapsule(data: any): Promise<any> {
    logger.info('Creating capsule');
    return this.post('/capsules', data, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Удаление капсулы
   */
  async deleteCapsule(capsuleId: number): Promise<any> {
    logger.info('Deleting capsule', { capsuleId });
    return this.delete(`/capsules/${capsuleId}`, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Обновление капсулы
   */
  async updateCapsule(capsuleId: number, data: any): Promise<any> {
    logger.info('Updating capsule', { capsuleId });
    return this.put(`/capsules/${capsuleId}`, data, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Удаление элемента истории
   */
  async deleteHistoryItem(itemId: number): Promise<any> {
    logger.info('Deleting history item', { itemId });
    return this.delete(`/history/${itemId}`, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Обновление элемента истории
   */
  async updateHistoryItem(itemId: number, data: any): Promise<any> {
    logger.info('Updating history item', { itemId });
    return this.put(`/history/${itemId}`, data, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Добавление лайка к анализу
   */
  async likeAnalysis(historyItemId: number): Promise<any> {
    logger.info('Liking analysis', { historyItemId });
    return this.post(`/analysis-likes/${historyItemId}`, {}, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Удаление лайка с анализа
   */
  async unlikeAnalysis(historyItemId: number): Promise<any> {
    logger.info('Unliking analysis', { historyItemId });
    return this.delete(`/analysis-likes/${historyItemId}`, TIMEOUTS.ANALYSIS_REQUEST);
  }

  /**
   * Проверка статуса лайка (DEPRECATED: используй isLiked из истории)
   */
  async checkLikeStatus(historyItemId: number): Promise<any> {
    logger.info('Checking like status', { historyItemId });
    return this.get(`/analysis-likes/${historyItemId}/status`, TIMEOUTS.ANALYSIS_REQUEST);
  }
}

// Создаем глобальный экземпляр API клиента
export const api = new TgStyleApi();

// Экспортируем базовый класс для возможного расширения
export { ApiClient };
export default api;
