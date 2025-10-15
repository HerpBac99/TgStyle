/**
 * Менеджер навигации с BackButton
 * Централизованное управление Telegram WebApp BackButton
 */

import { logger } from './logger';

/**
 * Обработчик навигации (callback при нажатии BackButton)
 */
export type NavigationHandler = () => void;

/**
 * Элемент стека навигации
 */
interface NavigationStackItem {
  handler: NavigationHandler;
  description: string; // Для отладки
}

/**
 * Класс для управления навигацией через Telegram BackButton
 * 
 * Использует стек обработчиков:
 * - push() добавляет обработчик в стек и показывает BackButton
 * - pop() удаляет последний обработчик
 * - При нажатии BackButton вызывается обработчик с вершины стека
 * - Когда стек пуст, BackButton скрывается
 */
export class NavigationManager {
  private stack: NavigationStackItem[] = [];
  private isBackButtonVisible: boolean = false;
  private currentHandler: (() => void) | null = null;

  constructor() {
  }

  /**
   * Добавить обработчик в стек навигации
   * Показывает BackButton если еще не показан
   * 
   * @param handler - Функция, которая будет вызвана при нажатии BackButton
   * @param description - Описание обработчика (для отладки)
   * 
   * @example
   * navigationManager.push(() => {
   *   canvasEditor.hide();
   *   showModal();
   * }, 'Return to modal');
   */
  push(handler: NavigationHandler, description: string = 'Unknown'): void {
    this.stack.push({ handler, description });
    

    // Показываем BackButton если еще не показан
    if (!this.isBackButtonVisible) {
      this.showBackButton();
    }
  }

  /**
   * Удалить последний обработчик из стека
   * Скрывает BackButton если стек стал пустым
   */
  pop(): void {
    const removed = this.stack.pop();
    
    if (removed) {
    }

    // Скрываем BackButton если стек пуст
    if (this.stack.length === 0 && this.isBackButtonVisible) {
      this.hideBackButton();
    }
  }

  /**
   * Очистить весь стек навигации
   * Скрывает BackButton
   */
  clear(): void {
    this.stack = [];
    

    if (this.isBackButtonVisible) {
      this.hideBackButton();
    }
  }

  /**
   * Получить текущий размер стека
   */
  getStackSize(): number {
    return this.stack.length;
  }

  /**
   * Получить описания всех обработчиков в стеке (для отладки)
   */
  getStackDescriptions(): string[] {
    return this.stack.map(item => item.description);
  }

  /**
   * Обработать нажатие BackButton
   * Вызывает обработчик с вершины стека
   * НЕ удаляет обработчик автоматически (это должен делать сам обработчик)
   */
  private handleBackButtonClick(): void {
    if (this.stack.length === 0) {
      logger.warn('BackButton clicked but stack is empty');
      return;
    }

    // Берем последний обработчик из стека
    const current = this.stack[this.stack.length - 1];
    
    if (!current) {
      logger.error('Stack not empty but current handler is undefined');
      return;
    }

    logger.info('BackButton clicked, executing handler', {
      description: current.description,
      stackSize: this.stack.length
    });

    try {
      // Вызываем обработчик
      current.handler();
    } catch (error) {
      logger.error('Error executing navigation handler', {
        error: error instanceof Error ? error.message : String(error),
        description: current.description
      });
    }
  }

  /**
   * Показать BackButton и настроить обработчик
   */
  private showBackButton(): void {
    try {
      const tg = (window as any).Telegram?.WebApp;
      
      if (!tg) {
        logger.warn('Telegram WebApp not available, cannot show BackButton');
        return;
      }

      // Создаем обработчик если его еще нет
      if (!this.currentHandler) {
        this.currentHandler = () => this.handleBackButtonClick();
        tg.BackButton.onClick(this.currentHandler);
      }

      // Показываем кнопку
      tg.BackButton.show();
      this.isBackButtonVisible = true;

      logger.info('BackButton shown');
    } catch (error) {
      logger.error('Error showing BackButton', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Скрыть BackButton и удалить обработчик
   */
  private hideBackButton(): void {
    try {
      const tg = (window as any).Telegram?.WebApp;
      
      if (!tg) {
        return;
      }

      // Удаляем обработчик
      if (this.currentHandler) {
        tg.BackButton.offClick(this.currentHandler);
        this.currentHandler = null;
      }

      // Скрываем кнопку
      tg.BackButton.hide();
      this.isBackButtonVisible = false;

      logger.info('BackButton hidden');
    } catch (error) {
      logger.error('Error hiding BackButton', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Получить статус менеджера (для отладки)
   */
  getStatus() {
    return {
      isBackButtonVisible: this.isBackButtonVisible,
      stackSize: this.stack.length,
      stackDescriptions: this.getStackDescriptions(),
      hasHandler: !!this.currentHandler
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    
    this.clear();
    
    // Убеждаемся что BackButton скрыт
    if (this.isBackButtonVisible) {
      this.hideBackButton();
    }
  }
}

// Создаем глобальный экземпляр менеджера навигации
export const navigationManager = new NavigationManager();
