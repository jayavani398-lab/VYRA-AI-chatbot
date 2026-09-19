import express from "express";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// Raised so camera captures + multiple file/image attachments fit in one request.
app.use(express.json({ limit: "30mb" }));
app.use(express.static("public"));

const KEY = process.env.GEMINI_API_KEY;

// "gemini-flash-lite-latest" = Google's stable alias for their current best
// Flash-Lite model. Slightly lower quality than full Flash, but the free-tier
// daily request quota (RPD) is much higher, so you hit 429 "upgrade" errors
// far less often.
const MODEL = "gemini-flash-lite-latest";

const SYSTEM = `You are VYRA AI, a friendly and smart assistant created by a student developer.
- Reply in the same language/style the user uses (English, Tamil, or Tanglish).
- Be clear, helpful and warm. Use short paragraphs.
- If an image or file is shared, look at it carefully and answer based on what you actually see/read in it.
- If you don't know something, say so honestly.`;

/**
 * Frontend sends messages like:
 * {
 *   role: "user" | "assistant",
 *   content: "text here",
 *   files: [
 *     { data: "<base64 without prefix>", mimeType: "image/png", name: "photo.png" }
 *   ]  // optional, 0 or more — camera captures, gallery uploads, or any file
 * }
 */
app.post("/api/chat", async (req, res) => {
  try {
    if (!KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY missing in .env" });
    }

    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    // frontend format -> gemini format (supports text + one or more inline files)
    const contents = messages.map((m) => {
      const parts = [];

      if (m.content) {
        parts.push({ text: m.content });
      }

      if (Array.isArray(m.files)) {
        for (const f of m.files) {
          if (f && f.data && f.mimeType) {
            parts.push({
              inline_data: {
                mime_type: f.mimeType,
                data: f.data, // base64 string, no "data:...;base64," prefix
              },
            });
          }
        }
      }

      // keep old single-"image" shape working too, in case anything still sends it
      if (m.image && m.image.data && m.image.mimeType) {
        parts.push({
          inline_data: {
            mime_type: m.image.mimeType,
            data: m.image.data,
          },
        });
      }

      if (parts.length === 0) parts.push({ text: "" });

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
        }),
      }
    );

    const data = await r.json();
    if (data.error) {
      // Don't leak Google's raw quota/billing message ("upgrade your plan" etc.)
      // to the chat UI — show a friendly Tanglish message instead.
      const status = data.error.status || "";
      const msg = (data.error.message || "").toLowerCase();
      const isQuota =
        r.status === 429 ||
        status === "RESOURCE_EXHAUSTED" ||
        msg.includes("quota") ||
        msg.includes("rate limit") ||
        msg.includes("upgrade");

      if (isQuota) {
        return res.status(429).json({
          error: "Server konjo busy-a irukku, konjo neram kalichi try pannunga 🙏",
        });
      }
      console.error("Gemini API error:", data.error);
      return res.status(500).json({ error: "Reply generate panna mudiyala, try again." });
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, reply generate panna mudiyala.";
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`✅ VYRA running: http://localhost:${process.env.PORT || 3000}`)
);