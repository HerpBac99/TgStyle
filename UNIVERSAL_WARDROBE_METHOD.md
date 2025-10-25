# Универсальный метод handleWardrobeOpen

## Проблема
Дублирование логики работы с гардеробом между основной закладкой и модальными окнами капсул.

## Решение
Сделать метод `handleWardrobeOpen()` универсальным с параметром `prefix`.

### Изменения в WardrobeManager

```typescript
// БЫЛО:
async handleWardrobeOpen(): Promise<void> {
  // Жестко привязано к wardrobe-clothes-grid, wardrobe-filters, add-item-btn
}

// СТАЛО:
async handleWardrobeOpen(prefix: string = 'wardrobe'): Promise<void> {
  const gridId = `${prefix}-clothes-grid`;
  const filtersId = `${prefix}-filters`;
  const addBtnId = `${prefix}-add-item-btn`;
  
  // Вся логика работает с динамическими ID
}
```

### Использование

**Для основного гардероба:**
```typescript
await wardrobeManager.handleWardrobeOpen(); // prefix = 'wardrobe' по умолчанию
// Использует: wardrobe-clothes-grid, wardrobe-filters, wardrobe-add-item-btn
```

**Для модального окна капсул:**
```typescript
await wardrobeManager.handleWardrobeOpen('capsules');
// Использует: capsules-clothes-grid, capsules-filters, capsules-add-item-btn
```

### Изменения в HTML

Добавлена кнопка добавления в модальное окно капсул:
```html
<div class="wardrobe-clothes-grid" id="capsules-clothes-grid">
    <div class="add-item-btn" id="capsules-add-item-btn">
        <!-- Кнопка добавления -->
    </div>
</div>
```

Переименован ID контейнера:
- БЫЛО: `id="capsules-grid"`
- СТАЛО: `id="capsules-clothes-grid"`

### Изменения в CapsulesManager

Обновлены все ссылки на старый ID:
- `renderGridInContainer({ containerId: 'capsules-grid' })` → `'capsules-clothes-grid'`
- `document.getElementById('capsules-grid')` → `'capsules-clothes-grid'`
- `querySelector('#capsules-grid [data-item-id]')` → `'#capsules-clothes-grid'`

### Результат
- ✅ Единая логика для всех мест где используется гардероб
- ✅ Нет дублирования кода
- ✅ Все обработчики событий работают одинаково
- ✅ Одинаковое кэширование и оптимистичные обновления
- ✅ Легко добавить новые места использования гардероба

## Файлы изменены
- `client/src/modules/wardrobe/WardrobeManager.ts` - универсальный метод с префиксом
- `client/src/modules/capsules/CapsulesManager.ts` - вызов с префиксом 'capsules'
- `client/index.html` - добавлена кнопка и переименован контейнер