---
inclusion: manual
---

# Quick Reference - TgStyle

## Быстрый вход в контекст

### Основные модули

| Модуль | Файл | Роль | Singleton |
|--------|------|------|-----------|
| WardrobeManager | `client/src/modules/wardrobe/WardrobeManager.ts` | UI координатор гардероба | ✅ |
| WardrobeService | `client/src/modules/wardrobe/WardrobeService.ts` | API запросы гардероба | ✅ |
| CapsulesManager | `client/src/modules/capsules/CapsulesManager.ts` | UI координатор капсул | ✅ |
| PhotoProcessor | `client/src/modules/shared/PhotoProcessor.ts` | Обработка фото через FastVLM | ✅ |
| DataCacheManager | `client/src/modules/dataCache.ts` | Кэширование данных | ✅ |
| UIModalManager | `client/src/modules/uiModalManager.ts` | Модальные окна | ✅ |

### Ключевые файлы

**Client**:
- `client/src/main.ts` - точка входа
- `client/src/modules/shared/utils.ts` - утилиты (оптимизация изображений)
- `client/src/types/wardrobe.ts` - типы данных
- `client/css/wardrobe.css` - стили гардероба

**Server**:
- `server/server.js` - главный файл сервера
- `server/src/api/wardrobe.js` - API гардероба
- `server/src/api/capsules.js` - API капсул
- `server/src/api/clothingClassification.js` - API классификации
- `server/src/utils/fileStorage.js` - работа с файлами

**FastVLM**:
- `fastvlm-server/server.py` - Flask сервер
- `fastvlm-server/prompt/CLASS_PROMPT.md` - промпт для классификации

**Database**:
- `db/prisma/schema.prisma` - схема БД

### Частые задачи

#### Добавить новое поле в вещь

1. Обновить `db/prisma/schema.prisma`:
```prisma
model WardrobeItem {
  // ...
  newField String?
}
```

2. Запустить миграцию:
```bash
cd db
npm run db:push
```

3. Обновить типы `client/src/types/wardrobe.ts`:
```typescript
interface WardrobeItem {
  // ...
  newField?: string;
}
```

4. Обновить API `server/src/api/wardrobe.js`:
```javascript
// В POST /
newField: newField || null

// В PUT /:id
if (updates.newField !== undefined) {
  updateData.newField = updates.newField;
}
```

5. Обновить UI `client/src/modules/uiModalManager.ts`

#### Изменить оптимизацию изображений

**Клиент** (`client/src/modules/shared/utils.ts`):
```typescript
export async function optimizeImageForUpload(
  base64Image: string,
  maxWidth: number = 1200 // Изменить размер
): Promise<string>
```

**Сервер** (`server/src/api/wardrobe.js`):
```javascript
.resize(1200, 1200, { // Изменить размер
  fit: 'inside',
  withoutEnlargement: true
})
.png({
  quality: 90, // Изменить качество
  compressionLevel: 9
})
```

#### Добавить новую категорию одежды

1. `client/src/types/wardrobe.ts`:
```typescript
export enum ClothingCategory {
  // ...
  NEWCATEGORY = 'NEWCATEGORY'
}
```

2. `client/src/modules/wardrobe/WardrobeManager.ts`:
```typescript
const categories = [
  // ...
  { key: 'NEWCATEGORY', label: 'Новая категория' }
];
```

3. `fastvlm-server/prompt/CLASS_PROMPT.md` - добавить в промпт

#### Отладка проблем

**Проверить логи клиента**:
```
logs/client/Username_YYYY-MM-DD.log
```

**Проверить логи сервера**:
Смотреть в консоли где запущен `python start_app.py`

**Проверить FastVLM**:
```bash
python fastvlm-server/test_classify_clothing.py
```

**Проверить БД**:
```bash
cd db
npm run db:studio
```

### Команды

