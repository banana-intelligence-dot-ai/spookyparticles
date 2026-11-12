import { redirect } from "next/navigation";

/** The map is retired for now: it answers nothing a table doesn't yet. */
export default function MapPage() {
  redirect("/app");
}
