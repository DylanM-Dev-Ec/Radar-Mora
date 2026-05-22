"""
data_generator.py - Generador de datos sintéticos realistas para CoopTech Tulcán.
Genera socios, créditos, pagos y transacciones con patrones reales de riesgo.
"""

import sqlite3
import os
import random
import numpy as np
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

# ─────────────────────────────── Constantes ───────────────────────────────

AGENCIAS = ["Tulcán Centro", "Ibarra", "San Gabriel", "Huaca", "Bolívar"]

OCUPACIONES = [
    "Agricultor", "Comerciante", "Servidor Público", "Docente",
    "Artesano", "Transportista", "Ganadero", "Albañil",
    "Mecánico", "Enfermero/a", "Contador/a", "Abogado/a",
    "Ingeniero/a", "Ama de Casa", "Emprendedor/a", "Policía",
    "Veterinario/a", "Carpintero", "Electricista", "Peluquero/a",
    "Costurero/a", "Panadero/a", "Vendedor Ambulante", "Taxista",
    "Chofer Profesional", "Administrador/a", "Secretario/a",
    "Técnico en Sistemas", "Agricultor Orgánico", "Jornalero"
]

NOMBRES_MASCULINOS = [
    "Carlos", "José", "Luis", "Miguel", "Juan", "Pedro", "Francisco",
    "Antonio", "Manuel", "Rafael", "Fernando", "Andrés", "Jorge",
    "Ricardo", "Héctor", "Marco", "Ángel", "Diego", "Santiago",
    "Esteban", "Cristian", "Byron", "Edison", "Darwin", "Wilmer",
    "Patricio", "Segundo", "César", "Fabián", "Gonzalo", "Iván",
    "Julio", "Lenin", "Marcelo", "Nelson", "Óscar", "Pablo",
    "Ramiro", "Sergio", "Víctor", "Washington", "Xavier"
]

NOMBRES_FEMENINOS = [
    "María", "Ana", "Carmen", "Rosa", "Gloria", "Patricia", "Lucía",
    "Sandra", "Martha", "Adriana", "Silvia", "Elena", "Isabel",
    "Gabriela", "Verónica", "Mónica", "Cecilia", "Beatriz",
    "Fernanda", "Carolina", "Daniela", "Paola", "Andrea", "Lorena",
    "Tatiana", "Maricela", "Blanca", "Olga", "Teresa", "Gladys",
    "Rocío", "Esperanza", "Dolores", "Pilar", "Sonia", "Nelly",
    "Margarita", "Cristina", "Jenny", "Miriam"
]

APELLIDOS = [
    "Chulde", "Paspuel", "Chamorro", "Quelal", "Fuel", "Cerón",
    "Cuasapud", "Tapia", "Revelo", "Benavides", "Rosero", "Potosí",
    "Imbaquingo", "Ruano", "Cadena", "Guevara", "Enríquez", "Armas",
    "Montenegro", "Narváez", "Bolaños", "Carlosama", "Cuaical",
    "Chapuel", "Ingueza", "Yacelga", "Ibarra", "Morillo", "Erazo",
    "Fuertes", "Guatemala", "Hernández", "Insuasti", "Jiménez",
    "Quiroz", "López", "Mafla", "Nastar", "Obando", "Pantoja",
    "Quenán", "Ramírez", "Suárez", "Torres", "Ulcuango", "Valencia",
    "Yépez", "Zambrano", "Andrade", "Bastidas", "Caicedo", "Díaz",
    "Escobar", "Figueroa", "Guerrero", "Hurtado"
]

TIPOS_CREDITO = ["Consumo", "Microcrédito", "Vivienda", "Emergente"]

DESCRIPCIONES_TRANSACCION = {
    "Depósito": [
        "Depósito en ventanilla", "Depósito nómina", "Depósito ahorros",
        "Transferencia recibida", "Depósito por ventas", "Ingreso mensual",
        "Pago recibido de cliente", "Depósito agricultura"
    ],
    "Retiro": [
        "Retiro en ventanilla", "Retiro cajero ATM", "Retiro para gastos",
        "Retiro para insumos", "Retiro emergencia", "Retiro personal"
    ],
    "Transferencia Enviada": [
        "Pago a proveedor", "Transferencia familiar", "Pago de mercadería",
        "Envío a cuenta terceros", "Pago de deuda particular"
    ],
    "Transferencia Recibida": [
        "Transferencia de familiar", "Pago recibido", "Abono de cliente",
        "Remesa del exterior", "Devolución"
    ],
    "Pago Servicios": [
        "Pago luz eléctrica", "Pago agua potable", "Pago teléfono",
        "Pago internet", "Pago plan celular", "Pago impuesto predial"
    ],
}


