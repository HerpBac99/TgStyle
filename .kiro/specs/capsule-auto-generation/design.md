# Документ дизайна: Автогенерация капсул

## Обзор

Функция автоматической генерации капсул использует **AI-driven подход**: система анализирует все 9 полей классификации вещей (category, subtype, color, material, fit, style, season, pattern, description), вычисляет статистику использования каждой вещи, определяет текущий сезон, и отправляет контекстуализированный список в Gemini API для создания стильных комбинаций.

**Умная приоритизация вещей:**
- Приоритет вещам с usageCount 1-3 (одобрены пользователем, но используются редко)
- Gemini создает 3 разных подхода:
  - **Капсула 1**: Микс редко используемых (1-2) + популярных (3+)
  - **Капсула 2**: Больше популярных вещей (проверенные комбинации)
  - **Капсула 3**: Экспериментальная (включает 1-2 новые вещи с usageCount = 0)

**Учет сезонности и многослойности:**
- Система определяет текущий сезон по месяцу
- Gemini учитывает многослойность (футболки = базовый слой круглый год, свитера = средний/верхний слой, куртки = верхний слой)
- Нет жесткой фильтрации по полю season - Gemini сам решает уместность вещей

Gemini API анализирует полную классификацию вещей, создает 3 гармоничных комбинации с учетом сезона и многослойности, и дает стилистические рекомендации для каждого образа.

## Архитектура

### Общий поток (AI-driven подход)

```
Пользователь нажимает кнопку "Сгенерировать"
    ↓
Client: Показывает индикатор загрузки "Создаем образы для вас..."
    ↓
Client: Загружает все вещи гардероба с полными данными (9 полей)
    ↓
Client: Загружает все существующие капсулы для анализа
    ↓
Client: Вычисляет usageCount для каждой вещи
    ↓
Client: Определяет текущий сезон по месяцу
    ↓
Client: Приоритизирует вещи с usageCount 1-3 (редко используемые)
    ↓
Client: Отправляет запрос на Node.js сервер с текущим сезоном
    ↓
Node.js Server: Формирует JSON с полными данными вещей (9 полей + usageCount)
    ↓
Node.js Server: Добавляет информацию о текущем сезоне и месяце
    ↓
Node.js Server: Отправляет запрос в FastVLM сервер
    ↓
FastVLM Server: Вызывает Gemini API с промптом для создания 3 капсул
    ↓
Gemini API: Анализирует все поля, учитывает сезон и многослойность, создает 3 разных подхода (микс, проверенные, экспериментальная), дает рекомендации
    ↓
FastVLM Server: Возвращает 3 капсулы с названиями, описаниями, рекомендациями
    ↓
Node.js Server: Проверяет уникальность с существующими капсулами
    ↓
Node.js Server: Возвращает результат клиенту
    ↓
Client: Отображает модальное окно с 3 превью и рекомендациями
    ↓
Пользователь кликает на превью
    ↓
Client: Создает капсулу через API с metadata (рекомендации)
    ↓
Client: Открывает Canvas Editor с новой капсулой
```

### Технологический стек

- **Frontend**: TypeScript, Fabric.js (canvas), существующий модуль UICapsulesGrid
- **Backend**: Node.js, Express, Prisma ORM
- **AI Service**: FastVLM Server (Python Flask) → Google Gemini 2.5 Flash
- **Database**: PostgreSQL (существующие модели Capsule, WardrobeItem)

## Компоненты и интерфейсы

### 1. Frontend компоненты

#### 1.1 Кнопка генерации (стиль Liquid Glass)

**Расположение**: `client/css/capsules.css`

```css
.capsule-generate-btn {
  position: fixed;
  bottom: 80px;
  right: 20px;
  z-index: 100;
  
  /* Эффект liquid glass */
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50px;
  
  padding: 12px 24px;
  font-size: 16px;
  color: var(--tg-theme-text-color);
  
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.capsule-generate-btn:active {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(0.98);
}
```

