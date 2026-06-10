// Variables de control de la sesión global
let datosGlobales = null;
let rutUsuarioConectado = ""; // Recordará el RUT del alumno conectado

// Al cargar la página, inicializamos las fechas del sistema
document.addEventListener("DOMContentLoaded", () => {
    // Seteamos la fecha de hoy por defecto en los inputs tipo date
    const hoyStr = obtenerFechaHoyString();
    
    const selectorReserva = document.getElementById("selector-fecha-reserva");
    if (selectorReserva) selectorReserva.value = hoyStr;

    const selectorAdmin = document.getElementById("selector-fecha-admin");
    if (selectorAdmin) selectorAdmin.value = hoyStr;

    cargarDatosDelServidor();
});

// Función útil para obtener la fecha de hoy en formato YYYY-MM-DD local
function obtenerFechaHoyString() {
    const d = new Date();
    const mes = '' + (d.getMonth() + 1);
    const dia = '' + d.getDate();
    const anio = d.getFullYear();
    return [anio, mes.padStart(2, '0'), dia.padStart(2, '0')].join('-');
}

// 1. FUNCIÓN PRINCIPAL PARA SINCRONIZAR CON PYTHON
function cargarDatosDelServidor() {
    fetch('/api/datos')
        .then(response => response.json())
        .then(data => {
            datosGlobales = data; // Almacenamos el gran JSON
            
            // Refrescar la interfaz del Alumno
            actualizarInterfazHorariosAlumno();
            
            // Refrescar la interfaz del Administrador (RUTs)
            actualizarListaRutsDom(data.listaRuts);
            
            // Refrescar la tabla de asistencia del Administrador según su fecha elegida
            actualizarTablaAdminAsistencia();

            // Actualizar las cajitas de los cupos con la info real
            actualizarInputsCuposAdmin();
        })
        .catch(error => console.error("Error al conectar con Python:", error));
}


// --- LÓGICA DE NAVEGACIÓN Y AGENDA DEL ALUMNO ---

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
            // Guardamos el RUT al ingresar con éxito
            rutUsuarioConectado = rutInput; 

            document.getElementById("pantalla-rut").style.display = "none";
            document.getElementById("contenido-reserva-box").style.display = "block";
            actualizarInterfazHorariosAlumno();
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("El RUT ingresado no está autorizado."));
}

// Se ejecuta cada vez que el alumno cambia el día en el calendario
function cambiarFechaAgenda() {
    actualizarInterfazHorariosAlumno();
    // Cerramos el formulario de datos por si estaba abierto, para evitar confusiones
    document.getElementById("seccion-registro").style.display = "none";
}

function actualizarInterfazHorariosAlumno() {
    if (!datosGlobales) return;

    const selector = document.getElementById("selector-fecha-reserva");
    if (!selector) return; 

    const fechaElegida = selector.value;
    const textoEstado = document.getElementById("estado-fecha-texto");
    const contenedorTarjetas = document.getElementById("contenedor-tarjetas-clases");

    if (!fechaElegida) return;

    // Verificar si el dueño tiene habilitada esta fecha específica
    const estaHabilitada = datosGlobales.fechasHabilitadas.includes(fechaElegida);
    
    // NUEVO: Arreglo con los nuevos horarios base
    const horas = ["7:00", "8:15", "9:30", "11:00", "14:30"];

    if (estaHabilitada && datosGlobales.agendaDias[fechaElegida]) {
        // ACTIVAR INTERFAZ
        textoEstado.innerText = "🔓 Agenda disponible para reservas";
        textoEstado.style.color = "#22c55e";
        contenedorTarjetas.style.opacity = "1";
        contenedorTarjetas.style.pointerEvents = "auto";

        // Pintar los cupos dinámicos del día seleccionado
        const diaData = datosGlobales.agendaDias[fechaElegida];
        horas.forEach(h => {
            const el = document.getElementById(`cupos-${h}`);
            if (el && diaData[h]) {
                el.innerText = `${diaData[h].disponibles} / ${diaData[h].totales}`;
            }
        });
    } else {
        // BLOQUEAR INTERFAZ (Ej: Si es julio y no está habilitado)
        textoEstado.innerText = "🔒 Agenda bloqueada o inhabilitada para esta fecha.";
        textoEstado.style.color = "#ef4444";
        contenedorTarjetas.style.opacity = "0.3";
        contenedorTarjetas.style.pointerEvents = "none";
        
        // Resetear visualmente a texto vacío/completo
        horas.forEach(h => {
            const el = document.getElementById(`cupos-${h}`);
            if (el) el.innerText = "10 / 10";
        });
    }
}


// --- LÓGICA DE PROCESAMIENTO DE RESERVAS (ALUMNOS) ---

