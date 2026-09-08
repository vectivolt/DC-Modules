// sch-longtrace-labels.mjs — presentation rule (E34 / margin-audit follow-up, 2026-09-08):
// long solver-routed schematic wires become net-label chips at their pins.
//
// WHY. The schematic trace solver draws same-net pin-to-pin wires (its source_trace_id is the
// synthetic "schematic_port_A-schematic_port_B" pair). Around a tall symbol — the LQFP-100 MCU,
// the 88-way card connector — those wires wrap the whole body and read as spaghetti. The board's
// schMaxTraceDistance={0} gate does not reach traces the solver emits inside groups, so the
// conversion is done here, on the compiled circuit JSON, before any rendering: drop every
// schematic_trace longer than maxLen and stamp the standard chip label (anchor_side opposite the
// pin's facing, no symbol_name — same shape the build's own label conversion emits) at each of
// its two ports. A pin that already carries a label at that exact anchor gets nothing: the long
// wire was redundant connectivity ink, and deleting it IS the cleanup.
//
// Consumers: schematic-export.mjs and schematic-compose.mjs (compose benefits twice — clusters
// are wire-connected, so fewer long wires also means smaller rigid clusters and tighter packing).
export function labelLongTraces(j, maxLen = 2.0) {
  const netName = new Map(j.filter((e) => e.type === "source_net").map((e) => [e.source_net_id, e.name]));
  const ports = new Map(j.filter((e) => e.type === "schematic_port").map((e) => [e.schematic_port_id, e]));
  const portNet = new Map();
  for (const t of j) if (t.type === "source_trace")
    for (const pid of (t.connected_source_port_ids ?? []))
      for (const nid of (t.connected_source_net_ids ?? []))
        if (netName.get(nid)) portNet.set(pid, netName.get(nid));
  const SIDE = { left: "right", right: "left", up: "bottom", down: "top" };
  // Label hygiene, two rules learned from the card sheet:
  //  1) SAME-TEXT proximity dedupe — two chips of the same net within 0.8 units is double-ink
  //     (the doubled AVREF_MID). Different nets stay: suppressing across nets left bare VDD stubs
  //     when a DGND chip sat 0.2 away on the neighbouring pin.
  //  2) The build itself sometimes emits the same-text label twice at nearly the same anchor;
  //     collapse those in a pre-pass (keep the first).
  const placed = [];
  const nearSame = (c, text) =>
    placed.some((q) => q.text === text && Math.hypot(q.x - c.x, q.y - c.y) < 0.8);
  const pre = [];
  for (const e of j) {
    if (e.type === "schematic_net_label" && e.anchor_position) {
      if (placed.some((q) => q.text === e.text &&
          Math.hypot(q.x - e.anchor_position.x, q.y - e.anchor_position.y) < 0.45)) continue;
      placed.push({ x: e.anchor_position.x, y: e.anchor_position.y, text: e.text });
    }
    pre.push(e);
  }
  const out = [];
  let n = 0, dropped = 0;
  for (const e of pre) {
    if (e.type !== "schematic_trace") { out.push(e); continue; }
    const L = (e.edges ?? []).reduce((s, g) => (g?.from && g?.to)
      ? s + Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y) : s, 0);
    if (L <= maxLen) { out.push(e); continue; }
    const m = /^(schematic_port_\d+)-(schematic_port_\d+)$/.exec(e.source_trace_id ?? "");
    const pr = m ? [ports.get(m[1]), ports.get(m[2])].filter(Boolean) : [];
    const name = pr.map((p) => portNet.get(p.source_port_id)).find(Boolean);
    if (!name || pr.length === 0) { out.push(e); continue; }   // unidentifiable → keep the wire
    dropped++;
    for (const p of pr) {
      if (nearSame(p.center, name)) continue;                   // same-net chip already at/near this pin
      placed.push({ ...p.center, text: name });
      out.push({
        type: "schematic_net_label",
        schematic_net_label_id: `schematic_net_label_lt_${n++}`,
        text: name,
        source_net_id: null,
        anchor_position: { ...p.center },
        center: { ...p.center },
        anchor_side: SIDE[p.facing_direction] ?? "left",
      });
    }
  }
  if (dropped) console.log(`   long-trace→label: ${dropped} wire(s) → ${n} chip(s)`);
  return out;
}
