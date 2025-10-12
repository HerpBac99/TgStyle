# 🗄️ Анализ архитектуры хранилища файлов

**Дата:** 2025-01-12  
**Вопрос:** Хранить ли фото анализов локально на сервере?

---

## 📊 Текущее состояние

### Что уже хранится локально:

```
server/uploads/
├── wardrobe/
│   └── {telegramId}/
│       └── item_{telegramId}_{timestamp}.png
│
└── capsules/
    └── {telegramId}/
        └── capsule_{telegramId}_{timestamp}.png
```

### Что НЕ хранится (анализы):
- ❓ Фото анализов сейчас в base64 в БД? Или где?
- ❓ История анализов - как хранится?

---

## ✅ ПРЕИМУЩЕСТВА локального хранения файлов

### 1. **Performance** 🚀
- ✅ Быстрая загрузка (прямой доступ к файлу)
- ✅ Не нагружаем БД большими BLOB'ами
- ✅ Можно использовать CDN/nginx для статики
- ✅ Кэширование браузером (ETag, Last-Modified)

### 2. **Scalability** 📈
- ✅ БД остается маленькой и быстрой
- ✅ Файлы можно перенести на S3/CloudFlare R2
- ✅ Легко добавить резервное хранилище
- ✅ Можно шардить по пользователям

### 3. **Cost** 💰
- ✅ Дешевле хранить на диске чем в БД
- ✅ Легко масштабировать хранилище
- ✅ Можно использовать дешевый object storage

### 4. **Maintainability** 🔧
- ✅ Легко удалить старые файлы (cron job)
- ✅ Можно сжать/оптимизировать пакетно
- ✅ Простой backup (rsync, rclone)
- ✅ Можно вручную посмотреть файлы

### 5. **Flexibility** 🎯
- ✅ Легко менять формат (webp, avif)
- ✅ Можно генерировать thumbnails
- ✅ Легко мигрировать на другое хранилище
- ✅ Можно добавить обработку (watermark, resize)

---

## ⚠️ ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ

### 1. **Disk Space** 💾

**Проблема:**
```
50 пользователей × 50 анализов × 500KB фото = 1.25GB
1000 пользователей × 50 анализов × 500KB = 25GB
10000 пользователей × 50 анализов × 500KB = 250GB
```

**Решения:**
- ✅ Сжатие JPEG (quality 0.8 вместо 0.95) - экономия 40%
- ✅ WebP формат - экономия 30-50%
- ✅ Автоудаление старых (>90 дней) - лимит 50 на юзера
- ✅ Лимит размера файла (max 500KB)
- ✅ Если >1TB - мигрировать на S3 (~$0.023/GB/месяц)

**Расчет стоимости:**
- 250GB на диске VPS = $0 (входит в тариф обычно)
- 250GB на S3 = $5.75/месяц
- 1TB на S3 = $23/месяц

---

### 2. **Backup** 💼

**Проблема:**
- База данных легко бэкапить (dump)
- Файлы нужно отдельно бэкапить

**Решения:**
- ✅ Автоматический rsync на backup сервер
- ✅ rclone на облачное хранилище
- ✅ GitHub LFS для dev версии
- ✅ Можно хранить только БД в backup, файлы опционально

**Пример cron:**
```bash
# Ежедневный backup файлов
0 2 * * * rclone sync /server/uploads remote:tgstyle-backups/uploads
```

---

### 3. **Migration** 🚚

**Проблема:**
- При переносе сервера нужно переносить файлы

**Решения:**
- ✅ rsync при миграции сервера
- ✅ Двухэтапная миграция (сначала файлы, потом БД)
- ✅ Использовать object storage (S3) - миграция не нужна
- ✅ Ссылки в БД относительные - легко поменять домен

---

### 4. **File Permissions** 🔒

**Проблема:**
- Права доступа к файлам
- Nginx должен читать
- Node.js должен писать

**Решения:**
- ✅ Правильные права: `chown node:node uploads/`
- ✅ Права на файлы: `644` (read для всех, write для owner)
- ✅ Права на папки: `755` (execute для доступа)
- ✅ Nginx настроен на `/uploads` location

---

### 5. **File Cleanup** 🧹

