# 🗄️ План оптимизации хранения истории в TgStyle

## 🎯 Проблема

**Текущая реализация:**
- История анализов сохраняется в БД PostgreSQL с фото в base64 (`photoData` TEXT поле)
- Одно фото = 1-5 МБ текста в БД
- База данных будет огромной: 1000 фото = 5-10 ГБ
- localStorage на клиенте: 5-10 МБ (медленная загрузка при старте)

**Проблемы:**
- ❌ Огромный размер базы данных
- ❌ Медленные запросы к PostgreSQL с большими TEXT полями
- ❌ Долгая загрузка истории при входе пользователя (500-1000ms)
- ❌ Огромные бэкапы БД
- ❌ localStorage быстро заполняется

---

## 🎯 Решение: Трехуровневая архитектура хранения

### **Уровень 1: localStorage (клиент)** - мгновенная загрузка
- Последние 3-5 анализов с **thumbnails** (маленькие превью 100x100px)
- Быстрая первичная отрисовка интерфейса (<100ms)
- Размер: ~100-200 КБ вместо текущих 5-10 МБ
- **Выигрыш: в 50 раз меньше размер, в 10 раз быстрее загрузка**

### **Уровень 2: Redis (сервер)** - кэш полной истории
- Последние 20-30 анализов пользователя с thumbnails
- TTL: 24 часа (автоматическое удаление старых)
- Быстрый доступ (1-5ms)
- Размер на пользователя: ~500 КБ
- **Выигрыш: мгновенная отдача истории без запросов к PostgreSQL**

### **Уровень 3: PostgreSQL + файлы на диске** - постоянное хранилище
- Все анализы навсегда
- Оригиналы фото: `/uploads/photos/2025/01/user_123/photo_456.jpg`
- Thumbnails: `/uploads/photos/2025/01/user_123/photo_456_thumb.jpg`
- В БД хранится только URL к файлу (~100 байт вместо 2 МБ)
- **Выигрыш: в 100 раз меньше размер БД**

---

## 📊 Поток работы при входе пользователя

```
Вход пользователя в приложение:
│
├─ 1) Мгновенное отображение (localStorage) - 50ms
│     └─ Показываем последние 3-5 анализов из localStorage
│     └─ UI отрисован мгновенно с thumbnails
│
├─ 2) Загрузка из Redis (быстро) - 200-300ms
│     └─ Запрос к серверу GET /api/history
│     └─ Сервер проверяет Redis cache: user:${userId}:history
│     └─ Возвращаем полную историю с thumbnails
│     └─ Обновляем UI с полной историей
│
└─ 3) Fallback на PostgreSQL (при отсутствии в Redis) - 500-800ms
      └─ Читаем из БД с JOIN user + thumbnailUrl
      └─ Сохраняем в Redis с TTL 24 часа
      └─ Возвращаем клиенту
      └─ Следующий запрос будет из Redis
```

---

## 🛠️ Структура хранилища

### **1. Файловая система**

```
server/
  uploads/
    photos/
      2025/
        01/
          user_123/
            photo_456_original.jpg    <- оригинал (500-2000 КБ)
            photo_456_thumb.jpg       <- thumbnail 100x100px (~5-10 КБ)
          user_789/
            photo_101_original.jpg
            photo_101_thumb.jpg
```

### **2. Redis Cache Structure**

```javascript
// Key: `user:${userId}:history`
// Value: JSON массив с thumbnails
// TTL: 86400 секунд (24 часа)

{
  "items": [
    {
      "id": 123,
      "thumbnailUrl": "/uploads/photos/2025/01/user_123/photo_123_thumb.jpg",
      "photoUrl": "/uploads/photos/2025/01/user_123/photo_123_original.jpg",
      "analysisText": "Стильное платье синего цвета",
      "technicalAnalysis": "FastVLM: синее платье...",
      "isPublic": true,
      "createdAt": "2025-01-15T10:00:00Z",
      "ratingsCount": 5,
      "commentsCount": 2
    },
    // ... еще 19-29 элементов
  ],
  "total": 25,
  "cached_at": "2025-01-15T10:00:00Z"
}
```

