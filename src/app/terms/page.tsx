import { SimpleLegalPage } from "@/components/SimpleLegalPage";
import { TERMS_PAGE_BODY } from "@/lib/privacy/copy";

export default function TermsPage() {
  return <SimpleLegalPage title="Terms" body={TERMS_PAGE_BODY} />;
}
