import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { OpenDocumentTab } from "../../core/document/model";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { createEditorExtensions } from "./editorExtensions";
import { EditorCanvas } from "./EditorCanvas";

interface DocumentEditorProps {
  tab: OpenDocumentTab;
  zoom: number;
  layoutMode: "print" | "web";
  onEditorReady: (editor: Editor | null) => void;
  onEditorStateChange: () => void;
}

function readImage(file: File, callback: (source: string) => void): void {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result === "string") callback(reader.result);
  });
  reader.readAsDataURL(file);
}

export function DocumentEditor({
  tab,
  zoom,
  layoutMode,
  onEditorReady,
  onEditorStateChange,
}: DocumentEditorProps) {
  const updateDocument = useWorkspaceStore((state) => state.updateDocument);
  const loadedId = useRef(tab.id);
  const editorRef = useRef<Editor | null>(null);
  const updatingFromStore = useRef(false);
  const onStateChangeRef = useRef(onEditorStateChange);
  onStateChangeRef.current = onEditorStateChange;

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: tab.document.content,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "openword-prosemirror",
        "aria-label": "Document body",
        spellcheck: String(tab.document.settings.spellcheck),
      },
      handlePaste: (_view, event) => {
        const image = [...(event.clipboardData?.items ?? [])].find(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        );
        const file = image?.getAsFile();
        if (!file) return false;

        event.preventDefault();
        readImage(file, (source) => {
          editorRef.current
            ?.chain()
            .focus()
            .setImage({ src: source, alt: file.name, width: 480 } as never)
            .run();
        });
        return true;
      },
      handleDrop: (_view, event) => {
        const file = [...(event.dataTransfer?.files ?? [])].find((candidate) =>
          candidate.type.startsWith("image/"),
        );
        if (!file) return false;

        event.preventDefault();
        readImage(file, (source) => {
          editorRef.current
            ?.chain()
            .focus()
            .setImage({ src: source, alt: file.name, width: 480 } as never)
            .run();
        });
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (updatingFromStore.current) return;
      updateDocument(loadedId.current, { content: currentEditor.getJSON() });
      onStateChangeRef.current();
    },
    onSelectionUpdate: () => onStateChangeRef.current(),
    onTransaction: () => onStateChangeRef.current(),
  });

  useEffect(() => {
    editorRef.current = editor;
    onEditorReady(editor);
    return () => {
      editorRef.current = null;
      onEditorReady(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const changedDocument = loadedId.current !== tab.id;
    const contentChangedOutsideEditor =
      JSON.stringify(editor.getJSON()) !== JSON.stringify(tab.document.content);

    if (changedDocument || contentChangedOutsideEditor) {
      updatingFromStore.current = true;
      editor.commands.setContent(tab.document.content, { emitUpdate: false });
      loadedId.current = tab.id;
      queueMicrotask(() => {
        updatingFromStore.current = false;
        onStateChangeRef.current();
      });
    }
  }, [editor, tab.id, tab.document.content]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(editor.options.editorProps.attributes ?? {}),
          class: "openword-prosemirror",
          "aria-label": "Document body",
          spellcheck: String(tab.document.settings.spellcheck),
        },
      },
    });
  }, [editor, tab.document.settings.spellcheck]);

  return (
    <EditorCanvas
      document={tab.document}
      zoom={zoom}
      layoutMode={layoutMode}
    >
      <EditorContent editor={editor} />
    </EditorCanvas>
  );
}
