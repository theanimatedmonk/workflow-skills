import type { CSSProperties, SVGAttributes } from 'react';
import './Icon.css';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  children: React.ReactNode;
  viewBox: string;
  /** xs 16×16, sm 20×20, md 24×24, lg 32×32 */
  size?: IconSize;
  /** e.g. `currentColor` or `var(--color-text-primary)` */
  fill?: string;
  /** e.g. `currentColor` or `var(--color-text-muted)` */
  stroke?: string;
  /** Accessible name; omit for decorative icons */
  label?: string;
}

export default function Icon({
  size = 'md',
  fill = 'none',
  stroke = 'currentColor',
  viewBox,
  label,
  className,
  children,
  style,
  ...rest
}: IconProps) {
  const iconStyle = {
    '--icon-fill': fill,
    '--icon-stroke': stroke,
    ...style,
  } as CSSProperties;

  return (
    <svg
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={['icon', `icon--${size}`, className].filter(Boolean).join(' ')}
      style={iconStyle}
      {...rest}
    >
      {children}
    </svg>
  );
}
