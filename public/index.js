async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

async function loadAuth() {
  const section = document.getElementById("authSection");
  const status = await fetchJSON("/api/auth/status");

  if (!status.loggedIn) {
    section.innerHTML = `
      No has iniciado sesión.
      <br><br>
      <button onclick="location.href='/'" class="btn-login">Iniciar sesión</button>
      <button onclick="location.href='/'" class="btn-register">Registrarte</button>
    `;
  } else {
    section.innerHTML = `
      Sesión iniciada como <strong>${status.user.username}</strong>
      <br><br>
      <button onclick="logout()" class="btn-login">Cerrar sesión</button>
    `;
  }
}

async function logout() {
  await fetchJSON("/api/logout", { method: "POST" });
  location.reload();
}

async function loadPopularRooms() {
  const list = document.getElementById("popularRoomsList");
  const data = await fetchJSON("/api/rooms/popular");

  list.innerHTML = "";
  data.rooms.forEach(r => {
    list.innerHTML += `<li>#${r.name}</li>`;
  });
}

async function loadCategories() {
  const list = document.getElementById("categoriesList");
  const data = await fetchJSON("/api/rooms");

  const cats = {};
  data.rooms.forEach(r => cats[r.category] = true);

  list.innerHTML = Object.keys(cats).map(c => `<li>${c}</li>`).join("");
}

async function loadMembers() {
  const latest = document.getElementById("latestMembers");
  const active = document.getElementById("activeMembers");

  const latestData = await fetchJSON("/api/members/latest");
  latest.innerHTML = latestData.members.map(m => `<li>${m.username}</li>`).join("");

  const activeData = await fetchJSON("/api/members/active");
  active.innerHTML = activeData.members.map(m => `<li>${m.username}</li>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadAuth();
  loadPopularRooms();
  loadCategories();
  loadMembers();
});
