# 🧠 FastVLM 7B Prompt Engineering Research

**Цель:** Найти оптимальные промпт-техники для FastVLM 7B модели  
**Базовое изображение:** 12.jpg (девушка в бежевом кардигане и джинсах)  
**Метод:** A/B тестирование различных промпт-техник

---

## 📊 BASELINE (контрольный промпт)

**Промпт:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Результат baseline:**
```
"analysis": "The person in the image appears to be a young adult female with a slender body type. She has shoulder-length brown hair and is wearing a dark turtleneck top under a cream-colored cardigan. Her legs are clad in light blue jeans, and she is wearing brown ankle boots. She is holding a smartphone in her right hand, which she is using to take a selfie. The accessories include a delicate necklace with a small pendant. The overall style suggests a casual yet put-together look."
```

**Перевод на русский:**
```
"analysis": "Человек на изображении выглядит как молодая взрослая женщина стройного телосложения. У нее каштановые волосы до плеч. Она носит темный водолазный свитер под бежевым кардиганом кремового цвета. Ее ноги обтянуты светло-синими джинсами, а на ногах коричневые ботинки до щиколотки. Она держит смартфон в правой руке, которым делает селфи. Аксессуары включают изящное ожерелье с небольшим кулоном. Общий стиль предполагает casual, но аккуратный вид."
```

**Время выполнения baseline:** 4.781 секунд

---

## 🎯 ТЕСТ 1: Акценты на важные слова (звездочки)

**Гипотеза:** Выделение ключевых слов через `*word*` улучшит фокус модели

**Промпт ДО (baseline):**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
Describe the person in this image from top to bottom. Tell me their *age*, *gender*, *body type*. Describe all their *clothing*, what's on their *legs*, what *shoes* they're wearing, describe all *accessories*.
```

**Результат:**
```
"analysis": "The person in the image appears to be a young adult female with a slender body type. She has shoulder-length brown hair and is wearing a dark turtleneck top under a cream-colored cardigan. Her legs are clad in light blue jeans, and she is wearing brown pointed-toe flats. The accessories include a delicate necklace with a small pendant and a smartphone in her hand, which she is using to take a selfie. There are no other visible accessories such as bracelets or rings."
```

**Перевод на русский:**
```
"analysis": "Человек на изображении выглядит как молодая взрослая женщина стройного телосложения. У нее каштановые волосы до плеч и она носит темный водолазный свитер под бежевым кардиганом кремового цвета. Ее ноги обтянуты светло-синими джинсами, а на ногах коричневые туфли с острым носком. Аксессуары включают изящное ожерелье с небольшим кулоном и смартфон в руке, которым она делает селфи. Других видимых аксессуаров, таких как браслеты или кольца, нет."
```

**Время выполнения:** 4.402 секунд

**Заключение:** 
- [ ] ✅ Сработало - больше фокуса на выделенных аспектах
- [ ] ❌ Не сработало - нет разницы или хуже
- [ ] ⚠️ Частично - некоторые улучшения

---

## 🎯 ТЕСТ 2: КАПИТАЛИЗАЦИЯ ключевых слов

**Гипотеза:** ЗАГЛАВНЫЕ БУКВЫ для ключевых слов привлекут больше внимания

**Промпт ДО:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
Describe the person in this image from top to bottom. Tell me their AGE, GENDER, BODY TYPE. Describe all their CLOTHING, what's on their LEGS, what SHOES they're wearing, describe all ACCESSORIES.
```

**Результат:**
```
"analysis": "The person in the image appears to be a young adult female, likely in her late teens or early twenties. She has a slender body type with long legs and a slim build. Her hair is shoulder-length and straight, and she has a fair complexion.\n\nShe is wearing a dark brown turtleneck sweater under a light cream-colored cardigan. The cardigan is open, revealing the turturtleneck underneath. She pairs this with light blue denim jeans that are slightly faded and have a relaxed fit. On her feet, she is wearing pointed-toe flats in a taupe color, which complement her outfit nicely.\n\nIn terms of accessories, she has on a delicate necklace with a small pendant, adding a subtle touch of elegance to her look. She is also holding a smartphone in her right hand, which she uses to take the selfie. There are no other visible accessories such as bracelets, rings, or hats."
```

