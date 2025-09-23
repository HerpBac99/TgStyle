/**
 * TypeScript типы для анализа изображений и стиля
 */

// Типы для загрузки и обработки изображений
export interface ImageFile {
  file: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface ImageData {
  base64: string;
  originalSize: number;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'gif';
}



// Типы для работы с камерой
export interface CameraOptions {
  preferCamera: boolean;
  acceptedTypes: string[];
  multiple: boolean;
}

export interface PhotoCaptureResult {
  success: boolean;
  image?: ImageData;
  error?: string;
}

// Типы для источников изображений
export type ImageSource = 'camera' | 'gallery' | 'pinterest' | 'url';

export interface ImageSourceOption {
  type: ImageSource;
  label: string;
  icon: string;
  available: boolean;
}

// Типы для состояния анализа
export type AnalysisStatus = 
  | 'idle' 
  | 'uploading' 
  | 'processing' 
  | 'completed' 
  | 'error';

export interface AnalysisState {
  status: AnalysisStatus;
  progress: number; // 0-100
  currentStep?: string;
  error?: string;
  analysis?: string; // Добавляем поле для хранения текста анализа
}

// Типы для предпросмотра изображения
export interface PreviewOptions {
  showAnalyzeButton: boolean;
  showBackButton: boolean;
  showInfo: boolean;
  allowEdit: boolean;
}

export interface PreviewState {
  isVisible: boolean;
  image?: ImageData;
  options: PreviewOptions;
}

// Типы для валидации изображений
export interface ValidationRule {
  name: string;
  check: (image: ImageData) => boolean;
  errorMessage: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}


// Типы для FastVLM интеграции
export interface FastVLMRequest {
  image_base64: string;
  prompt: string;
}

export interface FastVLMResponse {
  success: boolean;
  analysis?: string;
  model_used?: string;
  device?: string;
  error?: string;
}

export interface FastVLMHealthCheck {
  status: 'healthy' | 'unhealthy';
  model_loaded: boolean;
  device: string;
  timestamp: number;
  torch_version?: string;
}
