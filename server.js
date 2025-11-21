// ======================================================
//  Shateros 2.0 - Servidor Completo con Panel Admin
//  + Endpoints Mejorados para Index Moderno
// ======================================================

const express = require("express");
const path = require("path");
const http = require("http");
const session = require("express-session");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
// ======================================================
// 📁 Configuración de carpeta /uploads para avatares
// ======================================================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configuración de Multer (dónde guardar y cómo nombrar los archivos)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, "avatar_" + Date.now() + ext);
    }
});
const upload = multer({ storage });

// Servir la carpeta uploads en la web
app.use("/uploads", express.static(uploadDir));
// ======================================================
// 🔧 CONFIG MYSQL
// ======================================================
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "shateros",
};

let pool;
(async () => {
  pool = await mysql.createPool(dbConfig);
  console.log("✅ Conectado a MySQL");
})();

// ======================================================
// 🔧 Middlewares
// ======================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "shateros-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// 🔧 AUTH CHECK
// ======================================================
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.username !== "daniel") {
    return res.status(403).send("❌ No tienes permisos de administrador.");
  }
  next();
}

// ======================================================
// 🔧 SERVIR HTML
// ======================================================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/rooms", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "rooms.html"))
);
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
);
app.get("/register", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "register.html"))
);
app.get("/admin", requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);
app.get("/create-room", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "create-room.html"))
);
app.get("/chat", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "chat.html"))
);

// ======================================================
// 🟩 API: REGISTRO
// ======================================================
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);

    await pool.execute(
      "INSERT INTO users (username, password, lastSeen) VALUES (?, ?, NOW())",
      [username, hash]
    );

    // sesión
    req.session.user = { username };

    // actividad en vivo
    io.emit("activity", {
      type: "user_registered",
      message: `🧑‍💻 Nuevo usuario registrado: <strong>${username}</strong>`
    });

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, message: "Usuario ya existe" });
  }
});

app.post("/api/setColor", async (req, res) => {
    const { color } = req.body;

    if (!req.session.user) {
        return res.json({ ok: false });
    }

    try {
        await pool.query(
            "UPDATE users SET color = ? WHERE id = ?",
            [color, req.session.user.id]
        );

        req.session.user.color = color;

        res.json({ ok: true });

    } catch (err) {
        console.error("Error setColor:", err);
        res.json({ ok: false });
    }
});


// ======================================================
// 🟩 API: LOGIN
// ======================================================
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );

  if (rows.length === 0)
    return res.json({ ok: false, message: "Usuario no existe" });

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ ok: false, message: "Contraseña incorrecta" });

  // actualiza lastSeen
  await pool.execute("UPDATE users SET lastSeen = NOW() WHERE id = ?", [
    user.id,
  ]);

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    color: user.color,
    avatar: user.avatar
};

  res.json({ ok: true });
});

// ======================================================
// 🟩 API: SESIÓN (versión completa con avatar + role + color + id)
// ======================================================
// ======================================================
// 🟩 API: SESIÓN – compatible con invitados
// ======================================================
app.get("/api/session", async (req, res) => {

    // Si no hay sesión → no logueado
    if (!req.session.user) {
        return res.json({ logged: false });
    }

    // ✔ SI ES INVITADO (guest)
    if (req.session.user.guest) {
        return res.json({
            logged: true,
            id: null,
            username: req.session.user.username,
            avatarUrl: "/images/default-avatar.png",
            role: "guest",
            color: "#000000",
            isAdmin: false,
            guest: true
        });
    }

    // ✔ SI ES USUARIO NORMAL (registrado)
    try {
        const [rows] = await pool.execute(
            "SELECT id, username, avatar, role, color FROM users WHERE username = ?",
            [req.session.user.username]
        );

        if (rows.length === 0) {
            return res.json({ logged: false });
        }

        const user = rows[0];

        return res.json({
            logged: true,
            id: user.id,
            username: user.username,
            avatarUrl: user.avatar || "/images/default-avatar.png",
            role: user.role || "user",
            color: user.color || "#000000",
            isAdmin: user.role === "admin",
            guest: false
        });

    } catch (err) {
        console.error("❌ Error en /api/session:", err);
        return res.json({ logged: false });
    }
});


