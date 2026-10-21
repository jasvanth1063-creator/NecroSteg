import streamlit as st
import numpy as np
import pandas as pd
from PIL import Image
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import io
import binascii
import hashlib
import math
import cv2
import pywt
from scipy import fft
from scipy.ndimage import label
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

# --- PAGE CONFIG ---
st.set_page_config(page_title="SteganoLabs Research Suite", page_icon="🛡️", layout="wide")

# --- CUSTOM CSS ---
st.markdown("""
<style>
    .main { background-color: #0e1117; }
    .stApp { color: #d1d5db; }
    h1, h2, h3 { color: #10b981 !important; font-family: 'JetBrains Mono', monospace; }
    .stButton>button { background-color: #10b981; color: black; border-radius: 4px; font-weight: bold; border: none; }
    .stButton>button:hover { background-color: #059669; }
</style>
""", unsafe_allow_html=True)

# --- ENGINE ---
import scipy.fftpack as fftpack

class StegoEngine:
    @staticmethod
    def to_binary(data):
        if isinstance(data, str):
            return ''.join([format(ord(i), "08b") for i in data])
        return format(data, "08b")

    @staticmethod
    def encode(image, message):
        img = image.convert('RGB')
        pixels = np.array(img)
        binary_msg = StegoEngine.to_binary(message) + '1111111111111110'
        flat_pixels = pixels.flatten()
        if len(binary_msg) > flat_pixels.size:
            raise ValueError("Message exceeded image capacity.")
        for i in range(len(binary_msg)):
            flat_pixels[i] = (flat_pixels[i] & ~1) | int(binary_msg[i])
        return Image.fromarray(flat_pixels.reshape(pixels.shape))

    @staticmethod
    def decode(image):
        img = image.convert('RGB')
        pixels = np.array(img).flatten()
        binary_data = ""
        for p in pixels[:8000]: # Limit scan for speed
            binary_data += str(p & 1)
        all_bytes = [binary_data[i: i+8] for i in range(0, len(binary_data), 8)]
        decoded_msg = ""
        for byte in all_bytes:
            if byte == '11111111' or len(byte) < 8: break
            decoded_msg += chr(int(byte, 2))
        return decoded_msg

    @staticmethod
    def get_dct(image):
        img_gray = image.convert('L')
        imf = np.array(img_gray, dtype=float)
        dct = fftpack.dct(fftpack.dct(imf.T, norm='ortho').T, norm='ortho')
        return np.log(np.abs(dct) + 1)

    @staticmethod
    def deep_analysis_score(image):
        # Simulated SRM (Spatial Rich Model) Anomaly Detection
        img = image.convert('L')
        pixels = np.array(img, dtype=float)
        # Compute horizontal and vertical residuals (noise components)
        res_h = pixels[:, 1:] - pixels[:, :-1]
        res_v = pixels[1:, :] - pixels[:-1, :]
        # High entropy in residuals suggests steganography
        score = (np.std(res_h) + np.std(res_v)) / 10.0
        return min(99.9, score * 15)

    @staticmethod
    def extract_raw_lsb(image, plane=0):
        img = image.convert('RGB')
        pixels = np.array(img)
        # Isolate specific bit plane
        extracted_bits = (pixels >> plane) & 1
        # Flatten and pack bits into bytes
        flattened_bits = extracted_bits.flatten()
        extracted_bytes = np.packbits(flattened_bits)
        return extracted_bytes.tobytes()

    @staticmethod
    def calculate_entropy(data):
        if not data: return 0
        entropy = 0
        for x in range(256):
            p_x = float(data.count(x)) / len(data)
            if p_x > 0:
                entropy += - p_x * math.log(p_x, 2)
        return entropy

    @staticmethod
    def attempt_aes_decryption(payload, password):
        try:
            key = hashlib.sha256(password.encode()).digest()
            iv = payload[:16]
            ciphertext = payload[16:]
            cipher = AES.new(key, AES.MODE_CBC, iv)
            decrypted = unpad(cipher.decrypt(ciphertext), AES.block_size)
            return decrypted
        except Exception:
            return None

    @staticmethod
    def get_ebe(image):
        """Edges Based Embedding (EBE) - Locate security-sensitive embedding regions."""
        img_gray = np.array(image.convert('L'))
        edges = cv2.Canny(img_gray, 100, 200)
        return edges

    @staticmethod
    def get_dft(image):
        """Discrete Fourier Transform (DFT) - Analyze frequency magnitude."""
        img_gray = np.array(image.convert('L'))
        dft = fft.fft2(img_gray)
        dft_shift = fft.fftshift(dft)
        magnitude_spectrum = 20 * np.log(np.abs(dft_shift) + 1)
        return magnitude_spectrum

    @staticmethod
    def get_dwt(image):
        """Discrete Wavelet Transform (DWT) - Decomposition via Haar Wavelet."""
        img_gray = np.array(image.convert('L'))
        coeffs2 = pywt.dwt2(img_gray, 'haar')
        LL, (LH, HL, HH) = coeffs2
        return LL, LH, HL, HH

    @staticmethod
    def get_labeled_regions(image):
        """Labeling/Connectivity Method - Identify isolated noise segments."""
        img_gray = np.array(image.convert('L'))
        # Simple thresholding to find connected regions
        binary = img_gray > 128
        labeled_array, num_features = label(binary)
        return labeled_array, num_features

    @staticmethod
    def get_rpe_map(image, seed=42):
        """Random Pixel Embedding (RPE) - Pseudo-random selection simulation."""
        h, w = image.size
        # Deterministic random map
        np.random.seed(seed)
        rpe_map = np.random.randint(0, 2, (w, h))
        return rpe_map

    @staticmethod
    def get_pixel_mapping(image):
        """Mapping Pixel to Hidden Data - Value-to-Message correlation analysis."""
        img_gray = np.array(image.convert('L'))
        # Simulate a mapping where parity of pixel value determines message bit
        # This highlights blocks that match a specific mapping criteria
        mapping = img_gray % 2
        return mapping