let horaEnProceso = null;

function abrirFormulario(hora) {
    const fechaElegida = document.getElementById("selector-fecha-reserva").value;
    horaEnProceso = hora;
    
    document.getElementById("fecha-seleccionada-texto").innerText = fechaElegida;
    document.getElementById("hora-seleccionada").innerText = hora; 
    
    const seccionReg = document.getElementById("seccion-registro");
    seccionReg.style.display = "block";
    seccionReg.scrollIntoView({ behavior: 'smooth' });
}

function confirmarReserva(event) {
    event.preventDefault();

    const fechaElegida = document.getElementById("selector-fecha-reserva").value;
    const nombreInput = document.getElementById("nombre-usuario").value;
    const emailInput = document.getElementById("email-usuario").value;

    fetch('/api/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fecha: fechaElegida,
            hora: horaEnProceso,
            nombre: nombreInput,
            email: emailInput,
            rut: rutUsuarioConectado // Enviamos el RUT guardado al servidor
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            document.getElementById("form-registro").reset();
            document.getElementById("seccion-registro").style.display = "none";
            cargarDatosDelServidor(); // Recargar base completa
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al procesar la reserva."));
}

function cancelarCupoDirecto(hora) {
    const fechaElegida = document.getElementById("selector-fecha-reserva").value;

    fetch('/api/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            fecha: fechaElegida, 
            hora: hora,
            rut: rutUsuarioConectado // AQUÍ ENVIAMOS EL RUT AL SERVIDOR PARA VALIDAR LA IDENTIDAD
        })
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
    .catch(error => alert("Error al cancelar el cupo."));
}


// --- LÓGICA PANEL ADMINISTRATIVO EXCLUSIVO ---

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
            
            // Forzamos la recarga inmediata del servidor ahora que el panel es visible
            cargarDatosDelServidor();
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Credenciales incorrectas."));
}

function cerrarSesionAdmin() {
    window.location.href = "/";
}

// Se ejecuta si el admin cambia la fecha de revisión de asistencia
function cambiarFechaAdminAsistencia() {
    actualizarTablaAdminAsistencia();
}

function actualizarTablaAdminAsistencia() {
    const tbody = document.getElementById("lista-registrados");
    if (!tbody || !datosGlobales) return;

    tbody.innerHTML = "";
    const fechaFiltro = document.getElementById("selector-fecha-admin").value;

    if (!fechaFiltro) return;

    const diaData = datosGlobales.agendaDias[fechaFiltro];
    
    // Si el día no está configurado o no tiene alumnos guardados
    if (!diaData || !diaData.personas || diaData.personas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #7c7c8a; padding: 15px;">No hay alumnos inscritos para este día.</td></tr>`;
        return;
    }

    diaData.personas.forEach(persona => {
        const fila = document.createElement("tr");
        fila.style.borderBottom = "1px solid #2c2c2e";
        fila.innerHTML = `
            <td style="padding: 8px;"><strong>${persona.hora}</strong></td>
            <td style="padding: 8px;">${persona.nombre}</td>
            <td style="padding: 8px;">${persona.email}</td>
            <td style="padding: 8px; text-align: center;">
                <button onclick="eliminarUsuarioAdmin('${persona.email}', '${persona.hora}')" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">Remover</button>
            </td>
        `;
        tbody.appendChild(fila);
    });
}

function eliminarUsuarioAdmin(email, hora) {
    const fechaFiltro = document.getElementById("selector-fecha-admin").value;
    if (!confirm(`¿Eliminar reserva de las ${hora} para el día ${fechaFiltro}?`)) return;

    fetch('/api/admin/eliminar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: fechaFiltro, email: email, hora: hora })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor();
        }
    })
    .catch(error => alert("Error al intentar eliminar."));
}

// Envía el rango de fechas de semanas para habilitar/bloquear en bloque
function configurarCalendarioAdmin(accion) {
    const fInicio = document.getElementById("admin-fecha-inicio").value;
    const fFin = document.getElementById("admin-fecha-fin").value;

    if (!fInicio || !fFin) {
        alert("Por favor, selecciona un rango completo con fecha de inicio y fin.");
        return;
    }

    fetch('/api/admin/configurar-calendario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio: fInicio, fechaFin: fFin, accion: accion })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor(); // Recargar todo el JSON modificado
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al configurar las fechas de la agenda."));
}

// --- CONTROLES AUXILIARES DE RUT ---

function agregarRutAdmin() {
    const inputRut = document.getElementById("input-nuevo-rut");
    const inputNombre = document.getElementById("input-nuevo-nombre");
    const inputEmail = document.getElementById("input-nuevo-email");
    
    const nuevoRut = inputRut ? inputRut.value.trim() : "";
    const nuevoNombre = inputNombre ? inputNombre.value.trim() : "";
    const nuevoEmail = inputEmail ? inputEmail.value.trim() : "";

    if (!nuevoRut) return;

    fetch('/api/admin/agregar-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            rut: nuevoRut,
            nombre: nuevoNombre,
            email: nuevoEmail
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            if(inputRut) inputRut.value = "";
            if(inputNombre) inputNombre.value = "";
            if(inputEmail) inputEmail.value = "";
            cargarDatosDelServidor();
        } else {
            alert(data.message);
        }
    });
}