// ======================================================
// 🟩 API: LOGOUT
// ======================================================
app.get("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
// ======================================================
// 🔵 API: MIS SALAS (Creó / Entró / Administra)
// ======================================================
app.get("/api/myrooms", async (req, res) => {
    if (!req.session.user) {
        return res.json({ ok: false, message: "No autenticado" });
    }

    const username = req.session.user.username;

    try {
        const [rooms] = await pool.execute(`
            SELECT r.*
            FROM rooms r
            WHERE r.created_by = ? 
               OR r.admin = ?
        `, [username, username]);

        res.json({ ok: true, rooms });

    } catch (err) {
        console.error("Error en /api/myrooms:", err);
        res.json({ ok: false });
    }
});

// ======================================================
// 🟦 API: LOGIN COMO INVITADO
// ======================================================
app.post("/api/guest-login", async (req, res) => {
  try {
    const random = Math.floor(Math.random() * 9000 + 1000);
    const guestName = "Invitado_" + random;

    req.session.user = {
      id: null,
      username: guestName,
      guest: true,
    };

    res.json({ ok: true, guest: guestName });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

// ======================================================
// 🟩 API: CREAR SALA
// ======================================================
app.post("/api/create-room", async (req, res) => {
    try {
        const { name, description, category, password } = req.body;

        const [newRoom] = await pool.query(
            "INSERT INTO rooms (name, description, category, password) VALUES (?, ?, ?, ?)",
            [name, description, category, password || null]
        );

        res.json({
            success: true,
            roomId: newRoom.insertId   // 🔥 ESTA LÍNEA ES LA QUE FALTABA
        });

    } catch (err) {
        console.error("❌ Error al crear sala:", err);
        res.json({ success: false, message: err.message });
    }
});
app.post("/api/upload-avatar", upload.single("avatar"), async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ ok: false, message: "No autenticado" });
    }

    const filePath = "/uploads/" + req.file.filename;

    try {
        await pool.execute(
            "UPDATE users SET avatar = ? WHERE username = ?",
            [filePath, req.session.user.username]
        );
        res.json({ ok: true, avatarUrl: filePath });
    } catch (err) {
        console.error("Error actualizando avatar:", err);
        res.status(500).json({ ok: false });
    }
});

app.post("/api/delete-avatar", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ ok: false });
    }

    try {
        await pool.execute(
            "UPDATE users SET avatar = NULL WHERE username = ?",
            [req.session.user.username]
        );
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false });
    }
});

app.get("/api/user-activity", async (req, res) => {
    if (!req.session.user) return res.json([]);

    try {
        const [rows] = await pool.execute(
            `SELECT message, roomId, timestamp 
             FROM messages 
             WHERE username = ? 
             ORDER BY timestamp DESC 
             LIMIT 15`,
            [req.session.user.username]
        );

        const activity = rows.map(r =>
            `Enviastes un mensaje en Sala #${r.roomId} (${r.timestamp})`
        );

        res.json(activity);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// ======================================================
// 🟩 API: OBTENER ROOMS
// ======================================================


function getRoomOnlineCounts() {
  const counts = {};
  Object.values(onlineUsers).forEach((u) => {
    counts[u.roomId] = (counts[u.roomId] || 0) + 1;
  });
  return counts;
}

app.get("/api/rooms", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, name, category, is_official AS isOfficial FROM rooms ORDER BY category, name"
    );

    const counts = getRoomOnlineCounts();

    const finalRooms = rows.map((r) => ({
      ...r,
      users: counts[r.id] || 0,
    }));

    res.json(finalRooms);
  } catch (err) {
    console.error("Error en /api/rooms:", err);
    res.status(500).json({ ok: false });
  }
});

