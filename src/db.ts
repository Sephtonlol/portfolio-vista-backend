import { Db, MongoClient } from "mongodb";
import { ensureDefaultFileStructure } from "./utils/items.seed.js";

let db: Db | null = null;

export const connectToDatabase = async (
  connectionStr: string | null = null,
): Promise<Db> => {
  if (db) return db;
  const url = connectionStr ?? process.env.CONNECTION_STRING;
  if (!url) {
    throw new Error(
      "Connection string is undefined. Set CONNECTION_STRING in your environment (or pass it to connectToDatabase()).",
    );
  }

  const dbName = process.env.DB_NAME;
  if (!dbName) {
    throw new Error(
      "DB_NAME is undefined. Set DB_NAME in your environment (or pass a connection that includes a default database).",
    );
  }

  const client = new MongoClient(url);
  await client.connect();

  db = client.db(dbName);

  // Ensure indexes (idempotent).
  await db.collection("items").createIndex({ parentId: 1 });

  // Seed default folders once (only if collection is empty).
  await ensureDefaultFileStructure(db);

  return db;
};
