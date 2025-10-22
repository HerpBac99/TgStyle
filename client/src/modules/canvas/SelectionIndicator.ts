/**
 * SelectionIndicator - визуальная индикация выбранного объекта на canvas
 * Заменяет стандартные контролы Fabric.js на современную анимированную подсветку
 * 
 * @deprecated ВРЕМЕННО НЕ ИСПОЛЬЗУЕТСЯ - возвращаемся к стандартным контролам
 * Сохранен для будущих улучшений (glow эффект по контуру работает хорошо)
 */

import { Canvas, FabricObject } from 'fabric';
import { logger } from '../logger';

/**
 * Конфигурация индикатора выбора
 */
export interface SelectionIndicatorConfig {
  canvas: Canvas;
  indicatorType: 'gradient' | 'outline';  // Тип индикации
  animationDuration: number;              // Длительность анимации (мс)
  gradientColors?: string[];              // Цвета градиента
  outlineColor?: string;                  // Цвет контура
  outlineWidth?: number;                  // Толщина контура
}

/**
 * Класс для визуальной индикации выбранного объекта
 */
export class SelectionIndicator {
  private canvas: Canvas | null;
  private config: SelectionIndicatorConfig;
  private indicatorElement: HTMLElement | null = null;
  private animationFrame: number | null = null;
  private currentObject: FabricObject | null = null;
  private isVisible: boolean = false;
  private objectModifiedHandler: ((e: any) => void) | null = null;
  private objectMovingHandler: ((e: any) => void) | null = null;
  private objectScalingHandler: ((e: any) => void) | null = null;
  private objectRotatingHandler: ((e: any) => void) | null = null;

  constructor(config: SelectionIndicatorConfig) {
    this.config = config;
    this.canvas = config.canvas;

    logger.info('SelectionIndicator created', {
      indicatorType: config.indicatorType,
      animationDuration: config.animationDuration,
      gradientColors: config.gradientColors,
      outlineColor: config.outlineColor
    });
  }

