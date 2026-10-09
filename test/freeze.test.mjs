// The freeze (author's prompt #17): v1 thresholds, v2 rules, the filter chain and the voice settings.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { FROZEN_FILE, frozenState } from "../scripts/freeze.mjs";

test("nothing frozen by prompt #17 has changed (rules, chain, voice; the measurement method; v3)", () => {
  const was = JSON.parse(fs.readFileSync(FROZEN_FILE, "utf8")).sha256;
  assert.deepEqual(frozenState(), was);
  assert.equal(Object.keys(was).length, 12);
});