// ======================================================
// 🟦 API: LISTAR CATEGORÍAS
// ======================================================
app.get("/api/categories", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM categories ORDER BY name");
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

// ======================================================
// 🟦 API: HOME-DATA (para index)
// ======================================================
app.get("/api/home-data", async (req, res) => {
  try {
    const [categories] = await pool.execute(
      "SELECT id, name FROM categories ORDER BY name"
    );

    const [latestMembers] = await pool.execute(
      "SELECT username FROM users ORDER BY id DESC LIMIT 5"
    );

    const [activeUsers] = await pool.execute(
      "SELECT username FROM users WHERE lastSeen >= NOW() - INTERVAL 24 HOUR LIMIT 5"
    );

    const [popularRooms] = await pool.execute(`
      SELECT r.name, COUNT(m.id) AS membersCount
      FROM rooms r
      LEFT JOIN messages m ON r.id = m.roomId
      GROUP BY r.id
      ORDER BY membersCount DESC
      LIMIT 5
    `);

    res.json({
      categories,
      latestMembers,
      activeUsers,
      popularRooms,
    });
  } catch (err) {
    console.error("❌ Error en /api/home-data:", err);
    res.json({
      categories: [],
      latestMembers: [],
      activeUsers: [],
      popularRooms: [],
    });
  }
});

// ======================================================
// 🟦 API ADMIN (OFICIAL)
// ======================================================
app.post("/api/admin/setOfficial/:id", requireAdmin, async (req, res) => {
  await pool.execute("UPDATE rooms SET is_official = 1 WHERE id = ?", [
    req.params.id,
  ]);
  res.json({ ok: true });
});

app.post("/api/admin/unsetOfficial/:id", requireAdmin, async (req, res) => {
  await pool.execute("UPDATE rooms SET is_official = 0 WHERE id = ?", [
    req.params.id,
  ]);
  res.json({ ok: true });
});

// Dar host
app.post("/api/admin/set-host", requireAdmin, async (req, res) => {
    const { username } = req.body;

    await pool.query("UPDATE users SET role='host' WHERE username=?", [username]);

    // 👑 Quién dio el host (admin actual)
    const giver = req.session.user ? req.session.user.username : "Un administrador";

    // 🔥 Actualizar roles en memoria (si ya tienes usersInRooms, lo respetamos)
    for (const roomId in usersInRooms) {
        usersInRooms[roomId] = usersInRooms[roomId].map(u =>
            u.username === username ? { ...u, role: "host" } : u
        );
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }

    // Mensaje claro en el chat
    io.emit("systemMessage", `⭐ ${giver} le dio Host a ${username}.`);

    res.json({ ok: true });
});

// Quitar host
app.post("/api/admin/remove-host", requireAdmin, async (req, res) => {
  const { username } = req.body;
  await pool.query("UPDATE users SET role='user' WHERE username=?", [username]);
  io.emit("systemMessage", `❗ ${username} dejó de ser Host.`);
  res.json({ ok: true });
});

// Expulsar
app.post("/api/admin/kick-user", requireAdmin, (req, res) => {
    const { socketId, roomId } = req.body;

    io.to(socketId).emit("kicked");

    // 🔥 Remover usuario expulsado de la lista
    if (usersInRooms[roomId]) {
        usersInRooms[roomId] = usersInRooms[roomId].filter(u => u.id !== socketId);

        // 🔥 Actualizar lista en vivo
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }

    io.to(roomId).emit("systemMessage", `🚫 Un usuario fue expulsado de la sala.`);
    res.json({ ok: true });
});

// Banear (simple por username)
app.post("/api/admin/ban-user", requireAdmin, async (req, res) => {
    const { username, roomId } = req.body;

    await pool.query(
        "INSERT INTO bans (username, roomId) VALUES (?, ?)",
        [username, roomId]
    );

    // 🔥 Remover de la sala en vivo
    if (usersInRooms[roomId]) {
        usersInRooms[roomId] = usersInRooms[roomId].filter(u => u.username !== username);
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }

    io.emit("systemMessage", `⛔ ${username} fue baneado de la sala.`);
    res.json({ ok: true });
});


app.get("/profile", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "profile.html"));
});

app.get("/myrooms", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "myrooms.html"));
});

