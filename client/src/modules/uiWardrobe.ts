/**
 * Модуль для управления UI гардероба
 * Canvas редактор для удаления фона и редактирования изображений
 */

import { logger } from './logger';
import * as fabric from 'fabric';

/**
 * Класс для управления UI гардероба с Canvas редактором
 */
export class UIWardrobeManager {
  private cleanupFunctions: (() => void)[] = [];
  private fabricCanvas: fabric.Canvas | null = null;
  private images: fabric.Image[] = [];

  constructor() {
    logger.info('Canvas Wardrobe Manager initialized');
  }

  /**
   * Обработать открытие гардероба
   */
  async handleWardrobeOpen(): Promise<void> {
    logger.info('Wardrobe opened - initializing canvas editor');

    // Ждем, пока элементы станут видимыми и получат размеры
    await new Promise(resolve => setTimeout(resolve, 100));

    // Проверяем доступность canvas элементов
    const canvasElement = document.getElementById('wardrobe-canvas') as HTMLCanvasElement;
    const wrapper = document.querySelector('.silhouette-wrapper') as HTMLElement;

    if (!canvasElement) {
      logger.error('Canvas element not found in DOM');
      return;
    }
    if (!wrapper) {
      logger.error('Wrapper element not found in DOM');
      return;
    }

    logger.info('Canvas elements found, initializing...');

    // Инициализируем Canvas
    this.initializeCanvas();
    this.setupCanvasEventListeners();
    logger.info('Canvas editor ready');
  }

  /**
   * Инициализировать Fabric Canvas
   */
  private initializeCanvas(): void {
    const canvasElement = document.getElementById('wardrobe-canvas') as HTMLCanvasElement;
    const wrapper = document.querySelector('.silhouette-wrapper') as HTMLElement;

    if (!canvasElement || !wrapper) {
      logger.error('Canvas or wrapper element not found');
      return;
    }

    // Получаем размеры wrapper
    const rect = wrapper.getBoundingClientRect();
    logger.info(`Wrapper rect: ${rect.width}x${rect.height}`);

    // Используем размеры wrapper напрямую
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (width < 100 || height < 100) {
      logger.error(`Canvas dimensions too small: ${width}x${height}`);
      return;
    }

    // Очищаем предыдущий canvas если есть
    if (this.fabricCanvas) {
      this.fabricCanvas.dispose();
    }

    // Инициализируем Fabric Canvas
    this.fabricCanvas = new fabric.Canvas('wardrobe-canvas', {
      width: width,
      height: height,
      // backgroundColor не указываем - будет прозрачный
      selection: false,
    });

    // Настраиваем canvas для лучшего UX
    this.setupCanvasBehavior();

    logger.info(`Fabric Canvas initialized: ${width}x${height}`);
  }

  /**
   * Настроить поведение Fabric Canvas
   */
  private setupCanvasBehavior(): void {
    if (!this.fabricCanvas) return;

    try {
      // Добавляем кастомный контрол удаления для всех объектов (маленькая кнопка в левом верхнем углу)
      // Вместо prototype используем более надежный подход
      const deleteControl = new fabric.Control({
        x: -0.5,
        y: -0.5,
        offsetX: -4,
        offsetY: -25,
        cursorStyle: 'pointer',
        mouseUpHandler: this.deleteObject.bind(this),
        render: this.renderDeleteIcon.bind(this)
      });

      // Добавляем контрол ко всем существующим объектам и новым
      this.fabricCanvas.forEachObject((obj: any) => {
        if (obj && !obj.controls['deleteControl']) {
          obj.controls['deleteControl'] = deleteControl;
        }
      });

      // Переопределяем метод добавления объектов, чтобы добавлять контрол к новым объектам
      const originalAdd = this.fabricCanvas.add;
      this.fabricCanvas.add = (...args: any[]) => {
        const result = originalAdd.apply(this.fabricCanvas, args);
        const obj = args[0];
        if (obj && obj.controls && !obj.controls['deleteControl']) {
          obj.controls['deleteControl'] = deleteControl;
        }
        return result;
      };

      logger.info('Delete control setup completed');
    } catch (error) {
      logger.error('Error setting up delete control', error);
    }

    // Запрещаем выход объектов за границы canvas
    this.fabricCanvas.on('object:moving', (e: any) => {
      const obj = e.target;
      if (!obj) return;

      obj.setCoords();
      const bound = obj.getBoundingRect();

      // Ограничиваем движение по горизонтали
      if (bound.left < 0) {
        obj.set('left', obj.left! - bound.left);
      }
      if (bound.left + bound.width > this.fabricCanvas!.width!) {
        obj.set('left', this.fabricCanvas!.width! - bound.width);
      }

      // Ограничиваем движение по вертикали
      if (bound.top < 0) {
        obj.set('top', obj.top! - bound.top);
      }
      if (bound.top + bound.height > this.fabricCanvas!.height!) {
        obj.set('top', this.fabricCanvas!.height! - bound.height);
      }
    });

    // Ограничиваем масштабирование
    this.fabricCanvas.on('object:scaling', (e: any) => {
      const obj = e.target;
      if (!obj) return;

      // Минимальный размер - 30px
      const minSize = 30;

      if (obj.scaleX! * obj.width! < minSize) {
        obj.scaleX = minSize / obj.width!;
      }
      if (obj.scaleY! * obj.height! < minSize) {
        obj.scaleY = minSize / obj.height!;
      }
    });

    // Обработчик выделения объектов - перемещаем наверх
    this.fabricCanvas.on('selection:created', (options) => {
      if (options.selected && options.selected.length > 0) {
        const selectedObject = options.selected[0];

        if (selectedObject && selectedObject.type === 'image') {
          // Активируем объект
          this.fabricCanvas!.setActiveObject(selectedObject);

          // Перемещаем объект наверх через remove/add
          const currentIndex = this.fabricCanvas!.getObjects().indexOf(selectedObject);

          if (currentIndex !== -1 && currentIndex < this.fabricCanvas!.getObjects().length - 1) {
            this.fabricCanvas!.remove(selectedObject);
            this.fabricCanvas!.add(selectedObject);
          }

          this.fabricCanvas!.renderAll();
        }
      }
    });
  }

