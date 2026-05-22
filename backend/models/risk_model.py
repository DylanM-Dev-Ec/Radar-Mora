"""
risk_model.py - Modelo de Random Forest para predicción de riesgo crediticio.
CoopTech Tulcán - Sistema de Perfilamiento de Riesgo.
"""

import os
import sqlite3
import threading
import numpy as np
import pandas as pd
import joblib
import time
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# In-memory predictions cache
_PREDICTIONS_CACHE = None
_CACHE_TIMESTAMP = 0.0
CACHE_DURATION = 300.0  # 5 minutes cache duration

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "cooptech.db")
MODEL_PATH = os.path.join(BASE_DIR, "data", "risk_model.joblib")
METADATA_PATH = os.path.join(BASE_DIR, "data", "model_metadata.joblib")

# Feature descriptions in Spanish
FEATURE_DESCRIPTIONS = {
    "saldo_disponible": "Saldo disponible en cuenta de ahorros",
    "num_transacciones": "Numero de transacciones en el mes",
    "volumen_total": "Volumen total transaccionado en el mes",
    "cambio_saldo_ahorro": "Variacion mensual del saldo de ahorros",
    "alerta_retiro_ahorros": "Alerta por retiro inusual de ahorros",
    "alerta_caida_actividad": "Alerta por caida de actividad transaccional",
    "alerta_critica_ia": "Alerta critica de comportamiento financiero",
    "ingresos_socio": "Ingresos mensuales del socio",
    "egresos_socio": "Egresos mensuales del socio",
    "ratio_ingreso_egreso": "Proporcion de ingresos vs egresos",
    "nro_cargas_fam": "Numero de cargas familiares",
    "nro_creditos": "Numero de operaciones de credito previas"
}

FEATURE_NAMES = list(FEATURE_DESCRIPTIONS.keys())

_predict_all_cache: list[dict] | None = None
_predict_all_cache_stamp: tuple[float, float] | None = None
_predict_all_lock = threading.Lock()


def _current_predict_all_stamp() -> tuple[float, float]:
    model_mtime = os.path.getmtime(MODEL_PATH) if os.path.exists(MODEL_PATH) else 0.0
    db_mtime = os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else 0.0
    return (model_mtime, db_mtime)


def _invalidate_predict_all_cache() -> None:
    global _predict_all_cache, _predict_all_cache_stamp
    _predict_all_cache = None
    _predict_all_cache_stamp = None


def _get_connection():
    """Obtiene conexión a la base de datos."""
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def compute_features(socio_id: int = None) -> pd.DataFrame:
    """
    Recupera las features de riesgo reales desde 'dataset_maestro' en SQLite,
    agrupadas por cliente (socio_id) para garantizar la unicidad de registros.
    """
    conn = _get_connection()
    
    if socio_id:
        query = """
            SELECT 
                cliente as socio_id,
                MAX(saldo_disponible) as saldo_disponible,
                MAX(num_transacciones) as num_transacciones,
                MAX(volumen_total) as volumen_total,
                MAX(cambio_saldo_ahorro) as cambio_saldo_ahorro,
                MAX(alerta_retiro_ahorros) as alerta_retiro_ahorros,
                MAX(alerta_caida_actividad) as alerta_caida_actividad,
                MAX(alerta_critica_ia) as alerta_critica_ia,
                MAX(ingresos_socio) as ingresos_socio,
                MAX(egresos_socio) as egresos_socio,
                MAX(nro_cargas_fam) as nro_cargas_fam,
                COUNT(nro_operacion) as nro_creditos
            FROM dataset_maestro
            WHERE cliente = ?
            GROUP BY cliente
        """
        df = pd.read_sql_query(query, conn, params=(socio_id,))
    else:
        query = """
            SELECT 
                cliente as socio_id,
                MAX(saldo_disponible) as saldo_disponible,
                MAX(num_transacciones) as num_transacciones,
                MAX(volumen_total) as volumen_total,
                MAX(cambio_saldo_ahorro) as cambio_saldo_ahorro,
                MAX(alerta_retiro_ahorros) as alerta_retiro_ahorros,
                MAX(alerta_caida_actividad) as alerta_caida_actividad,
                MAX(alerta_critica_ia) as alerta_critica_ia,
                MAX(ingresos_socio) as ingresos_socio,
                MAX(egresos_socio) as egresos_socio,
                MAX(nro_cargas_fam) as nro_cargas_fam,
                COUNT(nro_operacion) as nro_creditos
            FROM dataset_maestro
            GROUP BY cliente
        """
        df = pd.read_sql_query(query, conn)
        
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    # Reemplazar NaN en columnas
    df = df.fillna(0.0)
        
    # Calcular feature de ingenieria adicional
    df["ratio_ingreso_egreso"] = round(df["ingresos_socio"] / np.clip(df["egresos_socio"], 1.0, None), 4)
    
    # Asegurar el orden de las columnas de feature
    columns_ordered = ["socio_id"] + FEATURE_NAMES
    return df[columns_ordered]


