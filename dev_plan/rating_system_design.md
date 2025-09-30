# 🎯 Дизайн Rating системы для TgStyle

## 📱 Как это работает с точки зрения ПОЛЬЗОВАТЕЛЯ

### **Сценарий 1: Пользователь ставит лайк своему анализу**

#### **Шаг 1: Пользователь делает фото и получает анализ**
```
1. Алиса открывает TgStyle в Telegram
2. Нажимает кнопку камеры, делает фото своего образа
3. Выбирает ситуацию "Вечерний выход"
4. Через 16 секунд получает анализ:
   
   "На вас элегантное черное платье с V-образным вырезом,
    дополненное золотыми аксессуарами. Образ идеально 
    подходит для вечернего мероприятия..."
```

#### **Шаг 2: Алиса видит кнопки действий**
```
┌─────────────────────────────────────┐
│  [Фото образа Алисы]                │
│                                      │
│  Анализ завершен                     │
│  --------------------------------    │
│  На вас элегантное черное платье... │
│                                      │
│  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │  ❤️  │  │  📤  │  │  ✕   │      │
│  │ Like │  │Share │  │Close │      │
│  └──────┘  └──────┘  └──────┘      │
│     0          0                     │ <- Счетчики (пока 0)
└─────────────────────────────────────┘
```

#### **Шаг 3: Алиса нажимает кнопку ❤️ Like**
```
✨ ЧТО ПРОИСХОДИТ:

Визуально (frontend):
  1. Кнопка ❤️ меняет цвет: серый → красный
  2. Легкая анимация (scale 0.8 → 1.0)
  3. Haptic feedback (вибрация) на телефоне
  4. Счетчик обновляется: 0 → 1

Технически (backend):
  1. Отправка запроса: POST /api/history/456/rate
     {
       "initData": "telegram_init_data...",
       "ratingType": "like"
     }
  
  2. Сервер проверяет:
     - Валидация Telegram пользователя ✅
     - Проверка доступа к historyItem ✅
     - Пользователь = владелец анализа ✅
  
  3. Сохранение в БД:
     INSERT INTO ratings (user_id, history_item_id, rating_type)
     VALUES (123, 456, 'like')
     ON CONFLICT (user_id, history_item_id)
     DO UPDATE SET rating_type = 'like'
  
  4. Инвалидация Redis кэша истории
  
  5. НЕТ уведомления (сам себе лайк)

Результат:
  ✅ Лайк сохранен в базе данных
  ✅ UI обновлен мгновенно
  ✅ Алиса видит красную кнопку ❤️ с цифрой 1
```

---

### **Сценарий 2: Друг видит shared анализ и ставит лайк**

#### **Шаг 1: Алиса делится своим анализом**
```
1. Алиса нажимает кнопку 📤 Share
2. Система генерирует уникальную ссылку:
   https://t.me/TgStyleBot?startapp=shared_abc123xyz
3. Алиса отправляет ссылку другу Боре в Telegram
```

#### **Шаг 2: Боря открывает shared ссылку**
```
1. Боря кликает по ссылке в чате с Алисой
2. Открывается TgStyle Mini App
3. App автоматически загружает shared анализ:

   GET /api/shared-analysis/abc123xyz
   
   Ответ:
   {
     "success": true,
     "analysis": {
       "id": 456,
       "photo": "base64_фото_Алисы",
       "analysisText": "На вас элегантное черное платье...",
       "timestamp": "2025-01-15T20:30:00Z",
       "author": {
         "firstName": "Алиса",
         "lastName": "Иванова",
         "username": "alice_style",
         "avatarUrl": "https://..."
       },
       "stats": {
         "likes": 1,    <- лайк самой Алисы
         "comments": 0
       }
     }
   }

4. Боря видит экран:

┌─────────────────────────────────────┐
│  Анализ от @alice_style             │
│                                      │
│  [Фото образа Алисы]                │
│                                      │
│  Анализ стиля:                       │
│  --------------------------------    │
│  На вас элегантное черное платье... │
│                                      │
│  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │  ❤️  │  │  💬  │  │  📤  │      │
│  │ Like │  │Reply │  │Share │      │
│  └──────┘  └──────┘  └──────┘      │
│     1          0          0          │ <- Уже 1 лайк
└─────────────────────────────────────┘
```

