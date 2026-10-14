@echo off
REM Cria o administrador ou redefine a senha de um usuario do BC Calibracao, no computador do servidor.
REM Use o atalho do Menu Iniciar "Redefinir senha do BC Calibracao": ele ja pede a permissao de
REM administrador. Dois cliques neste arquivo tambem funcionam (ele pede a permissao sozinho).
REM Roda o redefinir-senha.ps1 desta pasta como Administrador. Sem acentos neste arquivo: o cmd.exe
REM le os .bat na pagina de codigo do console.
setlocal
title Redefinir senha do BC Calibracao
set "BC_BAT=%~f0"

if not exist "%~dp0redefinir-senha.ps1" (
  echo Arquivo redefinir-senha.ps1 nao encontrado ao lado deste. Rode o instalador do BC Calibracao de novo.
  pause
  exit /b 1
)

fltmc >nul 2>&1
if not errorlevel 1 goto :administrador
if /i "%~1"=="elevado" (
  echo Nao foi possivel obter permissao de administrador.
  pause
  exit /b 1
)

echo Pedindo permissao de administrador...
REM Eleva o cmd.exe com o caminho entre aspas duplas: funciona com espacos e parenteses na pasta
REM (como em "C:\Program Files\...")
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$q = [char]34; Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') -ArgumentList ('/d /c ' + $q + $q + $env:BC_BAT + $q + ' elevado' + $q) -Verb RunAs"
if errorlevel 1 pause
exit /b

:administrador
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0redefinir-senha.ps1"
echo.
pause
