# Render List Bullets with CSS

Jot renders unordered-list bullets as CSS-drawn markers instead of Unicode bullet glyphs. The Daily Note source remains ordinary CommonMark/GFM list syntax; this decision only affects the WYSIWYG presentation.

Unicode symbols such as `•`, `◦`, and `▪` look different across platform fonts. In particular, the built-in San Francisco font on macOS can make nested hollow bullets appear too small compared with Android fonts, even when the CSS font size is the same. CSS-drawn markers give Jot explicit control over marker size, stroke, fill, and nesting-level distinction without changing the stored markdown.

The trade-off is that the rendered marker CSS is a little more verbose than using text glyphs. That cost is acceptable because list readability should not depend on the user's operating system font metrics.
