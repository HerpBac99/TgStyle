# Design Document

## Overview

Данный документ описывает архитектуру и подход к полному аудиту и рефакторингу кодовой базы проекта TgStyle. Проект состоит из трех основных компонентов:

1. **Client** (TypeScript + Vite) - ~30 модулей в `client/src/modules/`
2. **Server** (Node.js + Express) - ~12 API эндпоинтов в `server/src/api/`
3. **Database** (PostgreSQL + Prisma) - 10 моделей в схеме

Основная цель - систематически проверить каждый модуль, класс и функцию на:
- Дублирование кода
- Неиспользуемый (мертвый) код
- Несоответствия между типами и схемой БД
- Нарушения архитектурных паттернов
- Возможности оптимизации

## Architecture

### Audit Pipeline

Аудит будет выполняться в 3 фазы:

```
Phase 1: Analysis (Анализ)
├── Client Modules Scan
├── Server API Scan
└── Database Schema Scan

Phase 2: Refactoring (Рефакторинг)
├── Consolidate Duplicates
├── Remove Dead Code
└── Standardize Patterns

Phase 3: Optimization (Оптимизация)
├── Optimize Imports
├── Improve Tree-shaking
└── Generate Report
```

### Audit Scope

#### Client Modules (30+ файлов)
```
client/src/modules/
├── Core Managers (5)
│   ├── uiManager.ts
│   ├── uiCore.ts
│   ├── uiMenu.ts
│   ├── uiModalManager.ts
│   └── navigationManager.ts
├── Feature Modules (8)
│   ├── history.ts
│   ├── dataCache.ts
│   ├── auth.ts
│   ├── api.ts
│   ├── logger.ts
│   ├── camera.ts
│   ├── analysis.ts
│   └── photoUploadManager.ts
├── UI Components (5)
│   ├── uiAnalysis.ts
│   ├── uiCapsulesGrid.ts
│   ├── uiCanvasEditor.ts
│   ├── uiCanvasResultScreen.ts
│   └── purchaseRecommendation.ts
├── Domain Modules (6)
│   ├── wardrobe/WardrobeManager.ts
│   ├── wardrobe/WardrobeService.ts
│   ├── capsules/CapsulesManager.ts
│   ├── capsules/CapsulesService.ts
│   ├── capsules/CapsulesSharing.ts
│   └── analysis/AnalysisLikesService.ts
├── Public Feed (3)
│   ├── publicFeed/PublicFeedManager.ts
│   ├── publicFeed/PublicFeedService.ts
│   └── publicFeed/UIPublicFeed.ts
└── Shared Utilities (6)
    ├── shared/DataLoader.ts
    ├── shared/ImageRenderService.ts
    ├── shared/ItemSelector.ts
    ├── shared/PhotoProcessor.ts
    ├── shared/SharingService.ts
    └── shared/utils.ts
```

#### Server API (12 эндпоинтов)
```
server/src/api/
├── auth.js
├── analyze.js
├── backgroundRemoval.js
├── clothingClassification.js
├── history.js
├── subscription.js
├── wardrobe.js
├── capsules.js
├── analysisLikes.js
├── capsuleLikes.js
├── sharedAnalysis.js
└── initialData.js
```

#### Database Models (10 моделей)
```
db/prisma/schema.prisma
├── User
├── HistoryItem
├── Rating
├── Comment
├── Notification
├── WardrobeItem
├── Capsule
├── CapsuleLike
└── ClothingCategory (enum)
```

## Components and Interfaces

### 1. Audit Engine

Центральный компонент для выполнения аудита.

```typescript
interface AuditEngine {
  // Сканирование модулей
  scanClientModules(): Promise<ClientAuditReport>;
  scanServerAPI(): Promise<ServerAuditReport>;
  scanDatabaseSchema(): Promise<DatabaseAuditReport>;
  
  // Анализ проблем
  findDuplicates(files: string[]): DuplicateReport[];
  findDeadCode(files: string[]): DeadCodeReport[];
  findSchemaMismatches(): SchemaMismatchReport[];
  
  // Генерация отчета
  generateReport(): AuditReport;
}
```

### 2. Code Analyzer

Анализатор кода для поиска паттернов и проблем.

