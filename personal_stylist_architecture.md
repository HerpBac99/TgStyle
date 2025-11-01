# Персональный AI-ассистент стилиста - Детальная архитектура

## 🎯 Концепция в двух словах

**Персональный AI-ассистент** - это не просто анализ отдельных фото, а **умная система**, которая:
- Изучает твой стиль со временем  
- Помнит все предыдущие анализы
- Дает персонализированные рекомендации
- Адаптируется под твои предпочтения

**Аналогия:** Представь, что у тебя есть личный стилист, который:
- Запомнил твой гардероб
- Знает, что тебе нравится
- Видит твою историю анализов
- Может предсказать, что тебе подойдет

## 🏗️ Архитектурное решение

### 1. 数据收集 и профилирование (Data Collection & Profiling)

#### Что собираем о пользователе:
```typescript
interface UserProfile {
  // История всех анализов
  analysisHistory: AnalysisEntry[];
  
  // Гардероб с AI-тегами
  wardrobeItems: WardrobeItem[];
  
  // Поведенческие паттерны
  behaviorPatterns: BehaviorProfile;
  
  // Предпочитаемые стили
  stylePreferences: StyleProfile;
  
  // Статистика использования
  usageStats: UsageStats;
}

interface AnalysisEntry {
  id: number;
  imageUrl: string;
  analysisText: string;
  selectedTheme: string;
  likedElements: string[]; // что отметил как понравившееся
  timestamp: Date;
  userFeedback?: 'positive' | 'negative' | 'neutral';
}

interface WardrobeItem {
  id: number;
  category: ClothingCategory;
  color: string;
  material: string;
  style: string;
  season: string;
  // AI-генерированные теги
  aiTags: string[];
  // Частота использования в капсулах
  usageCount: number;
}

interface StyleProfile {
  favoriteColors: ColorPreference[];
  preferredStyles: string[]; // casual, business, sport
  bodyTypeFeatures: BodyFeatures;
  ageGroup: 'teen' | 'young' | 'adult' | 'senior';
  lifestyleActivity: ActivityLevel;
  color_palette: ColorPalette;
}

interface BehaviorProfile {
  // Время использования анализов
  peakUsageHours: number[];
  
  // Типичные темы анализа
  frequentThemes: ThemePreference[];
  
  // Паттеры лайков/дизлайков
  likedItems: PatternSignature;
  
  // Как часто обновляет гардероб
  wardrobeUpdateFrequency: 'rarely' | 'monthly' | 'weekly';
  
  // Предпочитаемые типы рекомендаций
  recommendationTypes: 'budget' | 'premium' | 'any';
}
```

#### Как собираем данные:
```typescript
// Extending existing AnalysisManager
class EnhancedAnalysisManager extends AnalysisManager {
  private userProfileManager: UserProfileManager;
  
  async analyzeImage(imageBase64: string, theme: string) {
    // 1. Стандартный анализ через FastVLM
    const analysisResult = await super.analyzeImage(imageBase64, theme);
    
    // 2. Обогащение данными для профиля
    const enrichedResult = await this.enrichWithProfileData(analysisResult);
    
    // 3. Сохранение в историю для обучения
    await this.saveToUserProfile(enrichedResult);
    
    return enrichedResult;
  }
  
  private async enrichWithProfileData(result: AnalysisResult) {
    const profile = await this.userProfileManager.getProfile();
    
    // Добавляем контекст из профиля
    result.personalizedContext = {
      similarPreviousAnalyses: this.findSimilarAnalyses(result, profile),
      userStyleTags: profile.stylePreferences.favoriteStyles,
      wardrobeMatches: this.findMatchingWardrobeItems(result),
      personalizedTips: this.generatePersonalizedTips(result, profile)
    };
    
    return result;
  }
}
```

### 2. Машинное обучение и адаптация (ML & Adaptation)

