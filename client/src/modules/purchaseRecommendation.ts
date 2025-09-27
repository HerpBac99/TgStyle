/**
 * Модуль для обработки рекомендаций покупки и формирования ссылок на Lamoda
 */

import { logger } from './logger';

/**
 * Интерфейс для результата извлечения рекомендации
 */
export interface PurchaseRecommendationResult {
  cleanAnalysis: string;
  purchaseRecommendation: string | null;
  lamodaUrl: string | null;
}

/**
 * Класс для управления рекомендациями покупки
 */
class PurchaseRecommendationManager {
  /**
   * Извлечение рекомендации для покупки из ответа ИИ
   * @param analysisText - Полный текст анализа
   * @returns Объект с очищенным анализом и рекомендацией
   */
  extractPurchaseRecommendation(analysisText: string): PurchaseRecommendationResult {
    if (!analysisText || typeof analysisText !== 'string') {
      return {
        cleanAnalysis: 'Анализ выполнен, но текст описания недоступен.',
        purchaseRecommendation: null,
        lamodaUrl: null
      };
    }

    // Ищем раздел "Рекомендация для покупки:"
    const recommendationMarker = '**Рекомендация для покупки:**';
    const markerIndex = analysisText.indexOf(recommendationMarker);

    if (markerIndex === -1) {
      // Если маркер не найден, возвращаем полный текст как анализ
      return {
        cleanAnalysis: analysisText.trim(),
        purchaseRecommendation: null,
        lamodaUrl: null
      };
    }

    // Разделяем текст на анализ и рекомендацию
    const cleanAnalysis = analysisText.substring(0, markerIndex).trim();
    const recommendationSection = analysisText.substring(markerIndex + recommendationMarker.length).trim();

    // Извлекаем рекомендацию (первая строка после маркера)
    const lines = recommendationSection.split('\n');
    let purchaseRecommendation: string | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('[') && !trimmedLine.startsWith('**')) {
        // Это должна быть рекомендация в формате "*элемент* *пол* *цвет*"
        purchaseRecommendation = trimmedLine.replace(/^\[|\]$/g, '').trim();
        break;
      }
    }

    let lamodaUrl: string | null = null;
    if (purchaseRecommendation) {
      lamodaUrl = this.generateLamodaUrl(purchaseRecommendation);
    }

    return {
      cleanAnalysis,
      purchaseRecommendation,
      lamodaUrl
    };
  }

  /**
   * Формирование ссылки на Lamoda из рекомендации
   * @param recommendation - Рекомендация в формате "элемент пол цвет"
   * @returns Ссылка на Lamoda или null если формат неверный
   */
  private generateLamodaUrl(recommendation: string): string | null {
    try {
      // Разбираем рекомендацию: "элемент одежды пол цвет"
      const parts = recommendation.split(' ');
      if (parts.length < 3) {
        logger.warn('Recommendation format invalid, expected at least 3 parts', { recommendation });
        return null;
      }

      const item = parts[0]; // элемент одежды
      const gender = parts[1]; // пол
      const color = parts.slice(2).join(' '); // цвет (может быть несколько слов)

      // Определяем gender_section на основе пола
      let genderSection = 'women'; // по умолчанию
      if (gender && (gender.toLowerCase().includes('муж') || gender.toLowerCase() === 'male')) {
        genderSection = 'men';
      }

      // Формируем поисковый запрос
      const searchQuery = `${item} ${gender} ${color}`.replace(/\s+/g, '%20').trim();
      const lamodaUrl = `https://www.lamoda.ru/catalogsearch/result/?q=${searchQuery}&gender_section=${genderSection}`;

      logger.info('Lamoda URL generated', { recommendation, lamodaUrl });
      return lamodaUrl;

    } catch (error) {
      logger.error('Failed to generate Lamoda URL', { recommendation, error });
      return null;
    }
  }

  /**
   * Открытие ссылки на Lamoda
   * @param lamodaUrl - Ссылка на Lamoda
   */
  openLamodaLink(lamodaUrl: string): void {
    if (!lamodaUrl) {
      logger.warn('No Lamoda URL provided');
      return;
    }

    logger.info('Opening Lamoda link', { url: lamodaUrl });

    try {
      // В Telegram WebApp используем tg.openLink для открытия внешних ссылок
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openLink(lamodaUrl);
      } else {
        // Fallback для обычного браузера
        window.open(lamodaUrl, '_blank');
      }
    } catch (error) {
      logger.error('Failed to open Lamoda link', error);
    }
  }
}

// Создаем глобальный экземпляр менеджера рекомендаций покупки
export const purchaseRecommendationManager = new PurchaseRecommendationManager();
