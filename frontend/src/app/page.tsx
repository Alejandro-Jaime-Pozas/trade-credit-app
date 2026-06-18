/**
 * Home route (`/`). Immediately redirects visitors to `/credit-cases`.
 * No UI is rendered here.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/credit-cases");
}