# ─────────────────────────────── Helpers ───────────────────────────────

def _random_cedula() -> str:
    """Genera una cédula ecuatoriana válida de 10 dígitos."""
    import random
    provincia = random.choice(["04", "10", "17", "05", "18", "06", "02"])
    resto = "".join([str(random.randint(0, 9)) for _ in range(7)])
    prefix = f"{provincia}{resto}"
    
    # Calcular dígito de control ecuatoriano
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
    return f"{prefix}{checksum}"


def _random_phone() -> str:
    """Genera un teléfono ecuatoriano ficticio."""
    prefijos = ["099", "098", "097", "096", "095", "093"]
    return f"{random.choice(prefijos)}{random.randint(1000000,9999999)}"


def _random_email(nombre: str, apellido: str) -> str:
    """Genera un email ficticio."""
    dominios = ["gmail.com", "hotmail.com", "yahoo.es", "outlook.com"]
    nombre_clean = nombre.lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
    apellido_clean = apellido.lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
    sep = random.choice([".", "_", ""])
    num = random.randint(1, 99)
    return f"{nombre_clean}{sep}{apellido_clean}{num}@{random.choice(dominios)}"


def _random_date_between(start: datetime, end: datetime) -> datetime:
    """Genera una fecha aleatoria entre start y end."""
    delta = (end - start).days
    if delta <= 0:
        return start
    return start + timedelta(days=random.randint(0, delta))


# ─────────────────────────── Generación Principal ───────────────────────────

