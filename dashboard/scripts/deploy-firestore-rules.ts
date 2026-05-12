/**
 * deploy-firestore-rules.ts
 *
 * Deploys firestore.rules to the project using the Firebase Rules REST API
 * and a service account JWT — no Firebase CLI login required.
 *
 * Usage (from dashboard dir):
 *   npx tsx scripts/deploy-firestore-rules.ts
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL!;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");

function base64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function makeJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    sub: CLIENT_EMAIL,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  }));
  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = base64url(sign.sign(PRIVATE_KEY));
  return `${unsigned}.${sig}`;
}

async function getAccessToken(): Promise<string> {
  const jwt = makeJwt();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function main() {
  console.log("🔑 Getting access token…");
  const token = await getAccessToken();
  console.log("✓ Token obtained");

  const rulesSource = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");

  // 1. Create ruleset
  console.log("📤 Uploading ruleset…");
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: rulesSource }] } }),
    }
  );
  const created = await createRes.json() as { name?: string; error?: unknown };
  if (!createRes.ok || !created.name) {
    throw new Error(`Create ruleset failed: ${JSON.stringify(created)}`);
  }
  const rulesetName = created.name;
  console.log(`✓ Ruleset created: ${rulesetName}`);

  // 2. Release (apply to Firestore database)
  const releaseName = `projects/${PROJECT_ID}/releases/cloud.firestore`;
  console.log("🚀 Releasing ruleset…");
  const releaseRes = await fetch(
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ release: { name: releaseName, rulesetName } }),
    }
  );
  const released = await releaseRes.json() as { name?: string; error?: unknown };
  if (!releaseRes.ok) {
    throw new Error(`Release failed: ${JSON.stringify(released)}`);
  }
  console.log("✅ Rules deployed successfully!");
  console.log("   Release:", released.name);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
