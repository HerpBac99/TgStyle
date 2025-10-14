# TgStyle Main Menu - Purchase Recommendations Documentation

## Обзор модуля purchaseRecommendation.ts

Модуль `purchaseRecommendation.ts` обрабатывает рекомендации покупок из результатов анализа ИИ, извлекает ссылки на товары и создает интерактивные элементы для открытия в Lamoda.

## Основные компоненты

### Интерфейс PurchaseRecommendationResult

```typescript
export interface PurchaseRecommendationResult {
  cleanAnalysis: string;           // Очищенный текст анализа без рекомендаций
  purchaseRecommendation: string | null; // Устаревшее поле
  lamodaUrl: string | null;        // Устаревшее поле
  recommendationsHtml: string | null; // HTML с рекомендациями и ссылками
  hasRecommendations: boolean;    // Флаг наличия рекомендаций
}
```
**Теги поиска:** `recommendation_interface`, `result_structure`, `html_recommendations`, `recommendation_flags`

**Что определяет:**
- Структура результата обработки рекомендаций
- Разделение чистого анализа и рекомендаций
- HTML формат для интерактивных ссылок

## Основной метод обработки

#### extractPurchaseRecommendation(analysisText): PurchaseRecommendationResult
```typescript
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
```
**Теги поиска:** `recommendation_extraction`, `text_parsing`, `marker_detection`, `section_splitting`, `html_generation`, `fallback_handling`

**Что делает:**
- Проверяет входные данные
- Ищет маркеры раздела рекомендаций
- Разделяет текст на анализ и рекомендации
- Парсит рекомендации в HTML
- Возвращает структурированный результат

**Параметры:**
- `analysisText: string` - полный текст анализа с рекомендациями

**Возвращает:** PurchaseRecommendationResult - разделенный результат

## Парсинг рекомендаций

#### parseRecommendations(recommendationText): string | null
```typescript
private parseRecommendations(recommendationText: string): string | null {
  if (!recommendationText) return null;

  logger.info('Parsing recommendations', { 
    textLength: recommendationText.length,
    textPreview: recommendationText.substring(0, 200)
  });

  // Паттерн для поиска рекомендаций: 1. *Текст* [содержимое]
  const pattern = /\d+\.\s*\*([^*]+)\*\s*\[([^\]]+)\]/g;
  const recommendations: string[] = [];
  let match;

  while ((match = pattern.exec(recommendationText)) !== null) {
    const displayText = match[1]?.trim(); // Текст для отображения (например, "Брюки")
    const searchQuery = match[2]?.trim(); // Поисковый запрос (например, "Брюки широкие коричневые женские")

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
```
**Теги поиска:** `recommendation_parsing`, `regex_pattern_matching`, `lamoda_url_generation`, `html_link_creation`, `fallback_text_styling`, `recommendations_html_formatting`

**Что делает:**
- Использует регулярное выражение для поиска паттерна рекомендаций
- Извлекает текст отображения и поисковый запрос
- Генерирует Lamoda URL для каждой рекомендации
- Создает HTML ссылки с стилизацией
- Формирует финальный HTML блок рекомендаций

**Параметры:**
- `recommendationText: string` - текст раздела рекомендаций

**Возвращает:** string | null - HTML с рекомендациями или null

## Генерация Lamoda URL

#### generateLamodaUrlFromQuery(searchQuery): string | null
```typescript
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
```
**Теги поиска:** `lamoda_url_generation`, `gender_detection`, `query_encoding`, `url_construction`, `error_handling_url`

**Что делает:**
- Валидирует длину поискового запроса
- Определяет пол из текста запроса
- Кодирует запрос для URL
- Формирует полный URL Lamoda с параметрами

**Параметры:**
- `searchQuery: string` - поисковый запрос для Lamoda

**Возвращает:** string | null - URL Lamoda или null при ошибке

## Открытие ссылок

#### openLamodaLink(lamodaUrl): void
```typescript
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
```
**Теги поиска:** `lamoda_link_opening`, `telegram_webapp_integration`, `external_link_handling`, `fallback_browser_open`

**Что делает:**
- Проверяет наличие URL
- Использует Telegram WebApp API для открытия ссылок
- Fallback на window.open для обычных браузеров

