const axios  = require("axios");
const logger = require("./logger");

// ══════════════════════════════════════════
// United HighEyes — AI Analysis Service
// Claude Vision se CCTV frames analyze karo
// Intent detection: weapons, masks, suspicious behavior
// ══════════════════════════════════════════

// Threat categories jo detect karni hain
const THREAT_CATEGORIES = [
  "weapon_detected",
  "mask_suspicious",
  "intrusion",
  "crowd_panic",
  "loitering",
  "vandalism",
  "fire_smoke",
  "abandoned_object",
  "normal",
];

// System prompt jo Claude ko surveillance analyst ki role deta hai
const SURVEILLANCE_SYSTEM_PROMPT = `You are an advanced AI security analyst for United HighEyes Surveillance System.
Analyze CCTV footage frames and detect security threats with high accuracy.

Your job is to identify:
1. WEAPONS — guns, knives, batons, any deadly objects
2. SUSPICIOUS MASKS — face coverings in unusual contexts (bank, store interior, etc.)
3. INTRUSION — people in restricted/unauthorized areas
4. CROWD PANIC — running crowds, stampede indicators  
5. LOITERING — suspicious lingering behavior in sensitive areas
6. VANDALISM — property damage, graffiti in progress
7. FIRE/SMOKE — any signs of fire or smoke
8. ABANDONED OBJECTS — unattended bags/packages in public spaces
9. NORMAL — routine activity with no threat

CRITICAL RULES:
- Be precise, not alarmist. Only flag genuine threats.
- Night vision / low light footage: lower confidence if image is unclear.
- A person wearing a medical mask in a hospital/clinic = NOT suspicious.
- A person wearing a balaclava in a bank = VERY suspicious.

Respond ONLY with this exact JSON format, nothing else:
{
  "threatDetected": true/false,
  "threatType": "one of the categories above",
  "confidence": 0.0 to 1.0,
  "description": "1-2 sentence clear description of what was detected",
  "persons": number of people visible,
  "lighting": "day/night/low",
  "recommendation": "brief action recommendation"
}`;

class AnalysisService {
  constructor() {
    this.apiKey      = process.env.ANTHROPIC_API_KEY;
    this.model       = "claude-opus-4-5";
    this.apiUrl      = "https://api.anthropic.com/v1/messages";
    this.frameCount  = 0;
    this.totalTime   = 0;
  }

  // ── Main frame analysis function
  async analyzeFrame({ cameraId, cameraName, frameBase64 }) {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Base64 string se prefix strip karo (data:image/jpeg;base64,...)
    const cleanBase64 = frameBase64.includes(",")
      ? frameBase64.split(",")[1]
      : frameBase64;

    // Image type detect karo
    const mediaType = frameBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model:      this.model,
          max_tokens: 512,
          system:     SURVEILLANCE_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type:   "image",
                  source: {
                    type:       "base64",
                    media_type: mediaType,
                    data:       cleanBase64,
                  },
                },
                {
                  type: "text",
                  text: `Analyze this CCTV frame from camera: "${cameraName}". Provide security threat assessment in the required JSON format.`,
                },
              ],
            },
          ],
        },
        {
          headers: {
            "Content-Type":      "application/json",
            "x-api-key":         this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          timeout: 30000, // 30s timeout
        }
      );

      const rawText = response.data.content[0].text.trim();

      // JSON parse — curly braces ke beech se extract karo
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI returned non-JSON response");

      const analysis = JSON.parse(jsonMatch[0]);

      // Validate required fields
      this.validateAnalysis(analysis);

      // Performance metrics update
      const elapsed = Date.now() - startTime;
      this.frameCount++;
      this.totalTime += elapsed;

      logger.info(
        `Frame analyzed [cam:${cameraId}] threat:${analysis.threatDetected} ` +
        `type:${analysis.threatType} conf:${analysis.confidence} time:${elapsed}ms`
      );

      return {
        ...analysis,
        analysisTimeMs: elapsed,
        cameraId,
        timestamp: new Date().toISOString(),
      };

    } catch (err) {
      if (err.response?.status === 429) {
        throw new Error("AI rate limit reached. Please wait before analyzing more frames.");
      }
      if (err.response?.status === 401) {
        throw new Error("Invalid Anthropic API key. Check your .env file.");
      }
      throw new Error(`Analysis failed: ${err.message}`);
    }
  }

  // ── Response validation — required fields check
  validateAnalysis(obj) {
    const required = ["threatDetected", "threatType", "confidence", "description"];
    for (const field of required) {
      if (obj[field] === undefined) {
        throw new Error(`AI response missing field: ${field}`);
      }
    }
    if (typeof obj.confidence !== "number" || obj.confidence < 0 || obj.confidence > 1) {
      throw new Error("Invalid confidence value from AI");
    }
    if (!THREAT_CATEGORIES.includes(obj.threatType)) {
      obj.threatType = "normal"; // fallback for unknown category
    }
  }

  // ── Average analysis time stats
  getStats() {
    return {
      framesAnalyzed: this.frameCount,
      avgResponseMs:  this.frameCount > 0 ? Math.round(this.totalTime / this.frameCount) : 0,
    };
  }
}

module.exports = new AnalysisService();
