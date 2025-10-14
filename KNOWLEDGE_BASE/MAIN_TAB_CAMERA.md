# TgStyle Main Menu - Camera Management Documentation

## Обзор модуля camera.ts

Модуль `camera.ts` отвечает за захват фото через камеру устройства или выбор из галереи, обработку изображений, валидацию и подготовку для анализа. Он обеспечивает кроссплатформенную работу с камерой через Telegram WebApp API.

## Основные компоненты

### Класс CameraManager

Центральный класс для управления камерой и обработкой изображений.

#### Конструктор CameraManager()
```typescript
class CameraManager {
  private currentImageData: ImageData | null = null;
}
```
**Теги поиска:** `camera_manager_constructor`, `image_data_storage`, `camera_state_management`

**Что делает:**
- Инициализирует менеджер камеры
- Хранит данные текущего изображения
- Создает единственный экземпляр `cameraManager`

**Параметры:** нет

**Возвращает:** нет (конструктор)

## Захват фото

#### capturePhoto(): Promise<PhotoCaptureResult>
```typescript
async capturePhoto(): Promise<PhotoCaptureResult> {
  logger.info('Starting photo capture', { 
    hasCurrentImage: !!this.currentImageData,
    timestamp: Date.now()
  });

  try {
    const file = await this.selectFile({ preferCamera: true });
    const imageData = await this.processImageFile(file);
    
    this.currentImageData = imageData;
    
    logger.info('Photo captured successfully', {
      width: imageData.width,
      height: imageData.height,
      format: imageData.format,
      originalSize: Math.round(imageData.originalSize / 1024) + 'KB',
    });

    // Отправляем событие о захвате фото для показа экрана выбора темы
    logger.info('Photo captured, dispatching event for theme selection');
    window.dispatchEvent(new CustomEvent('photo:captured', {
      detail: { imageData }
    }));

    return {
      success: true,
      image: imageData,
    };
  } catch (error) {
    logger.error('Photo capture failed', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    };
  }
}
```
**Теги поиска:** `photo_capture_process`, `file_selection`, `image_processing`, `capture_event_dispatch`, `error_handling_capture`

**Что делает:**
- Логирует начало захвата с временной меткой
- Вызывает `selectFile()` для выбора изображения
- Обрабатывает файл через `processImageFile()`
- Сохраняет данные в `currentImageData`
- Отправляет событие `photo:captured` для UI
- Возвращает результат захвата

**Параметры:** нет

**Возвращает:** Promise<PhotoCaptureResult> - объект с успехом/ошибкой и данными изображения

**Исключения:** перехватывает все ошибки, возвращает объект с ошибкой

## Выбор файла

#### selectFile(options: Partial<CameraOptions>): Promise<File>
```typescript
private selectFile(_options: Partial<CameraOptions> = {}): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*'; // Telegram WebApp переопределит это и покажет свой диалог выбора
    input.style.display = 'none';

    // Telegram WebApp автоматически показывает модальное окно с выбором источника
    // (камера/галерея/файл) на всех платформах, включая iOS

    input.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (file) {
        resolve(file);
      } else {
        reject(new Error('Файл не выбран'));
      }

      // Очистка
      document.body.removeChild(input);
    });

    input.addEventListener('cancel', () => {
      reject(new Error('Выбор файла отменен'));
      document.body.removeChild(input);
    });

    document.body.appendChild(input);
    input.click();
  });
}
```
**Теги поиска:** `file_selection_input`, `telegram_webapp_integration`, `dynamic_input_creation`, `file_promise_resolution`, `cleanup_dom`

**Что делает:**
- Создает скрытый input[type="file"]
- Устанавливает accept="image/*" (Telegram переопределяет)
- Добавляет обработчики change и cancel
- Программно кликает по input для открытия диалога
- Очищает DOM после выбора/отмены

**Параметры:**
- `options: Partial<CameraOptions>` - опции выбора файла (не используются в текущей реализации)

**Возвращает:** Promise<File> - выбранный файл изображения

## Обработка изображения

