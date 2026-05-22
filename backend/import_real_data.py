"""
import_real_data.py - Importa el dataset real de producción a SQLite
y reconstruye socios, créditos, pagos y transacciones con historiales realistas.
"""

import os
import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "cooptech.db")
CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset_maestro_dashboard.csv")

AGENCIAS = {
    20: "Agencia Tulcán (Matriz)",
    48: "Agencia Tulcán (Matriz)", # Consolida con la 20 para darle la mayoría absoluta (~7,600+ socios)
    62: "Agencia Quito",          # Ciudad grande, ideal para absorber los 3,400+ socios
    41: "Agencia San Gabriel",    # Segunda agencia principal (~3,100+ socios)
    83: "Agencia Julio Andrade",  # ~2,000+ socios
    69: "Agencia El Ángel",       # ~2,000+ socios
    90: "Agencia Ibarra",         # ~1,900+ socios
    76: "Agencia Otavalo",        # ~1,700+ socios
    97: "Agencia Quito Norte",    # ~1,700+ socios
    55: "Agencia Quito Sur",      # ~1,200+ socios
    118: "Agencia Sangolquí",     # ~1,000+ socios
    111: "Agencia Cayambe",       # ~800+ socios
    34: "Agencia Latacunga",      # ~800+ socios
    27: "Agencia Huaca",          # Reducida de forma muy realista a ~771 socios
    104: "Agencia Ambato",        # ~760+ socios
    125: "Agencia Riobamba",      # ~750+ socios
    706: "Agencia Guaranda"       # ~7 socios
}

# Mapeo de agencias a códigos de provincia en Ecuador
# Carchi: 04, Imbabura: 10, Pichincha: 17, Cotopaxi: 05, Tungurahua: 18, Chimborazo: 06, Bolívar: 02
AGENCIA_PROVINCIAS = {
    "Agencia Tulcán (Matriz)": "04",
    "Agencia Julio Andrade": "04",
    "Agencia San Gabriel": "04",
    "Agencia El Ángel": "04",
    "Agencia Huaca": "04",
    "Agencia Ibarra": "10",
    "Agencia Otavalo": "10",
    "Agencia Cayambe": "10",  # Cayambe grouped with Imbabura in demographic panels
    "Agencia Quito": "17",
    "Agencia Quito Sur": "17",
    "Agencia Quito Norte": "17",
    "Agencia Sangolquí": "17",
    "Agencia Latacunga": "05",
    "Agencia Ambato": "18",
    "Agencia Riobamba": "06",
    "Agencia Guaranda": "02"
}

def generate_valid_cedula(socio_id, agencia_name):
    prov_code = "04"
    for ag, code in AGENCIA_PROVINCIAS.items():
        if ag in agencia_name:
            prov_code = code
            break
            
    serial = f"{(int(socio_id) % 10000000):07d}"
    prefix = prov_code + serial
    
    # Algoritmo de validación de cédula de Ecuador (Módulo 10)
    total = 0
    for idx, char in enumerate(prefix):
        val = int(char)
        if idx % 2 == 0:  # Posiciones impares (1, 3, 5, 7, 9)
            val *= 2
            if val >= 10:
                val -= 9
        total += val
        
    rem = total % 10
    checksum = 0 if rem == 0 else 10 - rem
    
    return prefix + str(checksum)

def get_agencia(nro_oficina):
    try:
        of_id = int(nro_oficina)
        return AGENCIAS.get(of_id, f"Agencia {of_id}")
    except Exception:
        return "Agencia Tulcán (Matriz)"

def clean_string(val):
    if pd.isna(val):
        return ""
    return str(val).strip()

