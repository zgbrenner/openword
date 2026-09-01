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
const formatting = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  subscript: false,
  superscript: false,
};
const paragraph = { alignment: "left", bullets: false, numbering: false, styleName: "" };

// Word-facing quick styles map onto real Writer paragraph styles; anything
// outside this table is refused rather than passed through.
const PARAGRAPH_QUICK_STYLES = Object.freeze({
  normal: "Standard",
  title: "Title",
  subtitle: "Subtitle",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  quote: "Quotations",
});
const documentStatistics = { pageLabel: "", pageTooltip: "", wordCountLabel: "" };
const reviewState = { trackChangesEnabled: false };

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
  const updates = OPENWORD_WRITER_PAGE_STYLES.updatesFor(
    command,
    (property) => pageStyle.getPropertyValue(property),
  );
  for (const update of updates) {
    pageStyle.setPropertyValue(update.property, update.value);
  }
  emitPageStyle();
}

function editPageRegion(kind) {
  const { pageStyle } = currentPageStyle();
  const enabledProperty = kind === "header" ? "HeaderIsOn" : "FooterIsOn";
  if (!Boolean(pageStyle.getPropertyValue(enabledProperty))) {
    pageStyle.setPropertyValue(enabledProperty, true);
  }
  emitPageStyle();
  dispatch(commandUrls[kind === "header" ? "header.edit" : "footer.edit"]);
}

function insertPageNumberField() {
  if (!model || !controller) throw new Error("No Writer document is active");
  const viewCursor = controller.getViewCursor();
  const text = viewCursor.getText();
  if (!text || typeof text.insertTextContent !== "function") {
    throw new Error("The current Writer selection cannot contain a page-number field");
  }
  const field = model.createInstance("com.sun.star.text.TextField.PageNumber");
  if (!field) throw new Error("Writer could not create a page-number field");
  field.setPropertyValue("SubType", 1);
  field.setPropertyValue("NumberingType", 4);
  text.insertTextContent(viewCursor, field, false);
}

function readTextFormatting() {
  if (!controller) return { fontFamily: "", fontSize: null };
  try {
    const viewCursor = controller.getViewCursor();
    const rawFontFamily = viewCursor.getPropertyValue("CharFontName");
    const rawFontSize = Number(viewCursor.getPropertyValue("CharHeight"));
    return {
      fontFamily: typeof rawFontFamily === "string" ? rawFontFamily : "",
      fontSize: Number.isFinite(rawFontSize) && rawFontSize > 0 ? rawFontSize : null,
    };
  } catch {
    return { fontFamily: "", fontSize: null };
  }
}

function setFontFamily(fontFamily) {
  if (!controller || typeof fontFamily !== "string") {
    throw new Error("A font family name is required");
  }
  const value = fontFamily.trim();
  if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("The selected font family is invalid");
  }
  const viewCursor = controller.getViewCursor();
  viewCursor.setPropertyValue("CharFontName", value);
  viewCursor.setPropertyValue("CharFontNameAsian", value);
  viewCursor.setPropertyValue("CharFontNameComplex", value);
  emitFormatting();
}

function setFontSize(fontSize) {
  if (!controller) throw new Error("No Writer document is active");
  const value = Number(fontSize);
  if (!Number.isFinite(value) || value < 1 || value > 300) {
    throw new Error("Font size must be between 1 and 300 points");
  }
  const viewCursor = controller.getViewCursor();
  viewCursor.setPropertyValue("CharHeight", value);
  viewCursor.setPropertyValue("CharHeightAsian", value);
  viewCursor.setPropertyValue("CharHeightComplex", value);
  emitFormatting();
}

function applyParagraphQuickStyle(style) {
  if (!controller) throw new Error("No Writer document is active");
  const writerStyleName = PARAGRAPH_QUICK_STYLES[style];
  if (!writerStyleName) throw new Error(`Unknown paragraph quick style: ${style}`);
  controller.getViewCursor().setPropertyValue("ParaStyleName", writerStyleName);
  emitParagraph();
}

function readParagraphStyle() {
  if (!controller) return "";
  try {
    const styleName = controller.getViewCursor().getPropertyValue("ParaStyleName");
    return typeof styleName === "string" ? styleName : "";
  } catch {
    return "";
  }
}

// css.view.DocumentZoomType.BY_VALUE
const ZOOM_BY_VALUE = 3;

