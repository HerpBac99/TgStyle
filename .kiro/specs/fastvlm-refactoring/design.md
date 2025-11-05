# Рефакторинг FastVLM Server - Дизайн

## Обзор

Рефакторинг монолитного `server.py` в модульную архитектуру с четким разделением ответственности, улучшенной тестируемостью и поддерживаемостью.

## Архитектура

### Общая структура

```
fastvlm-server/
├── server.py                    # Точка входа (~50 строк)
├── config.py                    # Конфигурация (существует)
├── background_removal.py        # Background removal (существует)
├── image_preprocessing.py       # Image preprocessing (существует)
│
├── core/                        # Ядро приложения
│   ├── __init__.py
│   ├── app.py                   # Flask app factory
│   ├── logging_config.py        # Настройка логирования
│   └── startup.py               # Процедуры запуска
│
├── models/                      # ML модели (обертки)
│   ├── __init__.py
│   ├── fastvlm_model.py         # FastVLM wrapper
│   ├── fashion_clip_model.py   # FashionCLIP wrapper
│   └── background_remover_model.py # BackgroundRemover wrapper (использует background_removal.py)
│
├── services/                    # Бизнес-логика
│   ├── __init__.py
│   ├── gemini_service.py        # Gemini API
│   ├── ollama_service.py        # Ollama API
│   ├── analysis_service.py      # Анализ стиля
│   ├── classification_service.py # Классификация одежды
│   ├── capsule_service.py       # Генерация капсул
│   └── embedding_service.py     # Fashion embeddings
│
├── mappers/                     # Маппинг данных
│   ├── __init__.py
│   ├── color_mapper.py          # Цвета EN→RU
│   ├── material_mapper.py       # Материалы EN→RU
│   ├── style_mapper.py          # Стили EN→RU
│   ├── category_mapper.py       # Категории + валидация
│   └── subtype_mapper.py        # Подтипы EN→RU
│
├── routes/                      # API endpoints
│   ├── __init__.py
│   ├── health.py                # /health, /stats, /gpu, /model
│   ├── analysis.py              # /analyze, /analyze_gemini, /analyze_for_test
│   ├── classification.py        # /classify_clothing
│   ├── capsules.py              # /generate-capsules, /generate-capsules-mock
│   └── utilities.py             # /embed-clothing, /remove-background, /simple_analyze
│
└── utils/                       # Утилиты
    ├── __init__.py
    ├── prompt_loader.py         # Загрузка промптов
    ├── image_utils.py           # Обработка изображений
    ├── performance.py           # Метрики производительности
    └── validators.py            # Валидация запросов
```

## Компоненты и интерфейсы

### 1. Core Module

#### core/app.py
```python
def create_app() -> Flask:
    """Flask app factory"""
    app = Flask(__name__)
    
    # Setup logging
    setup_logging(app)
    
    # Register blueprints
    register_blueprints(app)
    
    return app

def register_blueprints(app: Flask):
    """Register all route blueprints"""
    from routes import health, analysis, classification, capsules, utilities
    
    app.register_blueprint(health.bp)
    app.register_blueprint(analysis.bp)
    app.register_blueprint(classification.bp)
    app.register_blueprint(capsules.bp)
    app.register_blueprint(utilities.bp)
```

#### core/startup.py
```python
class ServerStartup:
    """Manages server startup procedures"""
    
    def __init__(self):
        self.models_loaded = False
        self.services_initialized = False
    
    def load_models(self):
        """Load all ML models"""
        # Load FastVLM
        # Load FashionCLIP
        # Load Background Remover
    
    def initialize_services(self):
        """Initialize external services"""
        # Initialize Gemini
        # Check Ollama availability
    
    def validate_config(self):
        """Validate configuration"""
        Config.validate_config()
```

### 2. Models Module

#### models/fastvlm_model.py
```python
class FastVLMModel:
    """Wrapper for FastVLM model"""
    
    def __init__(self, model_path: str, device: str):
        self.model = None
        self.tokenizer = None
        self.image_processor = None
        self.context_len = None
    
    def load(self) -> bool:
        """Load model with optimizations"""
        # Load pretrained model
        # Setup inference mode
        # Return success status
    
    def analyze(self, image_base64: str, prompt: str) -> Tuple[str, Optional[str]]:
        """Analyze image with prompt"""
        # Decode image
        # Tokenize prompt
        # Generate response
        # Return (result, error)
    
    def cleanup(self):
        """Cleanup GPU memory"""
        # Clear CUDA cache
        # Delete model
```

