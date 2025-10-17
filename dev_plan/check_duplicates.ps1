# Скрипт для поиска потенциальных дублирующихся вызовов и событий

Write-Host "=== ПРОВЕРКА ДУБЛЕЙ В КОДЕ ===" -ForegroundColor Cyan
Write-Host ""

$clientPath = "C:\Users\Herp\source\repos\TgStyle\client\src"

# 1. Карта событий
Write-Host "1. КАРТА СОБЫТИЙ:" -ForegroundColor Yellow
Write-Host "   События которые генерируются:" -ForegroundColor Gray

$events = @{}
Get-ChildItem -Path $clientPath -Filter "*.ts" -Recurse | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match "new CustomEvent\('([^']+)'") {
        $eventName = $matches[1]
        $file = $_.Name
        if (-not $events.ContainsKey($eventName)) {
            $events[$eventName] = @{
                "Generates" = @()
                "Listens" = @()
            }
        }
        $events[$eventName]["Generates"] += $file
    }
    if ($content -match "addEventListener\('([^']+)'") {
        $eventName = $matches[1]
        $file = $_.Name
        if (-not $events.ContainsKey($eventName)) {
            $events[$eventName] = @{
                "Generates" = @()
                "Listens" = @()
            }
        }
        $events[$eventName]["Listens"] += $file
    }
}

foreach ($event in $events.Keys) {
    Write-Host "   - $event" -ForegroundColor White
    Write-Host "     Генерируется: $($events[$event]['Generates'] -join ', ')" -ForegroundColor Green
    Write-Host "     Слушается:    $($events[$event]['Listens'] -join ', ')" -ForegroundColor Cyan
}
Write-Host ""

# 2. Проверка addEventListener vs removeEventListener
Write-Host "2. БАЛАНС ОБРАБОТЧИКОВ:" -ForegroundColor Yellow
$addListeners = (Get-ChildItem -Path $clientPath -Filter "*.ts" -Recurse | Select-String -Pattern "addEventListener" | Measure-Object).Count
$removeListeners = (Get-ChildItem -Path $clientPath -Filter "*.ts" -Recurse | Select-String -Pattern "removeEventListener" | Measure-Object).Count
Write-Host "   addEventListener:    $addListeners" -ForegroundColor White
Write-Host "   removeEventListener: $removeListeners" -ForegroundColor White
if ($addListeners -gt ($removeListeners * 3)) {
    Write-Host "   ⚠️  ПРЕДУПРЕЖДЕНИЕ: Много addEventListener без removeEventListener - возможны утечки!" -ForegroundColor Red
} else {
    Write-Host "   ✓ Баланс нормальный (но проверь setup* методы)" -ForegroundColor Green
}
Write-Host ""

# 3. Методы которые могут дублироваться
Write-Host "3. ПОТЕНЦИАЛЬНЫЕ ДУБЛИ (методы вызываемые из нескольких мест):" -ForegroundColor Yellow
$criticalMethods = @(
    "showFullscreenPreview",
    "showAnalysisResult",
    "createThemeCards",
    "setupResultButtons",
    "closePreview"
)

foreach ($method in $criticalMethods) {
    $calls = Get-ChildItem -Path $clientPath -Filter "*.ts" -Recurse | Select-String -Pattern "$method\(" | Select-Object -ExpandProperty Path | Get-Unique
    $count = ($calls | Measure-Object).Count
    if ($count -gt 2) {
        Write-Host "   ⚠️  $method вызывается из $count файлов - проверь на дубли!" -ForegroundColor Red
        $calls | ForEach-Object {
            $file = Split-Path $_ -Leaf
            Write-Host "      - $file" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ✓ $method: $count места" -ForegroundColor Green
    }
}
Write-Host ""

# 4. Методы setup* без очистки
Write-Host "4. МЕТОДЫ SETUP БЕЗ ОЧИСТКИ:" -ForegroundColor Yellow
Get-ChildItem -Path $clientPath -Filter "*.ts" -Recurse | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $file = $_.Name
    
    # Ищем методы setup*
    if ($content -match "(?s)(private|public)?\s+setup\w+\([^)]*\)[^{]*\{[^}]+\}") {
        $setupMethods = [regex]::Matches($content, "(?s)(private|public)?\s+(setup\w+)\([^)]*\)[^{]*\{([^}]+)\}")
        foreach ($match in $setupMethods) {
            $methodName = $match.Groups[2].Value
            $methodBody = $match.Groups[3].Value
            
            # Проверяем есть ли addEventListener без cloneNode/removeEventListener
            if ($methodBody -match "addEventListener" -and 
                $methodBody -notmatch "removeEventListener" -and 
                $methodBody -notmatch "cloneNode") {
                Write-Host "   ⚠️  $file::$methodName - addEventListener без очистки!" -ForegroundColor Red
            }
        }
    }
}
Write-Host ""

Write-Host "=== ПРОВЕРКА ЗАВЕРШЕНА ===" -ForegroundColor Cyan
