from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Base de datos centralizada en el servidor
datos_cupos = {
    "8": {"disponibles": 10, "totales": 10},
    "9": {"disponibles": 10, "totales": 10},
    "10": {"disponibles": 10, "totales": 10}
}
lista_personas = []

# --- RUTAS DE NAVEGACIÓN (PÁGINAS) ---

# Ruta principal: Carga la página web de los alumnos
@app.route('/')
def home():
    return render_template('index.html')

# Ruta secreta: Carga la página del Administrador
@app.route('/admin-box')
def admin_page():
    return render_template('admin.html')


# --- ENDPOINTS DE LA API (LÓGICA) ---

# API: Obtener el estado actual de los cupos y registrados
@app.route('/api/datos', methods=['GET'])
def obtener_datos():
    return jsonify({
        "datosCupos": datos_cupos,
        "listaPersonas": lista_personas
    })

# API: Procesar una nueva reserva
@app.route('/api/reservar', methods=['POST'])
def reservar():
    data = request.json
    hora = str(data.get('hora'))
    nombre = data.get('nombre')
    email = data.get('email')
    
    if hora in datos_cupos and datos_cupos[hora]["disponibles"] > 0:
        datos_cupos[hora]["disponibles"] -= 1
        lista_personas.append({
            "hora": f"{hora}:00 AM",
            "nombre": nombre,
            "email": email
        })
        return jsonify({"success": True, "message": f"¡Reserva confirmada para las {hora}:00 AM!"})
    
    return jsonify({"success": False, "message": "No quedan cupos disponibles."}), 400

# API: Procesar una cancelación
@app.route('/api/cancelar', methods=['POST'])
def cancelar():
    data = request.json
    hora = str(data.get('hora'))
    texto_hora = f"{hora}:00 AM"
    
    # Buscar y eliminar a la primera persona en ese horario
    global lista_personas
    for i, persona in enumerate(lista_personas):
        if persona["hora"] == texto_hora:
            lista_personas.pop(i)
            break
            
    if hora in datos_cupos and datos_cupos[hora]["disponibles"] < datos_cupos[hora]["totales"]:
        datos_cupos[hora]["disponibles"] += 1
        return jsonify({"success": True, "message": "Cupo liberado con éxito."})
        
    return jsonify({"success": False, "message": "No hay reservas que cancelar."}), 400

# API: Validar credenciales del Administrador (Login Seguro)
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    usuario = data.get('usuario')
    password = data.get('password')
    
    # CUENTA DEL DUEÑO 
    USUARIO_CORRECTO = "admin"
    PASSWORD_CORRECTA = "Entrenamiento"  # Recuérdale cambiarla antes de subirlo a internet
    
    if usuario == USUARIO_CORRECTO and password == PASSWORD_CORRECTA:
        return jsonify({"success": True, "message": "Acceso concedido"})
    
    return jsonify({"success": False, "message": "Usuario o contraseña incorrectos"}), 401

# API: Administrador actualiza los totales
@app.route('/api/admin/actualizar', methods=['POST'])
def actualizar_admin():
    data = request.json  # Espera un diccionario como {"8": 15, "9": 10, "10": 10}
    
    for hora, nuevo_total in data.items():
        if hora in datos_cupos:
            # Calcular cuántos estaban ocupados
            ocupados = datos_cupos[hora]["totales"] - datos_cupos[hora]["disponibles"]
            datos_cupos[hora]["totales"] = nuevo_total
            datos_cupos[hora]["disponibles"] = max(0, nuevo_total - ocupados)
            
    return jsonify({"success": True, "message": "Cupos actualizados por el Administrador."})

if __name__ == '__main__':
    # Ejecuta el servidor en modo desarrollo
    app.run(debug=True)