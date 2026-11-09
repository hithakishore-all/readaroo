.PHONY: video demo

# Re-record the captioned walkthrough video and rebuild the live demo page (index.html).
video:
	scripts/video/make-video.sh

# Rebuild the live demo page and the standalone demo file without re-recording.
demo:
	node scripts/build-demo.js
	node scripts/build-demo.js --video --out=index.html
