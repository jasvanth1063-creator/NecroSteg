from PIL import Image
import numpy as np

def encode_lsb(image_path, message, output_path):
    """Encodes a message into the Least Significant Bit of an image."""
    img = Image.open(image_path).convert('RGB')
    data = np.array(img)
    
    # Message to binary (+ Null terminator)
    binary_message = ''.join(format(ord(c), '08b') for c in message) + '00000000'
    
    if len(binary_message) > data.size:
        raise ValueError("Message too large for image capacity.")
        
    flat_data = data.flatten()
    for i, bit in enumerate(binary_message):
        # Clear LSB and set new bit
        flat_data[i] = (flat_data[i] & ~1) | int(bit)
        
    encoded_data = flat_data.reshape(data.shape)
    Image.fromarray(encoded_data).save(output_path)
    print(f"File saved to: {output_path}")

def decode_lsb(image_path):
    """Extracts a message from the Least Significant Bit of an image."""
    img = Image.open(image_path).convert('RGB')
    data = np.array(img).flatten()
    
    binary_message = ""
    for b in data:
        binary_message += str(b & 1)
        if len(binary_message) >= 8 and len(binary_message) % 8 == 0:
            char_code = int(binary_message[-8:], 2)
            if char_code == 0: # Null terminator
                break
                
    message = ""
    for i in range(0, len(binary_message), 8):
        byte = binary_message[i:i+8]
        char_code = int(byte, 2)
        if char_code == 0: break
        message += chr(char_code)
    return message

def extract_bit_plane(image_path, plane=0):
    """Extracts a specific bit plane (0-7). plane 0 is LSB."""
    img = Image.open(image_path).convert('RGB')
    data = np.array(img)
    
    # Extract bit and scale to 0/255 for visibility
    bit_data = (data >> plane) & 1
    visual_data = (bit_data * 255).astype(np.uint8)
    
    return Image.fromarray(visual_data)

if __name__ == "__main__":
    print("--- SteganoAnalyzer Research Script ---")
    print("Algorithm: LSB Spatial Domain")
    print("Requirements: pip install pillow numpy")
