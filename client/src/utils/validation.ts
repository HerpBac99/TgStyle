/**
 * Утилиты для валидации данных
 */

import type { 
  ValidationResult, 
  ImageData, 
  TelegramWebAppInitData,
  HistoryItem 
} from '@/types/index.js';
import { 
  IMAGE_CONSTRAINTS,
  HISTORY_CONSTRAINTS 
} from '@/utils/constants.js';
import { 
  isValidBase64, 
  getBase64Size
} from './helpers.js';

/**
 * Валидирует данные изображения
 */
export function validateImageData(imageData: ImageData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Проверяем base64 данные
  if (!imageData.base64 || !isValidBase64(imageData.base64)) {
    errors.push('Некорректные данные изображения');
  }

  // Проверяем размеры
  if (imageData.width < IMAGE_CONSTRAINTS.MIN_WIDTH || 
      imageData.height < IMAGE_CONSTRAINTS.MIN_HEIGHT) {
    errors.push(`Изображение слишком маленькое (минимум ${IMAGE_CONSTRAINTS.MIN_WIDTH}x${IMAGE_CONSTRAINTS.MIN_HEIGHT})`);
  }

  if (imageData.width > IMAGE_CONSTRAINTS.MAX_WIDTH || 
      imageData.height > IMAGE_CONSTRAINTS.MAX_HEIGHT) {
    warnings.push(`Изображение будет сжато до ${IMAGE_CONSTRAINTS.MAX_WIDTH}x${IMAGE_CONSTRAINTS.MAX_HEIGHT}`);
  }

  // Проверяем размер файла
  const sizeInMB = getBase64Size(imageData.base64) / (1024 * 1024);
  if (sizeInMB > IMAGE_CONSTRAINTS.MAX_SIZE_MB) {
    warnings.push(`Размер файла ${sizeInMB.toFixed(1)}MB будет сжат`);
  }

  // Проверяем формат
  if (!IMAGE_CONSTRAINTS.ALLOWED_FORMATS.includes(`image/${imageData.format}` as any)) {
    errors.push(`Неподдерживаемый формат: ${imageData.format}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Валидирует элемент истории
 */
export function validateHistoryItem(item: HistoryItem): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Проверяем обязательные поля
  if (!item.photo && !item.isEmpty) {
    errors.push('Отсутствует изображение');
  }

  if (!item.timestamp) {
    errors.push('Отсутствует временная метка');
  }

  // Размер фото больше не проверяется - сохраняем оригинал

  // Проверяем валидность timestamp
  if (item.timestamp && isNaN(new Date(item.timestamp).getTime())) {
    errors.push('Некорректная временная метка');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Валидирует массив истории
 */
export function validateHistory(history: HistoryItem[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(history)) {
    errors.push('История должна быть массивом');
    return { isValid: false, errors, warnings };
  }

  if (history.length > HISTORY_CONSTRAINTS.MAX_ITEMS) {
    warnings.push(`История ограничена ${HISTORY_CONSTRAINTS.MAX_ITEMS} элементами`);
  }

  // Валидируем каждый элемент
  history.forEach((item, index) => {
    if (item && !item.isEmpty) {
      const itemValidation = validateHistoryItem(item);
      if (!itemValidation.isValid) {
        errors.push(`Элемент ${index}: ${itemValidation.errors.join(', ')}`);
      }
      warnings.push(...itemValidation.warnings.map(w => `Элемент ${index}: ${w}`));
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Валидирует данные инициализации Telegram
 */
export function validateTelegramInitData(initData: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!initData || typeof initData !== 'string') {
    errors.push('Отсутствуют данные инициализации Telegram');
    return { isValid: false, errors, warnings };
  }

  try {
    // Проверяем базовую структуру
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    const authDate = urlParams.get('auth_date');

    if (!hash) {
      errors.push('Отсутствует hash в данных Telegram');
    }

    if (!authDate) {
      errors.push('Отсутствует auth_date в данных Telegram');
    } else {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      const age = now - authTimestamp;

      if (age > 86400) { // 24 часа
        warnings.push('Данные Telegram устарели');
      }
    }

    // Проверяем данные пользователя
    const userParam = urlParams.get('user');
    if (userParam) {
      try {
        const user = JSON.parse(userParam) as TelegramWebAppInitData['user'];
        if (!user?.id) {
          warnings.push('Неполные данные пользователя Telegram');
        }
      } catch (e) {
        errors.push('Некорректные данные пользователя Telegram');
      }
    }

  } catch (error) {
    errors.push('Ошибка парсинга данных Telegram');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Валидирует API ответ
 */
export function validateApiResponse(response: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response || typeof response !== 'object') {
    errors.push('Некорректный ответ API');
    return { isValid: false, errors, warnings };
  }

  if (typeof response.success !== 'boolean') {
    errors.push('Отсутствует поле success в ответе API');
  }

  if (!response.success && !response.error) {
    warnings.push('Ошибка API без описания');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}


/**
 * Валидирует URL
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!url || typeof url !== 'string') {
    errors.push('URL не указан');
    return { isValid: false, errors, warnings };
  }

  try {
    const urlObj = new URL(url);
    
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      errors.push('URL должен использовать HTTP или HTTPS протокол');
    }

    if (urlObj.protocol === 'http:' && urlObj.hostname !== 'localhost') {
      warnings.push('Использование HTTP небезопасно');
    }

  } catch (error) {
    errors.push('Некорректный URL');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Создает валидатор для объекта с заданными правилами
 */
export function createValidator<T>(
  rules: Record<keyof T, (value: any) => ValidationResult>
) {
  return (obj: T): ValidationResult => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    Object.entries(rules).forEach(([key, validator]) => {
      const validatorFunc = validator as (value: any) => ValidationResult;
      const result = validatorFunc((obj as any)[key]);
      allErrors.push(...result.errors.map((err: string) => `${key}: ${err}`));
      allWarnings.push(...result.warnings.map((warn: string) => `${key}: ${warn}`));
    });

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  };
}

/**
 * Комбинирует результаты множественных валидаций
 */
export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  results.forEach(result => {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
