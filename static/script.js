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
            // Actualizar los textos de cupos en las tarjetas
            for (let hora in data.datosCupos) {
                const cupo = data.datosCupos[hora];
                const elementoCupo = document.getElementById(`cupos-${hora}`);
                if (elementoCupo) {
                    elementoCupo.innerText = `${cupo.disponibles} / ${cupo.totales}`;
                }
            }
            // Actualizar la tabla de asistencia en el panel de administración
            actualizarTablaAdmin(data.listaPersonas);
            
            // Actualizar la lista visual de RUTs autorizados en el panel
            actualizarListaRutsDom(data.listaRuts);
        })
        .catch(error => console.error("Error al conectar con Python:", error));
}

// --- LÓGICA DE CONTROL DE ACCESO (ALUMNOS) ---

// Nueva Función: Valida el RUT del alumno contra la lista blanca en Python
function validarRutAcceso(event) {
    event.preventDefault();
    const rutInput = document.getElementById("rut-alumno").value;

    fetch('/api/verificar-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rutInput })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Ocultamos la pantalla de RUT y mostramos el panel de reservas
            document.getElementById("pantalla-rut").style.display = "none";
            document.getElementById("contenido-reserva-box").style.display = "block";
        } else {
            alert(data.message);
        }
    })
    .catch(error => {
        alert("El RUT ingresado no está autorizado o no figura como alumno activo.");
    });
}


// --- LÓGICA DE RESERVAS Y CANCELACIONES ---

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
            
            document.getElementById("form-registro").reset();
            document.getElementById("seccion-registro").style.display = "none";
            
            cargarDatosDelServidor(); 
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al procesar la reserva"));
}

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
            cargarDatosDelServidor(); 
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al cancelar el cupo"));
}


// --- LÓGICA EXCLUSIVA DEL PANEL DE ADMINISTRACIÓN ---

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
            document.getElementById("seccion-login-admin").style.display = "none";
            document.getElementById("panel-admin-box").style.display = "block";
            cargarDatosDelServidor(); 
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Usuario o contraseña incorrectos"));
}

function cerrarSesionAdmin() {
    window.location.href = "/";
}

function actualizarTablaAdmin(listaPersonas) {
    const tbody = document.getElementById("lista-registrados");
    if (!tbody) return; 

    tbody.innerHTML = ""; 

    if (!listaPersonas || listaPersonas.length === 0) {
        tbody.innerHTML = `<tr id="sin-registros"><td colspan="4" style="text-align: center; color: #7c7c8a; padding: 15px;">No hay reservas aún</td></tr>`;
        return;
    }

    listaPersonas.forEach(persona => {
        const fila = document.createElement("tr");
        fila.style.borderBottom = "1px solid #2c2c2e";
        fila.innerHTML = `
            <td style="padding: 8px;"><strong>${persona.hora}</strong></td>
            <td style="padding: 8px;">${persona.nombre}</td>
            <td style="padding: 8px;">${persona.email}</td>
            <td style="padding: 8px; text-align: center;">
                <button onclick="eliminarUsuarioAdmin('${persona.email}', '${persona.hora}')" style="background-color: #f74141; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">Eliminar</button>
            </td>
        `;
        tbody.appendChild(fila);
    });
}

function eliminarUsuarioAdmin(email, hora) {
    if (!confirm(`¿Estás seguro de eliminar a este usuario de las ${hora}?`)) return;

    fetch('/api/admin/eliminar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, hora: hora })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor(); 
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al eliminar al usuario."));
}

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
            cargarDatosDelServidor(); 
        }
    })
    .catch(error => alert("Error al actualizar los cupos"));
}

// Nueva Función: Permite al admin añadir un RUT a la lista blanca
function agregarRutAdmin() {
    const inputRut = document.getElementById("input-nuevo-rut");
    const nuevoRut = inputRut.value.trim();

    if (!nuevoRut) {
        alert("Escribe un RUT antes de añadir.");
        return;
    }

    fetch('/api/admin/agregar-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: nuevoRut })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            inputRut.value = ""; // Limpiar input
            cargarDatosDelServidor(); // Recargar lista
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al guardar el RUT."));
}

// Nueva Función: Permite al admin remover un RUT de la lista blanca
function eliminarRutAdmin(rut) {
    if (!confirm(`¿Remover el RUT ${rut} de los alumnos autorizados?`)) return;

    fetch('/api/admin/eliminar-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rut })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor(); 
        }
    })
    .catch(error => alert("Error al intentar eliminar el RUT."));
}

// Nueva Función: Dibuja la lista de RUTs dinámicamente en el panel
function actualizarListaRutsDom(listaRuts) {
    const contenedor = document.getElementById("lista-ruts-contenedor");
    if (!contenedor) return; 

    contenedor.innerHTML = "";

    if (!listaRuts || listaRuts.length === 0) {
        contenedor.innerHTML = `<li style="text-align: center; color: #7c7c8a; padding: 15px; font-size: 13px;">No hay RUTs autorizados</li>`;
        return;
    }

    listaRuts.forEach(rut => {
        const item = document.createElement("li");
        item.style.display = "flex";
        item.style.justify = "space-between";
        item.style.alignItems = "center";
        item.style.padding = "8px 10px";
        item.style.borderBottom = "1px solid #3a3a3c";
        item.style.color = "#ffffff";
        item.style.fontSize = "14px";
        
        item.innerHTML = `
            <span>${rut}</span>
            <button onclick="eliminarRutAdmin('${rut}')" style="background: none; border: none; color: #f74141; cursor: pointer; font-size: 12px; font-weight: bold;">❌</button>
        `;
        contenedor.appendChild(item);
    });
}