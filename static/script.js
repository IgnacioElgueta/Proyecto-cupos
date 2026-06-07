// Variables de control local de la sesión
let horarioEnProceso = null;
let yaTieneReserva = false; 

// Al cargar la página, le pedimos los datos reales al servidor Python
document.addEventListener("DOMContentLoaded", () => {
    cargarDatosDelServidor();
});

// 1. FUNCIÓN PARA OBTENER DATOS DESDE PYTHON
function cargarDatosDelServidor() {
    fetch('/api/datos')
        .then(response => response.json())
        .then(data => {
            // Actualizar los textos de cupos en las tarjetas (sirve para alumnos y admin)
            for (let hora in data.datosCupos) {
                const cupo = data.datosCupos[hora];
                const elementoCupo = document.getElementById(`cupos-${hora}`);
                if (elementoCupo) {
                    elementoCupo.innerText = `${cupo.disponibles} / ${cupo.totales}`;
                }
            }
            // Actualizar la tabla de personas en el panel de administración
            actualizarTablaAdmin(data.listaPersonas);
        })
        .catch(error => console.error("Error al conectar con Python:", error));
}

// PASO 4: FUNCIÓN PARA ENVIAR EL LOGIN DEL ADMINISTRADOR A PYTHON
function autenticarAdmin(event) {
    event.preventDefault();
    
    const usuarioInput = document.getElementById("admin-usuario").value;
    const passwordInput = document.getElementById("admin-password").value;

    fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuarioInput, password: passwordInput })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Ocultamos el bloque de login de la página secreta y mostramos el panel real
            document.getElementById("seccion-login-admin").style.display = "none";
            document.getElementById("panel-admin-box").style.display = "block";
            cargarDatosDelServidor(); // Cargar la lista real de inscritos
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Usuario o contraseña incorrectos"));
}

// PASO 4: FUNCIÓN PARA SALIR DEL PANEL SEGURO
function cerrarSesionAdmin() {
    // Redirecciona al administrador de vuelta a la página principal de los alumnos
    window.location.href = "/";
}

// Mostrar formulario de registro de usuario (Página de alumnos)
function abrirFormulario(hora) {
    if (yaTieneReserva) {
        alert("Lo sentimos, ya cuentas con una reserva activa hoy.");
        return;
    }
    
    horarioEnProceso = hora;
    document.getElementById("hora-seleccionada").innerText = `${hora}:00 AM`;
    
    const seccionReg = document.getElementById("seccion-registro");
    seccionReg.style.display = "block";
    seccionReg.scrollIntoView({ behavior: 'smooth' });
}

// 2. ENVIAR RESERVA A PYTHON
function confirmarReserva(event) {
    event.preventDefault();

    const nombreInput = document.getElementById("nombre-usuario").value;
    const emailInput = document.getElementById("email-usuario").value;

    fetch('/api/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            hora: horarioEnProceso,
            nombre: nombreInput,
            email: emailInput
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            yaTieneReserva = true;
            
            // Limpiar y ocultar formulario
            document.getElementById("form-registro").reset();
            document.getElementById("seccion-registro").style.display = "none";
            
            cargarDatosDelServidor(); // Recargar datos
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al procesar la reserva"));
}

// 3. ENVIAR CANCELACIÓN A PYTHON
function cancelarCupoDirecto(hora) {
    if (!yaTieneReserva) {
        alert("No tienes ninguna reserva activa para cancelar.");
        return;
    }

    fetch('/api/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hora: hora })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            yaTieneReserva = false;
            cargarDatosDelServidor(); // Refrescar pantalla
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al cancelar el cupo"));
}

// PASO 4: DIBUJAR LA TABLA (Protegida si estamos en la vista de alumnos)
function actualizarTablaAdmin(listaPersonas) {
    const tbody = document.getElementById("lista-registrados");
    // Si el elemento no existe (porque el alumno está en index.html), salimos sin hacer nada
    if (!tbody) return; 

    tbody.innerHTML = ""; 

    if (listaPersonas.length === 0) {
        tbody.innerHTML = `<tr id="sin-registros"><td colspan="3" style="text-align: center; color: #7c7c8a;">No hay reservas aún</td></tr>`;
        return;
    }

    listaPersonas.forEach(persona => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td><strong>${persona.hora}</strong></td>
            <td>${persona.nombre}</td>
            <td>${persona.email}</td>
        `;
        tbody.appendChild(fila);
    });
}

// 4. ADMINISTRADOR ENVÍA LOS NUEVOS TOTALES A PYTHON
function actualizarAdmin() {
    const nuevosTotales = {
        "8": parseInt(document.getElementById("input-cupos-8").value) || 0,
        "9": parseInt(document.getElementById("input-cupos-9").value) || 0,
        "10": parseInt(document.getElementById("input-cupos-10").value) || 0
    };

    fetch('/api/admin/actualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevosTotales)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor(); // Refrescar totales arriba
        }
    })
    .catch(error => alert("Error al actualizar la configuración"));
}
