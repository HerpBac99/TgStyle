/**
 * Сервис для работы с лайками капсул
 */

import { logger } from '../logger';
import { api } from '../api';
import { createElement } from '@/utils/helpers';

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
   * @param componentClass - Класс для специфичных стилей.
   */
  public createLikeComponent(
    parentElement: HTMLElement,
    capsuleId: number,
    initialData: CapsuleLikeStatus,
    componentClass: string = ''
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

    // Начальная отрисовка
    let currentState = { ...initialData };
    this.updateLikeButton(likeBtn, likesCountEl, currentState);

    // Добавление в DOM
    parentElement.appendChild(container);

    // Обработчик клика
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      try {
        logger.info('Capsule like button clicked', { capsuleId, currentState });
        
        // Оптимистичное обновление UI
        const newState = {
          isLiked: !currentState.isLiked,
          likesCount: currentState.isLiked 
            ? Math.max(0, currentState.likesCount - 1)
            : currentState.likesCount + 1
        };

        // Мгновенно обновляем UI
        this.updateLikeButton(likeBtn, likesCountEl, newState);
        currentState = newState;

        // Отправляем запрос на сервер
        const response = await this.toggleLike(capsuleId, newState.isLiked);

        if (response.success && typeof response.isLiked === 'boolean' && typeof response.likesCount === 'number') {
          // Синхронизируем с ответом сервера
          const serverState = {
            isLiked: response.isLiked,
            likesCount: response.likesCount
          };

          if (serverState.isLiked !== currentState.isLiked || serverState.likesCount !== currentState.likesCount) {
            logger.info('Syncing capsule like state with server', { 
              client: currentState, 
              server: serverState 
            });
            this.updateLikeButton(likeBtn, likesCountEl, serverState);
            currentState = serverState;
          }
        } else {
          logger.warn('Invalid server response for capsule like', response);
          // Откатываем изменения при ошибке
          const revertedState = {
            isLiked: !newState.isLiked,
            likesCount: newState.isLiked 
              ? Math.max(0, newState.likesCount - 1)
              : newState.likesCount + 1
          };
          this.updateLikeButton(likeBtn, likesCountEl, revertedState);
          currentState = revertedState;
        }
      } catch (error) {
        logger.error('Error toggling capsule like', { capsuleId, error });
        
        // Откатываем изменения при ошибке
        const revertedState = {
          isLiked: !currentState.isLiked,
          likesCount: currentState.isLiked 
            ? Math.max(0, currentState.likesCount - 1)
            : currentState.likesCount + 1
        };
        this.updateLikeButton(likeBtn, likesCountEl, revertedState);
        currentState = revertedState;
      }
    });

    logger.info('Capsule like component created', { 
      capsuleId, 
      initialState: initialData,
      componentClass 
    });
  }

  /**
   * Обновляет визуальное состояние кнопки лайка
   */
  private updateLikeButton(
    likeBtn: HTMLElement, 
    likesCountEl: HTMLElement, 
    state: CapsuleLikeStatus
  ): void {
    // Обновляем стили кнопки
    if (state.isLiked) {
      likeBtn.classList.add('liked');
      likeBtn.setAttribute('aria-label', 'Убрать лайк');
    } else {
      likeBtn.classList.remove('liked');
      likeBtn.setAttribute('aria-label', 'Поставить лайк');
    }

    // Обновляем счетчик
    likesCountEl.textContent = String(state.likesCount);

    // Добавляем анимацию при изменении
    likeBtn.classList.add('like-animation');
    setTimeout(() => {
      likeBtn.classList.remove('like-animation');
    }, 300);
  }

  /**
   * Переключает лайк капсулы на сервере
   */
  public async toggleLike(capsuleId: number, isLiked: boolean): Promise<LikeApiResponse> {
    try {
      let response: LikeApiResponse;
      
      // Получаем initData для аутентификации
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      
      if (isLiked) {
        // Ставим лайк
        response = await api.post(`/capsule-likes/${capsuleId}`, {
          initData: initData
        }) as LikeApiResponse;
      } else {
        // Убираем лайк
        response = await api.delete(`/capsule-likes/${capsuleId}?initData=${encodeURIComponent(initData)}`) as LikeApiResponse;
      }

      logger.info('Capsule like API response', { 
        capsuleId, 
        isLiked, 
        response 
      });

      return response;
    } catch (error) {
      logger.error('Capsule like API error', { capsuleId, isLiked, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Получает текущий статус лайка капсулы
   */
  public async getLikeStatus(capsuleId: number): Promise<CapsuleLikeStatus | null> {
    try {
      const response = await api.get(`/capsule-likes/status/${capsuleId}`) as LikeApiResponse;

      if (response.success && typeof response.isLiked === 'boolean' && typeof response.likesCount === 'number') {
        return {
          isLiked: response.isLiked,
          likesCount: response.likesCount
        };
      }

      logger.warn('Invalid capsule like status response', response);
      return null;
    } catch (error) {
      logger.error('Error getting capsule like status', { capsuleId, error });
      return null;
    }
  }
}

// Экспортируем синглтон
export const capsuleLikesService = new CapsuleLikesService();