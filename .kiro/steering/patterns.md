# Паттерны кодирования

## TypeScript

### Модули клиента
- Используй singleton паттерн для менеджеров (экспорт экземпляра, не класса)
- Пример: `export const authManager = new AuthManager();`
- Все модули в `client/src/modules/` следуют этому паттерну

### Типизация
- Строгая типизация включена (`strict: true` в tsconfig.json)
- Типы Telegram WebApp в `client/src/types/index.ts`
- Избегай `any`, используй `unknown` если тип неизвестен

### Импорты
- Используй path aliases: `import { logger } from '@/modules/logger';`
- Группируй импорты: types → modules → utils → styles

## API Communication

### Client → Server
```typescript
// Используй api модуль
import { api } from '@/modules/api';
const response = await api.post('/api/wardrobe', data);
```

### Server → FastVLM
```javascript
// Через fetch к Python сервису
const response = await fetch('http://127.0.0.1:3001/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image_base64, prompt })
});
```

## Работа с изображениями

### Загрузка на сервер
- Используй Multer middleware
- Сохраняй в `server/uploads/`
- Возвращай путь, не base64

### Обработка
- Удаление фона: FastVLM `/background-removal` endpoint
- Классификация: FastVLM `/classify-clothing` endpoint
- Resize/optimize: Sharp на сервере

## База данных

### Prisma паттерны
```javascript
// Всегда используй Prisma client из lib/prisma.js
const prisma = require('./src/lib/prisma');

// Транзакции для связанных операций
await prisma.$transaction([
  prisma.user.update(...),
  prisma.historyItem.create(...)
]);
```

### Денормализация
- `likesCount`, `viewsCount` хранятся в основной таблице
- Обновляй счетчики при изменении связанных записей

## UI Patterns

### Модальные окна
- Добавляй класс `hidden` для скрытия
- Используй overlay для затемнения фона
- Пример в `client/index.html`: `#wardrobe-preview-modal`

### Состояние UI
- Управляй через `uiManager` модуль
- Методы: `showScreen()`, `hideScreen()`, `switchTab()`

### Canvas (Fabric.js)
- Инициализация в `client/src/modules/uiCapsulesGrid.ts`
- Сохранение: `canvas.toJSON()` → `canvasData` в БД
- Загрузка: `canvas.loadFromJSON(canvasData)`

## Логирование

### Client
```typescript
import { logger } from '@/modules/logger';
logger.info('Message', { context });
logger.error('Error', { error });
```

### Server
```javascript
const { logger } = require('./src/controllers/logsController');
logger.info('API request', { endpoint, userId });
```

## Кеширование

### Client-side
- Используй `dataCacheManager` для кеширования данных
- Методы: `set()`, `get()`, `invalidate()`
- Кеш в памяти, сбрасывается при перезагрузке

### Server-side
- Redis для сессий и временных данных
- Prisma для постоянного хранения

## Обработка ошибок

### Client
```typescript
try {
  const result = await api.post('/api/endpoint', data);
} catch (error) {
  logger.error('Operation failed', { error });
  // Показать пользователю уведомление
}
```

### Server
```javascript
try {
  // операция
} catch (error) {
  logger.error('Error', { error });
  res.status(500).json({ error: 'Internal server error' });
}
```

## Где искать детали

- **API эндпоинты**: `server/src/api/*.js`
- **Схема БД**: `db/prisma/schema.prisma`
- **Типы**: `client/src/types/index.ts`
- **Константы**: `client/src/utils/constants.ts`
- **Конфиг FastVLM**: `fastvlm-server/config.py`