#### Система адаптивных промптов:
```typescript
class AdaptivePromptGenerator {
  private userProfile: UserProfile;
  private mlModel: StylePreferenceModel;
  
  generatePersonalizedPrompt(context: PromptContext): string {
    const basePrompt = this.generateBasePrompt(context);
    const personalizedAdditions = this.getPersonalizedAdditions();
    
    return `${basePrompt}\n\n${personalizedAdditions}`;
  }
  
  private getPersonalizedAdditions(): string {
    const additions = [];
    
    // Учитываем предпочитаемые цвета
    if (this.userProfile.stylePreferences.favoriteColors.length > 0) {
      additions.push(
        `Учитывай, что пользователю нравятся цвета: ${this.userProfile.stylePreferences.favoriteColors.join(', ')}`
      );
    }
    
    // Учитываем типичные стили
    if (this.userProfile.stylePreferences.preferredStyles.length > 0) {
      additions.push(
        `Пользователь предпочитает стили: ${this.userProfile.stylePreferences.preferredStyles.join(', ')}`
      );
    }
    
    // Учитываем гардероб
    if (this.userProfile.wardrobeItems.length > 0) {
      additions.push(
        `В гардеробе пользователя есть: ${this.describeWardrobe()}`
      );
    }
    
    // Учитываем прошлые позитивные отзывы
    const positiveElements = this.getPositivelyRatedElements();
    if (positiveElements.length > 0) {
      additions.push(
        `Ранее пользователю нравились такие элементы: ${positiveElements.join(', ')}`
      );
    }
    
    return additions.join('\n');
  }
  
  private describeWardrobe(): string {
    const items = this.userProfile.wardrobeItems;
    const categories = new Map<string, number>();
    
    items.forEach(item => {
      const count = categories.get(item.category) || 0;
      categories.set(item.category, count + 1);
    });
    
    return Array.from(categories.entries())
      .map(([category, count]) => `${count}x ${this.translateCategory(category)}`)
      .join(', ');
  }
}
```

#### ML модель для прогнозирования предпочтений:
```typescript
class StylePreferenceModel {
  // Просто классификатор на основе исторических данных
  predictUserPreference(newAnalysis: AnalysisEntry): PreferencePrediction {
    const similarEntries = this.findSimilarEntries(newAnalysis);
    const positiveRate = this.calculatePositiveRate(similarEntries);
    
    return {
      userWillLike: positiveRate > 0.6,
      confidence: positiveRate,
      reasoning: this.explainPrediction(similarEntries)
    };
  }
  
  private findSimilarEntries(entry: AnalysisEntry): AnalysisEntry[] {
    // Ищем похожие анализы по темам, цветам, стилям
    return this.userProfile.analysisHistory.filter(historical => {
      return this.calculateSimilarity(entry, historical) > 0.7;
    });
  }
  
  private calculateSimilarity(a: AnalysisEntry, b: AnalysisEntry): number {
    let score = 0;
    
    // Схожесть тем
    if (a.selectedTheme === b.selectedTheme) score += 0.3;
    
    // Схожесть по цветам (извлеченным из текста)
    const colorSimilarity = this.calculateColorSimilarity(a.analysisText, b.analysisText);
    score += colorSimilarity * 0.3;
    
    // Схожесть по стилям (casual, business и т.д.)
    const styleSimilarity = this.calculateStyleSimilarity(a.analysisText, b.analysisText);
    score += styleSimilarity * 0.2;
    
    // Временная близость (недавние важнее)
    const timeWeight = this.calculateTimeWeight(a.timestamp, b.timestamp);
    score *= timeWeight;
    
    return score;
  }
}
```

### 3. Персонализированные рекомендации (Personalized Recommendations)

