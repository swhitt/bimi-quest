import { permanentRedirect } from "next/navigation";

export default function ValidatePage() {
  permanentRedirect("/check");
}