**HTML**: Добавить в `client/index.html` в секцию capsules
```html
<button id="capsule-generate-btn" class="capsule-generate-btn">
  ✨ Сгенерировать
</button>
```



#### 1.2 Компонент модального окна генерации

**Расположение**: Новый модуль `client/src/modules/capsules/GenerationModal.ts`

```typescript
export interface GeneratedCapsule {
  id: string; // временный ID
  name: string; // максимум 3 слова от Gemini
  description: string;
  reasoning: string; // обоснование выбора комбинации от Gemini
  recommendations: string; // рекомендации по улучшению образа
  items: WardrobeItemPreview[]; // вещи с полными 9 полями
  previewDataUrl: string; // превью canvas в base64
}

export class GenerationModal {
  show(capsules: GeneratedCapsule[]): void;
  hide(): void;
  onSelect(callback: (capsule: GeneratedCapsule) => void): void;
  onRegenerate(callback: () => void): void;
}
```



**HTML структура**: Добавить в `client/index.html`
```html
<div id="generation-modal" class="modal hidden">
  <div class="modal-overlay"></div>
  <div class="modal-content generation-modal-content">
    <h2>Выберите капсулу</h2>
    <div class="generation-variants">
      <!-- 3 карточки превью будут вставлены сюда -->
    </div>
    <div class="generation-actions">
      <button id="regenerate-btn" class="btn-secondary">🔄 Сгенерировать заново</button>
      <button id="cancel-generation-btn" class="btn-secondary">Отмена</button>
    </div>
  </div>
</div>
```

#### 1.3 Сервис генерации капсул

**Расположение**: Новый модуль `client/src/modules/capsules/CapsuleGenerationService.ts`

```typescript
export interface WardrobeItemWithUsage extends WardrobeItem {
  usageCount: number; // количество капсул, в которых используется
}

export interface GenerationRequest {
  wardrobeItems: WardrobeItemWithUsage[]; // все 9 полей + usageCount
  existingCapsules: Capsule[];
  excludeCombinations?: string[][]; // для регенерации
}

export interface GenerationResponse {
  success: boolean;
  capsules: GeneratedCapsule[];
  error?: string;
}

export class CapsuleGenerationService {
  async generateCapsules(request: GenerationRequest): Promise<GenerationResponse>;
  private calculateUsageCount(item: WardrobeItem, capsules: Capsule[]): number;
  private prioritizeUnusedItems(items: WardrobeItemWithUsage[]): WardrobeItemWithUsage[];
  private createPreview(items: WardrobeItem[]): Promise<string>;
  private checkMinimumItems(items: WardrobeItem[]): boolean;
}
```

### 2. Backend компоненты

#### 2.1 Сервис вычисления статистики использования

**Расположение**: Новый файл `server/src/services/wardrobeUsageService.js`

```javascript
class WardrobeUsageService {
  /**
   * Вычисляет usageCount для каждой вещи
   */
  calculateUsageStats(wardrobeItems, capsules) {
    const usageMap = new Map();
    
    // Инициализируем счетчики
    wardrobeItems.forEach(item => usageMap.set(item.id, 0));
    
    // Подсчитываем использование в капсулах
    capsules.forEach(capsule => {
      const itemIds = this.extractItemIdsFromCanvas(capsule.canvasData);
      itemIds.forEach(id => {
        if (usageMap.has(id)) {
          usageMap.set(id, usageMap.get(id) + 1);
        }
      });
    });
    
    // Добавляем usageCount к каждой вещи
    return wardrobeItems.map(item => ({
      ...item,
      usageCount: usageMap.get(item.id) || 0
    }));
  }

  extractItemIdsFromCanvas(canvasData) {
    // Парсит canvasData и извлекает ID вещей
    if (!canvasData || !canvasData.objects) return [];
    return canvasData.objects
      .filter(obj => obj.wardrobeItemId)
      .map(obj => obj.wardrobeItemId);
  }

  prioritizeRarelyUsedItems(items) {
    // Приоритизируем вещи с usageCount 1-3 (одобрены, но используются редко)
    // Затем популярные (3+), затем новые (0)
    return items.sort((a, b) => {
      const aScore = this.getPriorityScore(a.usageCount);
      const bScore = this.getPriorityScore(b.usageCount);
      return bScore - aScore; // Сортируем по убыванию приоритета
    });
  }

  getPriorityScore(usageCount) {
    if (usageCount >= 1 && usageCount <= 3) return 3; // Высокий приоритет
    if (usageCount > 3) return 2; // Средний приоритет (популярные)
    return 1; // Низкий приоритет (новые, возможно нелюбимые)
  }

  getCurrentSeason() {
    const month = new Date().getMonth() + 1; // 1-12
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn'; // 9-11
  }

  getCurrentMonth() {
    const months = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 
                    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    return months[new Date().getMonth()];
  }
}
```