**Перевод на русский:**
```
"analysis": "Человек на изображении выглядит как молодая взрослая женщина, вероятно, в позднем подростковом возрасте или начале двадцати лет. У нее стройное телосложение с длинными ногами и худощавым сложением. Ее волосы до плеч, прямые, и у нее светлая кожа.\n\nОна носит темно-коричневый водолазный свитер под светло-кремовым кардиганом. Кардиган расстегнут, открывая водолазку снизу. Она сочетает это со светло-синими джинсами из денима, которые слегка выцветшие и имеют свободный покрой. На ногах у нее туфли с острым носком бежевого цвета, которые отлично дополняют ее наряд.\n\nЧто касается аксессуаров, на ней изящное ожерелье с небольшим кулоном, добавляющее нотку элегантности ее образу. Она также держит смартфон в правой руке, которым делает селфи. Других видимых аксессуаров, таких как браслеты, кольца или шляпы, нет."
```

**Время выполнения:** 10.401 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 3: Структурированная нумерация

**Гипотеза:** Четкая нумерованная структура улучшит организацию ответа

**Промпт ДО:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
Analyze this image and provide:
1. Person basics (age, gender, build)
2. Upper body clothing 
3. Lower body clothing
4. Footwear
5. Accessories
Be specific and detailed for each point.
```

**Результат:**
```
"analysis": "1. The person in the image appears to be a young adult female with a slim build.\n2. Upper body clothing: She is wearing a dark brown turtleneck sweater under a cream-colored, oversized cardigan.\n3. Lower body clothing:\n   - She is dressed in light blue denim jeans.\n   - The jeans are cropped at the ankle, revealing a small portion of her legs.\n4. Footwear: She has on a pair of brown ankle boots with a slight heel.\n5. Accessories: The woman is wearing minimal accessories, including a delicate necklace with a small pendant and a ring on her right hand."
```

**Перевод на русский:**
```
"analysis": "1. Человек на изображении выглядит как молодая взрослая женщина с худощавым телосложением.\n2. Верхняя одежда: Она носит темно-коричневый водолазный свитер под кремовым, oversized кардиганом.\n3. Нижняя одежда:\n   - Она одета в светло-синие джинсы из денима.\n   - Джинсы обрезаны на уровне щиколотки, открывая небольшую часть ног.\n4. Обувь: На ней коричневые ботинки до щиколотки с небольшим каблуком.\n5. Аксессуары: Женщина носит минимальные аксессуары, включая изящное ожерелье с небольшим кулоном и кольцо на правой руке."
```

**Время выполнения:** 5.786 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 4: Bullet points (•)

**Гипотеза:** Bullet points более естественны чем цифры

**Промпт ДО:**
```
Analyze this image and provide:
1. Person basics (age, gender, build)
2. Upper body clothing 
3. Lower body clothing
4. Footwear
5. Accessories
```

**Промпт ПОСЛЕ:**
```
Analyze this image and provide:
• Person basics (age, gender, build)
• Upper body clothing 
• Lower body clothing
• Footwear
• Accessories
Be specific and detailed for each point.
```

**Результат:**
```
"analysis": "The image depicts a woman standing in a room, taking a selfie with a smartphone. Here is a detailed analysis of the image:\n\n1. **Person Basics:**\n   - **Age:** The woman appears to be in her late 20s to early 30s.\n   - Gender: Female\n   - Build: Medium build\n\n2. **Upper Body Clothing:**\n    - **Top:** She is wearing a dark brown turtleneck sweater.\n    - Over the top, she has a light beige, oversized cardigan.\n\n3. **Lower Body Clothing:** \n    - She is dressed in light blue denim jeans.\n\n4. **Footwear:**\n     - She has on brown ankle boots.\n\n5. **Accessories:**\n      - She appears to have a small, delicate necklace around her neck.\n      - Her hair is styled straight and falls just past her shoulders.\n\n6. **Additional Details:**\n       - The room has a modern and somewhat cluttered appearance.\n       - There is a desk with various items on it, including what looks like a laptop, papers, and other miscellaneous objects.\n       – A chair with a beige coat draped over it is visible in the background.\n       — The room features a large mirror reflecting part of the room, including a doorway and another room in the reflection.\n\nThis detailed description covers all the observable elements in the image, providing a comprehensive understanding of the scene."
```

**Перевод на русский:**
```
"analysis": "Изображение показывает женщину, стоящую в комнате и делающую селфи с помощью смартфона. Вот подробный анализ изображения:\n\n1. **Основные характеристики человека:**\n   - **Возраст:** Женщина выглядит на поздние 20-ые - начало 30-ых.\n   - Пол: Женский\n   - Телосложение: Среднее\n\n2. **Верхняя одежда:**\n    - **Верх:** Она носит темно-коричневый водолазный свитер.\n    - Сверху на нем светло-бежевый oversized кардиган.\n\n3. **Нижняя одежда:** \n    - Она одета в светло-синие джинсы из денима.\n\n4. **Обувь:**\n     - На ней коричневые ботинки до щиколотки.\n\n5. **Аксессуары:**\n      - У нее, кажется, маленькое изящное ожерелье на шее.\n      - Ее волосы уложены прямо и спадают чуть ниже плеч.\n\n6. **Дополнительные детали:**\n       - Комната имеет современный и несколько захламленный вид.\n       - На столе находятся различные предметы, включая то, что похоже на ноутбук, бумаги и другие miscellaneous предметы.\n       – В фоне виден стул с бежевым пальто, наброшенным на него.\n       — В комнате есть большое зеркало, отражающее часть комнаты, включая дверной проем и другую комнату в отражении.\n\nЭто подробное описание охватывает все наблюдаемые элементы изображения, предоставляя всестороннее понимание сцены."
```

**Время выполнения:** 12.129 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 5: Изменение последовательности (важное в начале)

**Гипотеза:** Размещение самого важного в начале промпта улучшит качество

**Промпт ДО:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
First identify: GENDER and AGE. Then describe from top to bottom: body type, all clothing items, what's on legs, shoes, and accessories. Be accurate and detailed.
```

