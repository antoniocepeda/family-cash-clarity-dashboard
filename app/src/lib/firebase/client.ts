"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const configuredFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseClientConfig = Object.values(configuredFirebaseConfig).every(Boolean);

const firebaseConfig = {
  apiKey: configuredFirebaseConfig.apiKey ?? "build-placeholder-api-key",
  authDomain: configuredFirebaseConfig.authDomain ?? "build-placeholder.firebaseapp.com",
  projectId: configuredFirebaseConfig.projectId ?? "build-placeholder",
  appId: configuredFirebaseConfig.appId ?? "1:000000000000:web:0000000000000000000000",
};

export function getFirebaseAuth() {
  if (!hasFirebaseClientConfig && typeof window !== "undefined") {
    throw new Error("Missing Firebase client environment variables.");
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}
