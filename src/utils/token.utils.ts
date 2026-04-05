import { connectToDatabase } from "../db.js";

const userCollection = "users";

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

    if (!result) return false;
    if (result.user?.disabled) return false;

    // Include the database document id so downstream controllers can reference it.
    return { ...result.user, _id: result._id };
  } catch (error: any) {
    console.error("Error during token verification:", error);
    return false;
  }
};