**Результат:**
```
 "analysis": "The person in the image appears to be a young adult female. Her body type is slender with a straight posture. She is wearing a dark brown turtleneck sweater under a cream-colored cardigan that has a relaxed fit. The cardigan is open, revealing the turtlenecks underneath. She has on light blue denim jeans that are cropped at the ankle, showing off her brown pointed-toe flats. Accessories include a delicate necklace with a small pendant and a black smartphone in her hand, which she is using to take the selfie. There are no visible tattoos or piercings, and her hair is styled straight and parted in the middle, falling just past her shoulders."
```

**Перевод на русский:**
```
 "analysis": "Человек на изображении выглядит как молодая взрослая женщина. Ее телосложение стройное с прямой осанкой. Она носит темно-коричневый водолазный свитер под кремовым кардиганом свободного покроя. Кардиган расстегнут, открывая водолазку снизу. На ней светло-синие джинсы из денима, обрезанные на уровне щиколотки, демонстрируя ее коричневые туфли с острым носком. Аксессуары включают изящное ожерелье с небольшим кулоном и черный смартфон в руке, которым она делает селфи. Видимых татуировок или пирсинга нет, а ее волосы уложены прямо и разделены посередине, спадая чуть ниже плеч."
```

**Время выполнения:** 6.168 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 6: Негативные инструкции

**Гипотеза:** Указание что НЕ делать предотвратит ошибки

**Промпт ДО:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.