**Параметры:**
- `lamodaUrl: string` - URL для открытия

**Возвращает:** void

## Глобальный экземпляр

```typescript
export const purchaseRecommendationManager = new PurchaseRecommendationManager();
```
**Теги поиска:** `global_manager_instance`, `singleton_pattern`, `recommendation_manager_access`

**Что делает:**
- Создает глобальный экземпляр менеджера рекомендаций
- Доступен во всем приложении

## Формат входных данных

**Ожидаемый формат анализа ИИ:**
```
[Текст анализа стиля]

**Рекомендации:**
1. *Брюки* [Брюки широкие коричневые женские]
2. *Футболка* [Футболка белая женская]
3. *Туфли* [Туфли черные женские]
```

**Теги поиска:** `ai_response_format`, `recommendation_structure`, `parsing_format`, `markdown_style`

## Процесс обработки

```
1. extractPurchaseRecommendation() получает полный текст анализа
2. Ищет маркер "**Рекомендации**" или варианты
3. Разделяет текст на cleanAnalysis и recommendationSection
4. parseRecommendations() парсит recommendationSection
5. Регулярное выражение находит паттерны "1. *Текст* [запрос]"
6. generateLamodaUrlFromQuery() создает URL для каждого запроса
7. Формируется HTML с ссылками
8. Возвращается PurchaseRecommendationResult
```

**Теги поиска:** `processing_flow`, `text_splitting`, `regex_parsing`, `url_generation`, `html_assembly`

## Определение пола

**Логика определения пола:**
- По умолчанию: `women`
- `мужск` или `male` → `men`
- `женск` или `female` → `women`

**Теги поиска:** `gender_detection_logic`, `russian_text_parsing`, `english_fallback`, `default_gender`

## Стилизация ссылок

**CSS стили для рекомендаций:**
```css
.recommendation-link {
  color: #ff6b6b !important;
  text-decoration: none !important;
  font-weight: 600 !important;
  padding: 2px 4px !important;
  border-radius: 4px !important;
  transition: all 0.3s ease !important;
  background: rgba(255, 107, 107, 0.1) !important;
}

.recommendations-section {
  margin-top: 16px;
  padding: 12px;
  background: rgba(255, 107, 107, 0.05);
  border-radius: 8px;
  border-left: 3px solid #ff6b6b;
}
```

**Теги поиска:** `recommendation_styling`, `link_colors`, `section_background`, `css_classes`

## Обработка ошибок

**Типы ошибок:**
- Пустой или невалидный текст анализа
- Отсутствие маркера рекомендаций
- Неверный формат рекомендаций
- Ошибки генерации URL
- Слишком короткий поисковый запрос

**Обработка:**
- Graceful fallback на полный текст
- Логирование проблем
- Возврат null для отсутствующих рекомендаций

**Теги поиска:** `error_handling`, `graceful_degradation`, `fallback_behavior`, `logging_errors`

## Интеграция с UI

**Использование в uiAnalysis.ts:**
```typescript
// Обрабатываем ответ и извлекаем рекомендации
const extracted = purchaseRecommendationManager.extractPurchaseRecommendation(result);

// Сохраняем ссылку на Lamoda для текущей рекомендации
this.currentLamodaUrl = extracted.lamodaUrl;

// Сохраняем текст анализа для отправки
this.currentAnalysisData.analysisText = extracted.cleanAnalysis;

// Добавляем блок рекомендаций с ссылками
const recommendationsBlock = extracted.recommendationsHtml
  ? `<div class="analysis-block">${extracted.recommendationsHtml}</div>`
  : '';
```

**Теги поиска:** `ui_integration`, `recommendation_display`, `html_injection`, `link_setup`

## Производительность

**Оптимизации:**
- Ленивый парсинг (только при наличии маркера)
- Эффективные регулярные выражения
- Минимальные строковые операции
- Кэширование результатов парсинга

**Теги поиска:** `performance_optimization`, `lazy_parsing`, `regex_efficiency`, `caching_strategy`

## Логирование

**Уровни логирования:**
- `info`: успешные операции, найденные маркеры
- `warn`: отсутствующие рекомендации, короткие запросы
- `error`: ошибки генерации URL, исключения

**Теги поиска:** `logging_levels`, `operation_tracking`, `error_logging`, `debug_info`
