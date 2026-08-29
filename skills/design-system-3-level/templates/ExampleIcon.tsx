import Icon, { type IconProps } from '../Icon';

type Props = Omit<IconProps, 'viewBox' | 'children'>;

/**
 * Paste SVG path `d` (and optional extra shapes) from Figma / SVG export.
 * Keep viewBox in sync with the source SVG.
 */
export default function ExampleIcon(props: Props) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path d="M12 5v14M5 12h14" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  );
}
