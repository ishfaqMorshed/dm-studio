"""Measure Sunburst probe outputs against the parent design.

For each output: size, global shift (phase correlation on the area OUTSIDE the box), colour offset, drift outside the
box (after shift + colour correction), how much changed inside the box, red-marker leakage, overflow into a ring around
the box, and a simulated "locked outside" composite (align, colour-match, feathered ring, original beyond the ring)
with the seam ratio at the box edge and ring edge. Writes a side-by-side contact sheet per case.
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw

R = os.path.dirname(os.path.abspath(__file__))
REGION = os.path.dirname(R)
cases = json.load(open(os.path.join(R, 'cases.json')))
VARIANTS = ['A_mask', 'B_marked', 'C_words']


def load(p, size=None):
    im = Image.open(p).convert('RGB')
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def phase_shift(a, b, mask):
    """Integer (dy, dx) such that b(y, x) ~ a(y - dy, x - dx), estimated on masked (outside-box) area."""
    ga = (a.mean(2) * mask); gb = (b.mean(2) * mask)
    ga -= ga[mask > 0].mean(); gb -= gb[mask > 0].mean()
    ga *= mask; gb *= mask
    F = np.fft.fft2(ga); G = np.fft.fft2(gb)
    Rr = G * np.conj(F); Rr /= np.abs(Rr) + 1e-6
    r = np.fft.ifft2(Rr).real
    dy, dx = np.unravel_index(np.argmax(r), r.shape)
    H, W = r.shape
    if dy > H // 2: dy -= H
    if dx > W // 2: dx -= W
    return int(dy), int(dx)


def shift(img, dy, dx):
    out = np.roll(np.roll(img, -dy, axis=0), -dx, axis=1)
    return out


def border_jump(img, x0, y0, x1, y1, band=2):
    """Mean abs colour difference across the rectangle border (inside band vs outside band)."""
    j = []
    H, W = img.shape[:2]
    if y0 - band >= 0: j.append(np.abs(img[y0:y0 + band, x0:x1] - img[y0 - band:y0, x0:x1]).sum(2).mean())
    if y1 + band <= H: j.append(np.abs(img[y1 - band:y1, x0:x1] - img[y1:y1 + band, x0:x1]).sum(2).mean())
    if x0 - band >= 0: j.append(np.abs(img[y0:y1, x0:x0 + band] - img[y0:y1, x0 - band:x0]).sum(2).mean())
    if x1 + band <= W: j.append(np.abs(img[y0:y1, x1 - band:x1] - img[y0:y1, x1:x1 + band]).sum(2).mean())
    return float(np.mean(j))


results = {}
for cid, c in cases.items():
    par = load(os.path.join(REGION, f'{cid}_parent.png'))
    H, W = par.shape[:2]
    r = c['rect']; x0, y0, x1, y1 = r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']
    ring = max(8, round(0.03 * W))
    outside = np.ones((H, W), np.float32); outside[max(0, y0 - ring):y1 + ring, max(0, x0 - ring):x1 + ring] = 0
    sheet_cells = []
    for v in VARIANTS:
        p = os.path.join(R, 'out', f'{cid}_{v}_out.png')
        if not os.path.exists(p):
            results[f'{cid}_{v}'] = {'missing': True}; continue
        raw_im = Image.open(p).convert('RGB'); raw_size = raw_im.size
        out = load(p, (W, H))
        dy, dx = phase_shift(par, out, outside)
        al = shift(out, dy, dx)
        offset = ((al - par) * outside[..., None]).sum((0, 1)) / outside.sum()
        offset = np.clip(offset, -16, 16)
        alc = np.clip(al - offset, 0, 255)
        d = np.abs(alc - par).max(2)
        o = outside > 0
        drift8 = float((d[o] > 8).mean() * 100); drift20 = float((d[o] > 20).mean() * 100)
        inside = np.zeros((H, W), bool); inside[y0:y1, x0:x1] = True
        changed_in = float((np.abs(alc - par).max(2)[inside] > 20).mean() * 100)
        ring_only = np.zeros((H, W), bool); ring_only[max(0, y0 - ring):y1 + ring, max(0, x0 - ring):x1 + ring] = True; ring_only &= ~inside
        overflow = float((np.abs(alc - par).max(2)[ring_only] > 40).mean() * 100)
        red = (alc[..., 0] > 200) & (alc[..., 1] < 60) & (alc[..., 2] < 60)
        red_par = (par[..., 0] > 200) & (par[..., 1] < 60) & (par[..., 2] < 60)
        red_new = float(((red & ~red_par)[ring_only]).mean() * 100)
        # simulated locked-outside composite: new pixels inside box, linear fade across ring, original beyond
        yy, xx = np.mgrid[0:H, 0:W]
        dist = np.maximum(np.maximum(x0 - xx, xx - (x1 - 1)), np.maximum(y0 - yy, yy - (y1 - 1)))
        alpha = np.clip(1 - dist / ring, 0, 1); alpha[inside] = 1
        comp = alc * alpha[..., None] + par * (1 - alpha[..., None])
        beyond = dist >= ring
        beyond_diff = int((np.abs(comp - par).max(2)[beyond] > 0.5).sum())
        seam_box = border_jump(comp, x0, y0, x1, y1) / max(1e-6, border_jump(par, x0, y0, x1, y1))
        seam_ring = border_jump(comp, max(0, x0 - ring), max(0, y0 - ring), min(W, x1 + ring), min(H, y1 + ring)) / max(1e-6, border_jump(par, max(0, x0 - ring), max(0, y0 - ring), min(W, x1 + ring), min(H, y1 + ring)))
        results[f'{cid}_{v}'] = {
            'raw_size': list(raw_size), 'shift_dy_dx': [dy, dx], 'colour_offset_rgb': [round(float(x), 1) for x in offset],
            'drift_outside_pct_gt8': round(drift8, 1), 'drift_outside_pct_gt20': round(drift20, 1),
            'changed_inside_box_pct': round(changed_in, 1), 'overflow_ring_pct_gt40': round(overflow, 1), 'red_marker_in_ring_pct': round(red_new, 2),
            'composite_beyond_ring_changed_px': beyond_diff, 'composite_seam_ratio_box': round(seam_box, 2), 'composite_seam_ratio_ring': round(seam_ring, 2),
        }
        Image.fromarray(comp.astype(np.uint8)).save(os.path.join(R, 'out', f'{cid}_{v}_composite.png'))
        sheet_cells.append((v, out, comp))
    # contact sheet: crop box + margin; parent | raw (per variant) | composite (per variant)
    m = 60
    cx0, cy0, cx1, cy1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
    def crop(a): return Image.fromarray(a[cy0:cy1, cx0:cx1].astype(np.uint8))
    tiles = [('parent', crop(par))] + [(f'{v} raw', crop(o)) for v, o, _ in sheet_cells] + [(f'{v} locked', crop(cp)) for v, _, cp in sheet_cells]
    tw, th = tiles[0][1].size
    cols = 1 + len(sheet_cells)
    sheet = Image.new('RGB', (tw * cols, (th + 18) * 2), (255, 255, 255)); dr = ImageDraw.Draw(sheet)
    for i, (label, t) in enumerate(tiles):
        col = 0 if i == 0 else ((i - 1) % len(sheet_cells)) + 1
        row = 0 if i == 0 or i <= len(sheet_cells) else 1
        if i == 0: row = 0
        sheet.paste(t, (col * tw, row * (th + 18) + 18)); dr.text((col * tw + 4, row * (th + 18) + 3), label, fill=(0, 0, 0))
    sheet.save(os.path.join(R, 'out', f'{cid}_sheet.png'))

json.dump(results, open(os.path.join(R, 'out', 'results.json'), 'w'), indent=1)
for k, v in results.items():
    print(k, v)
