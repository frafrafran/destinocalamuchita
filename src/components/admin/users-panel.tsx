"use client";

import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createUserAction, updateUserAction } from "@/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/primitives";
import { Table, Td, Th, Tr } from "./ui";
import { useAction } from "./use-action";

type Role = "ADMIN" | "MANAGER" | "OWNER";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  ownerId: string | null;
  isActive: boolean;
  lastLogin: string | null;
}

type Draft = { id: string | null; name: string; email: string; role: Role; ownerId: string; isActive: boolean; password: string };

export function UsersPanel({ users, owners, currentUserId }: { users: UserRow[]; owners: { id: string; name: string }[]; currentUserId: string }) {
  const t = useTranslations("admin.settings.users");
  const tRoles = useTranslations("admin.header.roles");
  const tc = useTranslations("common");
  const action = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);

  function save() {
    if (!draft) return;
    const onSuccess = () => setDraft(null);
    if (draft.id) {
      const id = draft.id;
      action.run(() => updateUserAction(id, { role: draft.role, ownerId: draft.ownerId || undefined, isActive: draft.isActive, newPassword: draft.password }), { onSuccess });
    } else {
      action.run(() => createUserAction({ name: draft.name, email: draft.email, role: draft.role, ownerId: draft.ownerId || undefined, password: draft.password }), { onSuccess });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ id: null, name: "", email: "", role: "MANAGER", ownerId: "", isActive: true, password: "" })}>
          <PlusIcon size={15} />
          {t("new")}
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>{t("name")}</Th>
            <Th>{t("role")}</Th>
            <Th>{t("lastLogin")}</Th>
            <Th>{t("status")}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <Tr key={user.id}>
              <Td>
                <p className="font-medium">{user.name}</p>
                <p className="text-xs text-ink-3">{user.email}</p>
              </Td>
              <Td>{tRoles(user.role)}</Td>
              <Td className="text-ink-2">{user.lastLogin ?? "-"}</Td>
              <Td>
                <Badge tone={user.isActive ? "success" : "muted"}>{user.isActive ? t("active") : t("inactive")}</Badge>
              </Td>
              <Td className="text-right">
                <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={() => setDraft({ id: user.id, name: user.name, email: user.email, role: user.role, ownerId: user.ownerId ?? "", isActive: user.isActive, password: "" })}>
                  <PencilSimpleIcon size={15} />
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        {draft ? (
          <DialogContent
            title={draft.id ? draft.name : t("new")}
            description={t("roleHint")}
            closeLabel={tc("close")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  {tc("cancel")}
                </Button>
                <Button loading={action.pending} onClick={save}>
                  {tc("save")}
                </Button>
              </>
            }
          >
            <div className="grid gap-4">
              {action.error ? <Notice tone="danger">{action.error}</Notice> : null}
              {!draft.id ? (
                <>
                  <Field label={t("name")} error={action.fieldErrors.name}>{(props) => <Input {...props} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
                  <Field label={t("email")} error={action.fieldErrors.email}>
                    {(props) => <Input {...props} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />}
                  </Field>
                </>
              ) : null}
              <Field label={t("role")}>
                {(props) => (
                  <Select {...props} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })} disabled={draft.id === currentUserId}>
                    {(["ADMIN", "MANAGER", "OWNER"] as const).map((role) => (
                      <option key={role} value={role}>
                        {tRoles(role)} ({t(`roles.${role}`)})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {draft.role === "OWNER" ? (
                <Field label={t("owner")} error={action.fieldErrors.ownerId}>
                  {(props) => (
                    <Select {...props} value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}>
                      <option value="">{t("chooseOwner")}</option>
                      {owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field label={draft.id ? t("newPassword") : t("password")} hint={t("passwordHint")} error={action.fieldErrors.password ?? action.fieldErrors.newPassword}>
                {(props) => <Input {...props} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />}
              </Field>
              {draft.id && draft.id !== currentUserId ? (
                <label className="flex items-center gap-3 text-sm">
                  <Switch checked={draft.isActive} onCheckedChange={(isActive) => setDraft({ ...draft, isActive })} />
                  {t("activeLabel")}
                </label>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
