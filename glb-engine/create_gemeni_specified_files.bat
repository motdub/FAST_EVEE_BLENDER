@echo off
SETLOCAL EnableDelayedExpansion
echo ===================================================
echo   SCAFFOLDING ANIME GLTF VIEWER PROJECT STRUCTURE  
echo ===================================================

:: Define root directory name
SET "ROOT_DIR=three-gltf-viewer"

:: Create Directories
echo Creating directories...
mkdir "%ROOT_DIR%"
mkdir "%ROOT_DIR%\assets"
mkdir "%ROOT_DIR%\assets\environment"
mkdir "%ROOT_DIR%\src"
mkdir "%ROOT_DIR%\src\components"

:: Create Empty Root Files
echo Creating root configuration files...
type nul > "%ROOT_DIR%\index.html"
type nul > "%ROOT_DIR%\package.json"
type nul > "%ROOT_DIR%\webpack.config.js"

:: Create Asset Files
echo Creating asset files...
type nul > "%ROOT_DIR%\assets\styles.css"

:: Create Source Code Files
echo Creating core engine source files...
type nul > "%ROOT_DIR%\src\app.js"
type nul > "%ROOT_DIR%\src\viewer.js"
type nul > "%ROOT_DIR%\src\validator.js"

:: Create a dummy file in components just to populate it
type nul > "%ROOT_DIR%\src\components\.gitkeep"

echo ---------------------------------------------------
echo Done! Project scaffolded successfully.
echo Project Folder: %CD%\%ROOT_DIR%
echo ---------------------------------------------------
pause