/**
 * SteganoAnalyzer Utilities
 * Handles Image Processing for Steganography and Steganalysis
 */

export interface StegoResult {
  imageData: ImageData;
  messageSize: number;
}

/**
 * Converts ImageData to grayscale based on luminosity.
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = avg;
    data[i + 1] = avg;
    data[i + 2] = avg;
  }
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Encodes a text message into the Least Significant Bits of an image.
 * If syncChannels is true, all RGB channels will be updated with the same bit
 * to maintain grayscale consistency.
 */
export function encodeLSB(baseImageData: ImageData, message: string, syncChannels: boolean = false): ImageData {
  const data = new Uint8ClampedArray(baseImageData.data);
  const binaryMessage = Array.from(message)
    .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('') + '00000000'; // Null terminator

  if (syncChannels) {
    if (binaryMessage.length > (data.length / 4)) {
      throw new Error('Message too long for grayscale capacity (1 bit per pixel).');
    }
  } else {
    if (binaryMessage.length > data.length * 0.75) {
      throw new Error('Message too long for color capacity.');
    }
  }

  let bitIndex = 0;
  if (syncChannels) {
    for (let i = 0; i < data.length && bitIndex < binaryMessage.length; i += 4) {
      const bit = parseInt(binaryMessage[bitIndex], 10);
      data[i] = (data[i] & 0xFE) | bit;
      data[i + 1] = (data[i + 1] & 0xFE) | bit;
      data[i + 2] = (data[i + 2] & 0xFE) | bit;
      bitIndex++;
    }
  } else {
    for (let i = 0; i < data.length && bitIndex < binaryMessage.length; i++) {
      if ((i + 1) % 4 === 0) continue;
      data[i] = (data[i] & 0xFE) | parseInt(binaryMessage[bitIndex], 10);
      bitIndex++;
    }
  }

  return new ImageData(data, baseImageData.width, baseImageData.height);
}

/**
 * Decodes a hidden text message from the LSBs of an image.
 */
export function decodeLSB(stegoImageData: ImageData): string {
  const data = stegoImageData.data;
  let binaryMessage = '';
  let chars = '';

  for (let i = 0; i < data.length; i++) {
    if ((i + 1) % 4 === 0) continue;

    binaryMessage += (data[i] & 1).toString();

    if (binaryMessage.length === 8) {
      const charCode = parseInt(binaryMessage, 2);
      if (charCode === 0) break; // Null terminator
      chars += String.fromCharCode(charCode);
      binaryMessage = '';
    }
    
    // Safety break
    if (chars.length > 20000) break;
  }

  return chars;
}

/**
 * Extracts a specific bit plane (0-7) for an image.
 * Plane 0 is the Least Significant Bit.
 */
export function extractBitPlane(sourceImageData: ImageData, plane: number): ImageData {
  const data = new Uint8ClampedArray(sourceImageData.data);
  const bitMask = 1 << plane;

  for (let i = 0; i < data.length; i++) {
    if ((i + 1) % 4 === 0) continue; // Skip alpha

    // If bit is set, make it full intensity (255), else 0
    const bitValue = (data[i] & bitMask) ? 255 : 0;
    data[i] = bitValue;
  }

  return new ImageData(data, sourceImageData.width, sourceImageData.height);
}

/**
 * Applies a basic high-pass filter (Laplacian) to reveal noise/edges.
 * Useful for visual steganalysis of adaptive steganography.
 */
export function applyHighPassFilter(sourceImageData: ImageData): ImageData {
  const { width, height, data } = sourceImageData;
  const output = new Uint8ClampedArray(data.length);
  const kernel = [
    0, -1, 0,
    -1, 4, -1,
    0, -1, 0
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) { // RGB
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelPos = ((y + ky) * width + (x + kx)) * 4 + c;
            const kernelPos = (ky + 1) * 3 + (kx + 1);
            sum += data[pixelPos] * kernel[kernelPos];
          }
        }
        const idx = (y * width + x) * 4 + c;
        // Normalize and boost for visibility
        output[idx] = Math.min(255, Math.max(0, sum * 2 + 128));
      }
      // Keep Alpha
      output[(y * width + x) * 4 + 3] = 255;
    }
  }

  return new ImageData(output, width, height);
}

/**
 * Perform Discrete Cosine Transform (DCT) on an 8x8 block.
 * Used for frequency-domain steganography.
 */
export function dct8(block: number[]): number[] {
  const result = new Array(64).fill(0);
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          sum += block[x * 8 + y] *
            Math.cos(((2 * x + 1) * u * Math.PI) / 16) *
            Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        }
      }
      result[u * 8 + v] = 0.25 * cu * cv * sum;
    }
  }
  return result;
}

/**
 * Perform Inverse Discrete Cosine Transform (IDCT) on an 8x8 block.
 */
export function idct8(coeffs: number[]): number[] {
  const result = new Array(64).fill(0);
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
          const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
          const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
          sum += cu * cv * coeffs[u * 8 + v] *
            Math.cos(((2 * x + 1) * u * Math.PI) / 16) *
            Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        }
      }
      result[x * 8 + y] = 0.25 * sum;
    }
  }
  return result;
}

/**
 * Encodes a message using DCT steganography.
 * Hides bits in mid-frequency AC coefficients of 8x8 blocks.
 * syncChannels ensures all RGB channels are modified identically to maintain grayscale.
 */
