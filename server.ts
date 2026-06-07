import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { Jimp } from "jimp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
