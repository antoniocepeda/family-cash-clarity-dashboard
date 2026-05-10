import "server-only";

import { getPlaidServerConfig } from "@/lib/server-config";

const PLAID_BASE_URLS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

export function getPlaidBaseUrl(): string {
  const config = getPlaidServerConfig();

  return PLAID_BASE_URLS[config.env];
}

export function getPlaidRequestCredentials(): {
  client_id: string;
  secret: string;
} {
  const config = getPlaidServerConfig();

  return {
    client_id: config.clientId,
    secret: config.secret,
  };
}
