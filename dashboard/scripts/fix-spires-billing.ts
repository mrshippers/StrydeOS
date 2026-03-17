/**
 * fix-spires-billing.ts
 *
 * Verifies and fixes billing/subscription status for Spires Physiotherapy.
 * Checks if clinic has Stripe customer, looks for active subscriptions, syncs to Firestore.
 *
 * Usage (from dashboard dir):
 *   npx tsx scripts/fix-spires-billing.ts
 *
 * Requires: STRIPE_SECRET_KEY in .env.local
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import Stripe from "stripe";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set in .env.local");
  process.exit(1);
}

const stripe = new Stripe(SECRET_KEY, { apiVersion: "2026-02-25.clover" });

// Initialize Firebase
const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ serviceAccountKey.json not found at:", serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  console.log("🔍 Fixing Spires Physiotherapy billing...\n");

  // Find Spires clinic
  const clinicsSnap = await db.collection("clinics").where("name", "==", "Spires Physiotherapy London").get();

  if (clinicsSnap.empty) {
    console.error("❌ Spires Physiotherapy clinic not found");
    process.exit(1);
  }

  const clinicDoc = clinicsSnap.docs[0];
  const clinicId = clinicDoc.id;
  const clinicData = clinicDoc.data();

  console.log(`📍 Found clinic: ${clinicData.name} (${clinicId})`);
  console.log(`   Owner email: ${clinicData.ownerEmail}`);

  const stripeCustomerId = clinicData.billing?.stripeCustomerId;
  console.log(`\n💳 Current Stripe customer ID: ${stripeCustomerId ? `✓ ${stripeCustomerId}` : "❌ None"}\n`);

  let customerId = stripeCustomerId;

  // Create Stripe customer if missing
  if (!customerId) {
    console.log("Creating new Stripe customer...");
    const customer = await stripe.customers.create({
      email: clinicData.ownerEmail,
      name: clinicData.name,
      metadata: { clinicId },
    });
    customerId = customer.id;
    console.log(`✓ Created: ${customerId}\n`);
  }

  // List all subscriptions for this customer
  console.log("Checking for active subscriptions...");
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  const activeStatuses = ["active", "trialing"];
  const activeSubscriptions = subs.data.filter((sub) => activeStatuses.includes(sub.status));

  if (activeSubscriptions.length === 0) {
    console.log("❌ No active subscriptions found for this customer\n");
    console.log("ℹ️  To add a subscription:");
    console.log("   1. Go to /billing in the app");
    console.log("   2. Click 'Add Intelligence', 'Add Pulse', or 'Add Ava'");
    console.log("   3. Complete checkout");
    console.log("   4. The webhook will sync the subscription automatically\n");
  } else {
    console.log(`✓ Found ${activeSubscriptions.length} active subscription(s)\n`);

    // Collect all items from active subscriptions
    const allItems: Array<{ price: { id: string } }> = [];
    for (const sub of activeSubscriptions) {
      for (const item of sub.items.data) {
        const priceId = typeof item.price === "string" ? item.price : item.price.id;
        allItems.push({ price: { id: priceId } });
      }
    }

    // Derive feature flags from subscription items
    const priceToFlagsMap: Record<string, string[]> = {
      // Add Stripe price IDs and their corresponding flags
      // This would normally be built from env vars, but we'll check the active subs instead
    };

    const flags: Record<string, boolean> = {
      intelligence: false,
      continuity: false,
      receptionist: false,
    };

    for (const item of allItems) {
      const priceId = item.price.id;
      console.log(`  - Price ID: ${priceId}`);
      // In production, you'd map this to flags via env vars
      // For now, just log it
    }

    // Get period end from first active subscription
    const primary = activeSubscriptions[0];
    const periodEnd = new Date(primary.items.data[0].billing_details?.period_end || primary.billing_cycle_anchor * 1000);

    console.log(`\nSyncing to Firestore...`);
    await clinicDoc.ref.update({
      "billing.stripeCustomerId": customerId,
      "billing.subscriptionId": primary.id,
      "billing.subscriptionStatus": primary.status,
      "billing.currentPeriodEnd": periodEnd.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log("✓ Firestore updated\n");
  }

  // Update customer ID if we created a new one
  if (!stripeCustomerId && customerId) {
    console.log("Saving Stripe customer ID to Firestore...");
    await clinicDoc.ref.update({
      "billing.stripeCustomerId": customerId,
      updatedAt: new Date().toISOString(),
    });
    console.log("✓ Updated\n");
  }

  console.log("✅ Done");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
