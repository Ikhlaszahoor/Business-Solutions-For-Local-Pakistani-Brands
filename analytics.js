const express        = require("express");
const db             = require("../services/database");
const logger         = require("../services/logger");
const analysisSvc    = require("../services/analysis");
const router         = express.Router();

// ══════════════════════════════════════════
// GET /api/analytics/stats
// Dashboard ke liye overall system stats
// ══════════════════════════════════════════
router.get("/stats", (req, res) => {
  try {
    const stats    = db.getAlertStats();
    const aiStats  = analysisSvc.getStats();
    const cameras  = db.getAllCameras();
    const active   = cameras.filter((c) => c.status === "active").length;

    res.json({
      ...stats,
      activeCameras:    active,
      totalCameras:     cameras.length,
      aiFramesAnalyzed: aiStats.framesAnalyzed,
      aiAvgResponseMs:  aiStats.avgResponseMs,
    });
  } catch (err) {
    logger.error(`Analytics stats error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ══════════════════════════════════════════
// GET /api/analytics/trend
// Last 7 days alert trend (chart ke liye)
// ══════════════════════════════════════════
router.get("/trend", (req, res) => {
  try {
    const trend = db.getAlertTrend();
    res.json({ trend });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trend data" });
  }
});

module.exports = router;
