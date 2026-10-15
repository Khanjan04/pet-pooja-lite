import { signedInUser } from "@/server/actors";
import { body, json, route, unauthorized } from "@/server/http";
import { CreateOrgInput, createOrg } from "@/server/orgs";
import { rateLimit } from "@/server/ratelimit";

// S02: create the restaurant for a signed-in, verified user.
export const POST = route(async (req: Request) => {
  const user = await signedInUser(req);
  if (!user.emailVerified) throw unauthorized("Confirm your email first.", "verify_email");
  await rateLimit(`org-create:${user.id}`, 5, 3600);
  const input = await body(req, CreateOrgInput);
  return json(await createOrg(user.id, input), 201);
});