#### 2.2 Интеграция с FastVLM/Gemini

**Расположение**: Новый endpoint в `fastvlm-server/server.py`

```python
@app.route('/generate-capsules', methods=['POST'])
def generate_capsules():
    """Генерация капсул через Gemini API"""
    try:
        data = request.json
        wardrobe_items = data.get('wardrobeItems', [])  # Все 9 полей + usageCount
        existing_capsules = data.get('existingCapsules', [])
        
        # Строим промпт для Gemini с полными данными вещей
        prompt = build_capsule_generation_prompt(wardrobe_items, existing_capsules)
        
        # Вызываем Gemini
        result = create_capsules_with_gemini(prompt)
        
        return jsonify({
            'success': True,
            'capsules': result
        })
    except Exception as e:
        app.logger.error(f'Ошибка генерации капсул: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

def build_capsule_generation_prompt(wardrobe_items, current_season, current_month, existing_capsules):
    """Строит промпт для Gemini с полными данными вещей (9 полей) и учетом сезона"""
    # Формируем JSON с полной классификацией каждой вещи
    items_data = []
    for item in wardrobe_items:
        items_data.append({
            'id': item['id'],
            'category': item['category'],
            'subtype': item['subtype'],
            'color': item['color'],
            'material': item['material'],
            'fit': item['fit'],
            'style': item['style'],
            'season': item['season'],
            'pattern': item['pattern'],
            'description': item['description'],
            'usageCount': item.get('usageCount', 0)
        })
    
    # Инструкции по многослойности в зависимости от сезона
    layering_instructions = {
        'winter': 'Зима: используй многослойность - футболки/рубашки как базовый слой, свитера/кофты как средний слой, куртки/пальто как верхний слой.',
        'spring': 'Весна: переходный сезон - футболки/рубашки как базовый слой, свитера/кофты как средний слой или верхний в прохладную погоду, легкие куртки.',
        'summer': 'Лето: футболки/рубашки как основная одежда или базовый слой, свитера/кофты для прохладных вечеров как верхний слой, куртки/пальто не используй.',
        'autumn': 'Осень: переходный сезон - футболки/рубашки как базовый слой, свитера/кофты как средний слой, куртки как верхний слой.'
    }
    
    prompt = f"""Ты профессиональный AI-стилист. Создай 3 стильных образа из вещей гардероба.

ТЕКУЩИЙ СЕЗОН: {current_season} ({current_month})
{layering_instructions.get(current_season, '')}

СТРАТЕГИЯ ПРИОРИТИЗАЦИИ:
- Приоритизируй вещи с usageCount 1-3 (одобрены пользователем, но используются редко)
- Создай 3 РАЗНЫХ подхода:
  * Капсула 1: Микс редко используемых (usageCount 1-2) + популярных (usageCount 3+)
  * Капсула 2: Больше популярных вещей (проверенные комбинации)
  * Капсула 3: Экспериментальная (можно включить 1-2 новые вещи с usageCount = 0)

Вещи гардероба (с полной классификацией):
{json.dumps(items_data, ensure_ascii=False, indent=2)}

Существующие капсулы (избегать похожих >80%):
{json.dumps(existing_capsules, ensure_ascii=False)}

Требования:
1. Создай ровно 3 разных комбинации согласно стратегии выше
2. Каждая комбинация должна отличаться минимум на 30%
3. Учитывай МНОГОСЛОЙНОСТЬ и текущий сезон (НЕ фильтруй жестко по полю season)
4. Учитывай ВСЕ 9 полей: цвет, стиль, материал, сезон, паттерн, fit, category, subtype, description
5. Для каждого образа дай:
   - Название (максимум 3 слова на русском)
   - Описание образа (1-2 предложения)
   - Обоснование выбора комбинации (почему эти вещи сочетаются с учетом сезона и многослойности)
   - Рекомендации по улучшению

Формат ответа: JSON
{{
  "capsules": [
    {{
      "name": "Casual Denim",
      "description": "Повседневный образ для {current_season}",
      "reasoning": "Синяя джинсовая куртка (верхний слой) хорошо сочетается с белой футболкой (базовый слой)",
      "recommendations": "Добавьте аксессуары для завершения образа",
      "itemIds": [1, 5, 12, 20]
    }}
  ]
}}
"""
    return prompt

def create_capsules_with_gemini(prompt):
    """Вызывает Gemini API для создания 3 капсул"""
    global gemini_client
    
    if not gemini_client:
        raise Exception("Gemini клиент не инициализирован")
    
    response = gemini_client.models.generate_content(
        model=Config.STYLIST_GEMINI_MODEL,
        contents=[{"parts": [{"text": prompt}]}],
        config=types.GenerateContentConfig(
            temperature=Config.STYLIST_GEMINI_TEMPERATURE,
            max_output_tokens=Config.STYLIST_GEMINI_MAX_TOKENS,
            response_mime_type="application/json"
        )
    )
    
    return parse_gemini_capsule_response(response.text)
```



