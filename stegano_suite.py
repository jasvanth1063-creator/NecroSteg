
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from PIL import Image
import numpy as np
import io
import uvicorn

app = FastAPI(title="SteganoLabs Python Suite")

# --- UI TEMPLATE (Frontend) ---
HTML_UI = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SteganoLabs | Python FullStack</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        body { font-family: 'JetBrains Mono', monospace; background: #0a0a0a; color: #d4d4d8; }
    </style>
</head>
<body class="p-8">
    <div class="max-w-4xl mx-auto space-y-8">
        <header class="border-b border-zinc-800 pb-6">
            <h1 class="text-green-500 text-2xl font-bold tracking-tighter">STEGANO_LABS_vPYTHON</h1>
            <p class="text-zinc-500 text-xs uppercase tracking-widest">Unified Python Forensics Framework</p>
        </header>

        <div class="grid md:grid-cols-2 gap-8">
            <!-- Encoding Section -->
            <div class="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <h2 class="text-white font-bold flex items-center gap-2 uppercase text-sm">
                    <span class="w-2 h-2 bg-green-500 rounded-full"></span> Hide Data
                </h2>
                <form id="encodeForm" class="space-y-4">
                    <input type="file" name="file" class="w-full text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700">
                    <textarea name="message" placeholder="Secret message..." class="w-full bg-black border border-zinc-800 p-3 text-xs rounded outline-none focus:border-green-500 h-24"></textarea>
                    <button type="submit" class="w-full bg-green-500 text-black py-3 rounded font-bold text-xs uppercase hover:bg-green-400">Execute_Encode</button>
                </form>
                <div id="encodeResult" class="hidden">
                    <p class="text-[10px] text-green-500">ENCODING_COMPLETE</p>
                    <a id="downloadBtn" href="#" class="text-xs underline text-zinc-400 hover:text-white">Download Stego Object</a>
                </div>
            </div>

            <!-- Decoding Section -->
            <div class="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
                <h2 class="text-white font-bold flex items-center gap-2 uppercase text-sm">
                    <span class="w-2 h-2 bg-amber-500 rounded-full"></span> Extract Data
                </h2>
                <form id="decodeForm" class="space-y-4">
                    <input type="file" name="file" class="w-full text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700">
                    <button type="submit" class="w-full border border-zinc-700 text-zinc-300 py-3 rounded font-bold text-xs uppercase hover:bg-zinc-800">Execute_Extract</button>
                </form>
                <div id="decodeResult" class="hidden p-3 bg-black border border-zinc-800 rounded text-xs break-all">
                    <p class="text-zinc-500 mb-1 tracking-tighter uppercase">Decoded_Output:</p>
                    <span id="extractedMsg" class="text-green-400"></span>
                </div>
            </div>
        </div>
    </div>

    <script>
        document.getElementById('encodeForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const res = await fetch('/api/encode', { method: 'POST', body: formData });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const dl = document.getElementById('downloadBtn');
            dl.href = url;
            dl.download = "stego_object.png";
            document.getElementById('encodeResult').classList.remove('hidden');
        };

        document.getElementById('decodeForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const res = await fetch('/api/decode', { method: 'POST', body: formData });
            const data = await res.json();
            document.getElementById('extractedMsg').innerText = data.message;
            document.getElementById('decodeResult').classList.remove('hidden');
        };
    </script>
</body>
</html>
"""

# --- CORE LOGIC (Backend) ---

def process_encode(img_bytes, message):
    img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    data = np.array(img)
    flat = data.flatten()
    
    binary_message = ''.join(format(ord(c), '08b') for c in message) + '00000000'
    
    if len(binary_message) > flat.size:
        raise ValueError("Message too long")
        
    for i, bit in enumerate(binary_message):
        flat[i] = (flat[i] & ~1) | int(bit)
        
    encoded_img = Image.fromarray(flat.reshape(data.shape))
    output = io.BytesIO()
    encoded_img.save(output, format="PNG")
    output.seek(0)
    return output

def process_decode(img_bytes):
    img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    data = np.array(img).flatten()
    
    binary_msg = ""
    for b in data:
        binary_msg += str(b & 1)
        if len(binary_msg) >= 8 and len(binary_msg) % 8 == 0:
            if int(binary_msg[-8:], 2) == 0: break
                
    message = ""
    for i in range(0, len(binary_msg), 8):
        byte = binary_msg[i:i+8]
        char = chr(int(byte, 2))
        if ord(char) == 0: break
        message += char
    return message

# --- API ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return HTML_UI

@app.post("/api/encode")
async def encode_api(file: UploadFile = File(...), message: str = Form(...)):
    try:
        content = await file.read()
        output = process_encode(content, message)
        return StreamingResponse(output, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/decode")
async def decode_api(file: UploadFile = File(...)):
    content = await file.read()
    msg = process_decode(content)
    return {"message": msg}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
