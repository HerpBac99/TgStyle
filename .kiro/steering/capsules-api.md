# API и интеграции модуля Capsules

## Обзор

Модуль Capsules интегрируется с различными API и сервисами для обеспечения полной функциональности создания и редактирования образов.

## Серверные API

### 1. Capsules API

**Базовый путь**: `/api/capsules`

#### GET /api/capsules
Получение списка капсул пользователя

```typescript
// Запрос
const response = await api.get('/api/capsules');

// Ответ
interface CapsuleListResponse {
  capsules: StyleCapsule[];
  total: number;
}

interface StyleCapsule {
  id: number;
  name: string;
  thumbnailUrl: string;
  itemIds: number[];
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  isLiked: boolean;
  metadata?: CapsuleMetadata;
}
```

#### POST /api/capsules
Создание новой капсулы

```typescript
// Запрос
interface CreateCapsuleRequest {
  name: string;
  canvasData: any;                    // JSON состояние Fabric.js
  thumbnailImage: string;             // Base64 изображение
  itemIds: number[];                  // ID вещей из гардероба
  metadata?: CapsuleMetadata;         // Дополнительные данные
}

const response = await api.post('/api/capsules', {
  name: 'Летний образ',
  canvasData: canvas.toJSON(),
  thumbnailImage: 'data:image/png;base64,...',
  itemIds: [1, 2, 3],
  metadata: { isGenerated: true }
});

// Ответ
interface CreateCapsuleResponse {
  id: number;
  name: string;
  thumbnailUrl: string;
  // ... остальные поля StyleCapsule
}
```

#### PUT /api/capsules/:id
Обновление существующей капсулы

```typescript
// Запрос
interface UpdateCapsuleRequest {
  name?: string;
  canvasData?: any;
  thumbnailImage?: string;
  itemIds?: number[];
  metadata?: CapsuleMetadata;
}

const response = await api.put(`/api/capsules/${capsuleId}`, {
  canvasData: canvas.toJSON(),
  thumbnailImage: newThumbnail,
  itemIds: [1, 2, 4] // Обновленный список вещей
});
```

#### GET /api/capsules/:id
Получение данных конкретной капсулы

```typescript
// Ответ
interface CapsuleDetailsResponse {
  id: number;
  name: string;
  canvasData: any;                    // Полные данные canvas
  thumbnailUrl: string;
  itemIds: number[];
  items: WardrobeItem[];              // Полные данные вещей
  createdAt: string;
  updatedAt: string;
  metadata?: CapsuleMetadata;
}
```

#### DELETE /api/capsules/:id
Удаление капсулы

```typescript
const response = await api.delete(`/api/capsules/${capsuleId}`);
// Ответ: { success: true }
```

### 2. Background Removal API

**Путь**: `/api/background-removal`

```typescript
// Запрос
interface BackgroundRemovalRequest {
  image_base64: string;               // Base64 изображение
  format?: 'png' | 'jpeg';           // Формат результата
}

const response = await api.post('/api/background-removal', {
  image_base64: canvasImageBase64,
  format: 'png'
});

// Ответ
interface BackgroundRemovalResponse {
  processed_image: string;            // Base64 с удаленным фоном
  original_size: { width: number; height: number; };
  processed_size: { width: number; height: number; };
  processing_time: number;            // Время обработки в мс
}
```

### 3. Wardrobe Integration API

**Интеграция с гардеробом для получения вещей**

```typescript
// Получение вещей для выбора
const wardrobeItems = await wardrobeService.loadItems();

// Получение конкретных вещей по ID
const items = await wardrobeService.getItemsByIds([1, 2, 3]);

// Добавление новой вещи из капсул
const newItem = await wardrobeService.addItem(imageBase64, classification);
```

## Клиентские сервисы

### 1. CapsulesService

**Файл**: `client/src/modules/capsules/CapsulesService.ts`

