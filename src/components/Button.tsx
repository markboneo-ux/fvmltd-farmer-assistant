import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-canopy text-white shadow-[0_10px_24px_-12px_rgba(27,67,50,0.65)] hover:bg-leaf",
  secondary:
    "bg-surface text-canopy ring-1 ring-line hover:bg-sky/60",
  ghost: "bg-transparent text-leaf hover:bg-canopy/8",
};

type CommonProps = {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
};

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = CommonProps & {
  href: string;
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonAsButton | ButtonAsLink) {
  const classes = `inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] ${variants[variant]} ${className}`;

  if ("href" in props && props.href) {
    const { href } = props;
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as ButtonAsButton;
  return (
    <button type={buttonProps.type ?? "button"} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