#### models/fashion_clip_model.py
```python
class FashionCLIPModel:
    """Wrapper for FashionCLIP model"""
    
    def __init__(self, model_name: str = "patrickjohncyh/fashion-clip"):
        self.model = None
        self.processor = None
    
    def load(self) -> bool:
        """Load FashionCLIP model"""
    
    def generate_embedding(self, image: Image) -> Tuple[List[float], Optional[str]]:
        """Generate fashion embedding vector"""
        # Process image
        # Generate features
        # Normalize
        # Return (embedding, error)
```

#### models/background_remover_model.py
```python
from background_removal import BackgroundRemover

class BackgroundRemoverModel:
    """
    Wrapper для существующего BackgroundRemover класса
    Обеспечивает единый интерфейс с другими моделями
    """
    
    def __init__(self, use_gpu: bool = False):
        self.remover = None
        self.use_gpu = use_gpu
    
    def load(self) -> bool:
        """Initialize BackgroundRemover"""
        try:
            self.remover = BackgroundRemover(use_gpu=self.use_gpu)
            logger.info(f"BackgroundRemover initialized (GPU: {self.use_gpu})")
            return True
        except Exception as e:
            logger.error(f"Failed to load BackgroundRemover: {e}")
            return False
    
    def remove_background(
        self, 
        image: Image.Image, 
        upscale: bool = True
    ) -> Tuple[Image.Image, float]:
        """
        Remove background from image
        
        Args:
            image: PIL Image
            upscale: Upscale before processing for better quality
            
        Returns:
            Tuple[Image.Image, float]: (result_image, processing_time)
        """
        if self.remover is None:
            raise RuntimeError("BackgroundRemover not initialized")
        return self.remover.remove_background(image, upscale)
    
    def crop_to_content(
        self, 
        image: Image.Image, 
        padding: int = 10
    ) -> Image.Image:
        """
        Crop image to content boundaries
        
        Args:
            image: PIL Image (RGBA with alpha channel)
            padding: Padding in pixels
            
        Returns:
            Image.Image: Cropped image
        """
        if self.remover is None:
            raise RuntimeError("BackgroundRemover not initialized")
        return self.remover.crop_to_content(image, padding)
    
    def post_process_mask(
        self, 
        image: Image.Image, 
        feather: int = 2
    ) -> Image.Image:
        """
        Post-process mask for better edges
        
        Args:
            image: PIL Image (RGBA)
            feather: Feather amount for edge smoothing
            
        Returns:
            Image.Image: Post-processed image
        """
        if self.remover is None:
            raise RuntimeError("BackgroundRemover not initialized")
        return self.remover.post_process_mask(image, feather)
```

**Примечание**: 
- Существующий `background_removal.py` остается на месте в корне `fastvlm-server/`
- `BackgroundRemoverModel` - это тонкая обертка для единообразия интерфейса
- Все методы делегируются в оригинальный `BackgroundRemover` класс

### 3. Services Module

#### services/gemini_service.py
```python
class GeminiService:
    """Gemini API integration"""
    
    def __init__(self, api_key: str, model: str):
        self.client = None
        self.api_key = api_key
        self.model = model
    
    def initialize(self) -> bool:
        """Initialize Gemini client"""
        # Create client
        # Validate API key
        # Return success
    
    def create_stylist_response(
        self, 
        analysis: str, 
        topic: str = 'casual'
    ) -> str:
        """Create creative stylist response"""
        # Format prompt
        # Call Gemini API
        # Return response
    
    def analyze_image_direct(
        self,
        image_base64: str,
        prompt: str
    ) -> str:
        """Direct image analysis with Gemini"""
        # Send image + prompt
        # Return analysis
```

