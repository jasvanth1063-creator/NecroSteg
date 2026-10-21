# SteganoLabs Project Summary: Digital Image Steganalysis Suite

This project is a comprehensive implementation of the research paper **"Digital Image Steganalysis: Current Methodologies and Future Challenges" (2022)**. It provides both a production-ready React frontend and a research-focused Python full-stack suite.

## 1. Integrated Architectures

### A. React & TypeScript Frontend (Production Grade)
- **Workbench:** Interactive LSB (Least Significant Bit) encoder and decoder.
- **Forensics Suite:** 
  - **Bit-Plane Explorer:** Visualizes 0-7 bit planes (Plane 0 is the primary target for LSB stego).
  - **High-Pass Noise Filter:** Laplacian-based residual noise visualization to find adaptive steganography signatures.
- **AI Research Expert:** A Gemini-powered chat interface trained on the specific steganography methodologies discussed in the paper (HUGO, HILL, MiPOD, SRNet).
- **Design:** Industrial "Forensics Lab" aesthetic using Tailwind CSS and Lucide icons.

### B. Python Research Suite (Full-Stack)
- **FastAPI Backend (`stegano_suite.py`):** A high-performance API for encoding and decoding hidden data using NumPy and PIL.
- **Streamlit Dashboard (`stegano_app.py`):**
  - **Spatial Domain:** Bit-plane manipulation and PoV (Pairs of Values) statistical checks.
  - **Transform Domain:** DCT (Discrete Cosine Transform) visualize using Scipy FFT, showing frequency coefficients used in JPEG steganography.
  - **Deep Steganalysis:** Residual noise modeling and standard deviation analysis to simulate CNN detection scores (based on SRNet research).
  - **Statistics:** Real-time pixel intensity histograms and channel distribution charts.

### C. Forensic Intelligence (Advanced)
- **Raw LSB Extraction:** Added Python-based bit-plane raw extraction for deeper forensic investigations. This allows analysts to see binary patterns (Hex) directly from any selected bit-plane.
- **AI Neural Decryption:** Integrated Gemini 3.1 Flash to interpret extracted "high-entropy" data. The AI acts as a steganalysis expert, identifying if data is encrypted, compressed, or plain text, and providing a "Plain English" interpretation for investigators.

## 2. Methodology Coverage
- **Spatial Domain:** LSB Matching and PVD simulation, Raw LSB Bit-Plane Extraction.
- **Transform Domain:** JPEG DCT coefficient analysis.
- **Forensics:** High-pass filtering, Bit-plane slicing, AI-powered payload interpretation, and Statistical histograms.
- **Datasets Reference:** Integration of metadata for BOSSbase 1.01 and Alaska 2.0.

## 3. How to Execute
- **React App:** View the live preview in the AI Studio frame.
- **Python Dashboard:** Run `streamlit run stegano_app.py` in your local terminal.
- **Python API:** Run `python stegano_suite.py` to start the FastAPI server on port 3000.

## 4. Key Files Created
- `stegano_app.py`: The unified research dashboard.
- `stegano_suite.py`: The Full-Stack API and lightweight UI.
- `requirements.txt`: Python dependency list.
- `src/lib/stegoUtils.ts`: JavaScript image processing library.
- `src/services/geminiService.ts`: AI Steganalysis expert integration.
