import {
  COMPANY_NAME,
  LOGO_HEIGHT,
  LOGO_SRC,
  LOGO_WIDTH,
} from "@/lib/brand";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

/** Official Farmersvaluemart Ltd mark — exact uploaded PNG, no redraw. */
export function BrandLogo({
  className = "h-9 w-auto sm:h-10",
  priority = false,
}: BrandLogoProps) {
  return (
    // Exact official asset from /public/brand; avoid next/image recompression.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt={COMPANY_NAME}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      className={className}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}
