from flask import Flask, render_template, jsonify, request
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__)

# Archivo permanente en el disco de Render
ARCHIVO_DB = "datos_box.json"

# Configuración base inicial
DATOS_INICIALES = {
    "listaRuts": [],
    "fechasHabilitadas": [],  # Ejemplo: ["2026-06-08", "2026-06-09"]
    "agendaDias": {}          # Estructura: {"2026-06-08": {"8": {"disponibles": 10, "totales": 10}, ...}}
}

def cargar_datos():
    """Carga los datos desde el archivo permanente y auto-genera días si está vacío."""
    if not os.path.exists(ARCHIVO_DB):
        # Por defecto, habilitamos las próximas 2 semanas de forma automática al inicio
        hoy = datetime.now()
        fechas = []
        agenda = {}
        for i in range(14):
            dia_str = (hoy + timedelta(days=i)).strftime("%Y-%m-%d")
            fechas.append(dia_str)
            agenda[dia_str] = {
                "8": {"disponibles": 10, "totales": 10},
                "9": {"disponibles": 10, "totales": 10},
                "10": {"disponibles": 10, "totales": 10},
                "personas": [] # Las personas ahora se guardan por cada día específico
            }
        
        datos = {
            "listaRuts": [],
            "fechasHabilitadas": fechas,
            "agendaDias": agenda
        }
        guardar_datos(datos)
        return datos
    
    try:
        with open(ARCHIVO_DB, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return DATOS_INICIALES

def guardar_datos(datos):
    """Guarda los datos actuales en el archivo permanente."""
    with open(ARCHIVO_DB, 'w', encoding='utf-8') as f:
        json.dump(datos, f, indent=4, ensure_ascii=False)


# --- RUTAS DE NAVEGACIÓN (PÁGINAS) ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/admin-box')
def admin_page():
    return render_template('admin.html')


# --- ENDPOINTS DE LA API (LÓGICA DEL SISTEMA) ---

@app.route('/api/datos', methods=['GET'])
def obtener_datos():
    datos = cargar_datos()
    return jsonify(datos)

# API: Verificar RUT del Alumno
@app.route('/api/verificar-rut', methods=['POST'])
def verificar_rut():
    data = request.json
    rut_usuario = str(data.get('rut')).strip().lower()
    
    datos = cargar_datos()
    lista_ruts_limpios = [str(r).strip().lower() for r in datos.get("listaRuts", [])]
    
    if rut_usuario in lista_ruts_limpios:
        return jsonify({"success": True, "message": "RUT autorizado. ¡Bienvenido!"})
    
    return jsonify({"success": False, "message": "El RUT ingresado no figura como alumno activo del Box."}), 403

# API: Reservar Cupo con Fecha Específica
@app.route('/api/reservar', methods=['POST'])
def reservar():
    data = request.json
    fecha = str(data.get('fecha')) # Recibimos la fecha elegida (ej: "2026-06-08")
    hora = str(data.get('hora'))   # Recibimos la hora (ej: "8")
    nombre = data.get('nombre')
    email = str(data.get('email')).strip().lower()
    
    datos = cargar_datos()
    
    # Validar si la fecha está habilitada por el admin
    if fecha not in datos["fechasHabilitadas"] or fecha not in datos["agendaDias"]:
        return jsonify({"success": False, "message": "Esta fecha no se encuentra habilitada para reservas."}), 400
        
    dia_actual = datos["agendaDias"][fecha]
    
    # 🔥 ESCUDO ANTITRAMPAS: Verificar si este correo ya reservó para ESTE MISMO DÍA
    for persona in dia_actual.get("personas", []):
        if persona["email"] == email:
            return jsonify({
                "success": False, 
                "message": f"Ya tienes una reserva registrada para este día en el horario de las {persona['hora']}. Solo se permite 1 cupo diario."
            }), 400
            
    # Proceder con la reserva en la fecha y hora correspondiente
    if hora in dia_actual and dia_actual[hora]["disponibles"] > 0:
        dia_actual[hora]["disponibles"] -= 1
        dia_actual["personas"].append({
            "hora": f"{hora}:00 AM",
            "nombre": nombre,
            "email": email
        })
        
        guardar_datos(datos)
        return jsonify({"success": True, "message": f"¡Reserva confirmada para el {fecha} a las {hora}:00 AM!"})
    
    return jsonify({"success": False, "message": "No quedan cupos disponibles para este horario."}), 400

# API: Cancelar Cupo en Fecha Específica
@app.route('/api/cancelar', methods=['POST'])
def cancelar():
    data = request.json
    fecha = str(data.get('fecha'))
    hora = str(data.get('hora'))
    texto_hora = f"{hora}:00 AM"
    
    datos = cargar_datos()
    if fecha not in datos["agendaDias"]:
        return jsonify({"success": False, "message": "Fecha no válida."}), 400
        
    dia_actual = datos["agendaDias"][fecha]
    
    eliminado = False
    for i, persona in enumerate(dia_actual.get("personas", [])):
        if persona["hora"] == texto_hora:
            dia_actual["personas"].pop(i)
            eliminado = True
            break
            
    if eliminado and hora in dia_actual and dia_actual[hora]["disponibles"] < dia_actual[hora]["totales"]:
        dia_actual[hora]["disponibles"] += 1
        guardar_datos(datos)
        return jsonify({"success": True, "message": "Cupo liberado con éxito."})
        
    return jsonify({"success": False, "message": "No tienes reservas que cancelar en este horario."}), 400


# --- ENDPOINTS DEL ADMINISTRADOR ---

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    usuario = data.get('usuario')
    password = data.get('password')
    if usuario == "admin" and password == "Entrenamiento":
        return jsonify({"success": True, "message": "Acceso concedido"})
    return jsonify({"success": False, "message": "Credenciales incorrectas"}), 401

# API ADMIN: Guardar nueva capacidad de cupos
@app.route('/api/admin/guardar-cupos', methods=['POST'])
def admin_guardar_cupos():
    data = request.json
    c8 = int(data.get('cupos_8', 10))
    c9 = int(data.get('cupos_9', 10))
    c10 = int(data.get('cupos_10', 10))

    datos = cargar_datos()

    # Actualizamos los cupos para todos los días registrados
    for dia_str, dia_data in datos.get("agendaDias", {}).items():
        if "8" in dia_data:
            # Calculamos cuántos hay ocupados para ajustar los disponibles reales
            ocupados = sum(1 for p in dia_data.get("personas", []) if p["hora"] == "8:00 AM")
            dia_data["8"]["totales"] = c8
            dia_data["8"]["disponibles"] = max(0, c8 - ocupados)
            
        if "9" in dia_data:
            ocupados = sum(1 for p in dia_data.get("personas", []) if p["hora"] == "9:00 AM")
            dia_data["9"]["totales"] = c9
            dia_data["9"]["disponibles"] = max(0, c9 - ocupados)
            
        if "10" in dia_data:
            ocupados = sum(1 for p in dia_data.get("personas", []) if p["hora"] == "10:00 AM")
            dia_data["10"]["totales"] = c10
            dia_data["10"]["disponibles"] = max(0, c10 - ocupados)

    guardar_datos(datos)
    return jsonify({"success": True, "message": "¡Cupos actualizados correctamente en todo el calendario!"})

# API ADMIN: Habilitar o Deshabilitar Rangos de Fechas
@app.route('/api/admin/configurar-calendario', methods=['POST'])
def admin_configurar_calendario():
    data = request.json
    fecha_inicio_str = data.get('fechaInicio')
    fecha_fin_str = data.get('fechaFin')
    accion = data.get('accion') # "habilitar" o "deshabilitar"
    
    if not fecha_inicio_str or not fecha_fin_str:
        return jsonify({"success": False, "message": "Debes seleccionar ambas fechas."}), 400
        
    datos = cargar_datos()
    
    inicio = datetime.strptime(fecha_inicio_str, "%Y-%m-%d")
    fin = datetime.strptime(fecha_fin_str, "%Y-%m-%d")
    
    # Recorrer todos los días del rango seleccionado
    curr = inicio
    while curr <= fin:
        dia_str = curr.strftime("%Y-%m-%d")
        
        if accion == "habilitar":
            if dia_str not in datos["fechasHabilitadas"]:
                datos["fechasHabilitadas"].append(dia_str)
            if dia_str not in datos["agendaDias"]:
                # Si el día no existía, lo creamos con cupos base estándar (10)
                datos["agendaDias"][dia_str] = {
                    "8": {"disponibles": 10, "totales": 10},
                    "9": {"disponibles": 10, "totales": 10},
                    "10": {"disponibles": 10, "totales": 10},
                    "personas": []
                }
        elif accion == "deshabilitar":
            if dia_str in datos["fechasHabilitadas"]:
                datos["fechasHabilitadas"].remove(dia_str)
                
        curr += timedelta(days=1)
        
    guardar_datos(datos)
    return jsonify({"success": True, "message": f"Semanas/Días modificados con éxito ({accion}r)."})

@app.route('/api/admin/eliminar-usuario', methods=['POST'])
def admin_eliminar_usuario():
    data = request.json
    fecha = str(data.get('fecha'))
    email_a_eliminar = data.get('email')
    hora_persona = data.get('hora')
    hora_clave = hora_persona.split(":")[0]
    
    datos = cargar_datos()
    if fecha in datos["agendaDias"]:
        dia_actual = datos["agendaDias"][fecha]
        for i, persona in enumerate(dia_actual.get("personas", [])):
            if persona["email"] == email_a_eliminar and persona["hora"] == hora_persona:
                dia_actual["personas"].pop(i)
                if hora_clave in dia_actual:
                    dia_actual[hora_clave]["disponibles"] += 1
                guardar_datos(datos)
                return jsonify({"success": True, "message": "Usuario eliminado del día."})
                
    return jsonify({"success": False, "message": "Registro no encontrado."}), 404

@app.route('/api/admin/agregar-rut', methods=['POST'])
def admin_agregar_rut():
    data = request.json
    nuevo_rut = str(data.get('rut')).strip()
    datos = cargar_datos()
    if nuevo_rut in datos["listaRuts"]:
        return jsonify({"success": False, "message": "Este RUT ya existe."}), 400
    datos["listaRuts"].append(nuevo_rut)
    guardar_datos(datos)
    return jsonify({"success": True, "message": "RUT agregado con éxito."})

@app.route('/api/admin/eliminar-rut', methods=['POST'])
def admin_eliminar_rut():
    data = request.json
    rut_a_eliminar = str(data.get('rut')).strip()
    datos = cargar_datos()
    if rut_a_eliminar in datos["listaRuts"]:
        datos["listaRuts"].remove(rut_a_eliminar)
        guardar_datos(datos)
        return jsonify({"success": True, "message": "RUT eliminado."})
    return jsonify({"success": False, "message": "No encontrado."}), 404

if __name__ == '__main__':
    app.run(debug=True)
    