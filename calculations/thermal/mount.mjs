// mount.mjs — the ONE power-semiconductor mounting basis. Every Tj engine reads it, so the grid, the coordination gate
// and the stress audit cannot drift apart with a 1.9 / 1.1 K/W copy each.
//
// Every TO-247 die is clip-mounted on a 0.635 mm Al2O3 insulator with grease, not on a silicone pad (which is the
// 1.9 / 1.1 K/W basis). Junction → heatsink per package: Rth(j-c) 0.30–0.45 K/W (SG2M023120LJ / B3M010C075Z / 40 A JBS
// class) + insulator and two grease films ≈ 0.25 K/W + local base spreading ≈ 0.10 K/W (air extrusion) — 0.8 K/W declared,
// 0.65 K/W onto the liquid plate (no spreading term, 65 °C plate). VERIFY at EVT T-38 (thermocouple under the tab on one
// die per stage, full power, 55 °C inlet) — the declared value must hold within +15 %.
export const MOUNT = {
  air: { rth: 0.8, ref: 70 },      // K/W junction → extrusion base under the die · °C base reference at 55 °C ambient
  liquid: { rth: 0.65, ref: 65 },  // K/W junction → coldplate · °C plate reference
};
// A base at 70 °C is unreachable when the module's own air rise is 12–18 K at 55 °C inlet — the air LEAVING the
// extrusions is 67–73 °C, and a sink cannot be colder than its outlet air. Interim per-SKU base references from the air-side
// energy balance (ρ at 55 °C, fan flow × 0.6, ≈55 % of the flow over the DC-DC face, ε–NTU on a 3U extrusion): 30 kW 74 °C
// on three fans, 40 kW 75 °C, 50 kW air 77 °C. EVT T-04 measures the base under the die at inlet, mid and outlet and replaces these; the
// liquid plate reference is unchanged (the coolant loop sets it).
export const AIR_REF = { "30kw": 74, "40kw": 75, "50kwa": 77 };
export const mountFor = (sku) => (sku === "50kw" ? MOUNT.liquid : { rth: MOUNT.air.rth, ref: AIR_REF[sku] ?? MOUNT.air.ref });