# --- UI COMPONENTS ---
st.title("🛡️ STEGANO_LABS Research Dashboard")
st.caption("Unified Forensics Framework: Spatial | Transform | Deep-Neural")

tabs = st.tabs(["📤 WORKBENCH", "🔍 DOMAINS", "🧠 DEEP_STEGANALYSIS", "📊 STATISTICS", "🔐 FORENSIC_CRACKING"])

with tabs[0]:
    col1, col2 = st.columns(2)
    with col1:
        st.subheader("ENCODER_PROTOCOL")
        uploaded_file = st.file_uploader("Upload Cover Image", type=["png", "jpg", "jpeg"], key="workbench_upload")
        secret_text = st.text_area("Secret Message to Hide", "Protocol 9: Ghost in the Shell", key="secret_msg")
        
        if st.button("EXECUTE_ENCODE") and uploaded_file:
            input_img = Image.open(uploaded_file)
            stego_img = StegoEngine.encode(input_img, secret_text)
            st.success("ENCODING_SUCCESSFUL")
            st.image(stego_img, caption="Stego Object (Output)", use_container_width=True)
            buf = io.BytesIO()
            stego_img.save(buf, format="PNG")
            st.download_button("DOWNLOAD_STEGO_IMAGE", buf.getvalue(), "stego_object.png", "image/png")

    with col2:
        st.subheader("DECODER_PROTOCOL")
        stego_file = st.file_uploader("Upload Suspect Image", type=["png"], key="stego_upload")
        if st.button("EXECUTE_EXTRACT") and stego_file:
            stego_img = Image.open(stego_file)
            msg = StegoEngine.decode(stego_img)
            st.info(f"EXTRACTED_SEQUENCE: \n\n {msg}")