```typescript
export const capsulesService = {
  // Загрузка списка капсул
  async loadCapsules(): Promise<StyleCapsule[]> {
    const response = await api.get('/api/capsules');
    return response.capsules;
  },

  // Создание новой капсулы
  async createCapsule(data: CreateCapsuleRequest): Promise<StyleCapsule> {
    return await api.post('/api/capsules', data);
  },

  // Обновление капсулы
  async updateCapsule(id: number, data: UpdateCapsuleRequest): Promise<StyleCapsule> {
    return await api.put(`/api/capsules/${id}`, data);
  },

  // Загрузка данных капсулы для редактирования
  async loadCapsule(id: number): Promise<CapsuleDetailsResponse> {
    return await api.get(`/api/capsules/${id}`);
  },

  // Удаление капсулы
  async deleteCapsule(id: number): Promise<void> {
    await api.delete(`/api/capsules/${id}`);
  },

  // Сортировка вещей по слоям для canvas
  sortItemsByLayer(items: WardrobeItem[]): WardrobeItem[] {
    const layerOrder = {
      'OUTERWEAR': 4,    // Верхняя одежда - сверху
      'INNERWEAR': 3,    // Нижнее белье
      'LEGWEAR': 2,      // Брюки/юбки
      'FOOTWEAR': 1,     // Обувь - снизу
      'ACCESSORIES': 5   // Аксессуары - поверх всего
    };

    return items.sort((a, b) => {
      const layerA = layerOrder[a.category] || 0;
      const layerB = layerOrder[b.category] || 0;
      return layerA - layerB;
    });
  }
};
```

### 2. ImageProcessingService

**Файл**: `client/src/modules/shared/ImageProcessingService.ts`

```typescript
export const imageProcessingService = {
  // Удаление фона через API
  async removeBackground(imageBase64: string): Promise<string> {
    const response = await api.post('/api/background-removal', {
      image_base64: imageBase64,
      format: 'png'
    });
    return response.processed_image;
  },

  // Добавление watermark
  async addWatermark(imageBase64: string): Promise<string> {
    // Использует canvas для наложения watermark
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Логика добавления watermark...
    
    return canvas.toDataURL('image/png');
  },

  // Оптимизация изображения
  optimizeImage(imageBase64: string, maxWidth: number = 1200): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Логика оптимизации размера и качества...
    
    return canvas.toDataURL('image/jpeg', 0.8);
  },

  // Кэширование обработанных изображений
  private imageCache = new Map<string, string>(),

  cacheImage(key: string, imageBase64: string): void {
    this.imageCache.set(key, imageBase64);
  },

  getCachedImage(key: string): string | null {
    return this.imageCache.get(key) || null;
  }
};
```

## Интеграция с FastVLM

### Background Removal

**Endpoint**: `http://127.0.0.1:3001/background-removal`

```typescript
// Серверная интеграция (server/src/api/backgroundRemoval.js)
const response = await fetch('http://127.0.0.1:3001/background-removal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_base64: imageBase64,
    format: 'png'
  })
});

const result = await response.json();
// {
//   processed_image: "data:image/png;base64,...",
//   processing_time: 1500
// }
```

### Clothing Classification

**Endpoint**: `http://127.0.0.1:3001/classify-clothing`

```typescript
// Используется при добавлении новых вещей в гардероб из капсул
const response = await fetch('http://127.0.0.1:3001/classify-clothing', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_base64: imageBase64,
    prompt: "Classify this clothing item"
  })
});

const classification = await response.json();
// {
//   category: "INNERWEAR",
//   color: "белый",
//   material: "хлопок",
//   confidence: 0.95
// }
```

## Кэширование и оптимизация

### 1. Трехуровневое кэширование

```typescript
// 1. Память (DataCacheManager)
dataCacheManager.setCapsules(capsules);
const cached = dataCacheManager.getCapsules();

// 2. localStorage (первые 30 элементов)
localStorage.setItem('capsules_cache', JSON.stringify({
  data: capsules.slice(0, 30),
  timestamp: Date.now()
}));

// 3. Браузерный кэш (изображения)
// Автоматически кэшируются браузером по HTTP заголовкам
```

