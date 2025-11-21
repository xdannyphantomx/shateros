// =========================================
// 🔵 Cargar Salas desde el servidor
// =========================================

document.addEventListener("DOMContentLoaded", () => {
    loadRooms();
    setupCategoryFilter();
    loadHeaderUser();
});

// =========================================
// 🔵 Obtener salas desde el backend
// =========================================

function loadRooms(category = "Todas") {
    fetch("/api/rooms")
        .then(res => res.json())
        .then(rooms => {
            const container = document.getElementById("roomsContainer");
            container.innerHTML = "";

            // Filtrar por categoría
            if (category !== "Todas") {
                rooms = rooms.filter(r => r.category === category);
            }

            if (rooms.length === 0) {
                container.innerHTML = `<p class="empty-msg">No hay salas en esta categoría.</p>`;
                return;
            }

            rooms.forEach(room => {
                container.appendChild(buildRoomCard(room));
            });
        })
        .catch(err => console.error("Error al cargar salas:", err));
}


// =========================================
// 🟦 Construir tarjeta de sala
// =========================================

function buildRoomCard(room) {
    const div = document.createElement("div");
    div.className = "room-card";

    div.innerHTML = `
        <img src="icons/chat.png" class="room-icon">

        <h3>${room.name}</h3>

        ${room.isOfficial ? `<span class="official-badge">⭐ Oficial</span>` : ""}

        <p class="room-category">${room.category}</p>

        <p class="room-users">${room.users ?? 0} online</p>

        <button class="btn-enter" onclick="enterRoom(${room.id})">Entrar</button>
    `;

    return div;
}

// =========================================
// 🟩 Entrar a sala
// =========================================

function enterRoom(id) {
    window.location.href = `/chat.html?room=${id}`;
}

// =========================================
// 🔵 Filtro de categorías
// =========================================

function setupCategoryFilter() {
    const cats = document.querySelectorAll("#categoryList li");

    cats.forEach(cat => {
        cat.addEventListener("click", () => {
            document.querySelector("#categoryList .active")?.classList.remove("active");
            cat.classList.add("active");
            loadRooms(cat.dataset.category);
        });
    });
}

// =========================================
// 🔵 Cargar header dinámico (usuario logueado)
// =========================================

function loadHeaderUser() {
    const username = localStorage.getItem("username");
    const area = document.getElementById("headerUserArea");

    if (!username) {
        area.innerHTML = `
            <a href="login.html" class="btn-login">Iniciar sesión</a>
            <a href="register.html" class="btn-register">Registro</a>
        `;
        return;
    }

    area.innerHTML = `
        <span class="header-user">Hola, <b>${username}</b></span>
        <a href="profile.html" class="btn-small">Mi perfil</a>
        <a href="admin.html" class="btn-small green">Panel Admin</a>
        <button class="btn-small red" onclick="logout()">Salir</button>
    `;
}

function logout() {
    localStorage.removeItem("username");
    window.location.reload();
}
