/**
 * Модуль для анализа изображений через API
 */

import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisState,
} from '@/types/index';
import { logger } from './logger';
import { api } from './api';
import { authManager } from './auth';
// REMOVED: cameraManager, historyManager - not used anymore
// History is loaded from server directly in analyzeImage()

/**
 * Класс для управления анализом изображений
 */
class AnalysisManager {
  private currentState: AnalysisState = {
    status: 'idle',
    progress: 0,
  };


  /**
   * Подготовка запроса для анализа
   */
  private prepareAnalysisRequest(imageBase64: string, themeDescription?: string): AnalysisRequest {
    const initData = authManager.getInitData();

    const request: AnalysisRequest = {
      photo: imageBase64,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    };

    if (initData) {
      request.initData = initData;
    }

    if (themeDescription) {
      request.theme = themeDescription;
    }

    return request;
  }



  // REMOVED: saveToHistory() - Сервер уже сохраняет в БД через /api/analyze
  // Клиент только перезагружает историю через loadHistoryFromServer()

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
  async analyzeImage(imageBase64: string, themeDescription?: string): Promise<AnalysisResponse> {
    logger.info('Starting image analysis', { themeDescription });

    try {
      // Обновляем состояние
      this.updateState({
        status: 'uploading',
        progress: 10,
        currentStep: 'Подготовка изображения...',
      });

      // Подготавливаем запрос
      const request = this.prepareAnalysisRequest(imageBase64, themeDescription);
      
      this.updateState({
        status: 'processing',
        progress: 30,
        currentStep: 'Отправка на анализ...',
      });

      // Отправляем на анализ
      const response = await api.analyzeImage(request);

      // Проверяем успешность ответа от сервера
      if (!response.success) {
        // Показываем user-friendly сообщение вместо технических ошибок
        const userFriendlyMessage = 'Сервер временно недоступен. Попробуйте позже.';
        throw new Error(userFriendlyMessage);
      }

      this.updateState({
        status: 'completed',
        progress: 100,
        currentStep: 'Анализ завершен',
      });

      // Перезагружаем историю с сервера (сервер уже сохранил через /api/analyze)
      // NEW: Перезагружаем историю с сервера для получения актуальных данных
      const { historyManager } = await import('./history.js');
      await historyManager.loadHistoryFromServer().catch(error => {
        logger.warn('Failed to reload history from server after analysis', error);
      });

      // ОБНОВЛЯЕМ UI ПОСЛЕ СОХРАНЕНИЯ
      const { uiManager } = await import('./uiManager.js');
      const { authManager } = await import('./auth.js');

      // Показываем экран анализа с изображением
      window.dispatchEvent(new CustomEvent('showAnalysisScreen', {
        detail: { imageBase64, analysis: response.analysis }
      }));

      // Обновляем карусель истории (event history:updated уже вызовется автоматически)
      uiManager.updateHistoryDisplay();

      // Обновляем информацию о подписке (если вернулся новый статус)
      if (response.subscription) {
        authManager.updateSubscription(response.subscription);
      }

      // Показываем результат в UI
      if (response.analysis) {
        uiManager.showAnalysisResult(response.analysis, response.historyItemId);
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
    }
  }

  /**
   * Получение статистики анализа
   */
  getStats() {
    return {
      currentStatus: this.currentState.status,
      progress: this.currentState.progress,
      isAnalyzing: this.isAnalyzing(),
      hasResult: false, // Result always undefined since we don't use classification
      hasError: !!this.currentState.error,
    };
  }
}

// Создаем глобальный экземпляр менеджера анализа
export const analysisManager = new AnalysisManager();

export default analysisManager;
