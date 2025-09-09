/**
 * TypeScript типы для анализа изображений и стиля
 */

import type { ClassificationData } from './api.js';

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
  compressed?: string;
  originalSize: number;
  compressedSize?: number;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'gif';
}

export interface CompressionOptions {
  maxSizeMB: number;
  maxWidth: number;
  maxHeight?: number;
  quality: number;
  format?: 'jpeg' | 'png' | 'webp';
}

// Типы для анализа стиля
export interface StyleAnalysis {
  classification: ClassificationData;
  details: {
    colors: string[];
    style: string;
    material?: string;
    season?: 'весна' | 'лето' | 'осень' | 'зима' | 'универсальный';
    occasion?: 'повседневная' | 'официальная' | 'праздничная' | 'спортивная';
  };
  recommendations: {
    combinations: string[];
    accessories: string[];
    styling: string[];
  };
  analysis: string;
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
  result?: StyleAnalysis;
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
  analysisResult?: StyleAnalysis;
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
