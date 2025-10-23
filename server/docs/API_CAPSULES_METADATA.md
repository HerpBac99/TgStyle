# API Capsules Metadata

## Обзор

Поле `metadata` в модели `Capsule` используется для хранения дополнительной информации о капсуле, особенно для автогенерированных капсул через Gemini AI.

## Структура Metadata

```typescript
interface CapsuleMetadata {
  source: 'ai_generated' | 'manual';  // Источник создания капсулы
  recommendations?: string;            // Рекомендации от Gemini по улучшению образа
  reasoning?: string;                  // Обоснование выбора комбинации вещей
  description?: string;                // Описание образа от Gemini
  season?: string;                     // Сезон для которого создана капсула (winter, spring, summer, autumn)
}
```

## Использование

### Создание капсулы с metadata (POST /api/capsules)

**Автогенерированная капсула:**

```json
{
  "name": "Casual Denim",
  "canvasData": { ... },
  "thumbnailImage": "data:image/png;base64,...",
  "itemIds": [1, 5, 12, 20],
  "metadata": {
    "source": "ai_generated",
    "recommendations": "Добавьте солнцезащитные очки и рюкзак для завершения образа",
    "reasoning": "Черная джинсовая куртка (denim, casual) отлично сочетается с белой футболкой (cotton, casual). Синие джинсы дополняют образ.",
    "description": "Повседневный образ для весны",
    "season": "spring"
  }
}
```

**Обычная капсула (без metadata):**

```json
{
  "name": "Моя капсула",
  "canvasData": { ... },
  "thumbnailImage": "data:image/png;base64,...",
  "itemIds": [2, 7, 15]
}
```

### Ответ сервера

```json
{
  "success": true,
  "capsule": {
    "id": 123,
    "name": "Casual Denim",
    "thumbnailUrl": "/uploads/capsules/123456789/capsule_123456789_1234567890.png",
    "canvasData": { ... },
    "metadata": {
      "source": "ai_generated",
      "recommendations": "Добавьте солнцезащитные очки и рюкзак для завершения образа",
      "reasoning": "Черная джинсовая куртка (denim, casual) отлично сочетается с белой футболкой (cotton, casual). Синие джинсы дополняют образ.",
      "description": "Повседневный образ для весны",
      "season": "spring"
    },
    "createdAt": "2025-10-23T10:30:00.000Z",
    "itemCount": 4,
    "items": [ ... ]
  }
}
```

## Получение капсул

### GET /api/capsules (список капсул пользователя)

Возвращает все капсулы с полем `metadata`:

```json
{
  "success": true,
  "capsules": [
    {
      "id": 123,
      "name": "Casual Denim",
      "metadata": {
        "source": "ai_generated",
        "season": "spring",
        ...
      },
      ...
    },
    {
      "id": 124,
      "name": "Моя капсула",
      "metadata": null,
      ...
    }
  ],
  "pagination": { ... }
}
```

### GET /api/capsules/:id (одна капсула)

Возвращает капсулу с полным metadata:

```json
{
  "success": true,
  "capsule": {
    "id": 123,
    "name": "Casual Denim",
    "metadata": {
      "source": "ai_generated",
      "recommendations": "...",
      "reasoning": "...",
      "description": "...",
      "season": "spring"
    },
    ...
  }
}
```

## Фильтрация по источнику

Можно фильтровать капсулы по источнику создания:

```javascript
// Получить только AI-генерированные капсулы
const aiCapsules = capsules.filter(c => c.metadata?.source === 'ai_generated');

// Получить только ручные капсулы
const manualCapsules = capsules.filter(c => !c.metadata || c.metadata.source === 'manual');
```

## Отображение в UI

### Показ рекомендаций

```typescript
if (capsule.metadata?.recommendations) {
  showRecommendations(capsule.metadata.recommendations);
}
```

### Показ обоснования

```typescript
if (capsule.metadata?.reasoning) {
  showReasoning(capsule.metadata.reasoning);
}
```

### Индикатор AI-генерации

```typescript
if (capsule.metadata?.source === 'ai_generated') {
  showAIBadge(); // Показать значок "Создано AI"
}
```

## Требования

- **Requirements**: 4.1, 4.2, 11.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
- **Поле metadata**: Опциональное, тип JSON
- **Автоматическое название**: Используется название от Gemini (максимум 3 слова)
- **Дата создания**: Автоматически устанавливается в `createdAt`
- **Источник**: Сохраняется в `metadata.source`
- **Рекомендации**: Сохраняются в `metadata.recommendations`
- **Сезон**: Сохраняется в `metadata.season`

## Примеры использования

### Клиентский код (TypeScript)

```typescript
import { capsulesService } from '@/modules/capsules/CapsulesService';
import { capsuleGenerationService } from '@/modules/capsules/CapsuleGenerationService';

// Создание AI-генерированной капсулы
async function saveGeneratedCapsule(generatedCapsule: GeneratedCapsule) {
  const capsule = await capsulesService.createCapsule({
    name: generatedCapsule.name, // Название от Gemini (макс 3 слова)
    canvasData: canvasData,
    thumbnailImage: thumbnailBase64,
    itemIds: generatedCapsule.itemIds,
    metadata: {
      source: 'ai_generated',
      recommendations: generatedCapsule.recommendations,
      reasoning: generatedCapsule.reasoning,
      description: generatedCapsule.description,
      season: capsuleGenerationService.getCurrentSeason()
    }
  });
  
  return capsule;
}

// Создание обычной капсулы
async function saveManualCapsule() {
  const capsule = await capsulesService.createCapsule({
    name: 'Моя капсула',
    canvasData: canvasData,
    thumbnailImage: thumbnailBase64,
    itemIds: selectedItemIds
    // metadata не передается - будет null
  });
  
  return capsule;
}
```

## База данных

### Схема Prisma

```prisma
model Capsule {
  id          Int      @id @default(autoincrement())
  telegramId  BigInt   @map("telegram_id")
  
  name        String?  @db.VarChar(255)
  canvasData  Json
  metadata    Json?    // Новое поле для metadata
  
  createdAt   DateTime @default(now()) @map("created_at")
  ...
}
```

### Миграция

Поле `metadata` добавлено в схему как опциональное поле типа JSON. Для существующих капсул значение будет `null`.

```sql
ALTER TABLE capsules ADD COLUMN metadata JSONB;
```

## Тестирование

Запустите тестовый скрипт:

```bash
node server/test-create-capsule-with-metadata.js
```

Тест проверяет:
1. Создание капсулы с metadata
2. Получение капсулы и проверку metadata
3. Целостность всех полей metadata
4. Создание обычной капсулы без metadata
