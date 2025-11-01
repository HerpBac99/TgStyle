/**
 * Сервис для рендеринга изображений для sharing
 * Template-based подход для flexibility
 */

import { logger } from '../logger';

/**
 * Тип элемента для рендеринга
 */
export type RenderElementType = 'image' | 'text' | 'watermark';

/**
 * Стили для текста
 */
export interface TextStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: CanvasTextAlign;
  maxWidth?: number;
  lineHeight?: number;
}

/**
 * Элемент для рендеринга
 */
export interface RenderElement {
  type: RenderElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  style?: TextStyle;
}

/**
 * Шаблон для рендеринга
 */
export interface RenderTemplate {
  width: number;
  height: number;
  backgroundColor: string;
  elements: RenderElement[];
}

/**
 * Сервис для рендеринга изображений
 */
export class ImageRenderService {
  /**
   * Рендерит изображение по шаблону
   */
  async render(template: RenderTemplate): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = template.width;
      canvas.height = template.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get 2D context');
      }

      // Рисуем фон
      ctx.fillStyle = template.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Рендерим элементы
      for (const element of template.elements) {
        await this.renderElement(ctx, element);
      }

      // Конвертируем в base64
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

      logger.info('Image rendered successfully', {
        width: template.width,
        height: template.height,
        elementsCount: template.elements.length
      });

      return dataUrl;

    } catch (error) {
      logger.error('Failed to render image', error);
      throw error;
    }
  }

  /**
   * Рендерит один элемент
   */
  private async renderElement(ctx: CanvasRenderingContext2D, element: RenderElement): Promise<void> {
    switch (element.type) {
      case 'image':
        await this.renderImage(ctx, element);
        break;
      case 'text':
        this.renderText(ctx, element);
        break;
      case 'watermark':
        this.renderWatermark(ctx, element);
        break;
    }
  }

  /**
   * Рендерит изображение
   */
  private async renderImage(ctx: CanvasRenderingContext2D, element: RenderElement): Promise<void> {
    if (!element.content || !element.width || !element.height) {
      logger.error('Image element missing required properties');
      return;
    }

    const imageContent = element.content; // Store in variable for type safety

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Рисуем изображение
          ctx.save();
          
          // Добавляем тень для глубины
          ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;

          // Рисуем белую подложку под изображением
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(element.x - 5, element.y - 5, element.width! + 10, element.height! + 10);

          // Рисуем само изображение
          ctx.drawImage(img, element.x, element.y, element.width!, element.height!);
          
          ctx.restore();
          resolve();
        } catch (error) {
          logger.error('Error drawing image', error);
          reject(error);
        }
      };

      img.onerror = () => {
        logger.error('Failed to load image for rendering');
        reject(new Error('Failed to load image'));
      };

      img.src = imageContent;
    });
  }

  /**
   * Рендерит текст
   */
  private renderText(ctx: CanvasRenderingContext2D, element: RenderElement): void {
    if (!element.content) {
      logger.error('Text element has no content');
      return;
    }

    const style = element.style || {};
    const fontSize = style.fontSize || 18;
    const fontWeight = style.fontWeight || 'normal';
    const fontFamily = style.fontFamily || 'Arial, sans-serif';
    const color = style.color || '#000000';
    const textAlign = style.textAlign || 'left';
    const maxWidth = style.maxWidth;
    const lineHeight = style.lineHeight || fontSize * 1.5;

    ctx.save();

    // Устанавливаем стили
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'top';

    if (maxWidth) {
      // Текст с переносами
      this.wrapText(ctx, element.content, element.x, element.y, maxWidth, lineHeight);
    } else {
      // Одна строка
      ctx.fillText(element.content, element.x, element.y);
    }

    ctx.restore();
  }

  /**
   * Рендерит watermark
   */
  private renderWatermark(ctx: CanvasRenderingContext2D, element: RenderElement): void {
    if (!element.content) {
      logger.warn('Watermark element has no content');
      return;
    }

    ctx.save();

    // Полупрозрачный текст
    ctx.globalAlpha = 0.5;
    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(element.content, element.x, element.y);

    ctx.restore();
  }

  /**
   * Переносит текст на новые строки
   */
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && i > 0) {
        ctx.fillText(line, x, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }

    ctx.fillText(line, x, currentY);
  }

  /**
   * Шаблон для анализа
   */
  getAnalysisTemplate(photo: string, analysisText: string): RenderTemplate {
    return {
      width: 800,
      height: 1200,
      backgroundColor: '#f8f9fa',
      elements: [
        // Заголовок
        {
          type: 'text',
          x: 400,
          y: 30,
          content: '🤖 AI Анализ Стиля',
          style: {
            fontSize: 32,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#1a1a1a'
          }
        },
        // Фото
        {
          type: 'image',
          x: 50,
          y: 90,
          width: 700,
          height: 500,
          content: photo
        },
        // Текст анализа (только первые 400 символов)
        {
          type: 'text',
          x: 50,
          y: 620,
          content: this.truncateText(analysisText, 400),
          style: {
            fontSize: 16,
            color: '#333333',
            maxWidth: 700,
            lineHeight: 24
          }
        },
        // Watermark
        {
          type: 'watermark',
          x: 400,
          y: 1160,
          content: '✨ Создано в TgStyle'
        }
      ]
    };
  }

  /**
   * Шаблон для капсулы (динамический - подстраивается под размер изображения)
   */
  getCapsuleTemplate(canvasImage: string, capsuleName: string): RenderTemplate {
    // Получаем размеры изображения из data URL
    const img = new Image();
    img.src = canvasImage;
    
    // Используем реальные размеры изображения или дефолтные
    const imageWidth = img.naturalWidth || 600;
    const imageHeight = img.naturalHeight || 800;
    
    // Рассчитываем размеры контейнера с отступами
    const padding = 50;
    const headerHeight = 100;
    const footerHeight = 60;
    
    const templateWidth = imageWidth + (padding * 2);
    const templateHeight = imageHeight + headerHeight + footerHeight;

    logger.info('Creating capsule template', {
      imageWidth,
      imageHeight,
      templateWidth,
      templateHeight
    });

    return {
      width: templateWidth,
      height: templateHeight,
      backgroundColor: '#f8f9fa',
      elements: [
        // Заголовок
        {
          type: 'text',
          x: templateWidth / 2,
          y: 30,
          content: capsuleName || '👔 Моя капсула',
          style: {
            fontSize: 36,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#1a1a1a'
          }
        },
        // Canvas изображение (с оригинальными пропорциями!)
        {
          type: 'image',
          x: padding,
          y: headerHeight,
          width: imageWidth,
          height: imageHeight,
          content: canvasImage
        },
        // Watermark
        {
          type: 'watermark',
          x: templateWidth / 2,
          y: templateHeight - 30,
          content: '✨ Создано в TgStyle'
        }
      ]
    };
  }

  /**
   * Обрезать текст до указанной длины
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Обрезаем по словам
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }
}

// Экспортируем синглтон
export const imageRenderService = new ImageRenderService();
