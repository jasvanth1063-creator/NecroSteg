import { GoogleGenAI } from "@google/genai";

const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ 
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Utility for exponential backoff retries.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Heuristic check for payload legitimacy.
 */
function isPayloadLegitimate(asciiPayload: string): boolean {
  if (!asciiPayload) return false;
  // If it's short but looks like words, it's legitimate
  if (asciiPayload.length >= 4 && /^[a-zA-Z0-9_\- ]+$/.test(asciiPayload.substring(0, 10))) return true;
  // Otherwise default to length check
  if (asciiPayload.length < 10) return false;
  return true;
}

/**
 * Interprets raw forensic payloads from different steganographic domains.
 * Provides a "Plain English" explanation for investigators.
 */
export async function interpretPayload(rawPayload: string, domain: string) {
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `DOMAIN: ${domain}
        RAW PAYLOAD: ${rawPayload}
        
        TASK: You are a decryption system. Convert the above payload/signatures into a SIMPLE PLAIN ENGLISH message. 
        Forget technical jargon. If it looks like encoded text, decode it into a normal human sentence. 
        If it is metadata, explain what it means in one simple sentence.
        
        OUTPUT ONLY THE DECRYPTED PLAIN ENGLISH TEXT. NO FILLER. NO "THE MESSAGE IS:".`,
      });
      
      return response.text.trim().replace(/^["']|["']$/g, '');
    });
  } catch (error) {
    return "AI analysis temporarily unavailable. Technical connection disrupted.";
  }
}

/**
 * Specific interpreter for LSB/Forensics tab detections.
 */
export async function interpretStegoPayload(hexPayload: string, message: string) {
  if (!isPayloadLegitimate(message)) {
    return "Initial scan suggests a short or high-entropy payload. Message may be encrypted or represent random noise. Further manual inspection recommended.";
  }

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Expert Steganalysis Task:
        An LSB (Least Significant Bit) extraction has yielded the following data.
        
        RAW HEX: ${hexPayload}
        ASCII DECODE: ${message}
        
        Evaluate the structure of this data. 
        - Convert the results into a SIMPLE PLAIN ENGLISH sentence. 
        - If the ASCII decode starts with legible words, just output those words clearly.
        - If it looks like high-entropy garbage (encryption), say "Highly encrypted secure packet detected."
        - Avoid all technical jargon like "hex", "entropy", or "LSB" in the final output.
        
        Provide ONE simple, clear sentence explaining exactly what was found.`,
      });
      
      return response.text.trim();
    });
  } catch (error) {
    return "AI analysis temporarily unavailable. The neural link could not be established after multiple attempts.";
  }
}

/**
 * General expert chat for steganography research and forensics.
 */
export async function askExpert(query: string) {
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: query,
        config: {
          systemInstruction: "You are a professional Steganalysis Expert and Academic Researcher. You have deep knowledge of BOSSbase, ALASKA datasets, spatial/transform algorithms (HILL, S-UNIWARD, J-UNIWARD), and CNN detection models (SRNet). Answer queries technically but explain complex concepts simply. Focus on digital forensics and steganalysis.",
        }
      });
      return response.text;
    });
  } catch (error) {
    return "AI analysis temporarily unavailable, please try again later.";
  }
}

/**
 * Multimodal analysis for forensic media.
 */
export async function analyzeMedia(query: string, base64Image: string) {
  try {
    // Extract base64 content
    const data = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1];

    if (!data) return "Missing media data.";

    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: `FORENSIC ANALYSIS REQUEST: ${query}\n\nTask: Analyze the attached image for steganographic artifacts, compression signatures, and pixel discrepancies. Focus on digital forensics.` },
              {
                inlineData: {
                  data: data,
                  mimeType: mimeType
                }
              }
            ]
          }
        ],
        config: {
          systemInstruction: "You are a professional Steganalysis Expert and Academic Researcher. When an image is provided, perform a deep visual and statistical forensic check. Look for noise patterns, color distribution anomalies, and metadata hints. Explain your findings technically.",
        }
      });
      
      return response.text;
    });
  } catch (error) {
    return "AI analysis temporarily unavailable. Gemini API connection failed.";
  }
}
