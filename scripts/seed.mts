// Demo data for a dev database: one verified owner, a restaurant with the sample menu and floor,
// and two extra staff. Fake people only. Runs the same code paths as real sign-up/onboarding.
//   npx tsx --conditions=react-server --env-file=.env.local scripts/seed.mts
import { auth } from "../src/server/auth.ts";
import { pool } from "../src/server/db.ts";
import { addDemoStaff, createOrg } from "../src/server/orgs.ts";

const email = process.env.SEED_EMAIL ?? "demo.owner@example.com";
const password = process.env.SEED_PASSWORD ?? "demo-password-123";

const existing = await pool().query('select id from "user" where email = $1', [email]);
if (existing.rowCount) {
  console.log(`seed: ${email} already exists, nothing to do`);
} else {
  const { user } = await auth().api.signUpEmail({ body: { name: "Demo Owner", email, password } });
  await pool().query('update "user" set "emailVerified" = true where id = $1', [user.id]);
  const { orgId } = await createOrg(user.id, {
    restaurantName: "Demo Kitchen", outletName: "Navrangpura", address: "12 Example Road", city: "Ahmedabad",
    stateCode: "24", gstScheme: "regular", gstin: "24ABCDE1234F1Z5", ownerName: "Asha (Owner)", ownerPin: "1111", sampleMenu: true,
  });
  await addDemoStaff(orgId);
  console.log(`seed: sign in at /login as ${email} / ${password}`);
  console.log("seed: till PINs: owner 1111, cashier 2222, captain 3333 (pair the browser from /pos/pair)");
}
await pool().end();
