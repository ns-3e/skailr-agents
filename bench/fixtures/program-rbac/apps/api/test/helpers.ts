import { createOrg, createUser, addMember, __resetDbForTests } from "../../../packages/db/src/db.ts";
import { hashSecret } from "../src/auth/hash.ts";
import type { Org, User } from "../../../packages/contracts/src/types.ts";

export function resetAndSeed(): { org: Org; otherOrg: Org; admin: User; member: User; outsider: User } {
  __resetDbForTests();
  const org = createOrg("Acme Inc");
  const otherOrg = createOrg("Globex Corp");
  const admin = createUser({ email: "admin@acme.test", passwordHash: hashSecret("correct horse battery staple") });
  const member = createUser({ email: "member@acme.test", passwordHash: hashSecret("hunter2hunter2") });
  const outsider = createUser({ email: "outsider@globex.test", passwordHash: hashSecret("outsider-pass-1") });
  addMember(org.id, admin.id, "admin");
  addMember(org.id, member.id, "member");
  addMember(otherOrg.id, outsider.id, "admin");
  return { org, otherOrg, admin, member, outsider };
}
