import { CASE_PHOTO_BUCKET } from "@/lib/crop-check/photos";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { logOps } from "@/lib/security/ops-log";
import type { AppIdentity } from "@/lib/beta/identity";
import { recordCasePhoto } from "@/lib/beta/conversation";

export async function persistPrivateCaseImages(options: {
  caseId: string;
  identity: AppIdentity;
  images: Array<{ mimeType: string; base64: string; fileName?: string }>;
}): Promise<string[]> {
  const paths: string[] = [];
  if (options.images.length === 0) return paths;

  const admin = tryCreateAdminClient();
  const owner = options.identity.authUserId ?? options.identity.guestSessionId;

  for (const [index, image] of options.images.entries()) {
    const ext = image.mimeType.includes("png")
      ? "png"
      : image.mimeType.includes("webp")
        ? "webp"
        : "jpg";
    const storagePath = `${owner}/${options.caseId}/${crypto.randomUUID()}-${index}.${ext}`;

    if (admin.ok) {
      try {
        const bytes = Buffer.from(image.base64, "base64");
        const { error } = await admin.client.storage
          .from(CASE_PHOTO_BUCKET)
          .upload(storagePath, bytes, {
            contentType: image.mimeType,
            upsert: false,
          });
        if (error) {
          logOps("photo_upload_failure", { error: error.message });
        }
      } catch (error) {
        logOps("photo_upload_failure", {
          error: error instanceof Error ? error.message : "upload failed",
        });
      }
    }

    await recordCasePhoto({
      caseId: options.caseId,
      identity: options.identity,
      storagePath,
      mimeType: image.mimeType,
      fileSizeBytes: Math.ceil((image.base64.length * 3) / 4),
    });
    paths.push(storagePath);
  }

  return paths;
}
