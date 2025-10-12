/**
 * Модуль для управления UI гардероба
 * 
 * ⚠️ РЕФАКТОРИНГ: Этот файл сохранен для обратной совместимости
 * Основная логика перенесена в wardrobe/WardrobeManager.ts
 * 
 * Архитектура после рефакторинга:
 * - wardrobe/WardrobeManager.ts - координатор UI и бизнес-логики
 * - wardrobe/WardrobeService.ts - сервис для API запросов
 * - shared/PhotoProcessor.ts - обработка фото
 * - shared/utils.ts - общие утилиты
 */

// Реэкспортируем новый менеджер
export { WardrobeManager as UIWardrobeManager, wardrobeManager as uiWardrobeManager } from './wardrobe/WardrobeManager';
