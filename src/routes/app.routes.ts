import { Router } from "express";
import express from "express";
import {
  editPassword,
  login,
  register,
  user,
} from "../controllers/accounts.controller.js";
import { search, searchImages } from "../controllers/browser.controller.js";
import {
  createItem,
  deleteItem,
  getFolderContents,
  getItemById,
  moveItem,
  updateItem,
  uploadFromZip,
} from "../controllers/items.controller.js";
import { requireAuth } from "../utils/auth.middleware.js";

const router = Router();

// Middleware for handling binary zip uploads
const rawBinaryMiddleware = express.raw({
  type: [
    "application/octet-stream",
    "application/zip",
    "application/x-zip-compressed",
  ],
  limit: "100mb",
});
// account
router.post("/auth/login", login);
router.post("/auth/register", register);
router.get("/auth/user", user);
router.patch("/auth/edit-password", editPassword);

// browser
router.get("/browser/search", search);
router.get("/browser/images", searchImages);

// items (file explorer)
router.get("/items", getFolderContents);
router.get("/items/:id", getItemById);
router.post(
  "/items/upload-zip",
  rawBinaryMiddleware,
  requireAuth,
  uploadFromZip,
);
router.post("/items", requireAuth, createItem);
router.patch("/items/:id", requireAuth, updateItem);
router.delete("/items/:id", requireAuth, deleteItem);
router.patch("/items/:id/move", requireAuth, moveItem);

export default router;
