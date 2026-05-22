#!/usr/bin/env bash
# Radar-Mora — instalación en Mac/Linux (nueva máquina)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "=== Radar-Mora: instalación ==="

echo ""
echo "[1/2] Backend Python..."
cd "$ROOT/backend"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "Backend listo. En otra terminal:"
echo "  cd backend && source venv/bin/activate && python start.py"
echo "(La primera vez genera datos y entrena el modelo: 3-8 minutos)"

echo ""
echo "[2/2] Frontend Node..."
cd "$ROOT/frontend"
npm install
echo "Frontend listo. En otra terminal:"
echo "  cd frontend && npm run dev"
echo ""
echo "Abre http://localhost:5173"
echo ""
