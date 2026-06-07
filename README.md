<div align="center">

# 🔐 NecroSteg
### Advanced Cryptographic Steganography & Secure Communication Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-necro--steg.vercel.app-green?style=for-the-badge&logo=vercel)](https://necro-steg.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-jasvanth1063--creator-black?style=for-the-badge&logo=github)](https://github.com/jasvanth1063-creator/NecroSteg)
[![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-12-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![Vite](https://img.shields.io/badge/Vite-6-purple?style=for-the-badge&logo=vite)](https://vitejs.dev)

*A Zero-Knowledge, full-stack secure communication platform combining RSA/AES encryption with digital steganography*

</div>

---

## 🌐 Live Demo

**🔗 [https://necro-steg.vercel.app](https://necro-steg.vercel.app)**

---

## 📌 What is NecroSteg?

NecroSteg is a high-security communication platform built for **Zero-Knowledge messaging** — where even the database provider cannot view message contents. It combines:

- **RSA-OAEP Asymmetric Encryption** — for secure key exchange
- **AES-GCM-256 Symmetric Encryption** — for high-speed data transfer
- **Digital Steganography (LSB & DCT)** — for hiding encrypted data inside images
- **Firebase Firestore** — serverless, real-time backend
- **Gemini AI** — for forensic analysis and intelligent assistance

The result: encrypted messages hidden inside ordinary images — a "Ghost" communication system.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Zero-Knowledge Encryption** | RSA + AES hybrid — server never sees plaintext |
| 🖼️ **Steganography Engine** | Hide encrypted payloads inside PNG/JPEG images |
| 🔬 **Forensic Analysis** | Audit binary structure of encrypted packets |
| 💬 **Secure Comm Channel** | Real-time encrypted messaging between users |
| 🤖 **Gemini AI Integration** | AI-powered forensic assistant |
| 🧩 **Message Chunking** | Handles payloads up to 10MB via Firestore sub-collections |
| 🛡️ **Replay Attack Prevention** | Unique nonce per transmission |
| 🔑 **Google Authentication** | Firebase Auth with authorized domain locking |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS, Vite 6 |
| **Crypto** | Web Crypto API (SubtleCrypto), RSA-OAEP, AES-GCM-256, SHA-256 |
| **Steganography** | LSB (Least Significant Bit), DCT (Discrete Cosine Transform) |
| **Backend** | Firebase Firestore, Firebase Authentication |
| **AI** | Google Gemini AI (@google/genai) |
| **Deployment** | Vercel (Frontend), Firebase (Database) |
| **Visualization** | D3.js, Lucide React, Motion |

---

## 🔐 Cryptographic Architecture

### Hybrid Encryption Flow
```
User A                          Firestore                        User B
  |                                 |                               |
  |-- Generate RSA-2048 Key Pair -->|                               |
  |-- Publish Public Key ---------->|                               |
  |                                 |<-- Fetch User B Public Key ---|
  |-- Generate AES-256 Key          |                               |
  |-- Encrypt Message (AES-GCM) --> |                               |
  |-- Wrap AES Key (RSA-OAEP) ----->|                               |
  |-- Hash Payload (SHA-256) ------>|                               |
  |-- Hide in Image (LSB/DCT) ----->|-- Deliver Encrypted Packet -->|
  |                                 |                               |-- Unwrap AES Key (RSA)
  |                                 |                               |-- Decrypt Message (AES)
  |                                 |                               |-- Verify Hash (SHA-256)
```

### Steganography Methods
- **LSB (Least Significant Bit)** — Replaces the last bit of RGB pixels with encrypted payload bits. Capacity: up to 25% of image size.
- **DCT (Discrete Cosine Transform)** — Hides data in frequency domain coefficients. More robust against compression.

---

## 🚀 Run Locally

### Prerequisites
- Node.js 18+
- Firebase project with Firestore & Authentication enabled
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/jasvanth1063-creator/NecroSteg.git
cd NecroSteg

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in your values in .env.local

# 4. Run the development server
npm run dev
```

### Environment Variables

Create a `.env.local` file with the following:

```env
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

---

## 📁 Project Structure

```
NecroSteg/
├── src/
│   ├── components/        # React UI components
│   ├── lib/
│   │   └── firebase.ts    # Firebase configuration
│   └── services/          # Crypto, Stego, AI services
├── .env.example           # Environment variable template
├── .gitignore             # Excludes sensitive files
├── vercel.json            # Vercel deployment config
├── firebase-blueprint.json # Firestore schema blueprint
├── firestore.rules        # Firestore security rules
├── DOCUMENTATION.md       # Full technical documentation
└── PROJECT_MANIFEST.md    # Project overview
```

---

## 🔒 Security Design

- **Client-Side Crypto Only** — Keys never leave the user's device
- **ABAC Firestore Rules** — Only sender/receiver can access messages
- **Nonce-Based Replay Prevention** — Every packet has a unique nonce
- **Chunk Integrity Guards** — Rules forbid chunks exceeding 800KB
- **No Plaintext Storage** — Firebase stores only encrypted blobs

---

## 🎓 About This Project

Built by **Jasvanth** — CSE student specializing in AI & Data Science at LIET.

This project was developed as part of an advanced exploration into:
- Applied cryptography and steganography
- Full-stack secure application development
- AI-assisted forensic analysis systems
- Zero-knowledge architecture design

---

## 📄 License

This project is for educational and portfolio purposes.

---

<div align="center">
Made with 🔐 by <a href="https://github.com/jasvanth1063-creator">jasvanth1063-creator</a>
</div>