**Проблема:**
- Старые файлы занимают место
- Нужна автоматическая очистка

**Решения:**
- ✅ Cron job для очистки старых файлов
- ✅ При удалении пользователя - удалить его папку
- ✅ При превышении лимита - удалить самые старые
- ✅ Логировать очистку

**Пример cron:**
```bash
# Очистка файлов старше 90 дней
0 3 * * 0 find /server/uploads/analysis -type f -mtime +90 -delete
```

---

## 🎯 РЕКОМЕНДОВАННАЯ АРХИТЕКТУРА

### Структура файлов:

```
server/uploads/
├── wardrobe/           # ✅ Уже есть
│   └── {telegramId}/
│       └── item_*.png
│
├── capsules/           # ✅ Уже есть
│   └── {telegramId}/
│       └── capsule_*.png
│
└── analysis/           # ⭐ ДОБАВИТЬ
    └── {telegramId}/
        └── analysis_{timestamp}.jpg
```

### Структура БД:

```sql
-- Таблица Analysis (уже есть?)
CREATE TABLE analysis (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  image_path VARCHAR(255) NOT NULL,  -- ⭐ Путь к файлу
  analysis_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_analysis_telegram_id ON analysis(telegram_id);
CREATE INDEX idx_analysis_created_at ON analysis(created_at);
```

---

## 📝 РЕАЛИЗАЦИЯ

### Шаг 1: Создать папку для анализов

```javascript
// server/src/utils/fileStorage.js (НОВЫЙ)

const fs = require('fs').promises;
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const ANALYSIS_DIR = path.join(UPLOADS_DIR, 'analysis');

/**
 * Сохранить фото анализа
 */
async function saveAnalysisImage(telegramId, imageBase64) {
  // Создаем папку пользователя
  const userDir = path.join(ANALYSIS_DIR, telegramId.toString());
  await fs.mkdir(userDir, { recursive: true });
  
  // Парсим base64
  const matches = imageBase64.match(/^data:image\/([a-z]+);base64,(.+)$/);
  const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const data = matches[2];
  const buffer = Buffer.from(data, 'base64');
  
  // Генерируем имя файла
  const timestamp = Date.now();
  const filename = `analysis_${timestamp}.${extension}`;
  const filePath = path.join(userDir, filename);
  
  // Сохраняем файл
  await fs.writeFile(filePath, buffer);
  
  return filename; // Возвращаем только имя файла
}

/**
 * Получить полный путь к фото анализа
 */
function getAnalysisImageUrl(telegramId, filename) {
  return `/uploads/analysis/${telegramId}/${filename}`;
}

/**
 * Удалить старые анализы (>50 для пользователя)
 */
async function cleanupOldAnalyses(telegramId) {
  const userDir = path.join(ANALYSIS_DIR, telegramId.toString());
  
  try {
    const files = await fs.readdir(userDir);
    
    // Сортируем по времени (старые первыми)
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(userDir, file);
        const stats = await fs.stat(filePath);
        return { file, mtime: stats.mtime.getTime() };
      })
    );
    
    filesWithStats.sort((a, b) => a.mtime - b.mtime);
    
    // Удаляем если больше 50
    if (filesWithStats.length > 50) {
      const toDelete = filesWithStats.slice(0, filesWithStats.length - 50);
      
      for (const { file } of toDelete) {
        await fs.unlink(path.join(userDir, file));
      }
      
      console.log(`Cleaned up ${toDelete.length} old analysis files for user ${telegramId}`);
    }
  } catch (error) {
    console.error('Failed to cleanup old analyses', error);
  }
}

module.exports = {
  saveAnalysisImage,
  getAnalysisImageUrl,
  cleanupOldAnalyses
};
```

### Шаг 2: Обновить API анализа

