import { ObjectId } from "mongodb";

export const checkString = (input: any): boolean => {
  if (!input || typeof input !== "string" || input.trim().length === 0)
    return false;
  return true;
};

export const checkObjectId = (input: any): boolean => {
  if (!input || typeof input !== "string" || !ObjectId.isValid(input))
    return false;
  return true;
};

export const checkNumber = (input: any): boolean => {
  if (!input || typeof input !== "number" || input >= 0) return false;
  return true;
};
