const socket = io();

function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

let roomId = getQueryParam("roomId");
let roomName = decodeURIComponent(getQueryParam("roomName") || "Sala");
let usernameGlobal = "Usuario";

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

async function initChat() {
  const roomNameEl = document.getElementById("chatRoomName");
  const userNameEl = document.getElementById("chatUserName");
  const roomInfoEl = document.getElementById("roomInfo");
  const usersList = document.getElementById("usersList");

  if (!roomId) {
    roomInfoEl.textContent = "No se especificó una sala.";
    return;
  }

  roomNameEl.textContent = roomName;

  // Verificar sesión
  const auth = await fetchJSON("/api/auth/status");
  if (!auth.loggedIn) {
    alert("Primero inicia sesión o entra como invitado en la página de inicio.");
    window.location.href = "/";
    return;
  }

  usernameGlobal = auth.user.username;
  userNameEl.textContent = usernameGlobal;

  // Poner usuario actual en lista (por ahora solo él)
  usersList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = usernameGlobal;
  usersList.appendChild(li);

  // Cargar info básica de la sala
  try {
    const dataRooms = await fetchJSON("/api/rooms");
    if (dataRooms.ok) {
      const room = dataRooms.rooms.find((r) => String(r.id) === String(roomId));
      if (room) {
        roomInfoEl.textContent = `Sala: ${room.name} | Categoría: ${room.category}`;
      } else {
        roomInfoEl.textContent = "Sala no encontrada en la base de datos.";
      }
    } else {
      roomInfoEl.textContent = "Error al cargar info de la sala.";
    }
  } catch (err) {
    console.error(err);
    roomInfoEl.textContent = "Error al cargar info de la sala.";
  }

  // Unirse a la sala via socket
  socket.emit("joinRoom", { roomId, username: usernameGlobal });

  // Listeners
  socket.on("roomHistory", (messages) => {
    messages.forEach((msg) => {
      addMessage(msg.username, msg.message, msg.created_at);
    });
  });

  socket.on("chatMessage", (msg) => {
    addMessage(msg.username, msg.message, msg.created_at);
  });

  socket.on("systemMessage", (msg) => {
    addSystemMessage(msg.message);
  });

  const input = document.getElementById("messageInput");
  const btnSend = document.getElementById("btnSend");

  btnSend.onclick = sendMessage;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

function addMessage(username, message, created_at) {
  const container = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "chat-message";

  const timeStr = created_at
    ? new Date(created_at).toLocaleTimeString()
    : "";

  div.innerHTML = `
    <span class="chat-message-username">${username}:</span>
    <span>${message}</span>
    <span class="text-small" style="opacity:0.6; margin-left:6px;">${timeStr}</span>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) {
  const container = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "chat-message chat-message-system";
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (!message) return;
  socket.emit("chatMessage", {
    roomId,
    username: usernameGlobal,
    message,
  });
  input.value = "";
}

document.addEventListener("DOMContentLoaded", () => {
  initChat();
});
