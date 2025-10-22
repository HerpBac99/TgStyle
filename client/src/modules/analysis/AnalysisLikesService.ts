/**
 * Сервис для работы с лайками анализов
 */

import { logger } from '../logger';
import { api } from '../api';
import { historyManager } from '../history';
import { createElement } from '@/utils/helpers';

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
   * Создает и управляет полнофункциональным компонентом лайков.
   * @param parentElement - DOM-элемент, куда будет встроен компонент.
   * @param entityId - ID сущности (historyItemId).
   * @param initialData - Начальные данные для мгновенной отрисовки.
   */
  public createLikeComponent(
    parentElement: HTMLElement,
    entityId: number,
    initialData: AnalysisLikeStatus,
    componentClass: string = '' // Новый параметр
  ): void {
    const container = createElement('div', { class: `like-container` });
    const likeBtnClass = componentClass ? `like-btn ${componentClass}-like-btn` : 'like-btn';
    const likeBtn = createElement('button', { class: likeBtnClass, 'aria-label': 'Поставить лайк' });
    likeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    `;
    const likesCountClass = componentClass ? `like-count ${componentClass}-like-count` : 'like-count';
    const likesCountEl = createElement('span', { class: likesCountClass }, String(initialData.likesCount || 0));
    container.appendChild(likeBtn);
    container.appendChild(likesCountEl);

    // 2. Начальная отрисовка
    let currentState = { ...initialData };
    if (currentState.isLiked) {
      likeBtn.classList.add('liked');
    }

    // 3. Обработчик клика с оптимистичным UI
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      const previousState = { ...currentState };
      const isLiking = !currentState.isLiked;

      // Оптимистичное обновление UI
      currentState.isLiked = isLiking;
      currentState.likesCount += isLiking ? 1 : -1;
      likeBtn.classList.toggle('liked', isLiking);
      likesCountEl.textContent = String(currentState.likesCount);

      try {
        // Асинхронный запрос к API
        const updatedStatus = await this.toggleLike(entityId, !isLiking);

        // Корректировка UI, если ответ сервера отличается
        currentState = updatedStatus;
        likesCountEl.textContent = String(currentState.likesCount);
        if (currentState.isLiked !== isLiking) {
          likeBtn.classList.toggle('liked', currentState.isLiked);
        }

      } catch (error) {
        logger.error('Failed to toggle like, rolling back UI', { entityId, error });
        // Молчаливый откат UI в случае ошибки
        currentState = previousState;
        likeBtn.classList.toggle('liked', currentState.isLiked);
        likesCountEl.textContent = String(currentState.likesCount);
      }
    });

    // 4. Добавление в DOM
    parentElement.prepend(container);
  }

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

      // Проверяем, есть ли этот анализ в локальной истории пользователя
      const isInLocalHistory = historyManager.getItemById(historyItemId) !== undefined;

      logger.info('Analysis liked successfully', {
        historyItemId,
        likesCount: response.likesCount,
        isInLocalHistory
      });

      // Обновляем состояние в historyManager ТОЛЬКО если анализ есть в локальной истории
      if (isInLocalHistory) {
        historyManager.updateItemLikeStatus(historyItemId, {
          isLiked: true,
          likesCount: response.likesCount || 0
        });
      } else {
        logger.info('Skipping local history update - shared analysis not in user history', {
          historyItemId
        });
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

      // Проверяем, есть ли этот анализ в локальной истории пользователя
      const isInLocalHistory = historyManager.getItemById(historyItemId) !== undefined;

      logger.info('Analysis unliked successfully', {
        historyItemId,
        likesCount: response.likesCount,
        isInLocalHistory
      });

      // Обновляем состояние в historyManager ТОЛЬКО если анализ есть в локальной истории
      if (isInLocalHistory) {
        historyManager.updateItemLikeStatus(historyItemId, {
          isLiked: false,
          likesCount: response.likesCount || 0
        });
      } else {
        logger.info('Skipping local history update - shared analysis not in user history', {
          historyItemId
        });
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
