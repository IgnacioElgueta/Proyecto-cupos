import os
from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
from pymongo import MongoClient
import requests
import threading

app = Flask(__name__)

# --- PREVENIR CACHÉ DEL NAVEGADOR PARA LA API ---
@app.after_request
def add_header(response):
    if 'api/' in request.path:
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# --- CONFIGURACIÓN DE BREVO (EL MENSAJERO) ---
EMAIL_REMITENTE = "Gimnasiopgw@gmail.com"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")  

# --- CONFIGURACIÓN DE MONGO ---
MONGO_URI = "mongodb+srv://Cupos_prog:Entrenamiento34@cluster0.vyxg5ux.mongodb.net/?appName=Cluster0"

cliente_mongo = MongoClient(MONGO_URI)
db = cliente_mongo['box_db']          
coleccion = db['sistema']             

DATOS_INICIALES = {
    "_id": "configuracion_box",       
    "listaRuts": [],
    "fechasHabilitadas": [],  
    "agendaDias": {},
    "cuposBase": {
        "7:00": 10, "8:15": 10, "9:30": 10, "11:00": 10, "14:30": 10
    }          
}

def cargar_datos():
    datos = coleccion.find_one({"_id": "configuracion_box"})
    
    # 1. Si no hay nada, creamos todo desde cero
    if not datos:
        hoy = datetime.now()
        fechas = []
        agenda = {}
        cupos = DATOS_INICIALES["cuposBase"] 
        for i in range(14):
            dia_str = (hoy + timedelta(days=i)).strftime("%Y-%m-%d")
            fechas.append(dia_str)
            agenda[dia_str] = {
                "7:00": {"disponibles": cupos["7:00"], "totales": cupos["7:00"]},
                "8:15": {"disponibles": cupos["8:15"], "totales": cupos["8:15"]},
                "9:30": {"disponibles": cupos["9:30"], "totales": cupos["9:30"]},
                "11:00": {"disponibles": cupos["11:00"], "totales": cupos["11:00"]},
                "14:30": {"disponibles": cupos["14:30"], "totales": cupos["14:30"]},
                "personas": []
            }
        datos_nuevos = {
            "_id": "configuracion_box",
            "listaRuts": [],
            "fechasHabilitadas": fechas,
            "agendaDias": agenda,
            "cuposBase": cupos
        }
        coleccion.insert_one(datos_nuevos)
        return datos_nuevos
    
    # --- ACTUALIZACIÓN DINÁMICA ---
    hubo_cambios = False
    
    if "cuposBase" not in datos:
        datos["cuposBase"] = DATOS_INICIALES["cuposBase"]
        hubo_cambios = True
        
    cupos_maestros = datos["cuposBase"]
    
    if "agendaDias" in datos:
        for dia_str, dia_data in datos["agendaDias"].items():
            for hora_nueva, capacidad in cupos_maestros.items():
                if hora_nueva not in dia_data:
                    dia_data[hora_nueva] = {"disponibles": capacidad, "totales": capacidad}
                    hubo_cambios = True
                    
    if hubo_cambios:
        guardar_datos(datos)
        
    return datos

def guardar_datos(datos):
    coleccion.update_one({"_id": "configuracion_box"}, {"$set": datos}, upsert=True)

def enviar_correo_confirmacion(email_destino, nombre, fecha, hora):
    if not email_destino:
        return
        
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }
    payload = {
        "sender": {"name": "Gimnasio PGW", "email": EMAIL_REMITENTE},
        "to": [{"email": email_destino, "name": nombre}],
        "subject": "¡Reserva Confirmada en el Box!",
        "textContent": f"Hola {nombre},\n\nTu reserva ha sido confirmada con éxito.\n📅 Fecha: {fecha}\n⏰ Hora: {hora}\n\n¡Prepárate con todo para el entrenamiento! Nos vemos en el Box."
    }
    try:
        requests.post(url, json=payload, headers=headers)
    except Exception as e:
        print(f"Error al conectar con la API de Brevo: {e}")


