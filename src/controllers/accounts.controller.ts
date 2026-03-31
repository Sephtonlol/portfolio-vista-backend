import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { connectToDatabase } from "../db.js";
import crypto from "crypto";
import { isValidEmail } from "../utils/regex.utils.js";
import { checkString } from "../utils/types.utils.js";
import { User } from "../interfaces/user.interfaces.js";
import { verifyToken } from "../utils/token.utils.js";

const userCollection = "users";

export const register = async (req: Request, res: Response) => {
  const { name, surname, email, password, gender } = req.body;

  if (!checkString(name))
    return res
      .status(422)
      .json({ error: "Name is required and must be a string." });

  if (!checkString(email) || !isValidEmail(email))
    return res
      .status(422)
      .json({ error: "Email is required and must be a valid email address." });

  if (!checkString(password))
    return res
      .status(422)
      .json({ error: "Password is required and must be a string." });

  try {
    const db = await connectToDatabase();

    const userExist = await db
      .collection(userCollection)
      .findOne({ "user.name": name, "user.surname": surname });

    const emailExist = await db
      .collection(userCollection)
      .findOne({ "user.email": email });

    if (userExist)
      return res
        .status(419)
        .json({ error: "A user with that name already exists." });

    if (emailExist)
      return res
        .status(419)
        .json({ error: "A user with that email already exists." });

    const hash = await bcrypt.hash(password, 10);

    const user: User = {
      name,
      email,
      password: hash,
      disabled: true,
    };

    await db.collection(userCollection).insertOne({ user });

    res.json({ message: "Gebruiker geregistreerd." });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: "An error occurred during registration." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!checkString(email) || !isValidEmail(email))
    return res
      .status(422)
      .json({ error: "Email is required and must be a valid email address." });

  if (!checkString(password))
    return res
      .status(422)
      .json({ error: "Password is required and must be a string." });

  try {
    const db = await connectToDatabase();

    const result = await db
      .collection(userCollection)
      .findOne({ "user.email": email });

    if (!result) return res.status(404).json({ error: "User not found." });
    if (result.user.disabled)
      return res.status(403).json({ error: "Your account is disabled." });

    const match = await bcrypt.compare(password, result.user.password);
    if (!match) return res.status(422).json({ error: "Incorrect password." });
    let token: string;
    let tokenCheckResult;
    do {
      token = crypto.randomBytes(32).toString("hex");
      tokenCheckResult = await db
        .collection(userCollection)
        .findOne({ "user.token": token });
    } while (tokenCheckResult);
    await db.collection(userCollection).updateOne(
      { "user.email": email },
      {
        $set: {
          "user.token": token,
          "user.expiration": new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    );

    res.json({
      message: "Ingelogd.",
      token,
      username: result.user.username,
      userId: result._id,
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
};

export const editProfile = async (req: Request, res: Response) => {
  try {
    const verifiedUser = await verifyToken(req.headers.authorization);

    if (!verifiedUser) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const { name, surname, email, gender, password } = req.body;

    const updateData: any = {};

    if (name !== undefined) {
      if (!checkString(name))
        return res.status(422).json({ error: "Name must be a string." });

      updateData["user.name"] = name;
    }

    if (surname !== undefined) {
      if (!checkString(surname))
        return res.status(422).json({ error: "Surname must be a string." });

      updateData["user.surname"] = surname;
    }

    if (email !== undefined) {
      if (!checkString(email) || !isValidEmail(email))
        return res
          .status(422)
          .json({ error: "Email must be a valid email address." });

      updateData["user.email"] = email;
    }

    if (gender !== undefined) {
      if (gender !== "male" && gender !== "female" && gender !== null)
        return res
          .status(422)
          .json({ error: "Gender must be 'male', 'female', or null." });

      updateData["user.gender"] = gender;
    }

    if (!checkString(password))
      return res
        .status(422)
        .json({ error: "Password is required and must be a string." });

    if (Object.keys(updateData).length === 0)
      return res
        .status(422)
        .json({ error: "No valid fields provided to update." });

    const db = await connectToDatabase();

    const user = await db
      .collection(userCollection)
      .findOne({ _id: verifiedUser._id });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const passwordMatch = await bcrypt.compare(password, user.user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    await db
      .collection(userCollection)
      .updateOne({ _id: verifiedUser._id }, { $set: updateData });

    return res.json({ message: "Profiel succesvol bijgewerkt." });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({
      error: "An error occurred while updating the profile.",
    });
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

    return res.json({ message: "Password is wrong." });
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
