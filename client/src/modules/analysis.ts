/**
 * Модуль для анализа изображений через API
 */

import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisState,
} from '@/types/index.js';
import { FASTVLM_CONFIG } from '@/utils/constants.js';
import { createError, ERROR_CODES } from '@/utils/helpers.js';
import { logger } from './logger';
import { api } from './api.js';
import { authManager } from './auth.js';
import { cameraManager } from './camera.js';
import { historyManager } from './history.js';

/**
 * Класс для управления анализом изображений
 */
class AnalysisManager {
  private currentState: AnalysisState = {
    status: 'idle',
    progress: 0,
  };

  private retryCount = 0;
  private maxRetries = FASTVLM_CONFIG.MAX_RETRIES;

  /**
   * Основной метод анализа изображения
   */
  async analyzeCurrentImage(): Promise<AnalysisResponse> {
    logger.info('Starting image analysis');

    try {
      // Проверяем наличие изображения
      const imageBase64 = cameraManager.getImageForAnalysis();
      if (!imageBase64) {
        throw createError(ERROR_CODES.ANALYSIS_FAILED, 'Нет изображения для анализа');
      }

      // Обновляем состояние
      this.updateState({
        status: 'uploading',
        progress: 10,
        currentStep: 'Подготовка изображения...',
      });

      // Подготавливаем запрос
      const request = this.prepareAnalysisRequest(imageBase64);
      
      this.updateState({
        status: 'processing',
        progress: 30,
        currentStep: 'Отправка на анализ...',
      });

      // Выполняем анализ с повторными попытками
      const response = await this.performAnalysisWithRetry(request);

      const analysisResult = this.transformAnalysisResult(response);
      this.updateState({
        status: 'completed',
        progress: 100,
        currentStep: 'Анализ завершен',
        ...(analysisResult && { result: analysisResult }),
      });

      // Сохраняем в историю если анализ успешен
      if (response.success) {
        await this.saveToHistory(response, imageBase64);
        
        // Обновляем отображение истории после сохранения
        try {
          const { uiManager } = await import('./ui.js');
          uiManager.updateHistoryDisplay();
          logger.info('History display updated after analysis');
        } catch (uiError) {
          logger.error('Failed to update history display', uiError);
        }
      }

      logger.info('Image analysis completed successfully');
      return response;

    } catch (error) {
      logger.error('Image analysis failed', error);
      
      this.updateState({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка анализа',
      });

      throw error;
    } finally {
      this.retryCount = 0;
    }
  }

  /**
   * Подготовка запроса для анализа
   */
  private prepareAnalysisRequest(imageBase64: string): AnalysisRequest {
    const initData = authManager.getInitData();
    
    const request: AnalysisRequest = {
      photo: imageBase64,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    };

    if (initData) {
      request.initData = initData;
    }

    return request;
  }