#### Умные предложения穿搭:
```typescript
class PersonalizedOutfitGenerator {
  async generateOutfitSuggestions(context: OutfitContext): Promise<OutfitSuggestion[]> {
    const profile = await this.userProfileManager.getProfile();
    const wardrobe = profile.wardrobeItems;
    
    // На основе погоды, события, предпочтений
    const suggestions = [];
    
    // 1. Повседневный вариант (на основе частых стилей)
    const casualOutfit = this.generateCasualOutfit(wardrobe, profile);
    suggestions.push(casualOutfit);
    
    // 2. Деловой вариант (если есть соответствующие вещи)
    if (this.hasBusinessClothes(wardrobe)) {
      const businessOutfit = this.generateBusinessOutfit(wardrobe, profile);
      suggestions.push(businessOutfit);
    }
    
    // 3. Экспериментальный вариант (новые комбинации)
    const experimentalOutfit = this.generateExperimentalOutfit(wardrobe, profile);
    suggestions.push(experimentalOutfit);
    
    return suggestions;
  }
  
  private generateCasualOutfit(wardrobe: WardrobeItem[], profile: UserProfile): OutfitSuggestion {
    // Берем самые liked цвета и стили пользователя
    return {
      name: 'Повседневный образ',
      reasoning: 'Соединяем ваши любимые цвета и комфортные вещи',
      items: this.selectOptimalItems(wardrobe, profile, 'casual'),
      confidence: 0.8,
      personalizedNote: 'Этот образ похож на те, которые вам нравились ранее'
    };
  }
  
  private selectOptimalItems(wardrobe: WardrobeItem[], profile: UserProfile, style: string): WardrobeItem[] {
    // Учитываем:
    // 1. Предпочитаемые цвета
    // 2. Частоту использования (не используем слишком часто/редко)
    // 3. Соответствие сезону
    // 4. Сочетаниемость по цветам и стилям
    
    const scoredItems = wardrobe.map(item => ({
      item,
      score: this.scoreItem(item, profile, style)
    }));
    
    // Выбираем лучшие комбинации
    return this.selectBalancedOutfit(scoredItems);
  }
  
  private scoreItem(item: WardrobeItem, profile: UserProfile, style: string): number {
    let score = 0;
    
    // Соответствие предпочитаемым цветам
    const colorMatch = this.userProfile.stylePreferences.favoriteColors
      .includes(item.color);
    if (colorMatch) score += 0.3;
    
    // Оптимальная частота использования
    const usageScore = this.calculateOptimalUsageScore(item);
    score += usageScore * 0.2;
    
    // Стилевое соответствие
    const styleMatch = this.checkStyleMatch(item, style, profile);
    score += styleMatch * 0.3;
    
    // Сезонность
    const seasonalScore = this.checkSeasonalAppropriateness(item);
    score += seasonalScore * 0.2;
    
    return Math.min(score, 1.0);
  }
}
```

#### Персонализированные покупки:
```typescript
class PersonalizedShoppingAssistant {
  generateShoppingRecommendations(profile: UserProfile): ShoppingRecommendation[] {
    const recommendations = [];
    
    // 1. Автозамена популярных вещей
    const wornOutItems = this.findWornOutItems(profile);
    wornOutItems.forEach(item => {
      const alternatives = this.findSimilarItems(item, profile);
      recommendations.push({
        type: 'replacement',
        originalItem: item,
        suggestions: alternatives,
        reasoning: `Эта вещь часто используется (${item.usageCount} раз), но уже изношена`,
        priority: 'high'
      });
    });
    
    // 2. Заполнение пробелов в гардеробе
    const wardrobeGaps = this.analyzeWardrobeGaps(profile);
    wardrobeGaps.forEach(gap => {
      recommendations.push({
        type: 'wardrobe_completion',
        category: gap.category,
        suggestions: this.findGapFillingItems(gap, profile),
        reasoning: `Вам не хватает ${gap.category} для создания полноценных образов`,
        priority: 'medium'
      });
    });
    
    // 3. Трендовые добавления
    const trendItems = this.findTrendingItems(profile);
    recommendations.push({
      type: 'trend',
      suggestions: trendItems,
      reasoning: 'Эти вещи сейчас в тренде и подойдут вашему стилю',
      priority: 'low'
    });
    
    return recommendations;
  }
  
  private findWornOutItems(profile: UserProfile): WardrobeItem[] {
    // Вещи с высокой частотой использования и давней датой покупки
    return profile.wardrobeItems.filter(item => {
      return item.usageCount > 10 && this.isItemOld(item);
    });
  }
  
  private analyzeWardrobeGaps(profile: UserProfile): WardrobeGap[] {
    const categories = new Set(profile.wardrobeItems.map(item => item.category));
    const essentialCategories = ['OUTERWEAR', 'BODYWEAR', 'LEGWEAR', 'FOOTWEAR'];
    
    const gaps = [];
    essentialCategories.forEach(category => {
      if (!categories.has(category)) {
        gaps.push({
          category,
          severity: this.calculateGapSeverity(category, profile)
        });
      }
    });
    
    return gaps;
  }
}
```

