import { notFound } from "next/navigation";

/** Unknown localized paths render the localized 404 page. */
export default function CatchAllPage() {
  notFound();
}
