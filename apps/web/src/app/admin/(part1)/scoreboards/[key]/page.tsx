import { ScoreboardForm } from "../ScoreboardForm";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: key };
}

export default async function AdminScoreboardPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <ScoreboardForm eventKey={key} />;
}