```typescript
interface CodeAnalyzer {
  // Анализ функций
  extractFunctions(file: string): FunctionSignature[];
  compareFunctions(f1: FunctionSignature, f2: FunctionSignature): number;
  
  // Анализ импортов
  extractImports(file: string): ImportStatement[];
  findUnusedImports(file: string): string[];
  findCircularDependencies(): CircularDependency[];
  
  // Анализ экспортов
  extractExports(file: string): ExportStatement[];
  findUnusedExports(file: string): string[];
}
```

### 3. Refactoring Engine

Движок для автоматического рефакторинга.

```typescript
interface RefactoringEngine {
  // Объединение дублей
  consolidateDuplicates(duplicates: DuplicateReport[]): RefactoringResult;
  
  // Удаление мертвого кода
  removeDeadCode(deadCode: DeadCodeReport[]): RefactoringResult;
  
  // Стандартизация
  standardizePatterns(files: string[]): RefactoringResult;
  
  // Оптимизация импортов
  optimizeImports(files: string[]): RefactoringResult;
}
```

## Data Models

### Audit Reports

```typescript
interface ClientAuditReport {
  totalModules: number;
  totalLines: number;
  duplicates: DuplicateReport[];
  deadCode: DeadCodeReport[];
  patternViolations: PatternViolation[];
  unusedImports: UnusedImport[];
  circularDependencies: CircularDependency[];
}

interface ServerAuditReport {
  totalEndpoints: number;
  totalLines: number;
  duplicates: DuplicateReport[];
  unusedRoutes: UnusedRoute[];
  missingErrorHandling: MissingErrorHandling[];
  prismaUsageIssues: PrismaUsageIssue[];
}

interface DatabaseAuditReport {
  totalModels: number;
  totalFields: number;
  unusedModels: string[];
  unusedFields: UnusedField[];
  missingIndexes: MissingIndex[];
  schemaMismatches: SchemaMismatch[];
}
```

### Problem Reports

```typescript
interface DuplicateReport {
  type: 'function' | 'class' | 'logic';
  locations: CodeLocation[];
  similarity: number; // 0-100%
  recommendation: string;
}

interface DeadCodeReport {
  type: 'function' | 'class' | 'import' | 'export';
  location: CodeLocation;
  reason: string;
}

interface SchemaMismatch {
  model: string;
  field: string;
  schemaType: string;
  codeType: string;
  locations: CodeLocation[];
}

interface CodeLocation {
  file: string;
  line: number;
  column?: number;
  snippet: string;
}
```

## Error Handling

### Audit Errors

1. **File Access Errors**
   - Файл не найден
   - Нет прав на чтение
   - Решение: Логировать и пропускать файл

2. **Parse Errors**
   - Синтаксическая ошибка в TypeScript/JavaScript
   - Решение: Логировать и пропускать файл

3. **Analysis Errors**
   - Ошибка при анализе AST
   - Решение: Логировать и продолжить с другими файлами

### Refactoring Errors

1. **Backup Failure**
   - Не удалось создать резервную копию
   - Решение: Прервать рефакторинг файла

2. **Write Failure**
   - Не удалось записать изменения
   - Решение: Восстановить из backup

3. **Compilation Errors**
   - После рефакторинга код не компилируется
   - Решение: Откатить изменения, логировать проблему

## Testing Strategy

### Manual Testing Approach

Поскольку это рефакторинг существующего кода, тестирование будет выполняться вручную:

1. **Pre-Refactoring Checks**
   - Убедиться что проект компилируется: `npm run type-check`
   - Создать git commit перед началом работы
   - Запустить приложение и проверить основные функции

2. **During Refactoring**
   - После каждого значительного изменения проверять компиляцию
   - Использовать `getDiagnostics` для проверки ошибок TypeScript
   - Делать промежуточные git commits

3. **Post-Refactoring Validation**
   - Полная проверка компиляции TypeScript
   - Запуск приложения и проверка всех основных функций:
     * Авторизация
     * Анализ изображения
     * Гардероб (добавление/удаление)
     * Капсулы (создание/редактирование)
     * Публичная лента
   - Проверка размера бандла (должен уменьшиться)
   - Проверка логов на наличие ошибок

4. **Metrics Validation**
   - Сравнить метрики до и после:
     * Количество строк кода
     * Количество файлов
     * Размер бандла
     * Количество дублирующихся функций
     * Количество неиспользуемых импортов

