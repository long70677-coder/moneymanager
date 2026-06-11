# 還原開發用資料庫
# 用途：clone 專案後，將備份的 SQLite 種子資料庫還原到 App_Data，即可直接執行系統。
# 用法：在本資料夾按右鍵以 PowerShell 執行，或於終端機執行：
#   pwsh -ExecutionPolicy Bypass -File .\還原資料庫.ps1
# 加 -Force 可在不詢問的情況下覆蓋現有資料庫。

param([switch]$Force)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir
$seed      = Join-Path $scriptDir 'cash.seed.db'
$appData   = Join-Path $repoRoot 'CashManagement\App_Data'
$target    = Join-Path $appData 'cash.db'

if (-not (Test-Path $seed)) { throw "找不到種子資料庫：$seed" }

New-Item -ItemType Directory -Force $appData | Out-Null

if ((Test-Path $target) -and -not $Force) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$target.bak-$stamp"
    Copy-Item $target $backup -Force
    Write-Host "已存在 cash.db，先備份為：$backup" -ForegroundColor Yellow
}

try {
    Copy-Item $seed $target -Force
} catch {
    throw "還原失敗（資料庫可能正被執行中的系統鎖定，請先關閉應用程式再試）：$($_.Exception.Message)"
}

Write-Host "資料庫已還原至：$target" -ForegroundColor Green
Write-Host "現在可於 CashManagement 目錄執行：dotnet run --launch-profile http"
