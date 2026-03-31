import { connectToDatabase } from "../db.js";

const userCollection = "users";
const ONE_HOUR_MS = 60 * 60 * 1000;

export const verifyToken = async (
  authHeader: string | undefined,
): Promise<any> => {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Authorization header is missing or invalid.");
    }
    const token = authHeader.split(" ")[1];

    const db = await connectToDatabase();
    const result = await db.collection(userCollection).findOne({
      "user.token": token,
    });

    const expiration = result?.user?.expiration;
    if (!result || !(expiration instanceof Date) || expiration < new Date()) {
      return false;
    }

    // Sliding expiration: extend by +1 hour on every successful request.
    const base = Math.max(Date.now(), expiration.getTime());
    const newExpiration = new Date(base + ONE_HOUR_MS);
    await db
      .collection(userCollection)
      .updateOne(
        { _id: result._id },
        { $set: { "user.expiration": newExpiration } },
      );

    // Include the database document id so downstream controllers can reference it.
    return { ...result.user, _id: result._id, expiration: newExpiration };
  } catch (error: any) {
    console.error("Error during token verification:", error);
    return false;
  }
};
