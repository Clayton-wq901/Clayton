import { timingSafeEqual } from "node:crypto";

function equalSecrets(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

/** Valida chamadas feitas pelos agendamentos externos sem reutilizar chaves públicas do Supabase. */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) return false;

  const authorization = request.headers.get("authorization");
  const provided =
    request.headers.get("x-cron-secret") ??
    (authorization?.replace(/^Bearer\s+/i, "") ?? "");

  return Boolean(provided) && equalSecrets(provided, expected);
}