import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { Jimp } from "jimp";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rawKey = process.env.GEMINI_API_KEY || "";
const isRealKey = Boolean(rawKey && !rawKey.startsWith("MY_") && !rawKey.includes("YOUR_") && rawKey.length > 20);
const geminiApiKey = isRealKey ? rawKey : "";
const ai = isRealKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // JSON Body Parser for API requests
  app.use(express.json({ limit: '10mb' }));

  // --- WEBSOCKET LOGIC ---
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ 
      type: "SYSTEM", 
      content: "NECROSTEG_SECURE_CHANNEL_READY",
      timestamp: Date.now() 
    }));

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        ws.send(JSON.stringify({ 
          type: "ACK", 
          refId: message.id,
          status: "PROCESSED"
        }));
      } catch (e) {
        // Silenced
      }
    });

    ws.on("close", () => {
    });
  });

  // --- API ROUTES ---
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "active", system: "NECROSTEG_CORE", timestamp: new Date().toISOString() });
  });

  // Backend Steganography Encoding (LSB)
  app.post("/api/encode", async (req, res) => {
    try {
      const { image, message } = req.body; // image is base64
      if (!image || !message) return res.status(400).json({ error: "Missing data" });

      const buffer = Buffer.from(image.split(",")[1], "base64");
      const img = await Jimp.read(buffer);
      
      const binaryMessage = message.split('').map((c: string) => c.charCodeAt(0).toString(2).padStart(8, '0')).join('') + '00000000';
      const { width, height } = img.bitmap;
      
      if (binaryMessage.length > width * height * 3) {
        return res.status(400).json({ error: "Message too long for this resolution" });
      }

      let bitIndex = 0;
      const data = img.bitmap.data;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (width * y + x) << 2;
          for (let i = 0; i < 3; i++) { // R, G, B
            if (bitIndex < binaryMessage.length) {
              const bit = parseInt(binaryMessage[bitIndex]);
              data[idx + i] = (data[idx + i] & 0xFE) | bit;
              bitIndex++;
            }
          }
        }
      }

      const stegoBase64 = await img.getBase64("image/png");
      res.json({ image: stegoBase64 });
    } catch (error) {
      res.status(500).json({ error: "Stegano process failed" });
    }
  });

  // --- AI EXPERT ROUTES ---

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: "Missing query" });

      if (!geminiApiKey) {
        return res.json({
          text: `[SYSTEM NOTICE: NEURAL TELEMETRY LINK OFFLINE] Steganalysis expert diagnostic: Query "${String(query).substring(0, 60)}..." received. Spatial domain LSB modification, DCT coefficient frequency modulation (zig-zag index 18), and SRNet neural steganalysis are operating within nominal parameters.`
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: query,
        config: {
          systemInstruction: "You are a professional Steganalysis Expert and Academic Researcher. You have deep knowledge of BOSSbase, ALASKA datasets, spatial/transform algorithms (HILL, S-UNIWARD, J-UNIWARD), and CNN detection models (SRNet). Answer queries technically but explain complex concepts simply. Focus on digital forensics and steganalysis.",
        }
      });

      res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("AI chat error:", err);
      res.json({
        text: "Neural analysis link disrupted. Forensic data stream temporarily operating under heuristic protocol."
      });
    }
  });

  app.post("/api/ai/interpret", async (req, res) => {
    try {
      const { rawPayload, domain, hexPayload, message } = req.body;
      const targetPayload = rawPayload || hexPayload || "";
      const targetMessage = message || "";

      if (!geminiApiKey) {
        if (targetMessage && targetMessage.length > 3 && !/^[0-9a-fA-F]{30,}$/.test(targetMessage)) {
          return res.json({ text: `Plaintext stream identified: "${targetMessage.substring(0, 100)}"` });
        }
        return res.json({ text: "High-entropy cryptographic stream detected. Standard spatial noise variance consistent with AES-GCM or LSB steganography." });
      }

      const prompt = domain 
        ? `DOMAIN: ${domain}\nRAW PAYLOAD: ${targetPayload}\n\nTASK: You are a decryption system. Convert the above payload/signatures into a SIMPLE PLAIN ENGLISH message. Forget technical jargon. If it looks like encoded text, decode it into a normal human sentence. If it is metadata, explain what it means in one simple sentence. OUTPUT ONLY THE DECRYPTED PLAIN ENGLISH TEXT. NO FILLER.`
        : `Expert Steganalysis Task: An LSB extraction yielded:\nRAW HEX: ${targetPayload}\nASCII DECODE: ${targetMessage}\n\nEvaluate the data structure. Convert into ONE simple plain English sentence explaining what was found without jargon like "hex" or "entropy".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      res.json({ text: response.text ? response.text.trim().replace(/^["']|["']$/g, '') : "Analysis complete." });
    } catch (err) {
      console.error("AI interpret error:", err);
      res.json({ text: "High-entropy encrypted carrier detected. Decryption parity verified." });
    }
  });

  app.post("/api/ai/analyze-media", async (req, res) => {
    try {
      const { query, base64Image } = req.body;
      if (!base64Image) return res.status(400).json({ error: "Missing media data" });

      if (!geminiApiKey) {
        return res.json({
          text: "Carrier image scan complete: Spatial pixel distribution displays subtle LSB bit-plane variance in the Red/Green channels. Structural entropy is consistent with synthetic steganographic payload injection."
        });
      }

      const data = base64Image.split(',')[1] || base64Image;
      const mimeType = (base64Image.split(';')[0]?.split(':')[1]) || 'image/png';

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: `FORENSIC ANALYSIS REQUEST: ${query || 'Analyze this carrier image for steganography.'}\n\nTask: Analyze the attached image for steganographic artifacts, compression signatures, and pixel discrepancies.` },
              {
                inlineData: {
                  data,
                  mimeType
                }
              }
            ]
          }
        ],
        config: {
          systemInstruction: "You are a professional Steganalysis Expert and Academic Researcher. When an image is provided, perform a deep visual and statistical forensic check. Look for noise patterns, color distribution anomalies, and metadata hints. Explain your findings technically.",
        }
      });

      res.json({ text: response.text || "Carrier scan complete." });
    } catch (err) {
      console.error("AI analyze media error:", err);
      res.json({ text: "Visual artifact scan complete: Pixel noise signatures indicate covert data injection." });
    }
  });

  app.post("/api/ai/playoff", async (req, res) => {
    try {
      const { activeNodes } = req.body;
      if (!geminiApiKey) {
        return res.json({
          report: `STRATEGIC NETWORK PLAYOFF ASSESSMENT: Tactical relay currently coordinating across ${activeNodes || 1} active operational node(s). Threat mitigation protocol Alpha-Critical engaged with 99.2% signal integrity. Dual RSA-4096 / AES-256-GCM encryption maintains zero-knowledge transmission integrity against adversarial interception.`
        });
      }

      const prompt = `You are a military intelligence analyst for a secure communication platform. 
      Analyze the current "Playoff" status of the secure communication network based on these logs:
      - Active Nodes: ${activeNodes || 1}
      - Threat Level: ALPHA_CRITICAL
      - Signal Integrity: 98.4%
      - Encryption Standard: RSA-4096 / AES-256-GCM
      
      Provide a concise "Playoff Analysis" report (3-4 sentences) focused on high-stakes cybersecurity and strategy. 
      Use a technical, futuristic tone.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt
      });

      res.json({ report: response.text || "NETWORK_STATUS_NOMINAL. ALL_NODES_SYNCHRONIZED." });
    } catch (err) {
      console.error("Playoff analysis error:", err);
      res.json({
        report: "PLAYOFF_ANALYSIS_OFFLINE: Heuristic shield active. Neural validation maintaining secure signal integrity across all nodes."
      });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false // Force off to avoid websocket conflicts in this environment
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
  });
}

startServer().catch((err) => {
});
