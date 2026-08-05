import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const sourceUrl = new URL("../../public/writer-runtime/openword_writer_page_styles.js", import.meta.url);

function loadPolicy() {
  const context = { Object, Error };
  runInNewContext(readFileSync(sourceUrl, "utf8"), context, { filename: sourceUrl.pathname });
  return context.OPENWORD_WRITER_PAGE_STYLES;
}

const normalize = (value) => JSON.parse(JSON.stringify(value));

test("translates Word-facing header and footer toggles into Writer page-style properties", () => {
  const policy = loadPolicy();
  assert.deepEqual(normalize(policy.updatesFor({ type: "header.setEnabled", enabled: true })), [
    { property: "HeaderIsOn", value: true },
  ]);
  assert.deepEqual(normalize(policy.updatesFor({ type: "footer.setEnabled", enabled: false })), [
    { property: "FooterIsOn", value: false },
  ]);
});

test("inverts Writer shared-content flags for Word's different-page options", () => {
  const policy = loadPolicy();
  assert.deepEqual(normalize(policy.updatesFor({ type: "pageStyle.setDifferentFirstPage", enabled: true })), [
    { property: "FirstIsShared", value: false },
  ]);
  assert.deepEqual(normalize(policy.updatesFor({ type: "pageStyle.setDifferentOddEven", enabled: true })), [
    { property: "HeaderIsShared", value: false },
    { property: "FooterIsShared", value: false },
  ]);
});

test("reads page-style state using Word-facing semantics", () => {
  const policy = loadPolicy();
  const values = {
    HeaderIsOn: true,
    FooterIsOn: false,
    FirstIsShared: false,
    HeaderIsShared: true,
    FooterIsShared: false,
  };
  assert.deepEqual(
    normalize(policy.read("Default Page Style", (property) => values[property])),
    {
      pageStyleName: "Default Page Style",
      headerEnabled: true,
      footerEnabled: false,
      differentFirstPage: true,
      differentOddEven: true,
    },
  );
});

test("rejects non-page-style commands and cannot be mutated", () => {
  const policy = loadPolicy();
  assert.throws(() => policy.updatesFor({ type: "format.toggleBold" }), /Unsupported page-style command/);
  assert.equal(Object.isFrozen(policy), true);
});
