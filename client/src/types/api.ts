/**
 * TypeScript типы для API запросов и ответов
 */

// Базовые типы для API
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Типы для авторизации
export interface AuthRequest {
  initData: string;
}

export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    telegramId: number;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  error?: string;
}

// Типы для анализа изображений
export interface AnalysisRequest {
  photo: string; // base64 encoded image
  pinterestUrl?: string;
  platform?: string;
  userAgent?: string;
  initData?: string;
}


export interface AnalysisResponse {
  success: boolean;
  analysis?: string;
  error?: string;
  multi_pass_results?: {
    person: string;
    accessories: string;
    clothing: string;
  };
  detailed_timings?: {
    person: number;
    accessories: number;
    clothing: number;
    total: number;
  };
}

// Типы для логирования
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  timestamp: string;
  sessionId?: string;
  userAgent?: string;
  url?: string;
  caller?: string;
}

export interface LogRequest {
  sessionId: string;
  logs: LogEntry[];
  timestamp: string;
  userAgent?: string;
  appVersion?: string;
  userData?: any;
  userId?: string | number;
  username?: string;
  isTelegramMiniApp?: boolean;
}

export interface LogResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Типы для истории
export interface HistoryItem {
  id?: string;
  photo: string; // base64 encoded image
  analysis?: string;
  timestamp: string;
  savedAt?: string;
  sourceType?: 'photo' | 'pinterest';
  isEmpty?: boolean;
}

// Пагинация для API
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  error?: string;
}

// Типы ошибок API
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
}

// Константы для HTTP статусов
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
