# NecroSteg

This repository contains the complete source of NecroSteg, a zero-knowledge secure communication and image steganography platform built by B. Jasvanth, Lendi Institute of Engineering and Technology, Vizianagaram.

It includes the React and TypeScript web application, the Firestore security rules and schema blueprint, the Express development server, and the Python research suite used for steganalysis experiments.

Live demo: https://necro-steg.vercel.app

## Project Details

### Project Title
NecroSteg: Cryptographic Steganography and Digital Forensics Platform

### Project Category
Full-Stack Web Application
Applied Cryptography
Digital Image Forensics

### Problem Statement
Conventional messaging platforms rely on the server being trusted with message contents or metadata. NecroSteg removes the server from the trust model. Every message is encrypted on the sender's device, hidden inside an ordinary cover image, and decrypted only on the recipient's device, so the database provider only ever stores opaque encrypted blobs.

The platform pairs this communication channel with a forensic laboratory that lets users inspect images for hidden payloads using bit-plane analysis, noise filtering, and frequency-domain mapping, with a Gemini-powered assistant for interpreting extracted data.

## Core Modules

| Module | Description | Status |
|---|---|---|
| Cryptographic Core | RSA-OAEP key exchange with AES-GCM-256 payload encryption and SHA-256 integrity hashing, built on the browser Web Crypto API | Completed |
| Steganography Engine | LSB embedding in the spatial domain and DCT coefficient embedding in the frequency domain | Completed |
| Secure Communication Channel | Real-time encrypted messaging over Firestore with identity verification, nonce-based replay prevention, and chunked transport | Completed |
| Forensic Lab | Bit-plane slicer, high-pass noise filter, and DCT frequency mapping | Completed |
| AI Forensic Assistant | Multimodal image analysis and payload interpretation through Gemini | Completed |
| Python Research Suite | FastAPI encode/decode service and Streamlit steganalysis dashboard | Completed |

## Cryptographic Protocol

1. Each user generates a 2048-bit RSA-OAEP key pair on their own device and publishes the public key to Firestore.
2. Each message is encrypted with a fresh 256-bit AES-GCM key.
3. The AES key is wrapped with the recipient's public key. A second wrapped copy for the sender allows self-decryption from a single transmission.
4. A SHA-256 hash of the payload is attached to detect tampering.
5. A unique nonce is attached to every transmission to prevent replay attacks.
6. The encrypted payload is embedded into a cover image and delivered through Firestore.

Private keys never leave the device and are never stored in plain text.

## Steganography Methods

| Method | Domain | Technique | Characteristic |
|---|---|---|---|
| LSB | Spatial | Replaces the least significant bits of RGB pixel values with payload bits | High capacity, sensitive to lossy compression |
| DCT | Frequency | Divides the image into 8x8 blocks, applies the Discrete Cosine Transform, and modifies mid-frequency AC coefficients | More robust to resizing and compression |

A binary header stores the payload length so the decoder reads exactly the embedded bits and no residual image data.

## Forensic Lab

| Tool | Purpose |
|---|---|
| Bit-Plane Explorer | Slider-based inspection of bit planes 0 to 7 to reveal LSB-embedded data |
| High-Pass Noise Filter | Laplacian residual visualisation that exposes noise introduced by embedding |
| DCT Frequency Mapping | Visualises the frequency fingerprint of an image |
| Raw LSB Extraction | Hex-level view of binary patterns from any selected bit plane |
| Gemini Assistant | Interprets high-entropy extracted data as encrypted, compressed, or plain text |

## Data Architecture and Security Rules

Firestore collections:

| Collection | Contents |
|---|---|
| `/users` | Public keys and unique network aliases |
| `/messages` | Encrypted packets with minimised metadata |
| `/messages/{id}/chunks` | Sub-collection holding fragmented large payloads |

Security rules use attribute-based access control:

