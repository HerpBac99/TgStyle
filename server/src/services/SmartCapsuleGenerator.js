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

    // Правила сочетаемости цветов (расширенные)
    this.colorHarmony = {
      // Нейтральные цвета - сочетаются со всем
      neutral: ['черный', 'белый', 'серый', 'бежевый', 'кремовый', 'слоновая кость'],
      
      // Цветовые схемы
      schemes: {
        monochrome: ['черный', 'белый', 'серый'],
        earth: ['коричневый', 'бежевый', 'оливковый', 'хаки'],
        classic: ['темно-синий', 'белый', 'серый', 'черный'],
        warm: ['красный', 'оранжевый', 'желтый', 'коричневый'],
        cool: ['синий', 'зеленый', 'фиолетовый', 'серый']
      },
      
      // Комплементарные пары
      complementary: {
        'красный': ['зеленый', 'белый', 'черный', 'серый'],
        'синий': ['оранжевый', 'желтый', 'белый', 'серый'],
        'зеленый': ['красный', 'розовый', 'белый', 'бежевый'],
        'желтый': ['фиолетовый', 'синий', 'серый', 'черный'],
        'фиолетовый': ['желтый', 'зеленый', 'белый', 'серый']
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
      const strategies = ['balanced', 'popular', 'experimental'];
      const capsules = [];
      
      for (const strategy of strategies) {
        const capsule = this.generateSingleCapsule(
          itemsByCategory, 
          currentSeason, 
          strategy,
          [...capsules, ...existingCapsules],
          excludeCombinations
        );
        
        if (capsule) {
          capsules.push(capsule);
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
      if (combination.length >= 5) break; // Ограничиваем размер капсулы
      
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
    for (const category of layerRules.optional) {
      if (combination.length >= 4) break;
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

    // Проверяем минимальное количество вещей
    if (combination.length < 3) {
      logger.warn(`Недостаточно вещей для капсулы ${strategy}: ${combination.length}`);
      return null;
    }

    // Проверяем уникальность
    if (this.isDuplicateCombination(combination, existingCapsules, excludeCombinations)) {
      logger.info(`Капсула ${strategy} дублирует существующую, пропускаем`);
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
        imageUrl: item.imageUrl || `/uploads/${item.imagePath?.replace(/\\/g, '/')}`
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

    // Сортируем по сезонной пригодности и выбираем лучшую
    candidates.sort((a, b) => {
      const aScore = (a.seasonScore || 0.5) + this.getColorHarmonyScore(a, currentCombination);
      const bScore = (b.seasonScore || 0.5) + this.getColorHarmonyScore(b, currentCombination);
      return bScore - aScore;
    });

    return candidates[0];
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
   * Вычисляет совместимость двух цветов
   */
  calculateColorCompatibility(color1, color2) {
    if (color1 === color2) return 0.3; // Одинаковые цвета - низкий приоритет

    // Нейтральные цвета сочетаются со всем
    if (this.colorHarmony.neutral.includes(color1) || this.colorHarmony.neutral.includes(color2)) {
      return 1.0;
    }

    // Проверяем комплементарные пары
    const complementary = this.colorHarmony.complementary[color1];
    if (complementary && complementary.includes(color2)) {
      return 0.9;
    }

    // Проверяем цветовые схемы
    for (const scheme of Object.values(this.colorHarmony.schemes)) {
      if (scheme.includes(color1) && scheme.includes(color2)) {
        return 0.8;
      }
    }

    return 0.4; // Базовая совместимость
  }

  /**
   * Проверяет, является ли комбинация дубликатом
   */
  isDuplicateCombination(combination, existingCapsules, excludeCombinations) {
    const currentIds = new Set(combination.map(item => item.id));

    // Проверяем исключенные комбинации
    for (const excludedIds of excludeCombinations) {
      const excludedSet = new Set(excludedIds);
      const intersection = new Set([...currentIds].filter(id => excludedSet.has(id)));
      const similarity = intersection.size / Math.max(currentIds.size, excludedSet.size);
      
      if (similarity > 0.7) {
        return true;
      }
    }

    // Проверяем существующие капсулы
    for (const capsule of existingCapsules) {
      const existingIds = new Set(capsule.itemIds || []);
      const intersection = new Set([...currentIds].filter(id => existingIds.has(id)));
      const similarity = intersection.size / Math.max(currentIds.size, existingIds.size);
      
      if (similarity > 0.7) {
        return true;
      }
    }

    return false;
  }

  /**
   * Оценивает общую гармонию капсулы
   */
  evaluateHarmony(combination) {
    let colorScore = 0;
    let styleScore = 0;
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

        count++;
      }
    }

    if (count === 0) return 0.5;

    const avgColorScore = colorScore / count;
    const avgStyleScore = styleScore / count;

    return (avgColorScore * 0.6 + avgStyleScore * 0.4);
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
    
    if (harmonyScore > 0.7) {
      reasoning += ' Отличная цветовая гармония.';
    } else if (harmonyScore > 0.5) {
      reasoning += ' Хорошее сочетание цветов.';
    }

    return reasoning;
  }

  /**
   * Генерирует рекомендации
   */
  generateRecommendations(combination, season) {
    const recommendations = [];
    
    // Проверяем наличие аксессуаров
    const hasAccessories = combination.some(item => 
      item.category?.toUpperCase() === 'ACCESSORIES'
    );
    
    if (!hasAccessories) {
      recommendations.push('Добавьте аксессуары для завершения образа');
    }

    // Сезонные рекомендации
    if (season === 'winter') {
      const hasOuterwear = combination.some(item => 
        item.category?.toUpperCase() === 'OUTERWEAR'
      );
      if (!hasOuterwear) {
        recommendations.push('Рассмотрите добавление верхней одежды');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Образ готов к использованию');
    }

    return recommendations.join('. ');
  }
}

module.exports = SmartCapsuleGenerator;