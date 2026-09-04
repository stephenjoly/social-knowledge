import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "outline";
  size?: "default" | "icon";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "ghost", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
      {...props}
    />
  ),
);

Button.displayName = "Button";
