// DOC: Existing organization-settings page composition. This is where the
// task's required invitations UI (pending-invitations list, invite form,
// revoke action, role-change control) should be added — compose new
// components here the same way renderMembersList is composed below.
import type { PublicMember } from "../../../../packages/contracts/src/types.ts";
import { renderMembersList } from "../components/MembersList.ts";

export interface OrganizationSettingsViewModel {
  orgName: string;
  members: PublicMember[];
}

export function renderOrganizationSettingsPage(vm: OrganizationSettingsViewModel): string {
  return [
    `<h1>${vm.orgName} — Settings</h1>`,
    `<section id="members"><h2>Members</h2>${renderMembersList(vm.members)}</section>`,
    // Invitations section intentionally not implemented yet.
  ].join("\n");
}
