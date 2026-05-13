"use client";

import imageCompression from "browser-image-compression";

// Client-side compression: max 1920px wide, JPEG ~80% quality.
// Result is typically ~100–400 KB per shot.
export async function compressImage(file: File): Promise<File> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: 1920,
    maxSizeMB: 1,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: "image/jpeg",
  });
  // Ensure the output File has a sensible name + the correct mime.
  const baseName = (file.name || "image").replace(/\.[^/.]+$/, "");
  return new File([compressed], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

// Convert a clipboard or dropped item to a File if it's an image.
export function blobToImageFile(blob: Blob, fallbackName = "pasted.png"): File {
  const ext = blob.type.split("/")[1] || "png";
  return new File([blob], `${fallbackName.replace(/\.[^/.]+$/, "")}.${ext}`, {
    type: blob.type || "image/png",
    lastModified: Date.now(),
  });
}
