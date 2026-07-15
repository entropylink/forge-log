// Client-side photo compression (plan.md §6 M1: ≤300KB before upload).
//
// Compression happens on capture, not on upload, because the workshop has no
// signal: the photo has to be small before it ever joins the sync queue, and
// P2's Storage cost mitigation (§12) depends on it never being full-size.

import { config } from "../config";

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

/** Longest edge capped, then quality stepped down until it fits the budget. */
export async function compressImage(
  file: Blob,
  maxBytes = config.photo.maxSizeKB * 1024,
  maxEdge = config.photo.maxEdgePx,
): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Step quality down until it fits. Stops at 0.4 rather than chasing the
  // budget into mush — a test-result photo has to stay readable.
  let blob = await toBlob(canvas, 0.82);
  for (const quality of [0.7, 0.6, 0.5, 0.4]) {
    if (blob.size <= maxBytes) break;
    blob = await toBlob(canvas, quality);
  }

  return { blob, width, height, bytes: blob.size };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export function photoObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