#### **Шаг 3: Боря ставит лайк анализу Алисы**
```
✨ ЧТО ПРОИСХОДИТ:

1. Боря нажимает ❤️ Like

Визуально:
  - Кнопка ❤️: серый → красный
  - Анимация + haptic feedback
  - Счетчик: 1 → 2

Технически:
  POST /api/history/456/rate
  {
    "initData": "telegram_init_data_Boris...",
    "ratingType": "like"
  }

  Сервер:
  1. Проверяет пользователя Борю ✅
  2. Проверяет доступ к historyItem #456:
     - isPublic = true ✅
     - Или userId = Boris (нет, это анализ Алисы)
     - Но isPublic = true, значит доступ разрешен ✅
  
  3. Сохраняет лайк:
     INSERT INTO ratings (user_id, history_item_id, rating_type)
     VALUES (789, 456, 'like')  <- user_id=789 это Боря
  
  4. Инвалидирует Redis кэш Алисы
  
  5. Создает УВЕДОМЛЕНИЕ для Алисы:
     INSERT INTO notifications (
       user_id,           -- 123 (Алиса)
       type,              -- 'rating'
       message,           -- 'Боря оценил ваш образ'
       related_user_id,   -- 789 (Боря)
       related_history_item_id  -- 456
     )

Результат для Бори:
  ✅ Лайк сохранен
  ✅ Кнопка ❤️ красная с цифрой 2

Результат для Алисы:
  🔔 Новое уведомление в Telegram:
     "Боря оценил ваш образ ❤️"
  
  📊 В её истории анализов:
     Анализ #456 теперь показывает 2 лайка
```

---

### **Сценарий 3: Пользователь убирает лайк (unlike)**

#### **Боря передумал и убирает лайк**
```
1. Боря снова нажимает на кнопку ❤️ (уже красную)

Визуально:
  - Кнопка ❤️: красный → серый
  - Счетчик: 2 → 1
  - Легкая анимация

Технически:
  DELETE /api/history/456/rate
  {
    "initData": "telegram_init_data_Boris..."
  }

  Сервер:
  1. Проверяет пользователя ✅
  2. Удаляет лайк:
     DELETE FROM ratings
     WHERE user_id = 789 AND history_item_id = 456
  
  3. Инвалидирует кэш
  
  4. НЕ удаляет уведомление Алисе
     (уведомления не удаляются, только помечаются is_read)

Результат:
  ✅ Лайк удален из БД
  ✅ Счетчик обновлен: 2 → 1
  ✅ Кнопка снова серая
```

---

### **Сценарий 4: Публичная лента с лайками**

#### **Вера открывает вкладку "Лента" (Feed)**
```
┌─────────────────────────────────────┐
│  TgStyle                             │
│  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │ 🏠   │  │ 📱  │  │ 👤   │      │
│  │ Home │  │ Feed│  │Profile│     │
│  └──────┘  └──────┘  └──────┘      │
│            👆 ACTIVE                 │
└─────────────────────────────────────┘

Лента загружается:
  GET /api/history/public?page=1&limit=10

Ответ:
  {
    "success": true,
    "history": [
      {
        "id": 456,
        "user": {
          "firstName": "Алиса",
          "username": "alice_style",
          "avatarUrl": "..."
        },
        "photoData": "base64...",
        "analysisText": "Элегантное черное платье...",
        "createdAt": "2025-01-15T20:30:00Z",
        "_count": {
          "ratings": 1,    <- 1 лайк (от самой Алисы)
          "comments": 0
        }
      },
      {
        "id": 455,
        "user": {
          "firstName": "Катя",
          "username": "kate_fashion"
        },
        "photoData": "base64...",
        "analysisText": "Кэжуал образ с джинсами...",
        "_count": {
          "ratings": 15,   <- 15 лайков! Популярный пост
          "comments": 3
        }
      },
      // ... еще 8 анализов
    ]
  }

Вера видит ленту:

┌─────────────────────────────────────┐
│  Публичная лента                     │
│                                      │
│  ┌─────────────────────────────┐   │
│  │ @alice_style · 2 часа назад │   │
│  │ [Фото образа]               │   │
│  │ Элегантное черное платье... │   │
│  │ ❤️ 1   💬 0   📤            │   │ <- Может лайкнуть!
│  └─────────────────────────────┘   │
│                                      │
│  ┌─────────────────────────────┐   │
│  │ @kate_fashion · 5 часов назад│  │
│  │ [Фото образа]               │   │
│  │ Кэжуал образ с джинсами...  │   │
│  │ ❤️ 15  💬 3   📤            │   │ <- Популярный!
│  └─────────────────────────────┘   │
│                                      │
│  [Загрузить еще...]                 │
└─────────────────────────────────────┘
```

