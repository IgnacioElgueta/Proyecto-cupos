// Variables de control de la sesión global
let datosGlobales = null;
let rutUsuarioConectado = ""; 

// Formateador de RUT automático (Ej: 12.345.678-9)
function formatearRUT(rut) {
    let valor = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (valor.length > 1) {
        let cuerpo = valor.slice(0, -1);
        let dv = valor.slice(-1);
        valor = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
    }
    return valor;
}

document.addEventListener("DOMContentLoaded", () => {
    const hoyStr = obtenerFechaHoyString();
    
    const selectorReserva = document.getElementById("selector-fecha-reserva");
    if (selectorReserva) selectorReserva.value = hoyStr;

    const selectorAdmin = document.getElementById("selector-fecha-admin");
    if (selectorAdmin) selectorAdmin.value = hoyStr;

    // Activar el formateador de RUT si existe el input en la pantalla
    const inputRut = document.getElementById("rut-alumno");
    if (inputRut) {
        inputRut.addEventListener("input", (e) => {
            e.target.value = formatearRUT(e.target.value);
        });
    }

    const inputRadarRut = document.getElementById("input-radar-rut");
    if(inputRadarRut) {
        inputRadarRut.addEventListener("input", (e) => {
            e.target.value = formatearRUT(e.target.value);
        });
    }

    cargarDatosDelServidor();
});

function obtenerFechaHoyString() {
    const d = new Date();
    const mes = '' + (d.getMonth() + 1);
    const dia = '' + d.getDate();
    const anio = d.getFullYear();
    return [anio, mes.padStart(2, '0'), dia.padStart(2, '0')].join('-');
}

function cargarDatosDelServidor() {
    fetch('/api/datos?t=' + new Date().getTime())
        .then(response => response.json())
        .then(data => {
            datosGlobales = data; 
            actualizarInterfazHorariosAlumno();
            actualizarListaRutsDom(data.listaRuts);
            actualizarTablaAdminAsistencia();
            actualizarInputsCuposAdmin();
        })
        .catch(error => console.error("Error al conectar con Python:", error));
}

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

function cambiarFechaAgenda() {
    actualizarInterfazHorariosAlumno();
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

    const estaHabilitada = datosGlobales.fechasHabilitadas.includes(fechaElegida);
    const horas = ["7:00", "8:15", "9:30", "11:00", "14:30"];

    if (estaHabilitada && datosGlobales.agendaDias[fechaElegida]) {
        textoEstado.innerText = "🔓 Agenda disponible";
        textoEstado.style.color = "#22c55e";
        contenedorTarjetas.style.opacity = "1";
        contenedorTarjetas.style.pointerEvents = "auto";

        const diaData = datosGlobales.agendaDias[fechaElegida];
        horas.forEach(h => {
            const el = document.getElementById(`cupos-${h}`);
            if (el && diaData[h]) {
                el.innerText = `${diaData[h].disponibles} / ${diaData[h].totales}`;
            }
        });
    } else {
        textoEstado.innerText = "🔒 Agenda bloqueada para esta fecha.";
        textoEstado.style.color = "#ef4444";
        contenedorTarjetas.style.opacity = "0.3";
        contenedorTarjetas.style.pointerEvents = "none";
    }
}

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

    fetch('/api/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ya no enviamos nombre ni email. Python los buscará por el RUT.
        body: JSON.stringify({
            fecha: fechaElegida,
            hora: horaEnProceso,
            rut: rutUsuarioConectado
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            document.getElementById("seccion-registro").style.display = "none";
            cargarDatosDelServidor();
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
            rut: rutUsuarioConectado
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

// --- PANEL ADMIN ---

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
    .catch(error => alert("Credenciales incorrectas."));
}

function cerrarSesionAdmin() {
    window.location.href = "/";
}

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
    
    if (!diaData || !diaData.personas || diaData.personas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #7c7c8a; padding: 15px;">No hay alumnos inscritos.</td></tr>`;
        return;
    }

    diaData.personas.forEach(persona => {
        const fila = document.createElement("tr");
        fila.style.borderBottom = "1px solid #2c2c2e";
        fila.innerHTML = `
            <td style="padding: 8px;"><strong>${persona.hora}</strong></td>
            <td style="padding: 8px;">${persona.nombre} <br><span style="font-size: 11px; color:#7c7c8a;">${persona.rut}</span></td>
            <td style="padding: 8px; text-align: center;">
                <button onclick="eliminarUsuarioAdmin('${persona.rut}', '${persona.hora}')" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">Remover</button>
            </td>
        `;
        tbody.appendChild(fila);
    });
}

function eliminarUsuarioAdmin(rut, hora) {
    const fechaFiltro = document.getElementById("selector-fecha-admin").value;
    if (!confirm(`¿Eliminar reserva de las ${hora}?`)) return;

    // Cambiado de email a rut para ser consistentes con la nueva lógica
    fetch('/api/admin/eliminar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: fechaFiltro, rut: rut, hora: hora })
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

function configurarCalendarioAdmin(accion) {
    const fInicio = document.getElementById("admin-fecha-inicio").value;
    const fFin = document.getElementById("admin-fecha-fin").value;

    if (!fInicio || !fFin) {
        alert("Por favor, selecciona un rango completo.");
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
            cargarDatosDelServidor();
        }
    })
    .catch(error => alert("Error al configurar las fechas."));
}

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
        const rutStr = item.rut;
        const nombreStr = item.nombre ? `<br><small style="color: #a1a1aa;">${item.nombre}</small>` : "";

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

function guardarCuposEstandarAdmin() {
    const cupos7_00 = document.getElementById("input-cupos-7_00") ? document.getElementById("input-cupos-7_00").value : 10;
    const cupos8_15 = document.getElementById("input-cupos-8_15") ? document.getElementById("input-cupos-8_15").value : 10;
    const cupos9_30 = document.getElementById("input-cupos-9_30") ? document.getElementById("input-cupos-9_30").value : 10;
    const cupos11_00 = document.getElementById("input-cupos-11_00") ? document.getElementById("input-cupos-11_00").value : 10;
    const cupos14_30 = document.getElementById("input-cupos-14_30") ? document.getElementById("input-cupos-14_30").value : 10;

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
            cargarDatosDelServidor();
        }
    })
    .catch(error => alert("Error al guardar la configuración."));
}

