# NecroSteg: Advanced Cryptography & Steganographic Shield
## Official Technical Documentation & System Architecture

### 1. Executive Summary
NecroSteg is a high-security, full-stack communication platform designed for **Zero-Knowledge** environment messaging. It leverages the browser's native Web Crypto API to ensure that even the database provider (Firebase) cannot view the contents of messages. By combining **Asymmetric RSA Encryption** for key exchange, **Symmetric AES-GCM** for data high-speed transfer, and **Digital Steganography**, the system achieves a "Ghost" presence—hiding encrypted data inside ordinary images.

---

### 2. The Cryptographic Blueprints
The system implements a multi-layered security protocol (PFS-Lite) to protect data integrity and privacy.

#### A. Hybrid Encryption Flow
1.  **Key Pair Generation**: Every user generates a 2048-bit RSA-OAEP public/private key pair on their device.
2.  **AES-GCM Execution**: Each message is encrypted using a unique 256-bit AES key (Advanced Encryption Standard with Galois/Counter Mode). GCM provides both confidentiality and authentication.
3.  **Key Wrapping**: The recipient's Public RSA key is used to "wrap" (encrypt) the one-time-use AES key.
4.  **Integrity Hashing**: A SHA-256 hash of the payload is generated before transmission to prevent tampering.

#### B. Identity Verification
- **Verified Identities**: The app cross-references Firebase Auth tokens with local signatures to ensure the sender is who they claim to be.
- **Nonce Management**: Every transmission includes a unique nonce to prevent "Replay Attacks."

---

### 3. Steganographic Engineering (The "Covert" Layer)
The platform offers two primary methods to hide data, managed via the `stegoUtils.ts` engine.

#### Method 1: LSB (Least Significant Bit)
- **Concept**: The system replaces the 1 or 2 least significant bits of every RGB pixel in a "Cover Image" with bits from the encrypted payload.
- **Benefit**: Extremely high capacity (can store up to 25% of the image size).
- **Compromise**: Vulnerable to extreme lossy compression (like low-quality JPEGs).

#### Method 2: DCT (Discrete Cosine Transform) - Experimental
- **Concept**: Data is hidden in the frequency domain, similar to how JPEG compression works.
- **Benefit**: High robustness against resizing and visual noise.
- **Logic**: Modifies the coefficients of the cosine wave patterns that make up the image.

---

### 4. Full-Stack Data Architecture
The backend is a serverless NoSQL architecture powered by **Google Firebase**.

#### A. Firestore Schema
- **`/users`**: Stores Public Keys and custom network aliases. Every entry is strictly unique.
- **`/messages`**: Primary collection for encrypted packets. Fields are minimized to prevent metadata leakage.
- **`/messages/{id}/chunks`**: A sub-collection designed to handle payloads up to 10MB by fragmenting the data into 800KB blocks.

#### B. Security Rules (ABAC)
Our Firestore rules implement **Attribute-Based Access Control**:
- **Identity Lock**: Only the `senderId` or `receiverId` can read a message.
- **Global Broadcasts**: Specialized logic allows "Global" channel messages to be fetched by any authenticated user while remaining internally encrypted.
- **Deletion Rights**: Message owners can trigger a "Purge," which atomically deletes the parent message and all associated data chunks via a **Firestore Batch Operation**.

---

### 5. Frontend & UI Engine
Built using **React 18** and **Tailwind CSS**, the UI is designed for "Forensic Transparency."

#### Key Components:
- **`SecureComm.tsx`**: The Master Orchestrator. Handles State, Camera streams, and the Real-Time listener.
- **`CryptoProvider`**: A React Context that manages the cryptographic lifecycle—ensuring keys are never stored in plain text in memory.
- **Forensic Modal**: A specialized view that allows users to "peek" into the binary structure of their own sent packets, viewing metadata like IV (Initialization Vector) and wrapped keys.

---

