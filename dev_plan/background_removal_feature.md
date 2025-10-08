# План разработки функции "Удаление фона" для TgStyle

## 📋 Обзор

**Цель**: Реализовать функцию автоматического удаления фона с изображений одежды с последующей возможностью редактирования (перемещение, масштабирование, поворот) в интерактивном редакторе на базе HTML5 Canvas.

**Вдохновение**: PicsArt Background Remover

**Применение**: Пользователи смогут загружать фото одежды, автоматически удалять фон и добавлять предметы в свой виртуальный гардероб.

---

## 🎯 Ключевые компоненты

### 1. **AI модель для удаления фона**
- **Технология**: U²-Net (U Square Net) или RMBG
- **Реализация**: Python сервис на базе FastVLM сервера
- **Библиотеки**: 
  - `rembg` (ready-to-use solution)
  - `onnxruntime` для оптимизации
  - `pillow` для обработки изображений

### 2. **Canvas Editor (Интерактивный редактор)**
- **Технология**: HTML5 Canvas API + TypeScript
- **Фреймворк**: Fabric.js или Konva.js для управления объектами на canvas
- **Возможности**:
  - Перемещение изображения (drag & drop)
  - Масштабирование (pinch-to-zoom, wheel)
  - Поворот (rotation controls)
  - Ограничивающая рамка с контролами

### 3. **UI/UX интеграция**
- **Расположение**: Раздел "Гардероб" в TgStyle
- **Workflow**: Фото → Удаление фона → Редактор → Сохранение в гардероб

---

## 📐 Архитектура решения

```
┌─────────────────────────────────────────────────────────────┐
│                     TgStyle Client                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Camera Module (camera.ts)                            │  │
│  │  • Захват фото                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Canvas Editor Module (NEW: canvasEditor.ts)          │  │
│  │  • HTML5 Canvas                                       │  │
│  │  • Fabric.js/Konva.js                                 │  │
│  │  • Transform controls (move, scale, rotate)           │  │
│  │  • Export to base64                                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Wardrobe Module (wardrobe.ts)                        │  │
│  │  • Сохранение элементов гардероба                     │  │
│  │  • Управление коллекциями                             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│                   TgStyle Server (Node.js)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Endpoint: POST /api/remove-background            │  │
│  │  • Валидация изображения                              │  │
│  │  • Проверка лимитов пользователя                      │  │
│  │  • Пересылка на FastVLM сервер                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│               FastVLM Server (Python)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Background Removal Module (NEW)                      │  │
│  │  • Модель: U²-Net / RMBG                              │  │
│  │  • Библиотека: rembg                                  │  │
│  │  • Обработка: PIL → rembg → PNG с прозрачностью       │  │
│  │  • Возврат: base64 PNG                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Этапы разработки

### **Этап 1: FastVLM Server - Модуль удаления фона**

#### 1.1 Установка зависимостей
```bash
cd fastvlm-server
pip install rembg[gpu]  # С GPU поддержкой
# или
pip install rembg  # CPU версия
pip install onnxruntime-gpu  # Для ускорения
```

#### 1.2 Создание модуля `background_removal.py`
```python
from rembg import remove
from PIL import Image
import io
import base64

class BackgroundRemovalService:
    """Сервис для удаления фона с изображений"""

    def __init__(self, model_name='u2net'):
        """
        model_name: 'u2net', 'u2netp', 'u2net_human_seg', 'silueta'
        """
        self.model_name = model_name

    def remove_background(self, image_base64: str) -> str:
        """
        Удаляет фон с изображения
        
        Args:
            image_base64: Base64 строка изображения
            
        Returns:
            Base64 строка PNG изображения с прозрачным фоном
        """
        try:
            # Декодируем base64
            image_data = base64.b64decode(image_base64)
            input_image = Image.open(io.BytesIO(image_data))
            
            # Удаляем фон
            output_image = remove(
                input_image,
                model_name=self.model_name,
                alpha_matting=True,  # Улучшает качество краев
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=10
            )
            
            # Конвертируем в base64
            buffered = io.BytesIO()
            output_image.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            
            return img_str
            
        except Exception as e:
            logger.error(f"Ошибка удаления фона: {e}")
            raise
