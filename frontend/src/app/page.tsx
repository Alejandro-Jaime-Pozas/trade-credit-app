/**
 * Home route (`/`). Immediately redirects visitors to `/dashboard`.
 * No UI is rendered here.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
