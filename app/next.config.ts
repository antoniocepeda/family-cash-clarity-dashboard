import type { NextConfig } from "next";

type FirebaseWebAppConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
};

function getFirebaseWebAppConfig(): FirebaseWebAppConfig {
  if (!process.env.FIREBASE_WEBAPP_CONFIG) return {};

  try {
    return JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG) as FirebaseWebAppConfig;
  } catch {
    return {};
  }
}

const firebaseWebAppConfig = getFirebaseWebAppConfig();

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? firebaseWebAppConfig.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? firebaseWebAppConfig.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? firebaseWebAppConfig.projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? firebaseWebAppConfig.appId,
  },
};

export default nextConfig;
