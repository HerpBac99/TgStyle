/**
 * TouchGestureHandler - обработчик touch-жестов для Fabric.js canvas
 * Использует Hammer.js для распознавания pinch, rotate и pan жестов
 * 
 * @deprecated ВРЕМЕННО НЕ ИСПОЛЬЗУЕТСЯ - есть проблемы с микродрожанием
 * Сохранен для будущих улучшений
 */

import * as Hammer from 'hammerjs';
import { Canvas, FabricObject } from 'fabric';
import { logger } from '../logger';

/**
 * Конфигурация обработчика жестов
 */
export interface TouchGestureConfig {
  canvas: Canvas;
  minScale: number;      // Минимальный масштаб (0.1)
  maxScale: number;      // Максимальный масштаб (5.0)
  enablePinch: boolean;  // Включить pinch gesture
  enableRotate: boolean; // Включить rotate gesture
  enablePan: boolean;    // Включить pan gesture
}

/**
 * Состояние трансформации объекта
 */
export interface TransformState {
  scaleX: number;
  scaleY: number;
  angle: number;
  left: number;
  top: number;
}

/**
 * Событие жеста
 */
export interface GestureEvent {
  type: 'pinch' | 'rotate' | 'pan';
  scale?: number;       // Для pinch
  rotation?: number;    // Для rotate (градусы)
  deltaX?: number;      // Для pan
  deltaY?: number;      // Для pan
  center: {             // Центр жеста
    x: number;
    y: number;
  };
}

/**
 * Обработчик touch-жестов для canvas
 */
export class TouchGestureHandler {
  private hammer: HammerManager | null = null;
  private canvas: Canvas | null;
  private config: TouchGestureConfig;
  private activeObject: FabricObject | null = null;
  private initialTransform: TransformState | null = null;
  private isGestureActive: boolean = false;
  private renderScheduled: boolean = false;
  private lastGestureTime: number = 0;
  private readonly GESTURE_DEBOUNCE_MS = 16; // ~60 FPS
  private canvasClickHandler: ((event: any) => void) | null = null;
  private lastRotation: number = 0; // Для отслеживания изменений угла
  private isFirstRotation: boolean = true; // Флаг первого события rotate

  constructor(config: TouchGestureConfig) {
    this.config = config;
    this.canvas = config.canvas;
    
    logger.info('TouchGestureHandler created', {
      minScale: config.minScale,
      maxScale: config.maxScale,
      enablePinch: config.enablePinch,
      enableRotate: config.enableRotate,
      enablePan: config.enablePan
    });
  }

