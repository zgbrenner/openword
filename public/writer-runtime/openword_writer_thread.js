/* SPDX-License-Identifier: Apache-2.0 */
"use strict";

let zetajs;
let css;
let context;
let desktop;
let model = null;
let controller = null;
let modifyListener = null;
const statusListeners = [];
const formatting = { bold: false, italic: false, underline: false };
const paragraph = { alignment: "left", bullets: false, numbering: false };

const commandUrls = OPENWORD_WRITER_COMMANDS;

function postEvent(event, payload) {
  zetajs.mainPort.postMessage({ kind: "event", event, payload });
}

function respond(id, result) {
  zetajs.mainPort.postMessage({ kind: "response", id, ok: true, result });
}

function fail(id, code, error) {
  const message = error instanceof Error ? error.message : String(error);
  zetajs.mainPort.postMessage({ kind: "response", id, ok: false, error: { code, message } });
}

function transformUrl(unoUrl) {
  const value = { val: new css.util.URL({ Complete: unoUrl }) };
  css.util.URLTransformer.create(context).parseStrict(value);
  return value.val;
}

function queryDispatch(urlObject) {
  if (!controller) throw new Error("No Writer document is active");
  const dispatchObject = controller.queryDispatch(urlObject, "_self", 0);
  if (!dispatchObject) throw new Error(`Writer command is unavailable: ${urlObject.Complete}`);
  return dispatchObject;
}

function dispatch(unoUrl) {
  const urlObject = transformUrl(unoUrl);
  queryDispatch(urlObject).dispatch(urlObject, []);
}

function configureGlobalUi() {
  const config = css.configuration.ReadWriteAccess.create(context, "en-US");
  const states = config.getByHierarchicalName(
    "/org.openoffice.Office.UI.WriterWindowState/UIElements/States",
  );
  for (const name of states.getElementNames()) {
    const element = states.getByName(name);
    if (element.getByName("Visible")) element.setPropertyValue("Visible", false);
  }
  config.commitChanges();
}

function hideDocumentChrome() {
  if (!controller) return;
  const frame = controller.getFrame();
  frame.getContainerWindow().FullScreen = true;
  frame.LayoutManager.hideElement("private:resource/menubar/menubar");
  try {
    dispatch(".uno:Sidebar");
  } catch {
    // A missing sidebar is already the desired state.
  }
}

function clearListeners() {
  for (const entry of statusListeners.splice(0)) {
    try {
      entry.dispatchObject.removeStatusListener(entry.listener, entry.urlObject);
    } catch {
      // The frame may already be disposing.
    }
  }
  if (model && modifyListener && typeof model.removeModifyListener === "function") {
    try {
      model.removeModifyListener(modifyListener);
    } catch {
      // The model may already be disposing.
    }
  }
  modifyListener = null;
}

function addStatusListener(id, onState) {
  const urlObject = transformUrl(`.uno:${id}`);
  const dispatchObject = queryDispatch(urlObject);
  const listener = zetajs.unoObject([css.frame.XStatusListener], {
    disposing() {},
    statusChanged(state) {
      onState(zetajs.fromAny(state.State));
    },
  });
  dispatchObject.addStatusListener(listener, urlObject);
  statusListeners.push({ dispatchObject, listener, urlObject });
}

function currentPageStyle() {
  if (!model || !controller) throw new Error("No Writer document is active");
  const viewCursor = controller.getViewCursor();
  const pageStyleName = viewCursor.getPropertyValue("PageStyleName");
  if (typeof pageStyleName !== "string" || !pageStyleName) {
    throw new Error("Writer did not expose the current page style");
  }
  const pageStyle = model.getStyleFamilies().getByName("PageStyles").getByName(pageStyleName);
  if (!pageStyle) throw new Error(`Writer page style is unavailable: ${pageStyleName}`);
  return { pageStyleName, pageStyle };
}

function emitPageStyle() {
  try {
    const { pageStyleName, pageStyle } = currentPageStyle();
    const payload = OPENWORD_WRITER_PAGE_STYLES.read(
      pageStyleName,
      (property) => pageStyle.getPropertyValue(property),
    );
    postEvent("selection.pageStyle", payload);
  } catch {
    // Transient cursor states during document load may not have a page style.
  }
}

function applyPageStyleCommand(command) {
  const { pageStyle } = currentPageStyle();
  const updates = OPENWORD_WRITER_PAGE_STYLES.updatesFor(command);
  for (const update of updates) {
    pageStyle.setPropertyValue(update.property, update.value);
  }
  emitPageStyle();
}

function emitFormatting() {
  postEvent("selection.formatting", { ...formatting });
  emitPageStyle();
}

function emitParagraph() {
  postEvent("selection.paragraph", { ...paragraph });
  emitPageStyle();
}

function addFormattingStatus(id, key) {
  addStatusListener(id, (value) => {
    formatting[key] = typeof value === "boolean" ? value : false;
    emitFormatting();
  });
}

