/**
 * Сервис для работы с лайками капсул
 */

import { logger } from '../logger';
import { api } from '../api';
import { createElement } from '@/utils/helpers';
import { dataCacheManager } from '../dataCache';

export interface CapsuleLikeStatus {
  isLiked: boolean;
  likesCount: number;
}

interface LikeApiResponse {
  success: boolean;
  isLiked?: boolean;
  likesCount?: number;
  error?: string;
}

export class CapsuleLikesService {

  /**
   * Создает и управляет полнофункциональным компонентом лайков для капсул.
   * @param parentElement - DOM-элемент, куда будет встроен компонент.
   * @param capsuleId - ID капсулы.
   * @param initialData - Начальные данные для мгновенной отрисовки.
   * @param componentClass - Класс для специфичных стилей (напр. 'capsule').
   */
  public createLikeComponent(
    parentElement: HTMLElement,
    capsuleId: number,
    initialData: CapsuleLikeStatus,
    componentClass: string = ''
  ): void {
    const container = createElement('div', { class: `like-container` });
    const likeBtnClass = componentClass ? `like-btn ${componentClass}-like-btn` : 'like-btn';
    const likeBtn = createElement('button', { class: likeBtnClass, 'aria-label': 'Лайкнуть капсулу' });
    likeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    `;
    const likesCountClass = componentClass ? `like-count ${componentClass}-like-count` : 'like-count';
    const likesCountEl = createElement('span', { class: likesCountClass }, String(initialData.likesCount || 0));
    container.appendChild(likeBtn);
    container.appendChild(likesCountEl);

    // Добавление в DOM В НАЧАЛО контейнера (как в анализе)
    parentElement.prepend(container);

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
        const updatedStatus = await this.toggleLike(capsuleId, !isLiking);
        
        // Корректировка UI, если ответ сервера отличается
        currentState = updatedStatus;
        likesCountEl.textContent = String(currentState.likesCount);
        if (currentState.isLiked !== isLiking) {
           likeBtn.classList.toggle('liked', currentState.isLiked);
        }

      } catch (error) {
        logger.error('Failed to toggle like, rolling back UI', { capsuleId, error });
        // Молчаливый откат UI в случае ошибки
        currentState = previousState;
        likeBtn.classList.toggle('liked', currentState.isLiked);
        likesCountEl.textContent = String(currentState.likesCount);
      }
    });
  }

  /**
   * Поставить лайк капсуле
   */
  async likeCapsule(capsuleId: number): Promise<CapsuleLikeStatus> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const response = await api.post(`/capsule-likes/${capsuleId}`, {
        initData
      }) as LikeApiResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to like capsule');
      }

      const status: CapsuleLikeStatus = {
        isLiked: true,
        likesCount: response.likesCount || 0
      };

      logger.info('Capsule liked successfully', {
        capsuleId,
        likesCount: status.likesCount
      });

      // Обновляем капсулу в кэше
      this.updateCapsuleInCache(capsuleId, status);

      return status;

    } catch (error) {
      logger.error('Error liking capsule', error);
      throw error;
    }
  }

  /**
   * Удалить лайк с капсулы
   */
  async unlikeCapsule(capsuleId: number): Promise<CapsuleLikeStatus> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      logger.info('Unliking capsule', { capsuleId });

      const response = await api.delete(
        `/capsule-likes/${capsuleId}?initData=${encodeURIComponent(initData)}`
      ) as LikeApiResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to unlike capsule');
      }

      const status: CapsuleLikeStatus = {
        isLiked: false,
        likesCount: response.likesCount || 0
      };

      logger.info('Capsule unliked successfully', {
        capsuleId,
        likesCount: status.likesCount
      });

      // Обновляем капсулу в кэше
      this.updateCapsuleInCache(capsuleId, status);

      return status;

    } catch (error) {
      logger.error('Error unliking capsule', error);
      throw error;
    }
  }

  /**
   * Переключить лайк (toggle)
   */
  async toggleLike(capsuleId: number, currentlyLiked: boolean): Promise<CapsuleLikeStatus> {
    if (currentlyLiked) {
      return this.unlikeCapsule(capsuleId);
    } else {
      return this.likeCapsule(capsuleId);
    }
  }

  /**
   * Получить статус лайка для текущего пользователя
   */
  async getLikeStatus(capsuleId: number): Promise<CapsuleLikeStatus> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await api.get(
        `/capsule-likes/${capsuleId}/status?initData=${encodeURIComponent(initData)}`
      ) as LikeApiResponse;

      if (!response.success) {
        // Если ошибка - возвращаем состояние "не лайкнута"
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
      logger.error('Error getting capsule like status', error);
      return {
        isLiked: false,
        likesCount: 0
      };
    }
  }

  /**
   * Обновить капсулу в кэше (для синхронизации)
   */
  private updateCapsuleInCache(capsuleId: number, status: CapsuleLikeStatus): void {
    try {
      const capsules = dataCacheManager.getCapsules() as any[];
      const capsule = capsules.find(c => c.id === capsuleId);
      if (capsule) {
        capsule.isLiked = status.isLiked;
        capsule.likesCount = status.likesCount;
        logger.info('Capsule updated in cache', { capsuleId, ...status });
      }
    } catch (error) {
      logger.warn('Failed to update capsule in cache', error);
    }
  }
}

export const capsuleLikesService = new CapsuleLikesService();
