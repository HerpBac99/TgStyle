/**
 * UI компонент публичной ленты капсул
 * Отображает Instagram-style grid с чередующимися большими элементами
 */

import { logger } from '../logger';
import { capsuleLikesService } from '../capsules/CapsuleLikesService';
import type { PublicCapsule } from '@/types/publicFeed';

export interface UIPublicFeedCallbacks {
  onView: (capsule: PublicCapsule) => void;
  onLoadMore: () => Promise<void>;
}

export class UIPublicFeed {
  private container: HTMLElement;
  private gridContainer: HTMLElement | null = null;
  private loadingIndicator: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private callbacks: UIPublicFeedCallbacks;
  private capsules: PublicCapsule[] = [];

  constructor(callbacks: UIPublicFeedCallbacks) {
    this.callbacks = callbacks;

    // Находим контейнер ленты
    this.container = document.getElementById('feed-content') as HTMLElement;
    if (!this.container) {
      throw new Error('Feed container not found');
    }

    this.initializeDOM();
  }

  /**
   * Инициализация DOM структуры
   */
  private initializeDOM(): void {
    this.container.innerHTML = '';

    // Хедер
    const header = document.createElement('div');
    header.className = 'feed-header';
    header.innerHTML = `<h2>Лента образов</h2>`;
    this.container.appendChild(header);

    // Grid контейнер
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'feed-grid';
    this.container.appendChild(this.gridContainer);

    // Loading indicator
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.className = 'feed-loading';
    this.loadingIndicator.innerHTML = `
      <div class="feed-loading-spinner"></div>
      <p>Загрузка...</p>
    `;
    this.container.appendChild(this.loadingIndicator);
    this.loadingIndicator.style.display = 'none';
  }

  /**
   * Рендер ленты капсул
   */
  render(capsules: PublicCapsule[], append: boolean = false): void {
    if (!this.gridContainer) return;

    if (!append) {
      this.capsules = [];
      this.gridContainer.innerHTML = '';
    }

    this.capsules.push(...capsules);

    capsules.forEach((capsule, index) => {
      const card = this.createCapsuleCard(capsule, this.capsules.length - capsules.length + index);
      this.gridContainer!.appendChild(card);
    });

    // Устанавливаем observer на последний элемент для infinite scroll
    this.setupInfiniteScroll();

    logger.info('Feed rendered', {
      capsulesCount: this.capsules.length,
      appended: append
    });
  }

  /**
   * Создать карточку капсулы
   */
  private createCapsuleCard(capsule: PublicCapsule, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'feed-item';
    card.dataset['capsuleId'] = String(capsule.id);

    // Определяем большие элементы по паттерну Instagram
    // Каждые 10 элементов - 2 паттерна по 5 элементов (2 строки каждый)
    // Паттерн A (0-4): большой элемент 0 слева
    // Паттерн B (5-9): большой элемент 5 справа
    const positionInPattern = index % 10;
    if (positionInPattern === 0) {
      // Большой элемент слева
      card.classList.add('feed-item-large', 'feed-item-large-left');
    } else if (positionInPattern === 5) {
      // Большой элемент справа
      card.classList.add('feed-item-large', 'feed-item-large-right');
    }

    // Создаем изображение
    const imageDiv = document.createElement('div');
    imageDiv.className = 'feed-item-image';
    if (capsule.thumbnailUrl) {
      const img = document.createElement('img');
      img.src = capsule.thumbnailUrl;
      img.alt = capsule.name;
      img.loading = 'lazy';
      imageDiv.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'feed-item-placeholder';
      placeholder.textContent = 'Нет изображения';
      imageDiv.appendChild(placeholder);
    }
    card.appendChild(imageDiv);

    // Создаем overlay
    const overlay = document.createElement('div');
    overlay.className = 'feed-item-overlay';

    // Автор
    const author = document.createElement('div');
    author.className = 'feed-item-author';
    author.textContent = `${capsule.author.firstName} ${capsule.author.lastName || ''}`;
    overlay.appendChild(author);

    // Статистика (контейнер для лайков)
    const stats = document.createElement('div');
    stats.className = 'feed-item-stats';
    overlay.appendChild(stats);

    card.appendChild(overlay);

    // Используем универсальный компонент лайков
    capsuleLikesService.createLikeComponent(
      stats,
      capsule.id,
      {
        isLiked: capsule.isLiked,
        likesCount: capsule.likesCount
      },
      'feed' // componentClass для специфичных стилей
    );

    // Обработчик клика на карточку
    card.addEventListener('click', (e) => {
      // Игнорируем клик на кнопку лайка
      if ((e.target as HTMLElement).closest('.like-btn')) {
        return;
      }
      this.callbacks.onView(capsule);
    });

    return card;
  }

  /**
   * Обновить UI лайка (если нужно синхронизировать извне)
   * Метод оставлен для обратной совместимости, но компонент лайков сам управляет своим UI
   */
  updateLikeUI(capsuleId: number, isLiked: boolean, likesCount?: number): void {
    if (!this.gridContainer) return;
    
    const card = this.gridContainer.querySelector(`[data-capsule-id="${capsuleId}"]`);
    if (!card) return;

    // Ищем кнопку лайка (универсальный компонент)
    const likeBtn = card.querySelector('.like-btn') as HTMLElement;
    if (!likeBtn) return;

    const likeCountEl = card.querySelector('.like-count') as HTMLElement;
    if (!likeCountEl) return;

    // Обновляем состояние
    if (isLiked) {
      likeBtn.classList.add('liked');
    } else {
      likeBtn.classList.remove('liked');
    }

    if (likesCount !== undefined) {
      likeCountEl.textContent = String(likesCount);
    }

    // Обновляем в массиве
    const capsule = this.capsules.find(c => c.id === capsuleId);
    if (capsule) {
      capsule.isLiked = isLiked;
      if (likesCount !== undefined) {
        capsule.likesCount = likesCount;
      }
    }
  }

  /**
   * Настройка infinite scroll через Intersection Observer
   */
  private setupInfiniteScroll(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    if (!this.gridContainer) return;
    
    const lastItem = this.gridContainer.lastElementChild as HTMLElement;
    if (!lastItem) return;

    this.observer = new IntersectionObserver(
      async (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          logger.info('Reached end of feed, loading more...');
          await this.callbacks.onLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    this.observer.observe(lastItem);
  }

  /**
   * Показать/скрыть loading индикатор
   */
  showLoading(show: boolean): void {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Показать контейнер
   */
  show(): void {
    this.container.style.display = 'flex';
    logger.info('Feed shown');
  }

  /**
   * Скрыть контейнер
   */
  hide(): void {
    this.container.style.display = 'none';
    logger.info('Feed hidden');
  }

  /**
   * Очистка
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.capsules = [];
    if (this.gridContainer) {
      this.gridContainer.innerHTML = '';
    }
    logger.info('Feed destroyed');
  }
}
