// ══════════════════════════════════════════
// United HighEyes — Alert Routes
// ══════════════════════════════════════════
const express  = require("express");
const db       = require("../services/database");
const logger   = require("../services/logger");
const alertRouter = express.Router();

// GET /api/alerts — paginated alerts list
alertRouter.get("/", (req, res) => {
  try {
    const limit      = parseInt(req.query.limit) || 50;
    const offset     = parseInt(req.query.offset) || 0;
    const threatType = req.query.type || null;
    const cameraId   = req.query.camera || null;

    const alerts = db.getAlerts({ limit, offset, threatType, cameraId });
    res.json({ alerts, total: alerts.length });
  } catch (err) {
    logger.error(`Get alerts error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// PATCH /api/alerts/:id/acknowledge — alert acknowledge karo
alertRouter.patch("/:id/acknowledge", (req, res) => {
  try {
    db.acknowledgeAlert(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// ══════════════════════════════════════════
// United HighEyes — Analytics Routes
// ══════════════════════════════════════════
const analyticsRouter = express.Router();
const analysisSvc = require("../services/analysis");

// GET /api/analytics/stats — dashboard stats
analyticsRouter.get("/stats", (req, res) => {
  try {
    const stats     = db.getAlertStats();
    const aiStats   = analysisSvc.getStats();
    const cameras   = db.getAllCameras();
    const activeCam = cameras.filter((c) => c.status === "active").length;

    res.json({
      ...stats,
      activeCameras:    activeCam,
      totalCameras:     cameras.length,
      aiFramesAnalyzed: aiStats.framesAnalyzed,
      aiAvgResponseMs:  aiStats.avgResponseMs,
    });
  } catch (err) {
    logger.error(`Stats error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/analytics/trend — 7-day alert trend
analyticsRouter.get("/trend", (req, res) => {
  try {
    const trend = db.getAlertTrend();
    res.json({ trend });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trend" });
  }
});

module.exports = { alertRoutes: alertRouter, analyticsRoutes: analyticsRouter };