app.get("/api/latest-rooms", async (req, res) => {
    const [rows] = await pool.execute(
        "SELECT id, name FROM rooms ORDER BY id DESC LIMIT 5"
    );
    res.json(rows);
});
app.get("/api/active-users", async (req, res) => {
    const [rows] = await pool.execute(
        "SELECT username FROM users WHERE lastSeen >= NOW() - INTERVAL 5 MINUTE"
    );
    res.json(rows);
});
app.get("/api/news", (req, res) => {
    res.json([
        "Nuevo diseño disponible 🎨",
        "Actualización 1.2 del sistema 🚀",
        "Mejoras en salas oficiales ⭐"
    ]);
});
// ======================================================
//  API: OBTENER MENSAJES DE UNA SALA
// ======================================================
app.get("/api/get-messages", async (req, res) => {
    const roomId = req.query.roomId;

    if (!roomId) {
        return res.json([]);
    }

    try {
        const [rows] = await pool.execute(
            "SELECT username, message, timestamp FROM messages WHERE roomId = ? ORDER BY id ASC",
            [roomId]
        );

        res.json(rows);
    } catch (err) {
        console.error("Error en /api/get-messages:", err);
        res.json([]);
    }
});


// ======================================================
//  API: GUARDAR MENSAJE EN LA BASE DE DATOS
// ======================================================
app.post("/api/send-message", async (req, res) => {
    const { roomId, username, message } = req.body;

    if (!roomId || !username || !message) {
        return res.json({ ok: false });
    }

    try {
        await pool.execute(
            "INSERT INTO messages (roomId, username, message) VALUES (?, ?, ?)",
            [roomId, username, message]
        );

        // actualizar actividad del usuario
        await pool.execute(
            "UPDATE users SET lastSeen = NOW() WHERE username = ?",
            [username]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error("Error en /api/send-message:", err);
        res.json({ ok: false });
    }
});
// ======================================================
// 🔵 SOCKET.IO
// ======================================================
// ======================================================
// 🔵 SOCKET.IO – Gestión de usuarios conectados por sala
// ======================================================

let onlineUsers = {};      // socket.id -> { roomId }
let usersInRooms = {};     // roomId -> [ {id, username, avatar, role} ]

io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado:", socket.id);

socket.on("changeStatus", (st) => {
    // Guardar el estado en la lista de usuarios
    for (const room in usersInRooms) {
        usersInRooms[room] = usersInRooms[room].map(u =>
            u.id === socket.id ? { ...u, status: st } : u
        );
    }

    // Notificar a todos en la sala
    const roomId = onlineUsers[socket.id]?.roomId;
    if (roomId) {
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }
});

// ============================================
//   MENSAJES PRIVADOS (PV)
// ============================================
socket.on("pvMessage", (data) => {
    // La data recibida del cliente trae el mensaje en la propiedad 'text'.
    // Tu código de cliente lo envía como: { to, from, text: msg, avatar, role }
    
    // Aquí recibimos: { from, to, text, avatar, role }
    const { from, to, text, avatar, role } = data; // <<< Asegúrate de usar 'text'

    // Buscar al usuario destino en todas las salas
    for (const roomId in usersInRooms) {
        usersInRooms[roomId].forEach(u => {
            if (u.username === to) {
                // CORRECCIÓN: El mensaje se debe enviar con la propiedad que el cliente espera: 'text'
                io.to(u.id).emit("pvMessage", { 
                    from,
                    to,
                    text, // <<< Esto es lo que faltaba o estaba mal nombrado
                    avatar,
                    role
                });
            }
        });
    }
});

    // Usuario entra a una sala
    socket.on("joinRoom", ({ roomId, username, avatar, role }) => {

        socket.join(roomId);

        // Guardar conexión básica
        onlineUsers[socket.id] = { roomId };

        // Crear lista si no existe
        if (!usersInRooms[roomId]) usersInRooms[roomId] = [];

        // Agregar usuario con info completa
        usersInRooms[roomId].push({
            id: socket.id,
            username,
            avatar: avatar || "/images/default-avatar.png",
            role: role || "user"
        });

        // Enviar lista actualizada a TODOS en la sala
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    });

    // Mensajes
    socket.on("sendMessage", (msg) => {

        io.emit("activity", {
            type: "message",
            message: `💬 <strong>${msg.username}</strong> habló en <strong>Sala #${msg.roomId}</strong>`
        });

        io.to(msg.roomId).emit("receiveMessage", {
            username: msg.username,
            message: msg.message,
            timestamp: new Date().toLocaleTimeString()
        });
    });

// ======================
//  COMANDO /pass
// ======================
socket.on("checkPass", ({ roomId, user, pass }) => {

    pool.query("SELECT password FROM rooms WHERE id = ?", [roomId])
        .then(([rows]) => {

            // Sala no existe o no tiene pass
            if (!rows.length || !rows[0].password) {
                io.to(socket.id).emit("passResult", { ok: false });
                return;
            }

            if (rows[0].password === pass) {
                // Cambiar a OWNER dentro de la sala
                usersInRooms[roomId] = usersInRooms[roomId].map(u => {
                    if (u.username === user) u.role = "owner";
                    return u;
                });

                // Notificar a todos
                io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
                io.to(socket.id).emit("passResult", { ok: true });
            } else {
                io.to(socket.id).emit("passResult", { ok: false });
            }
        });
});
    // Salida
    socket.on("disconnect", () => {

        // Eliminar de usersInRooms
        for (const roomId in usersInRooms) {
            usersInRooms[roomId] =
                usersInRooms[roomId].filter(u => u.id !== socket.id);

            // Actualizar lista en la sala
            io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
        }

        delete onlineUsers[socket.id];
    });
});


