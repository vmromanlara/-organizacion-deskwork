import { RequesterTicketDetail } from "@/components/demo/requester-ticket-detail";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequesterTicketDetail ticketId={id} />;
}
