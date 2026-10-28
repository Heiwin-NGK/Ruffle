// Redirect /game to lobby — the actual game lives at /game/[roomCode]
import { redirect } from "next/navigation";

export default function GameIndexPage() {
  redirect("/lobby");
}
