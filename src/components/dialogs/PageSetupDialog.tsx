import { useEffect, useState } from "react";
import type { PageSetup } from "../../core/document/model";
import { Dialog } from "../common/Dialog";

interface PageSetupDialogProps {
  open: boolean;
  page: PageSetup;
  onApply: (page: PageSetup) => void;
  onClose: () => void;
}

export function PageSetupDialog({ open, page, onApply, onClose }: PageSetupDialogProps) {
  const [draft, setDraft] = useState<PageSetup>(page);
  useEffect(() => {
    if (open) setDraft(structuredClone(page));
  }, [open, page]);

  const updateMargin = (side: keyof PageSetup["marginsInches"], value: number) => {
    setDraft((current) => ({
      ...current,
      marginsInches: { ...current.marginsInches, [side]: Math.min(4, Math.max(0, value)) },
    }));
  };

  return (
    <Dialog
      open={open}
      title="Page setup"
      description="Choose paper geometry and margins for print layout and DOCX export."
      onClose={onClose}
      width="medium"
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => { onApply(draft); onClose(); }}>Apply</button>
        </>
      )}
    >
      <div className="page-setup-grid">
        <section>
          <h3>Paper</h3>
          <label className="field-row">
            <span>Size</span>
            <select value={draft.size} onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value as PageSetup["size"] }))}>
              <option value="letter">Letter (8.5 × 11 in)</option>
              <option value="a4">A4 (210 × 297 mm)</option>
              <option value="legal">Legal (8.5 × 14 in)</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <fieldset className="orientation-picker">
            <legend>Orientation</legend>
            <label><input type="radio" name="orientation" checked={draft.orientation === "portrait"} onChange={() => setDraft((current) => ({ ...current, orientation: "portrait" }))} /> Portrait</label>
            <label><input type="radio" name="orientation" checked={draft.orientation === "landscape"} onChange={() => setDraft((current) => ({ ...current, orientation: "landscape" }))} /> Landscape</label>
          </fieldset>
          {draft.size === "custom" ? (
            <div className="inline-fields">
              <label>Width <input type="number" min={3} max={30} step={0.1} value={draft.customWidthInches ?? 8.5} onChange={(event) => setDraft((current) => ({ ...current, customWidthInches: Number(event.target.value) }))} /> in</label>
              <label>Height <input type="number" min={3} max={30} step={0.1} value={draft.customHeightInches ?? 11} onChange={(event) => setDraft((current) => ({ ...current, customHeightInches: Number(event.target.value) }))} /> in</label>
            </div>
          ) : null}
        </section>
        <section>
          <h3>Margins</h3>
          {(["top", "bottom", "left", "right"] as const).map((side) => (
            <label key={side} className="field-row">
              <span>{side[0]!.toUpperCase() + side.slice(1)}</span>
              <span className="number-with-unit">
                <input type="number" min={0} max={4} step={0.05} value={draft.marginsInches[side]} onChange={(event) => updateMargin(side, Number(event.target.value))} />
                <span>in</span>
              </span>
            </label>
          ))}
        </section>
        <div className={`page-preview page-preview--${draft.orientation}`} aria-label="Page preview">
          <div style={{ margin: `${draft.marginsInches.top * 10}px ${draft.marginsInches.right * 10}px ${draft.marginsInches.bottom * 10}px ${draft.marginsInches.left * 10}px` }} />
        </div>
      </div>
    </Dialog>
  );
}
