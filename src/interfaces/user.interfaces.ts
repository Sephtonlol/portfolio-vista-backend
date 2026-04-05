export interface User {
  _id?: string;
  password: string;
  token?: string;
  disabled: boolean;
}
