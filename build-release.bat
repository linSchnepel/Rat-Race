@echo off
echo Building Rat Race release...

:: Compile TypeScript
call npx tsc
if errorlevel 1 (
  echo TypeScript compilation failed.
  exit /b 1
)

:: Build both apps
call npx electron-builder --config electron-builder.jobfinder.yml
call npx electron-builder --config electron-builder.login.yml

:: Assemble release folder
set OUT=release\rat-race
if exist %OUT% rmdir /s /q %OUT%
mkdir %OUT%\data\auth
mkdir %OUT%\data\pages

:: Copy browsers (shared between both)
xcopy /e /i /q "release\jobfinder\win-unpacked\resources\browsers" "%OUT%\browsers"

xcopy /e /i /q "release\jobfinder\win-unpacked" "%OUT%\jobfinder"
xcopy /e /i /q "release\login\win-unpacked" "%OUT%\login"

rename "%OUT%\jobfinder\Rat Race.exe" "jobfinder.exe"
rename "%OUT%\login\Rat Race Login.exe" "login.exe"

:: Seed empty data files
echo {"rules":[]} > "%OUT%\data\alerts.json"
echo {"skills":[]} > "%OUT%\data\skills.json"
echo {"companies":[],"patterns":[]} > "%OUT%\data\blacklist.json"

:: Copy setup.bat
copy setup.bat "%OUT%\setup.bat"

echo Done. Folder: release\rat-race