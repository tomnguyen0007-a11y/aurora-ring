# Product video generation (LTX-Video via fal.ai)

Generates ad-creative videos from product photos using a hosted LTX-Video
model on fal.ai (no local GPU required).

## Setup

1. Sign up at https://fal.ai — includes free trial credit.
2. Create an API key: https://fal.ai/dashboard/keys
3. `export FAL_KEY="your-key-here"`
4. Open the model you want (e.g. `fal-ai/ltx-video/image-to-video` or
   `fal-ai/ltx-2/image-to-video`) on fal.ai while logged in, and copy the
   exact input field names from its "API" tab into your own copy of
   `generate-product-video.config.example.json`.

## Run

```
cp scripts/generate-product-video.config.example.json scripts/my-video.config.json
# edit scripts/my-video.config.json: set image_path and prompt
node scripts/generate-product-video.mjs scripts/my-video.config.json hero-ring.mp4
```

Output is saved to `assets/hero-ring.mp4`, ready to reference from a
theme section (e.g. a video-background hero or animated product showcase).
