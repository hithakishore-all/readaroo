#!/usr/bin/env bash
# Re-record the captioned walkthrough after app changes, then rebuild the live demo page.
#   make video        (or: npm run video)
# Needs: Python 3 with Playwright (pip install playwright && python3 -m playwright install chromium) and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT="${VIDEO_PORT:-3917}"
OUT="${VIDEO_OUT:-video-build}"

# Fresh, throwaway data: offline mode keeps everything in memory and resets on start.
PORT="$PORT" node server.js --offline > "$OUT.server.log" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.3; done

python3 scripts/video/record.py --url "http://127.0.0.1:$PORT" --out "$OUT"
python3 scripts/video/encode.py --out "$OUT" --sheets --poster-chapter 4

mkdir -p docs/video
cp "$OUT/readaroo-walkthrough.mp4" "$OUT/readaroo-walkthrough-poster.jpg" "$OUT/chapters.json" docs/video/
node scripts/build-demo.js --video --out=index.html
echo "Done. Check the contact sheets in $OUT/sheets/ before committing docs/video/ and index.html."
