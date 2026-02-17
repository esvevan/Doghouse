let token: string | null = null;

export function setToken(value: string) {
  token = value;
}

export function getToken(): string | null {
  return token;
}