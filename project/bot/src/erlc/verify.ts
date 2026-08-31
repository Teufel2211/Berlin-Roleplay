import { createPublicKey, verify } from "node:crypto";

/**
 * Ed25519-Signatur-Prüfung für eingehende ER:LC-Webhook-Events.
 * Payload = Roh-Body, Signatur aus Header (hex), Key-Public-Key (PEM/PKIX).
 */
export function verifyEd25519(
  body: Buffer,
  signatureHex: string,
  publicKeyPem: string,
  algorithm = "ed25519",
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    const sig = Buffer.from(signatureHex, "hex");
    return verify(algorithm, body, key, sig);
  } catch {
    return false;
  }
}