# Generates the bundled custom emoji set (128x128 PNG). Run: python3 scripts/make_emojis.py
import math, os
from PIL import Image, ImageDraw

S = 512  # draw big, downsample for smooth edges
OUT = os.path.join(os.path.dirname(__file__), '..', 'emojis')
os.makedirs(OUT, exist_ok=True)
W = (255, 255, 255, 255)

def canvas(color):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((8, 8, S - 8, S - 8), fill=color)
    return im, d

def save(im, name):
    im.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, name + '.png'))

def pts(*p): return [(x * S / 100, y * S / 100) for x, y in p]

def make(name, color, glyph):
    im, d = canvas(color)
    glyph(d)
    save(im, name)

def play(d): d.polygon(pts((38, 28), (38, 72), (74, 50)), fill=W)
def pause(d):
    d.rounded_rectangle(pts((33, 28), (46, 72)), 18, fill=W)
    d.rounded_rectangle(pts((54, 28), (67, 72)), 18, fill=W)
def stop(d): d.rounded_rectangle(pts((32, 32), (68, 68)), 20, fill=W)
def skip(d):
    d.polygon(pts((30, 30), (30, 70), (58, 50)), fill=W)
    d.rounded_rectangle(pts((62, 30), (72, 70)), 10, fill=W)
def previous(d):
    d.polygon(pts((70, 30), (70, 70), (42, 50)), fill=W)
    d.rounded_rectangle(pts((28, 30), (38, 70)), 10, fill=W)
def shuffle(d):
    w = 28
    d.line(pts((26, 34), (44, 34), (56, 66), (68, 66)), fill=W, width=w // 2, joint='curve')
    d.line(pts((26, 66), (44, 66), (56, 34), (68, 34)), fill=W, width=w // 2, joint='curve')
    d.polygon(pts((66, 56), (66, 76), (80, 66)), fill=W)
    d.polygon(pts((66, 24), (66, 44), (80, 34)), fill=W)
def loop(d):
    d.arc(pts((28, 28), (72, 72)), 40, 330, fill=W, width=34)
    d.polygon(pts((58, 18), (58, 44), (80, 31)), fill=W)
def volume(d):
    d.polygon(pts((26, 42), (38, 42), (52, 30), (52, 70), (38, 58), (26, 58)), fill=W)
    d.arc(pts((46, 36), (68, 64)), -50, 50, fill=W, width=18)
    d.arc(pts((44, 26), (82, 74)), -50, 50, fill=W, width=18)
def music(d):
    d.ellipse(pts((28, 56), (50, 74)), fill=W)
    d.rectangle(pts((46, 28), (52, 66)), fill=W)
    d.polygon(pts((50, 28), (72, 36), (72, 48), (50, 40)), fill=W)
def queue(d):
    for y in (32, 48, 64):
        d.rounded_rectangle(pts((38, y - 4), (74, y + 4)), 10, fill=W)
        d.ellipse(pts((26, y - 4), (34, y + 4)), fill=W)
def like(d):
    d.ellipse(pts((26, 30), (52, 58)), fill=W)
    d.ellipse(pts((48, 30), (74, 58)), fill=W)
    d.polygon(pts((27, 48), (73, 48), (50, 76)), fill=W)
def error(d):
    d.line(pts((32, 32), (68, 68)), fill=W, width=44)
    d.line(pts((68, 32), (32, 68)), fill=W, width=44)
def success(d): d.line(pts((29, 52), (44, 66), (72, 34)), fill=W, width=48, joint='curve')
def search(d):
    d.ellipse(pts((26, 24), (60, 58)), outline=W, width=36)
    d.line(pts((56, 56), (74, 74)), fill=W, width=44)
def filt(d):
    for y, x in ((32, 60), (50, 38), (68, 56)):
        d.line(pts((26, y), (74, y)), fill=W, width=22)
        d.ellipse(pts((x - 7, y - 7), (x + 7, y + 7)), fill=(30, 30, 30, 255), outline=W, width=12)
def clock(d):
    d.ellipse(pts((24, 24), (76, 76)), outline=W, width=30)
    d.line(pts((50, 50), (50, 34)), fill=W, width=26)
    d.line(pts((50, 50), (62, 56)), fill=W, width=26)

JOBS = [
    ('play', (29, 185, 84, 255), play), ('pause', (255, 159, 28, 255), pause),
    ('stop', (231, 76, 60, 255), stop), ('skip', (52, 152, 219, 255), skip),
    ('previous', (52, 152, 219, 255), previous), ('shuffle', (155, 89, 182, 255), shuffle),
    ('loop', (26, 188, 156, 255), loop), ('volume', (241, 196, 15, 255), volume),
    ('music', (233, 30, 99, 255), music), ('queue', (96, 125, 139, 255), queue),
    ('like', (233, 30, 99, 255), like), ('error', (192, 57, 43, 255), error),
    ('success', (39, 174, 96, 255), success), ('search', (41, 128, 185, 255), search),
    ('filter', (142, 68, 173, 255), filt), ('clock', (127, 140, 141, 255), clock),
]
for n, c, g in JOBS: make(n, c, g)
print('generated', len(JOBS), 'emojis')
