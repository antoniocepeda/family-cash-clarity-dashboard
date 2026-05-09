const DEFAULT_AUTHORIZED_EMAILS = ["antonio@htxwebworks.com"];

export function getAuthorizedEmails() {
  const configuredEmails = process.env.NEXT_PUBLIC_AUTHORIZED_EMAILS;
  const emails = configuredEmails
    ? configuredEmails.split(",").map((email) => email.trim()).filter(Boolean)
    : DEFAULT_AUTHORIZED_EMAILS;

  return emails.map((email) => email.toLowerCase());
}

export function isAuthorizedEmail(email: string | null | undefined) {
  if (!email) return false;
  return getAuthorizedEmails().includes(email.toLowerCase());
}