#### services/ollama_service.py
```python
class OllamaService:
    """Ollama API integration"""
    
    def __init__(self, url: str, model: str):
        self.url = url
        self.model = model
        self.available = False
    
    def check_availability(self) -> bool:
        """Check if Ollama is available"""
        # GET /api/tags
        # Check model exists
        # Return availability
    
    def create_stylist_response(
        self,
        analysis: str,
        topic: str = 'casual'
    ) -> str:
        """Create creative stylist response"""
        # Format prompt
        # POST /api/generate
        # Return response
```

#### services/analysis_service.py
```python
class AnalysisService:
    """Orchestrates image analysis"""
    
    def __init__(
        self,
        fastvlm_model: FastVLMModel,
        gemini_service: GeminiService,
        ollama_service: OllamaService
    ):
        self.fastvlm = fastvlm_model
        self.gemini = gemini_service
        self.ollama = ollama_service
    
    def perform_multi_pass_analysis(
        self,
        image_base64: str,
        nickname: str
    ) -> dict:
        """Multi-pass analysis (person, clothing, legs, shoes, accessories)"""
        # Load prompts
        # Execute 6 passes
        # Combine results
        # Return structured data
    
    def create_final_response(
        self,
        technical_analysis: str,
        topic: str,
        stylist_type: str = 'gemini'
    ) -> str:
        """Create final stylist response"""
        # Choose stylist (Gemini/Ollama)
        # Generate creative response
        # Fallback if needed
        # Return response
```

#### services/classification_service.py
```python
class ClassificationService:
    """Clothing classification service"""
    
    def __init__(
        self,
        fastvlm_model: FastVLMModel,
        background_remover: BackgroundRemover
    ):
        self.fastvlm = fastvlm_model
        self.bg_remover = background_remover
    
    def classify_clothing(
        self,
        image_base64: str
    ) -> dict:
        """Full classification pipeline"""
        # Remove background
        # Load 6 prompts (category, type, color, material, style, season)
        # Execute sequential analysis
        # Map results to Russian
        # Validate category
        # Return classification
    
    def _execute_classification_prompts(
        self,
        image_base64: str,
        prompts: dict
    ) -> dict:
        """Execute 6 classification prompts"""
        # Category
        # Type
        # Color
        # Material
        # Style
        # Season
        # Return raw results
```

### 4. Mappers Module

#### mappers/color_mapper.py
```python
def map_color_to_russian(color_input: str) -> str:
    """Map English color to Russian"""
    # Normalize input
    # Check color_map dictionary
    # Handle shades (dark, light, bright, pale)
    # Return Russian color

COLOR_MAP = {
    'black': 'Черный',
    'white': 'Белый',
    # ... full mapping
}
```

#### mappers/category_mapper.py
```python
def validate_and_correct_category(raw_type: str, subtype: str) -> str:
    """Validate and correct category based on subtype"""
    # Detect from subtype (priority)
    # Validate against raw_type
    # Log corrections
    # Return validated category

def detect_category_from_subtype(subtype: str) -> Optional[str]:
    """Detect category from detailed subtype"""
    # Check INNERWEAR keywords
    # Check OUTERWEAR keywords
    # Check BODYWEAR keywords
    # ... etc
    # Return category or None
```

### 5. Routes Module

#### routes/health.py
```python
from flask import Blueprint

bp = Blueprint('health', __name__)

@bp.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    # Check model loaded
    # Check GPU available
    # Return status

@bp.route('/stats', methods=['GET'])
def get_stats():
    """Detailed server statistics"""
    # Server uptime
    # Performance stats
    # System resources
    # GPU stats
    # Return JSON
```

#### routes/analysis.py
```python
from flask import Blueprint

bp = Blueprint('analysis', __name__)

@bp.route('/analyze', methods=['POST'])
def analyze():
    """Main analysis endpoint"""
    # Validate request
    # Preprocess image
    # Multi-pass analysis
    # Create stylist response
    # Save results
    # Return JSON

@bp.route('/analyze_gemini', methods=['POST'])
def analyze_gemini():
    """Direct Gemini analysis"""
    # Validate request
    # Preprocess image
    # Call Gemini directly
    # Save results
    # Return JSON
```

### 6. Utils Module

