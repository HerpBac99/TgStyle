/**
 * Модуль для анализа изображений через API
 */

import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisState,
  FashionTheme,
} from '@/types/index';
import { FASTVLM_CONFIG } from '@/utils/constants';
import { createError, ERROR_CODES } from '@/utils/helpers';
import { logger } from './logger';
import { api } from './api';
import { authManager } from './auth';
import { cameraManager } from './camera';
import { historyManager } from './history';

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
   * Подготовка запроса для анализа
   */
  private prepareAnalysisRequest(imageBase64: string, theme?: FashionTheme): AnalysisRequest {
    const initData = authManager.getInitData();

    const request: AnalysisRequest = {
      photo: imageBase64,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    };

    if (initData) {
      request.initData = initData;
    }

    if (theme) {
      request.theme = theme;
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
   * Сохранение результата в историю с оптимизацией размера
   */
  private async saveToHistory(response: AnalysisResponse, imageBase64: string): Promise<void> {
    try {
      // Получаем изображение для истории
      let imageForHistory = cameraManager.getImageForAnalysis() || imageBase64;

      // Проверяем валидность base64 перед сохранением
      if (!imageForHistory || imageForHistory.length < 100) {
        logger.warn('Invalid image data for history, skipping save');
        return;
      }

      // РАСЧЕТ РАЗМЕРА И ОПТИМИЗАЦИЯ
      const analysisText = response.analysis || '';
      const currentSizeMB = cameraManager.calculateHistoryItemSize(imageForHistory, analysisText);

      // Всегда делаем resize до 800x800 пикселей для экономии места
      if (currentSizeMB > 0.5) {
        try {
          const resizedImage = await cameraManager.resizeImageForStorage(imageForHistory);
          const resizedSizeMB = cameraManager.calculateHistoryItemSize(resizedImage, analysisText);

          // Если после resize размер все еще > 1MB, не сохраняем
          if (resizedSizeMB > 1.0) {
            logger.warn('Image too large even after resize, skipping save');
            return;
          }

          imageForHistory = resizedImage;

        } catch (resizeError) {
          logger.error('Image resize failed, skipping localStorage save', resizeError);
          return;
        }
      }

      // Создаем элемент истории
      const historyItem: any = {
        photo: imageForHistory,
        timestamp: new Date().toISOString(),
        sourceType: 'photo' as const,
      };

      if (response.analysis) {
        historyItem.analysis = response.analysis;
      }

      // Сохраняем детальные результаты многопроходного анализа
      if (response.multi_pass_results) {
        historyItem.multi_pass_results = response.multi_pass_results;
      }

      const saved = historyManager.addItem(historyItem);

      if (saved) {
        logger.info('Analysis result saved to history successfully');
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
   * Анализ изображения по base64 строке с указанной темой
   */
  async analyzeImage(imageBase64: string, theme?: FashionTheme): Promise<AnalysisResponse> {
    logger.info('Starting image analysis', { theme });

    try {
      // Обновляем состояние
      this.updateState({
        status: 'uploading',
        progress: 10,
        currentStep: 'Подготовка изображения...',
      });

      // Подготавливаем запрос
      const request = this.prepareAnalysisRequest(imageBase64, theme);
      
      this.updateState({
        status: 'processing',
        progress: 30,
        currentStep: 'Отправка на анализ...',
      });

      // Выполняем анализ с повторными попытками
      const response = await this.performAnalysisWithRetry(request);

      this.updateState({
        status: 'completed',
        progress: 100,
        currentStep: 'Анализ завершен',
      });

      // Сохраняем в историю если анализ успешен
      if (response.success) {
        await this.saveToHistory(response, imageBase64);

        // ОБНОВЛЯЕМ UI ПОСЛЕ СОХРАНЕНИЯ
        const { uiManager } = await import('./ui.js');
        const { authManager } = await import('./auth.js');

        // Показываем экран анализа с изображением
        window.dispatchEvent(new CustomEvent('showAnalysisScreen', {
          detail: { imageBase64, analysis: response.analysis }
        }));

        // Обновляем карусель истории
        uiManager.updateHistoryDisplay();

        // Обновляем информацию о подписке (если вернулся новый статус)
        if (response.subscription) {
          authManager.updateSubscription(response.subscription);
        }

        // Показываем результат в UI
        if (response.analysis) {
          uiManager.showAnalysisResult(response.analysis);
        }
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
      hasResult: false, // Result always undefined since we don't use classification
      hasError: !!this.currentState.error,
    };
  }
}

// Создаем глобальный экземпляр менеджера анализа
export const analysisManager = new AnalysisManager();

export default analysisManager;
