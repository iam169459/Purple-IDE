#!/usr/bin/env python3
"""Generate app icons from the SVG logo."""
import struct
import zlib
import os, sys

def create_png(width, height, pixels):
    """Create a minimal PNG from raw RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))

    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        for x in range(width):
            idx = (y * width + x) * 4
            raw += bytes(pixels[idx:idx+4])
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def generate_logo_pixels(size):
    """Generate the Purple IDE logo as RGBA pixel array."""
    pixels = []
    cx, cy = size // 2, size // 2
    r = size * 0.42
    margin = size * 0.08
    for y in range(size):
        for x in range(size):
            # Check if pixel is inside the rounded rect
            dx = x - cx
            dy = y - cy
            hw = r  # half width
            hh = r * 0.75  # half height
            corner_r = size * 0.12
            
            # Rect bounds
            left = cx - hw
            right = cx + hw
            top = cy - hh
            bottom = cy + hh
            
            if left <= x <= right and top <= y <= bottom:
                # Check corners
                in_corner = True
                if x < left + corner_r and y < top + corner_r:
                    dxc = x - (left + corner_r)
                    dyc = y - (top + corner_r)
                    in_corner = dxc*dxc + dyc*dyc <= corner_r*corner_r
                elif x > right - corner_r and y < top + corner_r:
                    dxc = x - (right - corner_r)
                    dyc = y - (top + corner_r)
                    in_corner = dxc*dxc + dyc*dyc <= corner_r*corner_r
                elif x < left + corner_r and y > bottom - corner_r:
                    dxc = x - (left + corner_r)
                    dyc = y - (bottom - corner_r)
                    in_corner = dxc*dxc + dyc*dyc <= corner_r*corner_r
                elif x > right - corner_r and y > bottom - corner_r:
                    dxc = x - (right - corner_r)
                    dyc = y - (bottom - corner_r)
                    in_corner = dxc*dxc + dyc*dyc <= corner_r*corner_r
                
                if in_corner:
                    pixels.extend([0x8b, 0x5c, 0xf6, 255])  # Purple fill
                else:
                    pixels.extend([0, 0, 0, 0])
            else:
                pixels.extend([0, 0, 0, 0])

    # Draw white "P" shape centered
    p_center_x = cx
    p_center_y = cy
    p_width = size * 0.18
    p_height = size * 0.42
    bar_width = size * 0.09
    
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            if pixels[idx + 3] == 0:
                continue
            
            lx = x - p_center_x
            ly = y - p_center_y
            half_w = p_width // 2
            half_h = p_height // 2
            bw = bar_width // 2
            
            in_p = False
            # Vertical bar of P
            if -bw <= lx <= bw and -half_h <= ly <= half_h:
                in_p = True
            # Top loop of P
            if bw <= lx <= half_w and -half_h <= ly <= -half_h * 0.2:
                in_p = True
            # Right side of P loop (semicircle)
            if bw <= lx <= half_w:
                ly_range = -half_h * 0.2
                if ly <= ly_range and ly >= -half_h:
                    # Simple rectangle for the loop
                    in_p = True
            
            if in_p:
                pixels[idx:idx+4] = [255, 255, 255, 255]
    
    return pixels

if __name__ == '__main__':
    sizes = {
        'icon_16x16.png': 16,
        'icon_32x32.png': 32,
        'icon_128x128.png': 128,
        'icon_256x256.png': 256,
        'icon_512x512.png': 512,
    }
    
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'build')
    os.makedirs(out_dir, exist_ok=True)
    
    png_dir = os.path.join(out_dir, 'icons')
    os.makedirs(png_dir, exist_ok=True)
    
    for name, size in sizes.items():
        pixels = generate_logo_pixels(size)
        data = create_png(size, size, pixels)
        path = os.path.join(png_dir, name)
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  Created {path} ({size}x{size})')
    
    # Create icon.icns for macOS
    icon_path = os.path.join(out_dir, 'icon.icns')
    # ICNS is complex, just copy the 512x512 as PNG reference
    import shutil
    shutil.copy(os.path.join(png_dir, 'icon_512x512.png'), os.path.join(out_dir, 'icon.png'))
    
    # Create iconset for macOS
    iconset_dir = os.path.join(out_dir, 'icon.iconset')
    os.makedirs(iconset_dir, exist_ok=True)
    for name, size in sizes.items():
        shutil.copy(
            os.path.join(png_dir, name),
            os.path.join(iconset_dir, name)
        )
    
    print(f'\nIcons generated in {out_dir}/')
    print('To create .icns: iconutil -c icns build/icon.iconset')
