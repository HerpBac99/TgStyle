# Диаграммы потоков данных - TgStyle

## Добавление вещи в гардероб

```mermaid
sequenceDiagram
    participant User
    participant WM as WardrobeManager
    participant PP as PhotoProcessor
    participant FastVLM
    participant WS as WardrobeService
    participant API as Server API
    participant DB as Database
    participant Cache as DataCacheManager

    User->>WM: Click "+" button
    WM->>User: Show file picker
    User->>WM: Select photo (5-10 MB)
    
    Note over WM,PP: Оптимизация для классификации
    WM->>PP: processPhotoWithBackgroundRemoval(file)
    PP->>PP: optimizeForClassification(base64)<br/>800px, JPEG 80% → 200 KB
    
    Note over PP,FastVLM: Классификация и удаление фона
    PP->>FastVLM: POST /classify_clothing<br/>(optimized image)
    FastVLM->>FastVLM: Анализ (1-2s)
    FastVLM->>FastVLM: Удаление фона (0.5-1s)
    FastVLM->>FastVLM: Постобработка (2s)
    FastVLM-->>PP: { classification, processed_image_base64 }
    
    PP-->>WM: { processedImage, classification }
    WM->>User: Show preview modal
    
    User->>WM: Click "✓" (confirm)
    
    Note over WM,Cache: Оптимистичное создание
    WM->>WM: Create optimisticItem<br/>(tempId = Date.now())
    WM->>Cache: addWardrobeItem(optimisticItem)
    WM->>User: Show item in grid (instant)
    
    Note over WM,DB: Сохранение на сервер (фон)
    WM->>WS: addItem(imageBase64, classification)
    WS->>WS: optimizeImageForUpload()<br/>1200px, PNG
    WS->>API: POST /api/wardrobe
    API->>API: saveImageToDisk()<br/>Check hasAlpha → PNG/JPEG
    API->>DB: INSERT INTO WardrobeItem
    DB-->>API: { id, imageUrl, ...fields }
    API-->>WS: { item }
    
    Note over WS,WM: Замена временной вещи
    WS-->>WM: serverItem
    WM->>Cache: replaceOptimisticItem(tempId, serverItem)
    WM->>WM: updateItemIdInDOM(tempId, realId)
    WM->>User: Update image URL (no re-render)
```

## Редактирование вещи

```mermaid
sequenceDiagram
    participant User
    participant WM as WardrobeManager
    participant Modal as UIModalManager
    participant WS as WardrobeService
    participant API as Server API
    participant Cache as DataCacheManager

    User->>WM: Short press on item
    WM->>WM: Save originalItemData
    WM->>Modal: showItemModal(existingItem)
    Modal->>User: Show modal with fields
    
    User->>Modal: Edit category/color/material
    Modal->>WM: onDataChange(field, value)
    WM->>WM: Update item fields
    
    User->>Modal: Click "✓"
    Modal->>WM: onConfirm()
    
    WM->>WM: Compare with originalItemData
    alt Has changes
        Note over WM,Cache: Оптимистичное обновление
        WM->>WM: wardrobeItems[index] = updated
        WM->>User: Re-render grid (instant)
        
        Note over WM,API: Синхронизация с сервером (фон)
        WM->>WS: updateItem(itemId, updates)
        WS->>Cache: updateWardrobeItemFields()
        WS->>API: PUT /api/wardrobe/:id
        API-->>WS: { success: true }
    else No changes
        WM->>User: Close modal (no action)
    end
```

## Удаление вещи

```mermaid
sequenceDiagram
    participant User
    participant WM as WardrobeManager
    participant WS as WardrobeService
    participant API as Server API
    participant Cache as DataCacheManager
    participant FS as File System

    User->>WM: Long press (600ms)
    WM->>User: Show confirm dialog
    User->>WM: Confirm delete
    
    WM->>WS: deleteItem(itemId)
    WS->>API: DELETE /api/wardrobe/:id
    API->>FS: deleteImageFromDisk()
    API->>API: DELETE FROM WardrobeItem
    API-->>WS: { success: true }
    
    WS->>Cache: removeWardrobeItem(itemId)
    WS-->>WM: Success
    
    WM->>WM: wardrobeItems.splice(index, 1)
    WM->>User: Re-render grid
```

