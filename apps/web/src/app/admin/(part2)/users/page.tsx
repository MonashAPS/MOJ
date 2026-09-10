import { TitleRow } from "@moj/ui";
import { Suspense } from "react";
import { UsersTable } from "./UsersTable";

export const metadata = { title: "Users" };

export default function AdminUsersPage() {
  return (
    <>
      <TitleRow title="Users" />
      <Suspense fallback={null}>
        <UsersTable />
      </Suspense>
    </>
  );
}