### **3. PostgreSQL Schema (обновленная)**

```prisma
model HistoryItem {
  id                Int      @id @default(autoincrement())
  userId            Int
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Новые поля для файлового хранения
  photoUrl          String   // /uploads/photos/2025/01/user_123/photo_456_original.jpg
  thumbnailUrl      String   // /uploads/photos/2025/01/user_123/photo_456_thumb.jpg
  photoFileSize     Int?     // размер оригинала в байтах
  thumbnailFileSize Int?     // размер thumbnail в байтах

  // Удалить после миграции
  photoData         String?  // @deprecated - старое base64 хранилище

  analysisText      String?  // пользовательское описание стиля
  technicalAnalysis String?  // техническое описание ИИ

  isPublic          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Связи
  ratings           Rating[]
  comments          Comment[]
  notifications     Notification[]

  @@map("history_items")
  @@index([userId, createdAt])
  @@index([isPublic, createdAt])
}
```

### **4. Client localStorage (обновленный)**

```javascript
// Вместо хранения full base64, храним только thumbnails
localStorage.setItem('tgstyle_history_cache', JSON.stringify({
  items: [
    {
      id: 123,
      thumbnail: "data:image/jpeg;base64,/9j/4AAQ...", // ~10 КБ base64
      analysisText: "Стильное платье",
      createdAt: "2025-01-15T10:00:00Z",
      needsFullLoad: true // флаг что нужно загрузить оригинал
    },
    // ... еще 2-4 элемента
  ],
  lastSync: "2025-01-15T10:00:00Z"
}));

// Общий размер: ~100-200 КБ (вместо 5-10 МБ)
```

---

## 📝 Детальный план реализации

### **Этап 1: Модуль хранения фото на диске**
**Файл:** `server/src/utils/storage.js`

**Задачи:**
1. ✅ Функция сохранения фото на диск с автоматическим созданием папок
2. ✅ Генерация thumbnails с использованием sharp/jimp
3. ✅ Функция получения фото по URL
4. ✅ Функция удаления фото (оригинал + thumbnail)
5. ✅ Валидация размера и формата изображений

**API:**
```javascript
// Сохранение фото
const { photoUrl, thumbnailUrl } = await storageManager.savePhoto({
  userId: 123,
  imageBuffer: Buffer,
  filename: 'photo_456'
});

// Получение фото
const imageBuffer = await storageManager.getPhoto(photoUrl);

// Удаление фото
await storageManager.deletePhoto(photoUrl); // удаляет оригинал + thumbnail
```

**Конфигурация:**
```javascript
const STORAGE_CONFIG = {
  BASE_PATH: './uploads/photos',
  THUMBNAIL_SIZE: 100, // 100x100px
  THUMBNAIL_QUALITY: 80,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 МБ
  ALLOWED_FORMATS: ['jpeg', 'jpg', 'png', 'webp']
};
```

---

### **Этап 2: Модуль Redis cache**
**Файл:** `server/src/utils/redis.js`

**Задачи:**
1. ✅ Инициализация Redis клиента
2. ✅ Функция кэширования истории пользователя
3. ✅ Функция получения истории из кэша
4. ✅ Инвалидация кэша при изменении истории
5. ✅ Graceful fallback при недоступности Redis

**API:**
```javascript
// Получение истории из кэша
const cachedHistory = await redisCache.getHistory(userId);
if (cachedHistory) {
  return cachedHistory; // мгновенный возврат
}

// Сохранение в кэш
await redisCache.cacheHistory(userId, historyItems, { ttl: 86400 });

// Инвалидация при создании/удалении
await redisCache.invalidateHistory(userId);
```

**Конфигурация:**
```javascript
const REDIS_CONFIG = {
  HISTORY_TTL: 86400, // 24 часа
  HISTORY_PREFIX: 'user',
  MAX_CACHED_ITEMS: 30,
  CONNECT_TIMEOUT: 5000
};
```

