"""
risk_model.py - Modelo de Random Forest para predicción de riesgo crediticio.
CoopTech Tulcán - Sistema de Perfilamiento de Riesgo.
"""

import os
import sqlite3
import numpy as np
import pandas as pd
import joblib
from datetime import datetime
from dateutil.relativedelta import relativedelta
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.preprocessing import LabelEncoder

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "cooptech.db")
MODEL_PATH = os.path.join(BASE_DIR, "data", "risk_model.joblib")
METADATA_PATH = os.path.join(BASE_DIR, "data", "model_metadata.joblib")

# Feature descriptions in Spanish
FEATURE_DESCRIPTIONS = {
    "ratio_pagos_puntuales": "Porcentaje de pagos realizados a tiempo",
    "promedio_dias_atraso": "Promedio de días de atraso en los últimos 6 meses",
    "tendencia_atraso": "Tendencia de atraso en el tiempo (positivo = empeorando)",
    "ratio_monto_pagado": "Porcentaje del monto esperado efectivamente pagado",
    "frecuencia_depositos": "Número promedio de depósitos mensuales",
    "frecuencia_retiros": "Número promedio de retiros mensuales",
    "ratio_retiros_depositos": "Proporción entre retiros y depósitos",
    "tendencia_saldo": "Tendencia del saldo en el tiempo (negativo = disminuyendo)",
    "variabilidad_ingresos": "Variabilidad (desviación estándar) de los depósitos",
    "antiguedad_meses": "Antigüedad como socio en meses",
    "num_creditos_previos": "Número de créditos anteriores",
    "monto_credito_actual": "Monto total de créditos vigentes",
    "ratio_cuota_ingreso": "Proporción entre cuota mensual e ingreso estimado",
}

FEATURE_NAMES = list(FEATURE_DESCRIPTIONS.keys())