### 2. Оптимизация изображений

```typescript
// Разные размеры для разных целей
const optimizationSettings = {
  thumbnail: { width: 400, height: 400, quality: 0.7 },
  preview: { width: 800, height: 800, quality: 0.8 },
  fullsize: { width: 1200, height: 1200, quality: 0.9 }
};

// Генерация thumbnail для списка
const thumbnail = imageProcessingService.optimizeImage(
  originalImage, 
  optimizationSettings.thumbnail.width
);
```

### 3. Предзагрузка данных

```typescript
// Предзагрузка при открытии капсул
async function preloadCapsuleData(): Promise<void> {
  // Загружаем список капсул
  const capsules = await capsulesService.loadCapsules();
  
  // Предзагружаем изображения в фоне
  const imageUrls = capsules.map(c => c.thumbnailUrl);
  await Promise.all(imageUrls.map(url => preloadImage(url)));
  
  // Кэшируем данные
  dataCacheManager.setCapsules(capsules);
}
```

## Обработка ошибок API

### 1. Сетевые ошибки

```typescript
// Повторные попытки для сетевых ошибок
async function apiCallWithRetry<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (attempt === maxRetries || !isNetworkError(error)) {
        throw error;
      }
      
      // Экспоненциальная задержка
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### 2. API ошибки

```typescript
// Обработка специфичных ошибок API
const handleApiError = (error: any, operation: string) => {
  switch (error.status) {
    case 400:
      return `Некорректные данные для ${operation}`;
    case 401:
      return 'Необходима авторизация';
    case 403:
      return 'Недостаточно прав доступа';
    case 404:
      return 'Капсула не найдена';
    case 413:
      return 'Изображение слишком большое';
    case 429:
      return 'Слишком много запросов, попробуйте позже';
    case 500:
      return 'Ошибка сервера, попробуйте позже';
    default:
      return `Ошибка при ${operation}`;
  }
};
```

### 3. Fallback стратегии

```typescript
// Использование кэша при ошибках сети
async function loadCapsulesWithFallback(): Promise<StyleCapsule[]> {
  try {
    // Пытаемся загрузить с сервера
    const capsules = await capsulesService.loadCapsules();
    
    // Сохраняем в кэш
    dataCacheManager.setCapsules(capsules);
    
    return capsules;
  } catch (error) {
    logger.warn('Failed to load capsules from server, using cache', { error });
    
    // Используем кэш как fallback
    const cached = dataCacheManager.getCapsules();
    if (cached && cached.length > 0) {
      return cached;
    }
    
    // Если кэша нет, возвращаем пустой массив
    return [];
  }
}
```

## Мониторинг и аналитика

### 1. Метрики производительности

```typescript
// Измерение времени операций
const performanceMonitor = {
  async measureOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      logger.info(`Operation completed: ${operationName}`, {
        duration: `${duration.toFixed(2)}ms`
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      logger.error(`Operation failed: ${operationName}`, {
        duration: `${duration.toFixed(2)}ms`,
        error
      });
      
      throw error;
    }
  }
};

// Использование
const capsules = await performanceMonitor.measureOperation(
  () => capsulesService.loadCapsules(),
  'Load capsules'
);
```

### 2. Аналитика использования

```typescript
// Отправка событий аналитики
const analytics = {
  trackCapsuleCreated(capsuleId: number, itemsCount: number): void {
    logger.info('Capsule created', {
      capsuleId,
      itemsCount,
      timestamp: Date.now()
    });
  },

  trackCapsuleEdited(capsuleId: number, changes: string[]): void {
    logger.info('Capsule edited', {
      capsuleId,
      changes,
      timestamp: Date.now()
    });
  },

  trackPerformance(operation: string, duration: number): void {
    logger.info('Performance metric', {
      operation,
      duration,
      timestamp: Date.now()
    });
  }
};
```