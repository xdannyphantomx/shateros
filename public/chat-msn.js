// ======================================================
//  SHATEROS 2.0 – CHAT MSN PRO (2025)
//  Compatible con chat-room-avatar.html
// ======================================================

const socket = io();

// Obtener variables de la URL
function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

const roomId = getQueryParam("room");
let username = localStorage.getItem("username") || "Invitado";
let selectedAvatar = "avatars/avatar1.png";

// DOM Elements
const areaMsgs = document.getElementById("messagesArea");
const txtMsg = document.getElementById("msgText");
const usersList = document.getElementById("usersList");
const roomNameEl = document.getElementById("roomName");
const statusTyping = document.getElementById("statusTyping");

// Establecer título de la sala si viene en la URL
roomNameEl.textContent = `Sala #${roomId}`;

// ======================================================
//  CARGAR SESIÓN
// ======================================================
async function loadSession() {
    try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();

        if (data.ok) {
            username = data.user.username;
            selectedAvatar = data.user.avatar || selectedAvatar;
        }
    } catch (err) {
        console.warn("No se pudo cargar la sesión.");
    }
}
loadSession();


// ======================================================
//  UNIRSE A LA SALA
// ======================================================
socket.emit("joinRoom", {
    roomId,
    username,
    avatar: selectedAvatar
});

// ======================================================
//  ENVIAR MENSAJE
// ======================================================
function sendMessage() {
    const msg = txtMsg.value.trim();
    if (!msg) return;

    socket.emit("chatMessage", {
        roomId,
        username,
        message: msg,
        avatar: selectedAvatar
    });

    // Añadir mensaje propio
    addMessage({
        username,
        avatar: selectedAvatar,
        message: msg,
        self: true
    });

    txtMsg.value = "";
    statusTyping.innerText = "";
}

// Enter para enviar
txtMsg.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});


// ======================================================
//  RECIBIR MENSAJE DE OTROS
// ======================================================
socket.on("chatMessage", (msg) => {
    addMessage(msg);
});


// ======================================================
//  MOSTRAR MENSAJE EN MSN STYLE
// ======================================================
function addMessage({ username, avatar, message, self }) {
    const div = document.createElement("div");
    div.className = "msn-msg" + (self ? " me" : "");

    div.innerHTML = `
        <img src="${avatar}">
        <div class="msn-bubble">
            <strong>${username}</strong><br>
            ${message}
        </div>
    `;

    areaMsgs.appendChild(div);
    areaMsgs.scrollTop = areaMsgs.scrollHeight;
}


// ======================================================
//  SISTEMA: MENSAJES TIPO "ENTRÓ A LA SALA"
// ======================================================
socket.on("systemMessage", (msg) => {
    const sys = document.createElement("div");
    sys.className = "msn-msg system";

    sys.innerHTML = `
        <div class="msn-bubble" style="background:#e0e7ff; color:#334155;">
            <em>${msg}</em>
        </div>
    `;

    areaMsgs.appendChild(sys);
    areaMsgs.scrollTop = areaMsgs.scrollHeight;
});


// ======================================================
//  USUARIOS CONECTADOS
// ======================================================
socket.on("roomUsers", (list) => {
    usersList.innerHTML = "";

    list.forEach(u => {
        const div = document.createElement("div");
        div.className = "avatar-user-list";

        div.innerHTML = `
            <img src="${u.avatar}">
            <div>
                <strong>${u.username}</strong><br>
                <span style="font-size:11px; color:#16a34a;">online</span>
            </div>
        `;

        usersList.appendChild(div);
    });
});


// ======================================================
//  "Escribiendo…"
// ======================================================
let typingTimeout;

function typing() {
    socket.emit("typing", { roomId, username });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit("typingStop", { roomId });
    }, 1200);
}

socket.on("typing", (data) => {
    statusTyping.innerText = `${data.username} está escribiendo...`;
});

socket.on("typingStop", () => {
    statusTyping.innerText = "";
});


// ======================================================
//  CAMBIAR AVATAR (desde chat-room-avatar.html)
// ======================================================
window.selectAvatar = function(el, avatar) {
    selectedAvatar = avatar;

    document.querySelectorAll(".avatar-choice").forEach(x => x.classList.remove("active"));
    el.classList.add("active");

    socket.emit("changeAvatar", { roomId, username, avatar });
};
