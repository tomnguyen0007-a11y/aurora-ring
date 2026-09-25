#!/usr/bin/env node
// Generates a product ad video via a fal.ai model (e.g. fal-ai/ltx-video/image-to-video
// or fal-ai/ltx-2/image-to-video) and saves the result into assets/.
//
// Setup:
//   1. Sign up at https://fal.ai (free trial credit included).
//   2. Create an API key: https://fal.ai/dashboard/keys
//   3. export FAL_KEY="your-key-here"
//   4. Open the target model's page on fal.ai while logged in, copy the exact
//      input field names from its "API" tab, and set them in generate-product-video.config.json
//      (see generate-product-video.config.example.json in this folder).
//
// Usage:
//   node scripts/generate-product-video.mjs <config.json> <output-name.mp4>

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  console.error("Missing FAL_KEY environment variable. Get one at https://fal.ai/dashboard/keys");
  process.exit(1);
}

const [, , configPath, outputName] = process.argv;
if (!configPath || !outputName) {
  console.error("Usage: node scripts/generate-product-video.mjs <config.json> <output-name.mp4>");
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, "utf-8"));
const { model, input } = config;
if (!model || !input) {
  console.error('Config must have "model" (fal model id) and "input" (request body) fields.');
  process.exit(1);
}

// If input.image_path is set, inline the local file as a base64 data URI
// under input.image_url, since most fal image-to-video models accept a data URI directly.
if (input.image_path) {
  const bytes = await readFile(input.image_path);
  const ext = path.extname(input.image_path).slice(1) || "png";
  input.image_url = `data:image/${ext};base64,${bytes.toString("base64")}`;
  delete input.image_path;
}

const headers = {
  Authorization: `Key ${FAL_KEY}`,
  "Content-Type": "application/json",
};

console.log(`Submitting job to fal.ai model "${model}"...`);
const submitRes = await fetch(`https://queue.fal.run/${model}`, {
  method: "POST",
  headers,
  body: JSON.stringify(input),
});
if (!submitRes.ok) {
  console.error(`Submit failed: ${submitRes.status} ${await submitRes.text()}`);
  process.exit(1);
}
const submitJson = await submitRes.json();
const { status_url, response_url } = submitJson;
if (!status_url || !response_url) {
  console.error("Unexpected response from fal queue submit:", submitJson);
  process.exit(1);
}

console.log("Job queued, polling for completion...");
let status = "IN_QUEUE";
while (status !== "COMPLETED") {
  await new Promise((r) => setTimeout(r, 3000));
  const statusRes = await fetch(status_url, { headers });
  const statusJson = await statusRes.json();
  status = statusJson.status;
  console.log(`  status: ${status}`);
  if (status === "FAILED" || status === "ERROR") {
    console.error("Generation failed:", statusJson);
    process.exit(1);
  }
}

const resultRes = await fetch(response_url, { headers });
const result = await resultRes.json();
const videoUrl = result?.video?.url ?? result?.output?.url ?? result?.url;
if (!videoUrl) {
  console.error("Could not find a video URL in the result. Full response:", JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`Downloading generated video from ${videoUrl} ...`);
const videoRes = await fetch(videoUrl);
const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
const outPath = path.join("assets", outputName);
await writeFile(outPath, videoBuffer);
console.log(`Saved to ${outPath}`);
