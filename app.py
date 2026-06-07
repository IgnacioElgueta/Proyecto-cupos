from flask import Flask, render_template, jsonify, request
import json
import os

app = Flask(__name__)

# Archivo permanente en el disco de Render para que no se borren los datos
ARCHIVO_DB = "datos_box.json"

# Configuración base por si el archivo no existe la primera vez
DATOS_INICIALES = {
    "datosCupos": {
        "8": {"disponibles": 10, "totales": 10},
        "9": {"disponibles": 10, "totales": 10},
        "10": {"disponibles": 10, "totales": 10}
    },
    "listaPersonas": []
}

def cargar_datos():
    """Carga los datos desde el archivo permanente."""
    if not os.path.exists(ARCHIVO_DB):
        with open(ARCHIVO_DB, 'w', encoding='utf-8') as f:
            json.dump(DATOS_INICIALES, f, indent=4, ensure_ascii=False)
        return DATOS_INICIALES
    
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


# --- ENDPOINTS DE LA API (LÓGICA) ---

@app.route('/api/datos', methods=['GET'])
def obtener_datos():
    datos = cargar_datos()
    return jsonify(datos)

@app.route('/api/reservar', methods=['POST'])
def reservar():
    data = request.json
    hora = str(data.get('hora'))
    nombre = data.get('nombre')
    email = data.get('email')
    
    datos = cargar_datos()
    datos_cupos = datos["datosCupos"]
    lista_personas = datos["listaPersonas"]
    
    if hora in datos_cupos and datos_cupos[hora]["disponibles"] > 0:
        datos_cupos[hora]["disponibles"] -= 1
        lista_personas.append({
            "hora": f"{hora}:00 AM",
            "nombre": nombre,
            "email": email
        })
        
        guardar_datos(datos)
        return jsonify({"success": True, "message": f"¡Reserva confirmada para las {hora}:00 AM!"})
    
    return jsonify({"success": False, "message": "No quedan cupos disponibles."}), 400

@app.route('/api/cancelar', methods=['POST'])
def cancelar():
    data = request.json
    hora = str(data.get('hora'))
    texto_hora = f"{hora}:00 AM"
    
    datos = cargar_datos()
    datos_cupos = datos["datosCupos"]
    lista_personas = datos["listaPersonas"]
    
    eliminado = False
    for i, persona in enumerate(lista_personas):
        if persona["hora"] == texto_hora:
            lista_personas.pop(i)
            eliminado = True
            break
            
    if eliminado and hora in datos_cupos and datos_cupos[hora]["disponibles"] < datos_cupos[hora]["totales"]:
        datos_cupos[hora]["disponibles"] += 1
        guardar_datos(datos)
        return jsonify({"success": True, "message": "Cupo liberado con éxito."})
        
    return jsonify({"success": False, "message": "No hay reservas que cancelar."}), 400

# API NUEVA: Permite al administrador eliminar un usuario y devolver su cupo
@app.route('/api/admin/eliminar-usuario', methods=['POST'])
def admin_eliminar_usuario():
    data = request.json
    email_a_eliminar = data.get('email')
    hora_persona = data.get('hora') # Ejemplo: "8:00 AM"
    
    # Extraer sólo el número de la hora (ej: "8:00 AM" -> "8")
    hora_clave = hora_persona.split(":")[0]
    
    datos = cargar_datos()
    datos_cupos = datos["datosCupos"]
    lista_personas = datos["listaPersonas"]
    
    eliminado = False
    for i, persona in enumerate(lista_personas):
        if persona["email"] == email_a_eliminar and persona["hora"] == hora_persona:
            lista_personas.pop(i)
            eliminado = True
            break
            
    if eliminado:
        if hora_clave in datos_cupos and datos_cupos[hora_clave]["disponibles"] < datos_cupos[hora_clave]["totales"]:
            datos_cupos[hora_clave]["disponibles"] += 1
        
        guardar_datos(datos)
        return jsonify({"success": True, "message": "Usuario eliminado y cupo liberado con éxito."})
        
    return jsonify({"success": False, "message": "No se encontró el registro del usuario."}), 404

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    usuario = data.get('usuario')
    password = data.get('password')
    
    USUARIO_CORRECTO = "admin"
    PASSWORD_CORRECTA = "Entrenamiento"
    
    if usuario == USUARIO_CORRECTO and password == PASSWORD_CORRECTA:
        return jsonify({"success": True, "message": "Acceso concedido"})
    
    return jsonify({"success": False, "message": "Usuario o contraseña incorrectos"}), 401

@app.route('/api/admin/actualizar', methods=['POST'])
def actualizar_admin():
    data = request.json
    datos = cargar_datos()
    datos_cupos = datos["datosCupos"]
    
    for hora, nuevo_total in data.items():
        if hora in datos_cupos:
            ocupados = datos_cupos[hora]["totales"] - datos_cupos[hora]["disponibles"]
            datos_cupos[hora]["totales"] = nuevo_total
            datos_cupos[hora]["disponibles"] = max(0, nuevo_total - ocupados)
            
    guardar_datos(datos)
    return jsonify({"success": True, "message": "Cupos actualizados por el Administrador."})

if __name__ == '__main__':
    app.run(debug=True)
    