```

#### 1.3 Добавление API эндпоинта в `server.py`
```python
from background_removal import BackgroundRemovalService

# Инициализация сервиса
bg_removal_service = BackgroundRemovalService(model_name='u2net')

@app.route('/remove-background', methods=['POST'])
def remove_background():
    """API для удаления фона"""
    try:
        data = request.get_json()
        image_base64 = data.get('image_base64')
        
        if not image_base64:
            return jsonify({'error': 'Изображение не предоставлено'}), 400
        
        # Удаляем фон
        result_base64 = bg_removal_service.remove_background(image_base64)
        
        return jsonify({
            'success': True,
            'image_base64': result_base64,
            'format': 'PNG'
        })
        
    except Exception as e:
        logger.error(f"Ошибка обработки: {e}")
        return jsonify({'error': str(e)}), 500
```

**Оценка времени**: 2-3 часа  
**Приоритет**: Высокий  
**Зависимости**: Нет

---

### **Этап 2: Node.js Server - API для удаления фона**

#### 2.1 Создание API эндпоинта `src/api/backgroundRemoval.js`
```javascript
const axios = require('axios');
const { logger } = require('../controllers/logsController');
const { validateTelegramWebAppData } = require('../utils/telegram');

const FASTVLM_URL = process.env.FASTVLM_URL || 'http://127.0.0.1:3001';

/**
 * POST /api/remove-background
 * Удаляет фон с изображения через FastVLM сервер
 */
