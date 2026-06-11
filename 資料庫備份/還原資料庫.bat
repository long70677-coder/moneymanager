@echo off
rem ============================================================
rem  Restore dev database (no PowerShell required)
rem  Double-click this file, or run it from cmd.
rem  Copies cash.seed.db to CashManagement\App_Data\cash.db
rem ============================================================
setlocal
set "HERE=%~dp0"
set "SEED=%HERE%cash.seed.db"
set "DEST=%HERE%..\CashManagement\App_Data"
set "TARGET=%DEST%\cash.db"

if not exist "%SEED%" (
  echo [ERROR] Seed database not found: "%SEED%"
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

if exist "%TARGET%" (
  copy /Y "%TARGET%" "%TARGET%.bak" >nul
  echo Existing cash.db backed up to cash.db.bak
)

copy /Y "%SEED%" "%TARGET%" >nul
if errorlevel 1 (
  echo [ERROR] Restore failed. The database may be locked by a running app.
  echo         Close the application and try again.
  pause
  exit /b 1
)

echo.
echo Done. Database restored to:
echo   "%TARGET%"
echo.
echo Next: run this in the CashManagement folder:
echo   dotnet run --launch-profile http
echo.
pause
