"""
import_to_supabase.py - Importa el dataset real de producción a Supabase (PostgreSQL)
Reconstruye socios, créditos, pagos y transacciones con esquemas optimizados para Postgres.
"""

import os
import sys
import re
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from sqlalchemy import create_engine

CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset_maestro_dashboard.csv")

# Mapeo de agencias a nombres reales
AGENCIAS = {
    20: "Agencia Tulcán (Matriz)",
    48: "Agencia Tulcán (Matriz)",
    62: "Agencia Quito",
    41: "Agencia San Gabriel",
    83: "Agencia Julio Andrade",
    69: "Agencia El Ángel",
    90: "Agencia Ibarra",
    76: "Agencia Otavalo",
    97: "Agencia Quito Norte",
    55: "Agencia Quito Sur",
    118: "Agencia Sangolquí",
    111: "Agencia Cayambe",
    34: "Agencia Latacunga",
    27: "Agencia Huaca",
    104: "Agencia Ambato",
    125: "Agencia Riobamba",
    706: "Agencia Guaranda"
}

AGENCIA_PROVINCIAS = {
    "Agencia Tulcán (Matriz)": "04",
    "Agencia Julio Andrade": "04",
    "Agencia San Gabriel": "04",
    "Agencia El Ángel": "04",
    "Agencia Huaca": "04",
    "Agencia Ibarra": "10",
    "Agencia Otavalo": "10",
    "Agencia Cayambe": "10",
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
    
    total = 0
    for idx, char in enumerate(prefix):
        val = int(char)
        if idx % 2 == 0:
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

def connect_with_fallback(db_url):
    """
    Intenta conectarse con la URL provista. Si tiene corchetes en el password,
    los elimina. Si la conexión directa falla o falla por IPv6, intenta conectar
    automáticamente usando el Connection Pooler de Supabase en IPv4:
    aws-1-us-east-2.pooler.supabase.com (puertos 5432 o 6543) y el usuario postgres.[project_ref].
    """
    print(f"\n[Conexión] Intentando conectar con Supabase...")
    
    # Lista de URLs a probar
    urls_to_try = []
    
    # 1. URL original
    urls_to_try.append(("Original", db_url))
    
    # 2. Si tenía corchetes en el password '[password]', limpiamos a 'password'
    cleaned_url = db_url
    match = re.search(r"postgresql://([^:]+):\[(.*?)\]@(.*)", db_url)
    if match:
        user = match.group(1)
        pwd = match.group(2)
        rest = match.group(3)
        cleaned_url = f"postgresql://{user}:{pwd}@{rest}"
        urls_to_try.append(("Sin corchetes", cleaned_url))
    
    # 3. URL limpiada globalmente
    if "[" in db_url or "]" in db_url:
        global_cleaned = db_url.replace("[", "").replace("]", "")
        urls_to_try.append(("Limpieza global", global_cleaned))
        
    # 4. Intentar también con el Connection Pooler en IPv4 (aws-1-us-east-2.pooler.supabase.com)
    # Extraemos el project_ref del host, por ejemplo db.iuydftxzuybuklhiwyck.supabase.co -> iuydftxzuybuklhiwyck
    host_match = re.search(r"@([^:/]+)", db_url)
    if host_match:
        host = host_match.group(1)
        if "supabase.co" in host:
            parts = host.split(".")
            if parts[0] == "db":
                project_ref = parts[1]
            else:
                project_ref = parts[0]
            
            # Extraer password
            pwd = None
            pwd_match = re.search(r"postgresql://([^:]+):(?:\[(.*?)\]|([^@]+))@", db_url)
            if pwd_match:
                pwd = pwd_match.group(2) or pwd_match.group(3)
            
            if pwd:
                pooler_user = f"postgres.{project_ref}"
                pooler_host = "aws-1-us-east-2.pooler.supabase.com"
                for port in [5432, 6543]:
                    pooler_url = f"postgresql://{pooler_user}:{pwd}@{pooler_host}:{port}/postgres"
                    urls_to_try.append((f"Pooler IPv4 (Port {port})", pooler_url))

    for desc, url in urls_to_try:
        # Ocultar contraseña en el print para seguridad
        safe_url = re.sub(r":([^@]+)@", ":****@", url)
        print(f"   -> Probando opción: {desc} ({safe_url})...")
        try:
            conn = psycopg2.connect(url, connect_timeout=8)
            print(f"   ¡Conectado exitosamente con la opción: {desc}!")
            return conn, url
        except Exception as e:
            print(f"      Falló: {e}")
            
    raise ConnectionError("No se pudo conectar a la base de datos de Supabase tras intentar conexión directa y Connection Pooler IPv4.")

def main():
    print("=" * 80)
    print("   [SUPABASE] Sincronización del Dataset Real de Producción a PostgreSQL (Supabase)")
    print("=" * 80)

    # Capturar la URL de conexión provista por el usuario o usar variable de entorno
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Error: define DATABASE_URL con la URI de Supabase.")
        return

    # Preferir pooler IPv4 si la URL apunta al host directo (evita timeouts IPv6)
    if "db." in db_url and ".supabase.co" in db_url and "pooler" not in db_url:
        try:
            _, active_url = connect_with_fallback(db_url)
            db_url = active_url
            print(f"[Conexión] Usando URL resuelta: {re.sub(r':([^@]+)@', ':****@', active_url)}")
        except Exception as err:
            print(f"[WARN] No se pudo resolver pooler: {err}")

    if not os.path.exists(CSV_PATH):
        print(f"Error: No se encontró el archivo CSV en: {CSV_PATH}")
        return

    # Intentar conexión con fallback
    try:
        conn, active_url = connect_with_fallback(db_url)
    except Exception as err:
        print(f"\n[ERROR CRÍTICO] {err}")
        return

    cursor = conn.cursor()

    print(f"\n[CSV] Cargando dataset maestro: {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH)
    print(f"   OK. Registros crudos: {df.shape[0]}, Columnas: {df.shape[1]}")

    # Limpieza de duplicados en nro_operacion
    df = df.drop_duplicates(subset=["nro_operacion"])
    print(f"   OK. Registros únicos (nro_operacion): {df.shape[0]}")

    # Rellenar NaNs
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

    # Criterio SEPS (Ecuador)
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
    print(f"   [SEPS] Operaciones en Mora corregidas: {df['es_moroso'].sum()} de {df.shape[0]}")

    # 1. Crear Esquema Relacional Relimpio en Postgres
    print("\n[Postgres] Creando tablas relacionales en Supabase...")
    cursor.execute("""
        DROP TABLE IF EXISTS transacciones CASCADE;
        DROP TABLE IF EXISTS pagos CASCADE;
        DROP TABLE IF EXISTS creditos CASCADE;
        DROP TABLE IF EXISTS socios CASCADE;
        DROP TABLE IF EXISTS dataset_maestro CASCADE;

        CREATE TABLE socios (
            id BIGINT PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            cedula VARCHAR(50) UNIQUE NOT NULL,
            edad INTEGER NOT NULL,
            ocupacion VARCHAR(255) NOT NULL,
            fecha_ingreso VARCHAR(50) NOT NULL,
            agencia VARCHAR(255) NOT NULL,
            telefono VARCHAR(50),
            email VARCHAR(255),
            estado VARCHAR(50) NOT NULL DEFAULT 'Activo'
        );

        CREATE TABLE creditos (
            id BIGINT PRIMARY KEY,
            socio_id BIGINT NOT NULL,
            monto DOUBLE PRECISION NOT NULL,
            plazo_meses INTEGER NOT NULL,
            tasa_interes DOUBLE PRECISION NOT NULL,
            fecha_desembolso VARCHAR(50) NOT NULL,
            cuota_mensual DOUBLE PRECISION NOT NULL,
            estado VARCHAR(50) NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            CONSTRAINT fk_socio FOREIGN KEY (socio_id) REFERENCES socios(id) ON DELETE CASCADE
        );

        CREATE TABLE pagos (
            id BIGSERIAL PRIMARY KEY,
            credito_id BIGINT NOT NULL,
            num_cuota INTEGER NOT NULL,
            fecha_esperada VARCHAR(50) NOT NULL,
            fecha_pago VARCHAR(50),
            monto_esperado DOUBLE PRECISION NOT NULL,
            monto_pagado DOUBLE PRECISION DEFAULT 0,
            dias_atraso INTEGER DEFAULT 0,
            estado VARCHAR(50) NOT NULL,
            accion_preventiva VARCHAR(100) DEFAULT NULL,
            CONSTRAINT fk_credito FOREIGN KEY (credito_id) REFERENCES creditos(id) ON DELETE CASCADE
        );

        CREATE TABLE transacciones (
            id BIGSERIAL PRIMARY KEY,
            socio_id BIGINT NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            monto DOUBLE PRECISION NOT NULL,
            fecha VARCHAR(50) NOT NULL,
            saldo_resultante DOUBLE PRECISION NOT NULL,
            descripcion VARCHAR(255),
            CONSTRAINT fk_socio_tx FOREIGN KEY (socio_id) REFERENCES socios(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_creditos_socio ON creditos(socio_id);
        CREATE INDEX idx_pagos_credito ON pagos(credito_id);
        CREATE INDEX idx_transacciones_socio ON transacciones(socio_id);
        CREATE INDEX idx_pagos_estado ON pagos(estado);
        CREATE INDEX idx_creditos_estado ON creditos(estado);
    """)
    conn.commit()
    print("   OK. Estructura relacional limpia e indexada creada en Supabase.")

    # 2. Poblar Socios
    print("\n[DB] Poblando tabla 'socios' en Supabase...")
    socios_df = df.drop_duplicates(subset=["cliente"])
    socios_to_insert = []
    now = datetime(2026, 5, 21)

    for _, row in socios_df.iterrows():
        cliente_id = int(row["cliente"])
        nombre = clean_string(row["nombres_socio"])
        if not nombre:
            nombre = f"SOCIO {cliente_id}"
        
        birth_str = clean_string(row["fech_nacimiento"])
        edad = 40
        if birth_str:
            try:
                birth_dt = datetime.strptime(birth_str, "%Y-%m-%d")
                edad = now.year - birth_dt.year - ((now.month, now.day) < (birth_dt.month, birth_dt.day))
            except Exception:
                pass
        
        ocupacion = clean_string(row["actividad_socio"])[:100]
        if not ocupacion:
            ocupacion = "Comerciante"

        fecha_ingreso = clean_string(row["fech_ult_viv"])
        if not fecha_ingreso:
            fecha_ingreso = clean_string(row["fecha_concesion_op"])
        if not fecha_ingreso:
            fecha_ingreso = "2022-01-01"
        else:
            fecha_ingreso = fecha_ingreso[:10]

        agencia = get_agencia(row["nro_oficina"])
        telefono = f"099{cliente_id % 10000000:07d}"
        email = f"socio{cliente_id}@cooptech.ec"
        estado = "Activo"

        socios_to_insert.append((
            cliente_id, nombre, generate_valid_cedula(cliente_id, agencia), edad, ocupacion,
            fecha_ingreso, agencia, telefono, email, estado
        ))

    # Inserción masiva optimizada
    execute_batch(cursor, """
        INSERT INTO socios (id, nombre, cedula, edad, ocupacion, fecha_ingreso, agencia, telefono, email, estado)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, socios_to_insert, page_size=1000)
    conn.commit()
    print(f"   OK. Se insertaron {len(socios_to_insert)} socios únicos.")

    # 3. Poblar Créditos
    print("\n[DB] Poblando tabla 'creditos' en Supabase...")
    creditos_to_insert = []
    estado_map = {
        "VIGENTE": "Vigente", "VENCIDO": "Mora", "CASTIGADO": "Mora", "JUDICIAL": "Mora",
        "RESOLUCION": "Mora", "MORA": "Mora", "REESTRUCTURADO": "Reestructurado", "CANCELADO": "Pagado",
    }
    tipo_map = {
        "CONSUMO": "Consumo", "MICROCREDITO": "Microcrédito", "VIVIENDA": "Vivienda", "EMERGENTE": "Emergente"
    }

    for _, row in df.iterrows():
        op_id = int(row["nro_operacion"])
        cliente_id = int(row["cliente"])
        monto = float(row["monto_credito"])
        plazo = int(row["plazo"]) if not pd.isna(row["plazo"]) else 12
        tasa = float(row["tasa_int_con"]) if not pd.isna(row["tasa_int_con"]) else 15.0
        fecha_des = clean_string(row["fecha_concesion_op"])[:10]

        cuota_mensual = round(monto / max(1, plazo) + (monto * (tasa / 100) / 12), 2)
        est_raw = clean_string(row["estado_op"]).upper()
        
        is_seps_mora = (row["es_moroso"] == 1)
        if is_seps_mora:
            estado = "Mora"
        else:
            estado = estado_map.get(est_raw, "Vigente")
        
        tipo = tipo_map.get(clean_string(row["tipo_cartera"]).upper(), "Consumo")

        creditos_to_insert.append((
            op_id, cliente_id, monto, plazo, tasa, fecha_des, cuota_mensual, estado, tipo
        ))

    execute_batch(cursor, """
        INSERT INTO creditos (id, socio_id, monto, plazo_meses, tasa_interes, fecha_desembolso, cuota_mensual, estado, tipo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, creditos_to_insert, page_size=1000)
    conn.commit()
    print(f"   OK. Se insertaron {len(creditos_to_insert)} operaciones de crédito.")

    # 4. Generar Historial de Pagos y Transacciones
    print("\n[DB] Generando historiales de pagos y transacciones en lotes para la nube...")
    pagos_to_insert = []
    transacciones_to_insert = []
    proc_date = datetime(2026, 5, 1)

    for i, row in df.iterrows():
        op_id = int(row["nro_operacion"])
        cliente_id = int(row["cliente"])
        monto = float(row["monto_credito"])
        plazo = int(row["plazo"]) if not pd.isna(row["plazo"]) else 12
        tasa = float(row["tasa_int_con"]) if not pd.isna(row["tasa_int_con"]) else 15.0
        fecha_des_str = clean_string(row["fecha_concesion_op"])[:10]
        
        dias_mora = int(row["dias_mora"])
        is_mora_credit = (row["es_moroso"] == 1)
        cuotas_atra = int(row["nro_cuotas_atra"]) if not pd.isna(row["nro_cuotas_atra"]) else 0
        
        if dias_mora > 0 and cuotas_atra == 0:
            cuotas_atra = max(1, int(np.ceil(dias_mora / 30)))
        if is_mora_credit and dias_mora == 0:
            dias_mora = 30
            if cuotas_atra == 0:
                cuotas_atra = 1
        
        cuota_mensual = round(monto / max(1, plazo) + (monto * (tasa / 100) / 12), 2)

        try:
            fecha_des = datetime.strptime(fecha_des_str, "%Y-%m-%d")
        except Exception:
            fecha_des = proc_date - relativedelta(months=6)

        elapsed_months = (proc_date.year - fecha_des.year) * 12 + (proc_date.month - fecha_des.month)
        elapsed_months = max(1, elapsed_months)

        for cuota_idx in range(1, plazo + 1):
            fecha_esp = fecha_des + relativedelta(months=cuota_idx)
            fecha_esp_str = fecha_esp.strftime("%Y-%m-%d")

            if cuota_idx <= elapsed_months:
                is_overdue = (cuota_idx > (elapsed_months - cuotas_atra)) and (dias_mora > 0)
                if is_overdue:
                    estado_pago = "Atrasado"
                    fecha_pago_str = None
                    monto_pagado = 0.0
                    atraso = dias_mora
                else:
                    estado_pago = "Pagado"
                    fecha_pag = fecha_esp + timedelta(days=np.random.randint(-3, 6))
                    fecha_pago_str = fecha_pag.strftime("%Y-%m-%d")
                    monto_pagado = cuota_mensual
                    atraso = max(0, (fecha_pag - fecha_esp).days)
            else:
                # Si el crédito ya está cancelado, no generamos cuotas futuras
                if is_mora_credit == False and clean_string(row["estado_op"]).upper() == "CANCELADO":
                    continue
                estado_pago = "Pendiente"
                fecha_pago_str = None
                monto_pagado = 0.0
                atraso = 0
                if cuota_idx == elapsed_months + 1:
                    offset_dias = 3 + (cliente_id % 13)
                    fecha_esp = proc_date + timedelta(days=offset_dias)
                    fecha_esp_str = fecha_esp.strftime("%Y-%m-%d")

            pagos_to_insert.append((
                op_id, cuota_idx, fecha_esp_str, fecha_pago_str, cuota_mensual, monto_pagado, atraso, estado_pago, None
            ))

        # Transacciones
        saldo_disp = float(row["saldo_disponible"])
        num_tx = int(row["num_transacciones"])
        vol_total = float(row["volumen_total"])

        transacciones_to_insert.append((
            cliente_id, "Deposito", saldo_disp, "2026-05-01", saldo_disp, "Saldo inicial disponible"
        ))

        if num_tx > 0 and vol_total > 0:
            vol_por_tx = vol_total / num_tx
            current_bal = saldo_disp
            for tx_idx in range(num_tx):
                tipo_tx = "Deposito" if tx_idx % 2 == 0 else "Retiro"
                tx_monto = round(vol_por_tx * np.random.uniform(0.7, 1.3), 2)
                
                if tipo_tx == "Deposito":
                    current_bal += tx_monto
                else:
                    current_bal -= tx_monto
                    if current_bal < 0:
                        current_bal = saldo_disp + tx_monto
                        tipo_tx = "Deposito"
                
                fecha_tx = proc_date - timedelta(days=np.random.randint(1, 30))
                fecha_tx_str = fecha_tx.strftime("%Y-%m-%d")
                desc = "Deposito en ventanilla" if tipo_tx == "Deposito" else "Retiro cajero ATM"

                transacciones_to_insert.append((
                    cliente_id, tipo_tx, tx_monto, fecha_tx_str, round(current_bal, 2), desc
                ))

        # Escribir periódicamente para evitar usar demasiada RAM en la inserción
        if len(pagos_to_insert) >= 30000:
            execute_batch(cursor, """
                INSERT INTO pagos (credito_id, num_cuota, fecha_esperada, fecha_pago, monto_esperado, monto_pagado, dias_atraso, estado, accion_preventiva)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, pagos_to_insert, page_size=1000)
            conn.commit()
            pagos_to_insert = []
            print(f"   [+] Escribiendo lote de pagos...")

        if len(transacciones_to_insert) >= 30000:
            execute_batch(cursor, """
                INSERT INTO transacciones (socio_id, tipo, monto, fecha, saldo_resultante, descripcion)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, transacciones_to_insert, page_size=1000)
            conn.commit()
            transacciones_to_insert = []
            print(f"   [+] Escribiendo lote de transacciones...")

    # Insertar remanentes
    if pagos_to_insert:
        execute_batch(cursor, """
            INSERT INTO pagos (credito_id, num_cuota, fecha_esperada, fecha_pago, monto_esperado, monto_pagado, dias_atraso, estado, accion_preventiva)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, pagos_to_insert, page_size=1000)
    if transacciones_to_insert:
        execute_batch(cursor, """
            INSERT INTO transacciones (socio_id, tipo, monto, fecha, saldo_resultante, descripcion)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, transacciones_to_insert, page_size=1000)

    conn.commit()
    print("   OK. Historiales e inserciones finalizados de forma exitosa.")

    # 5. Guardar el CSV completo en la tabla 'dataset_maestro' para uso del modelo de Inteligencia Artificial
    print("\n[DB] Guardando dataset en tabla 'dataset_maestro' de Supabase (este proceso puede tardar un minuto)...")
    engine = create_engine(active_url)
    df.to_sql("dataset_maestro", engine, if_exists="replace", index=False, chunksize=5000)
    print("   ¡OK! Tabla 'dataset_maestro' guardada con éxito en Supabase.")

    conn.close()
    print("=" * 80)
    print("¡Sincronización Completa con Éxito a Supabase!")
    print("Tu panel de control de Radar-Mora en producción ya puede conectarse directamente.")
    print("=" * 80)

if __name__ == "__main__":
    main()