---

### **Этап 3: Обновление Prisma схемы и миграция**
**Файлы:** `db/prisma/schema.prisma`, `db/prisma/migrations/`

**Задачи:**
1. ✅ Добавить поля `photoUrl`, `thumbnailUrl` в HistoryItem
2. ✅ Добавить поля размера файлов
3. ✅ Создать индексы для быстрого поиска
4. ✅ Сделать `photoData` опциональным (для обратной совместимости)
5. ✅ Создать миграцию БД

**Команды:**
```bash
# Создание миграции
npx prisma migrate dev --name add_photo_urls

# Применение миграции
npx prisma migrate deploy
```

---

### **Этап 4: Скрипт миграции существующих данных**
**Файл:** `server/scripts/migrate-photos.js`

**Задачи:**
1. ✅ Извлечение всех HistoryItem с photoData из БД
2. ✅ Конвертация base64 → Buffer
3. ✅ Сохранение на диск через storageManager
4. ✅ Генерация thumbnails
5. ✅ Обновление записей в БД (photoUrl, thumbnailUrl)
6. ✅ Удаление photoData после проверки
7. ✅ Логирование прогресса

**Использование:**
```bash
node server/scripts/migrate-photos.js

# С параметрами
node server/scripts/migrate-photos.js --batch-size=100 --dry-run
```

**Логика:**
```javascript
// Миграция batch по batch
for (let i = 0; i < totalItems; i += batchSize) {
  const items = await prisma.historyItem.findMany({
    where: { photoData: { not: null } },
    take: batchSize,
    skip: i
  });

  for (const item of items) {
    // 1. Декодировать base64
    const buffer = Buffer.from(item.photoData, 'base64');
    
    // 2. Сохранить на диск
    const { photoUrl, thumbnailUrl } = await storage.savePhoto({
      userId: item.userId,
      imageBuffer: buffer,
      filename: `photo_${item.id}`
    });
    
    // 3. Обновить БД
    await prisma.historyItem.update({
      where: { id: item.id },
      data: { 
        photoUrl, 
        thumbnailUrl,
        photoData: null // удаляем base64
      }
    });
  }
}
```

---

### **Этап 5: Обновление API /analyze**
**Файл:** `server/src/api/analyze.js`

**Изменения:**
1. ✅ Принимаем base64 фото как раньше
2. ✅ Конвертируем в Buffer
3. ✅ **Сохраняем на диск** через `storageManager.savePhoto()`
4. ✅ Получаем `photoUrl` и `thumbnailUrl`
5. ✅ Создаем запись в БД с URL вместо base64
6. ✅ **Инвалидируем Redis кэш** пользователя
7. ✅ Возвращаем клиенту `thumbnailUrl` для кэширования

**Код:**
```javascript
// Сохраняем фото на диск
const imageBuffer = Buffer.from(photo, 'base64');
const { photoUrl, thumbnailUrl } = await storageManager.savePhoto({
  userId: dbUser.id,
  imageBuffer,
  filename: `analysis_${Date.now()}`
});

// Создаем запись в истории с URL
const historyItem = await prisma.historyItem.create({
  data: {
    userId: dbUser.id,
    photoUrl,        // /uploads/photos/2025/01/user_123/photo_456.jpg
    thumbnailUrl,    // /uploads/photos/2025/01/user_123/photo_456_thumb.jpg
    technicalAnalysis,
    isPublic: true
  }
});

// Инвалидируем кэш
await redisCache.invalidateHistory(dbUser.id);

// Возвращаем клиенту
return {
  success: true,
  analysis: technicalAnalysis,
  historyItemId: historyItem.id,
  thumbnailUrl  // клиент сохранит в localStorage
};
```

---

### **Этап 6: Обновление API /history**
**Файл:** `server/src/api/history.js`