DO NOT guess if you cannot see something clearly. DO NOT confuse gender. DO NOT hallucinate items that aren't visible.
```

**Результат:**
```
"analysis": "The person in the image is a woman with shoulder-length brown hair. She appears to be in her mid-20s to early 30s. She has a slim build and is wearing a dark turtleneck top under a cream-colored cardigan. The cardigan is oversized, draping over her shoulders. She is also wearing light blue jeans that are cropped at the ankle, revealing a small portion of her legs. On her feet, she has pointed-toe flats in a taupe color. As for accessories, she is wearing delicate jewelry, including a necklace with a small pendant and earrings. There are no other visible accessories."
```

**Перевод на русский:**
```
"analysis": "Человек на изображении - женщина с каштановыми волосами до плеч. Она выглядит на середину 20-ых - начало 30-ых. У нее худощавое телосложение, она носит темный водолазный верх под кремовым кардиганом. Кардиган oversized, драпирующийся на плечах. Она также носит светло-синие джинсы, обрезанные на уровне щиколотки, открывая небольшую часть ног. На ногах у нее туфли с острым носком бежевого цвета. Что касается аксессуаров, она носит изящные ювелирные изделия, включая ожерелье с небольшим кулоном и серьги. Других видимых аксессуаров нет."
```

**Время выполнения:** 6.281 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 7: Конкретность vs абстрактность

**Гипотеза:** Очень конкретные инструкции лучше общих

**Промпт ДО:**
```
Describe the person in this image.
```

**Промпт ПОСЛЕ:**
```
Look at this image and tell me:
- Is this person male or female?
- Approximately how old (20s, 30s, 40s)?
- What color is their hair and how long?
- What type of top are they wearing and what color?
- What type of bottom clothing and what color?
- What shoes and what color?
- Any jewelry, bags, or other accessories?
```

**Результат:**
```
"analysis": "To determine the details about the person in the image, we need to carefully observe and analyze each aspect of their appearance and surroundings.\n\n1. **Gender Identification:**\n   - The person in question has long hair and is wearing makeup, which are often associated with females. Therefore, it is reasonable to conclude that the person is female.\n\n2. **Age Approximation:**\n    - The individual appears to be in their 30s based on their facial features and overall appearance. This estimation considers typical physical characteristics associated with individuals in that age range.\n\n3. **Hair Color and Length:**\n     - The hair color is a light brown or dark blonde. The length of the hair reaches just past the shoulders, indicating it is medium-length.\n\n4. **Top Type and Color:**\n      - The top worn by the person appears to have a maroon or dark red color. It is a long-sleeved top, likely made of a soft fabric given its drape and fit.\n\n5. **Bottom Clothing and Color:** \n      - Below the top, the person wears blue jeans. The jeans are a classic blue denim color, a common choice for casual wear.\n\n6. **Shoes:**\n       - The shoes are brown, possibly made of leather or a similar material. They appear to be flat or low-heeled, suitable for casual or everyday wear.\n\n7. **Jewelry and Accessories:**\n        - The woman is wearing a necklace with a pendant. There are no visible bags or other accessories in the immediate vicinity.\n\nBy carefully examining each detail in the photograph, we can provide a comprehensive description of the person's appearance and attire."
```

**Перевод на русский:**
```
"analysis": "Чтобы определить детали о человеке на изображении, нам нужно внимательно наблюдать и анализировать каждый аспект их внешности и окружения.\n\n1. **Определение пола:**\n   - У человека на изображении длинные волосы и нанесена косметика, что часто ассоциируется с женщинами. Поэтому разумно заключить, что человек женского пола.\n\n2. **Приближенный возраст:**\n    - Человек выглядит на 30-ые, исходя из черт лица и общего вида. Эта оценка учитывает типичные физические характеристики, ассоциированные с людьми этого возрастного диапазона.\n\n3. **Цвет волос и длина:**\n     - Цвет волос светло-каштановый или темно-блондинистый. Длина волос достигает чуть ниже плеч, что указывает на среднюю длину.\n\n4. **Тип и цвет верха:**\n      - Верх, который носит человек, кажется бордового или темно-красного цвета. Это верх с длинными рукавами, вероятно, сделанный из мягкой ткани, учитывая его драпировку и посадку.\n\n5. **Нижняя одежда и цвет:** \n      - Ниже верха человек носит синие джинсы. Джинсы классического синего цвета денима, распространенный выбор для casual одежды.\n\n6. **Обувь:**\n       - Обувь коричневая, возможно, сделана из кожи или подобного материала. Она кажется плоской или с низким каблуком, подходящей для casual или повседневного ношения.\n\n7. **Ювелирные изделия и аксессуары:**\n        - Женщина носит ожерелье с подвеской. Видимых сумок или других аксессуаров в непосредственной близости нет.\n\nТщательно изучив каждую деталь на фотографии, мы можем предоставить всестороннее описание внешности и одежды человека."
```

**Время выполнения:** 14.316 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 8: Эмодзи и визуальные элементы

**Гипотеза:** Эмодзи помогают модели понять контекст

**Промпт ДО:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
👤 Describe the person in this image:
🎂 Age estimate:
♀️/♂️ Gender:
👕 Upper body clothing:
👖 Lower body clothing:
👟 Footwear:
💎 Accessories:
```

**Результат:**
```
"analysis": "The person in the image appears to be a young adult female. She is wearing a brown turtleneck top, light blue jeans, and beige ankle boots. She has a white cardigan draped over her shoulders and is holding a smartphone in her right hand, which she is using to take a selfie. She also has a necklace with a small pendant. The room around her includes a desk with various items on it, a chair with a yellow jacket draped over it, and an open door leading to another room."
```

**Перевод на русский:**
```
"analysis": "Человек на изображении выглядит как молодая взрослая женщина. Она носит коричневый водолазный верх, светло-синие джинсы и бежевые ботинки до щиколотки. У нее белый кардиган, наброшенный на плечи, и она держит смартфон в правой руке, которым делает селфи. У нее также есть ожерелье с небольшим кулоном. Комната вокруг нее включает стол с различными предметами на нем, стул с желтым пиджаком, наброшенным на него, и открытую дверь, ведущую в другую комнату."
```

**Время выполнения:** 4.895 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 9: Few-shot learning (примеры)

