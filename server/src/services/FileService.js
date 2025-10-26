/**
 * Сервис для работы с файлами изображений
 * Унифицированная обработка изображений для гардероба и капсул
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { logger } = require('../controllers/logsController');

/**
 * Базовая папка для загрузок
 */
const UPLOADS_BASE_DIR = path.join(__dirname, '..', '..', 'uploads');

/**
 * Конфигурация для разных типов изображений
 */
const IMAGE_CONFIGS = {
  wardrobe: {
    dir: 'wardrobe',
    maxSize: 1200,
    jpegQuality: 85,
    pngQuality: 90,
    pngCompressionLevel: 9,
    prefix: 'item'
  },
  capsule: {
    dir: 'capsules',
    maxSize: 800,
    jpegQuality: 80,
    pngQuality: 90,
    pngCompressionLevel: 9,
    prefix: 'capsule'
  }
};

class FileService {
  /**
   * Конвертировать base64 в Buffer и определить расширение
   * @param {string} dataString - Base64 строка с data URL
   * @returns {Object} - { buffer, extension }
   */
  static parseBase64Image(dataString) {
    const matches = dataString.match(/^data:image\/([a-z]+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 image format');
    }

    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    return { buffer, extension };
  }

  /**
   * Сохранить изображение на диск с оптимизацией
   * @param {string|number} telegramId - ID пользователя Telegram
   * @param {string} imageBase64 - Base64 изображение
   * @param {string} type - Тип изображения ('wardrobe' или 'capsule')
   * @returns {string} - Имя файла (для капсул) или относительный путь (для гардероба)
   */
  static async saveImage(telegramId, imageBase64, type = 'wardrobe') {
    try {
      const config = IMAGE_CONFIGS[type];
      if (!config) {
        throw new Error(`Unknown image type: ${type}`);
      }

      // Создаем папку для пользователя если её нет
      const userDir = path.join(UPLOADS_BASE_DIR, config.dir, telegramId.toString());
      await fs.mkdir(userDir, { recursive: true });

      // Парсим base64
      const { buffer } = this.parseBase64Image(imageBase64);

      // Проверяем наличие альфа-канала (прозрачности)
      const metadata = await sharp(buffer).metadata();
      const hasAlpha = metadata.hasAlpha || metadata.channels === 4;

      let optimizedBuffer;
      let extension;

      if (hasAlpha) {
        // Для изображений с прозрачностью используем PNG
        optimizedBuffer = await sharp(buffer)
          .rotate() // Применяет EXIF orientation автоматически
          .resize(config.maxSize, config.maxSize, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .png({
            quality: config.pngQuality,
            compressionLevel: config.pngCompressionLevel
          })
          .toBuffer();
        extension = 'png';
      } else {
        // Для обычных изображений используем JPEG
        optimizedBuffer = await sharp(buffer)
          .rotate() // Применяет EXIF orientation автоматически
          .resize(config.maxSize, config.maxSize, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({
            quality: config.jpegQuality,
            progressive: true
          })
          .toBuffer();
        extension = 'jpg';
      }

      // Генерируем уникальное имя файла
      let filename;
      if (type === 'capsule') {
        // Для капсул используем timestamp
        const timestamp = Date.now();
        filename = `${config.prefix}_${telegramId}_${timestamp}.${extension}`;
      } else {
        // Для гардероба используем случайную строку
        const randomString = Math.random().toString(36).substring(2, 10);
        filename = `${config.prefix}_${telegramId}_${randomString}.${extension}`;
      }

      const filePath = path.join(userDir, filename);

      // Сохраняем оптимизированный файл
      await fs.writeFile(filePath, optimizedBuffer);

      logger.info(`${type} image saved`, {
        telegramId: telegramId.toString(),
        filename,
        hasAlpha,
        format: extension,
        originalSizeKB: Math.round(buffer.length / 1024),
        optimizedSizeKB: Math.round(optimizedBuffer.length / 1024),
        compressionRatio: ((1 - optimizedBuffer.length / buffer.length) * 100).toFixed(1) + '%'
      });

      // Возвращаем результат в зависимости от типа
      if (type === 'capsule') {
        return filename; // Для капсул возвращаем только имя файла
      } else {
        // Для гардероба возвращаем относительный путь
        return path.join(config.dir, telegramId.toString(), filename);
      }

    } catch (error) {
      logger.error(`Error saving ${type} image`, {
        telegramId: telegramId.toString(),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Удалить изображение с диска
   * @param {string|number} telegramId - ID пользователя Telegram
   * @param {string} filename - Имя файла или относительный путь
   * @param {string} type - Тип изображения ('wardrobe' или 'capsule')
   */
  static async deleteImage(telegramId, filename, type = 'wardrobe') {
    if (!filename) return;

    try {
      const config = IMAGE_CONFIGS[type];
      if (!config) {
        throw new Error(`Unknown image type: ${type}`);
      }

      let filePath;
      if (type === 'capsule') {
        // Для капсул строим путь из telegramId и filename
        const userDir = path.join(UPLOADS_BASE_DIR, config.dir, telegramId.toString());
        filePath = path.join(userDir, filename);
      } else {
        // Для гардероба filename уже содержит относительный путь
        filePath = path.join(UPLOADS_BASE_DIR, filename);
      }

      // Проверяем существует ли файл
      try {
        await fs.access(filePath);
        // Файл существует - удаляем
        await fs.unlink(filePath);
        logger.info(`${type} image deleted`, {
          telegramId: telegramId.toString(),
          filename
        });
      } catch (err) {
        // Файл не существует - ничего не делаем
        if (err.code !== 'ENOENT') {
          throw err;
        }
        logger.warn(`${type} image not found for deletion`, {
          telegramId: telegramId.toString(),
          filename
        });
      }
    } catch (error) {
      logger.error(`Error deleting ${type} image`, {
        telegramId: telegramId.toString(),
        filename,
        error: error.message
      });
      // Не бросаем ошибку, чтобы не прерывать основную операцию
    }
  }

  /**
   * Сохранить thumbnail изображение капсулы (legacy метод для совместимости)
   * @param {string|number} telegramId - ID пользователя Telegram
   * @param {string} thumbnailImage - Base64 изображение
   * @returns {string} - Имя файла
   */
  static async saveCapsuleThumbnail(telegramId, thumbnailImage) {
    return this.saveImage(telegramId, thumbnailImage, 'capsule');
  }

  /**
   * Удалить старый файл миниатюры капсулы (legacy метод для совместимости)
   * @param {string|number} telegramId - ID пользователя Telegram
   * @param {string} oldFilename - Имя старого файла
   */
  static async deleteOldCapsuleThumbnail(telegramId, oldFilename) {
    return this.deleteImage(telegramId, oldFilename, 'capsule');
  }

  /**
   * Сохранить изображение гардероба (новый метод)
   * @param {string|number} telegramId - ID пользователя Telegram
   * @param {string} imageBase64 - Base64 изображение
   * @returns {string} - Относительный путь к файлу
   */
  static async saveWardrobeImage(telegramId, imageBase64) {
    return this.saveImage(telegramId, imageBase64, 'wardrobe');
  }

  /**
   * Удалить изображение гардероба (новый метод)
   * @param {string|number} telegramId - ID пользователя Telegram
   * @param {string} imagePath - Относительный путь к файлу
   */
  static async deleteWardrobeImage(telegramId, imagePath) {
    return this.deleteImage(telegramId, imagePath, 'wardrobe');
  }

  /**
   * Получить полный путь к файлу
   * @param {string} relativePath - Относительный путь или имя файла
   * @param {string} type - Тип изображения ('wardrobe' или 'capsule')
   * @param {string|number} telegramId - ID пользователя (для капсул)
   * @returns {string} - Полный путь к файлу
   */
  static getFullPath(relativePath, type = 'wardrobe', telegramId = null) {
    if (type === 'capsule' && telegramId) {
      return path.join(UPLOADS_BASE_DIR, 'capsules', telegramId.toString(), relativePath);
    } else {
      return path.join(UPLOADS_BASE_DIR, relativePath);
    }
  }

  /**
   * Получить URL для изображения
   * @param {string} pathOrFilename - Путь к файлу или имя файла
   * @param {string} type - Тип изображения ('wardrobe' или 'capsule')
   * @param {string|number} telegramId - ID пользователя (для капсул)
   * @returns {string|null} - URL изображения или null
   */
  static getImageUrl(pathOrFilename, type = 'wardrobe', telegramId = null) {
    if (!pathOrFilename) return null;

    if (type === 'capsule' && telegramId) {
      return `/uploads/capsules/${telegramId}/${pathOrFilename}`;
    } else {
      // Для гардероба pathOrFilename уже содержит полный относительный путь
      return `/uploads/${pathOrFilename.replace(/\\/g, '/')}`;
    }
  }
}

module.exports = FileService;