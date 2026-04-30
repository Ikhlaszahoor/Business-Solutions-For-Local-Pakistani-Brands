const Database = require("better-sqlite3");
const path     = require("path");
const { v4: uuidv4 } = require("uuid");
const bcrypt   = require("bcryptjs");
const logger   = require("./logger");

// ══════════════════════════════════════════
// United HighEyes — Database Service
// SQLite: fast, zero-config, production-ready
// Tables: users, cameras, alerts, snapshots
// ══════════════════════════════════════════

const DB_PATH = path.join(__dirname, "../../config/surveillance.db");

class DatabaseService {
  constructor() {
    this.db = null;
  }

  // ── Database initialize + tables create karo
  initialize() {
    this.db = new Database(DB_PATH);

    // WAL mode = faster concurrent reads/writes
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.createTables();
    this.seedAdminUser();

    logger.info("Database initialized successfully");
  }

  createTables() {
    // Users table — admin authentication
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        username    TEXT UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        role        TEXT DEFAULT 'admin',
        created_at  TEXT DEFAULT (datetime('now')),
        last_login  TEXT
      );
    `);

    // Cameras table — registered CCTV cameras
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cameras (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        location    TEXT,
        stream_url  TEXT,
        status      TEXT DEFAULT 'active',
        created_at  TEXT DEFAULT (datetime('now')),
        last_frame  TEXT
      );
    `);

    // Alerts table — all detected threats
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id           TEXT PRIMARY KEY,
        camera_id    TEXT NOT NULL,
        camera_name  TEXT NOT NULL,
        threat_type  TEXT NOT NULL,
        confidence   REAL NOT NULL,
        description  TEXT,
        acknowledged INTEGER DEFAULT 0,
        timestamp    TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (camera_id) REFERENCES cameras(id)
      );
    `);

    // System logs table — audit trail
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        level      TEXT NOT NULL,
        message    TEXT NOT NULL,
        timestamp  TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // ── Default admin user seed karo (first run only)
  seedAdminUser() {
    const existing = this.db.prepare("SELECT id FROM users WHERE username = ?")
      .get(process.env.ADMIN_USERNAME || "admin");

    if (!existing) {
      const password = bcrypt.hashSync(
        process.env.ADMIN_PASSWORD || "UnitedHighEyes@2025",
        12
      );
      this.db.prepare(
        "INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)"
      ).run(uuidv4(), process.env.ADMIN_USERNAME || "admin", password, "admin");

      logger.info("Default admin user created");
    }
  }

  // ══════════════════════════════════════════
  // USER METHODS
  // ══════════════════════════════════════════

  getUserByUsername(username) {
    return this.db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  }

  updateLastLogin(userId) {
    this.db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  }

  // ══════════════════════════════════════════
  // CAMERA METHODS
  // ══════════════════════════════════════════

  registerCamera({ id, name, location, streamUrl }) {
    const existing = this.db.prepare("SELECT id FROM cameras WHERE id = ?").get(id);
    if (existing) {
      // Update existing camera
      this.db.prepare(
        "UPDATE cameras SET name = ?, location = ?, stream_url = ?, status = 'active', last_frame = datetime('now') WHERE id = ?"
      ).run(name, location || "", streamUrl || "", id);
    } else {
      // New camera insert
      this.db.prepare(
        "INSERT INTO cameras (id, name, location, stream_url) VALUES (?, ?, ?, ?)"
      ).run(id, name, location || "", streamUrl || "");
    }
  }

  getAllCameras() {
    return this.db.prepare("SELECT * FROM cameras ORDER BY created_at DESC").all();
  }

  updateCameraStatus(cameraId, status) {
    this.db.prepare("UPDATE cameras SET status = ? WHERE id = ?").run(status, cameraId);
  }

  updateCameraLastFrame(cameraId) {
    this.db.prepare("UPDATE cameras SET last_frame = datetime('now') WHERE id = ?").run(cameraId);
  }

  // ══════════════════════════════════════════
  // ALERT METHODS
  // ══════════════════════════════════════════

  saveAlert({ cameraId, cameraName, threatType, confidence, description, timestamp }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO alerts (id, camera_id, camera_name, threat_type, confidence, description, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, cameraId, cameraName, threatType, confidence, description, timestamp);
    return id;
  }

  getAlerts({ limit = 50, offset = 0, threatType = null, cameraId = null } = {}) {
    let query  = "SELECT * FROM alerts WHERE 1=1";
    const params = [];

    if (threatType) { query += " AND threat_type = ?"; params.push(threatType); }
    if (cameraId)   { query += " AND camera_id = ?";   params.push(cameraId); }

    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return this.db.prepare(query).all(...params);
  }

  acknowledgeAlert(alertId) {
    this.db.prepare("UPDATE alerts SET acknowledged = 1 WHERE id = ?").run(alertId);
  }

  getAlertStats() {
    const total = this.db.prepare("SELECT COUNT(*) as count FROM alerts").get();
    const today = this.db.prepare(
      "SELECT COUNT(*) as count FROM alerts WHERE date(timestamp) = date('now')"
    ).get();
    const byType = this.db.prepare(
      "SELECT threat_type, COUNT(*) as count FROM alerts GROUP BY threat_type ORDER BY count DESC"
    ).all();
    const byCamera = this.db.prepare(
      "SELECT camera_name, COUNT(*) as count FROM alerts GROUP BY camera_name ORDER BY count DESC LIMIT 5"
    ).all();

    return {
      totalAlerts:    total.count,
      alertsToday:    today.count,
      byThreatType:   byType,
      topCameras:     byCamera,
    };
  }

  // Last 7 days trend
  getAlertTrend() {
    return this.db.prepare(`
      SELECT date(timestamp) as date, COUNT(*) as count
      FROM alerts
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all();
  }
}

module.exports = new DatabaseService();
