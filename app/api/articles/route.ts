import { NextResponse } from "next/server";
import { listArticles, listAccounts } from "@/lib/store";

export async function GET(req: Request) {
  const user = req.headers.get("x-gzh-user") || "";
  const isAdmin = req.headers.get("x-gzh-role") === "admin";

  const accById = new Map(listAccounts().map((a) => [a.id, a]));
  const myIds = new Set(
    isAdmin ? accById.keys() : [...accById.values()].filter((a) => a.owner === user).map((a) => a.id)
  );

  const rows = listArticles().filter((a) => myIds.has(a.account_id));
  return NextResponse.json(
    rows.map((a) => ({
      ...a,
      account_name: accById.get(a.account_id)?.name || "?",
      owner: accById.get(a.account_id)?.owner || "?",
    }))
  );
}
