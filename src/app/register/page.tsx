import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";

const fields = [
  { id: "fullName", label: "Full name", placeholder: "Amina Okello", type: "text" },
  { id: "phone", label: "Phone number", placeholder: "+255 712 555 014", type: "tel" },
  { id: "village", label: "Village / ward", placeholder: "Mtwara Rural", type: "text" },
  { id: "region", label: "Region / country", placeholder: "Mtwara, Tanzania", type: "text" },
  { id: "farmSize", label: "Farm size", placeholder: "1.8 hectares", type: "text" },
];

export default function RegisterPage() {
  return (
    <AppShell
      title="Farmer registration"
      subtitle="Tell us about your farm so crop checks can be tailored to your fields."
      showBack
      backHref="/"
      footer={
        <div className="space-y-3">
          <Button href="/dashboard">Continue to dashboard</Button>
          <p className="text-center text-xs text-muted">
            Placeholder form only — no accounts are created in this preview.
          </p>
        </div>
      }
    >
      <div className="space-y-4">
        {fields.map((field) => (
          <label key={field.id} className="block space-y-1.5" htmlFor={field.id}>
            <span className="text-sm font-medium text-ink">{field.label}</span>
            <input
              id={field.id}
              name={field.id}
              type={field.type}
              defaultValue={field.placeholder}
              className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none ring-canopy/30 transition focus:ring-2"
            />
          </label>
        ))}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Main crops grown</legend>
          <div className="flex flex-wrap gap-2">
            {["Cassava", "Maize", "Tomato", "Banana", "Beans"].map((crop, index) => (
              <span
                key={crop}
                className={`inline-flex items-center rounded-xl px-3 py-2 text-sm ring-1 ${
                  index < 3
                    ? "bg-canopy text-white ring-canopy"
                    : "bg-surface text-ink ring-line"
                }`}
              >
                {crop}
              </span>
            ))}
          </div>
        </fieldset>
      </div>
    </AppShell>
  );
}
