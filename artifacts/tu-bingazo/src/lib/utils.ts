import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compresses an image file using canvas, returns a WebP base64 data URL.
 * @param file   - The File object from an <input type="file">
 * @param maxPx  - Max pixels on the longest side (e.g. 1200 for CI photos, 400 for avatars)
 * @param quality - WebP quality 0–1 (default 0.85)
 */
export function compressImage(file: File, maxPx: number, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
