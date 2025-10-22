/**
 * Менеджер публичной ленты капсул
 * Координирует UI, сервисы и обработку данных
 */

import { logger } from '../logger';
import { publicFeedService } from './PublicFeedService';
import { UIPublicFeed } from './UIPublicFeed';
import { uiModalManager } from '../uiModalManager';
import type { PublicCapsule } from '@/types/publicFeed';
import { BASE_URL } from '@/utils/constants';

export class PublicFeedManager {
  private uiFeed: UIPublicFeed | null = null;
  private currentPage: number = 1;
  private hasMore: boolean = true;
  private isLoading: boolean = false;
  private cacheKey: string = 'publicFeed_cache';
  private cacheExpiry: number = 5 * 60 * 1000; // 5 минут

  constructor() {
    logger.info('PublicFeedManager initialized');
  }

  /**
   * Загрузить публичную ленту из кэша
   */
  private loadFromCache(): PublicCapsule[] | null {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const now = Date.now();
      
      if (now - data.timestamp > this.cacheExpiry) {
        // Кэш устарел
        localStorage.removeItem(this.cacheKey);
        return null;
      }

      logger.info('Loaded public feed from cache', { 
        count: data.capsules.length,
        age: Math.round((now - data.timestamp) / 1000) + 's'
      });
      
      return data.capsules;
    } catch (error) {
      logger.error('Error loading feed from cache', error);
      return null;
    }
  }

  /**
   * Сохранить публичную ленту в кэш
   */
  private saveToCache(capsules: PublicCapsule[]): void {
    try {
      const data = {
        capsules,
        timestamp: Date.now()
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
      logger.info('Saved public feed to cache', { count: capsules.length });
    } catch (error) {
      logger.error('Error saving feed to cache', error);
    }
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
   * Загрузить первую страницу (с кэшированием)
   */
  private async loadInitialPage(): Promise<void> {
    if (this.isLoading) return;

    try {
      this.isLoading = true;

      // Сначала показываем из кэша (instant UI)
      const cachedCapsules = this.loadFromCache();
      if (cachedCapsules && cachedCapsules.length > 0) {
        if (this.uiFeed) {
          this.uiFeed.render(cachedCapsules, false);
          logger.info('Rendered feed from cache instantly');
        }
      } else if (this.uiFeed) {
        this.uiFeed.showLoading(true);
      }

      // Затем грузим свежие данные с сервера
      this.currentPage = 1;
      const response = await publicFeedService.loadPublicCapsules(this.currentPage);

      this.hasMore = response.pagination.hasMore;

      // Сохраняем в кэш
      this.saveToCache(response.capsules);

      if (this.uiFeed) {
        this.uiFeed.render(response.capsules, false);
        this.uiFeed.showLoading(false);
      }

      logger.info('Initial feed page loaded from server', {
        capsulesCount: response.capsules.length,
        hasMore: this.hasMore
      });

    } catch (error) {
      logger.error('Error loading initial feed page', error);
      if (this.uiFeed) {
        this.uiFeed.showLoading(false);
      }
      // Если есть кэш, не показываем ошибку - пользователь уже видит данные
      if (!this.loadFromCache()) {
        throw error;
      }
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
    const fullImageUrl = BASE_URL + capsule.thumbnailUrl;

    logger.info('Opening capsule preview', { imageUrl: fullImageUrl });

    // Используем uiModalManager для показа превью
    uiModalManager.showCapsulePreview(fullImageUrl, () => {
      logger.info('Capsule preview closed from feed');
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
