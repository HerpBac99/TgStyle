/**
 * Главный файл экспорта всех TypeScript типов
 */

// Экспорт типов Telegram WebApp (только используемые)
export type {
  TelegramUser,
  TelegramChat,
  TelegramWebAppInitData,
  TelegramWebApp,
} from './telegram';

// Экспорт типов API
export type {
  ApiResponse,
  AuthRequest,
  AuthResponse,
  AnalysisRequest,
  AnalysisResponse,
  LogEntry,
  LogRequest,
  LogResponse,
  HistoryItem,
  PaginationParams,
  PaginatedResponse,
  ApiError,
  HttpStatusCode,
} from './api';

export { HTTP_STATUS } from './api';

// Экспорт типов анализа
export type {
  ImageFile,
  ImageData,
  CameraOptions,
  PhotoCaptureResult,
  ImageSource,
  ImageSourceOption,
  AnalysisStatus,
  AnalysisState,
  PreviewOptions,
  PreviewState,
  ValidationRule,
  ValidationResult,
  FastVLMRequest,
  FastVLMResponse,
  FastVLMHealthCheck,
} from './analysis';


// Общие типы приложения
export interface AppConfig {
  apiUrl: string;
  environment: 'development' | 'production';
  version: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  telegramBotName: string;
  features: {
    fastVLM: boolean;
    pinterest: boolean;
    history: boolean;
    analytics: boolean;
  };
}

export interface AppState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  user?: import('./telegram.js').TelegramUser;
  theme: 'light' | 'dark';
  currentView: 'main' | 'preview' | 'analysis' | 'history';
  error?: string;
}

// Типы тем для анализа одежды
export type FashionTheme =
  | 'casual'          // Повседневный
  | 'office'          // Офис/работа
  | 'party'           // Вечеринка
  | 'walk'            // Прогулка
  | 'date'            // Свидание
  | 'sport'           // Спорт
  | 'beach'           // Пляж/отпуск
  | 'family'          // Семейное мероприятие

export interface FashionThemeOption {
  id: FashionTheme;
  name: string;
  description: string;
  emoji: string;
}

// Типы для событий приложения
export type AppEvent =
  | 'app:ready'
  | 'auth:success'
  | 'auth:failure'
  | 'photo:captured'
  | 'theme:selected'
  | 'photo:analyzed'
  | 'history:updated'
  | 'error:occurred';

export interface EventData {
  type: AppEvent;
  payload?: any;
  timestamp: number;
}

// Типы для логирования
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
  flush(): Promise<void>;
}

// Утилитарные типы
export type NonEmptyArray<T> = [T, ...T[]];
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>;

// Типы для DOM элементов
export interface DOMElements {
  userName: HTMLElement | null;
  userPhoto: HTMLElement | null;
  cameraBtn: HTMLButtonElement | null;
  historyCells: NodeListOf<HTMLElement>;
  appContainer: HTMLElement | null;
}
