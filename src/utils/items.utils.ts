import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type {
  FileNode,
  FileNodeType,
} from "../interfaces/file-node.interface.js";
import { checkString } from "./types.utils.js";

export const ITEMS_COLLECTION = "items";

export type FileNodeDoc = {
  _id: ObjectId;
  name: string;
  type: FileNodeType;
  parentId: ObjectId | null;
  content?: string;
  url?: string;
  shortcutTo?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const isFileNodeType = (value: unknown): value is FileNodeType => {
  return (
    value === "directory" ||
    value === "md" ||
    value === "mp4" ||
    value === "mp3" ||
    value === "png" ||
    value === "shortcut" ||
    value === "url"
  );
};

export const parseParentId = (
  raw: string | null,
): ObjectId | null | "invalid" => {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return null;
  if (!ObjectId.isValid(trimmed)) return "invalid";
  return new ObjectId(trimmed);
};

export const toApiNode = (doc: FileNodeDoc): FileNode => {
  const node: FileNode = {
    _id: doc._id.toString(),
    name: doc.name,
    type: doc.type,
    parentId: doc.parentId ? doc.parentId.toString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  if (doc.content !== undefined) node.content = doc.content;
  if (doc.url !== undefined) node.url = doc.url;
  if (doc.shortcutTo !== undefined) node.shortcutTo = doc.shortcutTo.toString();

  return node;
};

export const validateNodeFields = (node: {
  type: FileNodeType;
  content?: unknown;
  url?: unknown;
  shortcutTo?: unknown;
}): { ok: true } | { ok: false; error: string } => {
  const { type, content, url, shortcutTo } = node;

  if (type === "directory") {
    if (content !== undefined)
      return { ok: false, error: "Directories cannot have content." };
    if (url !== undefined)
      return { ok: false, error: "Directories cannot have url." };
    if (shortcutTo !== undefined)
      return { ok: false, error: "Directories cannot have shortcutTo." };
    return { ok: true };
  }

  if (type === "md") {
    if (url !== undefined)
      return { ok: false, error: "Markdown files cannot have url." };
    if (shortcutTo !== undefined)
      return { ok: false, error: "Markdown files cannot have shortcutTo." };
    if (content !== undefined && typeof content !== "string") {
      return { ok: false, error: "content must be a string." };
    }
    return { ok: true };
  }

  if (type === "url") {
    if (!checkString(url)) return { ok: false, error: "url is required." };
    if (content !== undefined)
      return { ok: false, error: "URL items cannot have content." };
    if (shortcutTo !== undefined)
      return { ok: false, error: "URL items cannot have shortcutTo." };
    return { ok: true };
  }

  if (type === "shortcut") {
    if (!checkString(shortcutTo) || !ObjectId.isValid(String(shortcutTo))) {
      return { ok: false, error: "shortcutTo must be a valid item id." };
    }
    if (content !== undefined)
      return { ok: false, error: "Shortcut items cannot have content." };
    if (url !== undefined)
      return { ok: false, error: "Shortcut items cannot have url." };
    return { ok: true };
  }

  // Media types: allow storing a url (data URI or /uploads/... path).
  if (type === "mp4" || type === "mp3" || type === "png") {
    if (content !== undefined)
      return { ok: false, error: "This item type cannot have content." };
    if (shortcutTo !== undefined)
      return { ok: false, error: "This item type cannot have shortcutTo." };
    if (url !== undefined && typeof url !== "string") {
      return { ok: false, error: "url must be a string." };
    }
    return { ok: true };
  }

  return { ok: false, error: "Unknown item type." };
};

export const collectSubtreeIds = async (
  db: Db,
  rootId: ObjectId,
  collectionName: string = ITEMS_COLLECTION,
): Promise<ObjectId[]> => {
  const ids: ObjectId[] = [rootId];

  let frontier: ObjectId[] = [rootId];
  while (frontier.length > 0) {
    const children = (await db
      .collection<FileNodeDoc>(collectionName)
      .find({ parentId: { $in: frontier } }, { projection: { _id: 1 } })
      .toArray()) as Array<{ _id: ObjectId }>;

    const childIds = children.map((c) => c._id);
    if (childIds.length === 0) break;

    ids.push(...childIds);
    frontier = childIds;
  }

  return ids;
};