function addParagraphStatus(id, alignment) {
  addStatusListener(id, (value) => {
    if (value === true) paragraph.alignment = alignment;
    emitParagraph();
  });
}

function addListStatus(id, key) {
  addStatusListener(id, (value) => {
    paragraph[key] = typeof value === "boolean" ? value : false;
    emitParagraph();
  });
}

function attachDocumentListeners() {
  clearListeners();
  addFormattingStatus("Bold", "bold");
  addFormattingStatus("Italic", "italic");
  addFormattingStatus("Underline", "underline");
  addParagraphStatus("LeftPara", "left");
  addParagraphStatus("CenterPara", "center");
  addParagraphStatus("RightPara", "right");
  addParagraphStatus("JustifyPara", "justify");
  addListStatus("DefaultBullet", "bullets");
  addListStatus("DefaultNumbering", "numbering");

  if (model && typeof model.addModifyListener === "function") {
    modifyListener = zetajs.unoObject([css.util.XModifyListener], {
      disposing() {},
      modified() {
        postEvent("document.changed", { dirty: true });
      },
    });
    model.addModifyListener(modifyListener);
  }
}

function disposeCurrentModel() {
  clearListeners();
  if (!model) return;
  try {
    if (typeof model.close === "function") model.close(true);
    else if (typeof model.dispose === "function") model.dispose();
  } finally {
    model = null;
    controller = null;
  }
}

function activateModel(nextModel) {
  disposeCurrentModel();
  if (!nextModel) throw new Error("Writer did not return a document model");
  model = nextModel;
  controller = model.getCurrentController();
  hideDocumentChrome();
  attachDocumentListeners();
  emitPageStyle();
  postEvent("document.changed", { dirty: false });
}

function newDocument() {
  activateModel(desktop.loadComponentFromURL("private:factory/swriter", "_default", 0, []));
}

function assertVirtualFileUrl(path) {
  if (typeof path !== "string" || !path.startsWith("file:///tmp/openword/")) {
    throw new Error("Writer can only access OpenWord's local virtual filesystem directory");
  }
}

function openDocument(path) {
  assertVirtualFileUrl(path);
  activateModel(desktop.loadComponentFromURL(path, "_default", 0, []));
}

function filterNameFor(format) {
  if (format === "odt") return "writer8";
  if (format === "docx") return "Office Open XML Text";
  throw new Error(`Unsupported Writer format: ${format}`);
}

function writeDocument(path, format, markClean) {
  if (!model) throw new Error("No Writer document is active");
  assertVirtualFileUrl(path);

  const properties = [
    new css.beans.PropertyValue({ Name: "FilterName", Value: filterNameFor(format) }),
    new css.beans.PropertyValue({ Name: "Overwrite", Value: true }),
  ];

  // storeToURL exports to OpenWord's temporary virtual file without changing
  // Writer's internal document URL to a path that OpenWord will immediately
  // remove. Recovery snapshots deliberately leave modified state untouched.
  model.storeToURL(path, properties);
  if (markClean) {
    if (typeof model.setModified === "function") model.setModified(false);
    postEvent("document.changed", { dirty: false });
  }
}

function executeCommand(command) {
  const type = command && command.type;
  const unoUrl = commandUrls[type];
  if (unoUrl) {
    dispatch(unoUrl);
    return;
  }
  applyPageStyleCommand(command);
}

function bindRequests() {
  zetajs.mainPort.onmessage = (event) => {
    const request = event.data;
    if (!request || request.kind !== "request" || typeof request.id !== "string") return;

    try {
      switch (request.method) {
        case "engine.ping":
          respond(request.id, { ready: true });
          return;
        case "document.new":
          newDocument();
          respond(request.id);
          return;
        case "document.open":
          openDocument(request.params?.path);
          respond(request.id);
          return;
        case "document.save":
          writeDocument(request.params?.path, request.params?.format, true);
          respond(request.id);
          return;
        case "document.snapshot":
          writeDocument(request.params?.path, request.params?.format, false);
          respond(request.id);
          return;
        case "command.execute":
          executeCommand(request.params?.command);
          respond(request.id);
          return;
        default:
          fail(request.id, "INVALID_REQUEST", new Error(`Unknown Writer method: ${request.method}`));
      }
    } catch (error) {
      const code = request.method === "document.open"
        ? "OPEN_FAILED"
        : request.method === "document.save" || request.method === "document.snapshot"
          ? "SAVE_FAILED"
          : request.method === "command.execute"
            ? "COMMAND_FAILED"
            : "INVALID_REQUEST";
      fail(request.id, code, error);
    }
  };
}

Module.zetajs.then((value) => {
  try {
    zetajs = value;
    css = zetajs.uno.com.sun.star;
    context = zetajs.getUnoComponentContext();
    configureGlobalUi();
    desktop = css.frame.Desktop.create(context);
    bindRequests();
    postEvent("engine.ready", { version: "writer-lowa" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    zetajs?.mainPort?.postMessage({
      kind: "event",
      event: "engine.failure",
      payload: { code: "ENGINE_UNAVAILABLE", message },
    });
  }
});
