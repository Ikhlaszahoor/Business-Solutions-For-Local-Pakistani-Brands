const winston = require("winston");
const path    = require("path");

// ══════════════════════════════════════════
// United HighEyes — Logger Service
// Winston: console + file logging
// ══════════════════════════════════════════

const logsDir = path.join(__dirname, "../../logs");

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console output — colored for dev
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      ),
    }),
    // File: all logs
    new winston.transports.File({
      filename: path.join(logsDir, "system.log"),
      maxsize:  10 * 1024 * 1024, // 10MB rotate
      maxFiles: 5,
    }),
    // File: errors only
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level:    "error",
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

module.exports = logger;
