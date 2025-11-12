/**
 * Умный генератор капсул на основе правил стиля и сезонности
 * Заменяет простой алгоритм в FastVLM более продвинутой логикой
 */

const { logger } = require('../controllers/logsController');

class SmartCapsuleGenerator {
  constructor() {
    // Правила многослойности по сезонам
    this.layeringRules = {
      winter: {
        required: ['LEGWEAR', 'FOOTWEAR'],
        recommended: ['INNERWEAR', 'OUTERWEAR'],
        optional: ['BODYWEAR', 'HEADWEAR', 'ACCESSORIES'],
        layers: {
          base: ['BODYWEAR', 'INNERWEAR'], // Базовый слой
          middle: ['INNERWEAR'], // Средний слой (свитеры)
          outer: ['OUTERWEAR'] // Верхний слой (куртки)
        },
        // Умные правила для аксессуаров
        accessories: {
          min: 1,  // Минимум 1 аксессуар (сумка)
          max: 4,  // Максимум 4 (сумка, шарф, перчатки, шапка)
          priority: ['HEADWEAR', 'ACCESSORIES'], // Приоритет: сначала головной убор, потом аксессуары
          recommended: 3 // Рекомендуемое количество
        }
      },
      spring: {
        required: ['LEGWEAR', 'FOOTWEAR'],
        recommended: ['BODYWEAR'],
        optional: ['INNERWEAR', 'OUTERWEAR', 'ACCESSORIES'],
        layers: {
          base: ['BODYWEAR'],
          middle: ['INNERWEAR'],
          outer: ['OUTERWEAR']
        },
        accessories: {
          min: 1,  // Минимум 1 (сумка)
          max: 3,  // Максимум 3 (сумка, очки, легкий шарф)
          priority: ['ACCESSORIES'], // Только аксессуары
          recommended: 2
        }
      },
      summer: {
        required: ['LEGWEAR', 'FOOTWEAR'],
        recommended: ['BODYWEAR'],
        optional: ['ACCESSORIES'],
        layers: {
          base: ['BODYWEAR'],
          middle: [], // Летом средний слой обычно не нужен
          outer: [] // Верхний слой только для кондиционера
        },
        accessories: {
          min: 1,  // Минимум 1 (сумка)
          max: 3,  // Максимум 3 (сумка, очки, украшения)
          priority: ['ACCESSORIES', 'HEADWEAR'], // Аксессуары + панама/шляпа
          recommended: 2
        }
      },
      autumn: {
        required: ['LEGWEAR', 'FOOTWEAR'],
        recommended: ['BODYWEAR', 'INNERWEAR'],
        optional: ['OUTERWEAR', 'ACCESSORIES'],
        layers: {
          base: ['BODYWEAR'],
          middle: ['INNERWEAR'],
          outer: ['OUTERWEAR']
        },
        accessories: {
          min: 1,  // Минимум 1 (сумка)
          max: 4,  // Максимум 4 (сумка, шарф, шапка, перчатки)
          priority: ['ACCESSORIES', 'HEADWEAR'], // Аксессуары + головной убор
          recommended: 3
        }
      }
    };

    // Умная классификация сезонности (игнорируем поле season из FastVLM)
    this.seasonalityRules = {
      // Категории, которые подходят для любого сезона
      allSeason: ['LEGWEAR', 'FOOTWEAR', 'ACCESSORIES'],
      
      // Сезонные предпочтения по подтипам
      seasonal: {
        winter: {
          preferred: ['свитер', 'худи', 'кардиган', 'пальто', 'куртка', 'ботинки', 'сапоги', 'шапка'],
          avoid: ['шорты', 'сандалии', 'майка']
        },
        spring: {
          preferred: ['рубашка', 'блузка', 'легкая куртка', 'кроссовки', 'ботильоны'],
          avoid: ['пуховик', 'зимние сапоги', 'шапка']
        },
        summer: {
          preferred: ['футболка', 'майка', 'шорты', 'платье', 'сандалии', 'кроссовки'],
          avoid: ['свитер', 'пальто', 'ботинки', 'шапка']
        },
        autumn: {
          preferred: ['свитер', 'кардиган', 'куртка', 'джинсы', 'ботинки'],
          avoid: ['шорты', 'сандалии', 'майка']
        }
      }
    };

    // Правила сочетаемости цветов (РАСШИРЕННЫЕ - все 52 цвета из Color_prompt.md)
    this.colorHarmony = {
      // Нейтральные цвета - сочетаются со всем (базовая палитра)
      neutral: [
        'черный', 'белый', 'серый', 'серебряный', 'угольный',
        'бежевый', 'кремовый', 'слоновая кость', 'молочный',
        'желтовато-коричневый', 'верблюжий'
      ],
      
      // Цветовые схемы (гармоничные комбинации)
      schemes: {
        // Монохромная (оттенки серого)
        monochrome: ['черный', 'белый', 'серый', 'серебряный', 'угольный'],
        
        // Земляные тона
        earth: [
          'коричневый', 'бежевый', 'оливковый', 'хаки', 'верблюжий',
          'шоколадный', 'желтовато-коричневый', 'кремовый'
        ],
        
        // Классическая (деловая)
        classic: ['темно-синий', 'белый', 'серый', 'черный', 'бежевый'],
        
        // Теплые тона
        warm: [
          'красный', 'оранжевый', 'желтый', 'коричневый', 'золотой',
          'горчичный', 'мандариновый', 'персиковый', 'коралловый'
        ],
        
        // Холодные тона
        cool: [
          'синий', 'темно-синий', 'зеленый', 'фиолетовый', 'серый',
          'бирюзовый', 'голубой', 'сине-зеленый', 'индиго'
        ],
        
        // Пастельные тона
        pastel: [
          'светло-синий', 'небесно-голубой', 'розовый', 'лавандовый',
          'сиреневый', 'мятный', 'персиковый', 'кремовый', 'лимонный'
        ],
        
        // Яркие/насыщенные
        vibrant: [
          'красный', 'ярко-розовый', 'оранжевый', 'желтый', 'лаймовый',
          'изумрудный', 'пурпурный', 'малиновый'
        ],
        
        // Морская тема
        nautical: [
          'темно-синий', 'белый', 'красный', 'синий', 'голубой',
          'бирюзовый', 'аква'
        ],
        
        // Осенняя палитра
        autumn: [
          'бургунди', 'бордовый', 'горчичный', 'оливковый', 'коричневый',
          'оранжевый', 'шоколадный'
        ],
        
        // Весенняя палитра
        spring: [
          'розовый', 'мятный', 'лимонный', 'светло-синий', 'лавандовый',
          'персиковый', 'коралловый'
        ]
      },
      
      // Комплементарные пары (противоположные на цветовом круге)
      complementary: {
        // Красные оттенки
        'красный': ['зеленый', 'темно-зеленый', 'изумрудный', 'белый', 'черный', 'серый', 'бежевый'],
        'бургунди': ['зеленый', 'оливковый', 'белый', 'серый', 'кремовый'],
        'бордовый': ['зеленый', 'мятный', 'белый', 'серый', 'бежевый'],
        'малиновый': ['зеленый', 'белый', 'черный', 'серый'],
        'розовый': ['зеленый', 'оливковый', 'белый', 'серый', 'бежевый'],
        'ярко-розовый': ['зеленый', 'белый', 'черный', 'серый'],
        'коралловый': ['бирюзовый', 'голубой', 'белый', 'бежевый', 'серый'],
        'лососевый': ['голубой', 'мятный', 'белый', 'бежевый', 'серый'],
        
        // Синие оттенки
        'синий': ['оранжевый', 'желтый', 'золотой', 'белый', 'серый', 'бежевый'],
        'темно-синий': ['оранжевый', 'коралловый', 'белый', 'серый', 'бежевый', 'кремовый'],
        'светло-синий': ['персиковый', 'коралловый', 'белый', 'бежевый'],
        'небесно-голубой': ['персиковый', 'коралловый', 'белый', 'кремовый'],
        'бирюзовый': ['коралловый', 'оранжевый', 'белый', 'бежевый', 'серый'],
        'голубой': ['оранжевый', 'персиковый', 'белый', 'бежевый'],
        'сине-зеленый': ['коралловый', 'оранжевый', 'белый', 'серый'],
        'аква': ['коралловый', 'персиковый', 'белый', 'бежевый'],
        'индиго': ['оранжевый', 'золотой', 'белый', 'серый'],
        
        // Зеленые оттенки
        'зеленый': ['красный', 'розовый', 'бургунди', 'белый', 'бежевый', 'серый'],
        'темно-зеленый': ['красный', 'бордовый', 'белый', 'серый', 'бежевый'],
        'оливковый': ['бордовый', 'бургунди', 'белый', 'бежевый', 'кремовый'],
        'лаймовый': ['пурпурный', 'фиолетовый', 'белый', 'черный'],
        'мятный': ['коралловый', 'розовый', 'белый', 'бежевый'],
        'изумрудный': ['красный', 'бордовый', 'белый', 'серый', 'золотой'],
        
        // Желтые оттенки
        'желтый': ['фиолетовый', 'пурпурный', 'синий', 'серый', 'черный', 'белый'],
        'золотой': ['синий', 'темно-синий', 'фиолетовый', 'белый', 'черный'],
        'горчичный': ['темно-синий', 'бургунди', 'белый', 'серый', 'черный'],
        'лимонный': ['фиолетовый', 'лавандовый', 'белый', 'серый'],
        
        // Оранжевые оттенки
        'оранжевый': ['синий', 'темно-синий', 'бирюзовый', 'белый', 'серый', 'черный'],
        'мандариновый': ['синий', 'голубой', 'белый', 'серый'],
        'персиковый': ['голубой', 'бирюзовый', 'белый', 'бежевый', 'серый'],
        
        // Коричневые оттенки
        'коричневый': ['синий', 'голубой', 'белый', 'бежевый', 'кремовый'],
        'желтовато-коричневый': ['синий', 'белый', 'кремовый'],
        'хаки': ['бордовый', 'темно-синий', 'белый', 'бежевый'],
        'верблюжий': ['темно-синий', 'бордовый', 'белый', 'кремовый'],
        'шоколадный': ['синий', 'голубой', 'белый', 'бежевый', 'кремовый'],
        
        // Фиолетовые оттенки
        'фиолетовый': ['желтый', 'золотой', 'зеленый', 'белый', 'серый'],
        'лавандовый': ['желтый', 'лимонный', 'белый', 'серый', 'бежевый'],
        'сиреневый': ['желтый', 'зеленый', 'белый', 'серый'],
        'пурпурный': ['желтый', 'лаймовый', 'белый', 'черный', 'серый'],
        
        // Многоцветный - сочетается с нейтральными
        'многоцветный': ['черный', 'белый', 'серый', 'бежевый']
      }
    };

    // Стилевая совместимость
    this.styleCompatibility = {
      'повседневный': ['спортивный', 'уличный', 'минимализм'],
      'деловой': ['официальный', 'минимализм', 'деловой повседневный'],
      'спортивный': ['повседневный', 'уличный'],
      'официальный': ['деловой', 'деловой повседневный'],
      'уличный': ['повседневный', 'спортивный'],
      'романтический': ['винтаж', 'бохо'],
      'минимализм': ['деловой', 'повседневный']
    };
  }

