/** Google Drive upload via service account. */

import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath || !fs.existsSync(keyPath)) return null;

  const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

export async function uploadToDrive(
  filePath: string,
  fileName?: string,
  type: "sitrep" | "forecast" = "sitrep"
): Promise<{ ok: boolean; url?: string; fileId?: string; error?: string }> {
  const auth = getAuth();
  if (!auth) return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured or file not found" };

  // Use type-specific folder, fall back to generic GOOGLE_DRIVE_FOLDER_ID
  const folderId =
    (type === "forecast"
      ? process.env.GOOGLE_DRIVE_FORECAST_FOLDER_ID
      : process.env.GOOGLE_DRIVE_SITREP_FOLDER_ID) ||
    process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) return { ok: false, error: "Google Drive folder ID not configured" };

  try {
    const drive = google.drive({ version: "v3", auth });
    const name = fileName || path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    const res = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        mimeType: "application/pdf",
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from(fileContent),
      },
      fields: "id, webViewLink",
    });

    return {
      ok: true,
      fileId: res.data.id ?? undefined,
      url: res.data.webViewLink ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