app.get("/api/admin-stats", requireAdmin, async (req, res) => {
    try {
        const [[users]] = await pool.query("SELECT COUNT(*) AS total FROM users");
        const [[rooms]] = await pool.query("SELECT COUNT(*) AS total FROM rooms");
        const [[active24]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE lastSeen >= NOW() - INTERVAL 1 DAY");
        const [[msgs]] = await pool.query("SELECT COUNT(*) AS total FROM messages");

        // Actividad semanal (mensajes por día)
        const [week] = await pool.query(`
            SELECT DATE(created_at) AS d, COUNT(*) AS cant  
            FROM messages 
            WHERE created_at >= NOW() - INTERVAL 7 DAY 
            GROUP BY DATE(created_at)
        `);

        const weekLabels = week.map(x => x.d.toISOString().split("T")[0]);
        const weekData = week.map(x => x.cant);

        res.json({
            users: users.total,
            rooms: rooms.total,
            active24h: active24.total,
            messages: msgs.total,
            weekLabels,
            weekData
        });

    } catch (err) {
        console.error("Error /api/admin-stats", err);
        res.json({ users: 0, rooms: 0, active24h: 0, messages: 0, weekLabels: [], weekData: [] });
    }
});

app.get("/api/admin-users", requireAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT id, username, avatar, 
            IFNULL(DATE_FORMAT(lastSeen, '%d/%m/%Y %H:%i'), 'Nunca') AS lastSeen 
            FROM users ORDER BY id DESC
        `);
        res.json(users);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

app.get("/api/admin-rooms", requireAdmin, async (req, res) => {
    try {
        const [rooms] = await pool.query(`
            SELECT id, name, category, isOfficial 
            FROM rooms ORDER BY id DESC
        `);
        res.json(rooms);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});
app.get("/api/admin-delete-room", requireAdmin, async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) return res.json({ error: "ID requerido" });

        await pool.query("DELETE FROM messages WHERE roomId = ?", [id]);
        await pool.query("DELETE FROM rooms WHERE id = ?", [id]);

        res.json({ success: true, roomId: result.insertId });


    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/api/admin-categories", requireAdmin, async (req, res) => {
    try {
        const [cats] = await pool.query("SELECT name FROM categories ORDER BY name ASC");
        res.json(cats);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});
app.get("/api/admin-logs", requireAdmin, async (req, res) => {
    try {
        const [logs] = await pool.query(`
            SELECT text, DATE_FORMAT(created_at, '%d/%m - %H:%i') AS fecha 
            FROM logs ORDER BY id DESC LIMIT 30
        `);

        res.json(logs.map(l => `${l.fecha} — ${l.text}`));

    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

async function addLog(text) {
    try {
        await pool.query("INSERT INTO logs (text) VALUES (?)", [text]);
    } catch (err) {
        console.error("Error al guardar log:", err);
    }
}

app.get("/api/get-room-info", async (req, res) => {
    const { roomId } = req.query;

    const [[room]] = await pool.query(
        "SELECT id, name, password FROM rooms WHERE id = ?",
        [roomId]
    );

    res.json(room || {});
});

// ======================================================
// 🔧 START SERVER
// ======================================================
const PORT = 3000;
server.listen(PORT, () =>
  console.log("🚀 Servidor Shateros 2.0 funcionando en http://localhost:" + PORT)
);
