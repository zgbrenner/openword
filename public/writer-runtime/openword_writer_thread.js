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

const commandUrls = Object.freeze({
  "format.toggleBold": ".uno:Bold",
  "format.toggleItalic": ".uno:Italic",
  "format.toggleUnderline": ".uno:Underline",
  "history.undo": ".uno:Undo",
  "history.redo": ".uno:Redo",
});

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
  statusListeners.length = 0;
  modifyListener = null;
}

function emitFormatting() {
  postEvent("selection.formatting", { ...formatting });
}

function addFormattingStatus(id, key) {
  const urlObject = transformUrl(`.uno:${id}`);
  const listener = zetajs.unoObject([css.frame.XStatusListener], {
    disposing() {},
    statusChanged(state) {
      const value = zetajs.fromAny(state.State);
      formatting[key] = typeof value === "boolean" ? value : false;
      emitFormatting();
    },
  });
  queryDispatch(urlObject).addStatusListener(listener, urlObject);
  statusListeners.push(listener);
}

function attachDocumentListeners() {
  clearListeners();
  addFormattingStatus("Bold", "bold");
  addFormattingStatus("Italic", "italic");
  addFormattingStatus("Underline", "underline");

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
  model = nextModel;
  controller = model.getCurrentController();
  hideDocumentChrome();
  attachDocumentListeners();
  postEvent("document.changed", { dirty: false });
}

function newDocument() {
  activateModel(desktop.loadComponentFromURL("private:factory/swriter", "_default", 0, []));
}

function openDocument(path) {
  if (typeof path !== "string" || !path.startsWith("file:///")) {
    throw new Error("Writer can only open local virtual filesystem URLs");
  }
  activateModel(desktop.loadComponentFromURL(path, "_default", 0, []));
}

function saveDocument(path, format) {
  if (!model) throw new Error("No Writer document is active");
  if (typeof path !== "string" || !path.startsWith("file:///")) {
    throw new Error("Writer can only save to local virtual filesystem URLs");
  }
  const filterName = format === "odt" ? "writer8" : format === "docx" ? "Office Open XML Text" : null;
  if (!filterName) throw new Error(`Unsupported Writer format: ${format}`);

  const properties = [
    new css.beans.PropertyValue({ Name: "FilterName", Value: filterName }),
    new css.beans.PropertyValue({ Name: "Overwrite", Value: true }),
  ];
  model.storeAsURL(path, properties);
  postEvent("document.changed", { dirty: false });
}

function executeCommand(command) {
  const type = command && command.type;
  const unoUrl = commandUrls[type];
  if (!unoUrl) throw new Error(`Unsupported Writer command: ${String(type)}`);
  dispatch(unoUrl);
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
          saveDocument(request.params?.path, request.params?.format);
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
        : request.method === "document.save"
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
