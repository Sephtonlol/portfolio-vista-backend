import type { Db, ObjectId } from "mongodb";
import { ITEMS_COLLECTION, type FileNodeDoc } from "./items.utils.js";

const createDir = async (
  db: Db,
  name: string,
  parentId: ObjectId | null,
  collectionName: string,
): Promise<ObjectId> => {
  const now = new Date();
  const result = await db
    .collection<Omit<FileNodeDoc, "_id">>(collectionName)
    .insertOne({
      name,
      type: "directory",
      parentId,
      createdAt: now,
      updatedAt: now,
    });

  return result.insertedId;
};

export const ensureDefaultFileStructure = async (
  db: Db,
  collectionName: string = ITEMS_COLLECTION,
) => {
  const count = await db.collection(collectionName).estimatedDocumentCount();
  if (count > 0) return;

  // Root folders
  await createDir(db, "Desktop", null, collectionName);
  await createDir(db, "Home", null, collectionName);
  await createDir(db, "Downloads", null, collectionName);
  await createDir(db, "Documents", null, collectionName);
  await createDir(db, "Pictures", null, collectionName);
  await createDir(db, "Videos", null, collectionName);

  // System subtree
  const systemId = await createDir(db, "System", null, collectionName);
  const configId = await createDir(db, "Config", systemId, collectionName);
  await createDir(db, "Logs", configId, collectionName);
  await createDir(db, "Core", configId, collectionName);
  await createDir(db, "Temp", systemId, collectionName);
};