#### processImageFile(file: File): Promise<ImageData>
```typescript
private async processImageFile(file: File): Promise<ImageData> {
  // Валидация файла
  this.validateFile(file);

  // Чтение файла как base64
  const base64 = await this.readFileAsBase64(file);
  
  // Получение размеров изображения
  const dimensions = await this.getImageDimensions(base64);
  
  // Создание объекта ImageData
  const imageData: ImageData = {
    base64: base64.split(',')[1]!, // Убираем data: prefix
    originalSize: file.size,
    width: dimensions.width,
    height: dimensions.height,
    format: this.detectImageFormat(file),
  };

  // Валидация данных изображения
  const validation = validateImageData(imageData);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }

  // Сжатие отключено для сохранения качества изображений
  logger.info('Сжатие изображений отключено для сохранения качества');

  return imageData;
}
```
**Теги поиска:** `image_processing_pipeline`, `file_validation`, `base64_conversion`, `dimensions_extraction`, `format_detection`, `data_validation`

**Что делает:**
- Валидирует файл на размер и тип
- Конвертирует файл в base64 строку
- Получает размеры изображения
- Создает объект ImageData
- Валидирует данные изображения
- Возвращает готовые данные (без сжатия)

**Параметры:**
- `file: File` - файл изображения для обработки

**Возвращает:** Promise<ImageData> - обработанные данные изображения

## Валидация файла

#### validateFile(file: File): void
```typescript
private validateFile(file: File): void {
  // Проверка типа файла
  if (!isImageFile(file)) {
    throw new Error('Выбранный файл не является изображением');
  }

  // Проверка размера файла
  const maxSizeBytes = IMAGE_CONSTRAINTS.MAX_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`Размер файла превышает ${IMAGE_CONSTRAINTS.MAX_SIZE_MB}MB`);
  }

  // Проверка типа файла
  if (!IMAGE_CONSTRAINTS.ALLOWED_FORMATS.includes(file.type as any)) {
    throw new Error(`Неподдерживаемый тип файла: ${file.type}`);
  }
}
```
**Теги поиска:** `file_validation`, `image_type_check`, `size_validation`, `format_validation`, `constraint_checking`

**Что делает:**
- Проверяет, является ли файл изображением
- Валидирует размер файла по константе MAX_SIZE_MB
- Проверяет MIME-тип файла на допустимые форматы

**Параметры:**
- `file: File` - файл для валидации

**Возвращает:** void

**Исключения:** выбрасывает Error с описанием проблемы

## Конвертация в base64

#### readFileAsBase64(file: File): Promise<string>
```typescript
private readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Не удалось прочитать файл'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Ошибка при чтении файла'));
    };
    
    reader.readAsDataURL(file);
  });
}
```
**Теги поиска:** `file_reader_api`, `base64_conversion`, `async_file_reading`, `error_handling_reader`

**Что делает:**
- Создает FileReader для чтения файла
- Устанавливает обработчики onload и onerror
- Читает файл как Data URL (base64)
- Возвращает полную data URL строку

**Параметры:**
- `file: File` - файл для чтения

**Возвращает:** Promise<string> - base64 строка с data: префиксом

## Получение размеров изображения

#### getImageDimensions(base64: string): Promise<{ width: number; height: number }>
```typescript
private getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
      });
    };
    
    img.onerror = () => {
      reject(new Error('Не удалось загрузить изображение'));
    };
    
    img.src = base64;
  });
}
```
**Теги поиска:** `image_dimensions_extraction`, `image_loading_async`, `natural_size_detection`, `image_validation`

**Что делает:**
- Создает Image объект
- Устанавливает обработчики загрузки
- Извлекает естественные размеры после загрузки
- Возвращает ширину и высоту

**Параметры:**
- `base64: string` - изображение в base64 формате

**Возвращает:** Promise с объектом {width, height}

## Определение формата

