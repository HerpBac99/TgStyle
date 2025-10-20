/**
 * Менеджер публичной ленты капсул
 * Координирует UI, сервисы и обработку данных
 */

import { logger } from '../logger';
import { publicFeedService } from './PublicFeedService';
import { UIPublicFeed } from './UIPublicFeed';
import type { PublicCapsule } from '@/types/publicFeed';

export class PublicFeedManager {
  private uiFeed: UIPublicFeed | null = null;
  private currentPage: number = 1;
  private hasMore: boolean = true;
  private isLoading: boolean = false;

  constructor() {
    logger.info('PublicFeedManager initialized');
  }

  /**
   * Открыть ленту
   */
  async open(): Promise<void> {
    try {
      logger.info('Opening public feed');

      // Инициализируем UI компонент
      if (!this.uiFeed) {
        this.uiFeed = new UIPublicFeed({
          onView: (capsule) => this.handleViewCapsule(capsule),
          onLoadMore: () => this.loadMore()
        });
      }

      // Показываем контейнер
      this.uiFeed.show();

      // Загружаем первую страницу
      if (this.currentPage === 1) {
        await this.loadInitialPage();
      }

    } catch (error) {
      logger.error('Error opening public feed', error);
      alert('Не удалось загрузить ленту');
    }
  }

  /**
   * Закрыть ленту
   */
  close(): void {
    logger.info('Closing public feed');

    if (this.uiFeed) {
      this.uiFeed.hide();
    }
  }

  /**
   * Загрузить первую страницу
   */
  private async loadInitialPage(): Promise<void> {
    if (this.isLoading) return;

    try {
      this.isLoading = true;
      if (this.uiFeed) {
        this.uiFeed.showLoading(true);
      }

      this.currentPage = 1;
      const response = await publicFeedService.loadPublicCapsules(this.currentPage);

      this.hasMore = response.pagination.hasMore;

      if (this.uiFeed) {
        this.uiFeed.render(response.capsules, false);
        this.uiFeed.showLoading(false);
      }

      logger.info('Initial feed page loaded', {
        capsulesCount: response.capsules.length,
        hasMore: this.hasMore
      });

    } catch (error) {
      logger.error('Error loading initial feed page', error);
      if (this.uiFeed) {
        this.uiFeed.showLoading(false);
      }
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Загрузить следующую страницу (infinite scroll)
   */
  private async loadMore(): Promise<void> {
    if (this.isLoading || !this.hasMore) {
      logger.info('Skipping loadMore', { isLoading: this.isLoading, hasMore: this.hasMore });
      return;
    }

    try {
      this.isLoading = true;
      if (this.uiFeed) {
        this.uiFeed.showLoading(true);
      }

      this.currentPage++;
      const response = await publicFeedService.loadPublicCapsules(this.currentPage);

      this.hasMore = response.pagination.hasMore;

      if (this.uiFeed) {
        this.uiFeed.render(response.capsules, true);
        this.uiFeed.showLoading(false);
      }

      logger.info('Next feed page loaded', {
        page: this.currentPage,
        capsulesCount: response.capsules.length,
        hasMore: this.hasMore
      });

    } catch (error) {
      logger.error('Error loading more capsules', error);
      this.currentPage--; // Откатываем страницу при ошибке
      if (this.uiFeed) {
        this.uiFeed.showLoading(false);
      }
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Обработка просмотра капсулы
   */
  private handleViewCapsule(capsule: PublicCapsule): void {
    logger.info('Viewing capsule from feed', { 
      capsuleId: capsule.id,
      capsuleName: capsule.name,
      hasThumbnail: !!capsule.thumbnailUrl
    });

    // Проверяем наличие изображения
    if (!capsule.thumbnailUrl) {
      logger.warn('No thumbnail for capsule', { capsuleId: capsule.id });
      alert('У этой капсулы нет изображения');
      return;
    }

    // Строим полный URL изображения (thumbnailUrl уже содержит относительный путь от корня сервера)
    const baseUrl = 'https://tgstyle.flappy.crazedns.ru';
    const fullImageUrl = baseUrl + capsule.thumbnailUrl;

    logger.info('Opening capsule preview', { imageUrl: fullImageUrl });

    // Импортируем и используем uiModalManager для показа превью
    import('../uiModalManager').then(({ uiModalManager }) => {
      uiModalManager.showCapsulePreview(fullImageUrl, () => {
        logger.info('Capsule preview closed from feed');
      });
    }).catch(error => {
      logger.error('Failed to load uiModalManager', {
        error: error instanceof Error ? error.message : String(error)
      });
      alert('Не удалось открыть предпросмотр');
    });
  }

  /**
   * Обновить ленту (refresh)
   */
  async refresh(): Promise<void> {
    logger.info('Refreshing feed');

    this.currentPage = 1;
    this.hasMore = true;

    await this.loadInitialPage();
  }

  /**
   * Получить статус
   */
  getStatus() {
    return {
      currentPage: this.currentPage,
      hasMore: this.hasMore,
      isLoading: this.isLoading,
      isOpen: this.uiFeed !== null
    };
  }

  /**
   * Очистка
   */
  destroy(): void {
    logger.info('Destroying PublicFeedManager');

    if (this.uiFeed) {
      this.uiFeed.destroy();
      this.uiFeed = null;
    }

    this.currentPage = 1;
    this.hasMore = true;
    this.isLoading = false;
  }
}

// Экспортируем singleton
export const publicFeedManager = new PublicFeedManager();