# --- RUTAS DE NAVEGACIÓN ---
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/admin-box')
def admin_page():
    return render_template('admin.html')


# --- ENDPOINTS DE LA API ---
@app.route('/api/datos', methods=['GET'])
def obtener_datos():
    datos = cargar_datos()
    if "_id" in datos:
        del datos["_id"]
    return jsonify(datos)

@app.route('/api/verificar-rut', methods=['POST'])
def verificar_rut():
    data = request.json
    rut_usuario = str(data.get('rut')).strip().lower()
    datos = cargar_datos()
    
    for r in datos.get("listaRuts", []):
        rut_guardado = r.get("rut").strip().lower() if isinstance(r, dict) else str(r).strip().lower()
        if rut_guardado == rut_usuario:
            return jsonify({"success": True, "message": "RUT autorizado. ¡Bienvenido!"})
            
    return jsonify({"success": False, "message": "El RUT ingresado no figura como alumno activo del Box."}), 403

@app.route('/api/reservar', methods=['POST'])
def reservar():
    data = request.json
    fecha = str(data.get('fecha')) 
    hora = str(data.get('hora'))   
    rut_ingresado = str(data.get('rut', '')).strip().lower()
    
    hora_key = hora.replace(" AM", "").replace(" PM", "").strip()
    datos = cargar_datos()
    
    # Extraer mágicamente los datos del alumno usando el RUT
    alumno_encontrado = next((item for item in datos.get("listaRuts", []) if (item.get("rut") if isinstance(item, dict) else str(item)).strip().lower() == rut_ingresado), None)
    
    if not alumno_encontrado:
        return jsonify({"success": False, "message": "Tu RUT no está autorizado para reservar."}), 403
        
    # Obtener nombre y correo (manejo seguro por si antes eran solo strings)
    nombre = alumno_encontrado.get("nombre", "Usuario Box") if isinstance(alumno_encontrado, dict) else "Usuario Box"
    email = alumno_encontrado.get("email", "") if isinstance(alumno_encontrado, dict) else ""
    
    if fecha not in datos["fechasHabilitadas"] or fecha not in datos["agendaDias"]:
        return jsonify({"success": False, "message": "Esta fecha no se encuentra habilitada para reservas."}), 400
        
    dia_actual = datos["agendaDias"][fecha]
    
    # Validar si ya tiene reserva en ESA MISMA hora
    for persona in dia_actual.get("personas", []):
        if persona["hora"] == hora:
            rut_guardado = persona.get("rut", "").strip().lower()
            if rut_ingresado != "" and rut_ingresado == rut_guardado:
                return jsonify({
                    "success": False, 
                    "message": f"Ya tienes una reserva registrada a las {hora} para este día."
                }), 400
            
    if hora_key in dia_actual and dia_actual[hora_key]["disponibles"] > 0:
        dia_actual[hora_key]["disponibles"] -= 1
        dia_actual["personas"].append({
            "hora": hora,
            "nombre": nombre,
            "email": email,
            "rut": rut_ingresado 
        })
        
        guardar_datos(datos)
        
        # Enviar correo en segundo plano solo si existe un email registrado
        if email:
            hilo_correo = threading.Thread(target=enviar_correo_confirmacion, args=(email, nombre, fecha, hora))
            hilo_correo.start()
        
        mensaje_exito = f"¡Reserva confirmada para el {fecha} a las {hora}!\n\nSi no puede asistir, por favor dar aviso al WhatsApp: +56 9 5650 4103"
        return jsonify({"success": True, "message": mensaje_exito})
    
    return jsonify({"success": False, "message": "No quedan cupos disponibles para este horario."}), 400

