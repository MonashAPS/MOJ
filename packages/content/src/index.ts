export {
  type PlainTextOptions,
  plainTextFromMdast,
  type SummaryOptions,
  truncateSummary,
} from "./plain.js";
export {
  type CodehiliteOptions,
  collectFenceLanguages,
  normaliseLanguage,
  rehypeCodehilite,
} from "./plugins/rehype-codehilite.js";
export {
  type CamoOptions,
  camoRewrite,
  camoUrl,
  rehypeAbsolutify,
  rehypeCamo,
  rehypeLazyImages,
  rehypeNofollow,
  rehypeScrollableTables,
  rehypeTidyTables,
  rehypeUserReferences,
  type UserReference,
} from "./plugins/rehype-dmoj.js";
export { type CollectedHeading, slugify } from "./plugins/remark-dmoj.js";
export {
  type MathDelimiter,
  mojMathFromMarkdown,
  mojMathSyntax,
  remarkTildeMath,
} from "./plugins/remark-tilde-math.js";
export {
  PRESET_NAMES,
  PRESETS,
  type Preset,
  type PresetConfig,
  presetAllowsRawHtml,
  presetConfig,
  type SanitiseMode,
} from "./presets.js";
export {
  DEFAULT_THEMES,
  disposeHighlighters,
  extractSummary,
  normaliseCodeLanguage,
  type PlainOptions,
  type RenderMeta,
  type RenderOptions,
  type RenderResult,
  renderMarkdown,
  renderPlain,
  type ShikiThemes,
} from "./render.js";
export { ALL_STYLES, MATHML_ATTRS, MATHML_TAGS } from "./sanitize/bleach-whitelist.js";
export {
  ALLOWED_STYLE_PREFIXES,
  ALLOWED_STYLE_PROPERTIES,
  MOJ_EXTRA_ATTRS,
  propertyNames,
  USER_SAFE_ATTRS,
  USER_SAFE_TAGS,
  userSafeSchema,
} from "./sanitize/schema.js";

export {
  type BookletOptions,
  type BookletProblem,
  booklet,
  type ContestMeta,
  DEFAULT_TYPST_PACKAGE_PATH,
  defaultLabel,
  defaultResolveImage,
  dropAllImages,
  markdownToTypst,
  markdownToTypstBody,
  type NormaliseOptions,
  type NormaliseResult,
  normaliseForCmarker,
  type ProblemMeta,
  type RenderPdfOptions,
  renderPdf,
  statementArguments,
  TEMPLATE_FILES,
  TYPST_TEMPLATE_DIR,
  TypstCompileError,
  type TypstOptions,
  typstAvailable,
  typstBinary,
  typstEscapeString,
  typstOptional,
  typstStringArray,
} from "./typst/index.js";