#### utils/prompt_loader.py
```python
class PromptLoader:
    """Loads prompts from markdown files"""
    
    def __init__(self, prompt_dir: str):
        self.prompt_dir = prompt_dir
        self.cache = {}
    
    def load_prompt(self, filename: str) -> str:
        """Load prompt from file with caching"""
        # Check cache
        # Read file
        # Cache result
        # Return prompt
    
    def load_all_classification_prompts(self) -> dict:
        """Load all 6 classification prompts"""
        # Load Category_prompt.md
        # Load Type_prompt.md
        # Load Color_prompt.md
        # Load Material_prompt.md
        # Load Style_prompt.md
        # Load Season_prompt.md
        # Return dict
```

#### utils/performance.py
```python
class PerformanceTracker:
    """Tracks performance metrics"""
    
    def __init__(self):
        self.stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'total_processing_time': 0.0,
            'average_processing_time': 0.0
        }
    
    def update_stats(self, processing_time: float, success: bool):
        """Update performance statistics"""
    
    def get_stats(self) -> dict:
        """Get current statistics"""
```

## Data Models

### Classification Result
```python
@dataclass
class ClassificationResult:
    category: str           # OUTERWEAR, INNERWEAR, etc.
    type: str              # Original English type
    subtype: str           # Russian subtype
    color: str             # Russian color
    material: str          # Russian material
    style: str             # Russian style
    season: str            # Season
    pattern: str           # Pattern
    description: str       # Brief description
    embedding: Optional[List[float]]  # Fashion embedding
```

### Analysis Result
```python
@dataclass
class AnalysisResult:
    technical_analysis: str    # FastVLM multi-pass result
    creative_analysis: str     # Gemini/Ollama stylist response
    timing: dict              # Timing breakdown
    model_used: str           # 'fastvlm+gemini' or 'fastvlm+ollama'
```

## Error Handling

### Стратегия обработки ошибок

1. **Validation Errors** (400)
   - Missing required fields
   - Invalid image data
   - Invalid parameters

2. **Service Errors** (500)
   - Model not loaded
   - API unavailable
   - Processing failures

3. **Graceful Degradation**
   - Gemini unavailable → fallback to Ollama
   - Ollama unavailable → fallback to FastVLM only
   - Background removal fails → use original image

### Error Response Format
```python
{
    "success": False,
    "error": "Error message",
    "timing": {
        "total_time": 1.23
    }
}
```

## Testing Strategy

### Unit Tests
- Mappers (color, material, style, category, subtype)
- Validators
- Prompt loader
- Performance tracker

### Integration Tests
- Model loading
- Service initialization
- API endpoints

### End-to-End Tests
- Full analysis pipeline
- Classification pipeline
- Capsule generation

## Migration Strategy

### Phase 1: Создание новой структуры
1. Создать все директории и __init__.py файлы
2. Создать модули mappers с функциями маппинга
3. Создать модули models с обертками
4. Создать модули services с бизнес-логикой

### Phase 2: Миграция эндпоинтов
1. Создать blueprints в routes/
2. Перенести логику эндпоинтов
3. Обновить импорты
4. Тестировать каждый эндпоинт

### Phase 3: Рефакторинг server.py
1. Создать app factory в core/app.py
2. Создать startup procedures в core/startup.py
3. Упростить server.py до минимума
4. Обновить точку входа

### Phase 4: Удаление мертвого кода
1. Найти неиспользуемые функции
2. Удалить закомментированный код
3. Удалить дублирующиеся функции
4. Проверить все зависимости

### Phase 5: Тестирование и валидация
1. Запустить все существующие тесты
2. Проверить все эндпоинты
3. Проверить производительность
4. Проверить логирование

## Performance Considerations

### Оптимизации
- Кэширование промптов в памяти
- Переиспользование моделей (singleton)
- GPU memory management через context managers
- Lazy loading для необязательных компонентов

### Метрики
- Время загрузки моделей
- Время inference для каждого промпта
- Время обработки изображений
- Использование памяти (RAM и GPU)

## Security Considerations

- Валидация всех входных данных
- Ограничение размера изображений
- Rate limiting (будущее)
- API key validation для Gemini
- Безопасное логирование (без PII)

## Backward Compatibility

- Все существующие URL endpoints сохраняются
- Формат запросов и ответов не меняется
- Коды ошибок остаются прежними
- Существующие клиенты продолжают работать без изменений
