// pcb-geom.mjs — TRUE component extents from courtyards.
//
// pcb_component.width/height is the PAD bounding box, not the package: the D1 choke reports
// 64 x 4 mm for a 89 mm toroid, and a TO-247 reports 10.0 x 2.4 for a 15.9 x 5.0 package. Any
// placement check built on those numbers understates every clash. tscircuit's own courtyard DRC
// uses pcb_courtyard_rect / _circle / _outline, so this reads the same source it does.
export const extents = (j) => {
  const by = {};
  for (const e of j) (by[e.type] ??= []).push(e);
  const src = new Map(by.source_component.map((s) => [s.source_component_id, s]));
  const box = new Map();                       // pcb_component_id -> {x0,y0,x1,y1}
  const put = (id, x0, y0, x1, y1) => {
    const b = box.get(id);
    box.set(id, b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) }
                  : { x0, y0, x1, y1 });
  };
  for (const r of by.pcb_courtyard_rect ?? [])
    put(r.pcb_component_id, r.center.x - r.width / 2, r.center.y - r.height / 2,
        r.center.x + r.width / 2, r.center.y + r.height / 2);
  for (const c of by.pcb_courtyard_circle ?? [])
    put(c.pcb_component_id, c.center.x - c.radius, c.center.y - c.radius,
        c.center.x + c.radius, c.center.y + c.radius);
  for (const o of by.pcb_courtyard_outline ?? [])
    for (const p of o.outline) put(o.pcb_component_id, p.x, p.y, p.x, p.y);
  // fall back to the pad box only where no courtyard exists at all
  const parts = (by.pcb_component ?? []).map((p) => {
    const b = box.get(p.pcb_component_id) ?? {
      x0: p.center.x - p.width / 2, y0: p.center.y - p.height / 2,
      x1: p.center.x + p.width / 2, y1: p.center.y + p.height / 2,
    };
    return {
      id: p.pcb_component_id, name: src.get(p.source_component_id)?.name ?? "?", layer: p.layer,
      sourceId: p.source_component_id, groupId: src.get(p.source_component_id)?.source_group_id,
      x: p.center.x, y: p.center.y, hasCourtyard: box.has(p.pcb_component_id),
      ...b, w: b.x1 - b.x0, h: b.y1 - b.y0, area: (b.x1 - b.x0) * (b.y1 - b.y0),
    };
  });
  return { by, parts, board: by.pcb_board?.[0] };
};