function setViewZoom(percent) {
  if (!controller) throw new Error("No Writer document is active");
  const value = Math.round(Number(percent));
  if (!Number.isFinite(value) || value < 25 || value > 400) {
    throw new Error("Zoom must be between 25% and 400%");
  }
  const viewSettings = controller.getViewSettings();
  viewSettings.setPropertyValue("ZoomType", ZOOM_BY_VALUE);
  viewSettings.setPropertyValue("ZoomValue", value);
  postEvent("view.zoom", { percent: value });
}

function emitViewZoom() {
  if (!controller) return;
  try {
    const value = Number(controller.getViewSettings().getPropertyValue("ZoomValue"));
    if (Number.isFinite(value) && value > 0) postEvent("view.zoom", { percent: value });
  } catch {
    // A view without zoom settings simply reports nothing.
  }
}

function validateSearchOptions(options) {
  const query = options && options.query;
  if (typeof query !== "string" || query.length === 0 || query.length > 1000) {
    throw new Error("A search needs a query between 1 and 1000 characters");
  }
  return {
    query,
    matchCase: options.matchCase === true,
    wholeWords: options.wholeWords === true,
    backwards: options.backwards === true,
  };
}

function searchDescriptor(options, replacement) {
  if (!model) throw new Error("No Writer document is active");
  const descriptor = typeof replacement === "string"
    ? model.createReplaceDescriptor()
    : model.createSearchDescriptor();
  descriptor.setSearchString(options.query);
  descriptor.setPropertyValue("SearchCaseSensitive", options.matchCase);
  descriptor.setPropertyValue("SearchWords", options.wholeWords);
  descriptor.setPropertyValue("SearchBackwards", options.backwards);
  if (typeof replacement === "string") descriptor.setReplaceString(replacement);
  return descriptor;
}

function findNextMatch(rawOptions) {
  const options = validateSearchOptions(rawOptions);
  if (!model || !controller) throw new Error("No Writer document is active");
  const descriptor = searchDescriptor(options);
  const viewCursor = controller.getViewCursor();
  const start = options.backwards ? viewCursor.getStart() : viewCursor.getEnd();

  let found = model.findNext(start, descriptor);
  let wrapped = false;
  if (!found) {
    // Passed the document edge: continue from the opposite end once.
    found = model.findFirst(descriptor);
    wrapped = true;
  }
  if (!found) return { found: false, wrapped: false };
  controller.select(found);
  return { found: true, wrapped };
}

function selectionMatchesQuery(options) {
  try {
    const selection = controller.getSelection();
    if (!selection || typeof selection.getByIndex !== "function" || selection.Count !== 1) {
      return null;
    }
    const range = selection.getByIndex(0);
    const text = range && typeof range.getString === "function" ? range.getString() : "";
    if (typeof text !== "string" || !text) return null;
    const matches = options.matchCase
      ? text === options.query
      : text.toLowerCase() === options.query.toLowerCase();
    return matches ? range : null;
  } catch {
    return null;
  }
}

function replaceNextMatch(rawOptions) {
  const options = validateSearchOptions(rawOptions);
  const replacement = typeof rawOptions.replacement === "string" ? rawOptions.replacement : "";
  if (!model || !controller) throw new Error("No Writer document is active");

  // Word semantics: Replace substitutes the occurrence the previous Find
  // selected, then moves to the next one.
  const selectedMatch = selectionMatchesQuery(options);
  let replaced = false;
  if (selectedMatch) {
    selectedMatch.setString(replacement);
    replaced = true;
  }
  const next = findNextMatch(options);
  return { ...next, replaced };
}

function replaceAllMatches(rawOptions) {
  const options = validateSearchOptions(rawOptions);
  const replacement = typeof rawOptions.replacement === "string" ? rawOptions.replacement : "";
  const descriptor = searchDescriptor(options, replacement);
  const replaced = Number(model.replaceAll(descriptor));
  return { replaced: Number.isFinite(replaced) ? replaced : 0 };
}

function emitDocumentStatistics() {
  postEvent("document.statistics", { ...documentStatistics });
}

function addDocumentStatisticsStatus() {
  addStatusListener("StateWordCount", (value) => {
    documentStatistics.wordCountLabel = typeof value === "string" ? value : "";
    emitDocumentStatistics();
  });
  addStatusListener("StatePageNumber", (value) => {
    const labels = Array.isArray(value) ? value : [];
    documentStatistics.pageLabel = typeof labels[0] === "string" ? labels[0] : "";
    documentStatistics.pageTooltip = typeof labels[1] === "string" ? labels[1] : "";
    emitDocumentStatistics();
  });
}

