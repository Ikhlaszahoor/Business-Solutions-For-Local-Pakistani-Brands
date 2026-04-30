require("dotenv").config();
const express         = require("express");
const http            = require("http");
const { Server }      = require("socket.io");
const helmet          = require("helmet");
const cors            = require("cors");
const rateLimit       = require("express-rate-limit");
const path            = require("path");
const logger          = require("./backend/services/logger");
const db              = require("./backend/services/database");
const telegramSvc     = require("./backend/services/telegram");
const analysisSvc     = require("./backend/services/analysis");
const authRoutes      = require("./backend/routes/auth");
const cameraRoutes    = require("./backend/routes/cameras");
const alertRoutes     = require("./backend/routes/alerts");
const analyticsRoutes = require("./backend/routes/analytics");
const { verifyToken } = require("./backend/middleware/auth");

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 15 * 1024 * 1024,
});

app.set("io", io);
global.io = io;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use("/api/", limiter);
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });
app.use("/api/auth/", authLimiter);

app.use(express.static(path.join(__dirname, "frontend")));
app.use("/api/auth",      authRoutes);
app.use("/api/cameras",   verifyToken, cameraRoutes);
app.use("/api/alerts",    verifyToken, alertRoutes);
app.use("/api/analytics", verifyToken, analyticsRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "online", system: "United HighEyes v2.0", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "frontend", "index.html")));

io.on("connection", (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on("analyze_frame", async (data) => {
    const { cameraId, cameraName, frameBase64 } = data;
    if (!frameBase64 || !cameraId) { socket.emit("analysis_error", { cameraId, error: "Invalid data" }); return; }
    try {
      const result = await analysisSvc.analyzeFrame({ cameraId, cameraName: cameraName || `Camera ${cameraId}`, frameBase64 });
      io.emit("analysis_result", { cameraId, ...result });
      db.updateCameraLastFrame(cameraId);
      const threshold = parseFloat(process.env.THREAT_CONFIDENCE_THRESHOLD || "0.75");
      if (result.threatDetected && result.confidence >= threshold) {
        await handleThreatAlert(result, cameraId, cameraName, frameBase64);
      }
    } catch (err) {
      logger.error(`Analysis error [cam:${cameraId}]: ${err.message}`);
      socket.emit("analysis_error", { cameraId, error: err.message });
    }
  });

  socket.on("register_camera", (data) => { db.registerCamera(data); io.emit("camera_registered", data); });
  socket.on("disconnect", () => logger.info(`Client disconnected: ${socket.id}`));
});

const alertCooldowns = new Map();

async function handleThreatAlert(result, cameraId, cameraName, frameBase64) {
  const cooldownMs = parseInt(process.env.ALERT_COOLDOWN_SECONDS || "30") * 1000;
  const now = Date.now();
  if (now - (alertCooldowns.get(cameraId) || 0) < cooldownMs) return;
  alertCooldowns.set(cameraId, now);

  const alertId = db.saveAlert({ cameraId, cameraName, threatType: result.threatType, confidence: result.confidence, description: result.description, timestamp: new Date().toISOString() });

  io.emit("threat_alert", { alertId, cameraId, cameraName, threatType: result.threatType, confidence: result.confidence, description: result.description, recommendation: result.recommendation, snapshot: frameBase64, timestamp: new Date().toISOString() });

  await telegramSvc.sendThreatAlert({ alertId, cameraName, threatType: result.threatType, confidence: result.confidence, description: result.description, frameBase64 });

  logger.warn(`THREAT [cam:${cameraId}] ${result.threatType} ${Math.round(result.confidence*100)}%`);
}

const PORT = process.env.PORT || 8080;
db.initialize();
server.listen(PORT, () => {
  logger.info(`United HighEyes v2.0 running on http://localhost:${PORT}`);
  telegramSvc.sendSystemNotification(`United HighEyes v2.0 ONLINE on port ${PORT}.`);
});
process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
