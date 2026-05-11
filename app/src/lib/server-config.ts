import "server-only";

const PLAID_ENVS = ["sandbox", "development", "production"] as const;

export type PlaidEnvironment = (typeof PLAID_ENVS)[number];

export type PlaidServerConfig = {
  clientId: string;
  secret: string;
  env: PlaidEnvironment;
};

export class PlaidConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaidConfigurationError";
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new PlaidConfigurationError(`Missing required server environment variable: ${name}`);
  }

  return value;
}

function readPlaidEnv(): PlaidEnvironment {
  const value = readRequiredEnv("PLAID_ENV");

  if (!PLAID_ENVS.includes(value as PlaidEnvironment)) {
    throw new PlaidConfigurationError(
      `Invalid PLAID_ENV value. Expected one of: ${PLAID_ENVS.join(", ")}`,
    );
  }

  return value as PlaidEnvironment;
}

export function getPlaidServerConfig(): PlaidServerConfig {
  return {
    clientId: readRequiredEnv("PLAID_CLIENT_ID"),
    secret: readRequiredEnv("PLAID_SECRET"),
    env: readPlaidEnv(),
  };
}
