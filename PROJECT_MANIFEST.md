# NecroSteg Project Manifest & Technical Report

## 1. System Overview
NecroSteg is a full-stack digital forensics and steganography workbench. It enables users to hide data within images using both spatial and frequency domain methods, transmit those images securely via Firebase, and analyze them using AI-powered forensic tools.

## 2. Core Architecture
- **Framework:** React + Vite (TypeScript)
- **Styling:** Tailwind CSS + Lucide Icons + Motion
- **Backend:** Firebase Firestore (Real-time DB) + Firebase Auth
- **AI Engine:** Gemini 1.5 Flash (via @google/genai)

## 3. Forensic Methods Implemented

### A. Spatial Domain (LSB)
- **Concept:** Information is stored in the 1's place bit of a pixel's color value.
- **Workflow:** Set bit 0 of the Red channel to match the message bitstream.
- **Analysis:** Detected via the **Bit-Plane Slicer**.

### B. Frequency Domain (DCT)
- **Concept:** Image pixels are transformed into frequency coefficients.
- **Algorithm:** Discrete Cosine Transform on 8x8 matrices.
- **Steganography:** Bits are hidden in mid-frequency AC coefficients (e.g., zig-zag index 18).
- **Execution:** 
  1. Image divided into 8x8 blocks.
  2. DCT applied to each block.
  3. LSB of mid-freq coefficient modified.
  4. Inverse DCT (IDCT) converts back to pixels.

## 4. Feature Modules

### Secure Communication Channel
- **Private Channels:** End-to-End Encrypted (E2EE) messaging between authenticated nodes with identity-anchored digital signatures.
- **Self-Decryption Protocol:** Dual AES key wrapping allowing both sender and receiver to access the secure payload from a single transmission.
- **Adaptive Transmission Layer:** Intelligent image compression and base64 chunking ensuring payloads stay under 1MB even for high-resolution sources.
- **Anti-Flood Engine:** Automated 6-step pipeline (Scan, Detect, Auth, Download, Purge, Resolve) to neutralize decoy-flooding attacks.

### Forensic Lab
- **Bit-Plane Analysis:** Slider-based exploration of bit depth to uncover LSB hidden data.
- **High-Pass Noise Filter:** Detects "salt and pepper" noise induced by steganography.
- **DCT Frequency Mapping:** Visualizes the "frequency fingerprint" of an image.
- **Domain Labs:** Specialized analysis environment for spatial, randomized, and mapping-based forensic investigations.

### AI Expert Forensic System
- **Multimodal Analysis:** Analyzes images for forensic anomalies using Gemini.
- **Technical Consultation:** Provides insights on steganographic barriers like Embedding Maps and AES Keys.

## 5. Security & Firebase
- **Rules:** The "Fortress" Firestore rules ensure users can only read messages sent to them or the 'GLOBAL' channel.
- **Validation:** Every write operation is validated for schema integrity and identity spoofing prevention.

## 6. Execution Instructions
1. **Login:** Use Google Identity to initialize your forensic node.
2. **Encode:** Use the **Workbench** to embed secrets into raw image buffers.
3. **Transmit:** Copy the data-URL and send it via **Secure Comm**.
4. **Extract:** Use the **Forensics** sliders to find the hidden data or use the **Domains** tab to auto-decrypt.
