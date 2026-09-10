import type { AccessDecision } from "@convex/contests";
import { Alert, AlertDescription, AlertTitle, Panel, TitleRow } from "@moj/ui";
import { Lock } from "lucide-react";
import Link from "next/link";

type PrivateAccess = Extract<AccessDecision, { kind: "privateContest" }>;

/** `contest/private.html`: who may open this contest, and nothing else. */
export function PrivateContest({ access }: { access: PrivateAccess }) {
  const { organizations, classes, isPrivate, isOrganizationPrivate } = access;

  const organizationsLead =
    organizations.length > 0
      ? isPrivate
        ? "Additionally, only the following organizations may access this contest:"
        : "Only the following organizations may access this contest:"
      : null;

  const classesLead =
    classes.length > 0
      ? organizations.length > 0
        ? "Alternatively, the following classes may access this contest:"
        : isPrivate
          ? "Additionally, only the following classes may access this contest:"
          : "Only the following classes may access this contest:"
      : null;

  return (
    <>
      <TitleRow title={access.name} />
      <Alert variant="info">
        <Lock size={16} aria-hidden />
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>
          {isPrivate ? "This contest is private to specific users." : "This contest is restricted."}
        </AlertDescription>
      </Alert>

      {isOrganizationPrivate && (organizationsLead || classesLead) ? (
        <div className="mt-6 grid gap-4">
          {organizationsLead ? (
            <Panel title="Organizations" bodyClassName="p-0">
              <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                {organizationsLead}
              </p>
              <ul>
                {organizations.map((organization) => (
                  <li key={organization._id} className="border-b border-border px-3 py-2 last:border-b-0">
                    <Link href={`/organization/${organization.slug}/`}>{organization.name}</Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {classesLead ? (
            <Panel title="Classes" bodyClassName="p-0">
              <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">{classesLead}</p>
              <ul>
                {classes.map((klass) => (
                  <li key={klass._id} className="border-b border-border px-3 py-2 last:border-b-0">
                    {klass.name}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
