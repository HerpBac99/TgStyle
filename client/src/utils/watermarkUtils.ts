/**
 * Утилиты для добавления watermark на изображения
 */

import { logger } from '../modules/logger';

// Настройки watermark
const WATERMARK_TEXT = '@TgStyleBot';
const WATERMARK_FONT_SIZE = 24; // px
const WATERMARK_FONT = `bold ${WATERMARK_FONT_SIZE}px Manrope, sans-serif`;
const WATERMARK_COLOR = 'rgba(255, 255, 255, 0.8)';
const WATERMARK_STROKE_COLOR = 'rgba(0, 0, 0, 0.5)';
const WATERMARK_STROKE_WIDTH = 2;
const WATERMARK_PADDING = 10; // Отступ от краев

/**
 * Добавить watermark на изображение
 * 
 * @param base64Image - Base64 изображение (data:image/png;base64,...)
 * @returns Base64 изображение с watermark
 */
export async function addWatermark(base64Image: string): Promise<string> {
  try {
    logger.info('Adding watermark to image');

    // Создаем изображение
    const img = await loadImage(base64Image);

    // Создаем canvas с теми же размерами
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Рисуем изображение
    ctx.drawImage(img, 0, 0);

    // Настраиваем текст
    ctx.font = WATERMARK_FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    // Измеряем ширину текста
    const textMetrics = ctx.measureText(WATERMARK_TEXT);
    const textWidth = textMetrics.width;

    // Позиция текста (внизу справа с отступом)
    const x = canvas.width - WATERMARK_PADDING;
    const y = canvas.height - WATERMARK_PADDING;

    // Рисуем обводку текста (для контраста)
    ctx.strokeStyle = WATERMARK_STROKE_COLOR;
    ctx.lineWidth = WATERMARK_STROKE_WIDTH;
    ctx.strokeText(WATERMARK_TEXT, x, y);

    // Рисуем текст
    ctx.fillStyle = WATERMARK_COLOR;
    ctx.fillText(WATERMARK_TEXT, x, y);

    // Конвертируем в base64
    const result = canvas.toDataURL('image/png');

    logger.info('Watermark added successfully', {
      originalSize: { width: img.width, height: img.height },
      textWidth,
      position: { x, y }
    });

    return result;

  } catch (error) {
    logger.error('Error adding watermark', error);
    // В случае ошибки возвращаем оригинальное изображение
    return base64Image;
  }
}

/**
 * Загрузить изображение из base64
 * 
 * @param base64 - Base64 строка изображения
 * @returns Promise с загруженным HTMLImageElement
 */
function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve(img);
    };

    img.onerror = (error) => {
      reject(new Error('Failed to load image: ' + error));
    };

    img.src = base64;
  });
}


