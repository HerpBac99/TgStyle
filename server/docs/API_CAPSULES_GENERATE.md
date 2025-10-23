# API Endpoint: Генерация капсул

## POST /api/capsules/generate

Генерирует 3 варианта капсул (образов) на основе вещей гардероба пользователя с использованием Gemini AI.

### Описание

Endpoint анализирует гардероб пользователя, вычисляет статистику использования каждой вещи, определяет текущий сезон и отправляет запрос в FastVLM сервер для генерации 3 разнообразных комбинаций одежды с помощью Gemini API.

### Аутентификация

Требуется Telegram WebApp authentication через header `X-Init-Data`.

### Request

#### Headers
```
Content-Type: application/json
X-Init-Data: <telegram_init_data>
```

#### Body
```json
{
  "excludeCombinations": [
    [1, 2, 3],
    [4, 5, 6]
  ]
}
```

**Параметры:**
- `excludeCombinations` (optional): Массив массивов ID вещей для исключения при регенерации

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "capsules": [
    {
      "name": "Casual Denim",
      "description": "Повседневный образ с джинсовой курткой",
      "reasoning": "Черная джинсовая куртка (верхний слой) хорошо сочетается с белой футболкой (базовый слой)",
      "recommendations": "Добавьте солнцезащитные очки для завершения образа",
      "itemIds": [1, 5, 12, 20],
      "isUnique": true,
      "items": [
        {
          "id": 1,
          "category": "BODYWEAR",
          "subtype": "Футболка",
          "color": "Белый",
          "material": "Хлопок",
          "fit": "Regular",
          "style": "Повседневный",
          "season": "All-season",
          "pattern": "Solid",
          "description": "Белая хлопковая футболка",
          "imagePath": "/uploads/wardrobe/123456789/item_1.jpg"
        }
      ]
    }
  ]
}
```

**Поля ответа:**
- `success`: Статус выполнения запроса
- `capsules`: Массив из 3 сгенерированных капсул
  - `name`: Название капсулы (максимум 3 слова на русском)
  - `description`: Краткое описание образа (1-2 предложения)
  - `reasoning`: Обоснование выбора комбинации с учетом сезона и многослойности
  - `recommendations`: Рекомендации по улучшению образа
  - `itemIds`: Массив ID вещей в капсуле
  - `isUnique`: Флаг уникальности (схожесть с существующими < 80%)
  - `items`: Полные данные вещей с 9 полями классификации

#### Error Responses

**401 Unauthorized**
```json
{
  "success": false,
  "error": "Missing Telegram authentication data"
}
```

**400 Bad Request**
```json
{
  "success": false,
  "error": "Недостаточно вещей в гардеробе (минимум 3)"
}
```

**429 Too Many Requests**
```json
{
  "success": false,
  "error": "Превышен дневной лимит генераций. Попробуйте завтра"
}
```

**502 Bad Gateway**
```json
{
  "success": false,
  "error": "Не удалось сгенерировать капсулы. Попробуйте позже"
}
```

**504 Gateway Timeout**
```json
{
  "success": false,
  "error": "Генерация заняла слишком много времени. Попробуйте снова"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": "Internal server error"
}
```

### Логика работы

1. **Валидация авторизации**: Проверка Telegram WebApp данных
2. **Загрузка гардероба**: Получение всех вещей пользователя с 9 полями классификации
3. **Проверка минимума**: Минимум 3 вещи в гардеробе
4. **Вычисление статистики**: Подсчет usageCount для каждой вещи
5. **Приоритизация**: Приоритет вещам с usageCount 1-3 (редко используемые)
6. **Определение сезона**: Автоматическое определение текущего сезона и месяца
7. **Запрос к Gemini**: Отправка данных в FastVLM для генерации через Gemini API
8. **Проверка уникальности**: Проверка схожести с существующими капсулами (порог 80%)
9. **Обогащение данных**: Добавление полных данных вещей к каждой капсуле

### Стратегия генерации

Gemini создает 3 разных подхода:
- **Капсула 1**: Микс редко используемых (usageCount 1-2) + популярных (usageCount 3+)
- **Капсула 2**: Больше популярных вещей (проверенные комбинации)
- **Капсула 3**: Экспериментальная (может включать 1-2 новые вещи с usageCount = 0)

### Учет сезонности

- Система определяет текущий сезон по месяцу
- Gemini учитывает многослойность одежды:
  - Футболки/рубашки = базовый слой круглый год
  - Свитера/кофты = средний/верхний слой
  - Куртки/пальто = верхний слой
- Нет жесткой фильтрации по полю `season` - Gemini сам решает уместность

### Таймауты

- Таймаут запроса к FastVLM: 60 секунд
- Ожидаемое время генерации: 5-10 секунд

### Зависимости

- **WardrobeUsageService**: Вычисление статистики использования и определение сезона
- **CapsuleSimilarityService**: Проверка уникальности капсул
- **FastVLM Server**: Python сервис с Gemini API (порт 3001)
- **Prisma**: Доступ к БД (WardrobeItem, Capsule)

### Примеры использования

#### JavaScript (Client)
```javascript
import { api } from '@/modules/api';

async function generateCapsules() {
  try {
    const response = await api.post('/api/capsules/generate', {
      excludeCombinations: []
    });
    
    if (response.success) {
      console.log(`Сгенерировано ${response.capsules.length} капсул`);
      response.capsules.forEach(capsule => {
        console.log(`${capsule.name}: ${capsule.description}`);
      });
    }
  } catch (error) {
    console.error('Ошибка генерации:', error);
  }
}
```

#### cURL
```bash
curl -X POST http://localhost:8443/api/capsules/generate \
  -H "Content-Type: application/json" \
  -H "X-Init-Data: query_id=..." \
  -d '{"excludeCombinations": []}'
```

### Логирование

Endpoint логирует следующие события:
- Запрос на генерацию с telegramId
- Количество вещей гардероба и существующих капсул
- Статистику использования (unused, rarely used, popular)
- Текущий сезон и месяц
- Отправку запроса в FastVLM
- Результат генерации (количество капсул, уникальность)
- Все ошибки с контекстом

### Требования

- Node.js >= 18.0.0 (для встроенного fetch)
- FastVLM сервер должен быть запущен на порту 3001
- Gemini API должен быть настроен в FastVLM
- Минимум 3 вещи в гардеробе пользователя

### См. также

- [WardrobeUsageService](../src/services/wardrobeUsageService.js)
- [CapsuleSimilarityService](../src/services/capsuleSimilarityService.js)
- [FastVLM API Documentation](../../fastvlm-server/CAPSULE_GENERATION_API.md)
