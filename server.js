// ======================================================
//  Shateros 2.0 - Servidor Completo (Railway Ready)
// ======================================================

require("dotenv").config(); // Cargar variables de entorno
const express = require("express");
const path = require("path");
const http = require("http");
const session = require("express-session");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
// Importar el store para guardar sesiones en MySQL
const MySQLStore = require("express-mysql-session")(session);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ======================================================
// 🔧 CONFIG MYSQL (RAILWAY & LOCAL)
// ======================================================
// Usamos la variable 'pool' para mantener compatibilidad con tu código original
const dbOptions = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "shateros",
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbOptions);

// Verificar conexión al iniciar
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("✅ Conectado a MySQL exitosamente");
        connection.release();
    } catch (err) {
        console.error("❌ Error conectando a MySQL:", err.message);
    }
})();

// ======================================================
// 📁 Configuración de carpeta /uploads para avatares
// ======================================================
// NOTA: En Railway, los archivos subidos aquí desaparecen al reiniciar.
// Para producción real se recomienda usar AWS S3 o Cloudinary.
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, "avatar_" + Date.now() + ext);
    }
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadDir));

// ======================================================
// 🔧 Middlewares
// ======================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Configuración del Store de Sesiones (Para que no se cierren al reiniciar)
const sessionStore = new MySQLStore({}, pool);

app.use(
    session({
        key: "session_cookie",
        secret: process.env.SESSION_SECRET || "shateros-secret-key",
        store: sessionStore, // Guardar sesión en BD
        resave: false,
        saveUninitialized: false,
        cookie: { 
            maxAge: 3600000 * 24 // 1 día de duración
        }
    })
);

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
// 🔧 RUTAS DE PÁGINAS (SERVIR HTML)
// ======================================================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/rooms", (req, res) => res.sendFile(path.join(__dirname, "public", "rooms.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "public", "register.html")));
app.get("/admin", requireAdmin, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/create-room", (req, res) => res.sendFile(path.join(__dirname, "public", "create-room.html")));
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/profile", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    res.sendFile(path.join(__dirname, "public", "profile.html"));
});
app.get("/myrooms", (req, res) => {
    if (!req.session.user) return res.redirect("/login");
    res.sendFile(path.join(__dirname, "public", "myrooms.html"));
});

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

        req.session.user = { username };

        io.emit("activity", {
            type: "user_registered",
            message: `🧑‍💻 Nuevo usuario registrado: <strong>${username}</strong>`
        });

        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.json({ ok: false, message: "Usuario ya existe" });
    }
});

app.post("/api/setColor", async (req, res) => {
    const { color } = req.body;
    if (!req.session.user) return res.json({ ok: false });

    try {
        await pool.query("UPDATE users SET color = ? WHERE id = ?", [color, req.session.user.id]);
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
    try {
        const [rows] = await pool.execute("SELECT * FROM users WHERE username = ?", [username]);

        if (rows.length === 0) return res.json({ ok: false, message: "Usuario no existe" });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) return res.json({ ok: false, message: "Contraseña incorrecta" });

        await pool.execute("UPDATE users SET lastSeen = NOW() WHERE id = ?", [user.id]);

        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            color: user.color,
            avatar: user.avatar
        };

        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.json({ ok: false, message: "Error de servidor" });
    }
});

// ======================================================
// 🟩 API: SESIÓN
// ======================================================
app.get("/api/session", async (req, res) => {
    if (!req.session.user) {
        return res.json({ logged: false });
    }

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

    try {
        const [rows] = await pool.execute(
            "SELECT id, username, avatar, role, color FROM users WHERE username = ?",
            [req.session.user.username]
        );

        if (rows.length === 0) return res.json({ logged: false });
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

app.get("/api/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

// ======================================================
// 🔵 API: MIS SALAS
// ======================================================
app.get("/api/myrooms", async (req, res) => {
    if (!req.session.user) return res.json({ ok: false, message: "No autenticado" });
    const username = req.session.user.username;

    try {
        const [rooms] = await pool.execute(`
            SELECT r.* FROM rooms r
            WHERE r.created_by = ? OR r.admin = ?
        `, [username, username]);
        res.json({ ok: true, rooms });
    } catch (err) {
        console.error("Error en /api/myrooms:", err);
        res.json({ ok: false });
    }
});

// ======================================================
// 🟦 API: GUEST LOGIN
// ======================================================
app.post("/api/guest-login", async (req, res) => {
    try {
        const random = Math.floor(Math.random() * 9000 + 1000);
        const guestName = "Invitado_" + random;
        req.session.user = { id: null, username: guestName, guest: true };
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
        res.json({ success: true, roomId: newRoom.insertId });
    } catch (err) {
        console.error("❌ Error al crear sala:", err);
        res.json({ success: false, message: err.message });
    }
});

app.post("/api/upload-avatar", upload.single("avatar"), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ ok: false, message: "No autenticado" });
    
    // Nota: Esto apunta al archivo local. En Railway, al reiniciar, este archivo se perderá.
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
    if (!req.session.user) return res.status(401).json({ ok: false });
    try {
        await pool.execute("UPDATE users SET avatar = NULL WHERE username = ?", [req.session.user.username]);
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false });
    }
});

