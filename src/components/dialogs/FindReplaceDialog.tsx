import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";
import { findMatches, selectFindMatch } from "../../core/document/find";
import { replaceTextInDocument } from "../../core/document/search";
import { Dialog } from "../common/Dialog";

interface FindReplaceDialogProps {
  open: boolean;
  editor: Editor | null;
  revision: number;
  onClose: () => void;
  onMessage: (message: string) => void;
}

export function FindReplaceDialog({
  open,
  editor,
  revision,
  onClose,
  onMessage,
}: FindReplaceDialogProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = useMemo(
    () => editor ? findMatches(editor, query, { matchCase, wholeWord }) : [],
    [editor, query, matchCase, wholeWord, revision],
  );

  useEffect(() => setActiveIndex(matches.length ? 0 : -1), [query, matchCase, wholeWord, matches.length]);

  const selectAt = (index: number) => {
    if (!editor || !matches.length) return;
    const normalized = (index + matches.length) % matches.length;
    setActiveIndex(normalized);
    selectFindMatch(editor, matches[normalized]!);
  };

  const replaceCurrent = () => {
    if (!editor || activeIndex < 0 || !matches[activeIndex]) return;
    const match = matches[activeIndex]!;
    editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to));
    onMessage("Replaced one occurrence.");
  };

  const replaceAll = () => {
    if (!editor || !query) return;
    const result = replaceTextInDocument(editor.getJSON(), query, replacement, { matchCase, wholeWord });
    editor.commands.setContent(result.content, { emitUpdate: true });
    onMessage(result.replacements === 1 ? "Replaced one occurrence." : `Replaced ${result.replacements} occurrences.`);
  };

  return (
    <Dialog
      open={open}
      title="Find and replace"
      description="Search the active document. Matches within a single formatted text run are selected precisely."
      onClose={onClose}
      width="small"
      footer={(
        <>
          <span className="dialog-footnote">{query ? `${matches.length} matches` : "Enter text to search"}</span>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </>
      )}
    >
      <div className="form-grid">
        <label className="field-row">
          <span>Find</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") selectAt(activeIndex + (event.shiftKey ? -1 : 1));
          }} />
        </label>
        <label className="field-row">
          <span>Replace with</span>
          <input value={replacement} onChange={(event) => setReplacement(event.target.value)} />
        </label>
        <div className="form-options">
          <label><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /> Match case</label>
          <label><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /> Whole words</label>
        </div>
        <div className="find-actions">
          <button type="button" className="secondary-button" disabled={!matches.length} onClick={() => selectAt(activeIndex - 1)}>Previous</button>
          <button type="button" className="secondary-button" disabled={!matches.length} onClick={() => selectAt(activeIndex + 1)}>Next</button>
          <button type="button" className="secondary-button" disabled={activeIndex < 0} onClick={replaceCurrent}>Replace</button>
          <button type="button" className="primary-button" disabled={!matches.length} onClick={replaceAll}>Replace all</button>
        </div>
      </div>
    </Dialog>
  );
}
