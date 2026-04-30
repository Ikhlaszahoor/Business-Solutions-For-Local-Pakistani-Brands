const axios    = require("axios");
const FormData = require("form-data");
const logger   = require("./logger");

// ══════════════════════════════════════════
// United HighEyes — Telegram Alert Service
// Threat detection pe instant notification
// Snapshot image ke sath detailed message
// ══════════════════════════════════════════

// Threat level ke hisaab se emoji assign karo
const THREAT_EMOJI = {
  weapon_detected:  "🔴🔫",
  mask_suspicious:  "🟠🎭",
  intrusion:        "🔴🚨",
  crowd_panic:      "🔴👥",
  loitering:        "🟡👁️",
  vandalism:        "🟠🔨",
  fire_smoke:       "🔴🔥",
  abandoned_object: "🟡📦",
  normal:           "🟢✅",
};

// Confidence level ka label
function confidenceLabel(conf) {
  if (conf >= 0.9) return "CRITICAL";
  if (conf >= 0.75) return "HIGH";
  if (conf >= 0.5) return "MEDIUM";
  return "LOW";
}

class TelegramService {
  constructor() {
    this.token  = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.ready  = !!(this.token && this.chatId);

    if (!this.ready) {
      logger.warn("Telegram not configured — alerts will be logged only");
    }
  }

  // ── Base API call helper
  async call(method, data) {
    if (!this.ready) return null;
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    try {
      const res = await axios.post(url, data, { timeout: 15000 });
      return res.data;
    } catch (err) {
      logger.error(`Telegram API error [${method}]: ${err.message}`);
      return null;
    }
  }

  // ── Threat alert — snapshot image + formatted message
  async sendThreatAlert({ alertId, cameraName, threatType, confidence, description, frameBase64 }) {
    if (!this.ready) {
      logger.warn(`[TELEGRAM-OFF] Alert would send: ${threatType} on ${cameraName}`);
      return;
    }

    const emoji    = THREAT_EMOJI[threatType] || "⚠️";
    const level    = confidenceLabel(confidence);
    const confPct  = Math.round(confidence * 100);
    const time     = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });

    // Telegram message text — MarkdownV2 format
    const caption =
      `${emoji} *UNITED HIGHEYES ALERT*\n\n` +
      `🆔 Alert ID: \`${alertId}\`\n` +
      `📷 Camera: *${this.escape(cameraName)}*\n` +
      `⚠️ Threat: *${this.escape(threatType.replace(/_/g, " ").toUpperCase())}*\n` +
      `📊 Confidence: *${confPct}% \\(${level}\\)*\n` +
      `🕐 Time: ${this.escape(time)}\n\n` +
      `📝 *Details:* ${this.escape(description)}\n\n` +
      `_United HighEyes Surveillance System_`;

    // Snapshot image ke sath message bhejo
    if (frameBase64 && frameBase64.length > 100) {
      await this.sendPhoto(caption, frameBase64);
    } else {
      // Fallback — sirf text message
      await this.call("sendMessage", {
        chat_id:    this.chatId,
        text:       caption,
        parse_mode: "MarkdownV2",
      });
    }

    logger.info(`Telegram alert sent: ${threatType} on ${cameraName}`);
  }

  // ── Photo + caption send karo
  async sendPhoto(caption, frameBase64) {
    const cleanBase64 = frameBase64.includes(",")
      ? frameBase64.split(",")[1]
      : frameBase64;

    const buffer = Buffer.from(cleanBase64, "base64");

    const form = new FormData();
    form.append("chat_id", this.chatId);
    form.append("caption", caption);
    form.append("parse_mode", "MarkdownV2");
    form.append("photo", buffer, { filename: "alert.jpg", contentType: "image/jpeg" });

    const url = `https://api.telegram.org/bot${this.token}/sendPhoto`;

    try {
      await axios.post(url, form, {
        headers: form.getHeaders(),
        timeout: 20000,
      });
    } catch (err) {
      // Photo fail hoi toh text fallback
      logger.error(`Telegram photo send failed: ${err.message} — falling back to text`);
      await this.call("sendMessage", {
        chat_id:    this.chatId,
        text:       caption,
        parse_mode: "MarkdownV2",
      });
    }
  }

  // ── System status notification
  async sendSystemNotification(message) {
    if (!this.ready) return;
    await this.call("sendMessage", {
      chat_id:    this.chatId,
      text:       `🖥️ *United HighEyes System*\n\n${this.escape(message)}`,
      parse_mode: "MarkdownV2",
    });
  }

  // ── Daily summary report
  async sendDailySummary({ totalAlerts, threatBreakdown, topCamera }) {
    if (!this.ready) return;

    const lines = Object.entries(threatBreakdown)
      .map(([type, count]) => `  • ${type.replace(/_/g, " ")}: ${count}`)
      .join("\n");

    const msg =
      `📊 *Daily Surveillance Summary*\n\n` +
      `📅 Date: ${new Date().toLocaleDateString("en-PK")}\n` +
      `🚨 Total Alerts: *${totalAlerts}*\n` +
      `📷 Most Active Camera: *${this.escape(topCamera || "N/A")}*\n\n` +
      `*Threat Breakdown:*\n${lines || "  • No threats detected"}\n\n` +
      `_United HighEyes Surveillance System_`;

    await this.call("sendMessage", {
      chat_id:    this.chatId,
      text:       msg,
      parse_mode: "MarkdownV2",
    });
  }

  // MarkdownV2 special characters escape karo
  escape(text) {
    return String(text || "").replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
  }
}

module.exports = new TelegramService();