### Testing Checklist

```markdown
## Pre-Refactoring
- [ ] Проект компилируется без ошибок
- [ ] Создан git commit
- [ ] Приложение запускается
- [ ] Основные функции работают

## During Refactoring
- [ ] После каждого изменения: type-check
- [ ] После каждого изменения: getDiagnostics
- [ ] Промежуточные commits

## Post-Refactoring
- [ ] TypeScript компиляция успешна
- [ ] Авторизация работает
- [ ] Анализ изображений работает
- [ ] Гардероб работает
- [ ] Капсулы работают
- [ ] Публичная лента работает
- [ ] Размер бандла уменьшился
- [ ] Нет ошибок в логах
```

## Implementation Details

### Phase 1: Analysis

#### 1.1 Client Modules Scan

**Цель**: Найти дублирование и мертвый код в клиентских модулях

**Подход**:
1. Прочитать все файлы в `client/src/modules/`
2. Извлечь все функции, классы, интерфейсы
3. Сравнить функции по сигнатуре и телу
4. Найти неиспользуемые экспорты
5. Найти неиспользуемые импорты

**Известные проблемы для проверки**:
- Дублирование логики кэширования изображений (dataCache.ts, ImageRenderService.ts)
- Дублирование логики загрузки данных (DataLoader.ts, различные Service классы)
- Дублирование обработки ошибок в API вызовах
- Возможно неиспользуемые методы в больших классах (UIManager, UIAnalysisManager)

#### 1.2 Server API Scan

**Цель**: Найти дублирование логики и неиспользуемые маршруты

**Подход**:
1. Прочитать все файлы в `server/src/api/`
2. Извлечь все маршруты и их обработчики
3. Найти дублирующуюся логику (особенно работа с Prisma)
4. Проверить наличие обработки ошибок
5. Проверить использование authHelper и fileStorage

**Известные проблемы для проверки**:
- Дублирование логики авторизации в разных эндпоинтах
- Дублирование логики работы с файлами
- Возможно неиспользуемые эндпоинты (checkLikeStatus помечен как DEPRECATED)
- Дублирование обработки ошибок Prisma

#### 1.3 Database Schema Scan

**Цель**: Проверить соответствие схемы реальному использованию

**Подход**:
1. Прочитать `db/prisma/schema.prisma`
2. Найти все использования моделей в серверном коде
3. Найти неиспользуемые поля
4. Проверить соответствие типов между схемой и TypeScript интерфейсами
5. Проверить наличие необходимых индексов

**Известные проблемы для проверки**:
- `photoData` в HistoryItem помечено как Deprecated
- Возможно неиспользуемые поля в моделях
- Несоответствие enum ClothingCategory между схемой и TypeScript типами

### Phase 2: Refactoring

#### 2.1 Consolidate Duplicates

**Стратегия**:
1. Создать общие утилиты в `client/src/modules/shared/` и `server/src/utils/`
2. Переместить дублирующиеся функции в утилиты
3. Обновить все импорты
4. Удалить оригинальные дубли

**Приоритеты**:
- Высокий: Логика кэширования изображений
- Высокий: Логика загрузки данных
- Средний: Обработка ошибок API
- Средний: Работа с Prisma

#### 2.2 Remove Dead Code

**Стратегия**:
1. Создать backup всех затронутых файлов
2. Удалить неиспользуемые функции и классы
3. Удалить неиспользуемые импорты
4. Удалить закомментированный код
5. Проверить компиляцию после каждого удаления

**Безопасность**:
- Не удалять публичные API методы без подтверждения
- Не удалять методы, которые могут использоваться динамически
- Сохранять deprecated методы с явной пометкой

#### 2.3 Standardize Patterns

**Цель**: Привести все модули к единым паттернам

**Паттерны для стандартизации**:
1. **Singleton Export**: `export const moduleName = new ModuleClass();`
2. **Error Handling**: Единый формат try-catch с логированием
3. **Logging**: Единый формат логов через logger модуль
4. **API Calls**: Использование api клиента вместо прямых fetch
5. **Type Safety**: Строгая типизация, избегать `any`

### Phase 3: Optimization

#### 3.1 Optimize Imports

