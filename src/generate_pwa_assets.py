import os, struct, zlib, json

def make_png_scales(size, maskable=False):
    # Generates a PNG with teal gradient and a crisp scales of justice icon
    width, height = size, size
    raw = bytearray()
    
    # Scale icon features relative to size
    cx = width / 2.0
    cy = height / 2.0
    scale = width / 512.0
    
    for y in range(height):
        row = bytearray([0]) # Filter type 0
        ny = y / float(height)
        for x in range(width):
            nx = x / float(width)
            
            # Gradient background from teal (#0f766e) to dark teal (#115e59)
            base_r = int(15 + (17 - 15) * ny)
            base_g = int(118 + (94 - 118) * ny)
            base_b = int(110 + (89 - 110) * ny)
            
            # Rounded corners for non-maskable icons
            if not maskable:
                r_corner = width * 0.18
                dx = min(x, width - 1 - x)
                dy = min(y, height - 1 - y)
                if dx < r_corner and dy < r_corner:
                    dist = ((r_corner - dx)**2 + (r_corner - dy)**2)**0.5
                    if dist > r_corner:
                        # transparent pixel outside rounded squircle
                        row.extend([0, 0, 0, 0])
                        continue
            
            # Draw Scales of Justice in Gold/White inside safe zone
            # Vertical central pillar
            px = x - cx
            py = y - cy
            
            is_gold = False
            is_white = False
            
            # Central column
            if abs(px) <= 6 * scale and -120 * scale <= py <= 130 * scale:
                is_gold = True
            # Base of pillar
            elif abs(px) <= 70 * scale and 130 * scale <= py <= 150 * scale:
                is_gold = True
            # Top cap
            elif (px**2 + (py + 120 * scale)**2) <= (16 * scale)**2:
                is_gold = True
            # Balance beam (horizontal bar)
            elif abs(py + 90 * scale) <= 5 * scale and abs(px) <= 160 * scale:
                is_gold = True
            # Left balance pan strings
            elif (-160 * scale <= px <= -80 * scale) and (abs((py + 90 * scale) - (abs(px + 120 * scale) * 1.5)) <= 3 * scale):
                is_white = True
            # Left pan (dish)
            elif abs(px + 120 * scale) <= 45 * scale and abs(py + 30 * scale) <= 6 * scale:
                is_gold = True
            # Right balance pan strings
            elif (80 * scale <= px <= 160 * scale) and (abs((py + 90 * scale) - (abs(px - 120 * scale) * 1.5)) <= 3 * scale):
                is_white = True
            # Right pan (dish)
            elif abs(px - 120 * scale) <= 45 * scale and abs(py + 30 * scale) <= 6 * scale:
                is_gold = True
            
            if is_gold:
                # Gold metallic color: #fef08a / #f59e0b
                row.extend([254, 240, 138, 255])
            elif is_white:
                row.extend([255, 255, 255, 230])
            else:
                row.extend([base_r, base_g, base_b, 255])
        raw.extend(row)
        
    compressed = zlib.compress(bytes(raw))
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0) # RGBA
    png += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    return bytes(png)

# Generate icon files in public/icons and icons
sizes = [(192, 'icon-192.png', False), (512, 'icon-512.png', False), (512, 'icon-maskable-512.png', True), (180, 'apple-touch-icon.png', False)]

for d in ['public/icons', 'icons']:
    os.makedirs(d, exist_ok=True)
    for sz, fname, maskable in sizes:
        png_data = make_png_scales(sz, maskable)
        with open(os.path.join(d, fname), 'wb') as f:
            f.write(png_data)

# SVG Icon
svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#115e59"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" fill="url(#tealGrad)"/>
  <!-- Central Pillar -->
  <rect x="250" y="136" width="12" height="250" rx="6" fill="url(#goldGrad)"/>
  <rect x="186" y="386" width="140" height="20" rx="10" fill="url(#goldGrad)"/>
  <circle cx="256" cy="136" r="16" fill="url(#goldGrad)"/>
  <!-- Beam -->
  <rect x="96" y="166" width="320" height="10" rx="5" fill="url(#goldGrad)"/>
  <!-- Left Pan Strings & Dish -->
  <path d="M96 176 L136 286 M176 176 L136 286" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <path d="M90 286 Q136 320 182 286 Z" fill="url(#goldGrad)"/>
  <!-- Right Pan Strings & Dish -->
  <path d="M336 176 L376 286 M416 176 L376 286" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <path d="M330 286 Q376 320 422 286 Z" fill="url(#goldGrad)"/>
</svg>"""

with open('public/icon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)
with open('public/icons/icon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)
with open('icons/icon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)

# Web App Manifest
manifest_data = {
    "id": "/",
    "name": "برائت - سامانه جامع حقوقی",
    "short_name": "برائت",
    "description": "پایگاه قوانین، مقالات پژوهشی، مواعد قانونی و برنامه‌ریزی حقوقی برائت",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "orientation": "portrait",
    "dir": "rtl",
    "lang": "fa",
    "theme_color": "#0f766e",
    "background_color": "#f8fafc",
    "icons": [
        {
            "src": "/icons/icon-192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any"
        },
        {
            "src": "/icons/icon-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any"
        },
        {
            "src": "/icons/icon-maskable-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable"
        }
    ]
}

for path in ['manifest.json', 'public/manifest.json']:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)

print("Icons and Manifest created successfully!")
