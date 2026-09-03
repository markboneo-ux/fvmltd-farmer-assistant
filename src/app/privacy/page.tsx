import { SimpleLegalPage } from "@/components/SimpleLegalPage";
import { PRIVACY_PAGE_BODY } from "@/lib/privacy/copy";

export default function PrivacyPage() {
  return <SimpleLegalPage title="Privacy" body={PRIVACY_PAGE_BODY} />;
}
