import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
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

export function getPlaidClient() {
  const config = getPlaidServerConfig();

  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[config.env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
        },
      },
    })
  );
}

function tokenCipherKey() {
  const config = getPlaidServerConfig();
  return createHash("sha256").update(`${config.clientId}:${config.secret}`).digest();
}

export function encryptPlaidAccessToken(accessToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptPlaidAccessToken(encryptedAccessToken: string) {
  const [version, iv, tag, encrypted] = encryptedAccessToken.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported Plaid token encryption format");
  }

  const decipher = createDecipheriv("aes-256-gcm", tokenCipherKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
