"""Turn recorded screencast frames into the walkthrough MP4, a poster and contact sheets.

    python3 scripts/video/encode.py --out video-build [--sheets] [--poster-chapter 4]
Writes <out>/readaroo-walkthrough.mp4, <out>/readaroo-walkthrough-poster.jpg and, with --sheets,
<out>/sheets/sheet-NN.jpg (4 frames each, ~3 s after every chapter start) for checking before publishing.
"""
import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path


def load(out):
    tl = json.loads(Path(out, 'timeline.json').read_text())
    ch = json.loads(Path(out, 'chapters.json').read_text())
    return tl, ch


def frame_times(tl):
    """[(file, video_t, duration)] honouring segment boundaries."""
    frames = tl['frames']
    res, offset = [], 0.0
    for seg in tl['segments']:
        fs = [f for i, f in enumerate(frames, 1) if seg['first'] <= i <= seg['last']]
        for j, f in enumerate(fs):
            nxt = fs[j + 1]['t'] if j + 1 < len(fs) else seg['end']
            res.append((f['file'], offset + (f['t'] - seg['start']), max(0.001, nxt - f['t'])))
        offset += seg['end'] - seg['start']
    return res, offset


def frame_at(ft, t):
    best = ft[0][0]
    for f, vt, _ in ft:
        if vt <= t:
            best = f
        else:
            break
    return best


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='video-build')
    ap.add_argument('--sheets', action='store_true')
    ap.add_argument('--poster-chapter', type=int, default=4)
    ap.add_argument('--name', default='readaroo-walkthrough')
    a = ap.parse_args()
    out = Path(a.out)
    tl, ch = load(out)
    ft, total = frame_times(tl)
    fdir = out / 'frames'

    if a.sheets:
        sd = out / 'sheets'
        shutil.rmtree(sd, ignore_errors=True)
        sd.mkdir()
        picks = [frame_at(ft, c['t'] + 3.0) for c in ch]
        for i in range(0, len(picks), 4):
            group = picks[i:i + 4]
            while len(group) < 4:
                group.append(group[-1])
            ins = sum((['-i', str(fdir / g)] for g in group), [])
            run(['ffmpeg', '-y', *ins, '-filter_complex',
                 '[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1280:-1', str(sd / f'sheet-{i // 4 + 1:02d}.jpg')])
        print(f'{len(picks)} chapter frames in {sd}')

    lines = ['ffconcat version 1.0']
    for f, _, d in ft:
        lines += [f"file 'frames/{f}'", f'duration {d:.4f}']
    lines.append(f"file 'frames/{ft[-1][0]}'")
    (out / 'frames.ffconcat').write_text('\n'.join(lines) + '\n')
    part = out / f'{a.name}.part.mp4'
    final = out / f'{a.name}.mp4'
    run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(out / 'frames.ffconcat'),
         '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
         '-movflags', '+faststart', '-an', str(part)])
    os.replace(part, final)
    pc = next((c for c in ch if c['n'] == a.poster_chapter), ch[0])
    shutil.copy(fdir / frame_at(ft, pc['t'] + 6.0), out / f'{a.name}-poster.jpg')
    print(f'{final} ({final.stat().st_size / 1e6:.1f} MB, {total:.1f}s)')


if __name__ == '__main__':
    main()
