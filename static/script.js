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

    const inputsRut = ["rut-alumno", "input-radar-rut", "input-nuevo-rut"];
    inputsRut.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", (e) => {
                e.target.value = formatearRUT(e.target.value);
            });
        }
    });

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
            actualizarInputsCuposAdmin();
        })
        .catch(error => console.error("Error al conectar con Python:", error));
}

// --- ZONA ALUMNO ---
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
            document.getElementById("contenido-reserva-box").style.display = "flex";
            actualizarInterfazHorariosAlumno();
        } else {
            alert(data.message);
        }
    })
    .catch(error => alert("Error de conexión con el Box."));
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

    if (estaHabilitada) {
        textoEstado.innerText = "🔓 Agenda disponible";
        textoEstado.style.color = "#22c55e";
        contenedorTarjetas.style.opacity = "1";
        contenedorTarjetas.style.pointerEvents = "auto";

        const diaData = datosGlobales.agendaDias[fechaElegida] || {};
        horas.forEach(h => {
            const el = document.getElementById(`cupos-${h}`);
            if (el) {
                const cuposBase = datosGlobales.cuposBase[h] || 10;
                if (diaData[h]) {
                    el.innerText = `${diaData[h].disponibles} / ${diaData[h].totales}`;
                } else {
                    el.innerText = `${cuposBase} / ${cuposBase}`;
                }
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
        body: JSON.stringify({ fecha: fechaElegida, hora: horaEnProceso, rut: rutUsuarioConectado })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        if (data.success) {
            document.getElementById("seccion-registro").style.display = "none";
            cargarDatosDelServidor();
        }
    })
    .catch(error => alert("Error al procesar la reserva."));
}

function cancelarCupoDirecto(hora) {
    const fechaElegida = document.getElementById("selector-fecha-reserva").value;

    fetch('/api/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: fechaElegida, hora: hora, rut: rutUsuarioConectado })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        if (data.success) cargarDatosDelServidor();
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
    .catch(error => alert("Error de conexión."));
}

function cerrarSesionAdmin() {
    window.location.href = "/";
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
    
    if (!nuevoRut) return alert("El campo RUT es obligatorio.");

    fetch('/api/admin/agregar-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: nuevoRut, nombre: inputNombre.value.trim(), email: inputEmail.value.trim() })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        if (data.success) {
            inputRut.value = ""; inputNombre.value = ""; inputEmail.value = "";
            cargarDatosDelServidor();
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
        if (data.success) cargarDatosDelServidor();
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
        const infoExtra = (item.nombre || item.email) ? `<br><small style="color: #a1a1aa;">${item.nombre} ${item.email ? '| ' + item.email : ''}</small>` : '';
        const li = document.createElement("li");
        li.innerHTML = `
            <div style="flex: 1;"><strong>${item.rut}</strong>${infoExtra}</div>
            <div style="display: flex; gap: 10px;">
                <button onclick="abrirModalEditarRut('${item.rut}', '${item.nombre}', '${item.email}')" title="Editar">✏️</button>
                <button onclick="eliminarRutAdmin('${item.rut}')" style="color: #ef4444;" title="Eliminar">✕</button>
            </div>
        `;
        contenedor.appendChild(li);
    });
}

// --- EDICIÓN DE RUTS (MODAL) ---
function abrirModalEditarRut(rut, nombre, email) {
    document.getElementById('edit-rut-display').innerText = `RUT: ${rut}`;
    document.getElementById('edit-rut-original').value = rut;
    document.getElementById('edit-nombre').value = nombre === 'undefined' ? '' : nombre;
    document.getElementById('edit-email').value = email === 'undefined' ? '' : email;
    document.getElementById('modal-editar-rut').style.display = "flex";
}

function cerrarModalEditarRut() {
    document.getElementById('modal-editar-rut').style.display = "none";
}

function guardarEdicionRut() {
    fetch('/api/admin/editar-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rut: document.getElementById('edit-rut-original').value,
            nombre: document.getElementById('edit-nombre').value.trim(),
            email: document.getElementById('edit-email').value.trim()
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            cerrarModalEditarRut();
            cargarDatosDelServidor(); 
        } else {
            alert(data.message || "Error al actualizar.");
        }
    });
}

function guardarCuposEstandarAdmin() {
    fetch('/api/admin/guardar-cupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "7:00": parseInt(document.getElementById("input-cupos-7_00").value) || 10,
            "8:15": parseInt(document.getElementById("input-cupos-8_15").value) || 10,
            "9:30": parseInt(document.getElementById("input-cupos-9_30").value) || 10,
            "11:00": parseInt(document.getElementById("input-cupos-11_00").value) || 10,
            "14:30": parseInt(document.getElementById("input-cupos-14_30").value) || 10
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            cargarDatosDelServidor();
        }
    });
}