### 4. UI/UX Flow для персонального ассистента

#### Экран "Мой стилист":
```typescript
class PersonalStylistUI {
  renderPersonalDashboard(): HTMLElement {
    return `
    <div class="stylist-dashboard">
      <!-- Приветствие с персонализацией -->
      <div class="welcome-message">
        <h2>Привет, ${this.getUserName()}! 👗</h2>
        <p>Сегодня я подобрал для тебя 3 образа на основе твоего стиля</p>
      </div>
      
      <!-- Стиль профиля -->
      <div class="style-profile-card">
        <h3>Твой стиль</h3>
        <div class="style-tags">
          ${this.renderStyleTags()}
        </div>
        <div class="color-palette">
          ${this.renderFavoriteColors()}
        </div>
      </div>
      
      <!-- Персональные рекомендации -->
      <div class="personal-recommendations">
        <h3>Образы для сегодня</h3>
        ${this.renderOutfitCards()}
      </div>
      
      <!-- Персонализированные покупки -->
      <div class="shopping-suggestions">
        <h3>Что может пополнить твой гардероб</h3>
        ${this.renderShoppingCards()}
      </div>
      
      <!-- Статистика и инсайты -->
      <div class="style-insights">
        <h3>Твоя статистика стиля</h3>
        ${this.renderStyleAnalytics()}
      </div>
    </div>`;
  }
  
  private renderOutfitCards(): string {
    return this.personalizedOutfits.map(outfit => `
    <div class="outfit-card">
      <div class="outfit-preview">
        ${this.renderOutfitPreview(outfit.items)}
      </div>
      <div class="outfit-details">
        <h4>${outfit.name}</h4>
        <p class="outfit-reasoning">${outfit.reasoning}</p>
        <div class="outfit-confidence">
          <span class="confidence-bar" style="width: ${outfit.confidence * 100}%"></span>
          <span>${Math.round(outfit.confidence * 100)}% подойдет тебе</span>
        </div>
        <div class="outfit-actions">
          <button class="try-outfit-btn">Примерить</button>
          <button class="save-outfit-btn">Сохранить</button>
        </div>
      </div>
    </div>`).join('');
  }
}
```

#### Адаптивный интерфейс анализа:
```typescript
class EnhancedAnalysisUI extends UIAnalysisManager {
  private personalStylist: PersonalStylist;
  
  async showAnalysisWithTheme(imageData: string, themeId: string) {
    // Получаем персонализированный промпт
    const personalizedAnalysis = await this.personalStylist
      .getPersonalizedAnalysis(imageData, themeId);
    
    // Показываем анализ с персональными дополнениями
    this.showPersonalizedAnalysisResult(personalizedAnalysis);
  }
  
  private showPersonalizedAnalysisResult(result: PersonalizedAnalysisResult): void {
    const analysisContainer = document.getElementById('analysis-result');
    
    // Стандартный анализ
    const standardAnalysis = this.parseAnalysisText(result.analysisText);
    
    // Персональные дополнения
    const personalContext = result.personalizedContext;
    
    analysisContainer.innerHTML = `
    <!-- Стандартный блок анализа -->
    <div class="analysis-content">
      ${this.renderAnalysisBlocks(standardAnalysis)}
    </div>
    
    <!-- Персональные инсайты -->
    <div class="personal-insights">
      <h3>🤖 Это интересно именно для тебя:</h3>
      <div class="insight-cards">
        ${this.renderPersonalInsights(personalContext)}
      </div>
    </div>
    
    <!-- Источник рекомендаций -->
    <div class="recommendation-source">
      <small>
        💡 Рекомендации основаны на:
        • Твоих ${personalContext.similarPreviousAnalyses.length} прошлых анализов
        • ${personalContext.wardrobeMatches.length} вещах из твоего гардероба  
        • Любимых цветах: ${personalContext.userStyleTags.join(', ')}
      </small>
    </div>`;
  }
  
  private renderPersonalInsights(context: PersonalizedContext): string {
    const insights = [];
    
    // Похожие прошлые анализы
    if (context.similarPreviousAnalyses.length > 0) {
      insights.push(`
      <div class="insight-card">
        <h4>📊 Ты так уже делал!</h4>
        <p>В ${context.similarPreviousAnalyses.length} прошлых анализах ты выбирал похожие элементы.</p>
        <div class="similar-analysis-links">
          ${context.similarPreviousAnalyses.map(analysis => 
            `<a href="#" onclick="showAnalysis(${analysis.id})">🔗 Анализ #${analysis.id}</a>`
          ).join('')}
        </div>
      </div>`);
    }
    
    // Совпадения с гардеробом
    if (context.wardrobeMatches.length > 0) {
      insights.push(`
      <div class="insight-card">
        <h4>👔 Есть у тебя!</h4>
        <p>У тебя уже есть вещи, которые идеально подходят к этому образу:</p>
        <div class="wardrobe-matches">
          ${context.wardrobeMatches.map(item => 
            `<div class="wardrobe-item-small">
              <img src="${item.imageUrl}" alt="${item.name}">
              <span>${item.name}</span>
            </div>`
          ).join('')}
        </div>
      </div>`);
    }
    
    return insights.join('');
  }
}
```