## Загрузка гардероба

```mermaid
sequenceDiagram
    participant User
    participant WM as WardrobeManager
    participant WS as WardrobeService
    participant Cache as DataCacheManager
    participant API as Server API
    participant LS as localStorage

    User->>WM: Open wardrobe tab
    
    Note over WM,LS: Мгновенная загрузка из кэша
    WM->>WS: loadWardrobe()
    WS->>Cache: getWardrobeItems()
    Cache->>LS: Load from localStorage
    LS-->>Cache: First 30 items (no base64)
    Cache-->>WS: wardrobeItems[]
    WS-->>WM: items
    WM->>User: Render grid (instant)
    
    Note over WM,API: Фоновая синхронизация
    WM->>WS: loadWardrobeInBackground()
    WS->>API: GET /api/wardrobe
    API-->>WS: All items
    
    alt Data changed
        WS->>Cache: Update cache
        WS->>LS: Save to localStorage
        WS->>WM: New items
        WM->>User: Re-render grid
    else No changes
        WS->>WM: No update needed
    end
```

## Кэширование данных

```mermaid
graph TB
    subgraph "Уровень 1: Память"
        DCM[DataCacheManager]
        WI[wardrobeItems: all]
        CAP[capsules: all]
        PF[publicFeed: all]
    end
    
    subgraph "Уровень 2: localStorage"
        LS[localStorage]
        WC[WARDROBE_CACHE<br/>first 30 items<br/>no base64]
        CC[CAPSULES_CACHE<br/>all capsules]
        PFC[PUBLIC_FEED_CACHE<br/>recent items]
    end
    
    subgraph "Уровень 3: Browser Cache"
        BC[Browser Image Cache]
        IMG[Preloaded Images]
    end
    
    DCM --> WI
    DCM --> CAP
    DCM --> PF
    
    WI --> LS
    CAP --> LS
    PF --> LS
    
    LS --> WC
    LS --> CC
    LS --> PFC
    
    WI --> BC
    CAP --> BC
    PF --> BC
    
    BC --> IMG
    
    style DCM fill:#e1f5ff
    style LS fill:#fff4e1
    style BC fill:#f0f0f0
```

## Оптимизация изображений

```mermaid
graph LR
    subgraph "Клиент"
        O[Original Photo<br/>5-10 MB<br/>PNG/JPEG]
        
        subgraph "Для классификации"
            OC[optimizeForClassification<br/>800px<br/>JPEG 80%<br/>~200 KB]
        end
        
        subgraph "Для сохранения"
            OU[optimizeImageForUpload<br/>1200px<br/>PNG<br/>~1-2 MB]
        end
    end
    
    subgraph "FastVLM"
        FV[Classification<br/>+ Background Removal]
        PR[Processed Image<br/>PNG with transparency]
    end
    
    subgraph "Сервер"
        CH[Check hasAlpha]
        
        subgraph "PNG path"
            PNG[Sharp PNG<br/>1200px<br/>quality 90<br/>~500 KB - 1 MB]
        end
        
        subgraph "JPEG path"
            JPG[Sharp JPEG<br/>1200px<br/>quality 85<br/>~200-500 KB]
        end
        
        SAVE[Save to disk]
    end
    
    O --> OC
    OC --> FV
    FV --> PR
    PR --> OU
    OU --> CH
    
    CH -->|hasAlpha=true| PNG
    CH -->|hasAlpha=false| JPG
    
    PNG --> SAVE
    JPG --> SAVE
    
    style O fill:#ffcccc
    style OC fill:#ccffcc
    style OU fill:#ccccff
    style PR fill:#ffccff
    style PNG fill:#ccffcc
    style JPG fill:#ffffcc
```

## Архитектура модулей