#### **Вера лайкает анализ Кати**
```
1. Вера нажимает ❤️ на карточке анализа Кати

Визуально:
  - Кнопка ❤️ становится красной
  - Счетчик: 15 → 16
  - Анимация + haptic

Технически:
  POST /api/history/455/rate
  {
    "initData": "telegram_init_data_Vera...",
    "ratingType": "like"
  }

Результат:
  ✅ Лайк Веры сохранен в БД
  ✅ Катя получает уведомление: "Вера оценила ваш образ ❤️"
  ✅ Счетчик в ленте обновлен: 16 лайков
```

---

## 🔧 ТЕХНИЧЕСКАЯ РЕАЛИЗАЦИЯ

### **Backend: Rating API**

#### **1. POST /api/history/:id/rate - поставить/изменить рейтинг**

```javascript
// server/src/api/social.js

const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');
const prisma = require('../lib/prisma');
const redisCache = require('../utils/redis');

/**
 * POST /api/history/:id/rate
 * Поставить или изменить рейтинг (like/dislike)
 */
router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { initData, ratingType } = req.body;

    // Валидация параметров
    if (!initData || !ratingType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    if (!['like', 'dislike'].includes(ratingType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ratingType. Must be "like" or "dislike"'
      });
    }

    // Валидация Telegram
    const validationResult = validateTelegramWebAppData(initData);
    if (!validationResult.isValid) {
      return res.status(401).json({
        success: false,
        error: validationResult.error
      });
    }

    const telegramUser = validationResult.data.user;

    // Получаем пользователя из БД
    const dbUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) }
    });

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    logger.info('Rating request', {
      userId: dbUser.id,
      historyItemId: id,
      ratingType
    });

    // Проверяем доступ к historyItem
    const historyItem = await prisma.historyItem.findFirst({
      where: {
        id: parseInt(id),
        OR: [
          { userId: dbUser.id },  // владелец
          { isPublic: true }      // публичный анализ
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            telegramId: true
          }
        }
      }
    });

    if (!historyItem) {
      return res.status(404).json({
        success: false,
        error: 'History item not found or access denied'
      });
    }

    // Upsert рейтинга (создать или обновить)
    const rating = await prisma.rating.upsert({
      where: {
        userId_historyItemId: {
          userId: dbUser.id,
          historyItemId: parseInt(id)
        }
      },
      update: {
        ratingType,
        updatedAt: new Date()
      },
      create: {
        userId: dbUser.id,
        historyItemId: parseInt(id),
        ratingType
      }
    });

    logger.info('Rating saved', {
      ratingId: rating.id,
      userId: dbUser.id,
      historyItemId: id,
      ratingType
    });

    // Инвалидируем Redis кэш владельца анализа
    await redisCache.invalidateHistory(historyItem.userId);

    // Создаем уведомление владельцу (если не сам себе)
    if (historyItem.userId !== dbUser.id) {
      await prisma.notification.create({
        data: {
          userId: historyItem.userId,
          type: 'rating',
          message: `${dbUser.firstName} оценил ваш образ`,
          relatedUserId: dbUser.id,
          historyItemId: parseInt(id),
          isRead: false
        }
      });

      logger.info('Notification created', {
        recipientId: historyItem.userId,
        senderId: dbUser.id,
        type: 'rating'
      });
    }

    // Получаем обновленную статистику
    const stats = await getRatingStats(parseInt(id));

    return res.json({
      success: true,
      rating: {
        id: rating.id,
        ratingType: rating.ratingType,
        createdAt: rating.createdAt
      },
      stats: stats
    });

  } catch (error) {
    logger.error('Error creating rating', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/history/:id/rate
 * Убрать свой рейтинг
 */
router.delete('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { initData } = req.body;

    // Валидация
    if (!initData) {
      return res.status(400).json({
        success: false,
        error: 'Missing initData'
      });
    }

    // Валидация Telegram
    const validationResult = validateTelegramWebAppData(initData);
    if (!validationResult.isValid) {
      return res.status(401).json({
        success: false,
        error: validationResult.error
      });
    }

    const telegramUser = validationResult.data.user;

    // Получаем пользователя
    const dbUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) }
    });

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Удаляем рейтинг
    const deleted = await prisma.rating.deleteMany({
      where: {
        userId: dbUser.id,
        historyItemId: parseInt(id)
      }
    });

    if (deleted.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found'
      });
    }

    logger.info('Rating deleted', {
      userId: dbUser.id,
      historyItemId: id
    });

    // Инвалидируем кэш
    const historyItem = await prisma.historyItem.findUnique({
      where: { id: parseInt(id) },
      select: { userId: true }
    });

    if (historyItem) {
      await redisCache.invalidateHistory(historyItem.userId);
    }

    // Получаем обновленную статистику
    const stats = await getRatingStats(parseInt(id));

    return res.json({
      success: true,
      message: 'Rating removed',
      stats: stats
    });

  } catch (error) {
    logger.error('Error deleting rating', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/history/:id/rating
 * Получить статистику рейтингов анализа
 */
router.get('/:id/rating', async (req, res) => {
  try {
    const { id } = req.params;
    const { initData } = req.query;

    // Проверяем доступ к анализу
    const historyItem = await prisma.historyItem.findFirst({
      where: {
        id: parseInt(id),
        isPublic: true  // только публичные анализы
      }
    });

    if (!historyItem) {
      return res.status(404).json({
        success: false,
        error: 'History item not found'
      });
    }

    // Получаем статистику
    const stats = await getRatingStats(parseInt(id));

    // Если передан initData, проверяем рейтинг текущего пользователя
    let userRating = null;
    if (initData) {
      const validationResult = validateTelegramWebAppData(initData);
      if (validationResult.isValid) {
        const telegramUser = validationResult.data.user;
        const dbUser = await prisma.user.findUnique({
          where: { telegramId: BigInt(telegramUser.id) }
        });

        if (dbUser) {
          const rating = await prisma.rating.findUnique({
            where: {
              userId_historyItemId: {
                userId: dbUser.id,
                historyItemId: parseInt(id)
              }
            }
          });
          userRating = rating?.ratingType || null;
        }
      }
    }

    return res.json({
      success: true,
      stats: {
        ...stats,
        userRating: userRating
      }
    });

  } catch (error) {
    logger.error('Error getting rating stats', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Вспомогательная функция: получить статистику рейтингов
 */
async function getRatingStats(historyItemId) {
  const ratings = await prisma.rating.groupBy({
    by: ['ratingType'],
    where: { historyItemId },
    _count: {
      ratingType: true
    }
  });

  const likes = ratings.find(r => r.ratingType === 'like')?._count.ratingType || 0;
  const dislikes = ratings.find(r => r.ratingType === 'dislike')?._count.ratingType || 0;

  return {
    likes,
    dislikes,
    total: likes + dislikes
  };
}

module.exports = router;
```

