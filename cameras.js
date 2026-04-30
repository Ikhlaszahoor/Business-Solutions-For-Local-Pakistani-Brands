// ══════════════════════════════════════════
// United HighEyes — Camera Routes
// ══════════════════════════════════════════
const express = require("express");
const db      = require("../services/database");
const logger  = require("../services/logger");
const router  = express.Router();

// GET /api/cameras — sab cameras list
router.get("/", (req, res) => {
  try {
    const cameras = db.getAllCameras();
    res.json({ cameras, total: cameras.length });
  } catch (err) {
    logger.error(`Get cameras error: ${err.message}`);
    res.status(500).json({ error: "Failed to fetch cameras" });
  }
});

// PATCH /api/cameras/:id/status — camera status update
router.patch("/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["active", "inactive", "maintenance"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }
  db.updateCameraStatus(req.params.id, status);
  res.json({ success: true });
});

module.exports = router;
