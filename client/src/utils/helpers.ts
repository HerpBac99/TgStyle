/**
 * Вспомогательные функции общего назначения
 */

import type { ValidationResult } from '@/types/index.js';
import { ERROR_CODES, ERROR_MESSAGES } from './constants.js';

// Реэкспорт для использования в других модулях
export { ERROR_CODES, ERROR_MESSAGES };

/**
 * Генерирует уникальный ID сессии
 */
export function generateSessionId(userId?: number): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  
  if (userId) {
    return `tgstyle_${userId}_${timestamp}_${random}`;
  }
  
  return `tgstyle_client_${timestamp}_${random}`;
}

/**
 * Форматирует timestamp для отображения
 */
export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    const time = date.toTimeString().split(' ')[0];
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${milliseconds}`;
  } catch (error) {
    return 'Invalid Date';
  }
}

/**
 * Форматирует дату для отображения в истории
 */
export function formatHistoryDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const day = date.toLocaleDateString();
    const time = date.toLocaleTimeString().slice(0, 5);
    return `${day} ${time}`;
  } catch (error) {
    return 'Дата не определена';
  }
}

/**
 * Проверяет, доступен ли navigator.onLine
 */
export function isOnline(): boolean {
  return navigator?.onLine ?? true;
}

/**
 * Создает задержку в миллисекундах
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Безопасно парсит JSON строку
 */
export function safeJsonParse<T>(jsonString: string, defaultValue: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Безопасно stringify объект в JSON
 */
export function safeJsonStringify(obj: any, defaultValue = '{}'): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Проверяет, является ли строка валидным base64
 */
export function isValidBase64(str: string): boolean {
  try {
    return btoa(atob(str)) === str;
  } catch (error) {
    return false;
  }
}

/**
 * Вычисляет приблизительный размер base64 строки в байтах
 */
export function getBase64Size(base64String: string): number {
  // base64 строка длиннее бинарных данных примерно на 33%
  const padding = (base64String.match(/=/g) || []).length;
  return Math.ceil((base64String.length - padding) * 0.75);
}

/**
 * Обрезает base64 строку до максимального размера
 */
export function truncateBase64(base64String: string, maxLength: number): string {
  if (base64String.length <= maxLength) {
    return base64String;
  }
  return base64String.substring(0, maxLength) + '...';
}

/**
 * Проверяет, является ли файл изображением
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Получает расширение файла
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Валидирует размер файла
 */
export function validateFileSize(file: File, maxSizeMB: number): ValidationResult {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const isValid = file.size <= maxSizeBytes;
  
  return {
    isValid,
    errors: isValid ? [] : [`Размер файла превышает ${maxSizeMB}MB`],
    warnings: [],
  };
}

/**
 * Валидирует тип файла
 */
export function validateFileType(file: File, allowedTypes: string[]): ValidationResult {
  const isValid = allowedTypes.includes(file.type);
  
  return {
    isValid,
    errors: isValid ? [] : [`Неподдерживаемый тип файла: ${file.type}`],
    warnings: [],
  };
}

/**
 * Создает элемент DOM с заданными атрибутами
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string> = {},
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  if (textContent) {
    element.textContent = textContent;
  }
  
  return element;
}

/**
 * Безопасно получает элемент DOM по селектору
 */
export function getElement<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/**
 * Безопасно получает множественные элементы DOM по селектору
 */
export function getElements<T extends HTMLElement>(selector: string): NodeListOf<T> {
  return document.querySelectorAll<T>(selector);
}

/**
 * Добавляет обработчик события с автоматической очисткой
 */
export function addEventListenerWithCleanup<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void {
  element.addEventListener(type, listener, options);
  
  return () => {
    element.removeEventListener(type, listener, options);
  };
}

/**
 * Создает debounced функцию
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Создает throttled функцию
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Получает сообщение об ошибке по коду
 */
export function getErrorMessage(errorCode: keyof typeof ERROR_CODES): string {
  return ERROR_MESSAGES[errorCode] || 'Неизвестная ошибка';
}

/**
 * Создает объект ошибки с дополнительной информацией
 */
export function createError(
  code: keyof typeof ERROR_CODES,
  message?: string,
  details?: any
): Error & { code: string; details?: any } {
  const error = new Error(message || getErrorMessage(code)) as Error & { 
    code: string; 
    details?: any; 
  };
  
  error.code = code;
  error.details = details;
  
  return error;
}

/**
 * Проверяет, поддерживает ли браузер необходимые функции
 */
export function checkBrowserSupport(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Проверяем localStorage
  if (!window.localStorage) {
    errors.push('localStorage не поддерживается');
  }
  
  // Проверяем fetch API
  if (!window.fetch) {
    errors.push('Fetch API не поддерживается');
  }
  
  // Проверяем FileReader
  if (!window.FileReader) {
    errors.push('FileReader не поддерживается');
  }
  
  // Проверяем canvas
  const canvas = document.createElement('canvas');
  if (!canvas.getContext) {
    warnings.push('Canvas API ограничен');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Копирует текст в буфер обмена
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback для старых браузеров
    const textArea = createElement('textarea', {
      value: text,
      style: 'position: fixed; top: -9999px; left: -9999px;',
    });
    
    document.body.appendChild(textArea);
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return success;
  } catch (error) {
    return false;
  }
}
