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
  recommendationsHtml: string | null;
  hasRecommendations: boolean;
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
        lamodaUrl: null,
        recommendationsHtml: null,
        hasRecommendations: false
      };
    }

    // Ищем раздел "**Рекомендации**" (с разными вариантами написания и двоеточием)
    const recommendationMarkers = [
      '**Рекомендации:**',    // С двоеточием (правильно)
      '**Рекомендации**',     // Без двоеточия (правильно)
      'Рекомендации'      // Без двоеточия (с опечаткой)
    ];
    let markerIndex = -1;
    let usedMarker = '';

    for (const marker of recommendationMarkers) {
      markerIndex = analysisText.indexOf(marker);
      if (markerIndex !== -1) {
        usedMarker = marker;
        logger.info('Found recommendations marker', { marker });
        break;
      }
    }

    if (markerIndex === -1) {
      // Если маркер не найден, возвращаем полный текст как анализ
      return {
        cleanAnalysis: analysisText.trim(),
        purchaseRecommendation: null,
        lamodaUrl: null,
        recommendationsHtml: null,
        hasRecommendations: false
      };
    }

    // Разделяем текст на анализ и рекомендации
    const cleanAnalysis = analysisText.substring(0, markerIndex).trim();
    const recommendationSection = analysisText.substring(markerIndex + usedMarker.length).trim();

    // Извлекаем HTML рекомендаций с ссылками
    const recommendationsHtml = this.parseRecommendations(recommendationSection);

    return {
      cleanAnalysis,
      purchaseRecommendation: null, // Не используется в новом формате
      lamodaUrl: null, // Не используется в новом формате
      recommendationsHtml,
      hasRecommendations: !!recommendationsHtml
    };
  }

  /**
   * Парсинг рекомендаций и создание HTML с ссылками
   * Формат: 1. *Брюки* [Брюки широкие коричневые женские]
   * @param recommendationText - Текст раздела рекомендаций
   * @returns HTML с рекомендациями и ссылками
   */
  private parseRecommendations(recommendationText: string): string | null {
    if (!recommendationText) return null;

    logger.info('Parsing recommendations', { 
      textLength: recommendationText.length,
      textPreview: recommendationText.substring(0, 200)
    });

    // Паттерн для поиска рекомендаций:
    // Вариант 1: 1. *Текст* [содержимое]
    // Вариант 2: 1.  Текст [содержимое] (без звездочек, может быть несколько пробелов)
    const pattern = /\d+\.\s+(?:\*([^*]+)\*|([^\[]+))\s*\[([^\]]+)\]/g;
    const recommendations: string[] = [];
    let match;

    while ((match = pattern.exec(recommendationText)) !== null) {
      // match[1] - текст в звездочках (если есть)
      // match[2] - текст без звездочек (если нет звездочек)
      // match[3] - поисковый запрос в квадратных скобках
      const displayText = (match[1] || match[2])?.trim(); // Текст для отображения
      const searchQuery = match[3]?.trim(); // Поисковый запрос

      logger.info('Found recommendation match', { 
        displayText, 
        searchQuery,
        fullMatch: match[0]
      });

      if (!displayText || !searchQuery) continue;

      // Генерируем URL для Lamoda
      const lamodaUrl = this.generateLamodaUrlFromQuery(searchQuery);

      if (lamodaUrl) {
        // Создаем HTML ссылку с розовым цветом
        const linkHtml = `<a href="${lamodaUrl}" target="_blank" rel="noopener noreferrer" class="recommendation-link" style="color: #ff6b6b !important; text-decoration: none !important; font-weight: 600 !important; padding: 2px 4px !important; border-radius: 4px !important; transition: all 0.3s ease !important; background: rgba(255, 107, 107, 0.1) !important;">${displayText}</a>`;
        recommendations.push(linkHtml);
      } else {
        // Если не удалось создать ссылку, просто выделяем текст
        recommendations.push(`<span style="font-weight: 600;">${displayText}</span>`);
      }
    }

    if (recommendations.length === 0) {
      logger.warn('No recommendations found in text', { 
        textPreview: recommendationText.substring(0, 300) 
      });
      return null;
    }

    logger.info('Successfully parsed recommendations', { 
      count: recommendations.length,
      recommendations 
    });

    // Формируем HTML список
    const listItems = recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('<br>');
    return `<div class="recommendations-section" style="margin-top: 16px; padding: 12px; background: rgba(255, 107, 107, 0.05); border-radius: 8px; border-left: 3px solid #ff6b6b;"><strong>Рекомендации:</strong><br>${listItems}</div>`;
  }

  /**
   * Формирование ссылки на Lamoda из поискового запроса
   * @param searchQuery - Поисковый запрос (например, "Брюки широкие коричневые женские")
   * @returns Ссылка на Lamoda или null если формат неверный
   */
  private generateLamodaUrlFromQuery(searchQuery: string): string | null {
    try {
      if (!searchQuery || searchQuery.length < 2) {
        logger.warn('Search query too short', { searchQuery });
        return null;
      }

      // Определяем пол из запроса
      let genderSection = 'women'; // по умолчанию
      const lowerQuery = searchQuery.toLowerCase();

      if (lowerQuery.includes('мужск') || lowerQuery.includes('male')) {
        genderSection = 'men';
      } else if (lowerQuery.includes('женск') || lowerQuery.includes('female')) {
        genderSection = 'women';
      }

      // Формируем поисковый запрос
      const encodedQuery = encodeURIComponent(searchQuery);
      const lamodaUrl = `https://www.lamoda.ru/catalogsearch/result/?q=${encodedQuery}&gender_section=${genderSection}`;

      logger.info('Lamoda URL generated from query', { searchQuery, lamodaUrl });
      return lamodaUrl;

    } catch (error) {
      logger.error('Failed to generate Lamoda URL from query', { searchQuery, error });
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
