import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { connectToDatabase } from "../db.js";
import crypto from "crypto";
import { checkString } from "../utils/types.utils.js";
import { User } from "../interfaces/user.interfaces.js";
import { verifyToken } from "../utils/token.utils.js";

const userCollection = "users";

export const register = async (req: Request, res: Response) => {
  const { password } = req.body;

  if (!checkString(password))
    return res
      .status(422)
      .json({ error: "Password is required and must be a string." });

  try {
    const db = await connectToDatabase();

    const existingUser = await db.collection(userCollection).findOne({});
    if (existingUser)
      return res.status(409).json({
        error: "A password is already set. Use /edit-password to change it.",
      });

    const hash = await bcrypt.hash(password, 10);

    const user: User = {
      password: hash,
      disabled: false,
    };

    await db.collection(userCollection).insertOne({ user });

    res.json({ message: "Password registered." });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: "An error occurred during registration." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { password } = req.body;

  if (!checkString(password))
    return res
      .status(422)
      .json({ error: "Password is required and must be a string." });

  try {
    const db = await connectToDatabase();

    const cursor = db.collection(userCollection).find({});
    let result: any | null = null;

    for await (const doc of cursor) {
      if (!doc?.user?.password) continue;
      if (doc.user.disabled) continue;
      const match = await bcrypt.compare(password, doc.user.password);
      if (match) {
        result = doc;
        break;
      }
    }

    if (!result) {
      const anyUser = await db.collection(userCollection).findOne({});
      if (!anyUser)
        return res.status(404).json({ error: "No password is set yet." });
      if (anyUser.user?.disabled)
        return res.status(403).json({ error: "Your account is disabled." });
      return res.status(422).json({ error: "Incorrect password." });
    }
    let token: string;
    let tokenCheckResult;
    do {
      token = crypto.randomBytes(32).toString("hex");
      tokenCheckResult = await db
        .collection(userCollection)
        .findOne({ "user.token": token });
    } while (tokenCheckResult);
    await db.collection(userCollection).updateOne(
      { _id: result._id },
      {
        $set: {
          "user.token": token,
          "user.expiration": new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    );

    res.json({
      message: "Logged in.",
      token,
      userId: result._id,
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
};

export const editPassword = async (req: Request, res: Response) => {
  try {
    const verifiedUser = await verifyToken(req.headers.authorization);

    if (!verifiedUser) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const { oldPassword, oldPasswordRepeat, newPassword } = req.body;

    if (
      !checkString(oldPassword) ||
      !checkString(oldPasswordRepeat) ||
      !checkString(newPassword)
    ) {
      return res
        .status(422)
        .json({ error: "All password fields must be strings." });
    }

    if (oldPassword !== oldPasswordRepeat) {
      return res.status(422).json({ error: "Current passwords do not match." });
    }

    const db = await connectToDatabase();

    const user = await db
      .collection(userCollection)
      .findOne({ _id: verifiedUser._id });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const passwordMatch = await bcrypt.compare(oldPassword, user.user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Current password is wrong." });
    }

    const samePassword = await bcrypt.compare(newPassword, user.user.password);

    if (samePassword) {
      return res.status(422).json({
        error: "New password must be different from current password.",
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await db
      .collection(userCollection)
      .updateOne(
        { _id: verifiedUser._id },
        { $set: { "user.password": newHash } },
      );

    return res.json({ message: "Password changed." });
  } catch (error) {
    console.error("Error updating password:", error);
    return res.status(500).json({
      error: "There was a problem changing your password.",
    });
  }
};

export const user = async (req: Request, res: Response) => {
  try {
    const verifiedUser = await verifyToken(req.headers.authorization);

    if (!verifiedUser) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const { password, token, ...userWithoutSensitiveData } = verifiedUser;
    res.json({ user: userWithoutSensitiveData });
  } catch (error: any) {
    return res.status(500).json({
      error: "There was a problem fetching your user.",
    });
  }
};
