import os, sys
from PIL import Image, ImageDraw, ImageFont
X = sys.argv[1]
os.makedirs(f'{X}/compare', exist_ok=True)
try:
    F = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 22)
except Exception:
    F = ImageFont.load_default()
for n in sorted(os.listdir(f'{X}/after')):
    if not n.endswith('.png'): continue
    b, a = Image.open(f'{X}/before/{n}').convert('RGB'), Image.open(f'{X}/after/{n}').convert('RGB')
    gap, top = 24, 44
    W = b.width + a.width + gap
    out = Image.new('RGB', (W, max(b.height, a.height) + top), (40, 49, 57))
    out.paste(b, (0, top)); out.paste(a, (b.width + gap, top))
    d = ImageDraw.Draw(out)
    d.text((12, 10), '변경 전', fill='white', font=F); d.text((b.width + gap + 12, 10), '변경 후', fill='white', font=F)
    base = n[:-4]
    for q in (80, 70, 60, 50):
        p = f'{X}/compare/{base}.webp'; out.save(p, 'WEBP', quality=q, method=6)
        if os.path.getsize(p) < 1_000_000: break
    print(base, out.size, os.path.getsize(p) // 1024, 'KB')
