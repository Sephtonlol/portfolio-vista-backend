import { Db, MongoClient } from "mongodb";

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

  const client = new MongoClient(url);
  await client.connect();
  const dbName = process.env.DB_NAME;
  return (db = client.db(dbName));
};