#### 2.3 Сервис проверки уникальности капсул

**Расположение**: Новый файл `server/src/services/capsuleSimilarityService.js`

```javascript
class CapsuleSimilarityService {
  /**
   * Вычисляет схожесть между двумя капсулами
   * @returns {number} 0-100 процентов
   */
  calculateSimilarity(capsule1ItemIds, capsule2ItemIds) {
    const set1 = new Set(capsule1ItemIds);
    const set2 = new Set(capsule2ItemIds);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return (intersection.size / union.size) * 100;
  }

  /**
   * Проверяет достаточно ли уникальна капсула
   * @returns {boolean}
   */
  isUnique(newCapsuleItemIds, existingCapsules, threshold = 80) {
    for (const existing of existingCapsules) {
      const similarity = this.calculateSimilarity(newCapsuleItemIds, existing.itemIds);
      if (similarity >= threshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * Фильтрует сгенерированные капсулы для обеспечения разнообразия
   */
  ensureDiversity(generatedCapsules, minDifference = 30) {
    // Каждый из 3 вариантов должен отличаться минимум на 30%
  }
}
```

#### 2.4 API Endpoint

**Расположение**: `server/src/api/capsules.js` (добавить новый роут)

```javascript
/**
 * POST /api/capsules/generate
 * Генерация 3 вариантов капсул через Gemini AI
 */
router.post('/generate', async (req, res) => {
  try {
    const { excludeCombinations } = req.body;
    const initData = getInitData(req);
    
    // Валидация авторизации
    const validation = validateTelegramWebAppData(initData);
    const telegramId = BigInt(validation.data.user.id);
    
    // Получаем все вещи гардероба с полными данными (9 полей)
    const wardrobeItems = await prisma.wardrobeItem.findMany({
      where: { telegramId },
      select: {
        id: true,
        category: true,
        subtype: true,
        color: true,
        material: true,
        fit: true,
        style: true,
        season: true,
        pattern: true,
        description: true,
        imagePath: true
      }
    });
    
    if (wardrobeItems.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Недостаточно вещей в гардеробе (минимум 3)'
      });
    }
    
    // Получаем существующие капсулы для вычисления usageCount
    const existingCapsules = await prisma.capsule.findMany({
      where: { telegramId },
      select: { id: true, canvasData: true }
    });
    
    // Вычисляем usageCount для каждой вещи
    const usageService = new WardrobeUsageService();
    const itemsWithUsage = usageService.calculateUsageStats(wardrobeItems, existingCapsules);
    
    // Приоритизируем редко используемые вещи (1-3)
    const prioritizedItems = usageService.prioritizeRarelyUsedItems(itemsWithUsage);
    
    // Определяем текущий сезон
    const currentSeason = usageService.getCurrentSeason();
    const currentMonth = usageService.getCurrentMonth();
    
    // Отправляем в FastVLM для Gemini
    const fastvlmResponse = await fetch('http://127.0.0.1:3001/generate-capsules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wardrobeItems: prioritizedItems,
        currentSeason,
        currentMonth,
        existingCapsules: existingCapsules.map(c => ({
          itemIds: usageService.extractItemIdsFromCanvas(c.canvasData)
        })),
        excludeCombinations
      })
    });
    
    const generated = await fastvlmResponse.json();
    
    if (!generated.success) {
      throw new Error(generated.error || 'Ошибка генерации капсул');
    }
    
    // Проверяем уникальность сгенерированных капсул
    const similarityService = new CapsuleSimilarityService();
    
    const enrichedCapsules = generated.capsules.map(capsule => {
      const isUnique = similarityService.isUnique(
        capsule.itemIds,
        existingCapsules.map(c => ({
          itemIds: usageService.extractItemIdsFromCanvas(c.canvasData)
        }))
      );
      
      return {
        ...capsule,
        isUnique,
        items: wardrobeItems.filter(item => capsule.itemIds.includes(item.id))
      };
    });
    
    res.json({
      success: true,
      capsules: enrichedCapsules
    });
    
  } catch (error) {
    logger.error('Ошибка генерации капсул', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```