#### detectImageFormat(file: File): ImageData['format']
```typescript
private detectImageFormat(file: File): ImageData['format'] {
  const extension = getFileExtension(file.name);
  const mimeType = file.type;

  if (mimeType.includes('jpeg') || extension === 'jpg' || extension === 'jpeg') {
    return 'jpeg';
  }
  if (mimeType.includes('png') || extension === 'png') {
    return 'png';
  }
  if (mimeType.includes('webp') || extension === 'webp') {
    return 'webp';
  }
  if (mimeType.includes('gif') || extension === 'gif') {
    return 'gif';
  }

  return 'jpeg'; // По умолчанию
}
```
**Теги поиска:** `format_detection`, `mime_type_parsing`, `file_extension_check`, `fallback_format`

**Что делает:**
- Анализирует MIME-тип файла
- Проверяет расширение файла
- Возвращает соответствующий формат
- По умолчанию возвращает 'jpeg'

**Параметры:**
- `file: File` - файл для определения формата

**Возвращает:** ImageData['format'] - строковый формат ('jpeg', 'png', 'webp', 'gif')

## Управление текущим изображением

#### getCurrentImage(): ImageData | null
```typescript
getCurrentImage(): ImageData | null {
  return this.currentImageData;
}
```
**Теги поиска:** `current_image_getter`, `image_data_access`, `camera_state_check`

**Что делает:**
- Возвращает данные текущего захваченного изображения

**Параметры:** нет

**Возвращает:** ImageData | null - данные изображения или null

#### clearCurrentImage(): void
```typescript
clearCurrentImage(): void {
  this.currentImageData = null;
}
```
**Теги поиска:** `current_image_clear`, `camera_state_reset`, `memory_cleanup`

**Что делает:**
- Очищает данные текущего изображения
- Используется при закрытии превью или начале нового захвата

**Параметры:** нет

**Возвращает:** void

#### getImageForAnalysis(): string | null
```typescript
getImageForAnalysis(): string | null {
  if (!this.currentImageData) return null;

  return this.currentImageData.base64; // Всегда возвращаем оригинал для лучшего качества анализа
}
```
**Теги поиска:** `analysis_image_getter`, `original_quality_preservation`, `base64_for_ai`

**Что делает:**
- Возвращает base64 данные для анализа ИИ
- Всегда использует оригинальное качество (без сжатия)

**Параметры:** нет

**Возвращает:** string | null - base64 данные или null

## Устаревшие методы сжатия

#### compressImage(base64Image: string, quality: number = 0.8): Promise<string>
```typescript
async compressImage(base64Image: string, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      logger.info('Starting image compression', { 
        quality,
        imageLength: base64Image.length,
        hasDataPrefix: base64Image.startsWith('data:')
      });

      // Создаем изображение из base64
      const img = new Image();

      img.onload = () => {
        try {
          // Создаем canvas для сжатия
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            throw new Error('Canvas context not available');
          }

          // Сохраняем оригинальные пропорции
          canvas.width = img.width;
          canvas.height = img.height;

          // Рисуем изображение на canvas
          ctx.drawImage(img, 0, 0);

          // Получаем сжатое изображение в формате JPEG
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

          // Убираем префикс data:image/jpeg;base64,
          const compressedData = compressedBase64.split(',')[1];

          if (!compressedData) {
            throw new Error('Failed to compress image');
          }

          resolve(compressedData);
        } catch (error) {
          logger.error('Error during image compression', error);
          reject(error);
        }
      };

      img.onerror = () => {
        logger.error('Failed to load image for compression');
        reject(new Error('Failed to load image for compression'));
      };

      // Проверяем и устанавливаем правильный data URL
      if (base64Image.startsWith('data:')) {
        img.src = base64Image;
      } else {
        img.src = `data:image/jpeg;base64,${base64Image}`;
      }

    } catch (error) {
      logger.error('Error starting image compression', error);
      reject(error);
    }
  });
}
```
**Теги поиска:** `deprecated_compression`, `canvas_compression`, `quality_control`, `jpeg_compression`, `sharing_compression`

**Что делает:**
- Создает Image объект из base64
- Рисует на canvas с сохранением пропорций
- Экспортирует в JPEG с заданным качеством
- Возвращает сжатые base64 данные

