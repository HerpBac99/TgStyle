-- Создание таблицы wardrobe_items для хранения предметов гардероба пользователей
-- Дата создания: 2025-10-09

CREATE TABLE IF NOT EXISTS wardrobe_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    name VARCHAR(255),
    category VARCHAR(100),
    color VARCHAR(50),
    tags TEXT[],
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Внешний ключ на таблицу users
    CONSTRAINT fk_wardrobe_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_id ON wardrobe_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_category ON wardrobe_items(category);
CREATE INDEX IF NOT EXISTS idx_wardrobe_created_at ON wardrobe_items(created_at DESC);

-- Комментарии
COMMENT ON TABLE wardrobe_items IS 'Таблица для хранения предметов гардероба пользователей';
COMMENT ON COLUMN wardrobe_items.image_path IS 'Путь к файлу изображения на сервере (например: uploads/wardrobe/123/item_456.png)';
COMMENT ON COLUMN wardrobe_items.name IS 'Название предмета одежды (куртка, брюки и т.д.)';
COMMENT ON COLUMN wardrobe_items.category IS 'Категория (верхняя одежда, обувь, аксессуары и т.д.)';
COMMENT ON COLUMN wardrobe_items.color IS 'Основной цвет предмета';
COMMENT ON COLUMN wardrobe_items.tags IS 'Массив тегов для поиска и фильтрации';