@app.route('/api/cancelar', methods=['POST'])
def cancelar():
    data = request.json
    fecha = str(data.get('fecha'))
    hora = str(data.get('hora')) 
    rut_solicitante = str(data.get('rut', '')).strip().lower()
    
    hora_key = hora.replace(" AM", "").replace(" PM", "").strip()
    datos = cargar_datos()
    
    if fecha not in datos["agendaDias"]:
        return jsonify({"success": False, "message": "Fecha no válida."}), 400
        
    dia_actual = datos["agendaDias"][fecha]
    eliminado = False
    
    for i, persona in enumerate(dia_actual.get("personas", [])):
        rut_guardado = persona.get("rut", "").strip().lower()
        if persona["hora"] == hora and rut_guardado == rut_solicitante and rut_solicitante != "":
            dia_actual["personas"].pop(i)
            eliminado = True
            break
            
    if eliminado:
        if hora_key in dia_actual and dia_actual[hora_key]["disponibles"] < dia_actual[hora_key]["totales"]:
            dia_actual[hora_key]["disponibles"] += 1
        guardar_datos(datos)
        return jsonify({"success": True, "message": f"Tu cupo de las {hora} para el día {fecha} ha sido liberado con éxito."})
        
    return jsonify({"success": False, "message": f"No encontramos una reserva a tu nombre para el día {fecha} a las {hora}."}), 400

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    usuario = data.get('usuario')
    password = data.get('password')
    if usuario == "admin" and password == "Entrenamiento":
        return jsonify({"success": True, "message": "Acceso concedido"})
    return jsonify({"success": False, "message": "Credenciales incorrectas"}), 401

@app.route('/api/admin/guardar-cupos', methods=['POST'])
def admin_guardar_cupos():
    data = request.json
    nuevos_cupos = {
        "7:00": int(data.get('7:00', 10)),
        "8:15": int(data.get('8:15', 10)),
        "9:30": int(data.get('9:30', 10)),
        "11:00": int(data.get('11:00', 10)),
        "14:30": int(data.get('14:30', 10))
    }

    datos = cargar_datos()
    datos["cuposBase"] = nuevos_cupos

    for dia_str, dia_data in datos.get("agendaDias", {}).items():
        for clave_hora, capacidad in nuevos_cupos.items():
            if clave_hora in dia_data:
                ocupados = sum(1 for p in dia_data.get("personas", []) if p["hora"].replace(" AM", "").replace(" PM", "").strip() == clave_hora)
                dia_data[clave_hora]["totales"] = capacidad
                dia_data[clave_hora]["disponibles"] = max(0, capacidad - ocupados)

    guardar_datos(datos)
    return jsonify({"success": True, "message": "¡Cupos base actualizados y aplicados a todo el calendario!"})

@app.route('/api/admin/configurar-calendario', methods=['POST'])
def admin_configurar_calendario():
    data = request.json
    fecha_inicio_str = data.get('fechaInicio')
    fecha_fin_str = data.get('fechaFin')
    accion = data.get('accion')
    
    if not fecha_inicio_str or not fecha_fin_str:
        return jsonify({"success": False, "message": "Debes seleccionar ambas fechas."}), 400
        
    datos = cargar_datos()
    inicio = datetime.strptime(fecha_inicio_str, "%Y-%m-%d")
    fin = datetime.strptime(fecha_fin_str, "%Y-%m-%d")
    
    curr = inicio
    while curr <= fin:
        dia_str = curr.strftime("%Y-%m-%d")
        if accion == "habilitar":
            if dia_str not in datos["fechasHabilitadas"]:
                datos["fechasHabilitadas"].append(dia_str)
            if dia_str not in datos["agendaDias"]:
                cupos_maestros = datos.get("cuposBase", DATOS_INICIALES["cuposBase"])
                datos["agendaDias"][dia_str] = {
                    "7:00": {"disponibles": cupos_maestros["7:00"], "totales": cupos_maestros["7:00"]},
                    "8:15": {"disponibles": cupos_maestros["8:15"], "totales": cupos_maestros["8:15"]},
                    "9:30": {"disponibles": cupos_maestros["9:30"], "totales": cupos_maestros["9:30"]},
                    "11:00": {"disponibles": cupos_maestros["11:00"], "totales": cupos_maestros["11:00"]},
                    "14:30": {"disponibles": cupos_maestros["14:30"], "totales": cupos_maestros["14:30"]},
                    "personas": []
                }
        elif accion == "deshabilitar":
            if dia_str in datos["fechasHabilitadas"]:
                datos["fechasHabilitadas"].remove(dia_str)
        curr += timedelta(days=1)
        
    guardar_datos(datos)
    return jsonify({"success": True, "message": f"Calendario modificado ({accion}r)."})