app.get("/api/user-activity", async (req, res) => {
    if (!req.session.user) return res.json([]);
    try {
        const [rows] = await pool.execute(
            `SELECT message, roomId, timestamp FROM messages 
             WHERE username = ? ORDER BY timestamp DESC LIMIT 15`,
            [req.session.user.username]
        );
        const activity = rows.map(r => `Enviastes un mensaje en Sala #${r.roomId} (${r.timestamp})`);
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
        const [rows] = await pool.execute("SELECT id, name, category, is_official AS isOfficial FROM rooms ORDER BY category, name");
        const counts = getRoomOnlineCounts();
        const finalRooms = rows.map((r) => ({ ...r, users: counts[r.id] || 0 }));
        res.json(finalRooms);
    } catch (err) {
        console.error("Error en /api/rooms:", err);
        res.status(500).json({ ok: false });
    }
});

app.get("/api/categories", async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM categories ORDER BY name");
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

// ======================================================
// 🟦 API: HOME-DATA
// ======================================================
app.get("/api/home-data", async (req, res) => {
    try {
        const [categories] = await pool.execute("SELECT id, name FROM categories ORDER BY name");
        const [latestMembers] = await pool.execute("SELECT username FROM users ORDER BY id DESC LIMIT 5");
        const [activeUsers] = await pool.execute("SELECT username FROM users WHERE lastSeen >= NOW() - INTERVAL 24 HOUR LIMIT 5");
        const [popularRooms] = await pool.execute(`
            SELECT r.name, COUNT(m.id) AS membersCount
            FROM rooms r
            LEFT JOIN messages m ON r.id = m.roomId
            GROUP BY r.id
            ORDER BY membersCount DESC LIMIT 5
        `);

        res.json({ categories, latestMembers, activeUsers, popularRooms });
    } catch (err) {
        console.error("❌ Error en /api/home-data:", err);
        res.json({ categories: [], latestMembers: [], activeUsers: [], popularRooms: [] });
    }
});

// ======================================================
// 🟦 API ADMIN
// ======================================================
app.post("/api/admin/setOfficial/:id", requireAdmin, async (req, res) => {
    await pool.execute("UPDATE rooms SET is_official = 1 WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
});

app.post("/api/admin/unsetOfficial/:id", requireAdmin, async (req, res) => {
    await pool.execute("UPDATE rooms SET is_official = 0 WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
});

app.post("/api/admin/set-host", requireAdmin, async (req, res) => {
    const { username } = req.body;
    await pool.query("UPDATE users SET role='host' WHERE username=?", [username]);
    const giver = req.session.user ? req.session.user.username : "Un administrador";
    
    for (const roomId in usersInRooms) {
        usersInRooms[roomId] = usersInRooms[roomId].map(u =>
            u.username === username ? { ...u, role: "host" } : u
        );
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }
    io.emit("systemMessage", `⭐ ${giver} le dio Host a ${username}.`);
    res.json({ ok: true });
});

app.post("/api/admin/remove-host", requireAdmin, async (req, res) => {
    const { username } = req.body;
    await pool.query("UPDATE users SET role='user' WHERE username=?", [username]);
    io.emit("systemMessage", `❗ ${username} dejó de ser Host.`);
    res.json({ ok: true });
});

app.post("/api/admin/kick-user", requireAdmin, (req, res) => {
    const { socketId, roomId } = req.body;
    io.to(socketId).emit("kicked");
    if (usersInRooms[roomId]) {
        usersInRooms[roomId] = usersInRooms[roomId].filter(u => u.id !== socketId);
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }
    io.to(roomId).emit("systemMessage", `🚫 Un usuario fue expulsado de la sala.`);
    res.json({ ok: true });
});

app.post("/api/admin/ban-user", requireAdmin, async (req, res) => {
    const { username, roomId } = req.body;
    await pool.query("INSERT INTO bans (username, roomId) VALUES (?, ?)", [username, roomId]);
    if (usersInRooms[roomId]) {
        usersInRooms[roomId] = usersInRooms[roomId].filter(u => u.username !== username);
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    }
    io.emit("systemMessage", `⛔ ${username} fue baneado de la sala.`);
    res.json({ ok: true });
});

app.get("/api/latest-rooms", async (req, res) => {
    const [rows] = await pool.execute("SELECT id, name FROM rooms ORDER BY id DESC LIMIT 5");
    res.json(rows);
});
app.get("/api/active-users", async (req, res) => {
    const [rows] = await pool.execute("SELECT username FROM users WHERE lastSeen >= NOW() - INTERVAL 5 MINUTE");
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
//  API: MENSAJES
// ======================================================
app.get("/api/get-messages", async (req, res) => {
    const roomId = req.query.roomId;
    if (!roomId) return res.json([]);
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

app.post("/api/send-message", async (req, res) => {
    const { roomId, username, message } = req.body;
    if (!roomId || !username || !message) return res.json({ ok: false });
    try {
        await pool.execute(
            "INSERT INTO messages (roomId, username, message) VALUES (?, ?, ?)",
            [roomId, username, message]
        );
        await pool.execute("UPDATE users SET lastSeen = NOW() WHERE username = ?", [username]);
        res.json({ ok: true });
    } catch (err) {
        console.error("Error en /api/send-message:", err);
        res.json({ ok: false });
    }
});

// ======================================================
// 🔵 SOCKET.IO
// ======================================================
let onlineUsers = {};      // socket.id -> { roomId }
let usersInRooms = {};     // roomId -> [ {id, username, avatar, role} ]

io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado:", socket.id);

    socket.on("changeStatus", (st) => {
        for (const room in usersInRooms) {
            usersInRooms[room] = usersInRooms[room].map(u =>
                u.id === socket.id ? { ...u, status: st } : u
            );
        }
        const roomId = onlineUsers[socket.id]?.roomId;
        if (roomId) {
            io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
        }
    });

    socket.on("pvMessage", (data) => {
        const { from, to, text, avatar, role } = data;
        for (const roomId in usersInRooms) {
            usersInRooms[roomId].forEach(u => {
                if (u.username === to) {
                    io.to(u.id).emit("pvMessage", { from, to, text, avatar, role });
                }
            });
        }
    });

    socket.on("joinRoom", ({ roomId, username, avatar, role }) => {
        socket.join(roomId);
        onlineUsers[socket.id] = { roomId };
        if (!usersInRooms[roomId]) usersInRooms[roomId] = [];
        usersInRooms[roomId].push({
            id: socket.id,
            username,
            avatar: avatar || "/images/default-avatar.png",
            role: role || "user"
        });
        io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
    });

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

    socket.on("checkPass", ({ roomId, user, pass }) => {
        pool.query("SELECT password FROM rooms WHERE id = ?", [roomId])
            .then(([rows]) => {
                if (!rows.length || !rows[0].password) {
                    io.to(socket.id).emit("passResult", { ok: false });
                    return;
                }
                if (rows[0].password === pass) {
                    usersInRooms[roomId] = usersInRooms[roomId].map(u => {
                        if (u.username === user) u.role = "owner";
                        return u;
                    });
                    io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
                    io.to(socket.id).emit("passResult", { ok: true });
                } else {
                    io.to(socket.id).emit("passResult", { ok: false });
                }
            });
    });

    socket.on("disconnect", () => {
        for (const roomId in usersInRooms) {
            usersInRooms[roomId] = usersInRooms[roomId].filter(u => u.id !== socket.id);
            io.to(roomId).emit("roomUsers", usersInRooms[roomId]);
        }
        delete onlineUsers[socket.id];
    });
});

// ======================================================
// ADMIN STATS & UTILS
// ======================================================
app.get("/api/admin-stats", requireAdmin, async (req, res) => {
    try {
        const [[users]] = await pool.query("SELECT COUNT(*) AS total FROM users");
        const [[rooms]] = await pool.query("SELECT COUNT(*) AS total FROM rooms");
        const [[active24]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE lastSeen >= NOW() - INTERVAL 1 DAY");
        const [[msgs]] = await pool.query("SELECT COUNT(*) AS total FROM messages");

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
        res.json({ users: 0, rooms: 0, active24h: 0, messages: 0, weekLabels: [], weekData: [] });
    }
});

app.get("/api/admin-users", requireAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(`SELECT id, username, avatar, IFNULL(DATE_FORMAT(lastSeen, '%d/%m/%Y %H:%i'), 'Nunca') AS lastSeen FROM users ORDER BY id DESC`);
        res.json(users);
    } catch (err) { res.json([]); }
});

app.get("/api/admin-rooms", requireAdmin, async (req, res) => {
    try {
        const [rooms] = await pool.query(`SELECT id, name, category, isOfficial FROM rooms ORDER BY id DESC`);
        res.json(rooms);
    } catch (err) { res.json([]); }
});

app.get("/api/admin-delete-room", requireAdmin, async (req, res) => {
    try {
        const id = req.query.id;
        if (!id) return res.json({ error: "ID requerido" });
        await pool.query("DELETE FROM messages WHERE roomId = ?", [id]);
        await pool.query("DELETE FROM rooms WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

app.get("/api/admin-categories", requireAdmin, async (req, res) => {
    try {
        const [cats] = await pool.query("SELECT name FROM categories ORDER BY name ASC");
        res.json(cats);
    } catch (err) { res.json([]); }
});

app.get("/api/admin-logs", requireAdmin, async (req, res) => {
    try {
        const [logs] = await pool.query(`SELECT text, DATE_FORMAT(created_at, '%d/%m - %H:%i') AS fecha FROM logs ORDER BY id DESC LIMIT 30`);
        res.json(logs.map(l => `${l.fecha} — ${l.text}`));
    } catch (err) { res.json([]); }
});

app.get("/api/get-room-info", async (req, res) => {
    const { roomId } = req.query;
    const [[room]] = await pool.query("SELECT id, name, password FROM rooms WHERE id = ?", [roomId]);
    res.json(room || {});
});

// ======================================================
// 🔧 START SERVER (PUERTO DINÁMICO)
// ======================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Shateros 2.0 funcionando en puerto ${PORT}`);
});