**Гипотеза:** Примеры правильных ответов улучшат качество

**Промпт ДО:**
```
Describe the person in this image from top to bottom.
```

**Промпт ПОСЛЕ:**
```
Describe the person in this image following this example format:

Example: "Female, approximately 25 years old, slim build. Wearing: red sweater (cotton, loose fit), blue jeans (denim, straight leg), white sneakers (canvas, low-top), silver watch on left wrist."

Now describe the person in the current image:
```

**Результат:**
```
"analysis": "Female, approximately 25 years old, slim build. Wearing: maroon turtleneck sweater (cotton, loose fit), light blue jeans (denim, straight leg), beige ankle boots (leather, low-top)."
```

**Перевод на русский:**
```
"analysis": "Женщина, примерно 25 лет, худощавое телосложение. Носит: бордовый водолазный свитер (хлопок, свободный покрой), светло-синие джинсы (деним, прямые штанины), бежевые ботинки до щиколотки (кожа, низкие)."
```

**Время выполнения:** 2.795 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 10: Ролевая игра (role playing)

**Гипотеза:** Назначение роли экспера улучшит качество анализа

**Промпт ДО:**
```
Describe the person in this image.
```

**Промпт ПОСЛЕ:**
```
You are a professional fashion stylist with 10 years of experience. Analyze this image and provide a detailed description of the person's appearance and outfit as you would for a client consultation.
```

**Результат:**
```
"analysis": "Based on the image, I would describe the person's appearance as a young adult with shoulder-length brown hair and fair skin. They are wearing a dark brown turtleneck sweater, which is a classic and versatile piece that can be dressed up or down. The sweater is paired with light blue jeans, which adds a casual and relaxed touch to the overall look. The person is also wearing a cream-colored cardigan, which provides a nice contrast to the dark sweater and adds a layer of texture to the outfit. The brown ankle boots with pointed toes add a touch of sophistication and elegance to the look."
```

**Перевод на русский:**
```
"analysis": "Основываясь на изображении, я бы описал внешность человека как молодого взрослого с каштановыми волосами до плеч и светлой кожей. Они носят темно-коричневый водолазный свитер, который является классическим и универсальным предметом, который можно одеть как нарядно, так и casually. Свитер сочетается со светло-синими джинсами, что добавляет casual и расслабленный оттенок общему образу. Человек также носит кремовый кардиган, который обеспечивает хороший контраст с темным свитером и добавляет слой текстуры к наряду. Коричневые ботинки до щиколотки с острыми носами добавляют нотку изысканности и элегантности образу."
```

**Время выполнения:** 6.915 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 11: Температура в тексте (urgency)

**Гипотеза:** Добавление срочности улучшит внимательность модели

**Промпт ДО:**
```
Describe the person in this image.
```

**Промпт ПОСЛЕ:**
```
IMPORTANT: This is a critical fashion analysis task. Look carefully and describe EXACTLY what you see. Accuracy is essential. Describe the person in this image with maximum precision.
```

**Результат:**
```
"analysis": "The image depicts a woman standing in a room, taking a selfie with a smartphone. She is wearing a long, cream-colored cardigan over a dark brown turtleneck sweater. The cardigan has a relaxed fit and appears to be made of a soft, possibly woolen material. Underneath the cardigan, she is wearing light blue jeans that are slightly faded and have a casual, comfortable look. On her feet, she has brown ankle boots with a slight heel, which complement her outfit nicely.\n\nHer hair is medium-length, straight, and brown, styled simply and falling naturally around her shoulders. She has a neutral expression on her face as she looks at the phone's screen to take the photo.\n\nIn the background, the room appears to have a modern and somewhat minimalistic design. There is a white desk with various items on it, including what looks like a laptop, some papers, and possibly a small plant or decorative item. A chair with a beige coat draped over it is visible to the left side of the image. The walls are painted in a light color, and there is a door slightly ajar in the background."
```

**Перевод на русский:**
```
"analysis": "Изображение показывает женщину, стоящую в комнате и делающую селфи с помощью смартфона. Она носит длинный кремовый кардиган поверх темно-коричневого водолазного свитера. Кардиган имеет свободный покрой и кажется сделанным из мягкого материала, возможно, шерсти. Под кардиганом она носит светло-синие джинсы, которые слегка выцветшие и имеют casual, комфортный вид. На ногах у нее коричневые ботинки до щиколотки с небольшим каблуком, которые отлично дополняют ее наряд.\n\nЕе волосы средней длины, прямые и каштановые, просто уложены и естественно спадают вокруг плеч. У нее нейтральное выражение лица, когда она смотрит на экран телефона, чтобы сделать фото.\n\nВ фоне комната кажется современной и несколько минималистичной. Есть белый стол с различными предметами на нем, включая то, что похоже на ноутбук, некоторые бумаги и возможно маленькое растение или декоративный предмет. Стул с бежевым пальто, наброшенным на него, виден слева от изображения. Стены покрашены в светлый цвет, и есть дверь, слегка приоткрытая в фоне."
```

