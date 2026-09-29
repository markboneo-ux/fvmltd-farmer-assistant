import { isNativeApp } from "@/lib/mobile/native";

export type NativePhotoFile = {
  file: File;
  fileName: string;
  mimeType: string;
};

/**
 * Prefer the Capacitor Camera plugin inside the native shell so permission
 * prompts and the system camera UI work reliably. Falls back to null so the
 * caller can open the HTML file input (with capture="environment").
 */
export async function captureNativePhoto(): Promise<NativePhotoFile | null> {
  if (!isNativeApp()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      correctOrientation: true,
      saveToGallery: false,
    });

    const path = photo.webPath || photo.path;
    if (!path) return null;

    const response = await fetch(path);
    const blob = await response.blob();
    const mimeType = photo.format
      ? `image/${photo.format === "jpg" ? "jpeg" : photo.format}`
      : blob.type || "image/jpeg";
    const extension = photo.format === "png" ? "png" : "jpg";
    const fileName = `crop-photo-${Date.now()}.${extension}`;
    const file = new File([blob], fileName, { type: mimeType });
    return { file, fileName, mimeType };
  } catch {
    return null;
  }
}

export async function pickNativePhotos(
  limit = 6,
): Promise<NativePhotoFile[]> {
  if (!isNativeApp()) return [];

  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );

    // Capacitor Camera pickImages is available on recent plugin versions.
    const cameraWithPicker = Camera as typeof Camera & {
      pickImages?: (options: {
        quality: number;
        limit: number;
      }) => Promise<{ photos: Array<{ webPath?: string; format?: string }> }>;
    };

    if (typeof cameraWithPicker.pickImages === "function") {
      const result = await cameraWithPicker.pickImages({
        quality: 85,
        limit,
      });
      const files: NativePhotoFile[] = [];
      for (const photo of result.photos ?? []) {
        if (!photo.webPath) continue;
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const mimeType = photo.format
          ? `image/${photo.format === "jpg" ? "jpeg" : photo.format}`
          : blob.type || "image/jpeg";
        const extension = photo.format === "png" ? "png" : "jpg";
        const fileName = `crop-photo-${Date.now()}-${files.length}.${extension}`;
        files.push({
          file: new File([blob], fileName, { type: mimeType }),
          fileName,
          mimeType,
        });
      }
      return files;
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      correctOrientation: true,
    });
    const path = photo.webPath || photo.path;
    if (!path) return [];
    const response = await fetch(path);
    const blob = await response.blob();
    const mimeType = photo.format
      ? `image/${photo.format === "jpg" ? "jpeg" : photo.format}`
      : blob.type || "image/jpeg";
    const extension = photo.format === "png" ? "png" : "jpg";
    const fileName = `crop-photo-${Date.now()}.${extension}`;
    return [
      {
        file: new File([blob], fileName, { type: mimeType }),
        fileName,
        mimeType,
      },
    ];
  } catch {
    return [];
  }
}