**Изменения:**
1. ✅ **Сначала проверяем Redis cache**
2. ✅ При попадании - возвращаем мгновенно
3. ✅ При промахе - читаем из PostgreSQL
4. ✅ Сохраняем в Redis для следующего запроса
5. ✅ Возвращаем `thumbnailUrl` вместо `photoData`

**Код:**
```javascript
router.get('/', async (req, res) => {
  const dbUser = await getUserByTelegramId(telegramUser.id);
  
  // 1. Проверяем Redis cache
  const cachedHistory = await redisCache.getHistory(dbUser.id);
  if (cachedHistory) {
    logger.info('History served from Redis cache');
    return res.json({
      success: true,
      history: cachedHistory.items,
      cached: true
    });
  }
  
  // 2. Читаем из PostgreSQL
  const historyItems = await prisma.historyItem.findMany({
    where: { userId: dbUser.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      thumbnailUrl: true,  // только thumbnail, не photoUrl
      photoUrl: true,      // для full-size при клике
      analysisText: true,
      createdAt: true,
      // ...
    }
  });
  
  // 3. Кэшируем в Redis
  await redisCache.cacheHistory(dbUser.id, historyItems);
  
  // 4. Возвращаем клиенту
  return res.json({
    success: true,
    history: historyItems,
    cached: false
  });
});
```

---

### **Этап 7: Новый endpoint /api/photos/:id**
**Файл:** `server/src/api/photos.js`

**Назначение:**
- Отдача оригинальных фото по запросу
- Отдача thumbnails
- Проверка прав доступа (только владелец или public)

**Endpoints:**
```javascript
// Получение thumbnail
GET /api/photos/:id/thumbnail
→ Возвращает thumbnail (быстро, ~10 КБ)

// Получение оригинала
GET /api/photos/:id/original
→ Возвращает full-size photo (медленнее, ~500 КБ - 2 МБ)

// Прямой доступ через URL (для public фото)
GET /uploads/photos/2025/01/user_123/photo_456_thumb.jpg
→ Nginx отдает напрямую (самое быстрое)
```

**Код:**
```javascript
router.get('/:id/original', async (req, res) => {
  const { id } = req.params;
  const { initData } = req.query;
  
  // Валидация доступа
  const dbUser = await getUserByTelegramId(telegramUser.id);
  const historyItem = await checkHistoryItemAccess(id, dbUser.id);
  
  if (!historyItem) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  // Читаем файл с диска
  const imageBuffer = await storageManager.getPhoto(historyItem.photoUrl);
  
  // Отдаем с правильными заголовками
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 год кэш
  res.send(imageBuffer);
});
```

---

### **Этап 8: Обновление клиента**
**Файл:** `client/src/modules/history.ts`

**Изменения:**
1. ✅ Хранить в localStorage только thumbnails (не full base64)
2. ✅ При старте приложения - показать thumbnails мгновенно
3. ✅ Параллельно загрузить полную историю с сервера
4. ✅ При клике на анализ - загрузить оригинал фото

**Код:**
```typescript
class HistoryManager {
  // Загрузка при старте приложения
  async initialize() {
    // 1. Мгновенное отображение из localStorage
    this.loadThumbnailsFromStorage();
    ui.renderHistory(this.thumbnails); // ~50ms
    
    // 2. Загрузка полной истории с сервера
    const serverHistory = await api.getHistory();
    this.updateHistory(serverHistory);
    ui.updateHistory(serverHistory); // ~300ms
  }
  
  // Сохранение только thumbnails в localStorage
  private saveThumbnailsToStorage() {
    const thumbnails = this.history.slice(0, 5).map(item => ({
      id: item.id,
      thumbnail: item.thumbnailUrl, // URL или base64 маленького превью
      analysisText: item.analysisText,
      createdAt: item.createdAt
    }));
    
    localStorage.setItem('tgstyle_thumbnails', JSON.stringify(thumbnails));
    // Размер: ~100-200 КБ (вместо 5-10 МБ)
  }
  
  // Загрузка оригинального фото при клике
  async loadFullPhoto(historyItemId: number) {
    // Проверяем кэш
    if (this.fullPhotoCache.has(historyItemId)) {
      return this.fullPhotoCache.get(historyItemId);
    }
    
    // Загружаем с сервера
    const photoUrl = `/api/photos/${historyItemId}/original`;
    const response = await fetch(photoUrl);
    const blob = await response.blob();
    const dataUrl = URL.createObjectURL(blob);
    
    // Кэшируем в памяти
    this.fullPhotoCache.set(historyItemId, dataUrl);
    
    return dataUrl;
  }
}
```

