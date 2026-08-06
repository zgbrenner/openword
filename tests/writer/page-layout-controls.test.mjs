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

test("maps Word margin presets to Writer hundredth-millimetre page properties", () => {
  const policy = loadPolicy();
  assert.deepEqual(
    plain(policy.updatesFor({ type: "pageStyle.setMargins", preset: "normal" })),
    [
      { property: "LeftMargin", value: 2540 },
      { property: "RightMargin", value: 2540 },
      { property: "TopMargin", value: 2540 },
      { property: "BottomMargin", value: 2540 },
    ],
  );
  assert.deepEqual(
    plain(policy.updatesFor({ type: "pageStyle.setMargins", preset: "moderate" })),
    [
      { property: "LeftMargin", value: 1905 },
      { property: "RightMargin", value: 1905 },
      { property: "TopMargin", value: 2540 },
      { property: "BottomMargin", value: 2540 },
    ],
  );
});

test("changes orientation without changing the selected paper size", () => {
  const policy = loadPolicy();
  const landscape = policy.updatesFor(
    { type: "pageStyle.setOrientation", orientation: "landscape" },
    (property) => ({ Width: 21590, Height: 27940 }[property]),
  );
  assert.deepEqual(plain(landscape), [
    { property: "IsLandscape", value: true },
    { property: "Width", value: 27940 },
    { property: "Height", value: 21590 },
  ]);

  const alreadyLandscape = policy.updatesFor(
    { type: "pageStyle.setOrientation", orientation: "landscape" },
    (property) => ({ Width: 27940, Height: 21590 }[property]),
  );
  assert.deepEqual(plain(alreadyLandscape), [
    { property: "IsLandscape", value: true },
  ]);
});

test("reads Word-facing orientation and margin-preset state", () => {
  const policy = loadPolicy();
  const values = {
    HeaderIsOn: true,
    FooterIsOn: true,
    FirstIsShared: true,
    HeaderIsShared: true,
    FooterIsShared: true,
    IsLandscape: false,
    Width: 21590,
    Height: 27940,
    LeftMargin: 1270,
    RightMargin: 1270,
    TopMargin: 1270,
    BottomMargin: 1270,
  };
  const state = policy.read("Default Page Style", (property) => values[property]);
  assert.equal(state.orientation, "portrait");
  assert.equal(state.marginPreset, "narrow");
});

test("protocol worker state and ribbon expose page layout controls", () => {
  const protocol = read("src/writer/protocol.ts");
  const worker = read("public/writer-runtime/openword_writer_thread.js");
  const state = read("src/writer/state.svelte.ts");
  const ribbon = read("src/components/WriterHomeBar.svelte");

  assert.match(protocol, /pageStyle\.setOrientation/);
  assert.match(protocol, /pageStyle\.setMargins/);
  assert.match(protocol, /orientation: PageOrientation/);
  assert.match(protocol, /marginPreset: PageMarginPreset/);
  assert.match(worker, /OPENWORD_WRITER_PAGE_STYLES\.updatesFor\(command, \(property\)/);
  assert.match(state, /orientation = \$state<PageOrientation>/);
  assert.match(state, /marginPreset = \$state<PageMarginPreset>/);
  assert.match(ribbon, /aria-label="Orientation"/);
  assert.match(ribbon, /aria-label="Margins"/);
});
