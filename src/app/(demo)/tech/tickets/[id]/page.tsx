import { TechTicketDetail } from "@/components/demo/tech-workspace";

export default async function TechTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TechTicketDetail ticketId={id} />;
}