---

## 📈 Сравнение производительности

| Метрика | Текущий подход (base64 в БД) | Новый подход (файлы + Redis) | Выигрыш |
|---------|------------------------------|------------------------------|---------|
| **Размер localStorage** | 5-10 МБ | 100-200 КБ | **50x меньше** |
| **Время первой загрузки** | 500-1000ms | 50-100ms | **10x быстрее** |
| **Размер БД (1000 фото)** | 5-10 ГБ | 50-100 МБ | **100x меньше** |
| **Скорость запроса истории** | 500-800ms (PostgreSQL) | 5-10ms (Redis) | **100x быстрее** |
| **Скорость бэкапа БД** | Очень медленно | Быстро | **50x быстрее** |
| **Размер одной записи в БД** | 2-5 МБ (TEXT поле) | ~500 байт (URL) | **10000x меньше** |

---

## 🚀 Порядок внедрения

### **Фаза 1: Инфраструктура (критично)**
1. ✅ Создать модуль storage.js - хранение фото на диске
2. ✅ Создать модуль redis.js - кэширование истории
3. ✅ Обновить Prisma схему - добавить photoUrl/thumbnailUrl
4. ✅ Создать миграцию БД

### **Фаза 2: API изменения (критично)**
5. ✅ Обновить /analyze - сохранять на диск вместо base64
6. ✅ Обновить /history - использовать Redis cache
7. ✅ Создать /photos/:id - отдача фото
8. ✅ Тестирование новых API

### **Фаза 3: Миграция данных (важно)**
9. ✅ Создать скрипт миграции base64 → файлы
10. ✅ Запустить миграцию существующих данных
11. ✅ Проверить корректность миграции

### **Фаза 4: Клиент (важно)**
12. ✅ Обновить history.ts - thumbnails в localStorage
13. ✅ Обновить UI - lazy loading оригиналов
14. ✅ Тестирование клиента

### **Фаза 5: Оптимизация (опционально)**
15. ⏳ Настроить Nginx для прямой отдачи фото
16. ⏳ Добавить CDN для статики
17. ⏳ Настроить автоматическую очистку старых файлов

---

## 🛡️ Дополнительные улучшения

### **1. Nginx прямая отдача файлов**
```nginx
# Прямая отдача статики без Node.js
location /uploads/photos/ {
    alias /app/uploads/photos/;
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}
```

### **2. Автоматическая очистка старых файлов**
```javascript
// Cron job: удаление файлов удаленных анализов
async function cleanupOrphanedFiles() {
  // Найти все файлы на диске
  const diskFiles = await fs.readdir('./uploads/photos', { recursive: true });
  
  // Найти все photoUrl в БД
  const dbPhotos = await prisma.historyItem.findMany({
    select: { photoUrl: true, thumbnailUrl: true }
  });
  
  const dbUrls = new Set(dbPhotos.flatMap(p => [p.photoUrl, p.thumbnailUrl]));
  
  // Удалить файлы которых нет в БД
  for (const file of diskFiles) {
    if (!dbUrls.has(file)) {
      await fs.unlink(file);
      logger.info('Deleted orphaned file', { file });
    }
  }
}
```

### **3. WebP конвертация для thumbnails**
```javascript
// Генерация thumbnails в WebP (меньше размер)
await sharp(imageBuffer)
  .resize(100, 100, { fit: 'cover' })
  .webp({ quality: 80 })
  .toFile(thumbnailPath);

// Экономия: JPEG 10 КБ → WebP 5 КБ (2x меньше)
```