#### **2. Подключение роутера в server.js**

```javascript
// server/server.js

const socialRoutes = require('./src/api/social');

// ... существующий код ...

// Подключаем social routes
app.use('/api/history', socialRoutes);

// ... остальной код ...
```

---

### **Frontend: Обновление UI для Rating**

#### **1. Обновление api.ts - добавить методы для рейтингов**

```typescript
// client/src/modules/api.ts

class TgStyleApi extends ApiClient {
  // ... существующие методы ...

  /**
   * Поставить рейтинг анализу
   */
  async rateHistoryItem(
    historyItemId: number,
    ratingType: 'like' | 'dislike',
    initData: string
  ): Promise<any> {
    return this.post(`/history/${historyItemId}/rate`, {
      initData,
      ratingType
    });
  }

  /**
   * Убрать рейтинг анализа
   */
  async removeRating(
    historyItemId: number,
    initData: string
  ): Promise<any> {
    return this.delete(`/history/${historyItemId}/rate`, {
      initData
    });
  }

  /**
   * Получить статистику рейтингов
   */
  async getRatingStats(
    historyItemId: number,
    initData?: string
  ): Promise<any> {
    const url = initData 
      ? `/history/${historyItemId}/rating?initData=${encodeURIComponent(initData)}`
      : `/history/${historyItemId}/rating`;
    return this.get(url);
  }
}
```