- Only the sender or receiver of a message can read it, with a shared global channel readable by any authenticated user.
- Chunks are readable only by users who can read the parent message.
- Any single chunk larger than 800 KB is rejected.
- Every write is validated for schema integrity and identity spoofing.
- Message deletion removes the parent document and all chunks in one atomic batch.

## Key Design Parameters

| Parameter | Value |
|---|---|
| Asymmetric encryption | RSA-OAEP, 2048-bit |
| Symmetric encryption | AES-GCM, 256-bit |
| Integrity hash | SHA-256 |
| Maximum payload size | 10 MB |
| Chunk size limit | 800 KB |
| LSB capacity | Up to 25% of cover image size |
| DCT block size | 8x8 |
| Firestore document limit worked around | 1 MB |

## Engineering Decisions

- **Chunked transport:** payloads above the Firestore document limit are split into ordered chunks, written in a single atomic batch, and reassembled on the recipient side by chunk index before decryption starts.
- **Adaptive image optimisation:** cover images are resized and compressed before embedding so high-resolution sources stay inside the transport limit.
- **Non-reactive key storage:** cryptographic keys are kept outside React state to avoid exposure through state inspection.
- **Anti-flood pipeline:** a six-step routine (scan, detect, authenticate, download, purge, resolve) neutralises decoy-flooding attacks on the channel.

## Repository Structure

```
NecroSteg/
|
|-- src/
|   |-- components/
|   |-- lib/
|   |   |-- firebase.ts
|   |   |-- stegoUtils.ts
|   |   `-- cryptoUtils.ts
|   `-- services/
|       `-- geminiService.ts
|
|-- server.ts
|-- index.html
|-- vite.config.ts
|-- tsconfig.json
|-- vercel.json
|-- package.json
|-- package-lock.json
|-- firebase-applet-config.json
|-- firebase-blueprint.json
|-- firestore.rules
|-- metadata.json
|-- .env.example
|-- .gitignore
|
|-- stegano_app.py
|-- stegano_suite.py
|-- stego_research.py
|-- requirements.txt
|
|-- DOCUMENTATION.md
|-- PROJECT_MANIFEST.md
|-- SUMMARY.md
`-- README.md
```

## How to Run

Prerequisites: Node.js 18 or later, a Firebase project with Firestore and Authentication enabled, and a Gemini API key from Google AI Studio.

```bash
git clone https://github.com/jasvanth1063-creator/NecroSteg.git
cd NecroSteg
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` before starting the server:

```
GEMINI_API_KEY=your_gemini_api_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_FIRESTORE_DATABASE_ID=your_database_id
VITE_WS_ENABLED=false
```

Python research suite:

```bash
pip install -r requirements.txt
streamlit run stegano_app.py
python stegano_suite.py
```

The Streamlit command starts the steganalysis dashboard. The second command starts the FastAPI encode and decode service.

## Deployment

The frontend is deployed on Vercel and rebuilds automatically on every push to `main`. Set the same `VITE_FIREBASE_*` variables under the Vercel project's Environment Variables and add the deployment domain to the Firebase Authentication authorized domains list. Vite reads these variables at build time, so redeploy after changing them.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, D3.js, Lucide React |
| Server | Express, tsx, ws |
| Cryptography | Web Crypto API (SubtleCrypto): RSA-OAEP, AES-GCM-256, SHA-256 |
| Image Processing | Canvas pixel buffers, Jimp |
| Backend Services | Firebase Firestore, Firebase Authentication |
| AI | Google Gemini through `@google/genai` |
| Research Suite | Python, FastAPI, Streamlit, NumPy, SciPy, Pillow |
| Deployment | Vercel |

## Further Documentation

- `DOCUMENTATION.md`: full technical manual covering the protocol, schema, and component design
- `PROJECT_MANIFEST.md`: system overview and feature modules
- `SUMMARY.md`: steganalysis research suite summary

NecroSteg: Zero-Knowledge Steganographic Communication Platform | B. Jasvanth, Lendi Institute of Engineering and Technology, Vizianagaram