  /**
   * Показать индикатор для объекта
   * 
   * @param object - Fabric.js объект для индикации
   */
  show(object: FabricObject): void {
    try {
      if (!this.canvas) {
        throw new Error('Canvas is not initialized');
      }

      // Если уже показан для этого объекта, просто обновляем позицию
      if (this.currentObject === object && this.isVisible) {
        this.updatePosition(object);
        return;
      }

      // Скрываем предыдущий индикатор если был
      if (this.isVisible) {
        this.hide();
      }

      this.currentObject = object;
      this.isVisible = true;

      // Создаем индикатор в зависимости от типа
      if (this.config.indicatorType === 'gradient') {
        this.createGradientIndicator(object);
      } else {
        this.createOutlineIndicator(object);
      }

      // Подписываемся на события трансформации объекта
      this.subscribeToObjectEvents(object);

      logger.info('Selection indicator shown', {
        objectId: (object as any).id,
        indicatorType: this.config.indicatorType
      });

    } catch (error) {
      logger.error('Failed to show selection indicator', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Скрыть индикатор
   */
  hide(): void {
    try {
      if (!this.isVisible) {
        return;
      }

      // Отписываемся от событий объекта
      this.unsubscribeFromObjectEvents();

      // Останавливаем анимацию
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }

      // Убираем shadow с объекта
      if (this.currentObject) {
        (this.currentObject as any).set({
          shadow: null
        });

        // Перерисовываем canvas
        if (this.canvas) {
          this.canvas.renderAll();
        }
      }

      // Удаляем DOM элемент (если был создан)
      if (this.indicatorElement && this.indicatorElement.parentNode) {
        this.indicatorElement.parentNode.removeChild(this.indicatorElement);
        this.indicatorElement = null;
      }

      this.currentObject = null;
      this.isVisible = false;

      logger.info('Selection indicator hidden');

    } catch (error) {
      logger.error('Failed to hide selection indicator', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Обновить позицию индикатора для синхронизации с объектом
   * Для glow эффекта не требуется обновление позиции, так как shadow рисуется самим Fabric.js
   * 
   * @param _object - Fabric.js объект (не используется)
   */
  private updatePosition(_object: FabricObject): void {
    // Glow эффект автоматически следует за объектом
    // Просто перерисовываем canvas для обновления
    if (this.canvas) {
      this.canvas.renderAll();
    }
  }

  /**
   * Создать градиентный индикатор (glow эффект по контуру изображения)
   * 
   * @param object - Fabric.js объект
   */
  private createGradientIndicator(object: FabricObject): void {
    if (!this.canvas) {
      return;
    }

    // Применяем glow эффект напрямую к объекту через shadow
    // Это создаст подсветку по реальному контуру изображения, а не по прямоугольнику
    const colors = this.config.gradientColors || ['#667eea', '#764ba2', '#f093fb'];
    const primaryColor = colors[0];

    // Применяем shadow с анимированным цветом
    (object as any).set({
      shadow: {
        color: primaryColor,
        blur: 30,  // Увеличен blur для более заметной подсветки
        offsetX: 0,
        offsetY: 0
      }
    });

    // Сохраняем ссылку на объект для анимации
    this.currentObject = object;

    // Запускаем анимацию цвета shadow
    this.animateGlowColor();

    // Перерисовываем canvas
    this.canvas.renderAll();

    logger.debug('Glow indicator created', {
      objectId: (object as any).id,
      primaryColor,
      blur: 20
    });
  }

  /**
   * Создать контурный индикатор
   * 
   * @param _object - Fabric.js объект (не используется в текущей реализации)
   */
  private createOutlineIndicator(_object: FabricObject): void {
    // Реализация в следующей подзадаче
    logger.debug('Creating outline indicator (placeholder)');
  }

  /**
   * Подписаться на события трансформации объекта
   * 
   * @param object - Fabric.js объект
   */
  private subscribeToObjectEvents(object: FabricObject): void {
    if (!object) {
      return;
    }

    // Создаем обработчики событий
    this.objectModifiedHandler = () => {
      if (this.currentObject) {
        this.updatePosition(this.currentObject);
      }
    };

    this.objectMovingHandler = () => {
      if (this.currentObject) {
        this.updatePosition(this.currentObject);
      }
    };

    this.objectScalingHandler = () => {
      if (this.currentObject) {
        this.updatePosition(this.currentObject);
      }
    };

    this.objectRotatingHandler = () => {
      if (this.currentObject) {
        this.updatePosition(this.currentObject);
      }
    };

    // Подписываемся на события
    object.on('modified', this.objectModifiedHandler);
    object.on('moving', this.objectMovingHandler);
    object.on('scaling', this.objectScalingHandler);
    object.on('rotating', this.objectRotatingHandler);

    logger.debug('Subscribed to object transformation events');
  }

  /**
   * Отписаться от событий трансформации объекта
   */
  private unsubscribeFromObjectEvents(): void {
    if (!this.currentObject) {
      return;
    }

    // Отписываемся от событий
    if (this.objectModifiedHandler) {
      this.currentObject.off('modified', this.objectModifiedHandler);
      this.objectModifiedHandler = null;
    }

    if (this.objectMovingHandler) {
      this.currentObject.off('moving', this.objectMovingHandler);
      this.objectMovingHandler = null;
    }

    if (this.objectScalingHandler) {
      this.currentObject.off('scaling', this.objectScalingHandler);
      this.objectScalingHandler = null;
    }

    if (this.objectRotatingHandler) {
      this.currentObject.off('rotating', this.objectRotatingHandler);
      this.objectRotatingHandler = null;
    }

    logger.debug('Unsubscribed from object transformation events');
  }

  /**
   * Анимация цвета glow эффекта
   */
  private animateGlowColor(): void {
    if (!this.currentObject || !this.canvas) {
      return;
    }

    let startTime: number | null = null;
    const duration = this.config.animationDuration;
    const colors = this.config.gradientColors || ['#667eea', '#764ba2', '#f093fb'];

    const animate = (timestamp: number) => {
      if (!this.currentObject || !this.isVisible || !this.canvas) {
        return;
      }

      if (!startTime) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = (elapsed % duration) / duration;

      // Вычисляем индекс текущего цвета
      const colorIndex = Math.floor(progress * colors.length);
      const nextColorIndex = (colorIndex + 1) % colors.length;
      const colorProgress = (progress * colors.length) % 1;

      // Интерполируем между текущим и следующим цветом
      const currentColor = this.hexToRgb(colors[colorIndex] || '#667eea');
      const nextColor = this.hexToRgb(colors[nextColorIndex] || '#764ba2');

      const r = Math.round(currentColor.r + (nextColor.r - currentColor.r) * colorProgress);
      const g = Math.round(currentColor.g + (nextColor.g - currentColor.g) * colorProgress);
      const b = Math.round(currentColor.b + (nextColor.b - currentColor.b) * colorProgress);

      // Обновляем цвет shadow
      (this.currentObject as any).set({
        shadow: {
          color: `rgb(${r}, ${g}, ${b})`,
          blur: 150,  // Увеличен blur для более заметной подсветки
          offsetX: 0,
          offsetY: 0
        }
      });

      // Перерисовываем canvas
      this.canvas.renderAll();

      // Продолжаем анимацию
      this.animationFrame = requestAnimationFrame(animate);
    };

    // Запускаем анимацию
    this.animationFrame = requestAnimationFrame(animate);

    logger.debug('Glow color animation started', {
      duration,
      colors
    });
  }

  /**
   * Конвертировать HEX цвет в RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result && result[1] && result[2] && result[3]) {
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      };
    }
    // fallback цвет
    return { r: 102, g: 126, b: 234 };
  }

  /**
   * Уничтожить индикатор и очистить ресурсы
   */
  destroy(): void {
    logger.info('Destroying SelectionIndicator');

    // Скрываем индикатор (это также отпишет от событий и остановит анимации)
    this.hide();

    // Дополнительная проверка: убеждаемся что все обработчики очищены
    if (this.objectModifiedHandler || this.objectMovingHandler ||
      this.objectScalingHandler || this.objectRotatingHandler) {
      logger.warn('Event handlers were not properly cleaned up, forcing cleanup');
      this.unsubscribeFromObjectEvents();
    }

    // Убеждаемся что анимация остановлена
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Убеждаемся что DOM элемент удален
    if (this.indicatorElement && this.indicatorElement.parentNode) {
      this.indicatorElement.parentNode.removeChild(this.indicatorElement);
      this.indicatorElement = null;
    }

    // Очищаем ссылки
    this.canvas = null;
    this.currentObject = null;

    logger.info('SelectionIndicator destroyed successfully');
  }
}