**Время выполнения:** 11.48 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 12: Пошаговое мышление (Chain of Thought)

**Гипотеза:** Просьба "думать вслух" улучшит логику ответа

**Промпт ДО:**
```
Describe the person in this image.
```

**Промпт ПОСЛЕ:**
```
Look at this image step by step:
1. First, observe the person's face and determine gender and approximate age
2. Then examine their hair (color, length, style)
3. Look at upper body clothing (type, color, fit)
4. Examine lower body clothing (type, color, fit)
5. Check footwear (type, color, style)
6. Finally, scan for any accessories

Think through each step and then provide your analysis.
```

**Результат:**
```
"analysis": "To provide a detailed analysis of the image, let's break down each step:\n\n1. **Observation of the Person's Face:**\n   - The person in the image appears to be female based on facial features and hairstyle.\n   - She seems to be in her late 20s to early 30s.\n\n2. **Examination of Hair:**\n    - The hair is brown and straight, reaching just past the shoulders.\n    - It appears to have a natural texture without any visible styling products or treatments.\n\n3. **Upper Body Clothing:**\n     - The individual is wearing a dark brown turtleneck top.\n     - Over the turturtleneck, she has a light beige cardigan with a relaxed fit.\n     The combination of the t-shirt and cardigan suggests a casual yet put-together look.\n\n4. **Lower Body Clothing and Footwear:**\n      - She is wearing light blue jeans that are slightly faded, indicating they might be well-worn or washed frequently.\n      - The jeans are fitted but not skin-tight, providing a comfortable yet stylish appearance.\n      Her footwear consists of brown ankle boots with a slight heel, which adds a touch of sophistication to the overall outfit.\n\n5. **Accessories:**\n       - The most noticeable accessory is the silver necklace with a small pendant, which is visible against the dark turtlenecks.\n       - No other prominent accessories are visible in the photo.\n\nBy analyzing each aspect systematically, we can conclude that the person in this image is a young adult female with brown hair, dressed in a casual but stylish manner with a turtneck, cardigan, jeans, and ankle boots, accessorized with a simple necklace."
```

**Перевод на русский:**
```
"analysis": "Чтобы предоставить подробный анализ изображения, давайте разберем каждый шаг:\n\n1. **Наблюдение за лицом человека:**\n   - Человек на изображении выглядит как женщина, исходя из черт лица и прически.\n   - Она кажется в поздних 20-ых - начале 30-ых.\n\n2. **Изучение волос:**\n    - Волосы каштановые и прямые, достигают чуть ниже плеч.\n    - Они кажутся имеющими натуральную текстуру без видимых средств для укладки или обработки.\n\n3. **Верхняя одежда:**\n     - Человек носит темно-коричневый водолазный верх.\n     - Поверх водолазки у нее светло-бежевый кардиган с свободным покроем.\n     Комбинация водолазки и кардигана предполагает casual, но аккуратный вид.\n\n4. **Нижняя одежда и обувь:**\n      - Она носит светло-синие джинсы, которые слегка выцветшие, что указывает на то, что они могут быть ношенными или часто стираемыми.\n      - Джинсы облегающие, но не обтягивающие, обеспечивая комфортный, но стильный вид.\n      Ее обувь состоит из коричневых ботинок до щиколотки с небольшим каблуком, что добавляет нотку изысканности общему наряду.\n\n5. **Аксессуары:**\n       - Самый заметный аксессуар - серебряное ожерелье с небольшим кулоном, которое видно на фоне темного водолазки.\n       - Других заметных аксессуаров на фото не видно.\n\nАнализируя каждый аспект систематически, мы можем заключить, что человек на этом изображении - молодая взрослая женщина с каштановыми волосами, одетая в casual, но стильный манер с водолазкой, кардиганом, джинсами и ботинками до щиколотки, украшенная простым ожерельем."
```

**Время выполнения:** 15 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 13: Технические термины vs простой язык

**Гипотеза:** Использование модных терминов улучшит точность