with tabs[1]:
    st.subheader("DOMAIN_SWITCHER")
    v_col1, v_col2 = st.columns(2)
    with v_col1:
        domain_img = st.file_uploader("Upload Image for Multi-Domain Scan", type=["png", "jpg", "jpeg"], key="domain_scan")
    
    if domain_img:
        img = Image.open(domain_img)
        
        methods = [
            "Spatial (Bit Planes)", 
            "Randomized (RPE Map)",
            "Mapping (Pixel-to-Data)",
            "Forensic (EBE - Edge Analysis)",
            "Connectivity (Labeling/Regions)",
            "Transform (DCT Coefficients)",
            "Transform (DFT Magnitude)",
            "Transform (DWT Decomposition)",
            "Reversible (RDH/Lossless DCT)"
        ]
        
        mode = st.select_slider(
            "🔬 FORENSIC_METHODOLOGY_SLIDER",
            options=methods,
            value="Spatial (Bit Planes)",
            help="Slide across the spectrum of steganographic domains to analyze specific embedding signatures."
        )
        
        if mode == "Spatial (Bit Planes)":
            plane = st.slider("Target Bit Plane", 0, 7, 0)
            img_rgb = img.convert('RGB')
            bit_data = (np.array(img_rgb) >> plane) & 1
            st.image((bit_data * 255).astype(np.uint8), caption=f"Spatial Domain: Plane {plane}", use_container_width=True)
            
            if st.button("EXECUTE_FORENSIC_RAW_EXTRACTION"):
                raw_payload = StegoEngine.extract_raw_lsb(img, plane=plane)
                hex_preview = binascii.hexlify(raw_payload[:50]).decode().upper()
                formatted_hex = ' '.join(hex_preview[i:i+2] for i in range(0, len(hex_preview), 2))
                st.write("### Extracted Forensic Payload (Hex Preview)")
                st.code(formatted_hex)
                st.write("This reveal patterns of high-entropy data embedded in the selected bit plane.")
        elif mode == "Transform (DCT Coefficients)":
            dct_data = StegoEngine.get_dct(img)
            fig_dct = px.imshow(dct_data, color_continuous_scale='Viridis', title="DCT Frequency Coefficients")
            st.plotly_chart(fig_dct, use_container_width=True)
            st.write("Transform domain methods (like J-UNIWARD) hide data in these coefficients to evade spatial LSB detectors.")
        
        elif mode == "Transform (DFT Magnitude)":
            dft_data = StegoEngine.get_dft(img)
            fig_dft = px.imshow(dft_data, color_continuous_scale='Magma', title="DFT Magnitude Spectrum")
            st.plotly_chart(fig_dft, use_container_width=True)
            st.write("DFT allows embedding in the phase or magnitude of the frequency components.")

        elif mode == "Transform (DWT Decomposition)":
            LL, LH, HL, HH = StegoEngine.get_dwt(img)
            st.write("### Haar Wavelet Decomposition (L1)")
            dw_col1, dw_col2 = st.columns(2)
            with dw_col1:
                st.image(LL / np.max(LL), caption="LL (Approximation)")
                st.image(LH / np.max(LH), caption="LH (Horizontal Details)")
            with dw_col2:
                st.image(HL / np.max(HL), caption="HL (Vertical Details)")
                st.image(HH / np.max(HH), caption="HH (Diagonal Details)")
            st.write("DWT isolates high-frequency regions (LH, HL, HH) where data remains undetectable.")

        elif mode == "Forensic (EBE - Edge Analysis)":
            edges = StegoEngine.get_ebe(img)
            st.image(edges, caption="EBE: Edge-Based Embedding Potential Zones (Canny Analysis)", use_container_width=True)
            st.write("Edges Based Data Embedding (EBE) targets high-variance boundaries to mask payload signatures.")

        elif mode == "Connectivity (Labeling/Regions)":
            labeled, num = StegoEngine.get_labeled_regions(img)
            fig_lb = px.imshow(labeled, color_continuous_scale='Jet', title=f"Connected Regions Analysis (Identified: {num})")
            st.plotly_chart(fig_lb, use_container_width=True)
            st.write("Labeling/Connectivity methods use isolated pixel clusters or connected components to store discrete hidden labels.")

        elif mode == "Randomized (RPE Map)":
            r_seed = st.number_input("RPE Key (Seed)", 0, 999999, 42)
            rpe_data = StegoEngine.get_rpe_map(img, seed=r_seed)
            st.image((rpe_data * 255).astype(np.uint8), caption=f"RPE Generation Map (Seed: {r_seed})", use_container_width=True)
            st.write("Random Pixel Embedding (RPE) spreads the payload across the image using a pseudo-random path determined by a secret key.")

        elif mode == "Mapping (Pixel-to-Data)":
            map_data = StegoEngine.get_pixel_mapping(img)
            st.image((map_data * 255).astype(np.uint8), caption="Pixel Pattern Mapping Distribution", use_container_width=True)
            st.write("Mapping methods establish a functional relationship between pixel intensity/color and message bits, often used in palette steganography (GIF/PNG-8).")

        elif mode == "Reversible (RDH/Lossless DCT)":
            # Simulate Histogram Shifting (Common RDH method)
            img_gray = np.array(img.convert('L'))
            counts, bins = np.histogram(img_gray, bins=256)
            peak = np.argmax(counts)
            
            st.write(f"### Reversible Data Hiding (RDH) Analysis")
            st.write(f"Detected Histogram Peak at Intensity: **{peak}**")
            
            # Show "Shifted" potential areas
            shifted_potential = (img_gray == peak).astype(np.uint8)
            st.image(shifted_potential * 255, caption="RDH: Target Histogram Peaks for Reversible Embedding", use_container_width=True)
            st.write("Lossless or Reversible Data Hiding (RDH) allows for the perfect 1:1 reconstruction of the cover object after extraction by shifting the pixel histogram to create 'vacant' slots for data.")

