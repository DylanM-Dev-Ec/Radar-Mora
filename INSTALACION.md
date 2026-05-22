# Instalación en otra máquina (Radar-Mora)

## Requisitos

- **Python 3.10, 3.11 o 3.12** (recomendado). Python 3.14 también funciona; `pip` elegirá versiones compatibles.
- **Node.js 18+** con `npm`
- Rama del proyecto: `feature/ui-radar-mora-cooptech` (o la que contenga la UI actualizada)

```bash
git clone https://github.com/CristopherLomas/Radar-Mora.git
cd Radar-Mora
git checkout feature/ui-radar-mora-cooptech
```

## Instalación automática

**Windows (PowerShell):**

```powershell
.\scripts\setup.ps1
```

**Mac / Linux:**

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

## Arranque (2 terminales)

### Terminal 1 — Backend (obligatorio primero)

```bash
cd backend
# Windows:
.\venv\Scripts\activate
python start.py

# Mac/Linux:
source venv/bin/activate
python start.py
```

**Importante:** La primera vez crea `backend/data/cooptech.db` y entrena el modelo. Puede tardar **3 a 8 minutos**. Espera ver:

```text
Uvicorn running on http://0.0.0.0:8000
```

### Terminal 2 — Frontend

```bash
cd frontend
npm install   # solo la primera vez
npm run dev
```

Abre: **http://localhost:5173**

## Problemas frecuentes

| Síntoma | Causa | Solución |
|--------|--------|----------|
| Pantalla en blanco o “Cargando…” infinito | Backend no está corriendo | Ejecutar `python start.py` en `backend/` |
| Error al `pip install` (pandas/numpy) | Python muy nuevo o sin compilador | Usar Python 3.11 o 3.12 |
| `npm` no reconocido | Node no instalado | Instalar Node.js LTS |
| Logo sin imagen | Falta archivo | Debe existir `frontend/public/images/coop-tulcan-logo.png` en el repo |
| Error emojis en consola Windows | Codificación | Ya corregido en `start.py`; usa terminal actualizada |

## Qué NO va en Git

Por diseño (`.gitignore`):

- `backend/data/` — base de datos y modelo (se generan con `start.py`)
- `backend/venv/`, `frontend/node_modules/`

Cada máquina debe ejecutar `start.py` al menos una vez.

## Verificar que el API responde

Con el backend activo: http://localhost:8000/health  
Debe mostrar: `"status": "ok"`
