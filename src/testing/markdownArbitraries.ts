import fc, { type Arbitrary } from "fast-check";

const textCharacter = fc.constantFrom(
  "a", "b", "c", " ", "\t", "*", "_", "[", "]", "(", ")", "<", ">", "é", "ø", "漢", "🙂"
);

const shortText = fc.array(textCharacter, { minLength: 1, maxLength: 24 }).map((characters) => characters.join(""));
const nonEmptyLabel = fc.array(
  fc.constantFrom("a", "b", "c", "é", "ø", "漢", "🙂"),
  { minLength: 1, maxLength: 12 }
).map((characters) => characters.join(""));

const generatedMarkdownBlock = fc.oneof(
  shortText,
  shortText.map((text) => `# ${text}`),
  shortText.map((text) => `* ${text}`),
  shortText.map((text) => `  * ${text}`),
  shortText.map((text) => `> > ${text}`),
  nonEmptyLabel.map((label) => `[${label}](<https://example.com/${encodeURIComponent(label)}>)`),
  nonEmptyLabel.map((label) => `| ${label} | value |\n| --- | --- |\n| row | ${label} |`)
);

const fixedMarkdownBlock = fc.constantFrom(
  "",
  " ",
  "\t",
  "* <br />",
  "  * <br>",
  "<br />",
  "```html\n<br />\n* <br />\n```",
  "~~~\nUnicode 🙂\n~~~",
  "    <br />\n    * <br />",
  "<pre>\n<br />\n* <br />\n</pre>",
  "<!--\n* <br />\n-->",
  "**incomplete",
  "[unfinished](https://example.com",
  "```js\nconst unfinished = true;",
  "<div>\n* <br />",
  "<<<<<<< Local Draft\ntext",
  "trailing spaces  "
);

export const markdownArbitrary: Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constantFrom(" ", "\n", " \n\t"),
  fc.tuple(
    fc.array(fc.oneof(generatedMarkdownBlock, fixedMarkdownBlock), { minLength: 1, maxLength: 10 }),
    fc.boolean()
  ).map(([blocks, finalNewline]) => `${blocks.join("\n")}${finalNewline ? "\n" : ""}`)
);

const literalBodyLine = fc.oneof(
  shortText,
  fc.constantFrom("", "<br />", "* <br />", "**incomplete", "Unicode 🙂 漢")
);

export const literalMarkdownRegionArbitrary: Arbitrary<string> = fc.oneof(
  fc.tuple(fc.constantFrom("```", "````", "~~~"), fc.array(literalBodyLine, { minLength: 1, maxLength: 6 }))
    .map(([fence, lines]) => `${fence}\n${lines.join("\n")}\n${fence}`),
  fc.tuple(fc.constantFrom("pre", "script", "style", "textarea"), fc.array(literalBodyLine, { minLength: 1, maxLength: 6 }))
    .map(([tag, lines]) => `<${tag}>\n${lines.join("\n")}\n</${tag}>`),
  fc.array(literalBodyLine, { minLength: 1, maxLength: 6 })
    .map((lines) => `<!--\n${lines.join("\n")}\n-->`),
  fc.array(literalBodyLine, { minLength: 1, maxLength: 6 })
    .map((lines) => lines.map((line) => `    ${line}`).join("\n"))
);

export const normalizationPolicyCaseArbitrary = fc.record({
  heading: nonEmptyLabel.map((label) => `# ${label}`),
  literalRegion: literalMarkdownRegionArbitrary,
  tail: nonEmptyLabel.map((label) => `tail ${label}`),
  finalNewline: fc.boolean()
}).map(({ heading, literalRegion, tail, finalNewline }) => ({
  input: `${heading}\n* <br />\n${literalRegion}\n<br />\n${tail}${finalNewline ? "\n" : ""}`,
  enabledExpected: `${heading}\n${literalRegion}\n\n${tail}${finalNewline ? "\n" : ""}`,
  literalRegion
}));
