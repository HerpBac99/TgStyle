"""
Ядро FastVLM сервера

Содержит модули для:
- Инициализации компонентов сервера
- Настройки логирования
- Загрузки моделей и сервисов
"""

from .initialization import ServerInitializer

__all__ = ['ServerInitializer']