export function encodeDCT(baseImageData: ImageData, message: string, syncChannels: boolean = false): ImageData {
  const { width, height, data } = baseImageData;
  const output = new Uint8ClampedArray(data);
  const binaryMessage = Array.from(message)
    .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('') + '00000000';

  let bitIndex = 0;
  const targetCoeff = 18; 

  for (let y = 0; y < height - 7; y += 8) {
    for (let x = 0; x < width - 7; x += 8) {
      if (bitIndex >= binaryMessage.length) break;

      // Extract block (use specific channel or avg if sync)
      const block = new Array(64);
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const idx = ((y + i) * width + (x + j)) * 4;
          if (syncChannels) {
            block[i * 8 + j] = (data[idx] + data[idx+1] + data[idx+2]) / 3;
          } else {
            block[i * 8 + j] = data[idx]; // Red channel default
          }
        }
      }

      const coeffs = dct8(block);
      const bit = parseInt(binaryMessage[bitIndex], 10);
      const val = Math.round(coeffs[targetCoeff]);
      coeffs[targetCoeff] = (val & ~1) | bit;

      const reconstructed = idct8(coeffs);
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const idx = ((y + i) * width + (x + j)) * 4;
          const pixelVal = Math.min(255, Math.max(0, reconstructed[i * 8 + j]));
          if (syncChannels) {
            output[idx] = pixelVal;
            output[idx + 1] = pixelVal;
            output[idx + 2] = pixelVal;
          } else {
            output[idx] = pixelVal;
          }
        }
      }
      
      bitIndex++;
    }
    if (bitIndex >= binaryMessage.length) break;
  }

  return new ImageData(output, width, height);
}

/**
 * Decodes a message hidden in the DCT coefficients of an image.
 */
export function decodeDCT(stegoImageData: ImageData): string {
  const { width, height, data } = stegoImageData;
  let binaryMessage = '';
  let chars = '';
  const targetCoeff = 18;

  for (let y = 0; y < height - 7; y += 8) {
    for (let x = 0; x < width - 7; x += 8) {
      // Process Red Channel
      const block = new Array(64);
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          block[i * 8 + j] = data[((y + i) * width + (x + j)) * 4];
        }
      }

      const coeffs = dct8(block);
      const val = Math.round(coeffs[targetCoeff]);
      binaryMessage += (val & 1).toString();

      if (binaryMessage.length === 8) {
        const charCode = parseInt(binaryMessage, 2);
        if (charCode === 0) return chars; // Null terminator
        chars += String.fromCharCode(charCode);
        binaryMessage = '';
      }

      if (chars.length > 5000) return chars;
    }
  }

  return chars;
}

/**
 * Extracts raw statistical entropy from DCT coefficients.
 * This skips ASCII decoding and returns a hex string of the raw bits.
 */
export function extractRawDCTEntropy(stegoImageData: ImageData, length: number = 64): string {
  const { width, height, data } = stegoImageData;
  let bits = '';
  const targetCoeff = 18;

  for (let y = 0; y < height - 7; y += 8) {
    for (let x = 0; x < width - 7; x += 8) {
      const block = new Array(64);
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          block[i * 8 + j] = data[((y + i) * width + (x + j)) * 4];
        }
      }

      const coeffs = dct8(block);
      const val = Math.round(coeffs[targetCoeff]);
      bits += (val & 1).toString();

      if (bits.length >= length * 8) break;
    }
    if (bits.length >= length * 8) break;
  }

  // Convert bits to Hex
  let hex = '';
  for (let i = 0; i < bits.length; i += 8) {
    const byte = bits.substring(i, i + 8);
    hex += parseInt(byte, 2).toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

/**
 * Extracts raw bits from LSB plane 0 into a hex-encoded entropy string.
 */
export function extractRawLSBEntropy(stegoImageData: ImageData, length: number = 64): string {
  const data = stegoImageData.data;
  let bits = '';

  for (let i = 0; i < data.length && bits.length < length * 8; i++) {
    if ((i + 1) % 4 === 0) continue;
    bits += (data[i] & 1).toString();
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 8) {
    const byte = bits.substring(i, i + 8);
    hex += parseInt(byte, 2).toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

/**
 * Optimizes an image for transmission.
 * If it's too large, it compresses without losing LSB integrity if possible,
 * or switches to JPEG for max efficiency if LSB isn't the primary goal.
 */
export async function optimizeImageForSecureComm(dataUrl: string, maxDim = 1600, maxFileSize = 10000000): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round(height * maxDim / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round(width * maxDim / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("CANVAS_CTX_FAIL"));
      ctx.drawImage(img, 0, 0, width, height);

      // Check size. Always prefer PNG for steganography integrity.
      // If still too large, we downscale further rather than switching to lossy JPEG.
      canvas.toBlob((blob) => {
        if (blob && blob.size <= maxFileSize) {
          blob.arrayBuffer().then(resolve);
        } else {
          // Downscale further (600px) as a last resort to keep PNG
          const scaleFactor = 0.75;
          const tinyCanvas = document.createElement('canvas');
          tinyCanvas.width = Math.round(width * scaleFactor);
          tinyCanvas.height = Math.round(height * scaleFactor);
          const tinyCtx = tinyCanvas.getContext('2d');
          if (tinyCtx) {
            tinyCtx.drawImage(img, 0, 0, tinyCanvas.width, tinyCanvas.height);
            tinyCanvas.toBlob((tinyBlob) => {
              if (tinyBlob) tinyBlob.arrayBuffer().then(resolve);
              else reject(new Error("RESIZE_FAIL"));
            }, 'image/png');
          } else {
            reject(new Error("TINY_CTX_FAIL"));
          }
        }
      }, 'image/png');
    };
    img.onerror = (e) => reject(new Error(`IMG_LOAD_FAIL: ${e}`));
    img.src = dataUrl;
  });
}