  /**
   * Инициализация Hammer.js и настройка распознавания жестов
   */
  initialize(): void {
    try {
      if (!this.canvas) {
        throw new Error('Canvas is not initialized');
      }
      
      // ВАЖНО: Используем upperCanvasEl (верхний canvas для взаимодействий)
      // а не нижний canvas для рендеринга
      const upperCanvas = (this.canvas as any).upperCanvasEl;
      
      if (!upperCanvas) {
        throw new Error('Upper canvas element not found');
      }

      // Применяем CSS стили для правильной обработки touch событий
      upperCanvas.style.touchAction = 'none';
      upperCanvas.style.msTouchAction = 'none';
      upperCanvas.style.userSelect = 'none';
      upperCanvas.style.webkitUserSelect = 'none';

      // Создаем Hammer manager на верхнем canvas
      this.hammer = new Hammer.Manager(upperCanvas, {
        touchAction: 'none',
        recognizers: [],
        // Включаем поддержку touch событий
        inputClass: Hammer.TouchInput
      });

      // Настраиваем распознаватели жестов
      // ВАЖНО: Порядок добавления и настройка приоритетов!
      
      if (this.config.enablePinch) {
        const pinch = new Hammer.Pinch({
          threshold: 0,     // Минимальный порог для быстрого срабатывания
          pointers: 2       // Требуем ровно 2 пальца
        });
        this.hammer.add(pinch);
        logger.debug('Pinch recognizer added');
      }

      if (this.config.enableRotate) {
        const rotate = new Hammer.Rotate({
          threshold: 10,    // Средний порог для срабатывания
          pointers: 2       // Требуем ровно 2 пальца
        });
        this.hammer.add(rotate);
        logger.debug('Rotate recognizer added');
      }

      if (this.config.enablePan) {
        const pan = new Hammer.Pan({
          direction: Hammer.DIRECTION_ALL,
          threshold: 10,    // Увеличен порог
          pointers: 1       // Только 1 палец
        });
        this.hammer.add(pan);
        logger.debug('Pan recognizer added');
      }

      // Pinch и Rotate могут работать одновременно (оба 2 пальца)
      // Это позволяет масштабировать и вращать одновременно
      if (this.config.enablePinch && this.config.enableRotate) {
        const pinchRecognizer = this.hammer.get('pinch');
        const rotateRecognizer = this.hammer.get('rotate');
        
        if (pinchRecognizer && rotateRecognizer) {
          pinchRecognizer.recognizeWith(rotateRecognizer);
          logger.debug('Pinch and rotate can work simultaneously');
        }
      }

      // Pan НЕ должен работать с pinch/rotate (разное количество пальцев)
      if (this.config.enablePan && this.config.enablePinch) {
        const panRecognizer = this.hammer.get('pan');
        const pinchRecognizer = this.hammer.get('pinch');
        
        if (panRecognizer && pinchRecognizer) {
          panRecognizer.requireFailure(pinchRecognizer);
          logger.debug('Pan requires pinch failure');
        }
      }

      if (this.config.enablePan && this.config.enableRotate) {
        const panRecognizer = this.hammer.get('pan');
        const rotateRecognizer = this.hammer.get('rotate');
        
        if (panRecognizer && rotateRecognizer) {
          panRecognizer.requireFailure(rotateRecognizer);
          logger.debug('Pan requires rotate failure');
        }
      }

      // Подписываемся на события жестов
      this.setupGestureHandlers();

      // Добавляем обработку клика на пустую область для снятия выделения
      this.setupCanvasClickHandler();

      logger.info('TouchGestureHandler initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize TouchGestureHandler', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Настройка обработчика клика на canvas для выбора/снятия выделения
   */
  private setupCanvasClickHandler(): void {
    // Создаем обработчик и сохраняем ссылку для последующей очистки
    this.canvasClickHandler = (event: any) => {
      if (!this.canvas) {
        return;
      }

      // Если клик на объекте - выбираем его
      if (event.target) {
        this.canvas.setActiveObject(event.target);
        this.canvas.renderAll();
        logger.debug('Object selected', { objectId: (event.target as any).id });
      } else {
        // Если клик не на объекте - снимаем выделение
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
        logger.debug('Selection cleared: clicked on empty area');
      }
    };

    // Обработка клика на canvas
    this.canvas?.on('mouse:down', this.canvasClickHandler);

    logger.debug('Canvas click handler configured');
  }

  /**
   * Настройка обработчиков событий жестов
   */
  private setupGestureHandlers(): void {
    if (!this.hammer) {
      return;
    }

    // Pinch gesture handlers
    if (this.config.enablePinch) {
      this.hammer.on('pinchstart', this.onPinchStart.bind(this));
      this.hammer.on('pinchmove', this.onPinchMove.bind(this));
      this.hammer.on('pinchend', this.onPinchEnd.bind(this));
    }

    // Rotate gesture handlers
    if (this.config.enableRotate) {
      this.hammer.on('rotatestart', this.onRotateStart.bind(this));
      this.hammer.on('rotatemove', this.onRotateMove.bind(this));
      this.hammer.on('rotateend', this.onRotateEnd.bind(this));
    }

    // Pan gesture handlers
    if (this.config.enablePan) {
      this.hammer.on('panstart', this.onPanStart.bind(this));
      this.hammer.on('panmove', this.onPanMove.bind(this));
      this.hammer.on('panend', this.onPanEnd.bind(this));
    }

    logger.debug('Gesture handlers configured');
  }

  /**
   * Получить активный объект на canvas
   */
  private getActiveObject(): FabricObject | null {
    if (!this.canvas) {
      return null;
    }
    const activeObject = this.canvas.getActiveObject();
    return activeObject || null;
  }

  /**
   * Сохранить начальное состояние объекта
   */
  private saveInitialTransform(obj: FabricObject): void {
    this.initialTransform = {
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      angle: obj.angle || 0,
      left: obj.left || 0,
      top: obj.top || 0
    };
    
    logger.debug('Initial transform saved', this.initialTransform);
  }

  // ============================================
  // PINCH GESTURE HANDLERS
  // ============================================

  private onPinchStart(event: HammerInput): void {
    logger.debug('Pinch start', { scale: event.scale });
    
    // Получаем активный объект
    this.activeObject = this.getActiveObject();
    
    if (!this.activeObject) {
      logger.debug('No active object for pinch gesture');
      return;
    }

    // Сохраняем начальное состояние (если еще не сохранено)
    if (!this.initialTransform) {
      this.saveInitialTransform(this.activeObject);
    }
    this.isGestureActive = true;
    
    logger.info('Pinch gesture started', {
      objectId: (this.activeObject as any).id,
      initialScale: this.initialTransform?.scaleX
    });
  }

  private onPinchMove(event: HammerInput): void {
    if (!this.activeObject || !this.initialTransform || !this.isGestureActive) {
      return;
    }

    // Вычисляем новый масштаб на основе начального состояния
    const newScale = this.initialTransform.scaleX * event.scale;
    
    // Применяем масштаб с ограничениями
    this.applyScale(newScale);
  }

  private onPinchEnd(event: HammerInput): void {
    logger.debug('Pinch end', { finalScale: event.scale });
    
    if (this.activeObject && this.initialTransform) {
      logger.info('Pinch gesture completed', {
        objectId: (this.activeObject as any).id,
        initialScale: this.initialTransform.scaleX,
        finalScale: this.activeObject.scaleX
      });
    }
    
    // Сбрасываем флаг и начальное состояние
    this.isGestureActive = false;
    this.initialTransform = null;
  }

  // ============================================
  // ROTATE GESTURE HANDLERS
  // ============================================

  private onRotateStart(event: HammerInput): void {
    logger.debug('Rotate start', { rotation: event.rotation });
    
    // Получаем активный объект
    this.activeObject = this.getActiveObject();
    
    if (!this.activeObject) {
      logger.debug('No active object for rotate gesture');
      return;
    }

    // Сохраняем начальное состояние (если еще не сохранено)
    if (!this.initialTransform) {
      this.saveInitialTransform(this.activeObject);
    }
    this.isGestureActive = true;
    
    // Сбрасываем отслеживание rotation
    this.lastRotation = event.rotation;
    this.isFirstRotation = true;
    
    logger.info('Rotate gesture started', {
      objectId: (this.activeObject as any).id,
      initialAngle: this.initialTransform?.angle,
      startRotation: event.rotation
    });
  }

  private onRotateMove(event: HammerInput): void {
    if (!this.activeObject || !this.initialTransform || !this.isGestureActive) {
      return;
    }

    // Игнорируем первое событие (оно содержит начальный скачок)
    if (this.isFirstRotation) {
      this.isFirstRotation = false;
      this.lastRotation = event.rotation;
      logger.debug('Rotate first move ignored', { rotation: event.rotation });
      return;
    }

    // Вычисляем ИЗМЕНЕНИЕ угла (дельту) с предыдущего события
    const rotationDelta = event.rotation - this.lastRotation;
    this.lastRotation = event.rotation;

    // ПЛАВНОЕ ЗАМЕДЛЕНИЕ ПОВОРОТА
    const ROTATION_DAMPING = 1;
    
    // Применяем дельту с замедлением к текущему углу объекта
    const dampedDelta = rotationDelta * ROTATION_DAMPING;
    const currentAngle = this.activeObject.angle || 0;
    const newAngle = currentAngle + dampedDelta;
    
    // Применяем вращение
    this.applyRotation(newAngle);
    
    logger.debug('Rotation move', {
      rotationDelta,
      dampedDelta,
      currentAngle,
      newAngle
    });
  }

  private onRotateEnd(event: HammerInput): void {
    logger.debug('Rotate end', { finalRotation: event.rotation });
    
    if (this.activeObject && this.initialTransform) {
      logger.info('Rotate gesture completed', {
        objectId: (this.activeObject as any).id,
        initialAngle: this.initialTransform.angle,
        finalAngle: this.activeObject.angle
      });
    }
    
    // Сбрасываем флаг и начальное состояние
    this.isGestureActive = false;
    this.initialTransform = null;
    this.lastRotation = 0;
    this.isFirstRotation = true;
  }

  // ============================================
  // PAN GESTURE HANDLERS
  // ============================================

  private onPanStart(event: HammerInput): void {
    logger.debug('Pan start', { 
      deltaX: event.deltaX, 
      deltaY: event.deltaY,
      pointers: event.pointers?.length 
    });
    
    // СТРОГО: Pan работает ТОЛЬКО с одним пальцем
    if (event.pointers && event.pointers.length !== 1) {
      logger.debug('Pan ignored: requires exactly 1 pointer', {
        pointers: event.pointers.length
      });
      return;
    }
    
    // Получаем активный объект
    this.activeObject = this.getActiveObject();
    
    if (!this.activeObject) {
      logger.debug('No active object for pan gesture');
      return;
    }

    // Сохраняем начальное состояние
    this.saveInitialTransform(this.activeObject);
    this.isGestureActive = true;
    
    logger.info('Pan gesture started', {
      objectId: (this.activeObject as any).id,
      initialPosition: { 
        left: this.initialTransform?.left, 
        top: this.initialTransform?.top 
      }
    });
  }

  private onPanMove(event: HammerInput): void {
    // СТРОГО: Проверяем что это ровно 1 палец
    if (event.pointers && event.pointers.length !== 1) {
      logger.debug('Pan move ignored: not exactly 1 pointer');
      return;
    }
    
    if (!this.activeObject || !this.initialTransform || !this.isGestureActive) {
      return;
    }

    // Вычисляем новую позицию на основе начального состояния
    const newX = this.initialTransform.left + event.deltaX;
    const newY = this.initialTransform.top + event.deltaY;
    
    // Применяем позицию
    this.applyPosition(newX, newY);
  }

  private onPanEnd(event: HammerInput): void {
    logger.debug('Pan end', { deltaX: event.deltaX, deltaY: event.deltaY });
    
    if (this.activeObject && this.initialTransform) {
      logger.info('Pan gesture completed', {
        objectId: (this.activeObject as any).id,
        initialPosition: { 
          left: this.initialTransform.left, 
          top: this.initialTransform.top 
        },
        finalPosition: { 
          left: this.activeObject.left, 
          top: this.activeObject.top 
        }
      });
    }
    
    // Сбрасываем флаг и начальное состояние
    this.isGestureActive = false;
    this.initialTransform = null;
  }

  // ============================================
  // TRANSFORM APPLICATION METHODS
  // ============================================

  /**
   * Применить масштаб к активному объекту с ограничениями
   */
  private applyScale(scale: number): void {
    if (!this.activeObject) {
      return;
    }

    // Применяем ограничения min/max
    const constrainedScale = Math.max(
      this.config.minScale,
      Math.min(this.config.maxScale, scale)
    );

    // Применяем масштаб
    this.activeObject.set({
      scaleX: constrainedScale,
      scaleY: constrainedScale
    });

    // Обновляем canvas с debouncing для плавности
    this.scheduleRender();

    logger.debug('Scale applied', {
      requestedScale: scale,
      appliedScale: constrainedScale,
      wasConstrained: scale !== constrainedScale
    });
  }

  /**
   * Применить вращение к активному объекту
   */
  private applyRotation(angle: number): void {
    if (!this.activeObject) {
      return;
    }

    // Нормализуем угол в диапазон 0-360
    let normalizedAngle = angle % 360;
    if (normalizedAngle < 0) {
      normalizedAngle += 360;
    }

    // Применяем вращение
    this.activeObject.set({
      angle: normalizedAngle
    });

    // Обновляем canvas с debouncing для плавности
    this.scheduleRender();

    logger.debug('Rotation applied', {
      requestedAngle: angle,
      appliedAngle: normalizedAngle
    });
  }

  /**
   * Применить позицию к активному объекту
   */
  private applyPosition(x: number, y: number): void {
    if (!this.activeObject) {
      return;
    }

    // Применяем позицию
    this.activeObject.set({
      left: x,
      top: y
    });

    // Ограничиваем границами canvas
    this.constrainToBounds(this.activeObject);

    // Обновляем canvas с debouncing для плавности
    this.scheduleRender();

    logger.debug('Position applied', {
      requestedPosition: { x, y },
      appliedPosition: { 
        left: this.activeObject!.left, 
        top: this.activeObject!.top 
      }
    });
  }

  // ============================================
  // RENDER OPTIMIZATION
  // ============================================

  /**
   * Запланировать рендеринг canvas с debouncing для плавности 30+ FPS
   */
  private scheduleRender(): void {
    if (this.renderScheduled || !this.canvas) {
      return;
    }

    const now = Date.now();
    const timeSinceLastGesture = now - this.lastGestureTime;

    // Debouncing: не чаще чем раз в 16ms (~60 FPS)
    if (timeSinceLastGesture < this.GESTURE_DEBOUNCE_MS) {
      return;
    }

    this.renderScheduled = true;
    this.lastGestureTime = now;

    requestAnimationFrame(() => {
      if (this.canvas) {
        this.canvas.renderAll();
      }
      this.renderScheduled = false;
    });
  }

  // ============================================
  // VALIDATION METHODS
  // ============================================

  /**
   * Ограничить объект границами canvas
   */
  private constrainToBounds(obj: FabricObject): void {
    if (!this.canvas) {
      return;
    }
    
    const canvasWidth = this.canvas.width || 0;
    const canvasHeight = this.canvas.height || 0;

    // Получаем размеры объекта с учетом масштаба
    const objWidth = (obj.width || 0) * (obj.scaleX || 1);
    const objHeight = (obj.height || 0) * (obj.scaleY || 1);

    // Вычисляем границы с учетом origin center
    const minLeft = objWidth / 2;
    const maxLeft = canvasWidth - objWidth / 2;
    const minTop = objHeight / 2;
    const maxTop = canvasHeight - objHeight / 2;

    // Ограничиваем позицию
    let newLeft = obj.left || 0;
    let newTop = obj.top || 0;

    if (newLeft < minLeft) {
      newLeft = minLeft;
    } else if (newLeft > maxLeft) {
      newLeft = maxLeft;
    }

    if (newTop < minTop) {
      newTop = minTop;
    } else if (newTop > maxTop) {
      newTop = maxTop;
    }

    // Применяем ограниченную позицию
    obj.set({
      left: newLeft,
      top: newTop
    });

    logger.debug('Object constrained to bounds', {
      canvasSize: { width: canvasWidth, height: canvasHeight },
      objectSize: { width: objWidth, height: objHeight },
      position: { left: newLeft, top: newTop }
    });
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Уничтожить обработчик и очистить ресурсы
   */
  destroy(): void {
    logger.info('Destroying TouchGestureHandler');

    // Удаляем Hammer.js listeners
    if (this.hammer) {
      this.hammer.destroy();
      this.hammer = null;
      logger.debug('Hammer.js instance destroyed');
    }

    // Удаляем обработчик клика на canvas
    if (this.canvas && this.canvasClickHandler) {
      this.canvas.off('mouse:down', this.canvasClickHandler);
      this.canvasClickHandler = null;
      logger.debug('Canvas click handler removed');
    }

    // Очищаем ссылки на объекты
    this.activeObject = null;
    this.initialTransform = null;
    
    // Очищаем ссылку на canvas
    this.canvas = null;
    
    // Сбрасываем флаги состояния
    this.isGestureActive = false;
    this.renderScheduled = false;

    logger.info('TouchGestureHandler destroyed successfully');
  }
}