function emitReviewState() {
  postEvent("review.state", { ...reviewState });
}

function addReviewStatus() {
  addStatusListener("TrackChanges", (value) => {
    reviewState.trackChangesEnabled = value === true;
    emitReviewState();
  });
}

function emitFormatting() {
  postEvent("selection.formatting", { ...formatting, ...readTextFormatting() });
  emitPageStyle();
}

function emitParagraph() {
  paragraph.styleName = readParagraphStyle();
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
  addFormattingStatus("Strikeout", "strikethrough");
  addFormattingStatus("SubScript", "subscript");
  addFormattingStatus("SuperScript", "superscript");
  addParagraphStatus("LeftPara", "left");
  addParagraphStatus("CenterPara", "center");
  addParagraphStatus("RightPara", "right");
  addParagraphStatus("JustifyPara", "justify");
  addListStatus("DefaultBullet", "bullets");
  addListStatus("DefaultNumbering", "numbering");
  addDocumentStatisticsStatus();
  addReviewStatus();
  emitFormatting();

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
  documentStatistics.pageLabel = "";
  documentStatistics.pageTooltip = "";
  documentStatistics.wordCountLabel = "";
  reviewState.trackChangesEnabled = false;
  emitDocumentStatistics();
  emitReviewState();
  hideDocumentChrome();
  attachDocumentListeners();
  emitPageStyle();
  emitViewZoom();
  postEvent("document.changed", { dirty: false });
}

function newDocument() {
  activateModel(desktop.loadComponentFromURL("private:factory/swriter", "_default", 0, []));
  applyPageStyleCommand({ type: "pageStyle.setPaperSize", paperSize: "letter" });
  applyPageStyleCommand({ type: "pageStyle.setOrientation", orientation: "portrait" });
  applyPageStyleCommand({ type: "pageStyle.setMargins", preset: "normal" });
  if (model && typeof model.setModified === "function") model.setModified(false);
  postEvent("document.changed", { dirty: false });
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

  model.storeToURL(path, properties);
  if (markClean) {
    if (typeof model.setModified === "function") model.setModified(false);
    postEvent("document.changed", { dirty: false });
  }
}

function exportPdf(path) {
  if (!model) throw new Error("No Writer document is active");
  assertVirtualFileUrl(path);
  const properties = [
    new css.beans.PropertyValue({ Name: "FilterName", Value: "writer_pdf_Export" }),
    new css.beans.PropertyValue({ Name: "Overwrite", Value: true }),
  ];
  model.storeToURL(path, properties);
}

function executeCommand(command) {
  const type = command && command.type;
  if (type === "header.edit") {
    editPageRegion("header");
    return;
  }
  if (type === "footer.edit") {
    editPageRegion("footer");
    return;
  }
  if (type === "field.insertPageNumber") {
    insertPageNumberField();
    return;
  }
  if (type === "format.setFontFamily") {
    setFontFamily(command.fontFamily);
    return;
  }
  if (type === "format.setFontSize") {
    setFontSize(command.fontSize);
    return;
  }
  if (type === "paragraph.applyStyle") {
    applyParagraphQuickStyle(command.style);
    return;
  }
  if (type === "view.setZoom") {
    setViewZoom(command.percent);
    return;
  }
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
        case "document.exportPdf":
          exportPdf(request.params?.path);
          respond(request.id);
          return;
        case "command.execute":
          executeCommand(request.params?.command);
          respond(request.id);
          return;
        case "search.find":
          respond(request.id, findNextMatch(request.params));
          return;
        case "search.replaceNext":
          respond(request.id, replaceNextMatch(request.params));
          return;
        case "search.replaceAll":
          respond(request.id, replaceAllMatches(request.params));
          return;
        default:
          fail(request.id, "INVALID_REQUEST", new Error(`Unknown Writer method: ${request.method}`));
      }
    } catch (error) {
      const code = request.method === "document.open"
        ? "OPEN_FAILED"
        : request.method === "document.save" ||
            request.method === "document.snapshot" ||
            request.method === "document.exportPdf"
          ? "SAVE_FAILED"
          : request.method === "command.execute" ||
              (typeof request.method === "string" && request.method.startsWith("search."))
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
