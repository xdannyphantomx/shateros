// ==========================================================
//  ADMIN PANEL – SHATEROS 2.0 MSN PRO 2025
// ==========================================================

async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    return res.json();
}

// ==========================================================
// 🔵 CARGAR DASHBOARD
// ==========================================================
async function loadDashboard() {
    const users = await fetchJSON("/api/admin/stats/users");
    const rooms = await fetchJSON("/api/admin/stats/rooms");
    const official = await fetchJSON("/api/admin/stats/officialRooms");
    const online = await fetchJSON("/api/admin/stats/onlineUsers");

    document.getElementById("statUsers").innerText = users.total ?? 0;
    document.getElementById("statRooms").innerText = rooms.total ?? 0;
    document.getElementById("statOfficial").innerText = official.total ?? 0;
    document.getElementById("statOnline").innerText = online.total ?? 0;
}

// ==========================================================
// 🔵 CARGAR USUARIOS
// ==========================================================
async function loadUsers() {
    const table = document.querySelector("#usersTable tbody");
    table.innerHTML = "";

    const users = await fetchJSON("/api/admin/users");

    users.forEach(u => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${u.id}</td>
            <td><strong>${u.username}</strong></td>

            <td>
                <div class="user-avatar">
                    <img src="${u.avatar || 'icons/default.png'}" width="28">
                </div>
            </td>

            <td>${u.role}</td>

            <td>${u.status === 1 ? "Activo" : "Suspendido"}</td>

            <td class="actions">
                <button class="btn-small btn-blue" onclick="makeAdmin(${u.id})">Admin</button>
                <button class="btn-small btn-green" onclick="unbanUser(${u.id})">Activar</button>
                <button class="btn-small btn-red" onclick="banUser(${u.id})">Ban</button>
            </td>
        `;

        table.appendChild(tr);
    });
}

// ==========================================================
// 🔵 ACCIONES DE USUARIOS
// ==========================================================
async function makeAdmin(id) {
    await fetchJSON(`/api/admin/makeAdmin/${id}`, { method: "POST" });
    loadUsers();
}

async function banUser(id) {
    await fetchJSON(`/api/admin/banUser/${id}`, { method: "POST" });
    loadUsers();
}

async function unbanUser(id) {
    await fetchJSON(`/api/admin/unbanUser/${id}`, { method: "POST" });
    loadUsers();
}

// ==========================================================
// 🔵 CARGAR SALAS
// ==========================================================
async function loadRoomsAdmin() {
    const table = document.querySelector("#roomsTable tbody");
    table.innerHTML = "";

    const rooms = await fetchJSON("/api/admin/rooms");

    rooms.forEach(r => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${r.id}</td>
            <td><strong>${r.name}</strong></td>
            <td>${r.category}</td>

            <td>${r.isOfficial ? "⭐ Sí" : "No"}</td>
            <td>${r.users}</td>

            <td class="actions">
                ${r.isOfficial
                    ? `<button class="btn-small btn-red" onclick="unsetOfficial(${r.id})">Quitar oficial</button>`
                    : `<button class="btn-small btn-blue" onclick="setOfficial(${r.id})">Hacer oficial</button>`}

                ${r.isAdult
                    ? `<button class="btn-small btn-red" onclick="unsetAdult(${r.id})">Quitar +18</button>`
                    : `<button class="btn-small btn-orange" onclick="setAdult(${r.id})">+18</button>`}
            </td>
        `;

        table.appendChild(tr);
    });
}

// ==========================================================
// 🔵 ACCIONES SALAS
// ==========================================================
async function setOfficial(id) {
    await fetchJSON(`/api/admin/setOfficial/${id}`, { method: "POST" });
    loadRoomsAdmin();
}

async function unsetOfficial(id) {
    await fetchJSON(`/api/admin/unsetOfficial/${id}`, { method: "POST" });
    loadRoomsAdmin();
}

async function setAdult(id) {
    await fetchJSON(`/api/admin/setAdult/${id}`, { method: "POST" });
    loadRoomsAdmin();
}

async function unsetAdult(id) {
    await fetchJSON(`/api/admin/unsetAdult/${id}`, { method: "POST" });
    loadRoomsAdmin();
}

// ==========================================================
// 🔵 CATEGORÍAS
// ==========================================================
async function loadCategories() {
    const table = document.querySelector("#categoriesTable tbody");
    table.innerHTML = "";

    const categories = await fetchJSON("/api/admin/categories");

    categories.forEach(c => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${c.id}</td>
            <td>${c.name}</td>

            <td class="actions">
                <button class="btn-small btn-red" onclick="deleteCategory(${c.id})">Eliminar</button>
            </td>
        `;

        table.appendChild(tr);
    });
}

async function addCategory() {
    const name = document.getElementById("newCategory").value;
    if (!name) return alert("Escribe una categoría");

    await fetchJSON("/api/admin/addCategory", {
        method: "POST",
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" }
    });

    loadCategories();
}

async function deleteCategory(id) {
    await fetchJSON(`/api/admin/deleteCategory/${id}`, { method: "POST" });
    loadCategories();
}

// ==========================================================
// 🔵 LOGS
// ==========================================================
async function loadLogs() {
    const logs = await fetchJSON("/api/admin/logs");

    const list = document.getElementById("logsList");
    list.innerHTML = "";

    logs.forEach(log => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${log.action}</strong> — ${log.detail} <span>${log.date}</span>`;
        list.appendChild(li);
    });
}

// ==========================================================
// 🔵 INICIALIZAR PÁGINA
// ==========================================================
document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    loadUsers();
    loadRoomsAdmin();
    loadCategories();
    loadLogs();
});