@app.route('/api/admin/eliminar-usuario', methods=['POST'])
def admin_eliminar_usuario():
    data = request.json
    fecha = str(data.get('fecha'))
    rut_a_eliminar = str(data.get('rut', '')).strip().lower()
    hora_persona = data.get('hora')
    
    hora_clave = hora_persona.replace(" AM", "").replace(" PM", "").strip()
    
    datos = cargar_datos()
    if fecha in datos["agendaDias"]:
        dia_actual = datos["agendaDias"][fecha]
        for i, persona in enumerate(dia_actual.get("personas", [])):
            if persona.get("rut", "").strip().lower() == rut_a_eliminar and persona["hora"] == hora_persona:
                dia_actual["personas"].pop(i)
                if hora_clave in dia_actual:
                    dia_actual[hora_clave]["disponibles"] += 1
                guardar_datos(datos)
                return jsonify({"success": True, "message": "Reserva eliminada con éxito."})
    return jsonify({"success": False, "message": "Reserva no encontrada."}), 404

@app.route('/api/admin/agregar-rut', methods=['POST'])
def admin_agregar_rut():
    data = request.json
    nuevo_rut = str(data.get('rut')).strip()
    nombre = str(data.get('nombre', '')).strip()
    email = str(data.get('email', '')).strip()
    
    datos = cargar_datos()
    
    for r in datos["listaRuts"]:
        rut_guardado = r.get("rut") if isinstance(r, dict) else r
        if rut_guardado == nuevo_rut:
            return jsonify({"success": False, "message": "Este RUT ya existe en el sistema."}), 400
            
    datos["listaRuts"].append({"rut": nuevo_rut, "nombre": nombre, "email": email})
    guardar_datos(datos)
    return jsonify({"success": True, "message": "Alumno registrado con éxito."})

@app.route('/api/admin/eliminar-rut', methods=['POST'])
def admin_eliminar_rut():
    data = request.json
    rut_a_eliminar = str(data.get('rut')).strip()
    datos = cargar_datos()
    
    for i, r in enumerate(datos["listaRuts"]):
        rut_guardado = r.get("rut") if isinstance(r, dict) else r
        if rut_guardado == rut_a_eliminar:
            datos["listaRuts"].pop(i)
            guardar_datos(datos)
            return jsonify({"success": True, "message": "RUT eliminado del sistema."})
            
    return jsonify({"success": False, "message": "RUT no encontrado."}), 404

# --- NUEVA FUNCIÓN: RADAR DE ALUMNOS ---
@app.route('/api/admin/radar', methods=['POST'])
def radar_alumno():
    data = request.json
    rut_buscado = str(data.get('rut', '')).strip().lower()
    
    datos = cargar_datos()
    reservas_encontradas = []
    
    # Recorremos todos los días de la agenda buscando a la persona
    for fecha, dia_data in datos.get("agendaDias", {}).items():
        if "personas" in dia_data:
            for persona in dia_data["personas"]:
                if persona.get("rut", "").strip().lower() == rut_buscado:
                    reservas_encontradas.append({
                        "fecha": fecha,
                        "hora": persona.get("hora")
                    })
                    
    # Ordenamos por fecha para que sea más legible en el panel
    reservas_encontradas.sort(key=lambda x: x["fecha"])
    
    return jsonify({"success": True, "reservas": reservas_encontradas})

if __name__ == '__main__':
    puerto = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=puerto, debug=False)
    