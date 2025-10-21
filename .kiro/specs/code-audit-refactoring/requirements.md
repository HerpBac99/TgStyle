# Requirements Document

## Introduction

Данная спецификация описывает полный аудит и рефакторинг кодовой базы проекта TgStyle - Telegram Mini App для AI-анализа стиля одежды. Проект включает клиентскую часть (TypeScript + Vite), серверную часть (Node.js + Express), AI-сервис (Python Flask), и базу данных (PostgreSQL + Prisma). Цель аудита - выявить и устранить дублирование кода, мертвый код, несоответствия между модулями и базой данных, а также оптимизировать архитектуру приложения.

## Glossary

- **TgStyle**: Telegram Mini App для анализа стиля одежды
- **Client**: Frontend приложение на TypeScript + Vite
- **Server**: Backend API на Node.js + Express
- **FastVLM Service**: Python Flask сервис для AI-анализа изображений
- **Database**: PostgreSQL база данных с Prisma ORM
- **Module**: Логический компонент приложения (файл или группа файлов)
- **Dead Code**: Неиспользуемый код, который можно безопасно удалить
- **Code Duplication**: Повторяющийся код, который можно объединить
- **Schema Mismatch**: Несоответствие между типами/интерфейсами и схемой БД
- **API Endpoint**: REST API маршрут на сервере
- **Service Layer**: Слой бизнес-логики приложения
- **UI Component**: Компонент пользовательского интерфейса
- **Singleton Pattern**: Паттерн проектирования с единственным экземпляром класса

## Requirements

### Requirement 1

**User Story:** Как разработчик, я хочу провести полный аудит клиентских модулей, чтобы выявить дублирование функций, мертвый код и несоответствия интерфейсам

#### Acceptance Criteria

1. WHEN аудит клиентских модулей выполняется, THE Audit System SHALL проверить все файлы в директории `client/src/modules/` на наличие дублирующихся функций
2. WHEN аудит клиентских модулей выполняется, THE Audit System SHALL идентифицировать неиспользуемые экспорты и импорты в каждом модуле
3. WHEN аудит клиентских модулей выполняется, THE Audit System SHALL проверить соответствие TypeScript типов схеме Prisma в `db/prisma/schema.prisma`
4. WHEN аудит клиентских модулей выполняется, THE Audit System SHALL выявить нарушения singleton паттерна в модулях
5. WHEN аудит клиентских модулей выполняется, THE Audit System SHALL создать отчет с перечнем найденных проблем и рекомендациями по рефакторингу

### Requirement 2

**User Story:** Как разработчик, я хочу провести полный аудит серверных API эндпоинтов, чтобы устранить дублирование логики и оптимизировать обработку запросов

#### Acceptance Criteria

1. WHEN аудит серверных API выполняется, THE Audit System SHALL проверить все файлы в директории `server/src/api/` на наличие дублирующейся логики
2. WHEN аудит серверных API выполняется, THE Audit System SHALL идентифицировать неиспользуемые маршруты и middleware
3. WHEN аудит серверных API выполняется, THE Audit System SHALL проверить соответствие API контрактов между клиентом и сервером
4. WHEN аудит серверных API выполняется, THE Audit System SHALL выявить отсутствующую обработку ошибок в эндпоинтах
5. WHEN аудит серверных API выполняется, THE Audit System SHALL проверить корректность использования Prisma клиента

### Requirement 3

**User Story:** Как разработчик, я хочу провести аудит схемы базы данных, чтобы убедиться в соответствии моделей реальному использованию в коде

#### Acceptance Criteria

1. WHEN аудит схемы БД выполняется, THE Audit System SHALL проверить все модели в `db/prisma/schema.prisma` на использование в серверном коде
2. WHEN аудит схемы БД выполняется, THE Audit System SHALL идентифицировать неиспользуемые поля в моделях
3. WHEN аудит схемы БД выполняется, THE Audit System SHALL проверить наличие необходимых индексов для часто используемых запросов
4. WHEN аудит схемы БД выполняется, THE Audit System SHALL выявить несоответствия между enum типами в схеме и константами в коде
5. WHEN аудит схемы БД выполняется, THE Audit System SHALL проверить корректность каскадных удалений и связей между моделями