### 5. Система обучения и обратной связи

#### Сбор обратной связи:
```typescript
class FeedbackCollector {
  setupFeedbackMechanisms(): void {
    // 1. Реакция на персональные советы
    this.setupReactionToPersonalTips();
    
    // 2. Сбор данных о принятых рекомендациях
    this.trackRecommendationAcceptance();
    
    // 3. Прямые оценки ассистента
    this.setupDirectRatingSystem();
  }
  
  private setupReactionToPersonalTips(): void {
    // Отслеживаем, какую персональную информацию пользователь просмотрел
    document.addEventListener('click', (e) => {
      if (e.target.closest('.personal-insight')) {
        this.trackInsightView(e.target.closest('.personal-insight'));
      }
    });
    
    // Отслеживаем клики по рекомендованным вещам из гардероба
    document.addEventListener('click', (e) => {
      if (e.target.closest('.wardrobe-match')) {
        this.trackWardrobeMatchClick(e.target.closest('.wardrobe-match'));
      }
    });
  }
  
  private trackRecommendationAcceptance(): void {
    // Пользователь сохранил рекомендованный образ
    window.addEventListener('capsule:saved', (e) => {
      if (e.detail.source === 'personal-stylist') {
        this.registerSuccess({
          type: 'outfit_recommendation',
          recommendationId: e.detail.recommendationId,
          userAction: 'saved'
        });
      }
    });
    
    // Пользователь сделал покупку по рекомендации
    window.addEventListener('purchase:completed', (e) => {
      if (e.detail.source === 'shopping-recommendation') {
        this.registerSuccess({
          type: 'shopping_recommendation', 
          recommendationId: e.detail.recommendationId,
          userAction: 'purchased',
          value: e.detail.amount
        });
      }
    });
  }
  
  recordDirectFeedback(feedback: PersonalFeedback): void {
    // Сохраняем прямой фидбэк пользователя
    this.feedbackStorage.save({
      timestamp: new Date(),
      context: this.getContext(),
      feedback,
      userProfile: this.currentProfile
    });
    
    // используем для дообучения модели
    this.mlModel.updateBasedOnFeedback(feedback);
  }
}
```

#### Динамическое обучение:
```typescript
class DynamicLearningSystem {
  private feedbackHistory: FeedbackEntry[] = [];
  private learningThreshold = 50; // Начинаем обучение после 50 записей
  
  async processFeedback(feedback: FeedbackEntry): Promise<void> {
    this.feedbackHistory.push(feedback);
    
    // Проверяем, нужно ли обновить модель
    if (this.feedbackHistory.length >= this.learningThreshold) {
      await this.updatePersonalizationModel();
    }
    
    // Обновляем веса признаков
    this.updateFeatureWeights(feedback);
  }
  
  private async updatePersonalizationModel(): Promise<void> {
    // На основе accumulating feedback корректируем:
    // 1. Веса цветов/стилей для конкретного пользователя
    // 2. Типичные комбинации одежды
    // 3. Пороги уверенности в рекомендациях
    
    const updatedWeights = this.calculateNewWeights();
    await this.savePersonalizationSettings(updatedWeights);
    
    // Сбрасываем счетчик для следующего обучения
    this.feedbackHistory = [];
  }
  
  private updateFeatureWeights(feedback: FeedbackEntry): void {
    // Real-time обновление на основе индивидуальных действий
    if (feedback.action === 'liked_color') {
      this.increaseColorWeight(feedback.color, 0.1);
    }
    
    if (feedback.action === 'disliked_style_combination') {
      this.decreaseStyleCombinationWeight(feedback.combination, 0.05);
    }
  }
}
```