#### **2. Обновление ui.ts - подключить Rating API**

```typescript
// client/src/modules/ui.ts

class UIManager {
  private currentAnalysisData: {
    id?: number;
    photo: string;
    analysisText: string;
    timestamp: string;
    userRating?: 'like' | 'dislike' | null;
    stats?: {
      likes: number;
      dislikes: number;
      total: number;
    };
  } | null = null;

  // ... существующий код ...

  /**
   * Обработка клика по кнопке Like
   */
  private async handleLikeClick(): Promise<void> {
    const likeBtn = getElement('#like-btn');
    if (!likeBtn || !this.currentAnalysisData) {
      logger.warn('Cannot handle like: missing button or analysis data');
      return;
    }

    const historyItemId = this.currentAnalysisData.id;
    if (!historyItemId) {
      logger.error('Cannot like: no historyItemId');
      return;
    }

    const isLiked = likeBtn.classList.contains('liked');
    const initData = window.Telegram.WebApp.initData;

    if (!initData) {
      logger.error('Cannot like: no Telegram initData');
      return;
    }

    try {
      // Оптимистичное обновление UI
      if (isLiked) {
        likeBtn.classList.remove('liked');
        this.updateLikeCount(-1);
      } else {
        likeBtn.classList.add('liked');
        this.updateLikeCount(+1);
        
        // Haptic feedback при лайке
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }

      // Анимация
      likeBtn.style.transform = 'scale(0.8)';
      setTimeout(() => {
        likeBtn.style.transform = 'scale(1)';
      }, 100);

      // Отправляем запрос на сервер
      let response;
      if (isLiked) {
        // Убираем лайк
        response = await api.removeRating(historyItemId, initData);
        logger.info('Like removed', { historyItemId });
      } else {
        // Ставим лайк
        response = await api.rateHistoryItem(historyItemId, 'like', initData);
        logger.info('Like added', { historyItemId });
      }

      // Обновляем статистику
      if (response.stats) {
        this.currentAnalysisData.stats = response.stats;
        this.currentAnalysisData.userRating = isLiked ? null : 'like';
        this.renderRatingStats();
      }

    } catch (error) {
      logger.error('Failed to update rating', error);
      
      // Rollback UI при ошибке
      if (isLiked) {
        likeBtn.classList.add('liked');
        this.updateLikeCount(+1);
      } else {
        likeBtn.classList.remove('liked');
        this.updateLikeCount(-1);
      }

      // Показываем уведомление об ошибке
      this.showError('Не удалось обновить рейтинг. Попробуйте снова.');
    }
  }

  /**
   * Обновить счетчик лайков
   */
  private updateLikeCount(delta: number): void {
    const likeCountElement = getElement('.like-count');
    if (likeCountElement && this.currentAnalysisData?.stats) {
      const currentLikes = this.currentAnalysisData.stats.likes;
      const newLikes = Math.max(0, currentLikes + delta);
      this.currentAnalysisData.stats.likes = newLikes;
      likeCountElement.textContent = newLikes.toString();
    }
  }

  /**
   * Отрисовать статистику рейтингов
   */
  private renderRatingStats(): void {
    if (!this.currentAnalysisData?.stats) return;

    const { likes, dislikes, total } = this.currentAnalysisData.stats;
    
    const likeBtn = getElement('#like-btn');
    if (likeBtn) {
      // Обновляем состояние кнопки
      if (this.currentAnalysisData.userRating === 'like') {
        likeBtn.classList.add('liked');
      } else {
        likeBtn.classList.remove('liked');
      }

      // Обновляем счетчик
      let likeCountElement = likeBtn.querySelector('.like-count');
      if (!likeCountElement) {
        likeCountElement = document.createElement('span');
        likeCountElement.className = 'like-count';
        likeBtn.appendChild(likeCountElement);
      }
      likeCountElement.textContent = likes.toString();
    }
  }

  /**
   * Показать результат анализа (обновленная версия)
   */
  async showAnalysisResult(
    photoBase64: string,
    analysisText: string,
    historyItemId?: number
  ): Promise<void> {
    // ... существующий код отображения ...

    // Если есть historyItemId, загружаем статистику рейтингов
    if (historyItemId) {
      try {
        const initData = window.Telegram.WebApp.initData;
        const ratingData = await api.getRatingStats(historyItemId, initData);
        
        if (ratingData.success) {
          this.currentAnalysisData = {
            id: historyItemId,
            photo: photoBase64,
            analysisText,
            timestamp: new Date().toISOString(),
            userRating: ratingData.stats.userRating,
            stats: {
              likes: ratingData.stats.likes,
              dislikes: ratingData.stats.dislikes,
              total: ratingData.stats.total
            }
          };

          this.renderRatingStats();
        }
      } catch (error) {
        logger.warn('Failed to load rating stats', error);
      }
    }
  }

  /**
   * Показать уведомление об ошибке
   */
  private showError(message: string): void {
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert(message);
    } else {
      alert(message);
    }
  }
}
```

