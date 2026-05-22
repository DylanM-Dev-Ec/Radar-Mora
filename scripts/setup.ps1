# Radar-Mora — instalación en Windows (nueva máquina)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "`n=== Radar-Mora: instalacion ===" -ForegroundColor Green

# Backend
Write-Host "`n[1/2] Backend Python..." -ForegroundColor Cyan
Set-Location "$Root\backend"
if (-not (Test-Path "venv")) {
    python -m venv venv
}
& ".\venv\Scripts\pip.exe" install -r requirements.txt
Write-Host "Backend listo. Ejecuta en otra terminal:" -ForegroundColor Yellow
Write-Host "  cd backend" -ForegroundColor White
Write-Host "  .\venv\Scripts\python.exe start.py" -ForegroundColor White
Write-Host "(La primera vez genera datos y entrena el modelo: 3-8 minutos)" -ForegroundColor DarkYellow

# Frontend
Write-Host "`n[2/2] Frontend Node..." -ForegroundColor Cyan
Set-Location "$Root\frontend"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: npm no encontrado. Instala Node.js 18+ desde https://nodejs.org" -ForegroundColor Red
    exit 1
}
npm install
Write-Host "Frontend listo. Ejecuta en otra terminal:" -ForegroundColor Yellow
Write-Host "  cd frontend" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
Write-Host "`nAbre http://localhost:5173`n" -ForegroundColor Green

Set-Location $Root
