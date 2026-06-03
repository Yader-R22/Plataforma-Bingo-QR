import { setAuthTokenGetter } from "@workspace/api-client-react";

export function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("token", token);
}

export function removeAuthToken(): void {
  localStorage.removeItem("token");
}

// Initialize the API client with the auth token getter
setAuthTokenGetter(getAuthToken);