### 3. Интеграция с существующими модулями

#### 3.1 Интеграция с UICapsulesGrid

**Модификация**: `client/src/modules/uiCapsulesGrid.ts`

```typescript
export class UICapsulesGrid {
  private generationModal: GenerationModal;
  private generationService: CapsuleGenerationService;
  
  constructor(config: CapsulesGridConfig) {
    // ... существующий код
    this.generationModal = new GenerationModal();
    this.generationService = new CapsuleGenerationService();
    this.setupGenerateButton();
  }
  
  private setupGenerateButton(): void {
    const generateBtn = document.getElementById('capsule-generate-btn');
    generateBtn?.addEventListener('click', () => this.handleGenerate());
  }
  
  private async handleGenerate(): Promise<void> {
    // Показать загрузку
    // Загрузить вещи гардероба
    // Вызвать сервис генерации
    // Показать модальное окно с результатами
  }
}
```

#### 3.2 Интеграция с Canvas Editor

**Модификация**: `client/src/modules/uiCanvasEditor.ts`

Добавить метод для загрузки сгенерированной капсулы:

```typescript
export class UICanvasEditor {
  async loadGeneratedCapsule(capsule: GeneratedCapsule): Promise<void> {
    // Очистить canvas
    // Загрузить вещи гардероба
    // Автоматически расположить вещи на canvas
    // Добавить рекомендованные вещи со специальным стилем
  }
  
  private autoPositionItems(items: WardrobeItem[]): void {
    // Умный алгоритм позиционирования
    // Сверху вниз: outerwear → innerwear → bodywear → legwear → footwear
  }
}
```

## Модели данных

### Существующие модели (изменения не требуются)

- **Capsule**: Уже имеет все необходимые поля (canvasData, thumbnailPath, items relation)
- **WardrobeItem**: Имеет category, color, style, material, description
- **User**: Имеет telegramId для авторизации

### Новые структуры данных

#### Вещь гардероба с usageCount

```json
{
  "id": 5,
  "category": "OUTERWEAR",
  "subtype": "jacket",
  "color": "black",
  "material": "denim",
  "fit": "regular",
  "style": "casual",
  "season": "spring",
  "pattern": "solid",
  "description": "Черная джинсовая куртка",
  "usageCount": 2,
  "imagePath": "/uploads/item_5.jpg"
}
```