### Requirement 4

**User Story:** Как разработчик, я хочу объединить дублирующиеся функции в общие утилиты, чтобы уменьшить размер кодовой базы и упростить поддержку

#### Acceptance Criteria

1. WHEN дублирующиеся функции идентифицированы, THE Refactoring System SHALL создать общие утилиты в `client/src/modules/shared/` для клиентского кода
2. WHEN дублирующиеся функции идентифицированы, THE Refactoring System SHALL создать общие утилиты в `server/src/utils/` для серверного кода
3. WHEN общие утилиты созданы, THE Refactoring System SHALL заменить все использования дублирующихся функций на вызовы общих утилит
4. WHEN рефакторинг завершен, THE Refactoring System SHALL удалить оригинальные дублирующиеся функции
5. WHEN рефакторинг завершен, THE Refactoring System SHALL обновить все импорты в затронутых файлах

### Requirement 5

**User Story:** Как разработчик, я хочу удалить мертвый код из проекта, чтобы уменьшить размер бандла и улучшить читаемость кода

#### Acceptance Criteria

1. WHEN мертвый код идентифицирован, THE Cleanup System SHALL создать резервную копию затронутых файлов
2. WHEN мертвый код идентифицирован, THE Cleanup System SHALL удалить неиспользуемые функции и классы
3. WHEN мертвый код идентифицирован, THE Cleanup System SHALL удалить неиспользуемые импорты
4. WHEN мертвый код идентифицирован, THE Cleanup System SHALL удалить закомментированный код старше 30 дней
5. WHEN очистка завершена, THE Cleanup System SHALL проверить отсутствие ошибок компиляции TypeScript

### Requirement 6

**User Story:** Как разработчик, я хочу привести все модули к единому стилю кодирования, чтобы улучшить консистентность кодовой базы

#### Acceptance Criteria

1. WHEN стандартизация выполняется, THE Standardization System SHALL проверить соответствие всех модулей паттернам из `.kiro/steering/patterns.md`
2. WHEN стандартизация выполняется, THE Standardization System SHALL привести все singleton модули к единому формату экспорта
3. WHEN стандартизация выполняется, THE Standardization System SHALL стандартизировать обработку ошибок во всех модулях
4. WHEN стандартизация выполняется, THE Standardization System SHALL стандартизировать логирование во всех модулях
5. WHEN стандартизация выполняется, THE Standardization System SHALL обновить комментарии и JSDoc во всех публичных функциях

### Requirement 7

**User Story:** Как разработчик, я хочу оптимизировать импорты и зависимости между модулями, чтобы уменьшить связанность и улучшить tree-shaking

#### Acceptance Criteria

1. WHEN оптимизация импортов выполняется, THE Optimization System SHALL заменить все относительные импорты на path aliases где возможно
2. WHEN оптимизация импортов выполняется, THE Optimization System SHALL выявить циклические зависимости между модулями
3. WHEN оптимизация импортов выполняется, THE Optimization System SHALL разбить большие модули на более мелкие компоненты
4. WHEN оптимизация импортов выполняется, THE Optimization System SHALL использовать named exports вместо default exports для лучшего tree-shaking
5. WHEN оптимизация импортов выполняется, THE Optimization System SHALL создать barrel exports (`index.ts`) для групп связанных модулей

### Requirement 8

**User Story:** Как разработчик, я хочу создать подробный отчет об аудите, чтобы иметь документацию всех изменений и найденных проблем

#### Acceptance Criteria

1. WHEN аудит завершен, THE Reporting System SHALL создать markdown файл с полным отчетом в `.kiro/specs/code-audit-refactoring/audit-report.md`
2. WHEN аудит завершен, THE Reporting System SHALL включить в отчет статистику по каждому типу найденных проблем
3. WHEN аудит завершен, THE Reporting System SHALL включить в отчет список всех выполненных изменений с указанием файлов
4. WHEN аудит завершен, THE Reporting System SHALL включить в отчет метрики улучшения (уменьшение размера кода, количество удаленных дублей)
5. WHEN аудит завершен, THE Reporting System SHALL включить в отчет рекомендации по дальнейшему улучшению архитектуры
