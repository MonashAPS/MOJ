/** Decode in the browser so raster and SVG uploads use the same sizing as the header. */
export async function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.src = url;
  await image.decode();

  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width <= 0 || height <= 0) throw new Error("The logo must have a measurable width and height.");

  return { width, height };
}
