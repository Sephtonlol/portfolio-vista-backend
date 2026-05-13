import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../db.js";
import { getSingleQueryParam } from "../utils/query.utils.js";
import { checkObjectId, checkString } from "../utils/types.utils.js";
import {
  collectSubtreeIds,
  isFileNodeType,
  ITEMS_COLLECTION,
  parseParentId,
  toApiNode,
  type FileNodeDoc,
  validateNodeFields,
} from "../utils/items.utils.js";
import {
  extractZipEntries,
  validateZipEntries,
  savePresentationFile,
  extractFilePathComponents,
  getFileExtensionType,
  getZipDisplayName,
  saveZipAsset,
  bufferToDataUrl,
  MAX_DATA_URL_SIZE,
  publicUrlToFilePath,
} from "../utils/zip.utils.js";
import fs from "fs";

const itemsCollection = ITEMS_COLLECTION;

export const getFolderContents = async (req: Request, res: Response) => {
  if (!Object.prototype.hasOwnProperty.call(req.query, "parentId")) {
    return res.status(400).json({ error: "Missing query param: parentId" });
  }

  const parentIdRaw = getSingleQueryParam((req.query as any).parentId);
  const parsedParent = parseParentId(parentIdRaw);

  if (parsedParent === "invalid") {
    return res
      .status(422)
      .json({ error: "parentId must be an ObjectId or null" });
  }

  try {
    const db = await connectToDatabase();

    const docs = (await db
      .collection<FileNodeDoc>(itemsCollection)
      .find({ parentId: parsedParent })
      .toArray()) as FileNodeDoc[];

    return res.json(docs.map(toApiNode));
  } catch (error) {
    console.error("Error fetching folder contents:", error);
    return res.status(500).json({ error: "Failed to fetch folder contents." });
  }
};

export const createItem = async (req: Request, res: Response) => {
  const { name, type, parentId, content, url, shortcutTo } = req.body ?? {};

  if (!checkString(name)) {
    return res.status(422).json({ error: "name is required." });
  }
  if (!isFileNodeType(type)) {
    return res.status(422).json({ error: "type is invalid." });
  }

  let parentObjectId: ObjectId | null;
  if (parentId === null) {
    parentObjectId = null;
  } else if (checkObjectId(parentId)) {
    parentObjectId = new ObjectId(parentId);
  } else {
    return res
      .status(422)
      .json({ error: "parentId must be an ObjectId or null." });
  }

  const validation = validateNodeFields({ type, content, url, shortcutTo });
  if (!validation.ok) return res.status(422).json({ error: validation.error });

  const now = new Date();

  const doc: Omit<FileNodeDoc, "_id"> = {
    name: name.trim(),
    type,
    parentId: parentObjectId,
    createdAt: now,
    updatedAt: now,
  };

  if (type === "md" && typeof content === "string" && content.trim()) {
    doc.content = content;
  }
  if (
    (type === "url" || type === "mp4" || type === "mp3" || type === "png") &&
    typeof url === "string"
  ) {
    doc.url = url;
  }
  const shortcutObjectId =
    type === "shortcut" && checkString(shortcutTo) && ObjectId.isValid(String(shortcutTo))
      ? new ObjectId(String(shortcutTo))
      : null;
  if (shortcutObjectId) doc.shortcutTo = shortcutObjectId;
  // Allow path-style shortcuts stored in `content` (portable across clients)
  if (
    type === "shortcut" &&
    typeof content === "string" &&
    content.trim().startsWith("/")
  ) {
    doc.content = content.trim();
  }

  try {
    const db = await connectToDatabase();

    // If parentId is not root, ensure parent exists & is a directory.
    if (parentObjectId) {
      const parent = await db
        .collection<FileNodeDoc>(itemsCollection)
        .findOne({ _id: parentObjectId });
      if (!parent) {
        return res.status(404).json({ error: "Parent folder not found." });
      }
      if (parent.type !== "directory") {
        return res
          .status(422)
          .json({ error: "parentId must reference a directory." });
      }
    }

    if (type === "shortcut" && shortcutObjectId) {
      const target = await db
        .collection<FileNodeDoc>(itemsCollection)
        .findOne({ _id: shortcutObjectId });
      if (!target) {
        return res.status(404).json({ error: "shortcutTo item not found." });
      }
    }

    const result = await db
      .collection<FileNodeDoc>(itemsCollection)
      .insertOne(doc as any);
    const created: FileNodeDoc = { _id: result.insertedId, ...(doc as any) };

    return res.status(201).json(toApiNode(created));
  } catch (error) {
    console.error("Error creating item:", error);
    return res.status(500).json({ error: "Failed to create item." });
  }
};

