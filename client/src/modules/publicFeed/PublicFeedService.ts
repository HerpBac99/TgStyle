/**
 * Сервис для работы с публичной лентой капсул
 */

import { api } from '../api';
import { logger } from '../logger';
import { capsuleLikesService } from '../capsules/CapsuleLikesService';
import type { PublicFeedResponse } from '@/types/publicFeed';

export class PublicFeedService {
  /**
   * Загрузить публичные капсулы
   */
  async loadPublicCapsules(page: number = 1, limit: number = 20): Promise<PublicFeedResponse> {
    try {
      logger.info('Loading public capsules', { page, limit });

      const response = await api.get(
        `/capsules/public?page=${page}&limit=${limit}`
      ) as PublicFeedResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to load public capsules');
      }

      logger.info('Public capsules loaded', {
        count: response.capsules.length,
        page: response.pagination.page,
        hasMore: response.pagination.hasMore
      });

      return response;

    } catch (error) {
      logger.error('Error loading public capsules', error);
      throw error;
    }
  }

  /**
   * Переключить лайк на капсуле
   */
  async toggleLike(capsuleId: number, currentlyLiked: boolean): Promise<{isLiked: boolean; likesCount: number}> {
    try {
      logger.info('Toggling like on public capsule', { capsuleId, currentlyLiked });

      const result = await capsuleLikesService.toggleLike(capsuleId, currentlyLiked);

      if (!result.success || typeof result.isLiked !== 'boolean' || typeof result.likesCount !== 'number') {
        throw new Error('Invalid API response');
      }

      logger.info('Like toggled on public capsule', {
        capsuleId,
        isLiked: result.isLiked,
        likesCount: result.likesCount
      });

      return {
        isLiked: result.isLiked,
        likesCount: result.likesCount
      };

    } catch (error) {
      logger.error('Error toggling like on public capsule', error);
      throw error;
    }
  }
}

export const publicFeedService = new PublicFeedService();