## 🛠️ Техническая реализация по шагам

### Шаг 1: Расширение базы данных
```sql
-- Таблица профиля пользователя
ALTER TABLE User ADD COLUMN profile_data JSONB;
ALTER TABLE User ADD COLUMN style_preferences JSONB;
ALTER TABLE User ADD COLUMN behavior_patterns JSONB;

-- Таблица обратной связи
CREATE TABLE PersonalFeedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES User(id),
  feedback_type VARCHAR(50), -- 'insight_view', 'recommendation_click', 'user_rating'
  feedback_data JSONB,
  context_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица персональных рекомендаций
CREATE TABLE PersonalRecommendations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES User(id),
  recommendation_type VARCHAR(50), -- 'outfit', 'shopping', 'style_tip'
  data JSONB,
  user_response VARCHAR(20), -- 'accepted', 'rejected', 'ignored'
  response_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Шаг 2: Создание новых модулей
```typescript
// src/modules/personal-stylist/PersonalStylistManager.ts
// src/modules/personal-stylist/ProfileManager.ts  
// src/modules/personal-stylist/RecommendationEngine.ts
// src/modules/personal-stylist/FeedbackCollector.ts
// src/modules/personal-stylist/MLLearningSystem.ts
```

### Шаг 3: Интеграция с существующими модулями
```typescript
// Расширяем существующие классы
class EnhancedAnalysisManager extends AnalysisManager {
  constructor() {
    super();
    this.personalStylist = personalStylistManager;
  }
}

class EnhancedWardrobeManager extends WardrobeManager {
  async loadWardrobeFromCache() {
    const items = await super.loadWardrobeFromCache();
    
    // Обогащаем AI-тегами для персонализации
    const enrichedItems = await this.enrichWithAITags(items);
    return enrichedItems;
  }
}
```

### Шаг 4: UI компоненты
```tsx
// src/components/personal-stylist/PersonalDashboard.tsx
// src/components/personal-stylist/PersonalInsights.tsx
// src/components/personal-stylist/RecommendationCards.tsx
// src/components/personal-stylist/FeedbackButtons.tsx
```

## 📊 Ожидаемые результаты

### Метрики успеха:

**Пользовательские:**
- +25% удержание пользователей (через персонализацию)
- +40% количество анализов на пользователя  
- +30% время сессии (из-за релевантных рекомендаций)
- +50% конверсия в Premium (через реальную ценность)

**Продуктовые:**
- 85% пользователей считают рекомендации "очень релевантными"
- 70% персональных советов приводят к действиям
- NPS > 60（из-за "ощущения личного отношения")

**Бизнес:**
- ARPU increase 60% (через Premium + affiliate sales)
- LTV increase 40% (через удержание)
- Acquisition cost decrease 30% (через viral effects)

### Пример использования:

**User journey:**
1. **Новый пользователь:** Дает 3-4 анализа → система изучает базовые предпочтения
2. **Регулярный пользователь:** Получает персональные рекомендации → доверие растет  
3. **Постоялец:** Ассистент предугадывает желания → становится незаменимым

**Постоянное использование:**
```
День 1: "Интересно, что скажет AI"
День 7: "О, он запомнил мой любимый цвет!"
День 30: "Этот AI действительно знает мой стиль"
День 90: "Не могу представить выбор одежды без него"
```

---

Это не просто фича — это **полная переосмысление роли стилиста-ассистента** от разовых анализов к долгосрочным отношениям с пользователем. Персональный ассистент становится все умнее с каждым твоим действием.
