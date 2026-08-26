<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

In JSX text, write apostrophes as `’`, never `&apos;`: SWC drops the leading space of a multi-line text node that contains an HTML entity, so `</code> entry point` renders as `executeentry point`.