def _get_connection():
    """Obtiene conexión a la base de datos."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def compute_features(socio_id: int = None) -> pd.DataFrame:
    """
    Calcula las features de riesgo para uno o todos los socios con créditos activos.
    
    Args:
        socio_id: ID del socio específico, o None para todos.
    
    Returns:
        DataFrame con socio_id y todas las features calculadas.
    """
    conn = _get_connection()
    now = datetime(2026, 5, 21)
    six_months_ago = (now - relativedelta(months=6)).strftime("%Y-%m-%d")

    # Obtener socios con créditos
    if socio_id:
        socios_query = """
            SELECT DISTINCT s.id as socio_id, s.fecha_ingreso
            FROM socios s
            JOIN creditos c ON c.socio_id = s.id
            WHERE s.id = ?
        """
        socios_df = pd.read_sql_query(socios_query, conn, params=(socio_id,))
    else:
        socios_query = """
            SELECT DISTINCT s.id as socio_id, s.fecha_ingreso
            FROM socios s
            JOIN creditos c ON c.socio_id = s.id
        """
        socios_df = pd.read_sql_query(socios_query, conn)

    if socios_df.empty:
        conn.close()
        return pd.DataFrame()

    socio_ids = socios_df["socio_id"].tolist()
    placeholders = ",".join(["?" for _ in socio_ids])

    # ────── Datos de Pagos ──────
    pagos_query = f"""
        SELECT p.*, c.socio_id, c.cuota_mensual
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        WHERE c.socio_id IN ({placeholders})
    """
    pagos_df = pd.read_sql_query(pagos_query, conn, params=socio_ids)

    # ────── Datos de Pagos últimos 6 meses ──────
    pagos_6m_query = f"""
        SELECT p.*, c.socio_id
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        WHERE c.socio_id IN ({placeholders})
          AND p.fecha_esperada >= ?
    """
    pagos_6m_df = pd.read_sql_query(pagos_6m_query, conn, params=socio_ids + [six_months_ago])

    # ────── Datos de Créditos ──────
    creditos_query = f"""
        SELECT * FROM creditos WHERE socio_id IN ({placeholders})
    """
    creditos_df = pd.read_sql_query(creditos_query, conn, params=socio_ids)

    # ────── Datos de Transacciones (últimos 12 meses) ──────
    twelve_months_ago = (now - relativedelta(months=12)).strftime("%Y-%m-%d")
    tx_query = f"""
        SELECT * FROM transacciones
        WHERE socio_id IN ({placeholders}) AND fecha >= ?
    """
    tx_df = pd.read_sql_query(tx_query, conn, params=socio_ids + [twelve_months_ago])

    conn.close()

    # ────── Calcular Features ──────
    results = []

    for _, socio_row in socios_df.iterrows():
        sid = socio_row["socio_id"]
        features = {"socio_id": sid}

        # Pagos del socio
        s_pagos = pagos_df[pagos_df["socio_id"] == sid]
        s_pagos_6m = pagos_6m_df[pagos_6m_df["socio_id"] == sid] if not pagos_6m_df.empty else pd.DataFrame()
        s_creditos = creditos_df[creditos_df["socio_id"] == sid]
        s_tx = tx_df[tx_df["socio_id"] == sid] if not tx_df.empty else pd.DataFrame()

        # 1. ratio_pagos_puntuales
        pagos_pagados = s_pagos[s_pagos["estado"] == "Pagado"]
        if len(pagos_pagados) > 0:
            puntuales = len(pagos_pagados[pagos_pagados["dias_atraso"] <= 5])
            features["ratio_pagos_puntuales"] = round(puntuales / len(pagos_pagados), 4)
        else:
            features["ratio_pagos_puntuales"] = 0.0

        # 2. promedio_dias_atraso (últimos 6 meses)
        if not s_pagos_6m.empty and len(s_pagos_6m) > 0:
            features["promedio_dias_atraso"] = round(s_pagos_6m["dias_atraso"].mean(), 2)
        else:
            features["promedio_dias_atraso"] = 0.0

        # 3. tendencia_atraso (slope of days late over time)
        if len(s_pagos) >= 3:
            s_pagos_sorted = s_pagos.sort_values("fecha_esperada")
            y = s_pagos_sorted["dias_atraso"].values.astype(float)
            x = np.arange(len(y)).astype(float)
            if len(x) > 1:
                slope = np.polyfit(x, y, 1)[0]
                features["tendencia_atraso"] = round(slope, 4)
            else:
                features["tendencia_atraso"] = 0.0
        else:
            features["tendencia_atraso"] = 0.0

        # 4. ratio_monto_pagado
        total_esperado = s_pagos["monto_esperado"].sum()
        total_pagado = s_pagos["monto_pagado"].sum()
        if total_esperado > 0:
            features["ratio_monto_pagado"] = round(total_pagado / total_esperado, 4)
        else:
            features["ratio_monto_pagado"] = 1.0

        # 5. frecuencia_depositos (monthly)
        if not s_tx.empty:
            depositos = s_tx[s_tx["tipo"] == "Depósito"]
            n_meses_tx = max(1, len(s_tx["fecha"].str[:7].unique()))
            features["frecuencia_depositos"] = round(len(depositos) / n_meses_tx, 2)
        else:
            features["frecuencia_depositos"] = 0.0

        # 6. frecuencia_retiros (monthly)
        if not s_tx.empty:
            retiros = s_tx[s_tx["tipo"].isin(["Retiro", "Transferencia Enviada"])]
            features["frecuencia_retiros"] = round(len(retiros) / n_meses_tx, 2)
        else:
            features["frecuencia_retiros"] = 0.0

        # 7. ratio_retiros_depositos
        if features["frecuencia_depositos"] > 0:
            features["ratio_retiros_depositos"] = round(
                features["frecuencia_retiros"] / features["frecuencia_depositos"], 4
            )
        else:
            features["ratio_retiros_depositos"] = 2.0  # High risk if no deposits

        # 8. tendencia_saldo (slope of balance over time)
        if not s_tx.empty and len(s_tx) >= 3:
            s_tx_sorted = s_tx.sort_values("fecha")
            y_saldo = s_tx_sorted["saldo_resultante"].values.astype(float)
            x_saldo = np.arange(len(y_saldo)).astype(float)
            slope_saldo = np.polyfit(x_saldo, y_saldo, 1)[0]
            features["tendencia_saldo"] = round(slope_saldo, 4)
        else:
            features["tendencia_saldo"] = 0.0

        # 9. variabilidad_ingresos
        if not s_tx.empty:
            depositos_montos = s_tx[s_tx["tipo"] == "Depósito"]["monto"]
            if len(depositos_montos) >= 2:
                features["variabilidad_ingresos"] = round(depositos_montos.std(), 2)
            else:
                features["variabilidad_ingresos"] = 0.0
        else:
            features["variabilidad_ingresos"] = 0.0

        # 10. antiguedad_meses
        fecha_ingreso = datetime.strptime(socio_row["fecha_ingreso"], "%Y-%m-%d")
        features["antiguedad_meses"] = (now.year - fecha_ingreso.year) * 12 + \
                                        (now.month - fecha_ingreso.month)

        # 11. num_creditos_previos
        creditos_pagados = len(s_creditos[s_creditos["estado"] == "Pagado"])
        features["num_creditos_previos"] = creditos_pagados

        # 12. monto_credito_actual
        creditos_vigentes = s_creditos[s_creditos["estado"].isin(["Vigente", "Mora", "Reestructurado"])]
        features["monto_credito_actual"] = round(creditos_vigentes["monto"].sum(), 2)

        # 13. ratio_cuota_ingreso
        cuota_total = creditos_vigentes["cuota_mensual"].sum() if not creditos_vigentes.empty else 0
        if not s_tx.empty:
            depositos_mes = s_tx[s_tx["tipo"] == "Depósito"]["monto"]
            ingreso_estimado = depositos_mes.mean() * features["frecuencia_depositos"] if len(depositos_mes) > 0 else 0
        else:
            ingreso_estimado = 0

        if ingreso_estimado > 0:
            features["ratio_cuota_ingreso"] = round(cuota_total / ingreso_estimado, 4)
        else:
            features["ratio_cuota_ingreso"] = 2.0  # High risk

        results.append(features)

    return pd.DataFrame(results)


def _assign_risk_labels(features_df: pd.DataFrame) -> pd.Series:
    """
    Asigna etiquetas de riesgo basadas en reglas heurísticas para entrenamiento.
    Esto crea las labels para el modelo supervisado.
    """
    labels = []

    for _, row in features_df.iterrows():
        score = 0

        # Pagos puntuales (peso alto)
        if row["ratio_pagos_puntuales"] < 0.3:
            score += 35
        elif row["ratio_pagos_puntuales"] < 0.5:
            score += 25
        elif row["ratio_pagos_puntuales"] < 0.7:
            score += 15
        elif row["ratio_pagos_puntuales"] < 0.85:
            score += 5

        # Promedio días atraso
        if row["promedio_dias_atraso"] > 60:
            score += 25
        elif row["promedio_dias_atraso"] > 30:
            score += 18
        elif row["promedio_dias_atraso"] > 15:
            score += 10
        elif row["promedio_dias_atraso"] > 5:
            score += 4

        # Tendencia atraso
        if row["tendencia_atraso"] > 2:
            score += 15
        elif row["tendencia_atraso"] > 0.5:
            score += 8
        elif row["tendencia_atraso"] > 0:
            score += 3

        # Ratio monto pagado
        if row["ratio_monto_pagado"] < 0.5:
            score += 15
        elif row["ratio_monto_pagado"] < 0.7:
            score += 10
        elif row["ratio_monto_pagado"] < 0.9:
            score += 5

        # Ratio retiros/depositos
        if row["ratio_retiros_depositos"] > 1.5:
            score += 8
        elif row["ratio_retiros_depositos"] > 1.0:
            score += 4

        # Tendencia saldo
        if row["tendencia_saldo"] < -10:
            score += 8
        elif row["tendencia_saldo"] < -2:
            score += 4

        # Ratio cuota/ingreso
        if row["ratio_cuota_ingreso"] > 0.8:
            score += 8
        elif row["ratio_cuota_ingreso"] > 0.5:
            score += 4

        # Antigüedad (más antigüedad = más estable)
        if row["antiguedad_meses"] < 12:
            score += 5
        elif row["antiguedad_meses"] > 60:
            score -= 3

        # Clasificar
        if score >= 60:
            labels.append("Crítico")
        elif score >= 35:
            labels.append("Alto")
        elif score >= 18:
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
    
    Returns:
        dict con métricas del modelo.
    """
    print("\n" + "=" * 60)
    print("  🤖 Entrenamiento del Modelo de Riesgo Crediticio")
    print("=" * 60)

    # Calcular features
    print("\n📊 Calculando features para todos los socios...")
    features_df = compute_features()
    print(f"   ✅ Features calculadas para {len(features_df)} socios")

    if features_df.empty:
        raise ValueError("No hay datos suficientes para entrenar el modelo")

    # Asignar labels
    print("🏷️  Asignando etiquetas de riesgo...")
    labels = _assign_risk_labels(features_df)
    features_df["risk_label"] = labels

    # Verificar distribución
    label_counts = labels.value_counts()
    print("   Distribución de riesgo:")
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
    print("\n🌲 Entrenando Random Forest...")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
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

    print(f"\n📈 Métricas del modelo:")
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
    print(f"\n📊 Importancia de Features:")
    for fname, imp in importance_ranking:
        bar = "█" * int(imp * 50)
        print(f"   {fname:30s} {imp:.4f} {bar}")

    # Guardar modelo y metadata
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump({
        "metrics": metrics,
        "feature_names": FEATURE_NAMES,
        "feature_importance": importance_ranking,
    }, METADATA_PATH)

    print(f"\n   ✅ Modelo guardado en: {MODEL_PATH}")
    print("=" * 60)

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
    
    Returns:
        dict con risk_score, risk_level, feature_values, factors
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
        if fname == "ratio_pagos_puntuales":
            if value < 0.5:
                impact = "negativo"
            elif value > 0.85:
                impact = "positivo"
            else:
                impact = "neutral"
        elif fname == "promedio_dias_atraso":
            if value > 30:
                impact = "negativo"
            elif value < 5:
                impact = "positivo"
            else:
                impact = "neutral"
        elif fname == "tendencia_atraso":
            impact = "negativo" if value > 0.5 else ("positivo" if value < 0 else "neutral")
        elif fname == "ratio_monto_pagado":
            if value < 0.7:
                impact = "negativo"
            elif value > 0.95:
                impact = "positivo"
            else:
                impact = "neutral"
        elif fname == "ratio_retiros_depositos":
            impact = "negativo" if value > 1.2 else ("positivo" if value < 0.6 else "neutral")
        elif fname == "tendencia_saldo":
            impact = "negativo" if value < -5 else ("positivo" if value > 5 else "neutral")
        elif fname == "ratio_cuota_ingreso":
            impact = "negativo" if value > 0.6 else ("positivo" if value < 0.3 else "neutral")
        elif fname == "antiguedad_meses":
            impact = "positivo" if value > 36 else ("negativo" if value < 12 else "neutral")
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
    
    Returns:
        Lista de dicts con socio_id, risk_score, risk_level.
    """
    model = _load_model()
    features_df = compute_features()

    if features_df.empty:
        return []

    results = []
    for _, row in features_df.iterrows():
        feature_values = {f: float(row[f]) for f in FEATURE_NAMES}
        for k in feature_values:
            if np.isnan(feature_values[k]) or np.isinf(feature_values[k]):
                feature_values[k] = 0.0

        X = np.array([[feature_values[f] for f in FEATURE_NAMES]])
        X = np.nan_to_num(X, nan=0.0, posinf=100.0, neginf=-100.0)

        risk_level = model.predict(X)[0]
        risk_score = _compute_risk_score(feature_values, model, FEATURE_NAMES)

        results.append({
            "socio_id": int(row["socio_id"]),
            "risk_score": risk_score,
            "risk_level": risk_level,
        })

    return results


def get_feature_importance() -> list[dict]:
    """
    Retorna el ranking de importancia de features.
    
    Returns:
        Lista de dicts con feature, importance, description.
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
    print("\n\nProbando predicción individual...")
    result = predict_risk(1)
    print(f"Socio 1: Score={result['risk_score']}, Level={result['risk_level']}")

    print("\nProbando predicción masiva...")
    all_risks = predict_all()
    from collections import Counter
    levels = Counter(r["risk_level"] for r in all_risks)
    print(f"Distribución: {dict(levels)}")
