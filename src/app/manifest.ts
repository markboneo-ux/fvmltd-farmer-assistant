import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: "FVM Crop",
    description: PRODUCT_SUBTITLE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#1b4332",
    icons: [
      {
        src: "/brand/farmersvaluemart-logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/farmersvaluemart-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
