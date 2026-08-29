/**
 * Figma-style Design tab: map authored CSS props into visual sections.
 * Layout (flex/grid/gap/padding) is rendered by design-layout.js.
 */

import { LAYOUT_EDITOR_PROPS } from './design-layout.js';

/** @typedef {{ property: string, label: string }} DesignField */
/** @typedef {{ id: string, title: string, fields: DesignField[] }} DesignSectionDef */

/** @type {DesignSectionDef[]} */
export const DESIGN_SECTIONS = [
  {
    id: 'position',
    title: 'Position',
    fields: [
      { property: 'position', label: 'Position' },
      { property: 'inset', label: 'Inset' },
      { property: 'top', label: 'Top' },
      { property: 'right', label: 'Right' },
      { property: 'bottom', label: 'Bottom' },
      { property: 'left', label: 'Left' },
      { property: 'z-index', label: 'Z-index' },
      { property: 'overflow', label: 'Overflow' },
      { property: 'overflow-x', label: 'Overflow X' },
      { property: 'overflow-y', label: 'Overflow Y' },
    ],
  },
  {
    id: 'spacing',
    title: 'Spacing',
    fields: [
      { property: 'margin', label: 'Margin' },
      { property: 'margin-top', label: 'Margin top' },
      { property: 'margin-right', label: 'Margin right' },
      { property: 'margin-bottom', label: 'Margin bottom' },
      { property: 'margin-left', label: 'Margin left' },
      { property: 'margin-block', label: 'Margin block' },
      { property: 'margin-inline', label: 'Margin inline' },
    ],
  },
  {
    id: 'size',
    title: 'Size',
    fields: [
      { property: 'width', label: 'Width' },
      { property: 'height', label: 'Height' },
      { property: 'min-width', label: 'Min width' },
      { property: 'max-width', label: 'Max width' },
      { property: 'min-height', label: 'Min height' },
      { property: 'max-height', label: 'Max height' },
      { property: 'flex', label: 'Flex' },
      { property: 'flex-grow', label: 'Grow' },
      { property: 'flex-shrink', label: 'Shrink' },
      { property: 'flex-basis', label: 'Basis' },
      { property: 'aspect-ratio', label: 'Aspect' },
      { property: 'box-sizing', label: 'Box sizing' },
    ],
  },
  {
    id: 'fill',
    title: 'Fill',
    fields: [
      { property: 'background', label: 'Fill' },
      { property: 'background-color', label: 'Fill color' },
      { property: 'background-image', label: 'Fill image' },
      { property: 'color', label: 'Text' },
      { property: 'opacity', label: 'Opacity' },
      { property: 'fill', label: 'SVG fill' },
    ],
  },
  {
    id: 'stroke',
    title: 'Stroke',
    fields: [
      { property: 'border', label: 'Stroke' },
      { property: 'border-width', label: 'Weight' },
      { property: 'border-style', label: 'Style' },
      { property: 'border-color', label: 'Color' },
      { property: 'border-top', label: 'Top' },
      { property: 'border-right', label: 'Right' },
      { property: 'border-bottom', label: 'Bottom' },
      { property: 'border-left', label: 'Left' },
      { property: 'outline', label: 'Outline' },
      { property: 'stroke', label: 'SVG stroke' },
      { property: 'stroke-width', label: 'SVG weight' },
    ],
  },
  {
    id: 'corner',
    title: 'Corner',
    fields: [
      { property: 'border-radius', label: 'Radius' },
      { property: 'border-top-left-radius', label: 'Top left' },
      { property: 'border-top-right-radius', label: 'Top right' },
      { property: 'border-bottom-right-radius', label: 'Bottom right' },
      { property: 'border-bottom-left-radius', label: 'Bottom left' },
    ],
  },
  {
    id: 'effects',
    title: 'Effects',
    fields: [
      { property: 'box-shadow', label: 'Shadow' },
      { property: 'filter', label: 'Filter' },
      { property: 'backdrop-filter', label: 'Backdrop' },
      { property: 'transition', label: 'Transition' },
      { property: 'transform', label: 'Transform' },
      { property: 'cursor', label: 'Cursor' },
      { property: 'pointer-events', label: 'Pointer' },
      { property: 'visibility', label: 'Visibility' },
    ],
  },
  {
    id: 'type',
    title: 'Typography',
    fields: [
      { property: 'font-family', label: 'Family' },
      { property: 'font-size', label: 'Size' },
      { property: 'font-weight', label: 'Weight' },
      { property: 'font-style', label: 'Style' },
      { property: 'line-height', label: 'Line height' },
      { property: 'letter-spacing', label: 'Letter spacing' },
      { property: 'text-align', label: 'Align' },
      { property: 'text-decoration', label: 'Decoration' },
      { property: 'text-transform', label: 'Transform' },
      { property: 'white-space', label: 'Whitespace' },
    ],
  },
];

/**
 * Build a property → winning declaration map for the Design tab.
 * Groups are UI-sorted (specific first); we apply reverse so those win.
 * @param {Array<{ selector: string, file: string, sourcePath?: string, properties: Array<any> }>} groups
 * @param {(prop: any, selector: string) => any} applyOverride
 * @returns {Map<string, { prop: any, group: any }>}
 */
export function flattenWinningProps(groups, applyOverride) {
  /** @type {Map<string, { prop: any, group: any }>} */
  const map = new Map();
  // `groups` is UI-sorted with more specific / relevant selectors first.
  // Apply in reverse so those preferred declarations win the Design model.
  for (const group of [...groups].reverse()) {
    for (const prop of group.properties) {
      map.set(prop.property, {
        prop: applyOverride(prop, group.selector),
        group,
      });
    }
  }
  return map;
}

/**
 * @param {Map<string, { prop: any, group: any }>} winning
 * @returns {Array<{ id: string, title: string, rows: Array<{ property: string, label: string, prop: any, group: any }> }>}
 */
export function listPresentDesignSections(winning) {
  return DESIGN_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    rows: section.fields
      .map((field) => {
        if (LAYOUT_EDITOR_PROPS.has(field.property)) return null;
        const hit = winning.get(field.property);
        if (!hit) return null;
        return {
          property: field.property,
          label: field.label,
          prop: hit.prop,
          group: hit.group,
        };
      })
      .filter(Boolean),
  })).filter((section) => section.rows.length > 0);
}
