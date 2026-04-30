const jwt = require("jsonwebtoken");

// ══════════════════════════════════════════
// United HighEyes — JWT Auth Middleware
// Protected routes ke liye token verify karo
// ══════════════════════════════════════════

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_change_me");
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please login again." });
    }
    return res.status(403).json({ error: "Invalid token." });
  }
}

module.exports = { verifyToken };