def _assign_risk_labels(features_df: pd.DataFrame) -> pd.Series:
    """
    Asigna etiquetas de riesgo basadas en el comportamiento real del socio.
    """
    conn = _get_connection()
    # Obtener dias_mora máximo de dataset_maestro agrupado por cliente
    dias_mora_df = pd.read_sql_query("""
        SELECT cliente as socio_id, MAX(dias_mora) as dias_mora, MAX(es_moroso) as es_moroso 
        FROM dataset_maestro 
        GROUP BY cliente
    """, conn)
    conn.close()
    
    # Cruzar con features
    mora_map = dias_mora_df.set_index("socio_id").to_dict(orient="index")
    
    labels = []
    for _, row in features_df.iterrows():
        sid = row["socio_id"]
        mora_info = mora_map.get(sid, {"dias_mora": 0, "es_moroso": 0})
        dias_mora = mora_info["dias_mora"]
        
        score = 0
        
        # 1. Dias de mora (factor directo)
        if dias_mora > 90:
            score += 35
        elif dias_mora > 60:
            score += 25
        elif dias_mora > 30:
            score += 15
        elif dias_mora > 0:
            score += 8
            
        # 2. Alertas de comportamiento
        if row["alerta_critica_ia"] == 1:
            score += 25
        if row["alerta_retiro_ahorros"] == 1:
            score += 12
        if row["alerta_caida_actividad"] == 1:
            score += 12
            
        # 3. Saldo disponible en cuenta de ahorros (bajo saldo = mas riesgo)
        saldo = row["saldo_disponible"]
        if saldo < 10.0:
            score += 8
        elif saldo < 50.0:
            score += 4
            
        # 4. Proporción de ingresos vs egresos
        ratio = row["ratio_ingreso_egreso"]
        if ratio < 0.9:
            score += 8
        elif ratio < 1.1:
            score += 4
            
        # Clasificar con umbrales calibrados
        if score >= 63:
            labels.append("Crítico")
        elif score >= 57:
            labels.append("Alto")
        elif score >= 43:
            labels.append("Medio")
        else:
            labels.append("Bajo")
            
    return pd.Series(labels)


def _compute_risk_score(features_row: dict, model, feature_names: list) -> float:
    """
    Calcula un score de riesgo continuo 0-100 basado en probabilidades del modelo.
    """
    X = np.array([[features_row[f] for f in feature_names]])
    probas = model.predict_proba(X)[0]
    classes = model.classes_

    # Mapear a scores: Bajo=10, Medio=40, Alto=70, Crítico=95
    class_scores = {"Bajo": 10, "Medio": 40, "Alto": 70, "Crítico": 95}

    score = 0
    for cls, prob in zip(classes, probas):
        score += class_scores.get(cls, 50) * prob

    return round(min(100, max(0, score)), 1)


