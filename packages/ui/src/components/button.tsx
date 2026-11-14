import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./button.module.css";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "xl"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

type ButtonTone = "default" | "muted" | "destructive";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 背景を持たないボタン（ghost・link）の文字の色。muted は目立たせたくない操作、destructive は消す操作 */
  tone?: ButtonTone;
  /** 背景を持たないボタン（ghost）の文字の左端を、上下に並ぶ欄や文字の左端にそろえる */
  flush?: boolean;
};

/**
 * ボタンの見た目を、ボタン以外の要素（ボタンの形をしたリンクなど）にも当てるための props。
 * 見た目の違いは data 属性で切り替えるので、className と一緒に要素へ広げて渡す。
 */
const buttonStyleProps = ({
  variant = "default",
  size = "default",
  tone = "default",
  flush = false,
}: ButtonStyleOptions = {}) => ({
  className: styles.Button,
  "data-slot": "button",
  "data-variant": variant,
  "data-size": size,
  "data-tone": tone,
  "data-flush": flush || undefined,
});

function Button({
  className,
  variant = "default",
  size = "default",
  tone = "default",
  flush = false,
  ...props
}: ButtonPrimitive.Props & ButtonStyleOptions) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      data-flush={flush || undefined}
      className={cn(styles.Button, className)}
      {...props}
    />
  );
}

export { Button, buttonStyleProps };
export type { ButtonSize, ButtonTone, ButtonVariant };
