export interface User {
  _id?: string;
  password: string;
  token?: string;
  expiration?: Date;
  disabled: boolean;
}
