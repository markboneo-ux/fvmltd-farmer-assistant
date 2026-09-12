import { FarmerProfileForm } from "@/components/account/FarmerProfileForm";
import { COUNTRY_OPTIONS } from "@/data/countries";

export default function AccountProfilePage() {
  return <FarmerProfileForm countries={[...COUNTRY_OPTIONS]} />;
}