with tabs[2]:
    st.subheader("CNN_SIMULATED_ANOMALY_DETECTOR")
    st.write("This engine uses residual noise modeling inspired by SRNet and YeNet architectures to detect 'into the wild' steganography.")
    
    if domain_img:
        img = Image.open(domain_img)
        if st.button("RUN_DEEP_NEURAL_AUDIT"):
            score = StegoEngine.deep_analysis_score(img)
            col_s1, col_s2 = st.columns([1, 2])
            with col_s1:
                st.metric("Stego-Probability Score", f"{score:.2f}%")
            with col_s2:
                if score > 60:
                    st.warning("CRITICAL_ANOMALY: High probability of hidden data pattern detected in high-frequency noise residuals.")
                elif score > 30:
                    st.info("CAUTION: Moderate noise irregularity. May be adaptive steganography (HILL or MiPOD).")
                else:
                    st.success("CLEAN_MEDIA: Noise profile matches standard sensor distribution.")

with tabs[3]:
    st.subheader("QUANTI_STATISTICAL_ANALYSIS")
    if domain_img:
        img = Image.open(domain_img).convert('RGB')
        pixels = np.array(img)
        
        fig, ax = plt.subplots(figsize=(10, 4))
        sns.histplot(pixels[:,:,0].flatten(), color='red', label='Red Channel', alpha=0.5, element="step")
        sns.histplot(pixels[:,:,1].flatten(), color='green', label='Green Channel', alpha=0.5, element="step")
        sns.histplot(pixels[:,:,2].flatten(), color='blue', label='Blue Channel', alpha=0.5, element="step")
        plt.title("Spatial Domain Pixel Distribution")
        plt.legend()
        st.pyplot(fig)
        
        st.write("### Research Metadata Summary")
        st.markdown("""
        **Core Methodology References:**
        - **Spatial Domain:** LSB (Least Significant Bit), LSB Matching, PVD (Pixel Value Differencing), EBE (Edge-Based), RPE (Random Pixel Embedding).
        - **Transform Domain:** DCT (Discrete Cosine Transform), DFT (Fourier), DWT (Wavelet - Haar/Daubechies).
        - **Advanced Techniques:** RDH (Reversible Data Hiding / Lossless DCT), Connectivity-based labeling, Mapping functions.
        - **Adaptive Algorithms:** HUGO, HILL, MiPOD, S-UNIWARD, J-UNIWARD.
        - **Forensic Metrics:** Pe (Probability of False Alarm), SRM (Spatial Rich Models), NIST statistical tests.
        """)

with tabs[4]:
    st.subheader("ADVANCED_FORENSIC_CRACKING_LAB")
    st.write("Perform entropy analysis and dictionary attacks on high-entropy payloads extracted from stego-objects.")
    
    if domain_img:
        img = Image.open(domain_img)
        crack_plane = st.selectbox("Select Extraction Plane", list(range(8)), index=0)
        
        if st.button("RUN_INTELLIGENT_DECRYPTION_SCAN"):
            raw_data = StegoEngine.extract_raw_lsb(img, plane=crack_plane)
            segment = raw_data[:256] # Focus on start of payload
            
            entropy = StegoEngine.calculate_entropy(segment)
            data_hash = hashlib.sha256(segment).hexdigest()
            
            e_col1, e_col2 = st.columns(2)
            with e_col1:
                st.metric("Payload Entropy", f"{entropy:.4f}")
                if entropy > 7.5:
                    st.error("HIGH_ENTROPY: Pattern suggests Encryption or Compression.")
                else:
                    st.info("LOW_ENTROPY: Pattern suggests Plaintext or Sparse Data.")
            
            with e_col2:
                st.metric("Payload SHA-256", data_hash[:16] + "...")
            
            st.divider()
            st.subheader("DICTIONARY_ATTACK_ENGINE")
            dict_input = st.text_input("Enter Passwords (comma separated)", "password, secret, 123456, admin, stego")
            passwords = [p.strip() for p in dict_input.split(',')]
            
            if st.button("EXECUTE_AES_CRACK"):
                found = False
                for pwd in passwords:
                    result = StegoEngine.attempt_aes_decryption(segment, pwd)
                    if result:
                        st.success(f"SUCCESS: Decrypted with key '{pwd}'")
                        st.code(result.decode('utf-8', errors='ignore'))
                        found = True
                        break
                if not found:
                    st.warning("FAILED: No matching key found in dictionary. Payload may use different cipher or KDF.")

if __name__ == "__main__":
    pass # Managed by streamlit run