**Статус:** @deprecated - используется только для sharing в ui.ts

**Параметры:**
- `base64Image: string` - изображение в base64
- `quality: number` - качество сжатия (0.0-1.0, по умолчанию 0.8)

**Возвращает:** Promise<string> - сжатые base64 данные без префикса

## Статистика и отладка

#### getStats()
```typescript
getStats() {
  return {
    hasCurrentImage: !!this.currentImageData,
    currentImageInfo: this.currentImageData ? {
      format: this.currentImageData.format,
      dimensions: `${this.currentImageData.width}x${this.currentImageData.height}`,
      originalSize: Math.round(this.currentImageData.originalSize / 1024) + 'KB',
    } : null,
  };
}
```
**Теги поиска:** `camera_stats_get`, `image_info_debugging`, `camera_state_info`

**Что делает:**
- Возвращает статистику состояния камеры
- Информацию о текущем изображении если оно есть

**Параметры:** нет

**Возвращает:** объект со статистикой камеры

## Константы и ограничения

**Используемые константы из IMAGE_CONSTRAINTS:**
```typescript
MAX_SIZE_MB: 10, // Максимальный размер файла в MB
ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
```
**Теги поиска:** `image_constraints`, `file_size_limits`, `supported_formats`, `validation_rules`

## Интеграция с Telegram WebApp

**Особенности Telegram WebApp:**
- Автоматически показывает нативный диалог выбора источника
- Поддерживает камеру, галерею и файловый менеджер
- Работает одинаково на iOS, Android и Desktop
- Переопределяет стандартный input[type="file"]

**Теги поиска:** `telegram_webapp_camera`, `native_dialog`, `cross_platform_support`, `file_input_override`

## Процесс захвата фото

```
1. Пользователь кликает кнопку камеры
2. uiMenuManager.handleCameraButtonClick() → uiAnalysisManager.handleCameraButtonClick()
3. cameraManager.capturePhoto() вызывается
4. selectFile() создает input и открывает диалог Telegram
5. Пользователь выбирает фото (камера/галерея/файл)
6. processImageFile() обрабатывает выбранный файл
7. validateFile() проверяет размер и тип
8. readFileAsBase64() конвертирует в base64
9. getImageDimensions() получает размеры
10. detectImageFormat() определяет формат
11. validateImageData() финальная валидация
12. Сохраняется в currentImageData
13. Отправляется событие 'photo:captured'
14. uiAnalysisManager.handlePhotoCaptured() показывает экран выбора темы
```

**Теги поиска:** `photo_capture_flow`, `user_interaction_flow`, `image_processing_pipeline`, `event_dispatch_chain`

## Обработка ошибок

**Типы ошибок:**
- `Файл не выбран` - пользователь отменил выбор
- `Выбор файла отменен` - отмена через cancel событие
- `Выбранный файл не является изображением` - не image MIME-type
- `Размер файла превышает XMB` - файл слишком большой
- `Неподдерживаемый тип файла` - формат не в ALLOWED_FORMATS
- `Не удалось прочитать файл` - ошибка FileReader
- `Не удалось загрузить изображение` - ошибка при получении размеров

**Теги поиска:** `error_types`, `file_validation_errors`, `reader_errors`, `image_loading_errors`

## Оптимизации

**Текущие оптимизации:**
- Отключено сжатие для сохранения качества анализа
- Использование оригинальных изображений для ИИ
- Минимальная обработка - только валидация и метаданные

**Теги поиска:** `quality_preservation`, `ai_optimization`, `processing_minimization`

## Взаимодействие с другими модулями

**Вызывающие модули:**
- `uiAnalysisManager.handleCameraButtonClick()` - обработка клика по кнопке
- `uiMenuManager.handleCameraButtonClick()` - делегация из меню

**Отправляемые события:**
- `photo:captured` - успешный захват фото с данными изображения

**Теги поиска:** `module_integration`, `event_driven_communication`, `ui_coordination`