  /**
   * Обработчик удаления объекта
   */
  private deleteObject(_eventData: any, transform: any): boolean {
    const target = transform.target;
    if (!target || !this.fabricCanvas) {
      logger.warn('Delete object called with invalid target or canvas', { hasTarget: !!target, hasCanvas: !!this.fabricCanvas });
      return false;
    }

    logger.info('Delete button clicked - removing object from canvas');

    // Удаляем объект с canvas
    this.fabricCanvas.remove(target);

    // Удаляем из массива изображений
    const index = this.images.indexOf(target);
    if (index > -1) {
      this.images.splice(index, 1);
    }

    // Перерисовываем canvas
    this.fabricCanvas.renderAll();

    logger.info(`Object deleted. Remaining images: ${this.images.length}`);

    return true;
  }

  /**
   * Рендер маленькой иконки удаления с буквой X (8x8 пикселей) для кастомного контрола
   */
  private renderDeleteIcon(ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, _fabricObject: fabric.Object): void {
    const size = 20; // Маленькая кнопка 8x8 пикселей
    const centerX = left;
    const centerY = top;

    // Рисуем красный круг
    ctx.save();
    ctx.fillStyle = '#ff4757';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Рисуем букву X (диагональные линии под 45 градусов)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    // Левая верхняя - правая нижняя диагональ
    ctx.moveTo(centerX - 3, centerY - 3);
    ctx.lineTo(centerX + 3, centerY + 3);

    // Правая верхняя - левая нижняя диагональ
    ctx.moveTo(centerX + 3, centerY - 3);
    ctx.lineTo(centerX - 3, centerY + 3);

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Настройка обработчиков событий для Canvas
   */
  private setupCanvasEventListeners(): void {
    const addBtn = document.getElementById('add-item-btn') as HTMLElement;

    if (addBtn) {
      const handleAdd = () => {
        logger.info('Add item button clicked');
        this.handlePhotoUpload();
      };

      addBtn.addEventListener('click', handleAdd);

      // Сохраняем функцию очистки
      this.cleanupFunctions.push(() => {
        addBtn.removeEventListener('click', handleAdd);
      });
    }
  }

  /**
   * Обработчик загрузки фото
   */
  private async handlePhotoUpload(): Promise<void> {
    try {
      logger.info('Starting photo upload process');

      // Создаем input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.onchange = async (event) => {
        try {
          logger.info('Input onchange triggered');
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            logger.info('Photo selected for upload', { fileName: file.name, size: file.size });

            // Здесь будет вызов удаления фона через Python скрипт
            await this.processPhotoWithBackgroundRemoval(file);
          } else {
            logger.warn('No file selected');
          }
        } catch (error) {
          logger.error('Error in photo upload onchange handler', error);
        }
      };

      // Добавляем input в DOM и кликаем по нему
      document.body.appendChild(input);
      logger.info('Input element added to DOM, triggering click');
      input.click();

      // Удаляем input после использования
      setTimeout(() => {
        document.body.removeChild(input);
        logger.info('Input element removed from DOM');
      }, 1000);

    } catch (error) {
      logger.error('Error in handlePhotoUpload', error);
    }
  }

  /**
   * Обработать фото с удалением фона
   */
  private async processPhotoWithBackgroundRemoval(file: File): Promise<void> {
    // Показываем индикатор загрузки
    this.showLoadingIndicator(true);

    try {
      // Конвертируем файл в base64
      const base64 = await this.fileToBase64(file);

      logger.info('Sending photo to remove background...');

      // Вызываем API через прокси на нашем сервере
      const response = await fetch('/api/remove-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: base64
        })
      });

      if (!response.ok) {
        throw new Error(`Background removal failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Background removal failed');
      }

      logger.info('Background removed successfully', {
        timing: result.timing,
        originalSize: result.image_info?.original_size,
        resultSize: result.image_info?.result_size
      });

      // Скрываем индикатор загрузки
      this.showLoadingIndicator(false);

      // Показываем обработанное изображение
      this.showProcessedImage(result.image_base64);

    } catch (error) {
      // Скрываем индикатор загрузки при ошибке
      this.showLoadingIndicator(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing photo with background removal', {
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      
      // Fallback - показываем оригинальное фото если удаление фона не сработало
      try {
        const base64 = await this.fileToBase64(file);
        logger.warn('Showing original photo without background removal');
        this.showProcessedImage(base64);
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        logger.error('Error showing original photo', { error: fallbackErrorMessage });
      }
    }
  }

  /**
   * Показать обработанное изображение с рамкой трансформации
   */
  private showProcessedImage(base64: string): void {
    if (!this.fabricCanvas) {
      logger.error('Fabric Canvas not initialized - reinitializing...');
      this.initializeCanvas();
      if (!this.fabricCanvas) {
        logger.error('Failed to initialize Fabric Canvas');
        return;
      }
    }

    logger.info('Showing processed image on canvas...');

    // Создаем HTML Image элемент для загрузки
    const imgElement = new Image();
    imgElement.crossOrigin = 'anonymous';

    imgElement.onload = () => {
      logger.info(`Image loaded: ${imgElement.width}x${imgElement.height}`);

      // Вычисляем масштаб для заполнения 80% canvas
      const canvasWidth = this.fabricCanvas!.width!;
      const canvasHeight = this.fabricCanvas!.height!;
      const imgWidth = imgElement.width;
      const imgHeight = imgElement.height;
      
      const scale = Math.min(
        (canvasWidth * 0.8) / imgWidth,
        (canvasHeight * 0.8) / imgHeight
      );

      logger.info(`Scaling image: original ${imgWidth}x${imgHeight}, canvas ${canvasWidth}x${canvasHeight}, scale ${scale.toFixed(3)}`);

      // Создаем Fabric Image из HTML Image элемента
      const fabricImg = new fabric.Image(imgElement, {
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        originX: 'center',
        originY: 'center',
        scaleX: scale,
        scaleY: scale,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        lockScalingFlip: true,
        transparentCorners: false,
        cornerColor: '#ffffff',
        cornerStrokeColor: '#333333',
        borderColor: '#333333',
        borderOpacityWhenMoving: 0.8,
        cornerSize: 12,
        touchCornerSize: 24,
        borderDashArray: [5, 5],
      });

      // Добавляем изображение на canvas
      this.fabricCanvas!.add(fabricImg);

      // Явно добавляем контрол удаления к новому изображению
      const deleteControl = new fabric.Control({
        x: -0.5,
        y: -0.5,
        offsetX: -4,
        offsetY: -25,
        cursorStyle: 'pointer',
        mouseUpHandler: this.deleteObject.bind(this),
        render: this.renderDeleteIcon.bind(this)
      });
      fabricImg.controls['deleteControl'] = deleteControl;
      logger.info('Delete control added to new image');

      // Сохраняем ссылку на изображение в массив
      this.images.push(fabricImg);

      // Выделяем изображение
      this.fabricCanvas!.setActiveObject(fabricImg);

      // Перерисовываем canvas
      this.fabricCanvas!.renderAll();

      const scaledWidth = (imgWidth * scale).toFixed(0);
      const scaledHeight = (imgHeight * scale).toFixed(0);
      logger.info(`Image added to canvas: ${imgWidth}x${imgHeight} -> ${scaledWidth}x${scaledHeight}`);
    };

    imgElement.onerror = (error) => {
      logger.error('Error loading image element:', error);
    };

    // Устанавливаем src изображения
    imgElement.src = base64;
  }

  /**
   * Показать/скрыть индикатор загрузки
   */
  private showLoadingIndicator(show: boolean): void {
    const loadingElement = document.getElementById('wardrobe-loading');
    if (loadingElement) {
      if (show) {
        loadingElement.classList.remove('hidden');
      } else {
        loadingElement.classList.add('hidden');
      }
    }
  }

  /**
   * Конвертировать файл в base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Получить статус менеджера гардероба
   */
  getStatus() {
    return {
      initialized: true,
      canvasReady: !!this.fabricCanvas,
      imagesCount: this.images.length,
      canvasSize: this.fabricCanvas ? {
        width: this.fabricCanvas.width,
        height: this.fabricCanvas.height
      } : null,
      cleanupFunctionsCount: this.cleanupFunctions.length,
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying canvas wardrobe manager');

    // Очищаем Fabric Canvas
    if (this.fabricCanvas) {
      this.fabricCanvas.dispose();
      this.fabricCanvas = null;
      this.images = [];
    }

    // Выполняем все функции очистки
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during canvas cleanup', error);
      }
    });

    this.cleanupFunctions = [];
  }
}

// Создаем глобальный экземпляр менеджера гардероба
export const uiWardrobeManager = new UIWardrobeManager();