  /**
   * Выполнение анализа с повторными попытками
   */
  private async performAnalysisWithRetry(request: AnalysisRequest): Promise<AnalysisResponse> {
    this.retryCount = 0;

    while (this.retryCount <= this.maxRetries) {
      try {
        if (this.retryCount > 0) {
          this.updateState({
            status: 'processing',
            progress: 30 + (this.retryCount * 20),
            currentStep: `Повторная попытка (${this.retryCount}/${this.maxRetries})...`,
          });

          // Задержка перед повторной попыткой
          await this.delay(FASTVLM_CONFIG.RETRY_DELAY * this.retryCount);
        }

        const response = await api.analyzeImage(request);
        
        if (response.success) {
          return response;
        } else {
          throw createError(ERROR_CODES.ANALYSIS_FAILED, response.error || 'Сервер вернул ошибку');
        }

      } catch (error) {
        this.retryCount++;
        
        if (this.retryCount > this.maxRetries) {
          logger.error('All retry attempts failed', {
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        logger.warn(`Analysis attempt ${this.retryCount} failed, retrying...`, error);
      }
    }

    throw createError(ERROR_CODES.ANALYSIS_FAILED, 'Превышено количество попыток анализа');
  }

  /**
   * Преобразование результата анализа
   */
  private transformAnalysisResult(response: AnalysisResponse): AnalysisState['result'] {
    if (!response.success || !response.classification) {
      return undefined;
    }

    return {
      classification: response.classification,
      details: {
        colors: [], // Можно извлечь из анализа
        style: response.classification.classNameRu || 'Неизвестный стиль',
        season: 'универсальный',
        occasion: 'повседневная',
      },
      recommendations: {
        combinations: [], // Можно добавить логику извлечения
        accessories: [],
        styling: [],
      },
      analysis: response.analysis || 'Анализ недоступен',
    };
  }

  /**
   * Сохранение результата в историю
   */
  private async saveToHistory(response: AnalysisResponse, imageBase64: string): Promise<void> {
    try {
      // Используем сжатое изображение для истории (если доступно)
      const imageForHistory = cameraManager.getImageForAnalysis() || imageBase64;

      // Проверяем валидность base64 перед сохранением
      if (!imageForHistory || imageForHistory.length < 100) {
        logger.warn('Invalid image data for history, skipping save');
        return;
      }

      const historyItem: any = {
        photo: imageForHistory,
        timestamp: new Date().toISOString(),
        sourceType: 'photo' as const,
      };

      if (response.analysis) {
        historyItem.analysis = response.analysis;
      }

      if (response.comments) {
        historyItem.comments = response.comments;
      }

      if (response.classification) {
        historyItem.classification = response.classification;
      }

      const saved = historyManager.addItem(historyItem);
      
      if (saved) {
        logger.info('Analysis result saved to history');
      } else {
        logger.warn('Failed to save analysis result to history');
      }
    } catch (error) {
      logger.error('Error saving to history', error);
      // Не прерываем процесс, просто логируем ошибку
    }
  }

  /**
   * Обновление состояния анализа
   */
  private updateState(newState: Partial<AnalysisState>): void {
    this.currentState = { ...this.currentState, ...newState };
    logger.debug('Analysis state updated', this.currentState);
    
    // Можно добавить событие для обновления UI
    this.dispatchStateChangeEvent();
  }

  /**
   * Отправка события изменения состояния
   */
  private dispatchStateChangeEvent(): void {
    const event = new CustomEvent('analysisStateChange', {
      detail: { ...this.currentState },
    });
    window.dispatchEvent(event);
  }

  /**
   * Задержка выполнения
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получение текущего состояния анализа
   */
  getCurrentState(): AnalysisState {
    return { ...this.currentState };
  }

  /**
   * Сброс состояния анализа
   */
  resetState(): void {
    this.currentState = {
      status: 'idle',
      progress: 0,
    };
    this.retryCount = 0;
  }

  /**
   * Проверка, выполняется ли анализ
   */
  isAnalyzing(): boolean {
    return ['uploading', 'processing'].includes(this.currentState.status);
  }

  /**
   * Отмена текущего анализа (если возможно)
   */
  cancelAnalysis(): void {
    if (this.isAnalyzing()) {
      this.updateState({
        status: 'idle',
        progress: 0,
        error: 'Анализ отменен пользователем',
      });
      logger.info('Analysis cancelled by user');
    }
  }

  /**
   * Анализ изображения по base64 строке (для автоматического анализа)
   */
  async analyzeImage(imageBase64: string): Promise<AnalysisResponse> {
    logger.info('Starting automatic image analysis');

    try {
      // Обновляем состояние
      this.updateState({
        status: 'uploading',
        progress: 10,
        currentStep: 'Подготовка изображения...',
      });

      // Подготавливаем запрос
      const request = this.prepareAnalysisRequest(imageBase64);
      
      this.updateState({
        status: 'processing',
        progress: 30,
        currentStep: 'Отправка на анализ...',
      });

      // Выполняем анализ с повторными попытками
      const response = await this.performAnalysisWithRetry(request);

      const analysisResult = this.transformAnalysisResult(response);
      this.updateState({
        status: 'completed',
        progress: 100,
        currentStep: 'Анализ завершен',
        ...(analysisResult && { result: analysisResult }),
      });

      // Сохраняем в историю если анализ успешен
      if (response.success) {
        await this.saveToHistory(response, imageBase64);
      }

      // Показываем результат в UI
      if (response.success && response.analysis) {
        // Импортируем uiManager динамически чтобы избежать циклических зависимостей
        const { uiManager } = await import('./ui.js');
        uiManager.showAnalysisResult(response.analysis);
      }

      logger.info('Automatic image analysis completed successfully');
      return response;

    } catch (error) {
      logger.error('Automatic image analysis failed', error);
      
      this.updateState({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка анализа',
      });

      throw error;
    } finally {
      this.retryCount = 0;
    }
  }

  /**
   * Получение статистики анализа
   */
  getStats() {
    return {
      currentStatus: this.currentState.status,
      progress: this.currentState.progress,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      isAnalyzing: this.isAnalyzing(),
      hasResult: !!this.currentState.result,
      hasError: !!this.currentState.error,
    };
  }
}

// Создаем глобальный экземпляр менеджера анализа
export const analysisManager = new AnalysisManager();

export default analysisManager;
