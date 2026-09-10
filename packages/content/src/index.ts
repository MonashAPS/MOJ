export {
  DEFAULT_THEMES,
  disposeHighlighters,
  extractSummary,
  normaliseCodeLanguage,
  renderMarkdown,
  renderPlain,
  type PlainOptions,
  type RenderMeta,
  type RenderOptions,
  type RenderResult,
  type ShikiThemes,
} from "./render.js";

export {
  PRESETS,
  PRESET_NAMES,
  presetAllowsRawHtml,
  presetConfig,
  type Preset,
  type PresetConfig,
  type SanitiseMode,
} from "./presets.js";

export {
  plainTextFromMdast,
  truncateSummary,
  type PlainTextOptions,
  type SummaryOptions,
} from "./plain.js";

export {
  ALLOWED_STYLE_PREFIXES,
  ALLOWED_STYLE_PROPERTIES,
  MOJ_EXTRA_ATTRS,
  USER_SAFE_ATTRS,
  USER_SAFE_TAGS,
  propertyNames,
  userSafeSchema,
} from "./sanitize/schema.js";
export { ALL_STYLES, MATHML_ATTRS, MATHML_TAGS } from "./sanitize/bleach-whitelist.js";

export {
  mojMathFromMarkdown,
  mojMathSyntax,
  remarkTildeMath,
  type MathDelimiter,
} from "./plugins/remark-tilde-math.js";

export {
  camoRewrite,
  camoUrl,
  rehypeAbsolutify,
  rehypeCamo,
  rehypeLazyImages,
  rehypeNofollow,
  rehypeScrollableTables,
  rehypeTidyTables,
  rehypeUserReferences,
  type CamoOptions,
  type UserReference,
} from "./plugins/rehype-dmoj.js";

export {
  collectFenceLanguages,
  normaliseLanguage,
  rehypeCodehilite,
  type CodehiliteOptions,
} from "./plugins/rehype-codehilite.js";

export { slugify, type CollectedHeading } from "./plugins/remark-dmoj.js";

export {
  DEFAULT_TYPST_PACKAGE_PATH,
  TEMPLATE_FILES,
  TYPST_TEMPLATE_DIR,
  TypstCompileError,
  booklet,
  defaultLabel,
  defaultResolveImage,
  dropAllImages,
  markdownToTypst,
  markdownToTypstBody,
  normaliseForCmarker,
  renderPdf,
  statementArguments,
  typstAvailable,
  typstBinary,
  typstEscapeString,
  typstOptional,
  typstStringArray,
  type BookletOptions,
  type BookletProblem,
  type ContestMeta,
  type NormaliseOptions,
  type NormaliseResult,
  type ProblemMeta,
  type RenderPdfOptions,
  type TypstOptions,
} from "./typst/index.js";
