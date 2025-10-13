/**
 * Утилиты для работы с файловым хранилищем
 * Сохранение, удаление и управление файлами анализов
 */

const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../controllers/logsController');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const ANALYSIS_DIR = path.join(UPLOADS_DIR, 'analysis');

/**
 * Сохранить фото анализа
 * 
 * @param {string|number} telegramId - ID пользователя в Telegram
 * @param {string} imageBase64 - Изображение в base64 (с префиксом data:image/...)
 * @returns {Promise<string>} - Имя файла (только имя, не полный путь)
 */
async function saveAnalysisImage(telegramId, imageBase64) {
  try {
    // Создаем папку пользователя
    const userDir = path.join(ANALYSIS_DIR, telegramId.toString());
    await fs.mkdir(userDir, { recursive: true });
    
    // Парсим base64
    const matches = imageBase64.match(/^data:image\/([a-z]+);base64,(.+)$/);
    
    if (!matches) {
      throw new Error('Invalid base64 image format');
    }
    
    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');
    
    // Генерируем имя файла
    const timestamp = Date.now();
    const filename = `analysis_${timestamp}.${extension}`;
    const filePath = path.join(userDir, filename);
    
    // Сохраняем файл
    await fs.writeFile(filePath, buffer);
    
    logger.info('Analysis image saved', {
      telegramId,
      filename,
      sizeKB: Math.round(buffer.length / 1024)
    });
    
    return filename; // Возвращаем только имя файла
    
  } catch (error) {
    logger.error('Failed to save analysis image', {
      telegramId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Получить полный путь к фото анализа
 * 
 * @param {string|number} telegramId - ID пользователя
 * @param {string} filename - Имя файла
 * @returns {string} - URL для доступа к файлу
 */
function getAnalysisImageUrl(telegramId, filename) {
  return `/uploads/analysis/${telegramId}/${filename}`;
}

/**
 * Получить абсолютный путь к файлу анализа
 * 
 * @param {string|number} telegramId - ID пользователя
 * @param {string} filename - Имя файла
 * @returns {string} - Абсолютный путь к файлу
 */
function getAnalysisImagePath(telegramId, filename) {
  return path.join(ANALYSIS_DIR, telegramId.toString(), filename);
}

/**
 * Удалить фото анализа
 * 
 * @param {string|number} telegramId - ID пользователя
 * @param {string} filename - Имя файла
 * @returns {Promise<boolean>} - true если удалено, false если не найдено
 */
async function deleteAnalysisImage(telegramId, filename) {
  try {
    const filePath = getAnalysisImagePath(telegramId, filename);
    
    // Проверяем существование файла
    try {
      await fs.access(filePath);
    } catch {
      logger.warn('Analysis image not found', { telegramId, filename });
      return false;
    }
    
    // Удаляем файл
    await fs.unlink(filePath);
    
    logger.info('Analysis image deleted', { telegramId, filename });
    return true;
    
  } catch (error) {
    logger.error('Failed to delete analysis image', {
      telegramId,
      filename,
      error: error.message
    });
    return false;
  }
}

/**
 * Очистить старые анализы (оставить только последние N для пользователя)
 * 
 * @param {string|number} telegramId - ID пользователя
 * @param {number} maxItems - Максимальное количество анализов (по умолчанию 50)
 * @returns {Promise<number>} - Количество удаленных файлов
 */
async function cleanupOldAnalyses(telegramId, maxItems = 50) {
  try {
    const userDir = path.join(ANALYSIS_DIR, telegramId.toString());
    
    // Проверяем существование директории
    try {
      await fs.access(userDir);
    } catch {
      // Директории нет - нечего чистить
      return 0;
    }
    
    // Получаем список файлов
    const files = await fs.readdir(userDir);
    
    if (files.length <= maxItems) {
      // Количество файлов в пределах лимита
      return 0;
    }
    
    // Получаем информацию о файлах (время модификации)
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(userDir, file);
        const stats = await fs.stat(filePath);
        return {
          file,
          mtime: stats.mtime.getTime()
        };
      })
    );
    
    // Сортируем по времени (старые первыми)
    filesWithStats.sort((a, b) => a.mtime - b.mtime);
    
    // Удаляем старые файлы (оставляем только maxItems последних)
    const toDelete = filesWithStats.slice(0, filesWithStats.length - maxItems);
    
    for (const { file } of toDelete) {
      await fs.unlink(path.join(userDir, file));
    }
    
    logger.info('Cleaned up old analysis files', {
      telegramId,
      deletedCount: toDelete.length,
      remainingCount: maxItems
    });
    
    return toDelete.length;
    
  } catch (error) {
    logger.error('Failed to cleanup old analyses', {
      telegramId,
      error: error.message
    });
    return 0;
  }
}

/**
 * Получить размер директории пользователя в байтах
 * 
 * @param {string|number} telegramId - ID пользователя
 * @returns {Promise<number>} - Размер в байтах
 */
async function getUserStorageSize(telegramId) {
  try {
    const userDir = path.join(ANALYSIS_DIR, telegramId.toString());
    
    try {
      await fs.access(userDir);
    } catch {
      return 0;
    }
    
    const files = await fs.readdir(userDir);
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = path.join(userDir, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
    
    return totalSize;
    
  } catch (error) {
    logger.error('Failed to get user storage size', {
      telegramId,
      error: error.message
    });
    return 0;
  }
}

module.exports = {
  saveAnalysisImage,
  getAnalysisImageUrl,
  getAnalysisImagePath,
  deleteAnalysisImage,
  cleanupOldAnalyses,
  getUserStorageSize
};
