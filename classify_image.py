import tensorflow as tf
import numpy as np
from tensorflow.keras.preprocessing.image import load_img, img_to_array

# Путь к модели
model_path = "C:/Users/Herp/source/repos/TgStyle_LLM/dataset/deepfashion2/clothing_model.h5"

# Загружаем модель
model = tf.keras.models.load_model(model_path)

# Параметры изображений
img_height, img_width = 224, 224
class_names = ['dress', 'tshirt', 'pants', 'jacket']

# Функция для предобработки изображения
def preprocess_image(image_path):
    # Загружаем изображение
    img = load_img(image_path, target_size=(img_height, img_width))
    # Преобразуем в массив
    img_array = img_to_array(img)
    # Нормализуем (0-1)
    img_array = img_array / 255.0
    # Добавляем размерность батча
    img_array = np.expand_dims(img_array, axis=0)
    return img_array

# Путь к изображению для классификации (замени на своё)
image_path = "C:/Users/Herp/source/repos/TgStyle_LLM/dataset/deepfashion2/test_image.jpg"

# Предобработка изображения
img_array = preprocess_image(image_path)

# Предсказание
predictions = model.predict(img_array)
predicted_class = class_names[np.argmax(predictions[0])]
confidence = np.max(predictions[0]) * 100

# Вывод результата
print(f"Предсказанный класс: {predicted_class}")
print(f"Уверенность: {confidence:.2f}%")