/**
 * Narrowing helpers for hast trees.
 *
 * `Element.properties` values carry every spelling an HTML attribute can have —
 * a string, a number, a boolean, a list of class names — so a plugin that wants
 * an `href` or a `style` has to say which one it is looking at.
 */

import type { Properties } from "hast";

/** A value `Element.properties` can hold. */
export type PropertyValue = Properties[string];

/**
 * One property, read as the general property value rather than the spelling
 * `@types/hast` declares for it: raw HTML can leave either behind.
 */
export function propertyValue(properties: Properties, name: string): PropertyValue {
  return properties[name];
}

/** Whether a property is a plain string, as `href`, `src` and `style` are. */
export function isStringProperty(value: PropertyValue): value is string {
  return typeof value === "string";
}