```mermaid
graph TB
    subgraph "UI Layer"
        WM[WardrobeManager<br/>UI координатор]
        CM[CapsulesManager<br/>UI координатор]
        UM[UIModalManager<br/>Модальные окна]
    end
    
    subgraph "Service Layer"
        WS[WardrobeService<br/>API запросы]
        CS[CapsulesService<br/>API запросы]
        PP[PhotoProcessor<br/>FastVLM интеграция]
    end
    
    subgraph "Data Layer"
        DCM[DataCacheManager<br/>Кэширование]
        API[API Client<br/>HTTP запросы]
    end
    
    subgraph "Server"
        SAPI[Express API]
        DB[(PostgreSQL)]
        FV[FastVLM Service]
    end
    
    WM --> WS
    WM --> UM
    WM --> PP
    CM --> CS
    CM --> WM
    
    WS --> DCM
    WS --> API
    CS --> DCM
    CS --> API
    PP --> API
    
    API --> SAPI
    SAPI --> DB
    SAPI --> FV
    
    style WM fill:#e1f5ff
    style WS fill:#fff4e1
    style DCM fill:#f0f0f0
    style SAPI fill:#ffe1e1
```

## Событийная система

```mermaid
graph LR
    subgraph "WardrobeManager"
        WM[Dispatch Events]
    end
    
    subgraph "Events"
        E1[wardrobe:item-saved]
        E2[wardrobe:item-selection-toggle]
    end
    
    subgraph "CapsulesManager"
        CM[Listen Events]
    end
    
    WM -->|dispatch| E1
    WM -->|dispatch| E2
    
    E1 -->|addEventListener| CM
    E2 -->|addEventListener| CM
    
    CM -->|Sync new items| CM
    CM -->|Toggle selection| CM
    
    style WM fill:#e1f5ff
    style CM fill:#fff4e1
    style E1 fill:#ccffcc
    style E2 fill:#ccffcc
```

## Два режима гардероба

```mermaid
graph TB
    subgraph "Main Wardrobe"
        MW[prefix: 'wardrobe'<br/>gridId: 'wardrobe-clothes-grid']
        
        subgraph "Interactions"
            SP1[Short Press<br/>→ Preview Modal]
            LP1[Long Press 600ms<br/>→ Delete Confirm]
        end
    end
    
    subgraph "Capsule Modal"
        CM[prefix: 'capsules-modal'<br/>gridId: 'capsules-modal-clothes-grid']
        
        subgraph "Interactions"
            SP2[Short Press<br/>→ Toggle Selection]
            LP2[Long Press 600ms<br/>→ Delete Confirm]
        end
    end
    
    MW --> SP1
    MW --> LP1
    CM --> SP2
    CM --> LP2
    
    SP2 -->|Event| E[wardrobe:item-selection-toggle]
    E -->|Listen| CapsM[CapsulesManager]
    
    style MW fill:#e1f5ff
    style CM fill:#fff4e1
```

## Оптимистичное обновление

```mermaid
sequenceDiagram
    participant UI
    participant Local as Local State
    participant Server
    
    Note over UI,Local: Шаг 1: Оптимистичное обновление
    UI->>Local: Update immediately
    Local->>UI: Render new state (instant)
    
    Note over Local,Server: Шаг 2: Синхронизация (фон)
    Local->>Server: Send update request
    
    alt Success
        Server-->>Local: Success response
        Local->>Local: Replace temp data with real
        Local->>UI: Update IDs (no re-render)
    else Error
        Server-->>Local: Error response
        Local->>Local: Rollback changes
        Local->>UI: Show error + re-render
    end
```

## Производительность

```mermaid
gantt
    title Время добавления вещи (было vs стало)
    dateFormat X
    axisFormat %Ls
    
    section Было (30+ сек)
    Отправка фото на FastVLM : 0, 26000
    Классификация FastVLM : 26000, 32000
    Сохранение на сервер : 32000, 35000
    
    section Стало (3-5 сек)
    Оптимизация на клиенте : 0, 200
    Отправка на FastVLM : 200, 500
    Классификация FastVLM : 500, 2500
    Сохранение на сервер : 2500, 4000
```

## Использование

Эти диаграммы можно:
1. Просматривать в любом Markdown редакторе с поддержкой Mermaid
2. Копировать в документацию
3. Использовать для объяснения архитектуры команде
4. Обновлять при изменении логики

Для рендеринга Mermaid диаграмм:
- GitHub/GitLab - автоматически
- VS Code - установить расширение "Markdown Preview Mermaid Support"
- Online - https://mermaid.live/
