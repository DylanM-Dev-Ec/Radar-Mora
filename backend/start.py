"""
start.py - Script de inicio para CoopTech Tulcán.
1. Genera datos si la base de datos no existe.
2. Entrena el modelo si no está entrenado.
3. Inicia el servidor FastAPI en el puerto 8000.
"""

import sys
import os

# Consola Windows: evitar crash por emojis (UnicodeEncodeError)
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
# Fallback si la consola sigue en cp1252
_ASCII_MODE = False
try:
    "🏦".encode(sys.stdout.encoding or "utf-8")
except (UnicodeEncodeError, AttributeError):
    _ASCII_MODE = True

# Asegurar que el directorio backend esté en el path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from database import (
    db_exists,
    get_db_path,
    get_table_count,
    normalizar_dias_atraso_en_db,
    normalizar_ventana_preventiva_en_db,
)
from models.data_generator import generate_data
from models.risk_model import train_model, model_exists


def _out(msg: str) -> None:
    print(msg.encode("ascii", "replace").decode("ascii") if _ASCII_MODE else msg)


def main():
    print("\n" + "=" * 60)
    _out("  CoopTech Tulcan - Sistema de Riesgo Crediticio")
    _out("  Cooperativa de Ahorro y Credito")
    print("=" * 60)

    db_path = get_db_path()

    # Paso 1: Generar datos si no existen
    if not db_exists():
        _out("\n[DB] Base de datos no encontrada. Generando datos sinteticos...")
        generate_data(db_path, n_socios=500)
    else:
        _out(f"\n[OK] Base de datos encontrada: {db_path}")
        print(f"   Socios: {get_table_count('socios')}")
        print(f"   Créditos: {get_table_count('creditos')}")
        print(f"   Pagos: {get_table_count('pagos')}")
        print(f"   Transacciones: {get_table_count('transacciones')}")
        capped = normalizar_dias_atraso_en_db()
        if capped:
            _out(f"\n[DB] Dias de atraso normalizados (tope 100): {capped} pagos actualizados")
        ventana = normalizar_ventana_preventiva_en_db()
        if ventana:
            _out(f"\n[DB] Ventana preventiva (3-15 dias): {ventana} proximas cuotas ajustadas")
            try:
                from models.preventive_cache import invalidate_preventive_cache
                invalidate_preventive_cache()
            except Exception:
                pass

    # Paso 1b: Importar dataset maestro real si existe el CSV
    csv_path = os.path.join(os.path.dirname(backend_dir), "dataset_maestro_dashboard.csv")
    if os.path.exists(csv_path):
        from database import execute_query_one, DB_URL
        if DB_URL:
            has_maestro = execute_query_one(
                "SELECT 1 as ok FROM information_schema.tables WHERE table_name='dataset_maestro'"
            )
        else:
            has_maestro = execute_query_one(
                "SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name='dataset_maestro'"
            )
        if not has_maestro:
            _out("\n[CSV] Dataset de produccion detectado. Importando dataset maestro...")
            try:
                from import_real_data import main as import_maestro
                import_maestro()
            except Exception as e:
                _out(f"   [WARN] No se pudo importar dataset maestro: {e}")

    # Paso 2: Entrenar modelo si no existe
    if not model_exists():
        _out("\n[AI] Modelo no encontrado. Entrenando modelo de riesgo...")
        metrics = train_model()
        _out(f"\n   [OK] Modelo entrenado con accuracy: {metrics['accuracy']:.4f}")
    else:
        from models.risk_model import get_model_info
        info = get_model_info()
        _out("\n[OK] Modelo cargado")
        print(f"   Accuracy: {info.get('accuracy', 'N/A')}")
        print(f"   Ultimo entrenamiento: {info.get('last_trained', 'N/A')}")

    # Paso 3: Precalentar caché de predicciones (evita carga lenta en el primer request)
    if model_exists():
        _out("\n[Cache] Precalentando predicciones de riesgo...")
        from models.risk_model import predict_all
        risks = predict_all()
        _out(f"   [OK] {len(risks)} socios listos en cache")

    # Paso 4: Iniciar servidor
    print("\n" + "=" * 60)
    _out("  [Server] Iniciando servidor FastAPI...")
    _out("  URL: http://localhost:8000")
    _out("  Docs: http://localhost:8000/docs")
    _out("  CORS: http://localhost:5173")
    print("=" * 60 + "\n")

    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
