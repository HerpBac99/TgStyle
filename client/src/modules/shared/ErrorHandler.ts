/**
 * Утилиты для обработки ошибок в сервисах
 */

import { logger } from '../logger';

/**
 * Обработать ошибку сервиса с логированием
 * @param error - Ошибка для обработки
 * @param context - Контекст ошибки (название операции)
 * @param metadata - Дополнительные данные для логирования
 * @returns Сообщение об ошибке
 */
export function handleServiceError(
  error: unknown,
  context: string,
  metadata?: Record<string, any>
): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(context, { error: errorMessage, ...metadata });
  return errorMessage;
}

/**
 * Обработать ошибку сервиса и пробросить дальше
 * @param error - Ошибка для обработки
 * @param context - Контекст ошибки
 * @param metadata - Дополнительные данные
 */
export function handleServiceErrorAndThrow(
  error: unknown,
  context: string,
  metadata?: Record<string, any>
): never {
  handleServiceError(error, context, metadata);
  throw error;
}
