# Inicia backend + comprueba tablas y API de estadisticas extendidas
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

$env:PYTHONIOENCODING = "utf-8"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "=== CoopTech: inicio de tablas y servicios ===" -ForegroundColor Cyan

Set-Location $backend
$py = Join-Path $backend "venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Write-Host "Creando entorno virtual..." -ForegroundColor Yellow
  python -m venv venv
  & $py -m pip install -r requirements.txt -q
}

Write-Host "`n[1/3] Verificando base de datos..." -ForegroundColor Green
& $py -c @"
import sys, os
sys.path.insert(0, os.getcwd())
from database import db_exists, get_table_count, execute_query_one
if not db_exists():
    from models.data_generator import generate_data
    from database import get_db_path
    print('Generando datos sinteticos...')
    generate_data(get_db_path(), n_socios=500)
for t in ('socios','creditos','pagos','transacciones'):
    print(f'  {t}:', get_table_count(t))
row = execute_query_one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dataset_maestro'")
print('  dataset_maestro:', 'si' if row else 'no (usa estadisticas sinteticas)')
"@

Write-Host "`n[2/3] Probando API extendida..." -ForegroundColor Green
& $py -c @"
import sys, os
sys.path.insert(0, os.getcwd())
from routes.dashboard_extended_synthetic import get_extended_stats_synthetic
d = get_extended_stats_synthetic()
print('  mora_por_tipo:', len(d.get('mora_por_tipo', [])))
print('  mora_por_actividad:', len(d.get('mora_por_actividad', [])))
print('  OK - datos listos para el frontend')
"@

Write-Host "`n[3/3] Iniciando servidor API en http://localhost:8000" -ForegroundColor Green
Write-Host "    (En otra terminal: cd frontend; npm run dev)" -ForegroundColor DarkGray
Write-Host "    Panel: http://localhost:5173`n" -ForegroundColor DarkGray

& $py start.py