function actualizarInputsCuposAdmin() {
    if (!datosGlobales || !datosGlobales.cuposBase) return;
    const base = datosGlobales.cuposBase;
    if (document.getElementById("input-cupos-7_00")) document.getElementById("input-cupos-7_00").value = base["7:00"] || 10;
    if (document.getElementById("input-cupos-8_15")) document.getElementById("input-cupos-8_15").value = base["8:15"] || 10;
    if (document.getElementById("input-cupos-9_30")) document.getElementById("input-cupos-9_30").value = base["9:30"] || 10;
    if (document.getElementById("input-cupos-11_00")) document.getElementById("input-cupos-11_00").value = base["11:00"] || 10;
    if (document.getElementById("input-cupos-14_30")) document.getElementById("input-cupos-14_30").value = base["14:30"] || 10;
}

// NUEVA FUNCIÓN: RADAR DE ALUMNOS
function buscarReservasRadar() {
    const rutBuscado = document.getElementById("input-radar-rut").value.trim();
    if (!rutBuscado) return;

    const listaDom = document.getElementById("lista-radar-resultados");
    listaDom.innerHTML = `<li style="text-align: center; color: #7c7c8a; font-size: 13px;">Buscando en la base de datos...</li>`;

    fetch('/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rutBuscado })
    })
    .then(response => response.json())
    .then(data => {
        listaDom.innerHTML = "";
        if (!data.success || data.reservas.length === 0) {
            listaDom.innerHTML = `<li style="text-align: center; color: #ef4444; font-size: 13px; padding: 10px;">No se encontraron reservas para este RUT.</li>`;
            return;
        }

        data.reservas.forEach(res => {
            const li = document.createElement("li");
            li.style.borderBottom = "1px solid #29292e";
            li.style.padding = "8px 0";
            li.style.fontSize = "14px";
            li.innerHTML = `<strong style="color: #22c55e;">${res.fecha}</strong> a las <strong>${res.hora}</strong>`;
            listaDom.appendChild(li);
        });
    })
    .catch(error => {
        listaDom.innerHTML = `<li style="text-align: center; color: #ef4444; font-size: 13px;">Error de búsqueda.</li>`;
    });
}