**Промпт ДО:**
```
Describe the clothing in this image.
```

**Промпт ПОСЛЕ:**
```
Provide a fashion analysis using proper terminology:
- Silhouette and fit (oversized, slim-fit, relaxed, etc.)
- Garment types (cardigan, turtleneck, skinny jeans, etc.) 
- Colors (specific names like cream, beige, navy, etc.)
- Styling elements (layering, proportions, color coordination)
- Footwear category (ankle boots, pumps, sneakers, etc.)
```

**Результат:**
```
"analysis": "The woman's outfit can be described as a mix of casual and chic elements. The oversized cream cardigan is the focal point, providing a relaxed silhouette that contrasts with the slim-fit skinny jeans. The dark brown turtleneck adds a layering effect, which is a common styling technique to create depth and interest in an outfit. The color coordination is subtle yet effective, with the neutral tones of the cardigan and jeans complemented by the rich brown of the turtlenecks. The ankle boots add a touch of sophistication and are practical for everyday wear."
```

**Перевод на русский:**
```
"analysis": "Наряд женщины можно описать как смесь casual и шикарных элементов. Oversized кремовый кардиган является фокусной точкой, обеспечивая расслабленный силуэт, который контрастирует со slim-fit skinny джинсами. Темно-коричневый водолазный добавляет эффект layering, который является распространенной техникой стайлинга для создания глубины и интереса в наряде. Цветовая координация тонкая, но эффективная, с нейтральными тонами кардигана и джинсов, дополненными насыщенным коричневым водолазки. Ботинки до щиколотки добавляют нотку изысканности и практичны для повседневного ношения."
```

**Время выполнения:** 6.395 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 14: Краткость vs детальность

**Гипотеза:** Очень короткий промпт даст другой результат

**Промпт ДО:**
```
Describe the person in this image from top to bottom. Tell me their age, gender, body type. Describe all their clothing, what's on their legs, what shoes they're wearing, describe all accessories.
```

**Промпт ПОСЛЕ:**
```
Woman or man? Age? Clothes?
```

**Результат:**
```
"analysis": "The image depicts a woman.
```

**Перевод на русский:**
```
"analysis": "Изображение показывает женщину."
```

**Время выполнения:** 2 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 🎯 ТЕСТ 15: Мета-инструкции

**Гипотеза:** Инструкции о том, как отвечать, улучшат структуру

**Промпт ДО:**
```
Describe the person in this image.
```

**Промпт ПОСЛЕ:**
```
Describe the person in this image. 

Response format: Use complete sentences. Start each category on a new line. Be factual and specific. If unsure about something, state "unclear" rather than guessing.
```

**Результат:**
```
"analysis": "The person in the image is a woman standing indoors, taking a selfie with a smartphone. She has shoulder-length brown hair and is wearing a dark turtleneck top under a cream-colored cardigan. She is also wearing blue jeans and brown ankle boots. The room appears to be a living space with a desk, chair, and various items scattered around, including a jacket on the chair and some papers on the desk."
```

**Перевод на русский:**
```
"analysis": "Человек на изображении - женщина, стоящая в помещении и делающая селфи с помощью смартфона. У нее каштановые волосы до плеч и она носит темный водолазный верх под кремовым кардиганом. Она также носит синие джинсы и коричневые ботинки до щиколотки. Комната кажется жилым пространством со столом, стулом и различными предметами, разбросанными вокруг, включая пиджак на стуле и некоторые бумаги на столе."
```

**Время выполнения:** 4.63 секунд

**Заключение:**
- [ ] ✅ Сработало
- [ ] ❌ Не сработало
- [ ] ⚠️ Частично

---

## 📋 ИТОГОВАЯ ТАБЛИЦА РЕЗУЛЬТАТОВ

