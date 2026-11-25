@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 servidor.py
  goto fin
)
where python >nul 2>nul
if %errorlevel%==0 (
  python servidor.py
  goto fin
)
echo No se encontro Python. Instalalo desde python.org o pide a TI que lo habilite.
:fin
pause
