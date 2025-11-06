"""
Модуль для классификации одежды

Содержит:
- Определение категории по подтипу
- Валидация и коррекция категорий
- Полный pipeline классификации одежды
- Генерация fashion embeddings
"""

import time
import base64
import io
import torch
from PIL import Image

# Импортируем маппинг
from mapper.classification_mappers import map_color_to_russian, map_material_to_russian, map_style_to_enum
from mapper.subtype_mapper import map_subtype_to_russian


class ClothingClassifier:
    """
    Сервис для классификации одежды
    
    Архитектура:
    - Использует AnalysisService для FastVLM анализа
    - Валидация и коррекция категорий
    - Маппинг результатов на русский язык
    """
    
    def __init__(self, analysis_service, background_remover, fashion_clip_model, fashion_clip_processor, config, logger):
        """
        Инициализация классификатора
        
        Args:
            analysis_service: Экземпляр AnalysisService для FastVLM анализа
            background_remover: Экземпляр BackgroundRemover для удаления фона
            fashion_clip_model: Модель FashionCLIP для embeddings
            fashion_clip_processor: Процессор FashionCLIP
            config: Конфигурация приложения
            logger: Logger для логирования
        """
        self.analysis_service = analysis_service
        self.background_remover = background_remover
        self.fashion_clip_model = fashion_clip_model
        self.fashion_clip_processor = fashion_clip_processor
        self.config = config
        self.logger = logger
    
    @staticmethod
    def detect_category_from_subtype(subtype: str) -> str:
        """
        Определяет категорию одежды на основе подтипа (более точный метод)
        Синхронизировано с Type_prompt.md
        
        Args:
            subtype: Детальное описание одежды (пункт 2 от FastVLM)
        
        Returns:
            Нормализованная категория или None
        """
        text = subtype.lower().strip()
        
        # INNERWEAR - свитеры, кофты, водолазки, флисовые куртки (приоритет!)
        if any(keyword in text for keyword in [
            'sweater', 'sweatshirt', 'pullover', 'hoodie', 'cardigan',
            'turtleneck', 'crewneck', 'v-neck', 'vneck', 'mock neck', 'mockneck', 'rollneck',
            'fleece', 'fleecejacket', 'polartec', 'jacket'
            'knit'
        ]):
            return 'INNERWEAR'
        
        # OUTERWEAR - верхняя одежда (куртки, пальто, жакеты)
        # Исключаем fleece jacket (это INNERWEAR)
        outerwear_keywords = [
            'coat', 'blazer', 'parka', 'trench', 'trenchcoat', 'bomber', 'bomberjacket',
            'windbreaker', 'raincoat', 'puffer', 'pufferjacket', 'downcoat', 'downjacket',
            'vest', 'puffervest', 'denimjacket', 'leatherjacket', 'suedejacket',
            'peacoat', 'dufflecoat', 'anorak', 'cagoule', 'mackintosh', 'overcoat', 'topcoat'
        ]
        
        # Проверяем OUTERWEAR (исключая fleece)
        if 'fleece' not in text:
            if any(keyword in text for keyword in outerwear_keywords):
                return 'OUTERWEAR'
        
        # BODYWEAR - футболки, рубашки, блузки, топы
        if any(keyword in text for keyword in [
            'tshirt', 't-shirt', 'tee', 'shirt', 'blouse', 'top', 'tank', 'tanktop', 'polo', 'poloshirt',
            'henley', 'crop', 'croptop', 'camisole', 'cami', 'tunic', 'bodysuit', 'leotard',
            'buttondown', 'buttonup', 'oxfordshirt', 'flannelshirt', 'chambray', 'denimshirt'
        ]):
            return 'BODYWEAR'
        
        # FULLBODY - платья, комбинезоны (полный образ)
        if any(keyword in text for keyword in [
            'dress', 'gown', 'eveninggown', 'ballgown', 'cocktaildress', 'sundress',
            'shirtdress', 'wrapdress', 'sheathdress', 'slipdress', 'maxidress', 'mididress', 'minidress',
            'jumpsuit', 'playsuit', 'romper', 'shortalls', 'overalls', 'dungarees',
            'coveralls', 'boilersuit', 'catsuit', 'unitard'
        ]):
            return 'FULLBODY'
        
        # LEGWEAR - штаны, джинсы, шорты, юбки
        if any(keyword in text for keyword in [
            'pants', 'trousers', 'jeans', 'denim', 'skinnyjeans', 'slimjeans', 'straightjeans',
            'bootcut', 'flare', 'wideleg', 'boyfriend', 'momjeans',
            'chinos', 'khakis', 'slacks', 'dresspants', 'cargopants', 'cargo',
            'joggers', 'trackpants', 'sweatpants', 'loungepants',
            'leggings', 'tights', 'jeggings', 'treggings',
            'capris', 'cropped', 'croppedpants', 'culottes', 'palazzopants', 'harem', 'haremtrousers',
            'shorts', 'denimshorts', 'cargoshorts', 'bermudashorts', 'chinoshorts',
            'athleticshorts', 'runningshorts', 'basketballshorts', 'cyclingshorts', 'boardshorts', 'swimshorts',
            'skirt', 'miniskirt', 'midiskirt', 'maxiskirt', 'pencilskirt', 'alineskirt', 'pleatedskirt', 'wrapskirt'
        ]):
            return 'LEGWEAR'
        
        # FOOTWEAR - обувь
        if any(keyword in text for keyword in [
            'shoes', 'boots', 'sneakers', 'trainers', 'runners', 'kicks',
            'sandals', 'slides', 'flipflops', 'thongs',
            'heels', 'highheels', 'pumps', 'stilettos', 'kittenheel', 'wedges', 'platforms',
            'flats', 'balletflats', 'loafers', 'pennyloafers', 'moccasins',
            'oxfords', 'brogues', 'derbys', 'monks', 'monkstraps',
            'chelseaboots', 'ankleboots', 'booties', 'kneehighboots', 'thighhighboots',
            'combatboots', 'militaryboots', 'hikingboots', 'workboots',
            'cowboyboots', 'westernboots', 'ridingboots', 'rainboots', 'wellingtons',
            'snowboots', 'winterboots', 'espadrilles', 'slippers', 'mules', 'clogs'
        ]):
            return 'FOOTWEAR'
        
        # HEADWEAR - головные уборы
        if any(keyword in text for keyword in [
            'hat', 'cap', 'baseballcap', 'snapback', 'fitted', 'trucker', 'truckercap', 'dadhat',
            'beanie', 'knithat', 'skullcap', 'watchcap',
            'beret', 'fedora', 'trilby', 'panama', 'panamaha',
            'bucket', 'buckethat', 'sunhat', 'widebrim', 'floppyhat',
            'visor', 'headband', 'hairband', 'scrunchie',
            'scarf', 'neckscarf', 'infinityscarf', 'bandana', 'kerchief', 'turban', 'headwrap', 'hijab'
        ]):
            return 'HEADWEAR'
        
        # ACCESSORIES - аксессуары (сумки, ремни, украшения, очки)
        if any(keyword in text for keyword in [
            'bag', 'purse', 'handbag', 'shoulderbag', 'backpack', 'rucksack', 'tote', 'totebag',
            'clutch', 'clutchbag', 'satchel', 'messenger', 'messengerbag', 'crossbody', 'crossbodybag',
            'hobobag', 'bucketbag', 'drawstringbag', 'duffelbag', 'weekenderbag', 'gymbag',
            'fannypack', 'beltbag', 'wristlet', 'pouch', 'wallet', 'billfold', 'cardholder', 'coinpurse',
            'belt', 'leatherbelt', 'canvasbelt', 'chainbelt', 'studdedbelt', 'wovenbelt',
            'tie', 'necktie', 'bowtie', 'ascot', 'cravat', 'bolotie', 'suspenders', 'braces',
            'gloves', 'mittens', 'fingerlessgloves',
            'socks', 'anklesocks', 'crewsocks', 'kneehighsocks', 'thighhighsocks', 'stockings', 'pantyhose', 'fishnets',
            'jewelry', 'necklace', 'pendant', 'choker', 'bracelet', 'bangle', 'cuff', 'anklet', 'ring', 'earrings',
            'watch', 'wristwatch', 'smartwatch',
            'sunglasses', 'shades', 'aviators', 'wayfarers', 'glasses', 'eyeglasses', 'spectacles'
        ]):
            return 'ACCESSORIES'
        
        return None  # Не удалось определить
    
    def validate_and_correct_category(self, raw_type: str, subtype: str) -> str:
        """
        Валидирует и корректирует категорию на основе подтипа
        
        Логика:
        1. Проверяем явные ключевые слова в subtype (ПРИОРИТЕТ!)
        2. Если есть конфликт с raw_type - корректируем принудительно
        3. Если subtype неоднозначен - используем raw_type
        
        Args:
            raw_type: Категория из пункта 1 (может быть неточной)
            subtype: Детальное описание из пункта 2 (обычно точнее)
        
        Returns:
            Корректная категория
        """
        # Определяем категорию по subtype (ПРИОРИТЕТ!)
        category_from_subtype = self.detect_category_from_subtype(subtype)
        raw_type_normalized = raw_type.upper().strip()
        
        # Если определили категорию по subtype
        if category_from_subtype:
            # Проверяем конфликт с raw_type
            if raw_type_normalized in ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY', 'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES']:
                if raw_type_normalized != category_from_subtype:
                    self.logger.warning(
                        f"⚠️  КОНФЛИКТ КАТЕГОРИЙ! FastVLM сказал '{raw_type_normalized}', "
                        f"но subtype '{subtype}' явно указывает на '{category_from_subtype}'. "
                        f"Корректируем: {raw_type_normalized} → {category_from_subtype}"
                    )
            
            return category_from_subtype
        
        # Если subtype неоднозначен, используем raw_type от FastVLM
        if raw_type_normalized in ['OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY', 'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES']:
            self.logger.info(f"Используем категорию от FastVLM: {raw_type_normalized} (subtype неоднозначен: {subtype})")
            return raw_type_normalized
        
        # Fallback: пытаемся определить по raw_type как по subtype
        category_from_raw = self.detect_category_from_subtype(raw_type)
        if category_from_raw:
            self.logger.warning(f"Категория определена из raw_type: {category_from_raw}")
            return category_from_raw
        
        # По умолчанию ACCESSORIES
        self.logger.error(f"❌ НЕ УДАЛОСЬ определить категорию! type={raw_type}, subtype={subtype}. Fallback: ACCESSORIES")
        return 'ACCESSORIES'
    
    def classify_clothing(self, image_base64: str, prompts: dict) -> dict:
        """
        Полный pipeline классификации одежды
        
        Шаги:
        1. Удаление фона
        2. 6 последовательных промптов через FastVLM
        3. Валидация и маппинг результатов
        
        Args:
            image_base64: Изображение в base64
            prompts: Словарь промптов {category, type, color, material, style, season}
        
        Returns:
            dict: Результаты классификации с timing
        """
        start_time = time.time()
        
        try:
            # Шаг 1: Декодируем изображение
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
            self.logger.info(f"Изображение декодировано: {image.size}")
            
            # Шаг 2: Удаляем фон
            bg_removal_start = time.time()
            result_image, bg_processing_time = self.background_remover.remove_background(image, upscale=True)
            result_image = self.background_remover.crop_to_content(result_image, padding=10)
            bg_removal_time = time.time() - bg_removal_start
            self.logger.info(f"Фон удален за {bg_removal_time:.2f}с")
            
            # Конвертируем результат в base64 для анализа
            output_buffer = io.BytesIO()
            result_image.save(output_buffer, format='PNG')
            processed_image_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
            
            # Шаг 3: Последовательно вызываем 6 промптов
            self.logger.info("Начинаем последовательную классификацию (6 промптов)")
            
            classification_results = {}
            timing_details = {}
            
            # 1. Category
            self.logger.info("1/6: Определяем категорию...")
            cat_start = time.time()
            category_raw, error = self.analysis_service.analyze_image_fastvlm(processed_image_base64, prompts['category'])
            timing_details['category'] = time.time() - cat_start
            if error:
                return {'success': False, 'error': f'Category analysis failed: {error}'}
            classification_results['category_raw'] = category_raw.strip().upper()
            self.logger.info(f"✅ Категория: {classification_results['category_raw']} ({timing_details['category']:.2f}с)")
            
            # 2. Type
            self.logger.info("2/6: Определяем тип одежды...")
            type_start = time.time()
            type_raw, error = self.analysis_service.analyze_image_fastvlm(processed_image_base64, prompts['type'])
            timing_details['type'] = time.time() - type_start
            if error:
                return {'success': False, 'error': f'Type analysis failed: {error}'}
            classification_results['type_raw'] = type_raw.strip().lower()
            self.logger.info(f"✅ Тип: {classification_results['type_raw']} ({timing_details['type']:.2f}с)")
            
            # 3. Color
            self.logger.info("3/6: Определяем цвет...")
            color_start = time.time()
            color_raw, error = self.analysis_service.analyze_image_fastvlm(processed_image_base64, prompts['color'])
            timing_details['color'] = time.time() - color_start
            if error:
                return {'success': False, 'error': f'Color analysis failed: {error}'}
            classification_results['color_raw'] = color_raw.strip().lower()
            self.logger.info(f"✅ Цвет: {classification_results['color_raw']} ({timing_details['color']:.2f}с)")
            
            # 4. Material
            self.logger.info("4/6: Определяем материал...")
            material_start = time.time()
            material_raw, error = self.analysis_service.analyze_image_fastvlm(processed_image_base64, prompts['material'])
            timing_details['material'] = time.time() - material_start
            if error:
                return {'success': False, 'error': f'Material analysis failed: {error}'}
            classification_results['material_raw'] = material_raw.strip().lower()
            self.logger.info(f"✅ Материал: {classification_results['material_raw']} ({timing_details['material']:.2f}с)")
            
            # 5. Style
            self.logger.info("5/6: Определяем стиль...")
            style_start = time.time()
            style_raw, error = self.analysis_service.analyze_image_fastvlm(processed_image_base64, prompts['style'])
            timing_details['style'] = time.time() - style_start
            if error:
                return {'success': False, 'error': f'Style analysis failed: {error}'}
            classification_results['style_raw'] = style_raw.strip().lower()
            self.logger.info(f"✅ Стиль: {classification_results['style_raw']} ({timing_details['style']:.2f}с)")
            
            # 6. Season
            self.logger.info("6/6: Определяем сезон...")
            season_start = time.time()
            season_raw, error = self.analysis_service.analyze_image_fastvlm(processed_image_base64, prompts['season'])
            timing_details['season'] = time.time() - season_start
            if error:
                return {'success': False, 'error': f'Season analysis failed: {error}'}
            classification_results['season_raw'] = season_raw.strip().lower()
            self.logger.info(f"✅ Сезон: {classification_results['season_raw']} ({timing_details['season']:.2f}с)")
            
            analysis_time = sum(timing_details.values())
            
            # Шаг 4: Валидация и маппинг результатов
            self.logger.info("Валидация и маппинг результатов...")
            
            # Валидируем категорию на основе типа
            validated_category = self.validate_and_correct_category(
                classification_results['category_raw'],
                classification_results['type_raw']
            )
            
            # Переводим на русский
            subtype_russian = map_subtype_to_russian(classification_results['type_raw'])
            color_russian = map_color_to_russian(classification_results['color_raw'])
            material_russian = map_material_to_russian(classification_results['material_raw'])
            style_russian = map_style_to_enum(classification_results['style_raw'])
            
            classification = {
                'category': validated_category,
                'type': classification_results['type_raw'],
                'subtype': subtype_russian,
                'color': color_russian,
                'material': material_russian,
                'style': style_russian,
                'season': classification_results['season_raw'],
                'pattern': 'Unknown',
                'description': f"{subtype_russian} {color_russian}"
            }
            
            total_time = time.time() - start_time
            
            self.logger.info(f"✅ Классификация завершена за {total_time:.2f}с")
            
            return {
                'success': True,
                'classification': classification,
                'raw_analysis': classification_results,
                'processed_image': result_image,
                'processed_image_base64': processed_image_base64,
                'timing': {
                    'total_time': round(total_time, 2),
                    'background_removal_time': round(bg_removal_time, 2),
                    'analysis_time': round(analysis_time, 2),
                    'detailed_timings': timing_details
                },
                'image_info': {
                    'original_size': f'{image.size[0]}x{image.size[1]}',
                    'processed_size': f'{result_image.size[0]}x{result_image.size[1]}'
                }
            }
            
        except Exception as e:
            self.logger.error(f"Ошибка классификации: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'timing': {
                    'total_time': round(time.time() - start_time, 2)
                }
            }

    def generate_fashion_embedding(self, image: Image.Image) -> tuple[list, str]:
        """
        Генерирует embedding вектор для изображения одежды
        
        Args:
            image: PIL Image объект
        
        Returns:
            Tuple (embedding_list, error_message)
            - embedding_list: Список чисел (embedding вектор) или None
            - error_message: Сообщение об ошибке или None
        """
        try:
            if self.fashion_clip_model is None or self.fashion_clip_processor is None:
                return None, "FashionCLIP model not loaded"

            # Обрабатываем изображение
            inputs = self.fashion_clip_processor(images=image, return_tensors="pt")
            
            # Переносим на нужное устройство
            if torch.cuda.is_available() and self.config.DEVICE == 'cuda':
                inputs = {k: v.to('cuda') for k, v in inputs.items()}

            # Генерируем embedding
            with torch.no_grad():
                image_features = self.fashion_clip_model.get_image_features(**inputs)
                
            # Нормализуем вектор
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            
            # Конвертируем в список
            embedding = image_features.cpu().numpy().flatten().tolist()
            
            return embedding, None

        except Exception as e:
            self.logger.error(f"Ошибка генерации embedding: {e}")
            return None, str(e)
