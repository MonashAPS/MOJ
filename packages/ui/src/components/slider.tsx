"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";

/** The range control the product uses instead of `input[type=range]`, which the
 *  design system forbids. One thumb or two: the thumb count follows the value. */
export function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbValues = value ?? defaultValue;
  const thumbs = Array.isArray(thumbValues) ? thumbValues.length : 1;

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "data-[orientation=vertical]:h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        "data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative h-1 w-full grow overflow-hidden rounded-full bg-well",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, index) => (
        <SliderPrimitive.Thumb
          // biome-ignore lint/suspicious/noArrayIndexKey: a thumb's identity is its position
          key={index}
          data-slot="slider-thumb"
          className={cn(
            "block size-3.5 shrink-0 rounded-full border border-primary bg-card",
            "hover:border-primary-hover",
            focusRing,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