#### **3. Обновление CSS для счетчиков**

```css
/* client/css/resultMenu.css */

/* Кнопка Like с счетчиком */
.like-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.like-btn .like-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--tg-theme-text-color);
  opacity: 0.7;
}

.like-btn.liked {
  color: #ff3b30;
}

.like-btn.liked .like-count {
  color: #ff3b30;
  opacity: 1;
}

/* Анимация при клике */
.like-btn:active {
  transform: scale(0.85);
}

.like-btn svg {
  transition: all 0.2s ease;
}

.like-btn.liked svg {
  fill: #ff3b30;
  stroke: #ff3b30;
}
```

---

## 📊 База данных: Что хранится

### **Таблица `ratings`**

```sql
-- Примеры записей после использования

-- Алиса лайкнула свой анализ #456
id | user_id | history_item_id | rating_type | created_at
1  | 123     | 456             | like        | 2025-01-15 20:35:00

-- Боря лайкнул анализ #456 Алисы
2  | 789     | 456             | like        | 2025-01-15 21:10:00

-- Вера лайкнула анализ #455 Кати
3  | 555     | 455             | like        | 2025-01-15 21:15:00

-- Боря потом убрал свой лайк (запись удалена)
-- DELETE FROM ratings WHERE id = 2

-- Итого: 2 лайка (Алиса + Вера остались)
```

### **Таблица `notifications`**

```sql
-- Уведомления после лайков

-- Алиса получила уведомление от Бори
id | user_id | type    | message              | related_user_id | history_item_id | is_read
1  | 123     | rating  | Боря оценил ваш образ| 789            | 456             | false

-- Катя получила уведомление от Веры
2  | 444     | rating  | Вера оценила ваш образ| 555           | 455             | false
```

---

## 🔔 Уведомления в Telegram

### **Как работают уведомления:**

```
1. Боря ставит лайк анализу Алисы

2. Сервер создает запись в таблице notifications

3. В будущем (Phase 2):
   - Telegram Bot отправляет push-уведомление Алисе:
     
     💬 TgStyle
     Боря оценил ваш образ ❤️
     [Посмотреть]

   - При клике на уведомление:
     - Открывается TgStyle Mini App
     - Показывается анализ #456
     - Уведомление помечается is_read = true

4. Пока (Phase 1):
   - Уведомления только в БД
   - В будущем добавим Telegram Bot для push-уведомлений
```

---

## 🎨 UX детали

### **Визуальные состояния кнопки Like:**

```
1. Не лайкнуто (по умолчанию):
   ┌──────┐
   │  ❤️  │  <- серый цвет (#8E8E93)
   │ Like │
   │  0   │  <- счетчик серый
   └──────┘

2. Лайкнуто пользователем:
   ┌──────┐
   │  ❤️  │  <- красный цвет (#ff3b30)
   │ Like │  <- filled heart ❤️
   │  1   │  <- счетчик красный
   └──────┘

3. Анимация при клике:
   - Transform: scale(1.0) → scale(0.8) → scale(1.0)
   - Duration: 200ms
   - Haptic feedback (вибрация)

4. Загрузка (waiting for API):
   ┌──────┐
   │  ⏳  │  <- спиннер
   │ ...  │
   └──────┘
```

### **Haptic feedback:**