```javascript
// server/src/api/analyze.js

const { saveAnalysisImage, cleanupOldAnalyses } = require('../utils/fileStorage');

async function analyzeImage(req, res) {
  // ... существующий код ...
  
  // Сохраняем фото на диск (вместо base64 в БД)
  const imagePath = await saveAnalysisImage(telegramId, optimizedImage);
  
  // Сохраняем в БД только путь к файлу
  const analysis = await prisma.analysis.create({
    data: {
      telegramId: telegramId,
      imagePath: imagePath,  // ⭐ Только путь, не base64!
      analysisText: result.analysis,
      // ... остальные поля
    }
  });
  
  // Очистка старых файлов
  await cleanupOldAnalyses(telegramId);
  
  // Возвращаем URL для фото
  res.json({
    success: true,
    analysis: {
      ...analysis,
      imageUrl: `/uploads/analysis/${telegramId}/${imagePath}`
    }
  });
}
```

### Шаг 3: Настроить nginx

```nginx
# /etc/nginx/sites-available/tgstyle

location /uploads/ {
  alias /var/www/tgstyle/server/uploads/;
  
  # Кэширование
  expires 30d;
  add_header Cache-Control "public, immutable";
  
  # CORS если нужно
  add_header Access-Control-Allow-Origin *;
  
  # Безопасность
  add_header X-Content-Type-Options nosniff;
  
  # Только GET
  limit_except GET {
    deny all;
  }
}
```

---

## ⚖️ СРАВНЕНИЕ: База данных vs Файлы

### Base64 в БД (текущий подход?)

**Плюсы:**
- ✅ Простота (все в одном месте)
- ✅ Атомарность (транзакции)
- ✅ Один backup

**Минусы:**
- ❌ Медленные запросы (большие BLOB'ы)
- ❌ Большой размер БД
- ❌ Сложно масштабировать
- ❌ Дорогой backup
- ❌ Нагрузка на БД при каждом просмотре

### Файлы на диске (предлагается)

**Плюсы:**
- ✅ Быстрая загрузка
- ✅ Маленькая БД
- ✅ Кэширование браузером
- ✅ Легко масштабировать (S3, CDN)
- ✅ Дешевле хранение

**Минусы:**
- ❌ Два места хранения (БД + файлы)
- ❌ Нужен отдельный backup
- ❌ Права доступа

---

## 🎯 ФИНАЛЬНАЯ РЕКОМЕНДАЦИЯ

### ✅ ОДНОЗНАЧНО ДА - храни файлы локально!

**Причины:**
1. ✅ Консистентность (гардероб и капсулы уже так)
2. ✅ Performance (БД не для больших файлов)
3. ✅ Scalability (легко перейти на S3 потом)
4. ✅ Cost (дешевле хранение)
5. ✅ Best practices (так делают все: Instagram, Pinterest, etc)

**План действий:**
1. ✅ Создать `server/uploads/analysis/` папку
2. ✅ Создать `fileStorage.js` utility
3. ✅ Обновить `analyze.js` API
4. ✅ Добавить `imagePath` в БД (вместо base64)
5. ✅ Настроить nginx для `/uploads/`
6. ✅ Добавить cleanup cron job

**Миграция данных (если уже есть в БД):**
```javascript
// Миграция: достать base64 из БД → сохранить как файлы
async function migrateAnalysisImages() {
  const analyses = await prisma.analysis.findMany({
    where: { imagePath: null } // Старые записи
  });
  
  for (const analysis of analyses) {
    const imagePath = await saveAnalysisImage(
      analysis.telegramId,
      analysis.imageBase64 // Старое поле
    );
    
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { 
        imagePath: imagePath,
        imageBase64: null // Удаляем старое
      }
    });
  }
}
```

---

## 📊 Прогноз по размерам (1 год)

```
Сценарий: 1000 активных пользователей

Пользователи: 1000
Анализов на юзера: 50 (лимит)
Размер фото: 400KB (после оптимизации)

Гардероб: 1000 × 100 вещей × 300KB = 30GB
Капсулы: 1000 × 20 капсул × 200KB = 4GB
Анализы: 1000 × 50 анализов × 400KB = 20GB
─────────────────────────────────────────
ИТОГО: ~54GB за год

Стоимость:
- VPS 100GB SSD: уже входит в тариф ($0)
- Или S3: 54GB × $0.023 = $1.24/месяц 💰
```

**Вывод:** Даже при росте - это дешево!

---

## ✅ Итоговое решение

**Храни файлы локально как для гардероба и капсул!**

Начать внедрять? Или сначала доделаем Sharing сервисы?