```bash
# Установка
npm install
cd db && npm install

# Разработка
python start_llm.py      # Терминал 1: FastVLM
python start_app.py      # Терминал 2: Приложение

# Проверка типов
npm run type-check

# Сборка
npm run build

# База данных
cd db
npm run db:generate      # Генерация Prisma client
npm run db:push          # Push схемы
npm run db:migrate       # Миграции
npm run db:studio        # Prisma Studio
```

### Порты

- **8443** - Node.js сервер (HTTPS)
- **3001** - FastVLM Python сервис
- **5173** - Vite dev server
- **5432** - PostgreSQL
- **6379** - Redis

### Переменные окружения

`.env`:
```
NODE_ENV=production
PORT=8443
DOMAIN=your-domain.com
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=...
FASTVLM_URL=http://127.0.0.1:3001
```

### Типичные ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| Черный фон | JPEG вместо PNG | Использовать PNG для прозрачности |
| Медленная загрузка | Большое изображение | Оптимизировать ДО отправки |
| localStorage overflow | base64 в кэше | Фильтровать base64 |
| Вещь не появляется | Ошибка сервера | Проверить логи, откатить оптимистичное создание |
| FastVLM не отвечает | Сервис не запущен | `python start_llm.py` |
| БД ошибка | Схема не синхронизирована | `cd db && npm run db:push` |

### Архитектурные паттерны

**Singleton**: Все менеджеры экспортируются как экземпляры
```typescript
export const wardrobeManager = new WardrobeManager();
```

**Оптимистичное обновление**: UI обновляется сразу, затем синхронизация с сервером
```typescript
// 1. Добавить в UI
wardrobeItems.unshift(optimisticItem);
renderGrid();

// 2. Сохранить на сервер
const serverItem = await wardrobeService.addItem(...);

// 3. Заменить временную вещь
wardrobeItems[index] = serverItem;
```

**Событийная система**: Связь между модулями через CustomEvent
```typescript
// Отправка
window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
  detail: { item }
}));

// Прием
window.addEventListener('wardrobe:item-saved', (e) => {
  const item = e.detail.item;
});
```

**Кэширование**: Трехуровневое
1. Память (DataCacheManager) - все данные
2. localStorage - первые 30 вещей (без base64)
3. Браузерный кэш - изображения

### Оптимизация изображений (текущая)

| Этап | Размер | Формат | Качество | Цель |
|------|--------|--------|----------|------|
| Оригинал | 5-10 MB | PNG/JPEG | 100% | - |
| Для FastVLM | 800px | JPEG | 80% | Быстрая передача (~200 KB) |
| Для сохранения | 1200px | PNG | - | Сохранить прозрачность |
| На сервере | 1200px | PNG/JPEG | 90%/85% | Оптимальный размер |

### Метрики производительности

- Классификация: **1-2 сек**
- Удаление фона: **0.5-1 сек**
- Сохранение: **1-2 сек**
- **Общее время: 3-5 сек** (было 30+ сек)

### Связи между модулями

```
User Action
    ↓
WardrobeManager (UI координатор)
    ↓
WardrobeService (API запросы)
    ↓
DataCacheManager (кэш)
    ↓
Server API
    ↓
Database (Prisma)
```

```
Photo Upload
    ↓
WardrobeManager
    ↓
PhotoProcessor
    ↓
FastVLM Server (Python)
    ↓
Classification Result
    ↓
WardrobeManager (preview)
    ↓
WardrobeService (save)
```

### Полезные ссылки

- Полная документация: `.kiro/steering/wardrobe-architecture.md`
- Технологии: `.kiro/steering/tech.md`
- Структура: `.kiro/steering/structure.md`
- Правила: `.kiro/steering/rules.md`
- Паттерны: `.kiro/steering/patterns.md`

### Чеклист перед коммитом

- [ ] `npm run type-check` - нет ошибок типов
- [ ] `npm run build` - успешная сборка
- [ ] Проверить логи клиента на ошибки
- [ ] Протестировать в реальном Telegram
- [ ] Проверить производительность (время загрузки)
- [ ] Проверить размер изображений (не больше 1-2 MB)
