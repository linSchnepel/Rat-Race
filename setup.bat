@echo off
setlocal

echo Setting up Rat Race...
echo.

:: Get the directory this .bat file lives in (rat-race/ root)
set ROOT=%~dp0
:: Remove trailing backslash
set ROOT=%ROOT:~0,-1%

:: ── Paths ──────────────────────────────────────────────────────────────────
set JOBFINDER_EXE=%ROOT%\jobfinder\jobfinder.exe
set LOGIN_EXE=%ROOT%\login\login.exe
set RESULTS_DIR=%ROOT%\data\pages
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set DESKTOP=%USERPROFILE%\Desktop

:: ── Verify exes exist ──────────────────────────────────────────────────────
if not exist "%JOBFINDER_EXE%" (
  echo ERROR: jobfinder.exe not found at %JOBFINDER_EXE%
  echo Make sure setup.bat is in the rat-race folder alongside jobfinder\ and login\
  pause
  exit /b 1
)

if not exist "%LOGIN_EXE%" (
  echo ERROR: login.exe not found at %LOGIN_EXE%
  pause
  exit /b 1
)

:: ── Create data directories if missing ────────────────────────────────────
if not exist "%RESULTS_DIR%" mkdir "%RESULTS_DIR%"
if not exist "%ROOT%\data\auth" mkdir "%ROOT%\data\auth"

:: ── Startup shortcut for jobfinder.exe ────────────────────────────────────
echo Creating startup shortcut for Job Finder...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%STARTUP_DIR%\Rat Race.lnk'); ^
   $s.TargetPath = '%JOBFINDER_EXE%'; ^
   $s.WorkingDirectory = '%ROOT%\jobfinder'; ^
   $s.Description = 'Rat Race Job Finder'; ^
   $s.Save()"

if errorlevel 1 (
  echo ERROR: Failed to create startup shortcut.
  pause
  exit /b 1
)
echo Done.

:: ── Desktop shortcut to Results folder ────────────────────────────────────
echo Creating desktop shortcut to Results folder...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%DESKTOP%\Job Results.lnk'); ^
   $s.TargetPath = '%RESULTS_DIR%'; ^
   $s.Description = 'Rat Race Job Results'; ^
   $s.Save()"

if errorlevel 1 (
  echo ERROR: Failed to create Results shortcut.
  pause
  exit /b 1
)
echo Done.

:: ── Desktop shortcut to login.exe ─────────────────────────────────────────
echo Creating desktop shortcut to Login Setup...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%DESKTOP%\Rat Race Login.lnk'); ^
   $s.TargetPath = '%LOGIN_EXE%'; ^
   $s.WorkingDirectory = '%ROOT%\login'; ^
   $s.Description = 'Rat Race Login Setup'; ^
   $s.Save()"

if errorlevel 1 (
  echo ERROR: Failed to create Login shortcut.
  pause
  exit /b 1
)
echo Done.

:: ── Done ──────────────────────────────────────────────────────────────────
echo.
echo ✓ Rat Race is set up successfully.
echo.
echo Next steps:
echo   1. Double-click "Rat Race Login" on your desktop to log in to job platforms
echo   2. Configure your search URLs in the Settings tab
echo   3. Job Finder will run automatically each time you log in to Windows
echo   4. Check "Job Results" on your desktop for daily results
echo.
pause
endlocal