async function removeBackground(req, res) {
    try {
        const { initData, image } = req.body;

        // Валидация Telegram данных
        const telegramData = validateTelegramWebAppData(initData);
        if (!telegramData.valid) {
            return res.status(401).json({ error: 'Неверные данные авторизации' });
        }

        // Валидация изображения
        if (!image || !image.startsWith('data:image')) {
            return res.status(400).json({ error: 'Неверный формат изображения' });
        }

        // Извлекаем base64 (убираем data:image/jpeg;base64,)
        const base64Data = image.split(',')[1];

        // Отправляем на FastVLM сервер
        const response = await axios.post(
            `${FASTVLM_URL}/remove-background`,
            { image_base64: base64Data },
            { timeout: 30000 }
        );

        if (!response.data.success) {
            throw new Error('Ошибка удаления фона на сервере');
        }

        // Возвращаем результат
        res.json({
            success: true,
            image: `data:image/png;base64,${response.data.image_base64}`,
            format: 'PNG'
        });

    } catch (error) {
        logger.error('Ошибка удаления фона:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
}

module.exports = { removeBackground };
```

#### 2.2 Регистрация маршрута в `server.js`
```javascript
const { removeBackground } = require('./src/api/backgroundRemoval');

app.post('/api/remove-background', removeBackground);
```

**Оценка времени**: 1-2 часа  
**Приоритет**: Высокий  
**Зависимости**: Этап 1

---

### **Этап 3: Client - Canvas Editor Module**

#### 3.1 Установка Fabric.js
```bash
npm install fabric
npm install @types/fabric --save-dev
```

#### 3.2 Создание модуля `client/src/modules/canvasEditor.ts`
```typescript
import { fabric } from 'fabric';

interface CanvasEditorOptions {
    canvasId: string;
    width: number;
    height: number;
}

export class CanvasEditor {
    private canvas: fabric.Canvas;
    private currentImage: fabric.Image | null = null;

    constructor(options: CanvasEditorOptions) {
        // Инициализация canvas
        this.canvas = new fabric.Canvas(options.canvasId, {
            width: options.width,
            height: options.height,
            backgroundColor: '#f0f0f0'
        });

        this.setupCanvas();
    }

    /**
     * Настройка canvas
     */
    private setupCanvas(): void {
        // Запрещаем выделение множественных объектов
        this.canvas.selection = false;

        // Ограничиваем движение объектов границами canvas
        this.canvas.on('object:moving', (e) => {
            const obj = e.target;
            if (!obj) return;

            // Ограничения по границам
            obj.setCoords();
            const bound = obj.getBoundingRect();

            if (bound.left < 0) {
                obj.set('left', 0);
            }
            if (bound.top < 0) {
                obj.set('top', 0);
            }
            if (bound.left + bound.width > this.canvas.width!) {
                obj.set('left', this.canvas.width! - bound.width);
            }
            if (bound.top + bound.height > this.canvas.height!) {
                obj.set('top', this.canvas.height! - bound.height);
            }
        });
    }

    /**
     * Загрузка изображения с вырезанным фоном
     */
    async loadImage(imageUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fabric.Image.fromURL(imageUrl, (img) => {
                if (!img) {
                    reject(new Error('Ошибка загрузки изображения'));
                    return;
                }

                // Удаляем предыдущее изображение
                if (this.currentImage) {
                    this.canvas.remove(this.currentImage);
                }

                // Масштабируем под размер canvas
                const scale = Math.min(
                    this.canvas.width! / img.width!,
                    this.canvas.height! / img.height!
                ) * 0.8; // 80% от размера canvas

                img.scale(scale);

                // Центрируем изображение
                img.set({
                    left: (this.canvas.width! - img.getScaledWidth()) / 2,
                    top: (this.canvas.height! - img.getScaledHeight()) / 2,
                    selectable: true,
                    hasControls: true,  // Показываем контролы
                    hasBorders: true,   // Показываем границы
                    lockScalingFlip: true,  // Запрещаем отражение
                    centeredScaling: true   // Масштабирование от центра
                });

                this.currentImage = img;
                this.canvas.add(img);
                this.canvas.setActiveObject(img);
                this.canvas.renderAll();

                resolve();
            }, { crossOrigin: 'anonymous' });
        });
    }

    /**
     * Экспорт canvas в base64
     */
    exportToBase64(format: string = 'png'): string {
        return this.canvas.toDataURL({
            format: format,
            quality: 1.0
        });
    }

    /**
     * Сброс трансформаций
     */
    resetTransform(): void {
        if (!this.currentImage) return;

        this.currentImage.set({
            scaleX: 1,
            scaleY: 1,
            angle: 0,
            left: (this.canvas.width! - this.currentImage.width!) / 2,
            top: (this.canvas.height! - this.currentImage.height!) / 2
        });

        this.canvas.renderAll();
    }

    /**
     * Очистка canvas
     */
    clear(): void {
        this.canvas.clear();
        this.currentImage = null;
    }

    /**
     * Уничтожение canvas
     */
    destroy(): void {
        this.canvas.dispose();
    }
}
```

#### 3.3 Создание модуля `client/src/modules/backgroundRemoval.ts`
```typescript
import { apiClient } from './api';

export interface BackgroundRemovalResult {
    success: boolean;
    image: string;  // data:image/png;base64,...
    format: string;
}

export class BackgroundRemovalManager {
    /**
     * Удаляет фон с изображения
     */
    async removeBackground(imageBase64: string): Promise<BackgroundRemovalResult> {
        try {
            const initData = window.Telegram?.WebApp?.initData || '';

            const response = await apiClient.post('/api/remove-background', {
                initData,
                image: imageBase64
            });

            if (!response.success) {
                throw new Error('Ошибка удаления фона');
            }

            return response;

        } catch (error) {
            console.error('Ошибка BackgroundRemovalManager:', error);
            throw error;
        }
    }
}

// Экспорт синглтона
export const backgroundRemovalManager = new BackgroundRemovalManager();
```

**Оценка времени**: 4-5 часов  
**Приоритет**: Высокий  
**Зависимости**: Этап 2

---

### **Этап 4: UI Integration - Гардероб**

#### 4.1 Обновление `client/src/modules/uiWardrobe.ts`
```typescript
import { CanvasEditor } from './canvasEditor';
import { backgroundRemovalManager } from './backgroundRemoval';
import { cameraManager } from './camera';

export class UIWardrobe {
    private canvasEditor: CanvasEditor | null = null;
    