### 6. Failure Resilience & Scaling
#### The Chunking Strategy
Standard Firestore documents are capped at 1MB. NecroSteg bypasses this by:
1. Detecting if a payload (Image + Encryption) exceeds 1MB.
2. Slicing the Base64 string into multiple `MessageChunk` documents.
3. Automatically re-assembling chunks on the recipient's side using a sorted `orderBy('chunkIndex')` query.

---

### 7. Interview Insights: "Why NecroSteg?"
**Q: Why not just use a standard chat library?**
*A: NecroSteg focuses on the "Mathematical Truth" of data. We don't trust servers. By implementing the entire crypto-suite client-side, we remove the server as a vector of attack.*

**Q: How do you handle image quality?**
*A: We use a custom `optimizeImageForSecureComm` function that balances resolution with file size, ensuring that high-res steganography doesn't break the 10MB system threshold.*

---

### 8. Frontend Engineering: Component Breakdown

#### A. `SecureComm.tsx` (The Command Center)
This is the application's central nervous system. It manages complex state transitions between unauthenticated, unauthorized, and secured states.
- **State Management**: Uses `useState` for real-time message streams, but offloads cryptographic keys to a non-reactive memory store to prevent "State Peeking" vulnerabilities.
- **The Listener**: Implements a real-time `onSnapshot` listener with a custom "Assembly Buffer." If a message is flagged as `isChunked`, the UI waits for all chunks to arrive before attempting to decrypt, preventing broken UI states.
- **Forensic Modal**: A unique feature that iterates through the `ArrayBuffer` of a message, identifying headers and metadata markers. This allows developers to audit the encryption process without exposing private keys.

#### B. `stegoUtils.ts` (The Mathematical Core)
The engine responsible for the "Art of Invisibility."
- **LSB Logic**:
    ```typescript
    // Pseudocode of the LSB Injection
    for (let i = 0; i < data.length; i++) {
        const pixel = imageData[i];
        const bit = data[i];
        imageData[i] = (pixel & 0xFE) | bit; // Zero out the last bit, then inject ours
    }
    ```
- **Capacity Management**: Includes a binary header that tells the decoder how many bits to read, preventing the system from reading "ghost data" from the rest of the image.

#### C. `cryptoUtils.ts` (The Shield)
Wraps the browser's `SubtleCrypto` interface into easy-to-use primitives.
- **AES-GCM-256**: Chosen over CBC because it provides integrated authentication (it will fail to decrypt if even a single bit of the file is changed).
- **Public Key Registry**: Automatically publishes the user's `publicKey` to Firestore upon first generation, enabling seamless private messaging without manual key exchange.

---

### 9. Full-Stack Integration & Deployment
#### A. The Chunking Protocol
To support the 10MB requirement, the app implements a custom "Data Fragmenter":
1.  **Ingestion**: Receives a large Base64 string from the Crypto/Stego layer.
2.  **Slicing**: Breaks the string into 0.8MB fragments.
3.  **Atomic Batches**: Uses `writeBatch` to ensure that either the entire message (and all its chunks) is written to Firestore, or nothing at all. This maintains database integrity.

#### B. Firestore Security Invariants
The `firestore.rules` are hardened using a "Relational Gate" pattern:
- **Parent-Child Integrity**: Chunks can only be read if the user has access to the parent message.
- **Size Guards**: Rules strictly forbid any single chunk from exceeding 800KB, mitigating "Denial of Wallet" attacks.

---

### 10. The Developer's Lifecycle (Interview Ready)
If asked about the development process, here is the timeline:
1.  **Phase 1 (Security First)**: Established the `cryptoUtils` library. Verified RSA-OAEP wrapping manually.
2.  **Phase 2 (The Covert Layer)**: Built the LSB engine. Tested against various image formats (PNG/JPEG) to identify bit-loss thresholds.
3.  **Phase 3 (The Full-Stack Bridge)**: Integrated Firebase. Implemented the "Master Gate" security pattern.
4.  **Phase 4 (Resiliency)**: Added the "Message Fragmenter" when 1MB limits were reached.
5.  **Phase 5 (Forensics)**: Added audit tools to verify the "Zero-Knowledge" claim.

---
*End of Technical Manual*

