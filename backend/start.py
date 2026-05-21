"""
start.py - Script de inicio para CoopTech Tulcán.
1. Genera datos si la base de datos no existe.
2. Entrena el modelo si no está entrenado.
3. Inicia el servidor FastAPI en el puerto 8000.
"""

import sys
import os

# Asegurar que el directorio backend esté en el path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from database import db_exists, get_db_path, get_table_count
from models.data_generator import generate_data
from models.risk_model import train_model, model_exists


def main():
    print("\n" + "=" * 60)
    print("  🏦 CoopTech Tulcán - Sistema de Riesgo Crediticio")
    print("  📍 Cooperativa de Ahorro y Crédito")
    print("=" * 60)

    db_path = get_db_path()

    # Paso 1: Generar datos si no existen
    if not db_exists():
        print("\n📦 Base de datos no encontrada. Generando datos sintéticos...")
        generate_data(db_path, n_socios=500)
    else:
        print(f"\n✅ Base de datos encontrada: {db_path}")
        print(f"   Socios: {get_table_count('socios')}")
        print(f"   Créditos: {get_table_count('creditos')}")
        print(f"   Pagos: {get_table_count('pagos')}")
        print(f"   Transacciones: {get_table_count('transacciones')}")

    # Paso 2: Entrenar modelo si no existe
    if not model_exists():
        print("\n🤖 Modelo no encontrado. Entrenando modelo de riesgo...")
        metrics = train_model()
        print(f"\n   ✅ Modelo entrenado con accuracy: {metrics['accuracy']:.4f}")
    else:
        from models.risk_model import get_model_info
        info = get_model_info()
        print(f"\n✅ Modelo cargado")
        print(f"   Accuracy: {info.get('accuracy', 'N/A')}")
        print(f"   Último entrenamiento: {info.get('last_trained', 'N/A')}")

    # Paso 3: Iniciar servidor
    print("\n" + "=" * 60)
    print("  🚀 Iniciando servidor FastAPI...")
    print("  📡 URL: http://localhost:8000")
    print("  📖 Docs: http://localhost:8000/docs")
    print("  🔗 CORS habilitado para: http://localhost:5173")
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
