import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseDefaultModemId, isSimInserted, modemLabel } from "./modemSelection";

test("isSimInserted recognises the truthy representations a router might send", () => {
  assert.equal(isSimInserted(1), true);
  assert.equal(isSimInserted("1"), true);
  assert.equal(isSimInserted(true), true);
  assert.equal(isSimInserted(0), false);
  assert.equal(isSimInserted("0"), false);
  assert.equal(isSimInserted(false), false);
  assert.equal(isSimInserted(undefined), false);
});

test("chooseDefaultModemId picks the only modem when there's exactly one", () => {
  assert.equal(chooseDefaultModemId([{ modem_id: "1-1", sim_inserted: 0 }]), "1-1");
});

test("chooseDefaultModemId picks the alphabetically-first modem with a SIM inserted, among several", () => {
  const modems = [
    { modem_id: "3-1", sim_inserted: 1 },
    { modem_id: "1-1", sim_inserted: 0 },
    { modem_id: "2-1", sim_inserted: 1 },
  ];
  assert.equal(chooseDefaultModemId(modems), "2-1");
});

test("chooseDefaultModemId returns undefined when multiple modems have no SIM inserted anywhere", () => {
  const modems = [
    { modem_id: "1-1", sim_inserted: 0 },
    { modem_id: "2-1", sim_inserted: 0 },
  ];
  assert.equal(chooseDefaultModemId(modems), undefined);
});

test("chooseDefaultModemId returns undefined for an empty list", () => {
  assert.equal(chooseDefaultModemId([]), undefined);
});

test("modemLabel appends the modem type in brackets, or falls back to the bare id", () => {
  assert.equal(modemLabel({ modem_id: "1-1", modem_type: "Quectel EC25" }), "1-1 (Quectel EC25)");
  assert.equal(modemLabel({ modem_id: "1-1" }), "1-1");
});
