/**
 * Сервис для работы с лайками анализов
 */

import { logger } from '../logger';
import { api } from '../api';
import { historyManager } from '../history';

export interface AnalysisLikeStatus {
  isLiked: boolean;
  likesCount: number;
}

interface LikeApiResponse {
  success: boolean;
  isLiked?: boolean;
  likesCount?: number;
  error?: string;
}

export class AnalysisLikesService {
  /**
   * Поставить лайк анализу
   */
  async likeAnalysis(historyItemId: number): Promise<AnalysisLikeStatus> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const response = await api.post(`/analysis-likes/${historyItemId}`, {
        initData
      }) as LikeApiResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to like analysis');
      }

      logger.info('Analysis liked successfully', {
        historyItemId,
        likesCount: response.likesCount
      });

      const historyItem = historyManager.getItemById(historyItemId);

      if (historyItem) {
        historyItem.isLiked = true;
        historyItem.likesCount = response.likesCount || 0;
      } else {
        logger.error('History item NOT FOUND in cache!', { historyItemId });
      }

      return {
        isLiked: true,
        likesCount: response.likesCount || 0
      };

    } catch (error) {
      logger.error('Error liking analysis', error);
      throw error;
    }
  }

  /**
   * Удалить лайк с анализа
   */
  async unlikeAnalysis(historyItemId: number): Promise<AnalysisLikeStatus> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      logger.info('Unliking analysis', { historyItemId });

      const response = await api.delete(
        `/analysis-likes/${historyItemId}?initData=${encodeURIComponent(initData)}`
      ) as LikeApiResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to unlike analysis');
      }

      logger.info('Analysis unliked successfully', {
        historyItemId,
        likesCount: response.likesCount
      });

      // FIXED: Обновляем локальный кэш истории чтобы удаление лайка сразу отобразилось
      const historyItem = historyManager.getItemById(historyItemId);
      if (historyItem) {
        historyItem.isLiked = false;
        historyItem.likesCount = response.likesCount || 0;
        logger.info('History item updated in cache', { historyItemId, isLiked: false });
      }

      return {
        isLiked: false,
        likesCount: response.likesCount || 0
      };

    } catch (error) {
      logger.error('Error unliking analysis', error);
      throw error;
    }
  }

  /**
   * Переключить лайк (toggle)
   */
  async toggleLike(historyItemId: number, currentlyLiked: boolean): Promise<AnalysisLikeStatus> {
    if (currentlyLiked) {
      return this.unlikeAnalysis(historyItemId);
    } else {
      return this.likeAnalysis(historyItemId);
    }
  }

  /**
   * Получить статус лайка для текущего пользователя
   */
  async getLikeStatus(historyItemId: number): Promise<AnalysisLikeStatus> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await api.get(
        `/analysis-likes/${historyItemId}/status?initData=${encodeURIComponent(initData)}`
      ) as LikeApiResponse;

      if (!response.success) {
        // Если ошибка - возвращаем состояние "не лайкнут"
        return {
          isLiked: false,
          likesCount: 0
        };
      }

      return {
        isLiked: response.isLiked || false,
        likesCount: response.likesCount || 0
      };

    } catch (error) {
      logger.error('Error getting like status', error);
      return {
        isLiked: false,
        likesCount: 0
      };
    }
  }
}

export const analysisLikesService = new AnalysisLikesService();
