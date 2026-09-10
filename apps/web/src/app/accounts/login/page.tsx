import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div id="content-body">
      <LoginForm next={params.next ?? "/"} initialError={params.error} />
    </div>
  );
}
