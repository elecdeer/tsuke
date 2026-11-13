import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@tsuke/ui/lib/utils";

// 見た目は UI SDK（https://ui-sdk.dev）のボタンを借りている。枠は内側の輪（inset-ring）で引き、
// 押した瞬間に少し縮めて、押せたことを示す。影は浮く面にだけ付けるので、ボタンには付けない（docs/design.md）
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center text-sm font-medium whitespace-nowrap transition-[scale,box-shadow,background-color,color] duration-100 outline-none select-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none aria-invalid:inset-ring aria-invalid:inset-ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // 主ボタンは赤のベタ塗り（docs/design.md）。使えない間は灰色にして、押せないことを色でも示す
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_86%,var(--background))] disabled:bg-muted disabled:text-foreground/40 disabled:inset-ring disabled:inset-ring-border",
        outline:
          "bg-background inset-ring inset-ring-foreground hover:bg-muted aria-expanded:bg-muted disabled:text-foreground/40 disabled:inset-ring-border",
        secondary:
          "bg-muted text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_7%,var(--muted))] aria-expanded:bg-[color-mix(in_oklab,var(--foreground)_7%,var(--muted))] disabled:text-foreground/40",
        ghost: "hover:bg-muted aria-expanded:bg-muted disabled:text-foreground/40",
        destructive:
          "bg-background text-destructive inset-ring inset-ring-destructive hover:bg-destructive/10 disabled:text-foreground/40 disabled:inset-ring-border",
        link: "text-primary underline-offset-4 hover:underline active:not-aria-[haspopup]:scale-100",
      },
      size: {
        default:
          "h-8.5 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.75 text-[0.8125rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9.5 gap-2 px-4.5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-8.5",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
