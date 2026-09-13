// mount.mjs — the ONE power-semiconductor mounting basis (E68). Every Tj engine reads it, so the grid, the coordination gate
// and the stress audit cannot drift apart again (E42–E67 each carried their own 1.9 / 1.1 K/W copy).
//
// E68 (InfyPower practice): every TO-247 die is clip-mounted on a 0.635 mm Al2O3 insulator with grease, instead of a silicone
// pad. Junction → heatsink per package: Rth(j-c) 0.30–0.45 K/W (SG2M023120LJ / B3M010C075Z / 40 A JBS class) + insulator and
// two grease films ≈ 0.25 K/W + local base spreading ≈ 0.10 K/W (air extrusion) — 0.8 K/W declared, 0.65 K/W onto the liquid
// plate (no spreading term, 65 °C plate). The pad basis it replaces was 1.9 / 1.1 K/W. VERIFY at EVT T-38 (thermocouple under
// the tab on one die per stage, full power, 55 °C inlet) — the declared value must hold within +15 %.
export const MOUNT = {
  air: { rth: 0.8, ref: 70 },      // K/W junction → extrusion base under the die · °C base reference at 55 °C ambient
  liquid: { rth: 0.65, ref: 65 },  // K/W junction → coldplate · °C plate reference (E42)
};
export const mountFor = (sku) => (sku === "50kw" ? MOUNT.liquid : MOUNT.air);