def main():
    print("=" * 70)
    print("   [DB] Sincronizacion del Dataset de Produccion Real en SQLite")
    print("=" * 70)

    if not os.path.exists(CSV_PATH):
        print(f"Error: No se encontro el archivo CSV en: {CSV_PATH}")
        return

    print(f"\n[CSV] Cargando {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH)
    print(f"   OK. Registros crudos: {df.shape[0]}, Columnas: {df.shape[1]}")

    # Limpieza de duplicados en nro_operacion para asegurar integridad relacional
    df = df.drop_duplicates(subset=["nro_operacion"])
    print(f"   OK. Registros unicos (nro_operacion): {df.shape[0]}")

    # Reemplazar NaN en columnas clave
    df["cliente"] = df["cliente"].fillna(0).astype(int)
    df["nro_operacion"] = df["nro_operacion"].fillna(0).astype(int)
    df["monto_credito"] = df["monto_credito"].fillna(0.0).astype(float)
    df["saldo_capital"] = df["saldo_capital"].fillna(0.0).astype(float)
    df["dias_mora"] = df["dias_mora"].fillna(0).astype(int)
    df["es_moroso"] = df["es_moroso"].fillna(0).astype(int)
    df["saldo_disponible"] = df["saldo_disponible"].fillna(0.0).astype(float)
    df["num_transacciones"] = df["num_transacciones"].fillna(0.0).astype(float)
    df["volumen_total"] = df["volumen_total"].fillna(0.0).astype(float)
    df["ingresos_socio"] = df["ingresos_socio"].fillna(500.0).astype(float)
    df["egresos_socio"] = df["egresos_socio"].fillna(450.0).astype(float)

    # Aplicar Criterio Regulatorio SEPS (Ecuador) para corregir es_moroso en df
    print("\n[SEPS] Aplicando Criterio Regulatorio SEPS a la columna 'es_moroso'...")
    def calculate_seps_mora(row):
        d_mora = int(row["dias_mora"])
        est_raw = clean_string(row["estado_op"]).upper()
        tipo_raw = clean_string(row["tipo_cartera"]).upper()
        
        if est_raw in ["VENCIDO", "CASTIGADO", "JUDICIAL", "RESOLUCION", "MORA"]:
            return 1
        if tipo_raw == "MICROCREDITO" and d_mora > 15:
            return 1
        if tipo_raw == "CONSUMO" and d_mora > 30:
            return 1
        if tipo_raw == "VIVIENDA" and d_mora > 60:
            return 1
        if tipo_raw not in ["MICROCREDITO", "CONSUMO", "VIVIENDA"] and d_mora > 30:
            return 1
        return 0

    df["es_moroso"] = df.apply(calculate_seps_mora, axis=1)
    seps_mora_count = df["es_moroso"].sum()
    seps_total_count = df.shape[0]
    print(f"   [SEPS] Operaciones en Mora corregidas: {seps_mora_count} de {seps_total_count} ({seps_mora_count/seps_total_count*100:.2f}%)")

    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Guardar el CSV completo limpio en la tabla 'dataset_maestro' para uso del modelo e IA
    print("\n[DB] Guardando dataset en tabla 'dataset_maestro'...")
    df.to_sql("dataset_maestro", conn, if_exists="replace", index=False)
    print("   OK. Tabla 'dataset_maestro' creada con exito")

    # 2. Re-crear esquema limpio de base de datos relacional
    print("\n[DB] Creando tablas relacionales en la base de datos...")
    cursor.executescript("""
        DROP TABLE IF EXISTS transacciones;
        DROP TABLE IF EXISTS pagos;
        DROP TABLE IF EXISTS creditos;
        DROP TABLE IF EXISTS socios;

        CREATE TABLE socios (
            id INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            cedula TEXT UNIQUE NOT NULL,
            edad INTEGER NOT NULL,
            ocupacion TEXT NOT NULL,
            fecha_ingreso TEXT NOT NULL,
            agencia TEXT NOT NULL,
            telefono TEXT,
            email TEXT,
            estado TEXT NOT NULL DEFAULT 'Activo'
        );

        CREATE TABLE creditos (
            id INTEGER PRIMARY KEY,
            socio_id INTEGER NOT NULL,
            monto REAL NOT NULL,
            plazo_meses INTEGER NOT NULL,
            tasa_interes REAL NOT NULL,
            fecha_desembolso TEXT NOT NULL,
            cuota_mensual REAL NOT NULL,
            estado TEXT NOT NULL,
            tipo TEXT NOT NULL,
            FOREIGN KEY (socio_id) REFERENCES socios(id)
        );

        CREATE TABLE pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            credito_id INTEGER NOT NULL,
            num_cuota INTEGER NOT NULL,
            fecha_esperada TEXT NOT NULL,
            fecha_pago TEXT,
            monto_esperado REAL NOT NULL,
            monto_pagado REAL DEFAULT 0,
            dias_atraso INTEGER DEFAULT 0,
            estado TEXT NOT NULL,
            FOREIGN KEY (credito_id) REFERENCES creditos(id)
        );

        CREATE TABLE transacciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            socio_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            monto REAL NOT NULL,
            fecha TEXT NOT NULL,
            saldo_resultante REAL NOT NULL,
            descripcion TEXT,
            FOREIGN KEY (socio_id) REFERENCES socios(id)
        );

        CREATE INDEX idx_creditos_socio ON creditos(socio_id);
        CREATE INDEX idx_pagos_credito ON pagos(credito_id);
        CREATE INDEX idx_transacciones_socio ON transacciones(socio_id);
        CREATE INDEX idx_pagos_estado ON pagos(estado);
        CREATE INDEX idx_creditos_estado ON creditos(estado);
    """)
    conn.commit()
    print("   OK. Tablas relacionales creadas e indexadas")

    # 3. Extraer y poblar Socios (Únicos)
    print("\n[DB] Poblando tabla 'socios'...")
    # Agrupar por cliente para obtener info única de cada socio
    socios_df = df.drop_duplicates(subset=["cliente"])
    
    socios_to_insert = []
    now = datetime(2026, 5, 21)

    for _, row in socios_df.iterrows():
        cliente_id = int(row["cliente"])
        nombre = clean_string(row["nombres_socio"])
        if not nombre:
            nombre = f"SOCIO {cliente_id}"
        
        # Calcular edad desde fech_nacimiento
        birth_str = clean_string(row["fech_nacimiento"])
        edad = 40  # Default
        if birth_str:
            try:
                birth_dt = datetime.strptime(birth_str, "%Y-%m-%d")
                edad = now.year - birth_dt.year - ((now.month, now.day) < (birth_dt.month, birth_dt.day))
            except Exception:
                pass
        
        ocupacion = clean_string(row["actividad_socio"])[:100]
        if not ocupacion:
            ocupacion = "Comerciante"

        # Fecha ingreso (usamos fech_ult_viv o fecha_concesion_op si no hay)
        fecha_ingreso = clean_string(row["fech_ult_viv"])
        if not fecha_ingreso:
            fecha_ingreso = clean_string(row["fecha_concesion_op"])
        if not fecha_ingreso:
            fecha_ingreso = "2022-01-01"
        else:
            fecha_ingreso = fecha_ingreso[:10]  # Asegurar formato YYYY-MM-DD

        agencia = get_agencia(row["nro_oficina"])
        telefono = f"099{cliente_id % 10000000:07d}"
        email = f"socio{cliente_id}@cooptech.ec"
        estado = "Activo"

        socios_to_insert.append((
            cliente_id, nombre, generate_valid_cedula(cliente_id, agencia), edad, ocupacion,
            fecha_ingreso, agencia, telefono, email, estado
        ))

    cursor.executemany("""
        INSERT INTO socios (id, nombre, cedula, edad, ocupacion, fecha_ingreso, agencia, telefono, email, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, socios_to_insert)
    conn.commit()
    print(f"   OK. Se insertaron {len(socios_to_insert)} socios unicos")

    # 4. Poblar Créditos
    print("\n[DB] Poblando tabla 'creditos'...")
    creditos_to_insert = []
    
    # Mapeo de estados de crédito
    estado_map = {
        "VIGENTE": "Vigente",
        "VENCIDO": "Mora",
        "CASTIGADO": "Mora",
        "JUDICIAL": "Mora",
        "RESOLUCION": "Mora",
        "MORA": "Mora",
        "REESTRUCTURADO": "Reestructurado",
        "CANCELADO": "Pagado",
    }

    # Tipo cartera
    tipo_map = {
        "CONSUMO": "Consumo",
        "MICROCREDITO": "Microcrédito",
        "VIVIENDA": "Vivienda",
        "EMERGENTE": "Emergente"
    }

    for _, row in df.iterrows():
        op_id = int(row["nro_operacion"])
        cliente_id = int(row["cliente"])
        monto = float(row["monto_credito"])
        plazo = int(row["plazo"]) if not pd.isna(row["plazo"]) else 12
        tasa = float(row["tasa_int_con"]) if not pd.isna(row["tasa_int_con"]) else 15.0
        fecha_des = clean_string(row["fecha_concesion_op"])[:10]

        # Estimar cuota mensual: Amortización lineal + interés estimado
        cuota_mensual = monto / max(1, plazo) + (monto * (tasa / 100) / 12)
        cuota_mensual = round(cuota_mensual, 2)

        est_raw = clean_string(row["estado_op"]).upper()
        dias_mora = int(row["dias_mora"])
        
        # Criterio Regulatorio SEPS (Ecuador) para clasificar la cartera en Mora:
        is_seps_mora = (row["es_moroso"] == 1)
            
        if is_seps_mora:
            estado = "Mora"
        else:
            estado = estado_map.get(est_raw, "Vigente")
        
        tipo_raw = clean_string(row["tipo_cartera"]).upper()
        tipo = tipo_map.get(tipo_raw, "Consumo")

        creditos_to_insert.append((
            op_id, cliente_id, monto, plazo, tasa, fecha_des, cuota_mensual, estado, tipo
        ))

    cursor.executemany("""
        INSERT INTO creditos (id, socio_id, monto, plazo_meses, tasa_interes, fecha_desembolso, cuota_mensual, estado, tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, creditos_to_insert)
    conn.commit()
    print(f"   OK. Se insertaron {len(creditos_to_insert)} operaciones de credito")

    # 5. Generar Historial de Pagos y Transacciones
    print("\n[DB] Generando historiales de pagos y transacciones en lotes...")
    pagos_to_insert = []
    transacciones_to_insert = []

    # Fecha de proceso: 1 de Mayo 2026
    proc_date = datetime(2026, 5, 1)

    for i, row in df.iterrows():
        op_id = int(row["nro_operacion"])
        cliente_id = int(row["cliente"])
        monto = float(row["monto_credito"])
        plazo = int(row["plazo"]) if not pd.isna(row["plazo"]) else 12
        tasa = float(row["tasa_int_con"]) if not pd.isna(row["tasa_int_con"]) else 15.0
        fecha_des_str = clean_string(row["fecha_concesion_op"])[:10]
        
        dias_mora = int(row["dias_mora"])
        
        # Determinar si la operación se catalogó como Mora según el Criterio Regulatorio SEPS
        is_mora_credit = (row["es_moroso"] == 1)
        
        cuotas_atra = int(row["nro_cuotas_atra"]) if not pd.isna(row["nro_cuotas_atra"]) else 0
        
        # Si tiene días de mora pero cuotas atrasadas registradas en 0, estimamos al menos 1 cuota atrasada
        if dias_mora > 0 and cuotas_atra == 0:
            cuotas_atra = max(1, int(np.ceil(dias_mora / 30)))
            
        # Si está en mora pero no tiene días de mora registrados, estimamos atraso mínimo
        if is_mora_credit and dias_mora == 0:
            dias_mora = 30
            if cuotas_atra == 0:
                cuotas_atra = 1
        
        cuota_mensual = round(monto / max(1, plazo) + (monto * (tasa / 100) / 12), 2)

        try:
            fecha_des = datetime.strptime(fecha_des_str, "%Y-%m-%d")
        except Exception:
            fecha_des = proc_date - relativedelta(months=6)

        # Determinar cuántos meses han pasado desde el desembolso
        elapsed_months = (proc_date.year - fecha_des.year) * 12 + (proc_date.month - fecha_des.month)
        elapsed_months = max(1, elapsed_months)

        # Generar pagos mensuales
        for cuota_idx in range(1, elapsed_months + 1):
            fecha_esp = fecha_des + relativedelta(months=cuota_idx)
            fecha_esp_str = fecha_esp.strftime("%Y-%m-%d")

            # Determinar si esta cuota está en mora
            is_overdue = (cuota_idx > (elapsed_months - cuotas_atra)) and (dias_mora > 0)
            
            if is_overdue:
                estado_pago = "Atrasado"
                fecha_pago_str = None
                monto_pagado = 0.0
                atraso = dias_mora
            else:
                estado_pago = "Pagado"
                # Pequeña variación realista en fecha de pago
                fecha_pag = fecha_esp + timedelta(days=np.random.randint(-3, 6))
                fecha_pago_str = fecha_pag.strftime("%Y-%m-%d")
                monto_pagado = cuota_mensual
                atraso = max(0, (fecha_pag - fecha_esp).days)

            pagos_to_insert.append((
                op_id, cuota_idx, fecha_esp_str, fecha_pago_str, cuota_mensual, monto_pagado, atraso, estado_pago
            ))

        # 6. Generar transacciones realistas para el socio a partir de sus estadísticas mensuales
        saldo_disp = float(row["saldo_disponible"])
        num_tx = int(row["num_transacciones"])
        vol_total = float(row["volumen_total"])

        # Generar transacción de saldo inicial
        transacciones_to_insert.append((
            cliente_id, "Deposito", saldo_disp, "2026-05-01", saldo_disp, "Saldo inicial disponible"
        ))

        # Si tiene movimientos en el mes, generamos un par de depósitos y retiros
        if num_tx > 0 and vol_total > 0:
            vol_por_tx = vol_total / num_tx
            current_bal = saldo_disp
            for tx_idx in range(num_tx):
                # Alternar depósito y retiro
                tipo_tx = "Deposito" if tx_idx % 2 == 0 else "Retiro"
                tx_monto = round(vol_por_tx * np.random.uniform(0.7, 1.3), 2)
                
                # Ajustar saldo resultante
                if tipo_tx == "Deposito":
                    current_bal += tx_monto
                else:
                    current_bal -= tx_monto
                    if current_bal < 0: # Evitar saldos negativos
                        current_bal = saldo_disp + tx_monto
                        tipo_tx = "Deposito"
                
                fecha_tx = proc_date - timedelta(days=np.random.randint(1, 30))
                fecha_tx_str = fecha_tx.strftime("%Y-%m-%d")
                desc = "Deposito en ventanilla" if tipo_tx == "Deposito" else "Retiro cajero ATM"

                transacciones_to_insert.append((
                    cliente_id, tipo_tx, tx_monto, fecha_tx_str, round(current_bal, 2), desc
                ))

        # Insertar en lotes periódicamente para optimizar memoria
        if len(pagos_to_insert) >= 50000:
            cursor.executemany("""
                INSERT INTO pagos (credito_id, num_cuota, fecha_esperada, fecha_pago, monto_esperado, monto_pagado, dias_atraso, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, pagos_to_insert)
            conn.commit()
            pagos_to_insert = []

        if len(transacciones_to_insert) >= 50000:
            cursor.executemany("""
                INSERT INTO transacciones (socio_id, tipo, monto, fecha, saldo_resultante, descripcion)
                VALUES (?, ?, ?, ?, ?, ?)
            """, transacciones_to_insert)
            conn.commit()
            transacciones_to_insert = []

    # Insertar remanentes
    if pagos_to_insert:
        cursor.executemany("""
            INSERT INTO pagos (credito_id, num_cuota, fecha_esperada, fecha_pago, monto_esperado, monto_pagado, dias_atraso, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, pagos_to_insert)
    if transacciones_to_insert:
        cursor.executemany("""
            INSERT INTO transacciones (socio_id, tipo, monto, fecha, saldo_resultante, descripcion)
            VALUES (?, ?, ?, ?, ?, ?)
        """, transacciones_to_insert)

    conn.commit()
    conn.close()

    print("   OK. Historiales generados e insertados exitosamente")
    print("=" * 70)
    print("Sincronizacion Completa con Exito!")
    print(f"Archivo de Base de Datos: {DB_PATH}")
    print(f"Tamano final estimado: {os.path.getsize(DB_PATH) / (1024*1024):.2f} MB")
    print("=" * 70)

if __name__ == "__main__":
    main()
