import { getDb, getConversationWithMessages, deleteConversation } from "@/lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const result = getConversationWithMessages(db, id);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(result);
}

// Bug 10: avoid loading all messages just to check existence -- use deleteConversation result
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const deleted = deleteConversation(db, id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