#### Структура запроса к Gemini API

```json
{
  "wardrobeItems": [
    {
      "id": 5,
      "category": "OUTERWEAR",
      "subtype": "jacket",
      "color": "black",
      "material": "denim",
      "fit": "regular",
      "style": "casual",
      "season": "spring",
      "pattern": "solid",
      "description": "Черная джинсовая куртка",
      "usageCount": 0
    }
  ],
  "strategy": "new_items",
  "existingCapsules": [
    { "itemIds": [1, 5, 12, 20] }
  ]
}
```



#### Структура ответа Gemini

```json
{
  "capsules": [
    {
      "name": "Casual Denim",
      "description": "Повседневный образ с джинсовой курткой",
      "reasoning": "Черная джинсовая куртка (denim, casual) отлично сочетается с белой футболкой (cotton, casual). Синие джинсы (denim, regular fit) дополняют образ. Белые кроссовки (casual) завершают повседневный look.",
      "recommendations": "Добавьте солнцезащитные очки и рюкзак для завершения образа",
      "itemIds": [5, 12, 18, 23]
    },
    {
      "name": "Smart Casual",
      "description": "Офисный образ с пиджаком",
      "reasoning": "Черный пиджак (formal) создает профессиональный вид. Белая рубашка (cotton, slim fit) и темные брюки (formal) поддерживают деловой стиль.",
      "recommendations": "Рекомендуем добавить кожаную сумку и часы",
      "itemIds": [8, 15, 22, 28]
    },
    {
      "name": "Street Style",
      "description": "Уличный образ с худи",
      "reasoning": "Серое худи (oversized, casual) с карго штанами (utility style) создают современный уличный образ. Черные кроссовки (streetwear) завершают look.",
      "recommendations": "Добавьте кепку и цепочку для усиления street style",
      "itemIds": [3, 11, 19, 25]
    }
  ]
}
```

## Промпт-инжиниринг для Gemini

### Полный промпт для Gemini API

```
Ты профессиональный AI-стилист. Создай 3 стильных образа из вещей гардероба пользователя.

ВАЖНО: Приоритизируй неиспользованные вещи (usageCount = 0), чтобы максимально задействовать весь гардероб.

Вещи гардероба (с полной классификацией):
{wardrobeItemsJSON}

Каждая вещь имеет 9 полей классификации:
- category: категория (OUTERWEAR, INNERWEAR, BODYWEAR, LEGWEAR, FOOTWEAR)
- subtype: подтип (jacket, shirt, jeans, sneakers и т.д.)
- color: цвет
- material: материал (denim, cotton, leather и т.д.)
- fit: посадка (regular, slim, oversized и т.д.)
- style: стиль (casual, formal, streetwear и т.д.)
- season: сезон (spring, summer, autumn, winter, all-season)
- pattern: паттерн (solid, striped, checkered и т.д.)
- description: описание вещи
- usageCount: количество капсул, в которых используется (0 = неиспользованная)

Существующие капсулы (избегать похожих >80%):
{existingCapsulesJSON}

Требования:
1. Создай ровно 3 разных комбинации
2. Каждая комбинация должна отличаться минимум на 30%
3. Приоритизируй вещи с usageCount = 0 (неиспользованные)
4. Учитывай ВСЕ 9 полей для создания гармоничных образов:
   - Сочетаемость цветов
   - Согласованность стилей (casual+casual, formal+formal)
   - Совместимость материалов
   - Соответствие сезону
   - Гармония паттернов
   - Правильный fit для силуэта
5. Для каждого образа дай:
   - Название (максимум 3 слова на русском)
   - Описание образа (1-2 предложения)
   - Обоснование выбора комбинации (почему эти вещи сочетаются, упомяни конкретные поля)
   - Рекомендации по улучшению образа (аксессуары, дополнительные вещи)

Формат ответа: JSON
{
  "capsules": [
    {
      "name": "Casual Denim",
      "description": "Повседневный образ",
      "reasoning": "Черная джинсовая куртка (denim, casual) отлично сочетается с белой футболкой...",
      "recommendations": "Добавьте солнцезащитные очки...",
      "itemIds": [1, 5, 12, 20]
    }
  ]
}
```



