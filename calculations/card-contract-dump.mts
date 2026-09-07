// card-contract-dump.mts — emit the card contract as JSON so plain .mjs checkers can read it
// without keeping a second copy of the pin map. A duplicated map is the drift these checks exist
// to catch, so there is exactly one source and everything else reads it through here.
const m: any = await import(process.cwd() + "/packages/common-components/control-card.tsx");
const out: any = {
  ways: m.cardMap("card").map(([p]: any) => p),
  pins: m.CARD_MCU_PINS,
  internal: m.CARD_INTERNAL ?? {},
  noPin: [...(m.CARD_NO_MCU_PIN ?? [])],
  maxWays: m.CARD_WAYS,
  scope: [...m.CARD_SCOPE],
  roles: {},
};
for (const [sku, lanes] of [["30kw", 1], ["60kw", 2], ["120kw", 4]] as any)
  for (const role of ["acdc", "dcdc"]) {
    try { out.roles[`${sku}/${role}`] = { ok: true, map: m.cardMap(role, lanes) }; }
    catch (e: any) { out.roles[`${sku}/${role}`] = { ok: false, error: e.message }; }
  }
console.log(JSON.stringify(out));
