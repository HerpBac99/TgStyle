@echo off
echo ============================================
echo     FastVLM 7B Server - Windows Launcher
echo ============================================
echo.

REM Переходим в директорию скрипта
cd /d "%~dp0"

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python не найден! Установите Python 3.8+
    echo Скачать: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [INFO] Python найден
python --version

REM Проверяем наличие основных файлов
if not exist "config7b.py" (
    echo [ERROR] Файл config7b.py не найден!
    pause
    exit /b 1
)

if not exist "server7b.py" (
    echo [ERROR] Файл server7b.py не найден!
    pause
    exit /b 1
)

if not exist "requirements7b.txt" (
    echo [ERROR] Файл requirements7b.txt не найден!
    pause
    exit /b 1
)

echo [INFO] Основные файлы найдены

REM Проверяем наличие модели
if not exist "models\llava-fastvithd_7b_stage3\llava-fastvithd_7b_stage3" (
    echo [ERROR] FastVLM 7B модель не найдена!
    echo Путь: models\llava-fastvithd_7b_stage3\llava-fastvithd_7b_stage3
    echo Скачайте модель с официального сайта Apple
    pause
    exit /b 1
)

echo [INFO] FastVLM 7B модель найдена

REM Активируем виртуальное окружение если существует
if exist "venv_7b\Scripts\activate.bat" (
    echo [INFO] Активируем виртуальное окружение venv_7b
    call venv_7b\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    echo [INFO] Активируем виртуальное окружение venv
    call venv\Scripts\activate.bat
) else (
    echo [WARN] Виртуальное окружение не найдено, используем системный Python
)

echo.
echo ============================================
echo          Запуск FastVLM 7B Server
echo ============================================
echo.
echo [INFO] Запускаю автоматическую диагностику...
echo [INFO] Ctrl+C для остановки сервера
echo.

REM Запускаем сервер
python start_7b.py

REM Если скрипт завершился с ошибкой
if errorlevel 1 (
    echo.
    echo [ERROR] Сервер завершился с ошибкой!
    echo.
    echo Возможные решения:
    echo 1. Проверьте наличие GPU с CUDA поддержкой
    echo 2. Установите зависимости: pip install -r requirements7b.txt
    echo 3. Проверьте свободную GPU память (nvidia-smi)
    echo 4. Убедитесь что порт 3002 не занят
    echo.
    pause
    exit /b 1
)

echo.
echo [INFO] Сервер остановлен
pause
