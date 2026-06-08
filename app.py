import os
from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
from pymongo import MongoClient
import requests  
import threading

app = Flask(__name__)

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
    "agendaDias": {}          
}

def cargar_datos():
    datos = coleccion.find_one({"_id": "configuracion_box"})
    if not datos:
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
                "personas": []
            }
        datos_nuevos = {
            "_id": "configuracion_box",
            "listaRuts": [],
            "fechasHabilitadas": fechas,
            "agendaDias": agenda
        }
        coleccion.insert_one(datos_nuevos)
        return datos_nuevos
    return datos

def guardar_datos(datos):
    coleccion.update_one({"_id": "configuracion_box"}, {"$set": datos}, upsert=True)

def enviar_correo_confirmacion(email_destino, nombre, fecha, hora):
    """Envía el correo usando la API web de Brevo (Evita los bloqueos de Render)."""
    url = "https://api.brevo.com/v3/smtp/email"
    
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }
    
    # Estructura del correo que pide Brevo
    payload = {
        "sender": {"name": "Gimnasio PGW", "email": EMAIL_REMITENTE},
        "to": [{"email": email_destino, "name": nombre}],
        "subject": "¡Reserva Confirmada en el Box!",
        "textContent": f"Hola {nombre},\n\nTu reserva ha sido confirmada con éxito.\n📅 Fecha: {fecha}\n⏰ Hora: {hora}:00 AM\n\n¡Prepárate con todo para el entrenamiento! Nos vemos en el Box."
    }
    
    try:
        # Hacemos una petición web normal, Render no la bloquea
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code in [200, 201, 202]:
            print(f"Correo enviado exitosamente a {email_destino} vía Brevo")
        else:
            print(f"Brevo rechazó el correo: {response.text}")
    except Exception as e:
        print(f"Error al conectar con la API de Brevo: {e}")

# --- RUTAS DE NAVEGACIÓN (PÁGINAS) ---

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
    lista_ruts_limpios = [str(r).strip().lower() for r in datos.get("listaRuts", [])]
    
    if rut_usuario in lista_ruts_limpios:
        return jsonify({"success": True, "message": "RUT authorized. Welcome!"})
    return jsonify({"success": False, "message": "El RUT ingresado no figura como alumno activo del Box."}), 403

@app.route('/api/reservar', methods=['POST'])
def reservar():
    data = request.json
    fecha = str(data.get('fecha')) 
    hora = str(data.get('hora'))   
    nombre = data.get('nombre')
    email = str(data.get('email')).strip().lower()
    rut = str(data.get('rut', '')).strip().lower()
    
    datos = cargar_datos()
    
    if fecha not in datos["fechasHabilitadas"] or fecha not in datos["agendaDias"]:
        return jsonify({"success": False, "message": "Esta fecha no se encuentra habilitada para reservas."}), 400
        
    dia_actual = datos["agendaDias"][fecha]
    
    for persona in dia_actual.get("personas", []):
        if persona.get("email") == email or (rut != "" and persona.get("rut") == rut):
            return jsonify({
                "success": False, 
                "message": f"Ya tienes una reserva registrada para este día en el horario de las {persona['hora']}. Solo se permite 1 cupo diario."
            }), 400
            
    if hora in dia_actual and dia_actual[hora]["disponibles"] > 0:
        dia_actual[hora]["disponibles"] -= 1
        dia_actual["personas"].append({
            "hora": f"{hora}:00 AM",
            "nombre": nombre,
            "email": email,
            "rut": rut 
        })
        
        guardar_datos(datos)
        
        # Enviar correo en segundo plano usando Brevo
        hilo_correo = threading.Thread(target=enviar_correo_confirmacion, args=(email, nombre, fecha, hora))
        hilo_correo.start()
        
        return jsonify({"success": True, "message": f"¡Reserva confirmada para el {fecha} a las {hora}:00 AM!"})
    
    return jsonify({"success": False, "message": "No quedan cupos disponibles para este horario."}), 400

@app.route('/api/cancelar', methods=['POST'])
def cancelar():
    data = request.json
    fecha = str(data.get('fecha'))
    hora = str(data.get('hora'))
    rut_solicitante = str(data.get('rut', '')).strip().lower()
    texto_hora = f"{hora}:00 AM"
    
    datos = cargar_datos()
    if fecha not in datos["agendaDias"]:
        return jsonify({"success": False, "message": "Fecha no válida."}), 400
        
    dia_actual = datos["agendaDias"][fecha]
    
    eliminado = False
    for i, persona in enumerate(dia_actual.get("personas", [])):
        if persona["hora"] == texto_hora:
            if persona.get("rut") == rut_solicitante:
                dia_actual["personas"].pop(i)
                eliminado = True
                break
            else:
                return jsonify({"success": False, "message": "No puedes cancelar una reserva que no te pertenece."}), 403
            
    if eliminado and hora in dia_actual and dia_actual[hora]["disponibles"] < dia_actual[hora]["totales"]:
        dia_actual[hora]["disponibles"] += 1
        guardar_datos(datos)
        return jsonify({"success": True, "message": "Tu cupo ha sido liberado con éxito."})
        
    return jsonify({"success": False, "message": "No tienes reservas registradas en este horario para cancelar."}), 400

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
    c8 = int(data.get('cupos_8', 10))
    c9 = int(data.get('cupos_9', 10))
    c10 = int(data.get('cupos_10', 10))

    datos = cargar_datos()

    for dia_str, dia_data in datos.get("agendaDias", {}).items():
        if "8" in dia_data:
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
    return jsonify({"success": True, "message": "¡Cupos actualizados correctamente!"})

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
    return jsonify({"success": True, "message": f"Calendario modificado ({accion}r)."})

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
                return jsonify({"success": True, "message": "Usuario eliminado."})
    return jsonify({"success": False, "message": "No encontrado."}), 404

@app.route('/api/admin/agregar-rut', methods=['POST'])
def admin_agregar_rut():
    data = request.json
    nuevo_rut = str(data.get('rut')).strip()
    datos = cargar_datos()
    if nuevo_rut in datos["listaRuts"]:
        return jsonify({"success": False, "message": "Este RUT ya existe."}), 400
    datos["listaRuts"].append(nuevo_rut)
    guardar_datos(datos)
    return jsonify({"success": True, "message": "RUT agregado."})

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
    import os
    puerto = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=puerto, debug=False)