def train_model() -> dict:
    """
    Entrena el modelo de Random Forest y lo guarda en disco.
    """
    global _PREDICTIONS_CACHE
    _PREDICTIONS_CACHE = None
    
    print("=" * 60)
    print("  [ML] Entrenamiento del Modelo de Riesgo Crediticio")
    print("=" * 60)

    # Calcular features
    print("\n[ML] Calculando features para todos los socios...")
    features_df = compute_features()
    print(f"   OK. Features calculadas para {len(features_df)} socios")

    if features_df.empty:
        raise ValueError("No hay datos suficientes para entrenar el modelo")

    # Asignar labels
    print("[ML] Asignando etiquetas de riesgo...")
    labels = _assign_risk_labels(features_df)
    features_df["risk_label"] = labels

    # Verificar distribución
    label_counts = labels.value_counts()
    print("   Distribucion de riesgo:")
    for level, count in label_counts.items():
        print(f"      - {level}: {count} ({count/len(labels)*100:.1f}%)")

    # Preparar datos
    X = features_df[FEATURE_NAMES].values
    y = labels.values

    # Manejar NaN e infinitos
    X = np.nan_to_num(X, nan=0.0, posinf=100.0, neginf=-100.0)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Entrenar modelo
    print("\n[ML] Entrenando Random Forest...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # Evaluar
    y_pred = model.predict(X_test)

    metrics = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "precision": round(precision_score(y_test, y_pred, average="weighted", zero_division=0), 4),
        "recall": round(recall_score(y_test, y_pred, average="weighted", zero_division=0), 4),
        "f1_score": round(f1_score(y_test, y_pred, average="weighted", zero_division=0), 4),
        "total_predictions": len(features_df),
        "last_trained": datetime.now().isoformat(),
    }

    print(f"\n[ML] Metricas del modelo:")
    print(f"   Accuracy:  {metrics['accuracy']:.4f}")
    print(f"   Precision: {metrics['precision']:.4f}")
    print(f"   Recall:    {metrics['recall']:.4f}")
    print(f"   F1 Score:  {metrics['f1_score']:.4f}")

    # Feature importance
    importances = model.feature_importances_
    importance_ranking = sorted(
        zip(FEATURE_NAMES, importances),
        key=lambda x: x[1],
        reverse=True
    )
    print(f"\n[ML] Importancia de Features:")
    for fname, imp in importance_ranking:
        bar = "=" * int(imp * 50)
        print(f"   {fname:25s} {imp:.4f} {bar}")

    # Guardar modelo y metadata
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump({
        "metrics": metrics,
        "feature_names": FEATURE_NAMES,
        "feature_importance": importance_ranking,
    }, METADATA_PATH)

    print(f"\n   OK. Modelo guardado en: {MODEL_PATH}")
    print("=" * 60)

    _invalidate_predict_all_cache()
    return metrics


def _load_model():
    """Carga el modelo entrenado."""
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError("Modelo no encontrado. Ejecute train_model() primero.")
    return joblib.load(MODEL_PATH)


def _load_metadata() -> dict:
    """Carga los metadatos del modelo."""
    if not os.path.exists(METADATA_PATH):
        return {}
    return joblib.load(METADATA_PATH)


def predict_risk(socio_id: int) -> dict:
    """
    Predice el riesgo para un socio específico.
    """
    model = _load_model()
    features_df = compute_features(socio_id)

    if features_df.empty:
        return {
            "risk_score": 0,
            "risk_level": "Sin datos",
            "feature_values": {},
            "factors": []
        }

    row = features_df.iloc[0]
    feature_values = {f: float(row[f]) for f in FEATURE_NAMES}

    # Reemplazar NaN
    for k in feature_values:
        if np.isnan(feature_values[k]) or np.isinf(feature_values[k]):
            feature_values[k] = 0.0

    # Predicción
    X = np.array([[feature_values[f] for f in FEATURE_NAMES]])
    X = np.nan_to_num(X, nan=0.0, posinf=100.0, neginf=-100.0)
    risk_level = model.predict(X)[0]
    risk_score = _compute_risk_score(feature_values, model, FEATURE_NAMES)

    # Calcular factores de impacto
    importances = dict(zip(FEATURE_NAMES, model.feature_importances_))
    factors = []
    for fname in FEATURE_NAMES:
        value = feature_values[fname]
        importance = importances[fname]

        # Determinar impacto cualitativo
        if fname == "alerta_critica_ia":
            impact = "negativo" if value == 1 else "positivo"
        elif fname == "alerta_retiro_ahorros":
            impact = "negativo" if value == 1 else "positivo"
        elif fname == "alerta_caida_actividad":
            impact = "negativo" if value == 1 else "positivo"
        elif fname == "saldo_disponible":
            impact = "positivo" if value > 100 else ("negativo" if value < 10 else "neutral")
        elif fname == "ratio_ingreso_egreso":
            impact = "positivo" if value >= 1.2 else ("negativo" if value < 0.9 else "neutral")
        elif fname == "num_transacciones":
            impact = "positivo" if value > 5 else "neutral"
        else:
            impact = "neutral"

        factors.append({
            "name": fname,
            "value": round(value, 4),
            "impact": impact,
            "importance": round(importance, 4),
            "description": FEATURE_DESCRIPTIONS.get(fname, fname),
        })

    # Ordenar por importancia
    factors.sort(key=lambda x: x["importance"], reverse=True)

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "feature_values": feature_values,
        "factors": factors,
    }


