"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const user = getFirebaseAuth().currentUser;
  const token = await user?.getIdToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
