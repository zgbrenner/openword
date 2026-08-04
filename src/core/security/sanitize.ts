import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a", "b", "blockquote", "br", "code", "col", "colgroup", "del", "div", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol",
  "p", "pre", "s", "span", "strike", "strong", "sub", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const ALLOWED_ATTR = [
  "alt", "checked", "class", "colspan", "data-comment-id", "data-openword-page-break",
  "height", "href", "rowspan", "src", "start", "style", "target", "title", "type", "width",
];

const SAFE_LINK = /^(?:https?:|mailto:|tel:|#)/i;
const SAFE_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i;

export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });

  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${clean}</body>`, "text/html");

  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!SAFE_LINK.test(href)) anchor.removeAttribute("href");
    anchor.setAttribute("rel", "noreferrer noopener");
  }

  for (const image of document.querySelectorAll("img")) {
    const source = image.getAttribute("src")?.trim() ?? "";
    if (!SAFE_IMAGE.test(source)) {
      const replacement = document.createTextNode(image.getAttribute("alt") ? `[${image.getAttribute("alt")}]` : "");
      image.replaceWith(replacement);
    }
  }

  for (const element of document.querySelectorAll<HTMLElement>("[style]")) {
    const safe: string[] = [];
    for (const declaration of element.style) {
      const property = declaration.toLowerCase();
      if (!["color", "background-color", "font-family", "font-size", "line-height", "text-align"].includes(property)) continue;
      const value = element.style.getPropertyValue(property).trim();
      if (!value || /url\s*\(|expression\s*\(|javascript:|[{}<>]/i.test(value)) continue;
      safe.push(`${property}: ${value}`);
    }
    if (safe.length) element.setAttribute("style", safe.join("; "));
    else element.removeAttribute("style");
  }

  return document.body.innerHTML;
}