    /**
     * Обработчик кнопки "Добавить вещь"
     */
    async handleAddClothingItem(): Promise<void> {
        try {
            // 1. Захват фото
            const photoResult = await cameraManager.capturePhoto();
            
            // 2. Показываем экран загрузки
            this.showLoadingScreen('Удаление фона...');
            
            // 3. Удаляем фон
            const bgRemovalResult = await backgroundRemovalManager.removeBackground(
                photoResult.base64
            );
            
            // 4. Показываем редактор canvas
            this.showCanvasEditor(bgRemovalResult.image);
            
        } catch (error) {
            console.error('Ошибка добавления вещи:', error);
            this.showError('Не удалось обработать изображение');
        }
    }
    
    /**
     * Показывает canvas редактор
     */
    private showCanvasEditor(imageBase64: string): void {
        // Создаем контейнер для редактора
        const editorContainer = document.createElement('div');
        editorContainer.id = 'canvas-editor-container';
        editorContainer.innerHTML = `
            <div class="canvas-editor">
                <div class="canvas-header">
                    <button class="btn-back">← Назад</button>
                    <h3>Настройка изображения</h3>
                    <button class="btn-save">✓ Сохранить</button>
                </div>
                <div class="canvas-wrapper">
                    <canvas id="clothing-canvas"></canvas>
                </div>
                <div class="canvas-controls">
                    <button class="btn-reset">↻ Сбросить</button>
                    <span class="hint">Перемещайте, масштабируйте и поворачивайте изображение</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(editorContainer);
        
        // Инициализируем canvas
        this.canvasEditor = new CanvasEditor({
            canvasId: 'clothing-canvas',
            width: window.innerWidth - 40,
            height: window.innerHeight - 200
        });
        
        // Загружаем изображение
        this.canvasEditor.loadImage(imageBase64);
        
        // Обработчики кнопок
        this.setupCanvasControls();
    }
    
    /**
     * Настройка контролов canvas
     */
    private setupCanvasControls(): void {
        // Кнопка "Назад"
        document.querySelector('.btn-back')?.addEventListener('click', () => {
            this.closeCanvasEditor();
        });
        
        // Кнопка "Сохранить"
        document.querySelector('.btn-save')?.addEventListener('click', () => {
            this.saveClothingItem();
        });
        
        // Кнопка "Сбросить"
        document.querySelector('.btn-reset')?.addEventListener('click', () => {
            this.canvasEditor?.resetTransform();
        });
    }
    
    /**
     * Сохранение вещи в гардероб
     */
    private async saveClothingItem(): Promise<void> {
        if (!this.canvasEditor) return;
        
        try {
            // Экспортируем canvas в base64
            const finalImage = this.canvasEditor.exportToBase64('png');
            
            // Сохраняем в БД (TODO: реализовать API)
            // await wardrobeAPI.saveItem({ image: finalImage, ... });
            
            // Временно сохраняем в localStorage
            this.saveToLocalStorage(finalImage);
            
            // Закрываем редактор
            this.closeCanvasEditor();
            
            // Обновляем отображение гардероба
            this.updateWardrobeDisplay();
            
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            this.showError('Не удалось сохранить вещь');
        }
    }
    
    /**
     * Закрытие canvas редактора
     */
    private closeCanvasEditor(): void {
        if (this.canvasEditor) {
            this.canvasEditor.destroy();
            this.canvasEditor = null;
        }
        
        document.getElementById('canvas-editor-container')?.remove();
    }
}
```

#### 4.2 CSS для canvas редактора `client/css/canvasEditor.css`
```css
#canvas-editor-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #fff;
    z-index: 9999;
}

.canvas-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.canvas-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.canvas-header h3 {
    margin: 0;
    font-size: 18px;
}

.canvas-header button {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    cursor: pointer;
}

.canvas-header button:hover {
    background: rgba(255, 255, 255, 0.3);
}

.canvas-wrapper {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    background: #f5f5f5;
}

#clothing-canvas {
    border: 2px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.canvas-controls {
    padding: 16px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.btn-reset {
    background: #f44336;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
}

.canvas-controls .hint {
    font-size: 12px;
    color: #666;
    text-align: center;
}
```

**Оценка времени**: 6-8 часов  
**Приоритет**: Средний  
**Зависимости**: Этап 3

---

### **Этап 5: База данных - Модель Wardrobe**

#### 5.1 Обновление Prisma схемы `db/prisma/schema.prisma`
```prisma
model WardrobeItem {
  id               Int      @id @default(autoincrement())
  userId           Int
  user             User     @relation(fields: [userId], references: [id])
  
  // Данные вещи
  imageData        String   @db.Text  // base64 изображения без фона
  category         String   // 'верх', 'низ', 'обувь', 'аксессуары'
  subcategory      String?  // 'футболка', 'джинсы', 'кроссовки', и т.д.
  color            String?  // 'синий', 'красный', и т.д.
  brand            String?
  size             String?
  
  // Метаданные
  description      String?  @db.Text
  tags             String[] // ['casual', 'спорт', 'лето']
  isFavorite       Boolean  @default(false)
  
  // Даты
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  @@index([userId])
  @@map("wardrobe_items")
}

// Обновление модели User
model User {
  // ... существующие поля ...
  wardrobeItems    WardrobeItem[]
}
```

#### 5.2 Миграция БД
```bash
cd db
npx prisma migrate dev --name add_wardrobe_items
```

**Оценка времени**: 1-2 часа  
**Приоритет**: Средний  
**Зависимости**: Нет

---

### **Этап 6: Server - API для гардероба**

#### 6.1 Создание API эндпоинтов `server/src/api/wardrobe.js`
```javascript
const { prisma } = require('../lib/prisma');
const { validateTelegramWebAppData } = require('../utils/telegram');
const { logger } = require('../controllers/logsController');

/**
 * POST /api/wardrobe/items
 * Сохранение вещи в гардероб
 */
async function saveWardrobeItem(req, res) {
    try {
        const { initData, imageData, category, subcategory, color, tags } = req.body;

        // Валидация
        const telegramData = validateTelegramWebAppData(initData);
        if (!telegramData.valid) {
            return res.status(401).json({ error: 'Неверные данные авторизации' });
        }

        // Поиск пользователя
        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(telegramData.user.id) }
        });

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Сохранение вещи
        const wardrobeItem = await prisma.wardrobeItem.create({
            data: {
                userId: user.id,
                imageData,
                category,
                subcategory,
                color,
                tags: tags || []
            }
        });

        res.json({
            success: true,
            item: wardrobeItem
        });

    } catch (error) {
        logger.error('Ошибка сохранения вещи:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
}

/**
 * GET /api/wardrobe/items
 * Получение всех вещей пользователя
 */
async function getWardrobeItems(req, res) {
    try {
        const { initData } = req.query;

        const telegramData = validateTelegramWebAppData(initData);
        if (!telegramData.valid) {
            return res.status(401).json({ error: 'Неверные данные авторизации' });
        }

        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(telegramData.user.id) }
        });

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const items = await prisma.wardrobeItem.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            success: true,
            items
        });

    } catch (error) {
        logger.error('Ошибка получения вещей:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
}

/**
 * DELETE /api/wardrobe/items/:id
 * Удаление вещи из гардероба
 */
async function deleteWardrobeItem(req, res) {
    try {
        const { id } = req.params;
        const { initData } = req.body;

        const telegramData = validateTelegramWebAppData(initData);
        if (!telegramData.valid) {
            return res.status(401).json({ error: 'Неверные данные авторизации' });
        }

        const user = await prisma.user.findUnique({
            where: { telegramId: BigInt(telegramData.user.id) }
        });

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Проверка владения вещью
        const item = await prisma.wardrobeItem.findUnique({
            where: { id: parseInt(id) }
        });

        if (!item || item.userId !== user.id) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        await prisma.wardrobeItem.delete({
            where: { id: parseInt(id) }
        });

        res.json({ success: true });

    } catch (error) {
        logger.error('Ошибка удаления вещи:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
}

module.exports = {
    saveWardrobeItem,
    getWardrobeItems,
    deleteWardrobeItem
};
```

#### 6.2 Регистрация маршрутов в `server/server.js`
```javascript
const {
    saveWardrobeItem,
    getWardrobeItems,
    deleteWardrobeItem
} = require('./src/api/wardrobe');

app.post('/api/wardrobe/items', saveWardrobeItem);
app.get('/api/wardrobe/items', getWardrobeItems);
app.delete('/api/wardrobe/items/:id', deleteWardrobeItem);
```

**Оценка времени**: 3-4 часа  
**Приоритет**: Средний  
**Зависимости**: Этап 5

---

### **Этап 7: Тестирование и оптимизация**

#### 7.1 Тестирование FastVLM сервера
```bash
cd fastvlm-server
python test_background_removal.py
```

#### 7.2 Тестирование API через Postman
- POST /api/remove-background
- POST /api/wardrobe/items
- GET /api/wardrobe/items
- DELETE /api/wardrobe/items/:id

#### 7.3 Тестирование в Telegram WebApp
- Захват фото → Удаление фона → Canvas редактор → Сохранение

#### 7.4 Оптимизация производительности
- Кэширование результатов удаления фона
- Компрессия изображений
- Lazy loading для больших коллекций

**Оценка времени**: 4-6 часов  
**Приоритет**: Высокий  
**Зависимости**: Все предыдущие этапы

---

## 📊 Общая оценка проекта

| Этап | Время (часы) | Приоритет |
|------|--------------|-----------|
| 1. FastVLM - Background Removal | 2-3 | Высокий |
| 2. Node.js Server - API | 1-2 | Высокий |
| 3. Client - Canvas Editor | 4-5 | Высокий |
| 4. UI Integration | 6-8 | Средний |
| 5. База данных | 1-2 | Средний |
| 6. Server API Wardrobe | 3-4 | Средний |
| 7. Тестирование | 4-6 | Высокий |
| **ИТОГО** | **21-30** | - |

---

## 🎨 UI/UX Flow

```
1. Пользователь открывает "Гардероб"
   ↓
2. Нажимает "Добавить вещь"
   ↓
3. Захватывает фото через камеру
   ↓
4. Показывается экран загрузки "Удаление фона..."
   ↓
5. Открывается Canvas редактор с изображением без фона
   ↓
6. Пользователь настраивает изображение (move, scale, rotate)
   ↓
7. Нажимает "Сохранить"
   ↓
8. Вещь добавляется в гардероб
   ↓
9. Показывается обновленный гардероб с новой вещью
```

---

## 🔧 Технические детали

### **Формат изображений**
- **Входной**: JPEG/PNG (base64)
- **После удаления фона**: PNG с прозрачностью (base64)
- **Сохранение в БД**: PNG (base64)

### **Размеры**
- **Canvas**: Адаптивный (window.innerWidth - 40, window.innerHeight - 200)
- **Изображение**: Автомасштабирование до 80% от canvas

### **Модель удаления фона**
- **U²-Net**: Универсальная модель (по умолчанию)
- **u2net_human_seg**: Оптимизирована для людей
- **silueta**: Быстрая модель для силуэтов

### **Библиотеки Canvas**
- **Fabric.js**: Рекомендуется (более функциональная)
- **Konva.js**: Альтернатива (легковесная)

---

## 📝 TODO после завершения

- [ ] Добавить категоризацию вещей (верх, низ, обувь, аксессуары)
- [ ] Реализовать поиск и фильтрацию в гардеробе
- [ ] Добавить функцию "Создать образ" (комбинации вещей)
- [ ] Интеграция с AI для рекомендаций сочетаний
- [ ] Экспорт образов для социальных сетей
- [ ] Статистика использования вещей

---

## 🎯 Заключение

Этот план обеспечивает полную реализацию функции удаления фона с последующим редактированием в интерактивном canvas редакторе. Архитектура модульная и масштабируемая, позволяет легко добавлять новые функции в будущем.

**Ключевые преимущества**:
- ✅ Автоматическое удаление фона с помощью AI
- ✅ Интерактивный редактор с полным контролем
- ✅ Сохранение в персональный гардероб
- ✅ Интеграция с существующей архитектурой TgStyle
- ✅ Production-ready решение для Telegram Mini App

