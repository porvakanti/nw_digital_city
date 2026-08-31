@echo off
rem The Windows way in. Double-click this file, or run it from a terminal.
rem run.sh is the same thing for macOS and Linux; Windows has no idea what a
rem .sh file is and will hand it to a text editor or a browser.
setlocal
cd /d "%~dp0"

rem The Python launcher first, because it is what a python.org install puts on
rem PATH. Plain "python" on a machine without Python is an App Execution Alias
rem that prints a Microsoft Store advert and exits non-zero, so it fails this
rem test rather than passing it.
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"

if not defined PY goto :nopython

%PY% run.py %*
if errorlevel 1 pause
goto :eof

:nopython
echo.
echo   Python is not installed on this machine.
echo.
echo   You only need it to run the agent with a model behind it. Everything
echo   else works without it: open renderer\index.html in Chrome and the whole
echo   city, the tour and the agent's own rules all run.
echo.
echo   To install it, either:
echo.
echo     winget install Python.Python.3.12
echo.
echo   or download it from https://www.python.org/downloads/ and tick
echo   "Add python.exe to PATH" on the first screen of the installer.
echo.
echo   Then run this file again.
echo.
pause