### **4. Progressive JPEG для оригиналов**
```javascript
// Прогрессивная загрузка больших фото
await sharp(imageBuffer)
  .jpeg({ 
    quality: 90, 
    progressive: true  // сначала загружается превью, потом детали
  })
  .toFile(photoPath);
```

---

## 📊 Мониторинг и метрики

### **Метрики Redis**
```javascript
// Мониторинг hit rate кэша
const cacheStats = {
  hits: await redis.get('cache:hits'),
  misses: await redis.get('cache:misses'),
  hitRate: hits / (hits + misses) * 100
};

// Цель: hit rate > 80%
```

### **Метрики хранилища**
```javascript
// Размер хранилища
const storageSize = await getDirectorySize('./uploads/photos');
const avgPhotoSize = storageSize / totalPhotos;

logger.info('Storage metrics', {
  totalSize: formatBytes(storageSize),
  totalPhotos,
  avgPhotoSize: formatBytes(avgPhotoSize)
});
```

### **Метрики производительности**
```javascript
// Время загрузки истории
const startTime = Date.now();
const history = await getHistory(userId);
const duration = Date.now() - startTime;

logger.info('History load time', {
  userId,
  duration,
  source: 'redis' | 'postgresql',
  itemCount: history.length
});
```

---

## ✅ Критерии успеха

### **Производительность:**
- ✅ Первая загрузка истории < 100ms
- ✅ Загрузка истории с сервера < 300ms
- ✅ Redis cache hit rate > 80%
- ✅ Размер localStorage < 500 КБ

### **Надежность:**
- ✅ Graceful fallback при недоступности Redis
- ✅ Миграция всех существующих фото без потерь
- ✅ Обратная совместимость со старыми клиентами
- ✅ Автоматическое восстановление при ошибках

### **Масштабируемость:**
- ✅ Поддержка 10000+ пользователей
- ✅ Размер БД < 1 ГБ при 10000 анализов
- ✅ Хранилище легко переносится в S3/облако
- ✅ Горизонтальное масштабирование Redis

---

## 🎉 Итоговые выгоды

### **Для пользователей:**
- ⚡ **Мгновенная загрузка** приложения (50-100ms)
- 🚀 **Быстрый просмотр** истории без ожидания
- 💾 **Не забивает память** устройства
- 📱 **Экономия трафика** (загружаются только thumbnails)

### **Для системы:**
- 💰 **В 100 раз меньше** размер БД
- ⚡ **В 100 раз быстрее** запросы истории
- 📦 **В 50 раз меньше** бэкапы
- 🔄 **Легко масштабируется** (можно переехать в S3)

### **Для разработки:**
- 🛠️ **Проще работать** с БД (нет огромных TEXT полей)
- 🔍 **Проще дебажить** (не копаешься в base64)
- 📊 **Лучшие метрики** и мониторинг
- 🌐 **Готовность к CDN** и облачным хранилищам

---

## 📝 Заметки и риски

### **Риски:**
1. **Синхронизация файлов и БД** - если удалить запись в БД, файл может остаться
   - *Решение:* Cron job для очистки orphaned файлов
   
2. **Бэкапы файлов** - нужно делать отдельно от БД
   - *Решение:* Автоматический backup папки `/uploads` каждую ночь
   
3. **Миграция может занять время** - много существующих записей
   - *Решение:* Batch миграция + progress bar + dry-run режим

### **Зависимости:**
- **sharp** или **jimp** - для генерации thumbnails (уже есть в npm)
- **redis** - уже настроен в docker-compose.yml
- **Node.js 18+** - для fs.readdir recursive mode

---

## 🔗 Связанные документы

- `task_plan.md` - основной план интеграции БД
- `dev_plan.md` - текущий статус проекта
- `db/prisma/schema.prisma` - схема базы данных
- `server/src/api/history.js` - API истории
- `client/src/modules/history.ts` - клиентский модуль истории

---

*Документ создан: 2025-01-15*  
*Статус: В планах, ожидает реализации*
