export type FileNodeType =
  | "directory"
  | "md"
  | "mp4"
  | "mp3"
  | "png"
  | "shortcut"
  | "url";

export interface FileNode {
  _id?: string; // MongoDB ID

  name: string;

  type: FileNodeType;

  parentId: string | null; // null = root folder

  content?: string; // for md/text files
  url?: string; // for "url" type
  shortcutTo?: string; // reference to another FileNode

  createdAt?: Date;
  updatedAt?: Date;
}
