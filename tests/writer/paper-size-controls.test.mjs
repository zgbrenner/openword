import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function loadPolicy() {
  const context = { Object, Error, Math, Number };
  runInNewContext(read("public/writer-runtime/openword_writer_page_styles.js"), context);
  return context.OPENWORD_WRITER_PAGE_STYLES;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("maps Letter A4 and Legal paper sizes to Writer page dimensions", () => {
  const policy = loadPolicy();
  assert.deepEqual(
    plain(policy.updatesFor(
      { type: "pageStyle.setPaperSize", paperSize: "letter" },
      (property) => ({ IsLandscape: false }[property]),
    )),
    [
      { property: "Width", value: 21590 },
      { property: "Height", value: 27940 },
    ],
  );
  assert.deepEqual(
    plain(policy.updatesFor(
      { type: "pageStyle.setPaperSize", paperSize: "a4" },
      (property) => ({ IsLandscape: true }[property]),
    )),
    [
      { property: "Width", value: 29700 },
      { property: "Height", value: 21000 },
    ],
  );
  assert.deepEqual(
    plain(policy.updatesFor(
      { type: "pageStyle.setPaperSize", paperSize: "legal" },
      (property) => ({ IsLandscape: false }[property]),
    )),
    [
      { property: "Width", value: 21590 },
      { property: "Height", value: 35560 },
    ],
  );
});

test("reads the current paper size independent of orientation", () => {
  const policy = loadPolicy();
  const base = {
    HeaderIsOn: false,
    FooterIsOn: false,
    FirstIsShared: true,
    HeaderIsShared: true,
    FooterIsShared: true,
    LeftMargin: 2540,
    RightMargin: 2540,
    TopMargin: 2540,
    BottomMargin: 2540,
  };
  const landscapeLetter = { ...base, IsLandscape: true, Width: 27940, Height: 21590 };
  const custom = { ...base, IsLandscape: false, Width: 22000, Height: 28000 };
  assert.equal(policy.read("Default", (property) => landscapeLetter[property]).paperSize, "letter");
  assert.equal(policy.read("Default", (property) => custom[property]).paperSize, "custom");
});

test("protocol state worker defaults and ribbon expose paper size", () => {
  const protocol = read("src/writer/protocol.ts");
  const state = read("src/writer/state.svelte.ts");
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  const ribbon = read("src/components/WriterHomeBar.svelte");

  assert.match(protocol, /type:\s*"pageStyle\.setPaperSize"/);
  assert.match(protocol, /paperSize: PagePaperSize/);
  assert.match(state, /paperSize = \$state<PagePaperSize>/);
  assert.match(worker, /pageStyle\.setPaperSize", paperSize: "letter"/);
  assert.match(ribbon, /aria-label="Paper size"/);
  assert.match(ribbon, /pageStyle\.setPaperSize/);
});
