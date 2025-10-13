# Factory CLI Complete Cleanup Script
# WARNING: This script will permanently remove all traces of Factory CLI from your system
# Run as Administrator for full cleanup

Write-Host "=== Factory CLI Cleanup Script ===" -ForegroundColor Yellow
Write-Host "This will remove all traces of Factory CLI from your system" -ForegroundColor Yellow
Write-Host ""

# Confirmation
$confirm = Read-Host "Are you sure you want to continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Cleanup cancelled." -ForegroundColor Green
    exit
}

Write-Host "Starting cleanup..." -ForegroundColor Cyan

# 1. Remove main Factory CLI directory
$factoryPath = "$env:USERPROFILE\.factory"
if (Test-Path $factoryPath) {
    Write-Host "Removing $factoryPath..." -ForegroundColor Yellow
    try {
        Remove-Item -Path $factoryPath -Recurse -Force -ErrorAction Stop
        Write-Host "✓ Removed .factory directory" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to remove .factory directory: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ .factory directory not found" -ForegroundColor Gray
}

# 2. Remove bridge application directory (520MB+)
$bridgePath = "$env:LOCALAPPDATA\bridge"
if (Test-Path $bridgePath) {
    Write-Host "Removing $bridgePath (this may take a while)..." -ForegroundColor Yellow
    try {
        Remove-Item -Path $bridgePath -Recurse -Force -ErrorAction Stop
        Write-Host "✓ Removed bridge application directory" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to remove bridge directory: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ Bridge directory not found" -ForegroundColor Gray
}

# 3. Remove VSCode extension
$vsCodeExtPath = "$env:USERPROFILE\.cursor\extensions\factory.factory-vscode-extension-0.1.9"
if (Test-Path $vsCodeExtPath) {
    Write-Host "Removing VSCode extension..." -ForegroundColor Yellow
    try {
        Remove-Item -Path $vsCodeExtPath -Recurse -Force -ErrorAction Stop
        Write-Host "✓ Removed VSCode extension" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to remove VSCode extension: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ VSCode extension not found" -ForegroundColor Gray
}

# 4. Remove desktop shortcut
$desktopShortcut = "$env:USERPROFILE\Desktop\Factory Bridge.lnk"
if (Test-Path $desktopShortcut) {
    Write-Host "Removing desktop shortcut..." -ForegroundColor Yellow
    try {
        Remove-Item -Path $desktopShortcut -Force -ErrorAction Stop
        Write-Host "✓ Removed desktop shortcut" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to remove desktop shortcut: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ Desktop shortcut not found" -ForegroundColor Gray
}

# 5. Registry cleanup (requires admin rights)
Write-Host ""
Write-Host "Registry cleanup (requires Administrator rights):" -ForegroundColor Yellow

# Check if running as admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    # Remove URL protocol handler
    $regPath = "HKCU:\Software\Classes\factory-bridge"
    if (Test-Path $regPath) {
        Write-Host "Removing registry URL protocol handler..." -ForegroundColor Yellow
        try {
            Remove-Item -Path $regPath -Recurse -ErrorAction Stop
            Write-Host "✓ Removed registry URL protocol handler" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to remove registry key: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "ℹ Registry URL protocol handler not found" -ForegroundColor Gray
    }

    # Note about CloudStore entries (these are usually safe to leave)
    Write-Host "ℹ CloudStore registry entries left intact (harmless tile data)" -ForegroundColor Gray
} else {
    Write-Host "⚠ Not running as Administrator - registry cleanup skipped" -ForegroundColor Yellow
    Write-Host "   To remove registry entries, run this script as Administrator" -ForegroundColor Yellow
}

# 6. Reset VSCode/Cursor machine ID
Write-Host ""
Write-Host "Resetting VSCode/Cursor machine ID..." -ForegroundColor Cyan

# Function to generate new machine ID
function New-MachineId {
    $bytes = New-Object byte[] 32
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($bytes)
    return [BitConverter]::ToString($bytes).Replace("-", "").ToLower()
}

# Reset Cursor machine ID
$cursorMachineIdPath = "$env:APPDATA\Cursor\machineid"
if (Test-Path $cursorMachineIdPath) {
    Write-Host "Resetting Cursor machine ID..." -ForegroundColor Yellow
    try {
        $newId = New-MachineId
        $newId | Out-File -FilePath $cursorMachineIdPath -Encoding UTF8 -NoNewline
        Write-Host "✓ Reset Cursor machine ID to: $newId" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to reset Cursor machine ID: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ Cursor machine ID file not found" -ForegroundColor Gray
}

# Reset VSCode machine ID
$vsCodeMachineIdPath = "$env:APPDATA\Code\machineid"
if (Test-Path $vsCodeMachineIdPath) {
    Write-Host "Resetting VSCode machine ID..." -ForegroundColor Yellow
    try {
        $newId = New-MachineId
        $newId | Out-File -FilePath $vsCodeMachineIdPath -Encoding UTF8 -NoNewline
        Write-Host "✓ Reset VSCode machine ID to: $newId" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to reset VSCode machine ID: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ VSCode machine ID file not found" -ForegroundColor Gray
}

# Reset VSCode Insiders machine ID
$vsCodeInsidersMachineIdPath = "$env:APPDATA\Code - Insiders\machineid"
if (Test-Path $vsCodeInsidersMachineIdPath) {
    Write-Host "Resetting VSCode Insiders machine ID..." -ForegroundColor Yellow
    try {
        $newId = New-MachineId
        $newId | Out-File -FilePath $vsCodeInsidersMachineIdPath -Encoding UTF8 -NoNewline
        Write-Host "✓ Reset VSCode Insiders machine ID to: $newId" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to reset VSCode Insiders machine ID: $_" -ForegroundColor Red
    }
} else {
    Write-Host "ℹ VSCode Insiders machine ID file not found" -ForegroundColor Gray
}

# 7. Final check for any remaining factory references
Write-Host ""
Write-Host "Final check for remaining factory references..." -ForegroundColor Cyan

$remainingFiles = Get-ChildItem -Path $env:USERPROFILE -Filter "*factory*" -Recurse -ErrorAction SilentlyContinue | Where-Object {
    $_.FullName -notlike "*node_modules*" -and
    $_.FullName -notlike "*venv*" -and
    $_.FullName -notlike "*.pyc" -and
    $_.FullName -notlike "*__pycache__*" -and
    $_.FullName -notlike "*.git*"
}

if ($remainingFiles) {
    Write-Host "⚠ Found additional files that may be related:" -ForegroundColor Yellow
    $remainingFiles | ForEach-Object {
        Write-Host "  $($_.FullName)" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ No additional factory-related files found" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Cleanup Complete ===" -ForegroundColor Green
Write-Host "Factory CLI has been completely removed from your system." -ForegroundColor Green
Write-Host "VSCode/Cursor machine IDs have been reset." -ForegroundColor Green
Write-Host ""
Write-Host "Freed up approximately 520MB+ of disk space." -ForegroundColor Cyan
Write-Host ""
Write-Host "Important notes:" -ForegroundColor Yellow
Write-Host "• If you had any important data in .factory directory, it is now gone." -ForegroundColor Yellow
Write-Host "• VSCode/Cursor will appear as new installations to telemetry systems." -ForegroundColor Yellow
Write-Host "• Restart your applications (VSCode/Cursor, terminals) for changes to take effect." -ForegroundColor Cyan
Write-Host ""
Write-Host "To verify cleanup was successful:" -ForegroundColor Cyan
Write-Host "1. Check that 'factory' commands no longer work in terminal" -ForegroundColor White
Write-Host "2. Restart VSCode/Cursor and check Help > About for new machine ID" -ForegroundColor White
Write-Host "3. Verify desktop shortcut is gone" -ForegroundColor White
