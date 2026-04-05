import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./token.utils.js";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const verifiedUser = await verifyToken(req.headers.authorization);
    if (!verifiedUser) {
      return res.status(401).json({ error: "Invalid token." });
    }

    (req as any).user = verifiedUser;
    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Auth verification failed." });
  }
};