function eliminarRutAdmin(rut) {
    if (!confirm(`¿Remover acceso para el RUT ${rut}?`)) return;

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
    });
}

function actualizarListaRutsDom(listaRuts) {
    const contenedor = document.getElementById("lista-ruts-contenedor");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    if (!listaRuts || listaRuts.length === 0) {
        contenedor.innerHTML = `<li style="text-align: center; color: #7c7c8a; padding: 10px; font-size: 13px;">No hay RUTs autorizados</li>`;
        return;
    }

    listaRuts.forEach(item => {
        const rutStr = typeof item === 'object' ? item.rut : item;
        const nombreStr = (typeof item === 'object' && item.nombre) ? `<br><small style="color: #a1a1aa;">${item.nombre}</small>` : "";

        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.padding = "8px 10px";
        li.style.borderBottom = "1px solid #3a3a3c";
        li.style.color = "white";
        li.style.fontSize = "14px";
        
        li.innerHTML = `
            <div>
                <strong>${rutStr}</strong>
                ${nombreStr}
            </div>
            <button onclick="eliminarRutAdmin('${rutStr}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; font-weight: bold; padding: 0 5px;">✕</button>
        `;
        contenedor.appendChild(li);
    });
}

// --- NUEVA FUNCIÓN: ENVIAR LOS CUPOS CONFIGURADOS A PYTHON ---
function guardarCuposEstandarAdmin() {
    const cupos7_00 = document.getElementById("input-cupos-7_00") ? document.getElementById("input-cupos-7_00").value : 10;
    const cupos8_15 = document.getElementById("input-cupos-8_15") ? document.getElementById("input-cupos-8_15").value : 10;
    const cupos9_30 = document.getElementById("input-cupos-9_30") ? document.getElementById("input-cupos-9_30").value : 10;
    const cupos11_00 = document.getElementById("input-cupos-11_00") ? document.getElementById("input-cupos-11_00").value : 10;
    const cupos14_30 = document.getElementById("input-cupos-14_30") ? document.getElementById("input-cupos-14_30").value : 10;

    // Enviamos las llaves en el formato exacto que Python espera
    fetch('/api/admin/guardar-cupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "7:00": parseInt(cupos7_00) || 10,
            "8:15": parseInt(cupos8_15) || 10,
            "9:30": parseInt(cupos9_30) || 10,
            "11:00": parseInt(cupos11_00) || 10,
            "14:30": parseInt(cupos14_30) || 10
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor(); // Recarga y refresca todo el sistema con las nuevas capacidades
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error al guardar la nueva configuración de cupos."));
}

// --- FUNCIÓN PARA REFLEJAR LOS CUPOS REALES EN EL PANEL ADMIN ---
function actualizarInputsCuposAdmin() {
    if (!datosGlobales || !datosGlobales.agendaDias) return;

    const diasGuardados = Object.keys(datosGlobales.agendaDias);
    
    if (diasGuardados.length > 0) {
        // Tomamos cualquier día de referencia para leer la configuración actual
        const diaDeReferencia = datosGlobales.agendaDias[diasGuardados[0]];

        const in7_00 = document.getElementById("input-cupos-7_00");
        const in8_15 = document.getElementById("input-cupos-8_15");
        const in9_30 = document.getElementById("input-cupos-9_30");
        const in11_00 = document.getElementById("input-cupos-11_00");
        const in14_30 = document.getElementById("input-cupos-14_30");

        // Si existen los inputs, les ponemos el número real de la base de datos
        if (in7_00 && diaDeReferencia["7:00"]) in7_00.value = diaDeReferencia["7:00"].totales;
        if (in8_15 && diaDeReferencia["8:15"]) in8_15.value = diaDeReferencia["8:15"].totales;
        if (in9_30 && diaDeReferencia["9:30"]) in9_30.value = diaDeReferencia["9:30"].totales;
        if (in11_00 && diaDeReferencia["11:00"]) in11_00.value = diaDeReferencia["11:00"].totales;
        if (in14_30 && diaDeReferencia["14:30"]) in14_30.value = diaDeReferencia["14:30"].totales;
    }
}