export const updateItem = async (req: Request, res: Response) => {
  const id = String((req.params as any)?.id ?? "");
  if (!checkObjectId(id)) return res.status(422).json({ error: "Invalid id." });

  if (req.body?.parentId !== undefined) {
    return res
      .status(422)
      .json({ error: "Use PATCH /items/:id/move to change parentId." });
  }

  const { name, type, content, url, shortcutTo } = req.body ?? {};

  if (type !== undefined && !isFileNodeType(type)) {
    return res.status(422).json({ error: "type is invalid." });
  }

  try {
    const db = await connectToDatabase();

    const existing = await db
      .collection<FileNodeDoc>(itemsCollection)
      .findOne({ _id: new ObjectId(id) });

    if (!existing) return res.status(404).json({ error: "Item not found." });

    const nextType = (type ?? existing.type) as FileNodeDoc["type"];

    const validation = validateNodeFields({
      type: nextType,
      content: content ?? existing.content,
      url: url ?? existing.url,
      shortcutTo: shortcutTo ?? existing.shortcutTo?.toString(),
    });

    if (!validation.ok)
      return res.status(422).json({ error: validation.error });

    const $set: Partial<FileNodeDoc> = { updatedAt: new Date() };
    const $unset: Record<string, ""> = {};

    if (name !== undefined) {
      if (!checkString(name))
        return res
          .status(422)
          .json({ error: "name must be a non-empty string." });
      $set.name = name.trim();
    }
    if (type !== undefined) $set.type = nextType;

    // Normalize optional fields based on resulting type.
    if (nextType === "md") {
      if (content !== undefined) {
        if (content === null || content === "") {
          $unset.content = "";
        } else if (checkString(content)) {
          $set.content = content;
        }
      }
      $unset.url = "";
      $unset.shortcutTo = "";
    } else if (nextType === "url") {
      if (url !== undefined) {
        if (!checkString(url))
          return res
            .status(422)
            .json({ error: "url must be a non-empty string." });
        $set.url = url;
      }
      $unset.content = "";
      $unset.shortcutTo = "";
    } else if (nextType === "shortcut") {
      // Support either an ObjectId target (`shortcutTo`) or a portable path in `content`.
      if (shortcutTo !== undefined) {
        if (shortcutTo === null || shortcutTo === "") {
          // clear shortcutTo if explicitly set to empty
          $unset.shortcutTo = "";
        } else if (!checkString(shortcutTo) || !ObjectId.isValid(String(shortcutTo))) {
          return res
            .status(422)
            .json({ error: "shortcutTo must be a valid item id." });
        } else {
          $set.shortcutTo = new ObjectId(String(shortcutTo));
          // if setting shortcutTo, clear any path content
          $unset.content = "";
        }
      }

      if (content !== undefined) {
        if (content === null || content === "") {
          $unset.content = "";
        } else if (typeof content !== "string" || !content.startsWith("/")) {
          return res
            .status(422)
            .json({ error: "content must be a path starting with '/' for shortcuts." });
        } else {
          $set.content = content;
          // if setting a path, clear shortcutTo since path is the portable pointer
          $unset.shortcutTo = "";
        }
      }

      $unset.url = "";
    } else if (nextType === "directory") {
      $unset.content = "";
      $unset.url = "";
      $unset.shortcutTo = "";
    } else {
      // media: allow url; clear content/shortcutTo
      $unset.content = "";
      $unset.shortcutTo = "";

      if (url !== undefined) {
        if (url === null) {
          $unset.url = "";
        } else if (typeof url === "string") {
          if (url === "") {
            $unset.url = "";
          } else {
            $set.url = url;
          }
        } else {
          return res.status(422).json({ error: "url must be a string." });
        }
      }
    }

    if ($set.shortcutTo) {
      const target = await db
        .collection<FileNodeDoc>(itemsCollection)
        .findOne({ _id: $set.shortcutTo });
      if (!target)
        return res.status(404).json({ error: "shortcutTo item not found." });
    }

    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    await db
      .collection<FileNodeDoc>(itemsCollection)
      .updateOne({ _id: new ObjectId(id) }, update);

    const updated = await db
      .collection<FileNodeDoc>(itemsCollection)
      .findOne({ _id: new ObjectId(id) });

    return res.json(toApiNode(updated as FileNodeDoc));
  } catch (error) {
    console.error("Error updating item:", error);
    return res.status(500).json({ error: "Failed to update item." });
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  const id = String((req.params as any)?.id ?? "");
  if (!checkObjectId(id)) return res.status(422).json({ error: "Invalid id." });

  try {
    const db = await connectToDatabase();

    const existing = await db
      .collection<FileNodeDoc>(itemsCollection)
      .findOne({ _id: new ObjectId(id) });

    if (!existing) return res.status(404).json({ error: "Item not found." });

    if (existing.type === "directory") {
      const ids = await collectSubtreeIds(db, existing._id, itemsCollection);

      // Find all docs in subtree to remove any uploaded files from disk
      const docs = (await db
        .collection<FileNodeDoc>(itemsCollection)
        .find({ _id: { $in: ids } })
        .toArray()) as FileNodeDoc[];

      for (const d of docs) {
        if (d.url && typeof d.url === "string") {
          const fp = publicUrlToFilePath(d.url);
          if (fp && fs.existsSync(fp)) {
            try {
              fs.unlinkSync(fp);
            } catch (err) {
              console.error("Failed to delete file from disk:", fp, err);
            }
          }
        }
      }

      const result = await db
        .collection<FileNodeDoc>(itemsCollection)
        .deleteMany({ _id: { $in: ids } });
      return res.json({ deletedCount: result.deletedCount });
    }

    // Non-directory: delete any associated uploaded file from disk
    if (existing.url && typeof existing.url === "string") {
      const fp = publicUrlToFilePath(existing.url);
      if (fp && fs.existsSync(fp)) {
        try {
          fs.unlinkSync(fp);
        } catch (err) {
          console.error("Failed to delete file from disk:", fp, err);
        }
      }
    }

    const result = await db
      .collection<FileNodeDoc>(itemsCollection)
      .deleteOne({ _id: existing._id });

    return res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    console.error("Error deleting item:", error);
    return res.status(500).json({ error: "Failed to delete item." });
  }
};

export const moveItem = async (req: Request, res: Response) => {
  const id = String((req.params as any)?.id ?? "");
  if (!checkObjectId(id)) return res.status(422).json({ error: "Invalid id." });

  const { newParentId } = req.body ?? {};

  let newParentObjectId: ObjectId | null;
  if (newParentId === null) {
    newParentObjectId = null;
  } else if (checkObjectId(newParentId)) {
    newParentObjectId = new ObjectId(newParentId);
  } else {
    return res
      .status(422)
      .json({ error: "newParentId must be an ObjectId or null." });
  }

  if (newParentObjectId && newParentObjectId.toString() === id) {
    return res.status(422).json({ error: "Cannot move an item into itself." });
  }

  try {
    const db = await connectToDatabase();

    const item = await db
      .collection<FileNodeDoc>(itemsCollection)
      .findOne({ _id: new ObjectId(id) });

    if (!item) return res.status(404).json({ error: "Item not found." });

    if (newParentObjectId) {
      const parent = await db
        .collection<FileNodeDoc>(itemsCollection)
        .findOne({ _id: newParentObjectId });
      if (!parent)
        return res.status(404).json({ error: "Parent folder not found." });
      if (parent.type !== "directory") {
        return res
          .status(422)
          .json({ error: "newParentId must reference a directory." });
      }

      // Prevent cycles: new parent cannot be a descendant of the item.
      let cursor: ObjectId | null = newParentObjectId;
      while (cursor) {
        if (cursor.toString() === id) {
          return res
            .status(422)
            .json({ error: "Cannot move an item into its descendant." });
        }
        const node: { parentId?: ObjectId | null } | null = await db
          .collection<FileNodeDoc>(itemsCollection)
          .findOne({ _id: cursor }, { projection: { parentId: 1 } });
        cursor = node?.parentId ?? null;
      }
    }

    await db
      .collection<FileNodeDoc>(itemsCollection)
      .updateOne(
        { _id: item._id },
        { $set: { parentId: newParentObjectId, updatedAt: new Date() } },
      );

    const updated = await db
      .collection<FileNodeDoc>(itemsCollection)
      .findOne({ _id: item._id });

    return res.json(toApiNode(updated as FileNodeDoc));
  } catch (error) {
    console.error("Error moving item:", error);
    return res.status(500).json({ error: "Failed to move item." });
  }
};

export const uploadFromZip = async (req: Request, res: Response) => {
  // Get buffer from body - req.body will be a Buffer if content-type is application/octet-stream
  const zipBuffer = req.body;

  if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
    return res
      .status(422)
      .json({ error: "Zip file is required in request body" });
  }

  // Optional: get parentId from query or body
  let parentId: string | null = null;
  if (req.query?.parentId) {
    parentId = String(req.query.parentId);
  } else if (req.body?.parentId) {
    parentId = String(req.body.parentId);
  }

  let parentObjectId: ObjectId | null = null;
  if (parentId !== null) {
    if (!checkObjectId(parentId)) {
      return res
        .status(422)
        .json({ error: "parentId must be a valid ObjectId or null" });
    }
    parentObjectId = new ObjectId(parentId);
  }

  try {
    // Extract zip entries
    const { entries, error: extractError } = extractZipEntries(zipBuffer);
    if (extractError) {
      return res.status(422).json({ error: extractError });
    }

    // Validate all files are supported types
    const { valid, error: validationError } = validateZipEntries(entries);
    if (!valid) {
      return res.status(422).json({ error: validationError });
    }

    const db = await connectToDatabase();

    // If parentId is provided, verify it exists and is a directory
    if (parentObjectId) {
      const parent = await db
        .collection<FileNodeDoc>(itemsCollection)
        .findOne({ _id: parentObjectId });
      if (!parent) {
        return res.status(404).json({ error: "Parent folder not found." });
      }
      if (parent.type !== "directory") {
        return res
          .status(422)
          .json({ error: "parentId must reference a directory." });
      }
    }

    // Build a map of folder paths to their ObjectIds
    const folderMap: Record<string, ObjectId> = {};
    if (parentObjectId === null) {
      folderMap[""] = null as any; // root
    } else {
      folderMap[""] = parentObjectId;
    }

    const now = new Date();
    const createdItems: FileNodeDoc[] = [];

    // Process entries: create directories first, then files
    const directories = entries.filter((e) => e.isDirectory);
    const files = entries.filter((e) => !e.isDirectory);

    // Create all directories
    for (const entry of directories) {
      const { folderPath, fileName } = extractFilePathComponents(
        entry.fileName,
      );
      const parentKey = folderPath;
      const parentFolderId = folderMap[parentKey] ?? null;

      const doc: Omit<FileNodeDoc, "_id"> = {
        name: fileName,
        type: "directory",
        parentId: parentFolderId,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .collection<FileNodeDoc>(itemsCollection)
        .insertOne(doc as any);

      const created: FileNodeDoc = { _id: result.insertedId, ...(doc as any) };
      createdItems.push(created);

      // Add to folderMap for file insertion
      const fullPath = entry.fileName.replace(/\/$/, "");
      folderMap[fullPath] = result.insertedId;
    }

    // Create all files
    for (const entry of files) {
      const { folderPath, fileName } = extractFilePathComponents(
        entry.fileName,
      );
      const parentKey = folderPath;
      const parentFolderId = folderMap[parentKey] ?? null;

      const fileType = entry.fileExtensionType;
      const displayName = getZipDisplayName(fileName);

      if (fileType === "unsupported") {
        return res
          .status(422)
          .json({ error: `File type not supported: ${fileName}` });
      }

      const doc: Omit<FileNodeDoc, "_id"> = {
        name: displayName,
        type: fileType as any,
        parentId: parentFolderId,
        createdAt: now,
        updatedAt: now,
      };

      // Handle different file types
      if (fileType === "md" && entry.content) {
        try {
          doc.content = entry.content.toString("utf-8");
        } catch {
          doc.content = "[Binary content]";
        }
      } else if (fileType === "url" && entry.content) {
        // Save documents/presentations to server and expose a public URL
        const saveResult = saveZipAsset(fileName, entry.content);
        if (saveResult.success && saveResult.url) {
          doc.url = saveResult.url;
        } else {
          console.error("Failed to save document file:", saveResult.error);
          return res
            .status(500)
            .json({ error: "Failed to save document file" });
        }
      } else if (
        (fileType === "png" || fileType === "mp4" || fileType === "mp3") &&
        entry.content
      ) {
        try {
          // Always save media files to disk and return a backend-served URL
          const saveResult = saveZipAsset(fileName, entry.content);
          if (saveResult.success && saveResult.url) {
            doc.url = saveResult.url;
          } else {
            console.error("Failed to save media file:", saveResult.error);
            return res.status(500).json({ error: "Failed to save media file" });
          }
        } catch (err) {
          console.error("Failed to process media file:", err);
          return res
            .status(500)
            .json({ error: "Failed to process media file" });
        }
      }

      const result = await db
        .collection<FileNodeDoc>(itemsCollection)
        .insertOne(doc as any);

      const created: FileNodeDoc = { _id: result.insertedId, ...(doc as any) };
      createdItems.push(created);
    }

    return res.status(201).json({
      message: `Successfully imported ${createdItems.length} items from zip`,
      itemsCreated: createdItems.length,
      items: createdItems.map(toApiNode),
    });
  } catch (error) {
    console.error("Error uploading from zip:", error);
    return res.status(500).json({ error: "Failed to upload from zip file." });
  }
};