## Обработка ошибок

### Ошибки на клиенте

1. **Недостаточно вещей**: Показать уведомление "Добавьте больше вещей в гардероб (минимум 3)"
2. **Ошибка сети**: Показать уведомление "Ошибка сети. Проверьте подключение"
3. **Таймаут генерации**: Показать уведомление "Генерация заняла слишком много времени. Попробуйте снова"

### Ошибки на сервере

1. **Ошибка Gemini API**: Логировать ошибку, вернуть 500 с сообщением "Не удалось сгенерировать капсулы"
2. **Превышен лимит**: Вернуть 429 с сообщением "Превышен лимит генераций. Попробуйте через {time}"
3. **Некорректный ответ**: Логировать ошибку, повторить попытку один раз, затем вернуть ошибку
4. **Ошибка авторизации**: Вернуть 401 со стандартным сообщением об ошибке авторизации

### Восстановление после ошибок

- **Логика повтора**: Повторить вызов Gemini API один раз при таймауте/500 ошибке
- **Fallback**: Если Gemini не работает, предложить создать капсулу вручную
- **Логирование**: Логировать все ошибки с контекстом (userId, wardrobeItemCount, и т.д.)

## Стратегия тестирования

### Юнит-тесты

1. **CapsuleFilterService**
   - Тест группировки по категориям
   - Тест правил сочетаемости цветов
   - Тест правил сочетаемости стилей
   - Тест создания комбинаций

2. **CapsuleSimilarityService**
   - Тест расчета схожести с различными комбинациями вещей
   - Тест проверки уникальности с разными порогами
   - Тест обеспечения разнообразия

3. **StockWardrobeService**
   - Тест логики рекомендаций для недостающих категорий
   - Тест предложений аксессуаров на основе стиля

### Интеграционные тесты

1. **Поток генерации**
   - Тест полного потока от клика кнопки до отображения модального окна
   - Тест создания капсулы после выбора
   - Тест регенерации с исключениями

2. **API Endpoint**
   - Тест с валидными вещами гардероба
   - Тест с недостаточным количеством вещей
   - Тест с невалидной авторизацией
   - Тест проверки схожести

### Чеклист ручного тестирования

- [ ] Кнопка появляется на вкладке Capsules в стиле liquid glass
- [ ] Кнопка запускает генерацию с индикатором загрузки
- [ ] Модальное окно отображает 3 разных превью капсул
- [ ] Клик по превью открывает canvas editor
- [ ] Canvas показывает вещи в правильных позициях
- [ ] Рекомендованные вещи имеют специальный индикатор
- [ ] Клик по рекомендованной вещи открывает ссылку на магазин
- [ ] Кнопка "Сгенерировать заново" создает новые варианты
- [ ] Кнопка "Отмена" закрывает модальное окно
- [ ] Сообщения об ошибках отображаются корректно
- [ ] Работает с минимум 3 вещами в гардеробе
- [ ] Работает с 50+ вещами в гардеробе
- [ ] Проверка схожести предотвращает дубликаты
- [ ] Сгенерированные названия содержат 3 слова или меньше



## Performance Considerations

### Client-Side

1. **Wardrobe Caching**: Use existing dataCacheManager to cache wardrobe items
2. **Preview Generation**: Generate canvas previews asynchronously
3. **Lazy Loading**: Load stock wardrobe images only when needed
4. **Debouncing**: Prevent multiple simultaneous generation requests

### Server-Side

1. **Gemini API Timeout**: Set 30s timeout for Gemini requests
2. **Response Caching**: Cache stock wardrobe data in memory
3. **Database Queries**: Use existing indexes on Capsule and WardrobeItem
4. **Concurrent Requests**: Limit to 1 generation per user at a time

### Expected Performance

- **Generation Time**: 5-10 seconds (Gemini API call)
- **Modal Display**: <500ms after receiving response
- **Canvas Loading**: 1-2 seconds for complex capsules
- **Memory Usage**: ~5MB for stock wardrobe data