  /**
   * Генерирует 3 капсулы по улучшенному алгоритму
   */
  async generateCapsules(wardrobeItems, currentSeason, existingCapsules = [], excludeCombinations = []) {
    try {
      logger.info(`Генерация капсул: ${wardrobeItems.length} вещей, сезон: ${currentSeason}`);

      // 1. Фильтруем и оцениваем вещи для текущего сезона
      const seasonalItems = this.evaluateSeasonalSuitability(wardrobeItems, currentSeason);
      
      // 2. Группируем по категориям
      const itemsByCategory = this.groupByCategory(seasonalItems);
      
      // 3. Генерируем 3 разные стратегии
      // ВАЖНО: Перемешиваем порядок стратегий для разнообразия
      const strategies = ['balanced', 'popular', 'experimental'].sort(() => Math.random() - 0.5);
      const capsules = [];
      
      // Пытаемся сгенерировать до 5 раз для каждой стратегии
      const maxAttempts = 5;
      
      for (const strategy of strategies) {
        let capsule = null;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          capsule = this.generateSingleCapsule(
            itemsByCategory, 
            currentSeason, 
            strategy,
            [...capsules, ...existingCapsules],
            excludeCombinations
          );
          
          if (capsule) {
            capsules.push(capsule);
            break; // Успешно сгенерировали, переходим к следующей стратегии
          }
        }
        
        if (!capsule) {
          logger.warn(`Не удалось сгенерировать капсулу ${strategy} за ${maxAttempts} попыток`);
        }
      }

      logger.info(`Сгенерировано ${capsules.length} капсул`);
      return capsules;

    } catch (error) {
      logger.error('Ошибка генерации капсул:', error);
      throw error;
    }
  }

  /**
   * Оценивает сезонную пригодность вещей (игнорируя поле season)
   */
  evaluateSeasonalSuitability(items, currentSeason) {
    return items.map(item => {
      const category = item.category?.toUpperCase();
      const subtype = item.subtype?.toLowerCase() || '';
      
      // Для категорий "всесезонных" - высокий приоритет
      if (this.seasonalityRules.allSeason.includes(category)) {
        return { ...item, seasonScore: 1.0 };
      }

      // Оцениваем по подтипу
      const seasonRules = this.seasonalityRules.seasonal[currentSeason];
      if (!seasonRules) {
        return { ...item, seasonScore: 0.7 };
      }

      // Проверяем предпочтительные подтипы
      const isPreferred = seasonRules.preferred.some(preferred => 
        subtype.includes(preferred.toLowerCase())
      );
      
      // Проверяем нежелательные подтипы
      const isAvoided = seasonRules.avoid.some(avoided => 
        subtype.includes(avoided.toLowerCase())
      );

      let seasonScore = 0.7; // Базовый score
      if (isPreferred) seasonScore = 1.0;
      if (isAvoided) seasonScore = 0.3;

      return { ...item, seasonScore };
    });
  }

  /**
   * Группирует вещи по категориям
   */
  groupByCategory(items) {
    const groups = {};
    
    items.forEach(item => {
      const category = item.category?.toUpperCase() || 'UNKNOWN';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return groups;
  }

  /**
   * Генерирует одну капсулу по стратегии
   */
  generateSingleCapsule(itemsByCategory, currentSeason, strategy, existingCapsules, excludeCombinations) {
    const layerRules = this.layeringRules[currentSeason];
    if (!layerRules) {
      throw new Error(`Неизвестный сезон: ${currentSeason}`);
    }

    const combination = [];
    const usedCategories = new Set();

    // 1. Добавляем обязательные категории
    for (const category of layerRules.required) {
      const item = this.selectItemFromCategory(
        itemsByCategory[category] || [], 
        strategy, 
        combination,
        currentSeason
      );
      if (item) {
        combination.push(item);
        usedCategories.add(category);
      }
    }

    // 2. Добавляем рекомендуемые категории
    for (const category of layerRules.recommended) {
      if (combination.length >= 6) break; // Увеличили лимит до 6
      
      const item = this.selectItemFromCategory(
        itemsByCategory[category] || [], 
        strategy, 
        combination,
        currentSeason
      );
      if (item) {
        combination.push(item);
        usedCategories.add(category);
      }
    }

    // 3. Добавляем опциональные категории для разнообразия
    // ВАЖНО: Перемешиваем порядок для случайности
    const shuffledOptional = [...layerRules.optional].sort(() => Math.random() - 0.5);
    
    for (const category of shuffledOptional) {
      if (combination.length >= 8) break; // Увеличили лимит до 8 (базовая одежда + аксессуары)
      if (usedCategories.has(category)) continue;
      
      const item = this.selectItemFromCategory(
        itemsByCategory[category] || [], 
        strategy, 
        combination,
        currentSeason
      );
      if (item) {
        combination.push(item);
        usedCategories.add(category);
      }
    }

    // 4. УМНОЕ ДОБАВЛЕНИЕ АКСЕССУАРОВ по сезону
    const accessoryRules = layerRules.accessories;
    if (accessoryRules) {
      const currentAccessoriesCount = combination.filter(item => 
        accessoryRules.priority.includes(item.category?.toUpperCase())
      ).length;

      // Если аксессуаров меньше рекомендуемого, добавляем еще
      if (currentAccessoriesCount < accessoryRules.recommended) {
        const neededAccessories = accessoryRules.recommended - currentAccessoriesCount;
        
        // Проходим по приоритетным категориям
        for (const category of accessoryRules.priority) {
          if (currentAccessoriesCount >= accessoryRules.max) break;
          if (usedCategories.has(category)) continue;
          if (combination.length >= 8) break;
          
          const item = this.selectItemFromCategory(
            itemsByCategory[category] || [], 
            strategy, 
            combination,
            currentSeason
          );
          
          if (item) {
            combination.push(item);
            usedCategories.add(category);
            logger.info(`Добавлен аксессуар ${category} для сезона ${currentSeason}`);
          }
        }
      }
    }

    // Проверяем минимальное количество вещей
    if (combination.length < 3) {
      logger.warn(`Недостаточно вещей для капсулы ${strategy}: ${combination.length}`);
      return null;
    }

    // Логируем состав капсулы для отладки
    const categories = combination.map(item => item.category).join(', ');
    logger.info(`Капсула ${strategy}: ${combination.length} вещей (${categories})`);

    // Проверяем уникальность
    if (this.isDuplicateCombination(combination, existingCapsules, excludeCombinations)) {
      logger.info(`Капсула ${strategy} дублирует существующую (${combination.length} вещей), пропускаем`);
      return null;
    }

    // Оцениваем гармонию
    const harmonyScore = this.evaluateHarmony(combination);
    
    return {
      id: Date.now() + Math.random(), // Временный ID
      name: this.generateCapsuleName(combination, strategy, currentSeason),
      description: this.generateCapsuleDescription(combination, strategy, currentSeason),
      reasoning: this.generateReasoning(combination, currentSeason, harmonyScore),
      recommendations: this.generateRecommendations(combination, currentSeason),
      itemIds: combination.map(item => item.id),
      items: combination.map(item => ({
        id: item.id,
        category: item.category,
        subtype: item.subtype,
        color: item.color,
        // ИСПРАВЛЕНО: Для товаров из стока добавляем префикс /stock/ и cache busting параметр
        // Cache busting: меняйте версию при обновлении изображений в стоке
        imageUrl: item.imageUrl || (item.isFromStock 
          ? `/uploads/stock/${item.imagePath?.replace(/\\/g, '/')}?v=20251110`
          : `/uploads/${item.imagePath?.replace(/\\/g, '/')}`),
        // Сохраняем метаданные товаров из стока
        isFromStock: item.isFromStock || false,
        ...(item.isFromStock && {
          stockId: item.stockId,
          productName: item.productName,
          price: item.price,
          productUrl: item.productUrl,
          affiliateLink: item.affiliateLink,
          priority: item.priority
        })
      })),
      metadata: {
        strategy,
        season: currentSeason,
        harmonyScore: Math.round(harmonyScore * 100),
        isGenerated: true,
        source: 'smart_algorithm'
      }
    };
  }

  /**
   * Выбирает вещь из категории по стратегии
   */
  selectItemFromCategory(items, strategy, currentCombination, currentSeason) {
    if (!items || items.length === 0) return null;

    // Исключаем уже использованные вещи
    const availableItems = items.filter(item => 
      !currentCombination.some(used => used.id === item.id)
    );

    if (availableItems.length === 0) return null;

    // Применяем стратегию выбора
    let candidates = [];

    switch (strategy) {
      case 'popular':
        // Приоритет популярным вещам (usageCount > 3)
        candidates = availableItems.filter(item => (item.usageCount || 0) > 3);
        if (candidates.length === 0) {
          candidates = availableItems.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        }
        break;

      case 'experimental':
        // Приоритет новым и редко используемым вещам
        const newItems = availableItems.filter(item => (item.usageCount || 0) === 0);
        const rareItems = availableItems.filter(item => {
          const usage = item.usageCount || 0;
          return usage >= 1 && usage <= 2;
        });
        
        // Ограничиваем количество новых вещей в экспериментальной капсуле
        const newItemsInCombo = currentCombination.filter(item => (item.usageCount || 0) === 0).length;
        
        if (newItems.length > 0 && newItemsInCombo < 2) {
          candidates = newItems;
        } else if (rareItems.length > 0) {
          candidates = rareItems;
        } else {
          candidates = availableItems;
        }
        break;

      default: // balanced
        // Приоритет редко используемым вещам (1-3)
        candidates = availableItems.filter(item => {
          const usage = item.usageCount || 0;
          return usage >= 1 && usage <= 3;
        });
        if (candidates.length === 0) {
          candidates = availableItems;
        }
        break;
    }

    // Сортируем по комплексному score: сезонность + цвет + визуальная гармония + приоритет
    candidates.sort((a, b) => {
      // Веса для разных факторов
      const SEASON_WEIGHT = 0.20;   // Сезонная пригодность
      const COLOR_WEIGHT = 0.30;    // Цветовая гармония
      const VISUAL_WEIGHT = 0.35;   // Визуальная гармония (самый важный!)
      const PRIORITY_WEIGHT = 0.15; // Приоритет товара из стока

      // Для товаров из стока добавляем бонус за priority
      const aPriority = a.isFromStock ? (a.priority || 0) / 100 : 0;
      const bPriority = b.isFromStock ? (b.priority || 0) / 100 : 0;

      const aScore = 
        (a.seasonScore || 0.5) * SEASON_WEIGHT +
        this.getColorHarmonyScore(a, currentCombination) * COLOR_WEIGHT +
        this.getVisualHarmonyScore(a, currentCombination) * VISUAL_WEIGHT +
        aPriority * PRIORITY_WEIGHT;
      
      const bScore = 
        (b.seasonScore || 0.5) * SEASON_WEIGHT +
        this.getColorHarmonyScore(b, currentCombination) * COLOR_WEIGHT +
        this.getVisualHarmonyScore(b, currentCombination) * VISUAL_WEIGHT +
        bPriority * PRIORITY_WEIGHT;
      
      return bScore - aScore;
    });

    // Добавляем разнообразие: для experimental берем из топ-3, для других - лучшую
    let selectedItem;
    if (strategy === 'experimental' && candidates.length >= 3) {
      // Выбираем случайно из топ-3 для разнообразия
      const topCandidates = candidates.slice(0, 3);
      selectedItem = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    } else if (strategy === 'popular' && candidates.length >= 2) {
      // Для popular берем из топ-2
      const topCandidates = candidates.slice(0, 2);
      selectedItem = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    } else {
      selectedItem = candidates[0];
    }

    return selectedItem;
  }

  /**
   * Оценивает цветовую гармонию с уже выбранными вещами
   */
  getColorHarmonyScore(item, currentCombination) {
    if (currentCombination.length === 0) return 0.5;

    const itemColor = this.normalizeColor(item.color);
    let totalScore = 0;

    for (const existingItem of currentCombination) {
      const existingColor = this.normalizeColor(existingItem.color);
      totalScore += this.calculateColorCompatibility(itemColor, existingColor);
    }

    return totalScore / currentCombination.length;
  }

  /**
   * Нормализует цвет для сравнения
   */
  normalizeColor(color) {
    if (!color) return 'неизвестный';
    
    const normalized = color.toLowerCase().trim();
    
    // Убираем оттенки для базового сравнения
    const baseColor = normalized
      .replace(/светло-|темно-|ярко-|бледно-/, '')
      .replace(/light |dark |bright |pale /, '');
    
    return baseColor;
  }

  /**
   * Вычисляет косинусное сходство между двумя векторами
   * @param {Array<number>} vec1 - Первый вектор
   * @param {Array<number>} vec2 - Второй вектор
   * @returns {number} - Сходство от 0 до 1
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length || vec1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Оценивает визуальную гармонию вещи с уже выбранными вещами
   * Использует векторное сходство (embeddings) для оценки визуальной совместимости
   * @param {Object} item - Вещь для оценки
   * @param {Array<Object>} currentCombination - Уже выбранные вещи
   * @returns {number} - Score от 0 до 1
   */
  getVisualHarmonyScore(item, currentCombination) {
    if (currentCombination.length === 0) {
      return 0.5; // Нейтральный score для первой вещи
    }

    // Парсим embedding если это JSON строка
    let itemEmbedding = item.embedding;
    if (typeof itemEmbedding === 'string') {
      try {
        itemEmbedding = JSON.parse(itemEmbedding);
      } catch (e) {
        logger.warn('Failed to parse item embedding', { itemId: item.id });
        return 0.5;
      }
    }

    if (!itemEmbedding || !Array.isArray(itemEmbedding) || itemEmbedding.length === 0) {
      return 0.5; // Нет embedding - нейтральный score
    }

    let totalSimilarity = 0;
    let count = 0;

    for (const existingItem of currentCombination) {
      // Парсим embedding существующей вещи
      let existingEmbedding = existingItem.embedding;
      if (typeof existingEmbedding === 'string') {
        try {
          existingEmbedding = JSON.parse(existingEmbedding);
        } catch (e) {
          continue;
        }
      }

      if (existingEmbedding && Array.isArray(existingEmbedding) && existingEmbedding.length > 0) {
        const similarity = this.cosineSimilarity(itemEmbedding, existingEmbedding);
        
        // Оптимальное сходство: 0.6-0.8 (похожи, но не идентичны)
        // Слишком высокое сходство (>0.9) = почти одинаковые вещи (плохо)
        // Слишком низкое сходство (<0.4) = несовместимые вещи (плохо)
        let adjustedSimilarity;
        if (similarity >= 0.6 && similarity <= 0.8) {
          adjustedSimilarity = 1.0; // Идеальный диапазон
        } else if (similarity > 0.8) {
          adjustedSimilarity = 0.7; // Слишком похожи
        } else if (similarity >= 0.4) {
          adjustedSimilarity = 0.8; // Приемлемо
        } else {
          adjustedSimilarity = 0.4; // Слишком разные
        }

        totalSimilarity += adjustedSimilarity;
        count++;
      }
    }

    return count > 0 ? totalSimilarity / count : 0.5;
  }

  /**
   * Вычисляет совместимость двух цветов
   * Учитывает все 52 цвета из Color_prompt.md
   * 
   * @param {string} color1 - Первый цвет (на русском)
   * @param {string} color2 - Второй цвет (на русском)
   * @returns {number} - Score от 0 до 1
   */
  calculateColorCompatibility(color1, color2) {
    // Одинаковые цвета - низкий приоритет (избегаем монотонности)
    if (color1 === color2) return 0.3;

    // Нейтральные цвета сочетаются со всем (высокий приоритет)
    if (this.colorHarmony.neutral.includes(color1) || this.colorHarmony.neutral.includes(color2)) {
      return 1.0;
    }

    // Проверяем комплементарные пары (прямая проверка)
    const complementary1 = this.colorHarmony.complementary[color1];
    if (complementary1 && complementary1.includes(color2)) {
      return 0.9;
    }

    // Проверяем комплементарные пары (обратная проверка)
    const complementary2 = this.colorHarmony.complementary[color2];
    if (complementary2 && complementary2.includes(color1)) {
      return 0.9;
    }

    // Проверяем цветовые схемы (гармоничные комбинации)
    for (const [schemeName, schemeColors] of Object.entries(this.colorHarmony.schemes)) {
      if (schemeColors.includes(color1) && schemeColors.includes(color2)) {
        // Разные приоритеты для разных схем
        if (schemeName === 'monochrome' || schemeName === 'classic') {
          return 0.85; // Высокий приоритет для классических схем
        }
        return 0.8; // Хороший приоритет для остальных схем
      }
    }

    // Базовая совместимость (цвета не конфликтуют, но и не идеальны)
    return 0.4;
  }

  /**
   * Проверяет, является ли комбинация дубликатом
   */
  isDuplicateCombination(combination, existingCapsules, excludeCombinations) {
    const currentIds = new Set(combination.map(item => item.id));

    // Проверяем исключенные комбинации (строгий порог 90%)
    for (const excludedIds of excludeCombinations) {
      const excludedSet = new Set(excludedIds);
      const intersection = new Set([...currentIds].filter(id => excludedSet.has(id)));
      const similarity = intersection.size / Math.max(currentIds.size, excludedSet.size);
      
      // Строгий порог для исключенных комбинаций
      if (similarity > 0.9) {
        return true;
      }
    }

    // Проверяем существующие капсулы (мягкий порог 80%)
    for (const capsule of existingCapsules) {
      const existingIds = new Set(capsule.itemIds || []);
      const intersection = new Set([...currentIds].filter(id => existingIds.has(id)));
      const similarity = intersection.size / Math.max(currentIds.size, existingIds.size);
      
      // Мягкий порог для существующих капсул
      // Позволяет генерировать похожие капсулы с 1-2 разными вещами
      if (similarity > 0.8) {
        return true;
      }
    }

    return false;
  }

  /**
   * Оценивает общую гармонию капсулы
   * Учитывает цвет, стиль и визуальное сходство
   */
  evaluateHarmony(combination) {
    let colorScore = 0;
    let styleScore = 0;
    let visualScore = 0;
    let count = 0;

    // Оцениваем попарную совместимость
    for (let i = 0; i < combination.length; i++) {
      for (let j = i + 1; j < combination.length; j++) {
        const item1 = combination[i];
        const item2 = combination[j];

        // Цветовая совместимость
        const color1 = this.normalizeColor(item1.color);
        const color2 = this.normalizeColor(item2.color);
        colorScore += this.calculateColorCompatibility(color1, color2);

        // Стилевая совместимость
        const style1 = item1.style?.toLowerCase() || 'повседневный';
        const style2 = item2.style?.toLowerCase() || 'повседневный';
        
        if (style1 === style2) {
          styleScore += 1.0;
        } else if (this.styleCompatibility[style1]?.includes(style2)) {
          styleScore += 0.8;
        } else {
          styleScore += 0.4;
        }

        // Визуальная совместимость (через embeddings)
        let embedding1 = item1.embedding;
        let embedding2 = item2.embedding;

        if (typeof embedding1 === 'string') {
          try { embedding1 = JSON.parse(embedding1); } catch (e) { embedding1 = null; }
        }
        if (typeof embedding2 === 'string') {
          try { embedding2 = JSON.parse(embedding2); } catch (e) { embedding2 = null; }
        }

        if (embedding1 && embedding2 && Array.isArray(embedding1) && Array.isArray(embedding2)) {
          const similarity = this.cosineSimilarity(embedding1, embedding2);
          
          // Оптимальное сходство: 0.6-0.8
          if (similarity >= 0.6 && similarity <= 0.8) {
            visualScore += 1.0;
          } else if (similarity > 0.8) {
            visualScore += 0.7; // Слишком похожи
          } else if (similarity >= 0.4) {
            visualScore += 0.8;
          } else {
            visualScore += 0.4;
          }
        } else {
          visualScore += 0.5; // Нет embedding - нейтральный score
        }

        count++;
      }
    }

    if (count === 0) return 0.5;

    const avgColorScore = colorScore / count;
    const avgStyleScore = styleScore / count;
    const avgVisualScore = visualScore / count;

    // Веса: визуальная гармония самая важная (40%), цвет (35%), стиль (25%)
    return (avgColorScore * 0.35 + avgStyleScore * 0.25 + avgVisualScore * 0.40);
  }

  /**
   * Генерирует название капсулы
   */
  generateCapsuleName(combination, strategy, season) {
    const seasonNames = {
      winter: 'Зимний',
      spring: 'Весенний',
      summer: 'Летний',
      autumn: 'Осенний'
    };

    const strategyNames = {
      balanced: ['Комфорт', 'Баланс', 'Гармония'],
      popular: ['Классика', 'Проверенный', 'Любимый'],
      experimental: ['Новый', 'Свежий', 'Эксперимент']
    };

    const seasonName = seasonNames[season] || '';
    const strategyOptions = strategyNames[strategy] || ['Стильный'];
    const strategyName = strategyOptions[Math.floor(Math.random() * strategyOptions.length)];

    return `${strategyName} ${seasonName}`.trim();
  }

  /**
   * Генерирует описание капсулы
   */
  generateCapsuleDescription(combination, strategy, season) {
    const seasonDescriptions = {
      winter: 'для холодного сезона',
      spring: 'для переходного периода',
      summer: 'для теплой погоды',
      autumn: 'для прохладных дней'
    };

    const strategyDescriptions = {
      balanced: 'Сбалансированный образ',
      popular: 'Проверенная комбинация',
      experimental: 'Экспериментальный лук'
    };

    const seasonDesc = seasonDescriptions[season] || '';
    const strategyDesc = strategyDescriptions[strategy] || 'Стильный образ';

    return `${strategyDesc} ${seasonDesc} из ${combination.length} вещей.`;
  }

  /**
   * Генерирует обоснование выбора
   */
  generateReasoning(combination, season, harmonyScore) {
    const layerRules = this.layeringRules[season];
    const layers = [];

    // Определяем слои
    const baseItems = combination.filter(item => 
      layerRules.layers.base.includes(item.category?.toUpperCase())
    );
    const middleItems = combination.filter(item => 
      layerRules.layers.middle.includes(item.category?.toUpperCase())
    );
    const outerItems = combination.filter(item => 
      layerRules.layers.outer.includes(item.category?.toUpperCase())
    );

    if (baseItems.length > 0) {
      layers.push(`базовый слой (${baseItems.map(i => i.subtype).join(', ')})`);
    }
    if (middleItems.length > 0) {
      layers.push(`средний слой (${middleItems.map(i => i.subtype).join(', ')})`);
    }
    if (outerItems.length > 0) {
      layers.push(`верхний слой (${outerItems.map(i => i.subtype).join(', ')})`);
    }

    let reasoning = `Многослойный образ: ${layers.join(' + ')}.`;
    
    // Оценка гармонии с учетом визуального сходства
    if (harmonyScore > 0.75) {
      reasoning += ' Отличная визуальная и цветовая гармония.';
    } else if (harmonyScore > 0.6) {
      reasoning += ' Хорошее сочетание вещей.';
    } else if (harmonyScore > 0.45) {
      reasoning += ' Сбалансированная комбинация.';
    }

    return reasoning;
  }

  /**
   * Умная подмена вещей из стока
   * Заменяет вещи пользователя на товары из каталога ТОЛЬКО если они лучше подходят
   * 
   * @param {Array} capsule - Сгенерированная капсула с вещами пользователя
   * @param {Object} prisma - Prisma client для доступа к БД
   * @param {string} currentSeason - Текущий сезон
   * @returns {Promise<Array>} - Капсула с подмененными вещами (если есть улучшения)
   */
  async enhanceWithStockItems(capsule, prisma, currentSeason) {
    try {
      logger.info(`Проверка возможности улучшения капсулы товарами из стока`);
      
      const enhancedCapsule = [];
      let replacementsCount = 0;
      
      for (const userItem of capsule) {
        // Ищем товары из стока той же категории
        const stockCandidates = await prisma.stockItem.findMany({
          where: {
            category: userItem.category,
            isActive: true,
            // Опционально: фильтр по полу если есть
            ...(userItem.gender && { gender: userItem.gender })
          }
        });
        
        if (stockCandidates.length === 0) {
          // Нет товаров из стока - оставляем оригинальную вещь
          enhancedCapsule.push(userItem);
          continue;
        }
        
        // Оцениваем каждый товар из стока
        const scoredCandidates = stockCandidates.map(stockItem => {
          const score = this.calculateStockItemScore(
            stockItem,
            userItem,
            capsule,
            currentSeason
          );
          return { item: stockItem, score };
        });
        
        // Сортируем по score (лучшие первыми)
        scoredCandidates.sort((a, b) => b.score - a.score);
        
        const bestStockItem = scoredCandidates[0];
        
        // Вычисляем score оригинальной вещи
        const userItemScore = this.calculateUserItemScore(
          userItem,
          capsule,
          currentSeason
        );
        
        // КРИТЕРИЙ ЗАМЕНЫ: товар из стока должен быть ЗНАЧИТЕЛЬНО лучше
        // Используем порог 0.15 (15%) для избежания незначительных замен
        const REPLACEMENT_THRESHOLD = 0.15;
        
        if (bestStockItem.score > userItemScore + REPLACEMENT_THRESHOLD) {
          // Товар из стока лучше - заменяем!
          logger.info(
            `Замена: ${userItem.subtype} (score: ${userItemScore.toFixed(2)}) → ` +
            `${bestStockItem.item.subtype} (score: ${bestStockItem.score.toFixed(2)})`
          );
          
          enhancedCapsule.push({
            ...bestStockItem.item,
            // Добавляем метаданные о замене
            isFromStock: true,
            replacedItem: {
              id: userItem.id,
              subtype: userItem.subtype,
              color: userItem.color,
              score: userItemScore
            },
            replacementScore: bestStockItem.score,
            replacementReason: this.getReplacementReason(
              bestStockItem.score,
              userItemScore,
              bestStockItem.item,
              userItem
            )
          });
          
          replacementsCount++;
        } else {
          // Оригинальная вещь лучше или разница незначительна - оставляем
          enhancedCapsule.push(userItem);
        }
      }
      
      logger.info(`Улучшение завершено: ${replacementsCount} замен из ${capsule.length} вещей`);
      
      return {
        items: enhancedCapsule,
        replacementsCount,
        hasReplacements: replacementsCount > 0
      };
      
    } catch (error) {
      logger.error('Ошибка улучшения капсулы товарами из стока:', error);
      // В случае ошибки возвращаем оригинальную капсулу
      return {
        items: capsule,
        replacementsCount: 0,
        hasReplacements: false,
        error: error.message
      };
    }
  }
  
  /**
   * Вычисляет score товара из стока
   */
  calculateStockItemScore(stockItem, userItem, capsule, currentSeason) {
    // Веса для разных факторов (сумма = 1.0)
    const SEASON_WEIGHT = 0.20;    // Сезонная пригодность
    const COLOR_WEIGHT = 0.30;     // Цветовая гармония
    const VISUAL_WEIGHT = 0.35;    // Визуальная гармония (embeddings)
    const PRIORITY_WEIGHT = 0.15;  // Приоритет товара (priority поле)
    
    // 1. Сезонная пригодность
    const seasonScore = this.evaluateSeasonalSuitability([stockItem], currentSeason)[0].seasonScore || 0.5;
    
    // 2. Цветовая гармония с остальными вещами в капсуле
    const otherItems = capsule.filter(item => item.id !== userItem.id);
    const colorScore = this.getColorHarmonyScore(stockItem, otherItems);
    
    // 3. Визуальная гармония (embeddings)
    const visualScore = this.getVisualHarmonyScore(stockItem, otherItems);
    
    // 4. Приоритет товара (0-100 → 0-1)
    const priorityScore = (stockItem.priority || 0) / 100;
    
    const totalScore = 
      seasonScore * SEASON_WEIGHT +
      colorScore * COLOR_WEIGHT +
      visualScore * VISUAL_WEIGHT +
      priorityScore * PRIORITY_WEIGHT;
    
    return totalScore;
  }
  
  /**
   * Вычисляет score вещи пользователя (для сравнения)
   */
  calculateUserItemScore(userItem, capsule, currentSeason) {
    // Используем те же веса, но без priority (у вещей пользователя нет priority)
    const SEASON_WEIGHT = 0.25;    // Увеличиваем веса остальных факторов
    const COLOR_WEIGHT = 0.35;
    const VISUAL_WEIGHT = 0.40;
    
    const seasonScore = this.evaluateSeasonalSuitability([userItem], currentSeason)[0].seasonScore || 0.5;
    const otherItems = capsule.filter(item => item.id !== userItem.id);
    const colorScore = this.getColorHarmonyScore(userItem, otherItems);
    const visualScore = this.getVisualHarmonyScore(userItem, otherItems);
    
    const totalScore = 
      seasonScore * SEASON_WEIGHT +
      colorScore * COLOR_WEIGHT +
      visualScore * VISUAL_WEIGHT;
    
    return totalScore;
  }
  
  /**
   * Генерирует причину замены для UI
   */
  getReplacementReason(stockScore, userScore, stockItem, userItem) {
    const scoreDiff = stockScore - userScore;
    const reasons = [];
    
    // Анализируем что именно лучше
    if (scoreDiff > 0.3) {
      reasons.push('Значительно лучше подходит к образу');
    } else if (scoreDiff > 0.2) {
      reasons.push('Лучше сочетается с другими вещами');
    } else {
      reasons.push('Немного улучшает общую гармонию');
    }
    
    // Добавляем конкретные улучшения
    if (stockItem.color !== userItem.color) {
      reasons.push(`Цвет "${stockItem.color}" лучше гармонирует`);
    }
    
    if (stockItem.priority && stockItem.priority > 50) {
      reasons.push('Популярный товар');
    }
    
    return reasons.join('. ');
  }

  /**
   * Генерирует рекомендации с учетом сезонных правил для аксессуаров
   */
  generateRecommendations(combination, season) {
    const recommendations = [];
    
    // Получаем правила для текущего сезона
    const layerRules = this.layeringRules[season];
    const accessoryRules = layerRules?.accessories;
    
    if (accessoryRules) {
      // Подсчитываем текущие аксессуары
      const currentAccessories = combination.filter(item => 
        accessoryRules.priority.includes(item.category?.toUpperCase())
      );
      
      const accessoriesCount = currentAccessories.length;
      
      // Проверяем минимум
      if (accessoriesCount < accessoryRules.min) {
        recommendations.push('Добавьте аксессуары для завершения образа');
      }
      // Проверяем рекомендуемое количество
      else if (accessoriesCount < accessoryRules.recommended) {
        // Сезонные рекомендации
        if (season === 'winter') {
          const hasHeadwear = currentAccessories.some(item => 
            item.category?.toUpperCase() === 'HEADWEAR'
          );
          if (!hasHeadwear) {
            recommendations.push('Добавьте шапку или шарф для тепла');
          } else {
            recommendations.push('Можно добавить перчатки или шарф');
          }
        } else if (season === 'autumn') {
          recommendations.push('Можно добавить шарф или шапку');
        } else if (season === 'summer') {
          recommendations.push('Можно добавить солнцезащитные очки или украшения');
        } else if (season === 'spring') {
          recommendations.push('Можно добавить легкий шарф или очки');
        }
      }
    }

    // Сезонные рекомендации по одежде
    if (season === 'winter' || season === 'autumn') {
      const hasOuterwear = combination.some(item => 
        item.category?.toUpperCase() === 'OUTERWEAR'
      );
      if (!hasOuterwear) {
        recommendations.push('Рассмотрите добавление верхней одежды');
      }
    }

    // Если все хорошо
    if (recommendations.length === 0) {
      recommendations.push('Образ готов к использованию');
    }

    return recommendations.join('. ');
  }
}

module.exports = SmartCapsuleGenerator;