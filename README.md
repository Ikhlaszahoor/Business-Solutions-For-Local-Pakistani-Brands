# 👁️ United HighEyes — Real-Time Edge AI Surveillance

> **Enterprise-grade AI surveillance system powered by Claude Vision API**
> Detects threats, weapons, suspicious behavior in real-time with Telegram alerts.

![United HighEyes](https://img.shields.io/badge/United%20HighEyes-v2.0%20Pro-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge)
![Claude AI](https://img.shields.io/badge/Claude-Vision%20API-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| 🧠 **AI Intent Detection** | Claude Vision analyzes CCTV frames — detects weapons, masks, intrusions, crowd panic |
| ⚡ **Real-time Alerts** | Socket.IO powered live threat alerts on dashboard |
| 📱 **Telegram Alerts** | Instant notifications with snapshot image to your phone |
| 📷 **Multi-Camera** | Support for multiple CCTV cameras simultaneously |
| 📊 **Analytics Dashboard** | 7-day trends, threat breakdown, top cameras |
| 🔐 **JWT Authentication** | Secure admin login with rate-limited brute-force protection |
| 🗄️ **SQLite Database** | Zero-config persistent storage (WAL mode) |
| 📤 **CSV Export** | Export all alert logs |
| 🌙 **Dark Cyber Theme** | Professional dark UI built for security operations |

---

## 📋 Detected Threat Types

- 🔫 **Weapon Detected** — Guns, knives, dangerous objects
- 🎭 **Suspicious Mask** — Face coverings in inappropriate contexts
- 🚨 **Intrusion** — Unauthorized area access
- 👥 **Crowd Panic** — Stampede / mass panic indicators
- 👁️ **Loitering** — Suspicious lingering behavior
- 🔥 **Fire / Smoke** — Fire hazard detection
- 🔨 **Vandalism** — Property damage in progress
- 📦 **Abandoned Object** — Unattended bags/packages

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js 18+
- Anthropic API Key → [console.anthropic.com](https://console.anthropic.com)
- Telegram Bot Token → [@BotFather](https://t.me/botfather) on Telegram

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/united-higheyes.git
cd united-higheyes
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env`:
```env
ANTHROPIC_API_KEY=your_key_here
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
JWT_SECRET=your_very_long_random_secret
ADMIN_PASSWORD=YourSecurePassword
```

### 4. Get your Telegram Chat ID
1. Message your bot on Telegram
2. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Copy the `chat.id` value

### 5. Start the system
```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

### 6. Access dashboard
```
http://localhost:8080
```
Default credentials: `admin` / `UnitedHighEyes@2025`

---

## 📁 Project Structure

```
united-higheyes/
├── server.js                   # Main Express + Socket.IO server
├── backend/
│   ├── routes/
│   │   ├── auth.js             # Login / JWT verify
│   │   ├── cameras.js          # Camera CRUD
│   │   ├── alerts.js           # Alert log + acknowledge
│   │   └── analytics.js        # Stats + trend data
│   ├── services/
│   │   ├── analysis.js         # Claude Vision AI engine
│   │   ├── telegram.js         # Telegram bot alerts
│   │   ├── database.js         # SQLite service
│   │   └── logger.js           # Winston logger
│   └── middleware/
│       └── auth.js             # JWT middleware
├── frontend/
│   ├── index.html              # Dashboard SPA
│   ├── css/dashboard.css       # Dark cyber theme
│   └── js/dashboard.js        # Full frontend logic
├── config/                     # DB stored here (auto-created)
├── logs/                       # System + error logs
├── .env.example
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | Public | Admin login |
| GET | `/api/auth/verify` | Public | Token verify |
| GET | `/api/cameras` | JWT | List cameras |
| PATCH | `/api/cameras/:id/status` | JWT | Update status |
| GET | `/api/alerts` | JWT | Alert log |
| PATCH | `/api/alerts/:id/acknowledge` | JWT | Ack alert |
| GET | `/api/analytics/stats` | JWT | Dashboard stats |
| GET | `/api/analytics/trend` | JWT | 7-day trend |
| GET | `/api/health` | Public | System health |

---

## 🔌 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `analyze_frame` | Client → Server | Send frame for AI analysis |
| `analysis_result` | Server → Client | AI analysis result |
| `threat_alert` | Server → Client | Threat detected broadcast |
| `analysis_error` | Server → Client | Analysis failure |
| `register_camera` | Client → Server | Register new camera |

---

## 🛡️ Security Features
- JWT authentication (24h expiry)
- Rate limiting on all API routes
- Brute-force protection on login (20 attempts / 15 min)
- Helmet.js security headers
- SQL injection safe (prepared statements)
- XSS protection (input escaping)

---

## 📸 Screenshot
> Dark cyber dashboard with live camera feeds, real-time threat detection, and Telegram alerts.

---

**Built by United HighEyes** | Powered by Anthropic Claude API
