import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const UPLOADS_DIR = path.join(PROJECT_ROOT, "public", "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export type FileExtensionType =
  | "md"
  | "png"
  | "mp4"
  | "mp3"
  | "url"
  | "unsupported";

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|gif|webp|svg|bmp|png)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|flv|webm)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|aac|flac|ogg|m4a)$/i;
const MARKDOWN_EXTENSIONS = /\.(md|txt|markdown)$/i;
const PRESENTATION_EXTENSIONS = /\.(ppt|pptx)$/i;
const DOCUMENT_EXTENSIONS = /\.(pdf|docx|doc|xlsx|xls)$/i;

export const getFileExtensionType = (fileName: string): FileExtensionType => {
  if (MARKDOWN_EXTENSIONS.test(fileName)) return "md";
  if (IMAGE_EXTENSIONS.test(fileName)) return "png";
  if (VIDEO_EXTENSIONS.test(fileName)) return "mp4";
  if (AUDIO_EXTENSIONS.test(fileName)) return "mp3";
  if (PRESENTATION_EXTENSIONS.test(fileName)) return "url";
  if (DOCUMENT_EXTENSIONS.test(fileName)) return "url";
  return "unsupported";
};

export interface ZipEntry {
  fileName: string;
  isDirectory: boolean;
  fileExtensionType: FileExtensionType;
  content?: Buffer;
}

export const getZipDisplayName = (entryName: string): string => {
  const baseName = path.posix.basename(entryName);
  let name = baseName;

  // Remove multiple known extensions from the end (e.g. "file.txt.md")
  const knownExts = [
    ".md",
    ".markdown",
    ".txt",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".png",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".flv",
    ".webm",
    ".mp3",
    ".wav",
    ".aac",
    ".flac",
    ".ogg",
    ".m4a",
    ".ppt",
    ".pptx",
  ];

  // Iteratively strip extensions
  let changed = true;
  while (changed) {
    changed = false;
    for (const ext of knownExts) {
      if (name.toLowerCase().endsWith(ext)) {
        name = name.slice(0, -ext.length);
        changed = true;
      }
    }
  }

  // Trim whitespace and trailing dots/underscores
  name = name.replace(/[._\s]+$/g, "").trim();
  if (!name) return path.parse(baseName).name;
  return name;
};

export const getZipFileExtension = (entryName: string): string => {
  return path.extname(path.posix.basename(entryName));
};

export const saveZipAsset = (
  entryName: string,
  content: Buffer,
): { success: boolean; url?: string; error?: string } => {
  try {
    const safeBaseName = path
      .parse(path.posix.basename(entryName))
      .name.replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const extension = getZipFileExtension(entryName).toLowerCase();
    const uniqueFileName = `${Date.now()}_${safeBaseName || "asset"}${extension}`;
    const filePath = path.join(UPLOADS_DIR, uniqueFileName);

    fs.writeFileSync(filePath, content);

    // Prefer BACKEND_BASE_URL for backend-served files, fall back to APP_BASE_URL
    const backendBase = process.env.BACKEND_BASE_URL
      ? process.env.BACKEND_BASE_URL.replace(/\/$/, "")
      : null;
    const appBase = process.env.APP_BASE_URL
      ? process.env.APP_BASE_URL.replace(/\/$/, "")
      : null;

    const publicPath = `/public/uploads/${uniqueFileName}`;
    const fullUrl = backendBase
      ? `${backendBase}${publicPath}`
      : appBase
        ? `${appBase}${publicPath}`
        : publicPath;
    return { success: true, url: fullUrl };
  } catch {
    return { success: false, error: "Failed to save file" };
  }
};

export const getMimeType = (entryName: string): string => {
  const ext = getZipFileExtension(entryName).toLowerCase();
  if (/\.md|\.txt|\.markdown/.test(ext)) return "text/plain";
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)/.test(ext))
    return `image/${ext.replace(/^\./, "").replace("jpg", "jpeg")}`;
  if (/\.(mp4|mov|avi|mkv|flv|webm)/.test(ext)) return "video/mp4";
  if (/\.(mp3|wav|aac|flac|ogg|m4a)/.test(ext)) return "audio/mpeg";
  if (/\.(ppt|pptx)/.test(ext)) return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
};

export const bufferToDataUrl = (entryName: string, content: Buffer): string => {
  const mime = getMimeType(entryName);
  const base64 = content.toString("base64");
  return `data:${mime};base64,${base64}`;
};

// Maximum size (bytes) to embed binary data as a data URL in the DB.
// Documents larger than this should be saved on disk and referenced by URL.
export const MAX_DATA_URL_SIZE = 1_000_000; // 1MB

export const publicUrlToFilePath = (url: string): string | null => {
  if (!url || typeof url !== "string") return null;
  // If already a data URL, nothing to delete from disk
  if (url.startsWith("data:")) return null;

  const backendBase = process.env.BACKEND_BASE_URL
    ? process.env.BACKEND_BASE_URL.replace(/\/$/, "")
    : null;
  const appBase = process.env.APP_BASE_URL
    ? process.env.APP_BASE_URL.replace(/\/$/, "")
    : null;

  let publicPath = url;
  if (backendBase && url.startsWith(backendBase)) {
    publicPath = url.slice(backendBase.length);
  } else if (appBase && url.startsWith(appBase)) {
    publicPath = url.slice(appBase.length);
  }

  const prefix = "/public/uploads/";
  const idx = publicPath.indexOf(prefix);
  if (idx === -1) return null;
  const fileName = publicPath.slice(idx + prefix.length);
  if (!fileName) return null;

  return path.join(UPLOADS_DIR, fileName);
};

export const extractZipEntries = (
  zipBuffer: Buffer,
): { entries: ZipEntry[]; error?: string } => {
  try {
    const zip = new AdmZip(zipBuffer);
    const entries: ZipEntry[] = [];

    zip.getEntries().forEach((entry: any) => {
      if (entry.isDirectory) {
        entries.push({
          fileName: entry.entryName,
          isDirectory: true,
          fileExtensionType: "unsupported",
        });
      } else {
        const fileExtensionType = getFileExtensionType(entry.entryName);
        entries.push({
          fileName: entry.entryName,
          isDirectory: false,
          fileExtensionType,
          content: entry.getData(),
        });
      }
    });

    return { entries };
  } catch (error) {
    return { entries: [], error: "Failed to extract zip file" };
  }
};

export const validateZipEntries = (
  entries: ZipEntry[],
): { valid: boolean; error?: string; invalidFiles?: string[] } => {
  const invalidFiles: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory && entry.fileExtensionType === "unsupported") {
      invalidFiles.push(entry.fileName);
    }
  }

  if (invalidFiles.length > 0) {
    return {
      valid: false,
      error: `Unsupported file types found: ${invalidFiles.join(", ")}`,
      invalidFiles,
    };
  }

  return { valid: true };
};

export const savePresentationFile = (
  fileName: string,
  content: Buffer,
): { success: boolean; url?: string; error?: string } => {
  return saveZipAsset(fileName, content);
};

export const extractFilePathComponents = (
  filePath: string,
): { folderPath: string; fileName: string } => {
  const parts = filePath.split("/").filter((p) => p && p !== ".");
  const fileName = parts.pop() || "";
  const folderPath = parts;
  return { folderPath: folderPath.join("/"), fileName };
};