def generate_data(db_path: str, n_socios: int = 500):
    """Genera todos los datos sintéticos y los almacena en SQLite."""

    print("=" * 60)
    print("  CoopTech Tulcán - Generador de Datos Sintéticos")
    print("=" * 60)

    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # ─────────── Crear Tablas ───────────
    print("\n📋 Creando esquema de base de datos...")

    cursor.executescript("""
        DROP TABLE IF EXISTS transacciones;
        DROP TABLE IF EXISTS pagos;
        DROP TABLE IF EXISTS creditos;
        DROP TABLE IF EXISTS socios;

        CREATE TABLE socios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    print("   ✅ Tablas creadas correctamente")

    # ─────────── Generar Socios ───────────
    print(f"\n👥 Generando {n_socios} socios...")

    now = datetime(2026, 5, 21)
    socios = []
    cedulas_usadas = set()

    # Asignar perfiles de riesgo
    # 60% buenos pagadores, 25% deterioro gradual, 15% en mora
    n_buenos = int(n_socios * 0.60)
    n_deterioro = int(n_socios * 0.25)
    n_morosos = n_socios - n_buenos - n_deterioro

    perfiles = (["bueno"] * n_buenos +
                ["deterioro"] * n_deterioro +
                ["moroso"] * n_morosos)
    random.shuffle(perfiles)

    for i in range(n_socios):
        es_mujer = random.random() < 0.45
        nombre_pila = random.choice(NOMBRES_FEMENINOS if es_mujer else NOMBRES_MASCULINOS)
        segundo_nombre = random.choice(NOMBRES_FEMENINOS if es_mujer else NOMBRES_MASCULINOS)
        apellido1 = random.choice(APELLIDOS)
        apellido2 = random.choice(APELLIDOS)
        nombre_completo = f"{nombre_pila} {segundo_nombre} {apellido1} {apellido2}"

        while True:
            cedula = _random_cedula()
            if cedula not in cedulas_usadas:
                cedulas_usadas.add(cedula)
                break

        perfil = perfiles[i]
        if perfil == "bueno":
            edad = random.randint(28, 65)
            antiguedad_anios = random.randint(2, 15)
        elif perfil == "deterioro":
            edad = random.randint(25, 55)
            antiguedad_anios = random.randint(1, 8)
        else:  # moroso
            edad = random.randint(22, 50)
            antiguedad_anios = random.randint(0, 5)

        fecha_ingreso = now - relativedelta(years=antiguedad_anios, months=random.randint(0, 11))
        estado = "Activo" if random.random() < 0.92 else "Inactivo"

        socios.append({
            "nombre": nombre_completo,
            "cedula": cedula,
            "edad": edad,
            "ocupacion": random.choice(OCUPACIONES),
            "fecha_ingreso": fecha_ingreso.strftime("%Y-%m-%d"),
            "agencia": random.choice(AGENCIAS),
            "telefono": _random_phone(),
            "email": _random_email(nombre_pila, apellido1),
            "estado": estado,
            "perfil": perfil,
        })

    # Insertar socios
    cursor.executemany(
        """INSERT INTO socios (nombre, cedula, edad, ocupacion, fecha_ingreso,
                               agencia, telefono, email, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [(s["nombre"], s["cedula"], s["edad"], s["ocupacion"],
          s["fecha_ingreso"], s["agencia"], s["telefono"], s["email"],
          s["estado"]) for s in socios]
    )
    conn.commit()
    print(f"   ✅ {n_socios} socios insertados")
    print(f"      - Buenos pagadores: {n_buenos}")
    print(f"      - Deterioro gradual: {n_deterioro}")
    print(f"      - Morosos: {n_morosos}")

    # ─────────── Generar Créditos ───────────
    print(f"\n💰 Generando créditos...")

    creditos = []
    credito_id = 0

    for socio_idx, socio in enumerate(socios):
        socio_id = socio_idx + 1
        perfil = socio["perfil"]
        fecha_ingreso = datetime.strptime(socio["fecha_ingreso"], "%Y-%m-%d")

        # Número de créditos por socio
        if perfil == "bueno":
            n_creditos = random.choices([1, 2, 3], weights=[40, 45, 15])[0]
        elif perfil == "deterioro":
            n_creditos = random.choices([1, 2], weights=[60, 40])[0]
        else:
            n_creditos = random.choices([1, 2], weights=[70, 30])[0]

        for c_idx in range(n_creditos):
            credito_id += 1

            tipo = random.choices(
                TIPOS_CREDITO,
                weights=[35, 35, 15, 15]
            )[0]

            if tipo == "Consumo":
                monto = round(random.uniform(500, 15000), 2)
                plazo = random.choice([6, 12, 18, 24, 36])
            elif tipo == "Microcrédito":
                monto = round(random.uniform(500, 20000), 2)
                plazo = random.choice([6, 12, 18, 24, 36, 48])
            elif tipo == "Vivienda":
                monto = round(random.uniform(10000, 50000), 2)
                plazo = random.choice([36, 48, 60])
            else:  # Emergente
                monto = round(random.uniform(200, 3000), 2)
                plazo = random.choice([6, 12])

            tasa = round(random.uniform(8, 18), 2)

            # Calcular cuota mensual (fórmula de anualidad)
            tasa_mensual = tasa / 100 / 12
            if tasa_mensual > 0:
                cuota = monto * (tasa_mensual * (1 + tasa_mensual) ** plazo) / \
                        ((1 + tasa_mensual) ** plazo - 1)
            else:
                cuota = monto / plazo
            cuota = round(cuota, 2)

            # Fecha de desembolso
            min_desembolso = fecha_ingreso + timedelta(days=30)
            max_desembolso = now - timedelta(days=plazo * 10)  # Dar tiempo para pagos
            if max_desembolso < min_desembolso:
                max_desembolso = now - timedelta(days=60)
            if max_desembolso < min_desembolso:
                min_desembolso = max_desembolso - timedelta(days=30)

            fecha_desembolso = _random_date_between(min_desembolso, max_desembolso)

            # Estado del crédito
            meses_transcurridos = (now.year - fecha_desembolso.year) * 12 + \
                                  (now.month - fecha_desembolso.month)

            if c_idx < n_creditos - 1:
                # Créditos anteriores: mayormente pagados
                estado_credito = random.choices(
                    ["Pagado", "Vigente"],
                    weights=[85, 15]
                )[0]
            else:
                # Último crédito: depende del perfil
                if perfil == "bueno":
                    if meses_transcurridos >= plazo:
                        estado_credito = "Pagado"
                    else:
                        estado_credito = "Vigente"
                elif perfil == "deterioro":
                    estado_credito = random.choices(
                        ["Vigente", "Mora", "Reestructurado"],
                        weights=[50, 35, 15]
                    )[0]
                else:  # moroso
                    estado_credito = random.choices(
                        ["Mora", "Vigente", "Reestructurado"],
                        weights=[60, 20, 20]
                    )[0]

            creditos.append({
                "id": credito_id,
                "socio_id": socio_id,
                "monto": monto,
                "plazo_meses": plazo,
                "tasa_interes": tasa,
                "fecha_desembolso": fecha_desembolso.strftime("%Y-%m-%d"),
                "cuota_mensual": cuota,
                "estado": estado_credito,
                "tipo": tipo,
                "perfil": perfil,
                "meses_transcurridos": meses_transcurridos,
            })

    cursor.executemany(
        """INSERT INTO creditos (socio_id, monto, plazo_meses, tasa_interes,
                                 fecha_desembolso, cuota_mensual, estado, tipo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [(c["socio_id"], c["monto"], c["plazo_meses"], c["tasa_interes"],
          c["fecha_desembolso"], c["cuota_mensual"], c["estado"], c["tipo"])
         for c in creditos]
    )
    conn.commit()
    print(f"   ✅ {len(creditos)} créditos insertados")

    estados_count = {}
    for c in creditos:
        estados_count[c["estado"]] = estados_count.get(c["estado"], 0) + 1
    for estado, cnt in sorted(estados_count.items()):
        print(f"      - {estado}: {cnt}")

    # ─────────── Generar Pagos ───────────
    print(f"\n📄 Generando pagos...")

    pagos = []
    for cred in creditos:
        fecha_desembolso = datetime.strptime(cred["fecha_desembolso"], "%Y-%m-%d")
        perfil = cred["perfil"]
        num_cuotas_total = cred["plazo_meses"]

        if cred["estado"] == "Pagado":
            cuotas_a_generar = num_cuotas_total
        else:
            cuotas_a_generar = min(cred["meses_transcurridos"], num_cuotas_total)

        for cuota_num in range(1, cuotas_a_generar + 1):
            fecha_esperada = fecha_desembolso + relativedelta(months=cuota_num)

            if fecha_esperada > now:
                # Cuotas futuras: pendientes
                pagos.append({
                    "credito_id": cred["id"],
                    "num_cuota": cuota_num,
                    "fecha_esperada": fecha_esperada.strftime("%Y-%m-%d"),
                    "fecha_pago": None,
                    "monto_esperado": cred["cuota_mensual"],
                    "monto_pagado": 0,
                    "dias_atraso": 0,
                    "estado": "Pendiente",
                })
                continue

            # Generar patrón de pago según perfil
            if perfil == "bueno":
                # Pagos puntuales, a veces con 1-3 días de retraso
                dias_atraso = random.choices(
                    [0, 1, 2, 3, 5],
                    weights=[60, 20, 10, 5, 5]
                )[0]
                monto_pagado = cred["cuota_mensual"]
                estado_pago = "Pagado"

            elif perfil == "deterioro":
                # Deterioro gradual: las primeras cuotas bien, luego peor
                progreso = cuota_num / max(cuotas_a_generar, 1)

                if progreso < 0.4:
                    # Primeras cuotas: relativamente bien
                    dias_atraso = random.choices(
                        [0, 1, 3, 5, 10],
                        weights=[40, 25, 20, 10, 5]
                    )[0]
                    monto_pagado = cred["cuota_mensual"]
                elif progreso < 0.7:
                    # Cuotas medias: empiezan los problemas
                    dias_atraso = random.choices(
                        [0, 5, 10, 15, 25, 35],
                        weights=[10, 20, 25, 25, 15, 5]
                    )[0]
                    monto_pagado = round(cred["cuota_mensual"] * random.uniform(0.85, 1.0), 2)
                else:
                    # Cuotas recientes: retrasos significativos
                    dias_atraso = random.choices(
                        [5, 15, 30, 45, 60, 90],
                        weights=[5, 15, 25, 25, 20, 10]
                    )[0]
                    monto_pagado = round(cred["cuota_mensual"] * random.uniform(0.6, 0.95), 2)

                # Últimas cuotas pueden estar pendientes
                if progreso > 0.85 and random.random() < 0.3:
                    estado_pago = "Atrasado"
                    fecha_pago_actual = None
                    monto_pagado = 0
                    dias_atraso = (now - fecha_esperada).days
                else:
                    estado_pago = "Pagado"

            else:  # moroso
                progreso = cuota_num / max(cuotas_a_generar, 1)

                if progreso < 0.25:
                    # Algunas primeras cuotas pagadas con retraso
                    dias_atraso = random.choices(
                        [3, 10, 20, 30, 45],
                        weights=[10, 20, 30, 25, 15]
                    )[0]
                    monto_pagado = round(cred["cuota_mensual"] * random.uniform(0.7, 1.0), 2)
                    estado_pago = "Pagado"
                elif progreso < 0.5:
                    # Pagos muy irregulares
                    if random.random() < 0.5:
                        dias_atraso = random.randint(15, 60)
                        monto_pagado = round(cred["cuota_mensual"] * random.uniform(0.5, 0.9), 2)
                        estado_pago = "Pagado"
                    else:
                        dias_atraso = (now - fecha_esperada).days
                        monto_pagado = 0
                        estado_pago = "Atrasado"
                else:
                    # Sin pagar
                    dias_atraso = (now - fecha_esperada).days
                    monto_pagado = 0
                    estado_pago = "Atrasado"

            if perfil == "bueno" or (perfil == "deterioro" and estado_pago == "Pagado"):
                fecha_pago_actual = (fecha_esperada + timedelta(days=dias_atraso)).strftime("%Y-%m-%d")
            elif perfil == "moroso" and estado_pago == "Pagado":
                fecha_pago_actual = (fecha_esperada + timedelta(days=dias_atraso)).strftime("%Y-%m-%d")
            else:
                fecha_pago_actual = None

            pagos.append({
                "credito_id": cred["id"],
                "num_cuota": cuota_num,
                "fecha_esperada": fecha_esperada.strftime("%Y-%m-%d"),
                "fecha_pago": fecha_pago_actual,
                "monto_esperado": cred["cuota_mensual"],
                "monto_pagado": monto_pagado,
                "dias_atraso": max(0, dias_atraso),
                "estado": estado_pago,
            })

    cursor.executemany(
        """INSERT INTO pagos (credito_id, num_cuota, fecha_esperada, fecha_pago,
                              monto_esperado, monto_pagado, dias_atraso, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [(p["credito_id"], p["num_cuota"], p["fecha_esperada"], p["fecha_pago"],
          p["monto_esperado"], p["monto_pagado"], p["dias_atraso"], p["estado"])
         for p in pagos]
    )
    conn.commit()
    print(f"   ✅ {len(pagos)} pagos insertados")

    pagos_estado = {}
    for p in pagos:
        pagos_estado[p["estado"]] = pagos_estado.get(p["estado"], 0) + 1
    for estado, cnt in sorted(pagos_estado.items()):
        print(f"      - {estado}: {cnt}")

    # ─────────── Generar Transacciones ───────────
    print(f"\n🏦 Generando transacciones...")

    transacciones = []

    for socio_idx, socio in enumerate(socios):
        socio_id = socio_idx + 1
        perfil = socio["perfil"]
        fecha_ingreso = datetime.strptime(socio["fecha_ingreso"], "%Y-%m-%d")

        # Determinar ingreso mensual estimado según perfil
        if perfil == "bueno":
            ingreso_mensual = random.uniform(600, 2500)
            saldo_inicial = random.uniform(500, 5000)
        elif perfil == "deterioro":
            ingreso_mensual = random.uniform(400, 1500)
            saldo_inicial = random.uniform(200, 2000)
        else:
            ingreso_mensual = random.uniform(300, 800)
            saldo_inicial = random.uniform(50, 500)

        saldo = round(saldo_inicial, 2)
        fecha_inicio_tx = max(fecha_ingreso, now - relativedelta(months=18))

        # Generar transacciones mes a mes
        fecha_actual = fecha_inicio_tx
        while fecha_actual < now:
            mes_progreso = (fecha_actual - fecha_inicio_tx).days / max(1, (now - fecha_inicio_tx).days)

            # Número de transacciones por mes según perfil
            if perfil == "bueno":
                n_tx_mes = random.randint(4, 10)
            elif perfil == "deterioro":
                n_tx_mes = random.randint(3, 8)
                # Reducir actividad con el tiempo
                if mes_progreso > 0.7:
                    n_tx_mes = max(1, n_tx_mes - 2)
            else:
                n_tx_mes = random.randint(1, 5)
                if mes_progreso > 0.5:
                    n_tx_mes = max(1, n_tx_mes - 2)

            for _ in range(n_tx_mes):
                dia = random.randint(1, 28)
                fecha_tx = fecha_actual.replace(day=dia)
                if fecha_tx > now:
                    continue

                # Tipo de transacción según perfil
                if perfil == "bueno":
                    tipo = random.choices(
                        ["Depósito", "Retiro", "Transferencia Enviada",
                         "Transferencia Recibida", "Pago Servicios"],
                        weights=[35, 20, 15, 15, 15]
                    )[0]
                elif perfil == "deterioro":
                    # Más retiros con el tiempo
                    w_retiro = 20 + int(mes_progreso * 30)
                    w_deposito = max(10, 35 - int(mes_progreso * 25))
                    tipo = random.choices(
                        ["Depósito", "Retiro", "Transferencia Enviada",
                         "Transferencia Recibida", "Pago Servicios"],
                        weights=[w_deposito, w_retiro, 15, 10, 10]
                    )[0]
                else:  # moroso
                    w_retiro = 35
                    w_deposito = max(5, 20 - int(mes_progreso * 15))
                    tipo = random.choices(
                        ["Depósito", "Retiro", "Transferencia Enviada",
                         "Transferencia Recibida", "Pago Servicios"],
                        weights=[w_deposito, w_retiro, 15, 10, 10]
                    )[0]

                # Monto de la transacción
                if tipo == "Depósito":
                    if perfil == "bueno":
                        monto_tx = round(random.uniform(100, ingreso_mensual * 0.8), 2)
                    elif perfil == "deterioro":
                        factor = max(0.3, 1.0 - mes_progreso * 0.6)
                        monto_tx = round(random.uniform(50, ingreso_mensual * factor), 2)
                    else:
                        monto_tx = round(random.uniform(20, ingreso_mensual * 0.5), 2)
                    saldo += monto_tx

                elif tipo in ["Retiro", "Transferencia Enviada", "Pago Servicios"]:
                    max_retiro = min(saldo * 0.8, ingreso_mensual * 0.5)
                    if perfil == "moroso" or (perfil == "deterioro" and mes_progreso > 0.6):
                        max_retiro = min(saldo * 0.95, ingreso_mensual * 0.8)
                    monto_tx = round(random.uniform(10, max(15, max_retiro)), 2)
                    saldo = max(0, saldo - monto_tx)

                elif tipo == "Transferencia Recibida":
                    monto_tx = round(random.uniform(30, ingreso_mensual * 0.4), 2)
                    saldo += monto_tx

                saldo = round(max(0, saldo), 2)
                descripcion = random.choice(DESCRIPCIONES_TRANSACCION.get(tipo, ["Transacción"]))

                transacciones.append({
                    "socio_id": socio_id,
                    "tipo": tipo,
                    "monto": monto_tx,
                    "fecha": fecha_tx.strftime("%Y-%m-%d"),
                    "saldo_resultante": saldo,
                    "descripcion": descripcion,
                })

            fecha_actual += relativedelta(months=1)

        # Ajustar saldos finales para morosos
        if perfil == "moroso":
            saldo = round(random.uniform(0, 50), 2)
            # Actualizar última transacción
            socio_txs = [t for t in transacciones if t["socio_id"] == socio_id]
            if socio_txs:
                socio_txs[-1]["saldo_resultante"] = saldo

    # Ordenar transacciones por fecha
    transacciones.sort(key=lambda t: (t["socio_id"], t["fecha"]))

    cursor.executemany(
        """INSERT INTO transacciones (socio_id, tipo, monto, fecha,
                                      saldo_resultante, descripcion)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [(t["socio_id"], t["tipo"], t["monto"], t["fecha"],
          t["saldo_resultante"], t["descripcion"])
         for t in transacciones]
    )
    conn.commit()
    print(f"   ✅ {len(transacciones)} transacciones insertadas")

    tx_tipos = {}
    for t in transacciones:
        tx_tipos[t["tipo"]] = tx_tipos.get(t["tipo"], 0) + 1
    for tipo, cnt in sorted(tx_tipos.items()):
        print(f"      - {tipo}: {cnt}")

    conn.close()

    print("\n" + "=" * 60)
    print("  ✅ Base de datos generada exitosamente")
    print(f"  📂 Ubicación: {db_path}")
    print(f"  👥 Socios: {n_socios}")
    print(f"  💰 Créditos: {len(creditos)}")
    print(f"  📄 Pagos: {len(pagos)}")
    print(f"  🏦 Transacciones: {len(transacciones)}")
    print("=" * 60)


if __name__ == "__main__":
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "data", "cooptech.db")
    generate_data(db_path)
