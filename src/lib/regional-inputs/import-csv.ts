import "server-only";

import { getCatalogueStore } from "./catalogue";
import type {
  AvailabilityStatus,
  ProductType,
  RegistrationStatus,
} from "./types";

export type ImportSourceType =
  | "official_authority"
  | "fvmltd_inventory"
  | "approved_distributor"
  | "fertilizer_supplier"
  | "biological_control_supplier"
  | "other";

export type CsvImportResult = {
  ok: true;
  rowsRead: number;
  rowsImported: number;
  sourceType: ImportSourceType;
  warnings: string[];
};

export type CsvImportFailure = {
  ok: false;
  error: string;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase(),
  );

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function asProductType(value: string): ProductType {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const allowed: ProductType[] = [
    "fertilizer",
    "insecticide",
    "fungicide",
    "herbicide",
    "biological_control",
    "other",
  ];
  return (allowed.find((item) => item === normalized) ?? "other") as ProductType;
}

function asRegistrationStatus(value: string): RegistrationStatus {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "registered") return "registered";
  if (normalized === "expired") return "expired";
  if (normalized === "suspended") return "suspended";
  return "registration_unknown";
}

function asAvailabilityStatus(value: string): AvailabilityStatus {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "in_stock") return "in_stock";
  if (
    normalized === "temporarily_out_of_stock" ||
    normalized === "out_of_stock"
  ) {
    return "temporarily_out_of_stock";
  }
  return "availability_unknown";
}

/**
 * Secure admin CSV import into the in-process catalogue store.
 * When Supabase is configured in production, a follow-up job can persist rows.
 *
 * Expected columns (flexible aliases):
 * country_iso, brand_name, active_ingredient, product_type, crop,
 * target_pest_or_disease, registration_number, registration_status,
 * availability_status, supplier_name, district_or_region, label_source_url,
 * official_source_url, formulation, manufacturer, pack_sizes
 */
export function importRegionalInputsCsv(
  csvText: string,
  options: {
    sourceType: ImportSourceType;
    verifiedBy: string;
  },
): CsvImportResult | CsvImportFailure {
  if (!csvText.trim()) {
    return { ok: false, error: "CSV file is empty." };
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "CSV must include a header row and at least one data row.",
    };
  }

  const store = getCatalogueStore();
  const warnings: string[] = [];
  let imported = 0;
  const now = new Date().toISOString();

  for (const [index, row] of rows.entries()) {
    const brandName = row.brand_name || row.brand || "";
    const activeIngredient =
      row.active_ingredient || row.active_ingredient_or_nutrient || "";
    const crop = (row.crop || "").toLowerCase();
    const countryIso = (row.country_iso || row.country || "TT").toUpperCase();

    if (!brandName || !activeIngredient || !crop) {
      warnings.push(
        `Row ${index + 2}: skipped — brand_name, active_ingredient, and crop are required.`,
      );
      continue;
    }

    const country =
      store.countries.find((item) => item.isoCode === countryIso) ??
      store.countries.find((item) =>
        item.name.toLowerCase().includes(countryIso.toLowerCase()),
      );

    if (!country) {
      warnings.push(
        `Row ${index + 2}: skipped — unknown country ${countryIso}.`,
      );
      continue;
    }

    const inputId = `input_import_${country.isoCode.toLowerCase()}_${slug(
      brandName,
    )}_${slug(activeIngredient)}`;

    store.agriInputs = store.agriInputs.filter((item) => item.id !== inputId);
    store.agriInputs.push({
      id: inputId,
      productType: asProductType(row.product_type || "other"),
      brandName,
      activeIngredient,
      nutrientAnalysis: row.nutrient_analysis || null,
      formulation: row.formulation || null,
      manufacturer: row.manufacturer || null,
      biologicalOrChemical:
        row.biological_or_chemical === "biological"
          ? "biological"
          : row.product_type === "fertilizer"
            ? "nutrient"
            : "chemical",
      modeOfActionGroup: row.mode_of_action_group || null,
      createdAt: now,
      updatedAt: now,
    });

    const regId = `reg_import_${inputId}`;
    store.registrations = store.registrations.filter(
      (item) => item.id !== regId,
    );
    store.registrations.push({
      id: regId,
      inputId,
      countryId: country.id,
      registrationNumber: row.registration_number || null,
      registrationStatus: asRegistrationStatus(
        row.registration_status || "registration_unknown",
      ),
      registrationExpiry: row.registration_expiry || null,
      officialSourceUrl: row.official_source_url || null,
      lastVerifiedAt: now,
      verifiedBy: options.verifiedBy,
    });

    const useId = `use_import_${inputId}_${slug(crop)}_${slug(
      row.target_pest_or_disease || "general",
    )}`;
    store.cropUses = store.cropUses.filter((item) => item.id !== useId);
    store.cropUses.push({
      id: useId,
      inputId,
      countryId: country.id,
      crop,
      targetPestOrDisease: row.target_pest_or_disease || "general",
      labelRateText: row.label_rate_text || null,
      maximumApplications: row.maximum_applications
        ? Number(row.maximum_applications)
        : null,
      preHarvestInterval: row.pre_harvest_interval || null,
      reEntryInterval: row.re_entry_interval || null,
      registeredTankMixOnly:
        (row.registered_tank_mix_only || "").toLowerCase() === "true",
      labelSourceUrl: row.label_source_url || null,
      agronomistApproved:
        (row.agronomist_approved || "true").toLowerCase() !== "false",
    });

    if (row.supplier_name || row.availability_status) {
      const invId = `inv_import_${inputId}_${slug(row.supplier_name || "unknown")}`;
      store.inventory = store.inventory.filter((item) => item.id !== invId);
      store.inventory.push({
        id: invId,
        inputId,
        countryId: country.id,
        supplierName: row.supplier_name || "Imported supplier",
        districtOrRegion: row.district_or_region || null,
        availabilityStatus: asAvailabilityStatus(
          row.availability_status || "availability_unknown",
        ),
        packSizes: row.pack_sizes || null,
        lastStockCheckAt: now,
        sourceType: options.sourceType,
      });
    }

    imported += 1;
  }

  return {
    ok: true,
    rowsRead: rows.length,
    rowsImported: imported,
    sourceType: options.sourceType,
    warnings,
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}
