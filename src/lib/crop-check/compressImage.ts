/**
 * Compresses large images in the browser with canvas before upload.
 * Resizes so the longest edge is at most `maxEdge` and encodes as JPEG.
 */
export async function compressImageForUpload(
  file: File,
  options: { maxEdge?: number; quality?: number; maxBytes?: number } = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.72;
  const maxBytes = options.maxBytes ?? 1_200_000;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  // Small enough already — keep original when under threshold and already JPEG/PNG/WebP
  if (file.size <= maxBytes && file.type !== "image/heic" && file.type !== "image/heif") {
    // Still normalize very large dimensions via decode when possible
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Fallback: upload original if the browser cannot decode (e.g. some HEIC)
    if (file.size > 8_000_000) {
      throw new Error("Image is too large. Try a smaller photo.");
    }
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let currentQuality = quality;
  let blob = await canvasToBlob(canvas, currentQuality);

  while (blob.size > maxBytes && currentQuality > 0.45) {
    currentQuality -= 0.1;
    blob = await canvasToBlob(canvas, currentQuality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "crop-photo";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Could not compress the image."));
          return;
        }
        resolve(result);
      },
      "image/jpeg",
      quality,
    );
  });
}
