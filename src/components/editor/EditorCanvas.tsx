import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { OpenWordDocument } from "../../core/document/model";
import { getPageDimensions } from "../../core/document/page";

interface EditorCanvasProps {
  document: OpenWordDocument;
  zoom: number;
  layoutMode: "print" | "web";
  children: ReactNode;
}

export function EditorCanvas({
  document,
  zoom,
  layoutMode,
  children,
}: EditorCanvasProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const dimensions = getPageDimensions(document.page);
  const scale = zoom / 100;
  const width = dimensions.widthInches * 96;
  const minimumHeight = dimensions.heightInches * 96;

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const update = () => setNaturalHeight(Math.max(minimumHeight, page.scrollHeight));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(page);
    return () => observer.disconnect();
  }, [minimumHeight, document.id]);

  if (layoutMode === "web") {
    const webStyle = {
      "--document-font": document.settings.defaultFontFamily,
      "--document-font-size": `${document.settings.defaultFontSizePt}pt`,
      "--editor-zoom": String(scale),
    } as CSSProperties;

    return (
      <div className="editor-web-shell" style={webStyle}>
        <div ref={pageRef} className="editor-web-page" data-testid="document-editor">
          {children}
        </div>
      </div>
    );
  }

  const shellStyle: CSSProperties = {
    width: width * scale,
    minHeight: Math.max(minimumHeight, naturalHeight) * scale,
  };

  const pageStyle = {
    width,
    minHeight: minimumHeight,
    paddingTop: `${document.page.marginsInches.top}in`,
    paddingRight: `${document.page.marginsInches.right}in`,
    paddingBottom: `${document.page.marginsInches.bottom}in`,
    paddingLeft: `${document.page.marginsInches.left}in`,
    transform: `scale(${scale})`,
    "--document-font": document.settings.defaultFontFamily,
    "--document-font-size": `${document.settings.defaultFontSizePt}pt`,
  } as CSSProperties;

  return (
    <div className="editor-scale-shell" style={shellStyle}>
      <div
        ref={pageRef}
        className="editor-page"
        style={pageStyle}
        data-testid="document-editor"
      >
        {children}
      </div>
    </div>
  );
}