**Цель**: Улучшить структуру импортов для лучшего tree-shaking

**Действия**:
1. Заменить относительные импорты на path aliases
2. Использовать named exports вместо default exports
3. Создать barrel exports (`index.ts`) для групп модулей
4. Разбить большие модули на более мелкие

**Пример оптимизации**:
```typescript
// До
import { api } from '../../modules/api';
import { logger } from '../../modules/logger';

// После
import { api, logger } from '@/modules';
```

#### 3.2 Improve Tree-shaking

**Цель**: Уменьшить размер финального бандла

**Действия**:
1. Использовать named exports
2. Избегать side effects в модулях
3. Использовать `/*#__PURE__*/` комментарии где нужно
4. Разделить большие модули на более мелкие

#### 3.3 Generate Report

**Формат отчета**:
```markdown
# Code Audit Report

## Executive Summary
- Total files scanned: X
- Total lines of code: Y
- Issues found: Z
- Issues fixed: W

## Metrics Improvement
- Code reduction: -X lines (-Y%)
- Bundle size reduction: -X KB (-Y%)
- Duplicates removed: X
- Dead code removed: Y lines

## Detailed Findings
### Client Modules
- [List of issues and fixes]

### Server API
- [List of issues and fixes]

### Database Schema
- [List of issues and fixes]

## Recommendations
- [Future improvements]
```

## Key Design Decisions

### 1. Manual vs Automated Refactoring

**Decision**: Полуавтоматический подход
- Автоматический анализ и поиск проблем
- Ручной рефакторинг с проверкой каждого изменения
- Причина: Безопасность и контроль качества

### 2. Scope of Changes

**Decision**: Консервативный подход
- Не изменять публичные API без крайней необходимости
- Сохранять обратную совместимость где возможно
- Фокус на внутренней оптимизации
- Причина: Минимизация рисков

### 3. Testing Strategy

**Decision**: Ручное тестирование
- Нет автоматических тестов в проекте
- Ручная проверка после каждого значительного изменения
- Использование TypeScript компилятора как первичной проверки
- Причина: Реалистичный подход для текущего состояния проекта

### 4. Backup Strategy

**Decision**: Git-based backups
- Создание git commit перед началом
- Промежуточные commits после каждой фазы
- Возможность отката к любому состоянию
- Причина: Надежность и простота

### 5. Priority Order

**Decision**: Безопасность > Оптимизация
1. Сначала удаляем явно мертвый код
2. Затем объединяем дубликаты
3. Затем стандартизируем паттерны
4. В конце оптимизируем импорты
- Причина: Минимизация рисков поломки

## Performance Considerations

### Analysis Performance

- Параллельное сканирование файлов где возможно
- Кэширование результатов парсинга AST
- Инкрементальный анализ (только измененные файлы)

### Refactoring Performance

- Батчевая обработка изменений
- Минимизация операций записи на диск
- Использование in-memory операций где возможно

## Security Considerations

### Code Safety

- Никогда не удалять код без анализа использования
- Сохранять deprecated методы с явной пометкой
- Проверять компиляцию после каждого изменения

### Data Safety

- Не изменять схему БД без миграций
- Не удалять поля из моделей без проверки
- Сохранять обратную совместимость API

## Scalability

### Future Audits

Дизайн позволяет легко повторить аудит в будущем:
- Модульная структура анализаторов
- Переиспользуемые утилиты
- Документированные паттерны

### Incremental Improvements

Возможность инкрементальных улучшений:
- Анализ только измененных файлов
- Постепенный рефакторинг
- Приоритизация проблем

## Dependencies

### Required Tools

- TypeScript Compiler API (для анализа кода)
- Node.js fs/promises (для работы с файлами)
- Prisma CLI (для работы со схемой)

### Optional Tools

- ESLint (для дополнительного анализа)
- Prettier (для форматирования)
- Bundle analyzer (для анализа размера)

## Rollback Strategy

### В случае проблем

1. **Немедленный откат**: `git reset --hard <commit>`
2. **Частичный откат**: `git revert <commit>`
3. **Выборочный откат**: `git checkout <commit> -- <file>`

### Критерии для отката

- Проект не компилируется
- Критические функции не работают
- Размер бандла увеличился
- Появились новые ошибки в логах
