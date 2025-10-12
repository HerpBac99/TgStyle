/**
 * Модуль для управления Capsules функционалом
 * 
 * ⚠️ РЕФАКТОРИНГ: Этот файл сохранен для обратной совместимости
 * Основная логика перенесена в capsules/CapsulesManager.ts
 * 
 * Архитектура после рефакторинга:
 * - capsules/CapsulesManager.ts - координатор UI и бизнес-логики
 * - capsules/CapsulesService.ts - сервис для API запросов
 * - shared/ItemSelector.ts - селектор вещей
 * - shared/PhotoProcessor.ts - обработка фото
 * - shared/DataLoader.ts - загрузка данных
 * - shared/utils.ts - общие утилиты
 */

// Реэкспортируем новый менеджер
export { CapsulesManager as UICapsulesManager, capsulesManager as uiCapsulesManager } from './capsules/CapsulesManager';