function actualizarInputsCuposAdmin() {
    if (!datosGlobales || !datosGlobales.cuposBase) return;
    const base = datosGlobales.cuposBase;
    ["7:00", "8:15", "9:30", "11:00", "14:30"].forEach(h => {
        const id = "input-cupos-" + h.replace(":", "_");
        if (document.getElementById(id)) document.getElementById(id).value = base[h] || 10;
    });
}

// --- NUEVA LÓGICA INTEGRADORA DE LOS 3 BOTONES ---

// IMPLEMENTACIÓN 1: Acción Asíncrona del Botón Maestro de Cupos
function aplicarCuposBaseRangoAdmin() {
    const fInicio = document.getElementById("admin-fecha-inicio").value;
    const fFin = document.getElementById("admin-fecha-fin").value;

    if (!fInicio || !fFin) {
        alert("Por favor selecciona un rango de fechas (Desde/Hasta) para propagar los cupos base.");
        return;
    }

    if (!confirm("¿Deseas sobreescribir la capacidad total de clases en este rango de fechas con los valores base actuales?")) return;

    fetch('/api/admin/aplicar-cupos-rango', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio: fInicio, fechaFin: fFin })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        if (data.success) cargarDatosDelServidor();
    })
    .catch(error => alert("Error al propagar la operación maestra."));
}

// Radar Base
function buscarReservasRadar() {
    const rutBuscado = document.getElementById("input-radar-rut").value.trim();
    if (!rutBuscado) return;

    const listaDom = document.getElementById("lista-radar-resultados");
    const accionesBox = document.getElementById("radar-acciones-box");
    const nombreResultado = document.getElementById("radar-nombre-resultado");
    
    listaDom.innerHTML = `<li style="text-align: center; color: #7c7c8a; font-size: 13px;">Buscando en la base de datos...</li>`;
    accionesBox.style.display = "none";

    if (datosGlobales && datosGlobales.listaRuts) {
        const alumnoInfo = datosGlobales.listaRuts.find(a => a.rut === rutBuscado);
        if (alumnoInfo && alumnoInfo.nombre) {
            nombreResultado.innerText = `👤 Alumno: ${alumnoInfo.nombre}`;
            accionesBox.style.display = "block";
        }
    }

    fetch('/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rutBuscado })
    })
    .then(response => response.json())
    .then(data => {
        listaDom.innerHTML = "";
        if (!data.success || data.reservas.length === 0) {
            listaDom.innerHTML = `<li style="text-align: center; color: #ef4444; font-size: 13px; padding: 10px;">No registra reservas activas en el sistema.</li>`;
            return;
        }
        
        data.reservas.forEach(res => {
            const li = document.createElement("li");
            li.style.borderBottom = "1px solid #29292e";
            li.style.padding = "8px 4px";
            li.style.fontSize = "13px";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            
            // IMPLEMENTACIÓN 3: Botón Quirúrgico en línea para cada fila
            li.innerHTML = `
                <div><strong style="color: #22c55e;">${res.fecha}</strong> a las <strong>${res.hora}</strong></div>
                <button onclick="eliminarReservaQuirurgica('${rutBuscado}', '${res.fecha}', '${res.hora}')" 
                        style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 13px; padding: 2px 6px;" 
                        title="Remoción Quirúrgica">✂️ Dar de baja</button>
            `;
            listaDom.appendChild(li);
        });
    });
}

// IMPLEMENTACIÓN 2: Acción del Botón Nuclear del Radar
function eliminarTodasReservasRadar() {
    const rutBuscado = document.getElementById("input-radar-rut").value.trim();
    if (!rutBuscado) return;

    if (!confirm(`⚠️ ¡ALERTA NUCLEAR!\n¿Estás completamente seguro de purgar TODA la agenda del alumno con RUT ${rutBuscado}? Esta operación liberará todos sus cupos inmediatamente.`)) {
        return;
    }

    fetch('/api/admin/radar/cancelar-todas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rutBuscado })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        buscarReservasRadar();
        cargarDatosDelServidor();
    })
    .catch(error => alert("Error en la purga nuclear."));
}

// IMPLEMENTACIÓN 3 (Función): Ejecución del botón Quirúrgico
function eliminarReservaQuirurgica(rut, fecha, hora) {
    if (!confirm(`¿Eliminar quirúrgicamente la reserva del día ${fecha} a las ${hora}?`)) return;

    fetch('/api/admin/radar/cancelar-unica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rut, fecha: fecha, hora: hora })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        buscarReservasRadar();
        cargarDatosDelServidor();
    })
    .catch(error => alert("Error al procesar remoción quirúrgica."));
}
