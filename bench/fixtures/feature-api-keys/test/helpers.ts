import { createOrg, createUser, __resetDbForTests } from "../src/persistence/db.ts";
import { hashSecret } from "../src/auth/hash.ts";
import type { User, Org } from "../src/types.ts";

export function resetAndSeed(): { org: Org; otherOrg: Org; admin: User; member: User } {
  __resetDbForTests();
  const org = createOrg("Acme Inc");
  const otherOrg = createOrg("Globex Corp");
  const admin = createUser({
    orgId: org.id,
    email: "admin@acme.test",
    role: "admin",
    passwordHash: hashSecret("correct horse battery staple"),
  });
  const member = createUser({
    orgId: org.id,
    email: "member@acme.test",
    role: "member",
    passwordHash: hashSecret("hunter2hunter2"),
  });
  return { org, otherOrg, admin, member };
}