def predict_all() -> list[dict]:
    """
    Predice el riesgo para todos los socios con créditos activos.
    Resultados en caché en memoria para evitar recalcular en cada request.
    
    Returns:
        Lista de dicts con socio_id, risk_score, risk_level.
    """
    global _predict_all_cache, _predict_all_cache_stamp

    cache_key = _current_predict_all_stamp()
    if _predict_all_cache is not None and _predict_all_cache_stamp == cache_key:
        return _predict_all_cache

    with _predict_all_lock:
        if _predict_all_cache is not None and _predict_all_cache_stamp == cache_key:
            return _predict_all_cache

        model = _load_model()
        features_df = compute_features()

        if features_df.empty:
            _predict_all_cache = []
            _predict_all_cache_stamp = cache_key
            return []

        # 1. Preparar matriz X completa de forma vectorial
        X = features_df[FEATURE_NAMES].astype(float).values
        X = np.nan_to_num(X, nan=0.0, posinf=100.0, neginf=-100.0)

        # 2. Predecir todo en una sola llamada matricial
        risk_levels = model.predict(X)
        probas_all = model.predict_proba(X)
        classes = model.classes_

        # Mapear a scores: Bajo=10, Medio=40, Alto=70, Crítico=95
        class_scores = {"Bajo": 10, "Medio": 40, "Alto": 70, "Crítico": 95}
        class_weights = np.array([class_scores.get(cls, 50) for cls in classes])

        # Producto matricial (dot product) para obtener todos los scores instantáneamente
        risk_scores = probas_all.dot(class_weights)
        risk_scores = np.clip(risk_scores, 0, 100).round(1)

        # 3. Construir lista de resultados final de forma directa
        results = [
            {
                "socio_id": int(sid),
                "risk_score": float(score),
                "risk_level": level,
            }
            for sid, score, level in zip(
                features_df["socio_id"].values,
                risk_scores,
                risk_levels,
            )
        ]

        _predict_all_cache = results
        _predict_all_cache_stamp = cache_key
        return results


def get_feature_importance() -> list[dict]:
    """
    Retorna el ranking de importancia de features.
    """
    metadata = _load_metadata()
    if not metadata or "feature_importance" not in metadata:
        # Calcular desde el modelo
        model = _load_model()
        importances = model.feature_importances_
        ranking = sorted(
            zip(FEATURE_NAMES, importances),
            key=lambda x: x[1],
            reverse=True
        )
    else:
        ranking = metadata["feature_importance"]

    return [
        {
            "feature": fname,
            "importance": round(imp, 4),
            "description": FEATURE_DESCRIPTIONS.get(fname, fname),
        }
        for fname, imp in ranking
    ]


def get_model_info() -> dict:
    """Retorna información y métricas del modelo."""
    metadata = _load_metadata()
    if metadata and "metrics" in metadata:
        return metadata["metrics"]
    return {
        "accuracy": 0,
        "precision": 0,
        "recall": 0,
        "f1_score": 0,
        "total_predictions": 0,
        "last_trained": None,
    }


def model_exists() -> bool:
    """Verifica si el modelo entrenado existe."""
    return os.path.exists(MODEL_PATH)


if __name__ == "__main__":
    metrics = train_model()
    print("\n\nProbando prediccion individual...")
    if len(predict_all()) > 0:
        first_id = predict_all()[0]["socio_id"]
        result = predict_risk(first_id)
        print(f"Socio {first_id}: Score={result['risk_score']}, Level={result['risk_level']}")
