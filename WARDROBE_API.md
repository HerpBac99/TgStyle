# Wardrobe API Documentation

## Обзор

API для управления гардеробом пользователей. Позволяет сохранять фотографии одежды с вырезанным фоном, получать список всех предметов и удалять их.

## База данных

### Таблица `wardrobe_items`

```sql
CREATE TABLE wardrobe_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    name VARCHAR(255),
    category VARCHAR(100),
    color VARCHAR(50),
    tags TEXT[],
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Индексы

- `idx_wardrobe_user_id` - для быстрого поиска по пользователю
- `idx_wardrobe_category` - для фильтрации по категориям
- `idx_wardrobe_created_at` - для сортировки по дате

## Endpoints

### POST /api/wardrobe

Создать новый предмет гардероба.

**Требуется аутентификация:** Да (через Telegram WebApp initData)

**Request Body:**
```json
{
  "initData": "query_id=AAH...",   // Telegram WebApp initData
  "imageBase64": "data:image/png;base64,iVBOR...",
  "name": "Черная куртка",         // опционально
  "category": "Верхняя одежда",    // опционально
  "color": "Черный",               // опционально
  "tags": ["casual", "зима"]       // опционально
}
```

**Response:**
```json
{
  "success": true,
  "item": {
    "id": 1,
    "imageUrl": "/uploads/wardrobe/123/item_1234567890_abc123.png",
    "name": "Черная куртка",
    "category": "Верхняя одежда",
    "color": "Черный",
    "tags": ["casual", "зима"],
    "createdAt": "2025-10-09T10:00:00.000Z"
  }
}
```

**Логика работы:**
1. Получает base64 изображение
2. Парсит формат (PNG, JPG)
3. Создает папку пользователя `uploads/wardrobe/{userId}/`
4. Сохраняет файл с уникальным именем: `item_{timestamp}_{random}.png`
5. Создает запись в БД с путем к файлу
6. Возвращает URL для доступа к изображению

### GET /api/wardrobe

Получить все предметы гардероба пользователя.

**Требуется аутентификация:** Да (через Telegram WebApp initData)

**Query Parameters:**
- `initData` - Telegram WebApp initData (обязательно)

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "imageUrl": "/uploads/wardrobe/123/item_1234567890_abc123.png",
      "name": "Черная куртка",
      "category": "Верхняя одежда",
      "color": "Черный",
      "tags": ["casual", "зима"],
      "createdAt": "2025-10-09T10:00:00.000Z"
    },
    {
      "id": 2,
      "imageUrl": "/uploads/wardrobe/123/item_1234567891_def456.png",
      "name": null,
      "category": null,
      "color": null,
      "tags": [],
      "createdAt": "2025-10-09T10:05:00.000Z"
    }
  ]
}
```

**Логика работы:**
1. Получает userId из токена аутентификации
2. Запрашивает все записи пользователя из БД
3. Формирует URLs для доступа к изображениям
4. Возвращает массив предметов, отсортированный по дате (новые первые)

### DELETE /api/wardrobe/:id

Удалить предмет гардероба.

**Требуется аутентификация:** Да (через Telegram WebApp initData)

**URL Parameters:**
- `id` - ID предмета (число)

**Query Parameters:**
- `initData` - Telegram WebApp initData (обязательно)

**Response:**
```json
{
  "success": true,
  "message": "Item deleted successfully"
}
```

**Логика работы:**
1. Проверяет что предмет существует
2. Проверяет что предмет принадлежит текущему пользователю
3. Удаляет файл изображения с диска
4. Удаляет запись из БД
5. Возвращает успех

**Error Responses:**
- `400` - Invalid item ID
- `403` - Access denied (предмет принадлежит другому пользователю)
- `404` - Item not found

## Структура хранения файлов

```
server/
  uploads/
    wardrobe/
      123/                    # userId
        item_1696858800000_abc123.png
        item_1696858900000_def456.png
      456/                    # другой userId
        item_1696859000000_xyz789.png
```

## Клиентская часть (uiWardrobe.ts)

### Основные методы

**handleWardrobeOpen()**
- Вызывается при открытии закладки "Гардероб"
- Загружает предметы с сервера через GET /api/wardrobe
- Рендерит грид с карточками

**confirmPreview()**
- Вызывается при нажатии кнопки подтверждения в модальном окне
- Отправляет base64 на сервер через POST /api/wardrobe
- Добавляет новый предмет в грид

**removeItem(itemId)**
- Вызывается при долгом нажатии на карточку
- Удаляет предмет через DELETE /api/wardrobe/:id
- Обновляет грид

### Интерфейс WardrobeItem

```typescript
interface WardrobeItem {
  id: number;
  imageUrl: string;
  name?: string;
  category?: string;
  color?: string;
  tags?: string[];
  createdAt: string;
}
```

## Миграция данных

Для применения изменений в БД выполнить:

```bash
cd db
node prisma/migrate-wardrobe.js
```

Или вручную запустить SQL из `db/migrations/add_wardrobe_items.sql`

## Запуск сервера

После всех изменений перезапустить сервер:

```bash
cd server
node server.js
```

## Преимущества текущей архитектуры

1. **Производительность** - статические файлы отдаются быстрее чем из БД
2. **Масштабируемость** - легко перенести на CDN
3. **Безопасность** - проверка владельца перед удалением
4. **Удобство** - прямые URLs для изображений
5. **Оптимизация** - индексы БД для быстрых запросов