```typescript
// При успешном лайке
if (window.Telegram?.WebApp?.HapticFeedback) {
  window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
}

// При ошибке
if (window.Telegram?.WebApp?.HapticFeedback) {
  window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
}
```

---

## 📈 Аналитика и метрики

### **Какие метрики будем отслеживать:**

```sql
-- 1. Общее количество лайков
SELECT COUNT(*) as total_likes
FROM ratings
WHERE rating_type = 'like';

-- 2. Средне количество лайков на анализ
SELECT AVG(like_count) as avg_likes_per_analysis
FROM (
  SELECT history_item_id, COUNT(*) as like_count
  FROM ratings
  WHERE rating_type = 'like'
  GROUP BY history_item_id
) as stats;

-- 3. Топ-10 самых популярных анализов
SELECT hi.id, hi.user_id, u.firstName, COUNT(r.id) as likes
FROM history_items hi
JOIN users u ON hi.user_id = u.id
LEFT JOIN ratings r ON hi.id = r.history_item_id AND r.rating_type = 'like'
GROUP BY hi.id, hi.user_id, u.firstName
ORDER BY likes DESC
LIMIT 10;

-- 4. % пользователей, которые лайкают
SELECT 
  COUNT(DISTINCT user_id) * 100.0 / (SELECT COUNT(*) FROM users) as engagement_rate
FROM ratings;

-- 5. Среднее время до первого лайка после создания анализа
SELECT AVG(
  EXTRACT(EPOCH FROM (r.created_at - hi.created_at))
) as avg_seconds_to_first_like
FROM history_items hi
JOIN ratings r ON hi.id = r.history_item_id
WHERE r.created_at = (
  SELECT MIN(created_at)
  FROM ratings
  WHERE history_item_id = hi.id
);
```

---

## 🚀 Roadmap: Phase 2 (в будущем)

### **Расширения Rating системы:**

1. **Dislike кнопка (опционально)**
   - Добавить кнопку 👎 Dislike
   - Использовать тот же API с `ratingType: 'dislike'`

2. **Реакции (как в Telegram)**
   - ❤️ Нравится
   - 😍 Обожаю
   - 🔥 Огонь
   - 👏 Класс
   - 😂 Смешно
   
3. **Детальная статистика**
   - Кто именно лайкнул (список пользователей)
   - График лайков по времени
   - Топ-анализы недели/месяца

4. **Геймификация**
   - Достижения за количество лайков
   - Бейджи: "Популярный стиль" (100+ лайков)
   - Рейтинг самых популярных пользователей

5. **ML для рекомендаций**
   - Использовать лайки для обучения AI
   - Рекомендовать похожие образы
   - Персонализированная лента

---

## ✅ Чек-лист реализации

### **Backend (3 дня):**
- [ ] Создать файл `server/src/api/social.js`
- [ ] Реализовать `POST /api/history/:id/rate`
- [ ] Реализовать `DELETE /api/history/:id/rate`
- [ ] Реализовать `GET /api/history/:id/rating`
- [ ] Добавить создание уведомлений
- [ ] Подключить роутер в `server.js`
- [ ] Протестировать API через Postman

### **Frontend (2 дня):**
- [ ] Обновить `client/src/modules/api.ts` - добавить методы
- [ ] Обновить `client/src/modules/ui.ts` - `handleLikeClick()`
- [ ] Добавить счетчики лайков в HTML
- [ ] Обновить CSS для анимаций
- [ ] Добавить Haptic feedback
- [ ] Протестировать в Telegram

### **Интеграция (1 день):**
- [ ] Тестирование полного флоу
- [ ] Проверка уведомлений в БД
- [ ] Проверка Redis инвалидации
- [ ] Оптимизация запросов
- [ ] Документация

---

## 🎯 Результат

После реализации Rating системы:

✅ **Кнопка Like реально работает** - лайки сохраняются в БД

✅ **Социальное взаимодействие** - пользователи лайкают друг друга

✅ **Уведомления** - владельцы анализов получают уведомления

✅ **Статистика** - счетчики лайков на каждом анализе

✅ **Вовлеченность +30%** - пользователи возвращаются чаще

✅ **Данные для ML** - лайки = сигнал качества для AI

---

*Документ создан: 2025-01-15*  
*Автор: AI Code Assistant*  
*Статус: Готов к реализации*