## Security Considerations

1. **Authentication**: Use existing Telegram WebApp validation
2. **Authorization**: Verify user owns wardrobe items before generation
3. **Rate Limiting**: Max 10 generations per user per hour
4. **API Key**: Store Gemini API key in environment variable
5. **Input Validation**: Validate wardrobeItemIds array
6. **XSS Prevention**: Sanitize Gemini response before displaying

## Deployment Considerations

### Environment Variables

```bash
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-1.5-flash  # or gemini-1.5-pro
GENERATION_RATE_LIMIT=10  # per hour per user
```

### Stock Wardrobe Setup

1. Create directory: `server/uploads/stock/`
2. Organize by category: `stock/footwear/`, `stock/outerwear/`, etc.
3. Create JSON manifest: `server/data/stock-wardrobe.json`
4. Download images from free stock sources (Unsplash, Pexels)

### Database Migrations

No schema changes required. Existing models support all functionality.

### Monitoring

- Log Gemini API usage and costs
- Track generation success/failure rates
- Monitor average generation time
- Alert on rate limit hits

## Future Enhancements

1. **AI Learning**: Learn from user's capsule edits to improve future generations
2. **Style Preferences**: Allow user to set preferred styles (casual, formal, etc.)
3. **Seasonal Filtering**: Generate season-appropriate capsules
4. **Color Palette**: Allow user to specify preferred color schemes
5. **Occasion-Based**: Generate capsules for specific occasions (work, party, sport)
6. **Collaborative Filtering**: Suggest capsules based on similar users' choices
7. **Virtual Try-On**: AR preview of generated capsules
8. **Shopping Integration**: Direct purchase of recommended items

## Design Decisions and Rationale

### Why Gemini API?

- **Free Tier**: Generous free quota for MVP
- **Quality**: Excellent at understanding fashion, style, and complex classifications
- **JSON Mode**: Native support for structured output (response_mime_type="application/json")
- **Speed**: Fast response times with gemini-2.5-flash
- **Context**: Can analyze all 9 fields simultaneously for better combinations

### Why 9 Fields Classification?

- **Comprehensive**: Covers all aspects of clothing (category, subtype, color, material, fit, style, season, pattern, description)
- **Accurate**: Enables precise matching and harmonious combinations
- **AI-Friendly**: Provides rich context for Gemini to make informed decisions
- **User Value**: Detailed classification helps create truly stylish outfits

### Why Smart Prioritization (1-3 usageCount)?

- **Avoid Unloved Items**: Items with usageCount = 0 могут быть нелюбимыми, не стоит их навязывать
- **Proven Choices**: Items с usageCount 1-3 уже одобрены пользователем, но используются редко
- **Balanced Approach**: 3 разных стратегии (микс, проверенные, экспериментальная) дают разнообразие
- **Data-Driven**: Based on actual usage statistics from existing capsules

### Why Season Context Instead of Filtering?

- **Flexibility**: Свитер можно носить зимой (основная одежда), весной/осенью (средний слой), летом (верхний слой для прохладных вечеров)
- **Layering**: Футболки - базовый слой круглый год, не только летом
- **Smart AI**: Gemini сам решает уместность вещей с учетом многослойности
- **No Hard Filters**: Жесткая фильтрация по полю season ограничивает возможности

### Why 3 Variants?

- **Choice**: Gives user options without overwhelming
- **Diversity**: Enough to show different styles (minimum 30% difference)
- **Performance**: Reasonable generation time and token usage

### Why Liquid Glass Button?

- **Modern**: Matches current design trends
- **Non-Intrusive**: Floats above content without blocking
- **Mobile-Optimized**: Active state instead of hover for touch devices
- **Discoverable**: Eye-catching but not distracting

### Why AI Recommendations?

- **Educational**: Users learn why certain items work together
- **Transparency**: Shows reasoning behind AI decisions
- **Actionable**: Provides specific suggestions for improvement
- **Trust**: Builds confidence in AI-generated combinations