| Тест | Техника | Время | Качество | Структура | Точность | Итоговая оценка |
|------|---------|-------|----------|-----------|----------|-----------------|
| Baseline | Простой промпт | 4.8 сек | ✅ Хорошо | ⚠️ Средне | ✅ Точно | ⭐⭐⭐⭐ |
| 1 | Звездочки *word* | 4.4 сек | ✅ Хорошо | ⚠️ Средне | ❌ Туфли→ботинки | ⭐⭐⭐ |
| 2 | КАПИТАЛИЗАЦИЯ | 10.4 сек | ❌ Слишком долго | ✅ Хорошо | ✅ Подробно | ⭐⭐ |
| 3 | Нумерация 1-5 | 5.8 сек | ✅ Отлично | ✅ Идеально | ✅ Точно | ⭐⭐⭐⭐⭐ |
| 4 | Bullet points • | 12.1 сек | ❌ Очень долго | ❌ Лишняя комната | ⚠️ Переборщил | ⭐⭐ |
| 5 | Важное в начале | 6.2 сек | ✅ Хорошо | ✅ Хорошо | ✅ Точно | ⭐⭐⭐⭐ |
| 6 | Негативные инструкции | 6.3 сек | ✅ Хорошо | ✅ Хорошо | ❌ Серьги? | ⭐⭐⭐ |
| 7 | Конкретность | 14.3 сек | ❌ Слишком долго | ❌ Переборщил | ⚠️ Избыточно | ⭐⭐ |
| 8 | Эмодзи 👤 | 4.9 сек | ✅ Быстро | ❌ Игнорирует эмодзи | ✅ Точно | ⭐⭐⭐ |
| 9 | Few-shot примеры | 2.8 сек | ✅ Отлично! | ✅ Идеально | ✅ Точно | ⭐⭐⭐⭐⭐ |
| 10 | Role playing | 6.9 сек | ✅ Хорошо | ✅ Профессионально | ✅ Точно | ⭐⭐⭐⭐ |
| 11 | Urgency ВАЖНО | 11.5 сек | ❌ Долго | ❌ Лишняя комната | ⚠️ Переборщил | ⭐⭐ |
| 12 | Chain of Thought | 15.0 сек | ❌ Очень долго | ✅ Структурно | ⚠️ Избыточно | ⭐⭐ |
| 13 | Технические термины | 6.4 сек | ✅ Отлично | ✅ Профессионально | ✅ Точно | ⭐⭐⭐⭐⭐ |
| 14 | Краткий промпт | 2.0 сек | ❌ Слишком кратко | ❌ Неполно | ⚠️ Недостаточно | ⭐ |
| 15 | Мета-инструкции | 4.6 сек | ✅ Хорошо | ✅ Хорошо | ✅ Точно | ⭐⭐⭐⭐ |

## 🏆 ФИНАЛЬНЫЕ ВЫВОДЫ

**Лучшие техники:**
1. **🥇 Few-shot примеры** (2.8 сек, ⭐⭐⭐⭐⭐): Самый эффективный! Краткий, структурированный, точный
2. **🥈 Технические термины** (6.4 сек, ⭐⭐⭐⭐⭐): Профессиональный язык, точные определения
3. **🥉 Нумерация 1-5** (5.8 сек, ⭐⭐⭐⭐⭐): Идеальная структура, четкая организация

**Худшие техники:**
1. **💀 Краткий промпт** (2 сек, ⭐): Слишком мало информации, неполный ответ
2. **🐌 Chain of Thought** (15 сек, ⭐⭐): Слишком медленно, избыточные рассуждения
3. **📚 Конкретность** (14.3 сек, ⭐⭐): Переборщил с деталями, описывает комнату

**Оптимальный промпт для FastVLM 7B:**
```
Describe the person in this image following this example format:

Example: "Female, approximately 25 years old, slim build. Wearing: red sweater (cotton, loose fit), blue jeans (denim, straight leg), white sneakers (canvas, low-top), silver watch on left wrist."

Now analyze this image and provide:
1. Person basics (age, gender, build)
2. Upper body clothing (type, color, fit)
3. Lower body clothing (type, color, fit) 
4. Footwear (type, color, style)
5. Accessories (jewelry, bags, etc.)

Use fashion terminology where appropriate.
```

**Общие наблюдения:**
- **FastVLM 7B лучше реагирует на:** Few-shot примеры, четкую нумерацию, модные термины, средние промпты (2-7 сек)
- **FastVLM 7B хуже понимает:** Эмодзи структуры, слишком длинные инструкции, bullet points, urgency слова
- **Оптимальная длина промпта:** 50-150 слов (не слишком короткий, не слишком длинный)
- **Критические ошибки:** 
  - Длинные промпты (10+ сек) заставляют описывать комнату и лишние детали
  - Сложные инструкции приводят к галлюцинациям (серьги, неправильная обувь)
  - Эмодзи форматирование игнорируется
  - Слишком короткие промпты дают неполные ответы

---

**Дата исследования:** 19 сентября 2025  
**Исследователь:** AI Prompt Engineer  
**Модель:** FastVLM 7B (quantized 4-bit)  
**Изображение:** 12.jpg (девушка в кремовом кардигане и джинсах)  
**GPU:** RTX 3070 8GB с 4-bit квантизацией
