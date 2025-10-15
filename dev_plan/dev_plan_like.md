# План реализации социальной системы лайков капсул

**Дата создания:** 15.01.2025  
**Статус:** В разработке  
**Приоритет:** Высокий

## Содержание

1. [Обзор](#обзор)
2. [Текущее состояние](#текущее-состояние)
3. [Цели и требования](#цели-и-требования)
4. [Архитектура решения](#архитектура-решения)
5. [База данных](#база-данных)
6. [Backend API](#backend-api)
7. [Frontend](#frontend)
8. [UX Flow](#ux-flow)
9. [Расширенная функциональность](#расширенная-функциональность)
10. [Безопасность](#безопасность)
11. [План реализации](#план-реализации)

---

## Обзор

### Проблема
При открытии приложения по ссылке на капсулу (через sharing), приложение просто запускается на главном экране без отображения расшаренной капсулы. Пользователь не может просматривать и лайкать капсулы других пользователей.

### Решение
Реализовать полноценную социальную функциональность:
- Обработка deep links для открытия капсул
- Модальное окно просмотра капсулы с возможностью лайка
- Система рейтингов капсул
- Публичная лента популярных капсул
- Статистика для автора капсулы

---

## Текущее состояние

### ✅ Уже реализовано

1. **База данных:**
   - Модель `Capsule` с полями для хранения капсул
   - Модель `Rating` для лайков (но только для HistoryItem)
   - Связь пользователь-капсула

2. **Sharing система:**
   - `CapsulesSharing.ts` - сервис для sharing капсул
   - `SharingService.ts` - универсальный сервис sharing
   - Генерация shareId и deep links
   - Сохранение в localStorage

3. **Backend API:**
   - `/api/capsules` - CRUD операции с капсулами
   - Сохранение thumbnail изображений
   - Валидация доступа к капсулам

4. **Frontend:**
   - `CapsulesManager` - управление капсулами
   - `UICanvasResultScreen` - экран результата с кнопкой share
   - Canvas редактор для создания капсул

### ❌ Требуется реализовать

1. **База данных:**
   - Новая модель CapsuleLike для лайков капсул
   - Поле shareId в Capsule для tracking расшаренных капсул
   - Счетчики лайков и просмотров

2. **Backend API:**
   - `GET /api/capsules/shared/:shareId` - получение капсулы по shareId
   - `POST /api/capsule-likes/:id` - постановка лайка
   - `DELETE /api/capsule-likes/:id` - удаление лайка
   - `GET /api/capsules/:id/stats` - статистика капсулы
   - `GET /api/capsules/feed` - публичная лента

3. **Frontend:**
   - Обработка deep links с capsule shareId в `main.ts`
   - `UISharedCapsuleModal` - модальное окно просмотра чужой капсулы
   - `CapsuleLikesService` - сервис для работы с лайками
   - UI публичной ленты капсул

---

## Цели и требования

### Функциональные требования

#### FR1: Deep Linking
- При открытии по ссылке `https://t.me/bot?startapp=capsule_xxx` открывается конкретная капсула
- Поддержка URL параметров: `start_param`, `startapp`, хеши `#capsule-xxx`
- Graceful fallback если капсула не найдена

#### FR2: Просмотр капсулы
- Модальное окно поверх главного меню
- Отображение изображения капсулы
- Информация: название, автор, дата
- Кнопка Like/Unlike
- Счетчик лайков и просмотров
- Возможность закрыть модалку

#### FR3: Система лайков
- Один пользователь = один лайк на капсулу
- Возможность удалить лайк
- Счетчик лайков на капсуле
- История лайков (кто лайкнул)

#### FR4: Приватность
- Возможность сделать капсулу публичной (isPublic)
- Только публичные капсулы доступны по shareId
- Автор всегда видит статистику своих капсул

### Нефункциональные требования

- **Performance:** Загрузка капсулы < 2 сек, лайк < 500 мс
- **Security:** Валидация initData, защита от спама
- **UX:** Плавные анимации, loading состояния, понятные ошибки

---

## Архитектура решения

### Схема потока данных

```
User clicks share link
         ↓
Telegram opens bot with start_param=capsule_xxx
         ↓
App initializes → main.ts
         ↓
handleSharedCapsule(shareId)
         ↓
API: GET /api/capsules/shared/:shareId
         ↓
UISharedCapsuleModal.show(capsuleData)
         ↓
User clicks Like
         ↓
API: POST /api/capsule-likes/:capsuleId
         ↓
Update UI with new like count
```

### Модульная структура

```
client/
├── src/
│   ├── main.ts                          # + handleSharedCapsule()
│   ├── modules/
│   │   ├── capsules/
│   │   │   ├── CapsuleLikesService.ts   # NEW: сервис лайков
│   │   │   └── CapsulesViewService.ts   # NEW: просмотр чужих капсул
│   │   └── ui/
│   │       └── UISharedCapsuleModal.ts  # NEW: модалка просмотра
│   └── types/
│       └── capsules.ts                   # + SharedCapsule types

server/
├── src/
│   ├── api/
│   │   ├── capsules.js                   # + new endpoints
│   │   └── capsuleLikes.js               # NEW: API для лайков
│   └── utils/
│       └── rateLimit.js                  # NEW: защита от спама

db/
└── prisma/
    └── schema.prisma                     # + новые модели
```

---

## База данных

### Изменения в schema.prisma

#### 1. Расширение модели Capsule

```prisma
model Capsule {
  id          Int      @id @default(autoincrement())
  telegramId  BigInt   @map("telegram_id")
  user        User     @relation(fields: [telegramId], references: [telegramId], onDelete: Cascade)

  name        String?  @db.VarChar(255)
  description String?  @db.VarChar(500)

  canvasData  Json
  thumbnailPath String? @map("thumbnail_path")

  analysis    String?  @db.Text
  analysisDate DateTime? @map("analysis_date")

  isPublic    Boolean  @default(false) @map("is_public")
  
  // NEW: Для sharing и социальных функций
  shareId     String?  @unique @map("share_id") @db.VarChar(100)
  viewsCount  Int      @default(0) @map("views_count")
  likesCount  Int      @default(0) @map("likes_count")

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at")

  items       WardrobeItem[]
  likes       CapsuleLike[]  # NEW

  @@index([shareId])
  @@index([likesCount(sort: Desc)])
  @@map("capsules")
}
```

#### 2. Новая модель CapsuleLike

```prisma
model CapsuleLike {
  id         Int      @id @default(autoincrement())
  userId     Int
  capsuleId  Int      @map("capsule_id")
  
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  capsule    Capsule  @relation(fields: [capsuleId], references: [id], onDelete: Cascade)
  
  createdAt  DateTime @default(now()) @map("created_at")

  @@unique([userId, capsuleId])
  @@index([capsuleId])
  @@map("capsule_likes")
}
```

#### 3. Расширение модели User

```prisma
model User {
  // ... existing fields
  
  capsuleLikes         CapsuleLike[]  # NEW

  @@map("users")
}
```

### Миграция

```bash
npx prisma migrate dev --name add_capsule_social_features
```

---

## Backend API

### 1. Новый файл: `server/src/api/capsuleLikes.js`

**Endpoints:**

#### POST /api/capsule-likes/:capsuleId
Поставить лайк капсуле

**Request:**
```json
{
  "initData": "telegram_init_data"
}
```

**Response:**
```json
{
  "success": true,
  "isLiked": true,
  "likesCount": 5
}
```

**Логика:**
1. Валидация initData
2. Проверка существования капсулы
3. Проверка доступа (публичная или своя)
4. Проверка не лайкнул ли уже
5. Создание лайка в транзакции
6. Увеличение счетчика likesCount

#### DELETE /api/capsule-likes/:capsuleId
Удалить лайк

**Query params:**
- `initData` - Telegram auth data

**Response:**
```json
{
  "success": true,
  "isLiked": false,
  "likesCount": 4
}
```

#### GET /api/capsule-likes/:capsuleId/status
Проверить статус лайка для текущего пользователя

**Response:**
```json
{
  "success": true,
  "isLiked": true
}
```

### 2. Обновление `server/src/api/capsules.js`

#### GET /api/capsules/shared/:shareId
Получить капсулу по shareId (для просмотра по ссылке)

**Response:**
```json
{
  "success": true,
  "capsule": {
    "id": 1,
    "name": "Летний образ",
    "thumbnailUrl": "/uploads/capsules/...",
    "canvasData": {...},
    "likesCount": 5,
    "viewsCount": 23,
    "createdAt": "2025-01-15T...",
    "author": {
      "firstName": "Иван",
      "username": "ivan"
    }
  }
}
```

**Логика:**
1. Поиск капсулы по shareId
2. Проверка isPublic (только публичные доступны)
3. Увеличение viewsCount
4. Возврат данных с автором

#### GET /api/capsules/:id/stats
Получить статистику капсулы (только для автора)

**Query params:**
- `initData` - Telegram auth data

**Response:**
```json
{
  "success": true,
  "stats": {
    "likesCount": 24,
    "viewsCount": 156,
    "recentLikes": [
      {
        "userName": "Иван",
        "username": "ivan",
        "likedAt": "2025-01-15T..."
      }
    ]
  }
}
```

#### GET /api/capsules/feed
Публичная лента популярных капсул

**Query params:**
- `page` - номер страницы (default: 1)
- `limit` - количество (default: 20)
- `sort` - сортировка: 'popular' | 'recent' (default: 'popular')

**Response:**
```json
{
  "success": true,
  "capsules": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

#### Обновить createCapsule
Добавить генерацию shareId при создании:

```javascript
const shareId = `capsule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
```

### 3. Новый файл: `server/src/utils/rateLimit.js`

Rate limiting для защиты от спама лайками:

```javascript
const rateLimit = require('express-rate-limit');

const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,  // 1 минута
  max: 30,              // макс 30 лайков
  message: {
    success: false,
    error: 'Too many requests'
  }
});
```

### 4. Регистрация в `server/server.js`

```javascript
const capsuleLikesRouter = require('./src/api/capsuleLikes');
app.use('/api/capsule-likes', capsuleLikesRouter);
```

---

## Frontend

### 1. Новые типы: `client/src/types/capsules.ts`

```typescript
export interface SharedCapsule {
  id: number;
  shareId: string;
  name: string | null;
  thumbnailUrl: string | null;
  canvasData: any;
  likesCount: number;
  viewsCount: number;
  createdAt: string;
  author: {
    firstName: string;
    username: string | null;
  };
}

export interface CapsuleLikeStatus {
  isLiked: boolean;
  likesCount: number;
}
```

### 2. Сервис лайков: `client/src/modules/capsules/CapsuleLikesService.ts`

```typescript
export class CapsuleLikesService {
  async likeCapsule(capsuleId: number): Promise<CapsuleLikeStatus> {
    const initData = (window as any).Telegram?.WebApp?.initData || '';
    const response = await api.post(`/capsule-likes/${capsuleId}`, { initData });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    return {
      isLiked: true,
      likesCount: response.likesCount
    };
  }

  async unlikeCapsule(capsuleId: number): Promise<CapsuleLikeStatus> {
    const initData = (window as any).Telegram?.WebApp?.initData || '';
    const response = await api.delete(`/capsule-likes/${capsuleId}?initData=${encodeURIComponent(initData)}`);
    
    return {
      isLiked: false,
      likesCount: response.likesCount
    };
  }

  async toggleLike(capsuleId: number, isLiked: boolean): Promise<CapsuleLikeStatus> {
    return isLiked ? this.unlikeCapsule(capsuleId) : this.likeCapsule(capsuleId);
  }
}

export const capsuleLikesService = new CapsuleLikesService();
```

### 3. Сервис просмотра: `client/src/modules/capsules/CapsulesViewService.ts`

```typescript
export class CapsulesViewService {
  async loadSharedCapsule(shareId: string): Promise<SharedCapsule> {
    const response = await api.get(`/capsules/shared/${shareId}`);
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    return response.capsule;
  }

  async getCapsuleStats(capsuleId: number): Promise<any> {
    const initData = (window as any).Telegram?.WebApp?.initData || '';
    const response = await api.get(`/capsules/${capsuleId}/stats?initData=${encodeURIComponent(initData)}`);
    
    return response.stats;
  }
}

export const capsulesViewService = new CapsulesViewService();
```

### 4. UI модалка: `client/src/modules/ui/UISharedCapsuleModal.ts`

```typescript
export class UISharedCapsuleModal {
  private currentCapsule: SharedCapsule | null = null;
  private isLiked: boolean = false;
  private likesCount: number = 0;

  async show(capsule: SharedCapsule): Promise<void> {
    this.currentCapsule = capsule;
    this.likesCount = capsule.likesCount;
    this.isLiked = await capsuleLikesService.getLikeStatus(capsule.id);

    const modalHTML = this.createModalHTML(capsule);
    uiModalManager.showCustomModal({
      type: 'shared-capsule',
      content: modalHTML,
      onClose: () => this.handleClose()
    });

    this.attachEventListeners();
  }

  private createModalHTML(capsule: SharedCapsule): string {
    return `
      <div class="shared-capsule-modal">
        <div class="shared-capsule-header">
          <h2>${capsule.name || 'Капсула гардероба'}</h2>
          <button class="modal-close-btn" id="shared-capsule-close">✕</button>
        </div>

        <div class="shared-capsule-content">
          <img src="${capsule.thumbnailUrl}" class="shared-capsule-image" />
        </div>

        <div class="shared-capsule-info">
          <div class="capsule-author">
            <span>${capsule.author.username ? '@' + capsule.author.username : capsule.author.firstName}</span>
          </div>
          <div class="capsule-stats">
            <span>❤️ <span id="capsule-likes-count">${this.likesCount}</span></span>
            <span>👁️ ${capsule.viewsCount}</span>
          </div>
        </div>

        <div class="shared-capsule-actions">
          <button class="capsule-like-btn ${this.isLiked ? 'liked' : ''}" id="shared-capsule-like-btn">
            ${this.isLiked ? '❤️ Нравится' : '🤍 Мне нравится'}
          </button>
        </div>
      </div>
    `;
  }

  private async handleLikeClick(): Promise<void> {
    const result = await capsuleLikesService.toggleLike(this.currentCapsule!.id, this.isLiked);
    
    this.isLiked = result.isLiked;
    this.likesCount = result.likesCount;
    
    this.updateUI();
  }
}
```

### 5. Обновление `client/src/main.ts`

```typescript
private handleSharedContent(): void {
  const hash = window.location.hash;
  const tgStartParam = this.tg?.initDataUnsafe?.start_param;

  // Обработка shared анализов (existing)
  if (hash.startsWith('#shared-analysis-')) {
    this.showSharedAnalysis(...);
    return;
  }

  // NEW: Обработка shared капсул
  if (hash.startsWith('#capsule-')) {
    const shareId = hash.replace('#capsule-', '');
    this.showSharedCapsule(shareId);
    return;
  }

  // Проверка Telegram start_param
  if (tgStartParam && tgStartParam.startsWith('capsule_')) {
    window.location.hash = tgStartParam.replace('capsule_', 'capsule-');
    this.showSharedCapsule(tgStartParam);
    return;
  }
}

private async showSharedCapsule(shareId: string): Promise<void> {
  try {
    const { capsulesViewService } = await import('./modules/capsules/CapsulesViewService.js');
    const { uiSharedCapsuleModal } = await import('./modules/ui/UISharedCapsuleModal.js');

    const capsule = await capsulesViewService.loadSharedCapsule(shareId);
    await uiSharedCapsuleModal.show(capsule);
  } catch (error) {
    logger.error('Failed to show shared capsule', error);
    alert('Не удалось загрузить капсулу');
    window.location.hash = '';
  }
}
```

### 6. CSS: `client/css/shared-capsule-modal.css`

```css
.shared-capsule-modal {
  background: white;
  border-radius: 16px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow: hidden;
}

.shared-capsule-content {
  display: flex;
  align-items: center;
  justify-center;
  background: #f5f5f5;
}

.shared-capsule-image {
  max-width: 100%;
  object-fit: contain;
}

.capsule-like-btn {
  width: 100%;
  padding: 14px;
  border: 2px solid #81D8D0;
  background: white;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.capsule-like-btn.liked {
  background: #81D8D0;
  color: white;
}

@keyframes heartBeat {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.3); }
}

.capsule-like-btn.liked-animation {
  animation: heartBeat 0.6s;
}
```

---

## UX Flow

### Сценарий: Пользователь открывает ссылку на капсулу

```
1. User clicks: https://t.me/bot?startapp=capsule_xxx
2. Telegram opens app with start_param
3. main.ts → handleSharedContent()
4. API: GET /api/capsules/shared/capsule_xxx
5. UISharedCapsuleModal.show(capsule)
6. User clicks Like button
7. API: POST /api/capsule-likes/:id
8. UI updates with animation
```

---

## Расширенная функциональность

### Фаза 2: Дополнительные фичи

#### 1. Публичная лента капсул
- Grid популярных капсул
- Сортировка: по популярности / по новизне
- Infinite scroll
- API: `GET /api/capsules/feed`

#### 2. Комментарии к капсулам
- Модель `CapsuleComment`
- API для CRUD комментариев
- UI треда комментариев в модалке

#### 3. Избранное
- Модель `CapsuleFavorite`
- Сохранение понравившихся капсул
- Раздел "Избранное" в профиле

#### 4. Подписки на авторов
- Модель `UserFollow`
- Лента капсул от подписок
- Уведомления о новых капсулах

#### 5. Рекомендации
- Алгоритм рекомендаций на основе:
  - Лайкнутых капсул
  - Своего гардероба
  - Популярности
- ML модель (опционально)

#### 6. Достижения
- Геймификация: badges за активность
- "Первый лайк", "100 лайков", "Популярная капсула"

---

## Безопасность

### 1. Валидация Telegram данных
Все API endpoints проверяют `validateTelegramWebAppData(initData)`

### 2. Rate Limiting
- Лайки: макс 30/минуту
- Просмотры: макс 100/минуту

### 3. Права доступа

| Действие | Публичная | Приватная |
|----------|-----------|-----------|
| Просмотр по shareId | ✅ Все | ❌ Только автор |
| Лайк | ✅ Авторизованные | ❌ |
| Статистика | ❌ Только автор | ✅ Только автор |

### 4. SQL Injection
Prisma ORM автоматически защищает через parameterized queries

### 5. XSS
Санитизация пользовательского контента (имена, описания)

---

## План реализации

### 🎯 Этап 1: База данных и Backend (3-4 дня)

**Задачи:**
1. Обновить schema.prisma (CapsuleLike, новые поля в Capsule)
2. Создать миграцию
3. Реализовать `capsuleLikes.js` API
4. Обновить `capsules.js` (shared, stats, feed endpoints)
5. Реализовать rate limiting
6. Тестирование API

**Результат:** Полностью рабочий backend

---

### 🎯 Этап 2: Frontend сервисы (2-3 дня)

**Задачи:**
1. Создать типы (`capsules.ts`)
2. Реализовать `CapsuleLikesService.ts`
3. Реализовать `CapsulesViewService.ts`
4. Unit тесты

**Результат:** Готовые сервисы для лайков

---

### 🎯 Этап 3: UI модалка (2-3 дня)

**Задачи:**
1. Создать `UISharedCapsuleModal.ts`
2. Создать CSS стили
3. Анимации лайков
4. Интеграция с uiModalManager

**Результат:** Рабочее модальное окно

---

### 🎯 Этап 4: Deep Linking (2 дня)

**Задачи:**
1. Обновить `main.ts` (handleSharedContent)
2. Обновить `CapsulesSharing.ts`
3. Тестирование deep links

**Результат:** Полностью рабочий deep linking

---

### 🎯 Этап 5: Улучшения (2-3 дня)

**Задачи:**
1. Добавить кнопку "Статистика"
2. Улучшить анимации
3. Оптимизация изображений
4. Error handling

**Результат:** Полированный UX

---

### 🎯 Этап 6: Публичная лента (опционально, 3-4 дня)

**Задачи:**
1. Создать `UICapsulessFeed.ts`
2. Grid layout
3. Infinite scroll
4. Фильтры

**Результат:** Публичная лента капсул

---

### Общая оценка

- **MVP (Этапы 1-4):** 9-12 дней
- **С улучшениями (Этапы 1-5):** 11-15 дней
- **Full feature (Этапы 1-6):** 16-22 дня

---

## Метрики успеха

### Технические
- Загрузка капсулы < 2 сек
- Постановка лайка < 500 мс
- Code coverage > 80%
- 0 critical bugs

### Продуктовые
- Conversion (просмотр → лайк): > 15%
- Shared капсул: +50% за месяц
- Лайков: +100% за месяц
- Retention Day 7: > 20%

---

## Риски и митигации

### Риск 1: Спам лайками
**Митигация:** Rate limiting, мониторинг

### Риск 2: Большие изображения
**Митигация:** Оптимизация, CDN, лимиты

### Риск 3: Performance при росте
**Митигация:** Индексы БД, pagination, caching

### Риск 4: Privacy
**Митигация:** Явное согласие на публикацию, GDPR

---

## Следующие шаги

1. Обсуждение плана
2. Приоритизация фичей
3. Создание задач в трекере
4. Начало разработки с Этапа 1

---

**Версия:** 1.0  
**Автор:** AI Assistant  
**Дата:** 15.01.2025
