# Параметры rembg для управления краями

## Текущие настройки (для четких краев)

```python
result = remove(
    image, 
    session=self.rembg_session,
    alpha_matting=True,  # Включаем alpha matting
    alpha_matting_foreground_threshold=240,  # Высокий порог
    alpha_matting_background_threshold=10,   # Низкий порог
    alpha_matting_erode_size=5,  # Размер эрозии
    post_process_mask=False  # Отключаем постобработку
)
```

## Описание параметров

### alpha_matting (bool)
- **True**: Включает улучшенную обработку краев
- **False**: Базовая обработка (быстрее, но края хуже)
- **Рекомендация**: True для одежды

### alpha_matting_foreground_threshold (int, 0-255)
- Порог для определения переднего плана
- **Выше значение** = более четкие края, но может обрезать детали
- **Ниже значение** = мягче края, но больше деталей
- **Диапазон**: 200-250
- **Текущее**: 240 (четкие края)

### alpha_matting_background_threshold (int, 0-255)
- Порог для определения фона
- **Выше значение** = больше фона удаляется
- **Ниже значение** = меньше фона удаляется
- **Диапазон**: 5-20
- **Текущее**: 10 (агрессивное удаление фона)

### alpha_matting_erode_size (int)
- Размер эрозии маски (уменьшает размытие)
- **Меньше значение** = более четкие края
- **Больше значение** = более мягкие края
- **Диапазон**: 3-15
- **Текущее**: 5 (баланс между четкостью и качеством)

### post_process_mask (bool)
- **True**: Применяет дополнительное размытие (GaussianBlur)
- **False**: Оставляет края как есть
- **Текущее**: False (без размытия)

## Примеры настроек

### Максимально четкие края (может обрезать детали)
```python
alpha_matting=True,
alpha_matting_foreground_threshold=250,
alpha_matting_background_threshold=5,
alpha_matting_erode_size=3,
post_process_mask=False
```

### Баланс (текущие настройки)
```python
alpha_matting=True,
alpha_matting_foreground_threshold=240,
alpha_matting_background_threshold=10,
alpha_matting_erode_size=5,
post_process_mask=False
```

### Мягкие края (для сложных объектов)
```python
alpha_matting=True,
alpha_matting_foreground_threshold=220,
alpha_matting_background_threshold=15,
alpha_matting_erode_size=10,
post_process_mask=True
```

## Как настроить

Измените параметры в `background_removal.py`, метод `_rembg_remove()`:

```python
result = remove(
    image, 
    session=self.rembg_session,
    alpha_matting=True,
    alpha_matting_foreground_threshold=240,  # ← Измените здесь
    alpha_matting_background_threshold=10,   # ← Измените здесь
    alpha_matting_erode_size=5,              # ← Измените здесь
    post_process_mask=False
)
```

## Проблемы и решения

### Проблема: Края слишком размытые
**Решение**: 
- Увеличить `alpha_matting_foreground_threshold` до 250
- Уменьшить `alpha_matting_erode_size` до 3
- Убедиться что `post_process_mask=False`

### Проблема: Обрезаются детали объекта
**Решение**:
- Уменьшить `alpha_matting_foreground_threshold` до 220
- Увеличить `alpha_matting_erode_size` до 8

### Проблема: Остается белый контур
**Решение**:
- Уменьшить `alpha_matting_background_threshold` до 5
- Проверить что `post_process_mask=False`

### Проблема: Слишком агрессивное удаление фона
**Решение**:
- Увеличить `alpha_matting_background_threshold` до 15-20
