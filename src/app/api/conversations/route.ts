import { getDb, createConversation, listConversations } from "@/lib/db";

export async function GET() {
  const db = getDb();
  return Response.json(listConversations(db));
}

export async function POST(req: Request) {
  let body: { title?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const db = getDb();
  const conv = createConversation(db, body.title);
  return Response.json(conv, { status: 201 });
}
