-- Обновление таблицы wardrobe_items: замена user_id на telegram_id
-- Дата создания: 2025-10-09

-- Удаляем старый внешний ключ
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_wardrobe_user;

-- Удаляем старый индекс
DROP INDEX IF EXISTS idx_wardrobe_user_id;

-- Добавляем новую колонку telegram_id
ALTER TABLE wardrobe_items ADD COLUMN telegram_id BIGINT;

-- Заполняем telegram_id из существующих записей (если есть)
UPDATE wardrobe_items 
SET telegram_id = users.telegram_id 
FROM users 
WHERE wardrobe_items.user_id = users.id;

-- Удаляем старую колонку user_id
ALTER TABLE wardrobe_items DROP COLUMN IF EXISTS user_id;

-- Делаем telegram_id обязательным
ALTER TABLE wardrobe_items ALTER COLUMN telegram_id SET NOT NULL;

-- Создаем новый внешний ключ
ALTER TABLE wardrobe_items
ADD CONSTRAINT fk_wardrobe_user
FOREIGN KEY (telegram_id)
REFERENCES users(telegram_id)
ON DELETE CASCADE;

-- Создаем новый индекс
CREATE INDEX idx_wardrobe_telegram_id ON wardrobe_items(telegram_id);

-- Комментарии
COMMENT ON COLUMN wardrobe_items.telegram_id IS 'Telegram ID пользователя для прямой связи';
