"""Génère les icônes PNG PWA (192 et 512) sans dépendance externe."""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def render(size: int) -> bytes:
    c = size / 2
    s = size / 512
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            dx, dy = x - c, y - c
            d = math.hypot(dx, dy) / s
            r, g, b = 5, 5, 5
            ang = (math.degrees(math.atan2(dx, -dy)) + 360) % 360
            if d < 190 and 20 <= ang <= 90:
                r, g, b = 0, 70, 50  # balayage radar
            for ring, col in ((190, (0, 255, 255)), (125, (0, 150, 150)), (60, (0, 255, 153))):
                if abs(d - ring) < 4:
                    r, g, b = col
            if (abs(dx) < 3 * s or abs(dy) < 3 * s) and 60 < d < 190:
                r, g, b = 0, 255, 153  # réticule
            if d < 12:
                r, g, b = 255, 59, 48
            row += bytes((r, g, b))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


for n in (192, 512):
    (OUT / f"icon-{n}.png").write_bytes(render(n))
    print("ok", n)
