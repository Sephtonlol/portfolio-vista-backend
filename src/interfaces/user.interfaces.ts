export interface User {
  _id?: string;
  name: string;
  password: string;
  email: string;
  token?: string;
  session_expiration?: Date;
  disabled: boolean;
}

export type Gender = "female" | "male" | null;
