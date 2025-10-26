# Событийная система интеграции с WardrobeManager

## Обзор

Модули капсул и гардероба взаимодействуют через событийную систему (`CustomEvent`) вместо прямых зависимостей. Это обеспечивает слабую связанность и упрощает тестирование.

## События от Capsules к Wardrobe

### 1. `wardrobe:render-requested`

**Назначение:** Запрос на рендеринг грида гардероба в модальном окне капсул

**Отправитель:** `CapsuleSelectionManager`

**Получатель:** `WardrobeManager`

**Данные события:**
```typescript
{
  gridId: string;           // ID контейнера грида (например, 'capsules-modal-clothes-grid')
  filtersId: string;        // ID контейнера фильтров (например, 'capsules-modal-filters')
  items: WardrobeItem[];    // Массив вещей для отображения
  mode: 'selection' | 'preview';  // Режим работы грида
}
```

**Пример использования:**
```typescript
// В CapsuleSelectionManager
window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
  detail: {
    gridId: 'capsules-modal-clothes-grid',
    filtersId: 'capsules-modal-filters',
    items: this.wardrobeItems,
    mode: 'selection'
  }
}));
```

**Обработка:**
```typescript
// В WardrobeManager
window.addEventListener('wardrobe:render-requested', ((event: CustomEvent) => {
  this.handleRenderRequest(event.detail);
}) as EventListener);
```

---

### 2. `wardrobe:photo-upload-requested`

**Назначение:** Запрос на загрузку фото через WardrobeManager

**Отправитель:** `CapsulesManager`

**Получатель:** `WardrobeManager`

**Данные события:**
```typescript
{
  source: string;                              // Источник запроса (например, 'capsules')
  onItemAdded?: (item: WardrobeItem) => void;  // Callback после добавления вещи
}
```

**Пример использования:**
```typescript
// В CapsulesManager
window.dispatchEvent(new CustomEvent('wardrobe:photo-upload-requested', {
  detail: {
    source: 'capsules',
    onItemAdded: (newItem: WardrobeItem) => {
      logger.info('Item added', { itemId: newItem.id });
    }
  }
}));
```

**Обработка:**
```typescript
// В WardrobeManager
window.addEventListener('wardrobe:photo-upload-requested', ((event: CustomEvent) => {
  const { source, onItemAdded } = event.detail;
  this.handlePhotoUpload(onItemAdded);
}) as EventListener);
```

---

## События от Wardrobe к Capsules

### 3. `wardrobe:item-selection-toggle`

**Назначение:** Уведомление о переключении выбора вещи (клик на карточку в режиме выбора)

**Отправитель:** `WardrobeManager`

**Получатель:** `CapsuleSelectionManager`

**Данные события:**
```typescript
{
  item: WardrobeItem;  // Вещь, на которую кликнули
}
```

**Пример использования:**
```typescript
// В WardrobeManager (при клике на карточку в модальном окне)
window.dispatchEvent(new CustomEvent('wardrobe:item-selection-toggle', {
  detail: { item }
}));
```

**Обработка:**
```typescript
// В CapsuleSelectionManager
window.addEventListener('wardrobe:item-selection-toggle', (event: CustomEvent) => {
  this.onItemToggle(event.detail.item);
});
```

---

### 4. `wardrobe:item-saved`

**Назначение:** Уведомление о сохранении новой вещи в гардероб

**Отправитель:** `WardrobeManager`

**Получатель:** `CapsulesManager`

**Данные события:**
```typescript
{
  item: WardrobeItem;  // Сохраненная вещь
}
```

**Пример использования:**
```typescript
// В WardrobeManager (после успешного сохранения)
window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
  detail: { item: serverItem }
}));
```

**Обработка:**
```typescript
// В CapsulesManager
window.addEventListener('wardrobe:item-saved', (event: CustomEvent) => {
  const { item } = event.detail;
  this.handleNewItemSaved(item);
});
```

---

## Преимущества событийной системы

### 1. Слабая связанность
- Модули не зависят друг от друга напрямую
- Можно легко добавлять/удалять подписчиков
- Упрощается тестирование (можно мокировать события)

### 2. Гибкость
- Один отправитель → много получателей
- Легко добавлять новые обработчики
- Не нужно изменять код отправителя

### 3. Отладка
- Все события можно логировать в одном месте
- Легко отследить поток данных
- Можно добавить middleware для обработки событий

---

## Использование общих сервисов

Вместо прямых вызовов менеджеров используются общие сервисы:

### WardrobeService

**Назначение:** Бизнес-логика и API запросы для гардероба

**Методы:**
- `loadWardrobe()` - загрузить все вещи (с кэшем)
- `addItem()` - добавить новую вещь
- `updateItem()` - обновить вещь
- `deleteItem()` - удалить вещь
- `filterByCategory()` - фильтровать по категории

**Пример использования:**
```typescript
// В CapsuleSelectionManager
import { wardrobeService } from '../wardrobe/WardrobeService';

// Загружаем вещи через сервис вместо прямого вызова WardrobeManager
this.wardrobeItems = await wardrobeService.loadWardrobe();
```

---

## Миграция с прямых вызовов на события

### До (прямая зависимость):
```typescript
// В CapsuleSelectionManager
import { wardrobeManager } from '../wardrobe/WardrobeManager';

await wardrobeManager.handleWardrobeOpen('capsules-modal');
```

### После (событие):
```typescript
// В CapsuleSelectionManager
import { wardrobeService } from '../wardrobe/WardrobeService';

this.wardrobeItems = await wardrobeService.loadWardrobe();

window.dispatchEvent(new CustomEvent('wardrobe:render-requested', {
  detail: {
    gridId: this.config.gridId,
    filtersId: this.config.filtersId,
    items: this.wardrobeItems,
    mode: 'selection'
  }
}));
```

---

## Консолидация логики рендеринга

Вся логика рендеринга грида находится в `WardrobeManager`:
- Создание фильтров
- Рендеринг карточек
- Обработка кликов
- Управление выделением

Другие модули только запрашивают рендеринг через события и получают уведомления о действиях пользователя.

---

## Чеклист для добавления нового события

1. ✅ Определить назначение события
2. ✅ Выбрать имя события (формат: `module:action-description`)
3. ✅ Определить структуру данных (`detail`)
4. ✅ Добавить отправку события в нужном месте
5. ✅ Добавить обработчик события в получателе
6. ✅ Задокументировать событие в этом файле
7. ✅ Добавить логирование для отладки

---

## Отладка событий

Для отладки можно добавить глобальный слушатель всех событий:

```typescript
// В main.ts или logger.ts
if (import.meta.env.DEV) {
  const eventNames = [
    'wardrobe:render-requested',
    'wardrobe:photo-upload-requested',
    'wardrobe:item-selection-toggle',
    'wardrobe:item-saved'
  ];

  eventNames.forEach(eventName => {
    window.addEventListener(eventName, (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log(`[EVENT] ${eventName}`, customEvent.detail);
    });
  });
}
```

---

**Последнее обновление:** 2025-10-26
**Версия:** 1.0
