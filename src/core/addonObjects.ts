import { reactive, markRaw } from "vue";
import {
  UnsupportedPascal,
  type Value,
  type ObjectValue,
  type RoutineValue,
} from "./pascal";
export interface VirtualWindow {
  id: number;
  title: string;
  visible: boolean;
  width: number;
  height: number;
  controls: ObjectValue[];
  charts: ObjectValue[];
}
export interface VirtualTable {
  title: string;
  cells: Record<string, Value>;
}
export class AddonObjects {
  state = reactive({
    windows: [] as VirtualWindow[],
    tables: [] as VirtualTable[],
  });
  private objects = new Map<number, ObjectValue>();
  private next = 0;
  constructor(
    private read: (path: string) => string,
    private write: (path: string, data: string) => void,
    private callback: (fn: RoutineValue, args: Value[]) => void,
  ) {}
  reset() {
    this.objects.clear();
    this.next = 0;
    this.state.windows = [];
    this.state.tables = [];
  }
  private object(type: string, props: Record<string, Value> = {}): ObjectValue {
    if (this.objects.size >= 5000) throw Error("Objektlimit erreicht");
    const v = reactive({ object: type, id: ++this.next, props }) as ObjectValue;
    this.objects.set(v.id, v);
    return v;
  }
  private require(v: Value): ObjectValue {
    if (
      !v ||
      typeof v !== "object" ||
      !("object" in v) ||
      !this.objects.has(v.id)
    )
      throw Error("Objekt fehlt oder wurde freigegeben");
    return v;
  }
  create(type: string, args: Value[]): Value {
    if (type === "createoleobject") {
      if (String(args[0]).toLowerCase() !== "excel.application")
        throw new UnsupportedPascal(
          "Nur die virtuelle Excel-Tabelle wird unterstützt",
        );
      if (this.state.tables.length >= 32) throw Error("Tabellenlimit erreicht");
      const table = reactive({
        title: "Excel-Auswertung (virtuell)",
        cells: {} as Record<string, Value>,
      });
      this.state.tables.push(table);
      return this.object("excel", { table: this.state.tables.length - 1 });
    }
    const name = type.replace(".create", ""),
      o = this.object(name);
    if (args[0] && typeof args[0] === "object" && "object" in args[0])
      o.props.owner = args[0];
    if (name === "tfilestream") {
      const path = String(args[0]),
        mode = Number(args[1]);
      if (mode === 65535) this.write(path, "");
      else this.read(path);
      o.props.path = path;
      o.props.position = 0;
    }
    if (name === "tform") {
      if (this.state.windows.length >= 16) throw Error("Fensterlimit erreicht");
      Object.assign(o.props, {
        caption: "AddOn-Fenster",
        width: 640,
        height: 480,
        modalresult: 0,
      });
      this.state.windows.push({
        id: o.id,
        title: "AddOn-Fenster",
        visible: false,
        width: 640,
        height: 480,
        controls: [],
        charts: [],
      });
    }
    if (["tbutton", "tlabel"].includes(name))
      Object.assign(o.props, {
        caption: "",
        left: 0,
        top: 0,
        width: 100,
        height: 25,
        enabled: true,
        visible: true,
        modalresult: 0,
      });
    if (name === "tchart") o.props.series = { array: [], lower: 0 };
    if (["tlineseries", "tbarseries"].includes(name))
      o.props.points = { array: [], lower: 0 };
    if (name === "tadoquery") o.props.sql = { list: [] };
    return o;
  }
  member(value: Value, name: string, args?: Value[]): Value {
    const o = this.require(value),
      p = o.props,
      a = args ?? [],
      n = (i = 0) => Number(a[i] ?? 0);
    if (name === "free" || (name === "close" && o.object === "tform")) {
      this.free(o);
      return null;
    }
    if (name === "setbounds") {
      [p.left, p.top, p.width, p.height] = a;
      this.sync(o);
      return null;
    }
    if (name === "show") {
      this.show(o);
      return null;
    }
    if (name === "seek" && o.object === "tfilestream") {
      const data = this.read(String(p.path));
      p.position = Math.max(
        0,
        n() + (n(1) === 2 ? data.length : n(1) === 1 ? Number(p.position) : 0),
      );
      return p.position;
    }
    if (name === "write" && o.object === "tfilestream") {
      const data = this.read(String(p.path)),
        position = Number(p.position),
        part = String(a[0]).slice(0, Math.max(0, n(1)));
      this.write(
        String(p.path),
        data.padEnd(position, "\0").slice(0, position) +
          part +
          data.slice(position + part.length),
      );
      p.position = position + part.length;
      return part.length;
    }
    if (name === "addseries" && o.object === "tchart") {
      const v = p.series;
      if (v && typeof v === "object" && "array" in v) {
        if (v.array.length >= 64) throw Error("Serienlimit erreicht");
        v.array.push(a[0]!);
      }
      return null;
    }
    if (name === "addxy" && ["tlineseries", "tbarseries"].includes(o.object)) {
      const v = p.points;
      if (v && typeof v === "object" && "array" in v) {
        if (v.array.length >= 10000) throw Error("Diagrammlimit erreicht");
        v.array.push({ array: [n(), n(1), a[2] ?? "", a[3] ?? 255], lower: 0 });
        return v.array.length - 1;
      }
    }
    if (name === "execsql" && o.object === "tadoquery") {
      const sql = p.sql;
      if (!sql || typeof sql !== "object" || !("list" in sql))
        throw Error("SQL fehlt");
      const statement = sql.list.join(" "),
        m = statement.match(
          /^\s*INSERT\s+INTO\s+\[?(\w+)\]?\s*\(([^)]+)\)\s*VALUES\s*\((.*)\)\s*;?\s*$/i,
        );
      if (!m)
        throw new UnsupportedPascal(
          "Virtuelle Datenbank unterstützt nur INSERT INTO … VALUES",
        );
      const parts = m[3]!.match(/'(?:''|[^'])*'|[^,]+/g) ?? [],
        columns = m[2]!.split(",").map((s) => s.trim());
      if (parts.length !== columns.length)
        throw Error("SQL-Spaltenanzahl stimmt nicht");
      const title = `Datenbank: ${m[1]} (virtuell)`;
      let table = this.state.tables.find((t) => t.title === title);
      if (!table) {
        if (this.state.tables.length >= 32)
          throw Error("Tabellenlimit erreicht");
        this.state.tables.push({ title, cells: {} });
        table = this.state.tables.at(-1)!;
        columns.forEach((c, i) => (table!.cells[`1:${i + 1}`] = c));
      }
      const row =
        Math.max(
          1,
          ...Object.keys(table.cells).map((k) => Number(k.split(":")[0])),
        ) + 1;
      if (row > 10000) throw Error("Tabellenlimit erreicht");
      parts.forEach((s, i) => {
        s = s.trim();
        table!.cells[`${row}:${i + 1}`] = s.startsWith("'")
          ? s.slice(1, -1).replaceAll("''", "'")
          : Number(s);
      });
      return 1;
    }
    if (name === "close" && o.object === "tadoquery") return null;
    if (name === "add" && o.object === "workbooks") return o;
    if (Object.hasOwn(p, name)) return p[name]!;
    const children: Record<string, string[]> = {
      excel: ["workbooks", "cells"],
      tchart: ["bottomaxis", "leftaxis"],
      tlineseries: ["marks", "xvalues", "linepen"],
      tbarseries: ["marks", "xvalues", "linepen"],
      bottomaxis: ["title"],
      leftaxis: ["title"],
      tlabel: ["font"],
      tbutton: ["font"],
      tform: ["font"],
    };
    if (children[o.object]?.includes(name)) {
      const child = this.object(name, { owner: o });
      p[name] = child;
      return child;
    }
    throw new UnsupportedPascal(`${o.object}.${name} wird nicht unterstützt`);
  }
  set(value: Value, name: string, v: Value) {
    const o = this.require(value);
    const allowed = [
      "name",
      "caption",
      "width",
      "height",
      "left",
      "top",
      "parent",
      "position",
      "borderstyle",
      "align",
      "font",
      "size",
      "enabled",
      "visible",
      "modalresult",
      "onclick",
      "view3d",
      "title",
      "showinlegend",
      "datetime",
      "connectionstring",
      "connected",
      "connection",
      "value",
      "color",
    ];
    if (!allowed.includes(name))
      throw new UnsupportedPascal(`${o.object}.${name} ist nicht schreibbar`);
    if (name === "onclick" && v && typeof v === "object" && "routine" in v)
      v = markRaw(v);
    o.props[name] = v;
    if (o.object === "cell" && name === "value") {
      const table = this.state.tables[Number(o.props.table)]!;
      const key = String(o.props.key);
      if (
        !Object.hasOwn(table.cells, key) &&
        Object.keys(table.cells).length >= 20000
      )
        throw Error("Tabellenlimit erreicht");
      table.cells[key] = v;
    }
    if (name === "parent" && v && typeof v === "object" && "object" in v) {
      const win = this.state.windows.find((w) => w.id === v.id);
      if (win) {
        const list = o.object === "tchart" ? win.charts : win.controls;
        if (!list.some((x) => x.id === o.id)) list.push(o);
      }
    }
    this.sync(o);
  }
  index(value: Value, indices: Value[]): Value {
    const o = this.require(value);
    if (o.object === "cells") {
      const owner = this.require(o.props.owner!),
        row = Number(indices[0]),
        col = Number(indices[1]);
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 1 ||
        row > 10000 ||
        col < 1 ||
        col > 256
      )
        throw Error("Ungültige Tabellenzelle");
      const key = `${row}:${col}`;
      if (!o.props[key])
        o.props[key] = this.object("cell", { table: owner.props.table!, key });
      return o.props[key]!;
    }
    throw new UnsupportedPascal(`${o.object} unterstützt diesen Index nicht`);
  }
  private sync(o: ObjectValue) {
    const w = this.state.windows.find((w) => w.id === o.id);
    if (w) {
      w.title = String(o.props.caption);
      w.width = Math.max(200, Math.min(1600, Number(o.props.width)));
      w.height = Math.max(100, Math.min(1200, Number(o.props.height)));
    }
  }
  show(v: Value) {
    const o = this.require(v),
      w = this.state.windows.find((w) => w.id === o.id);
    if (!w) throw Error("TForm erwartet");
    w.visible = true;
  }
  close(id: number) {
    const o = this.objects.get(id);
    if (o) {
      o.props.modalresult = 2;
      const w = this.state.windows.find((w) => w.id === id);
      if (w) w.visible = false;
    }
  }
  click(id: number) {
    const o = this.objects.get(id);
    if (!o || o.props.enabled === false) return;
    const fn = o.props.onclick;
    if (fn && typeof fn === "object" && "routine" in fn) this.callback(fn, [o]);
    const parent = o.props.parent;
    if (
      o.props.modalresult &&
      parent &&
      typeof parent === "object" &&
      "object" in parent
    ) {
      parent.props.modalresult = o.props.modalresult;
      const w = this.state.windows.find((w) => w.id === parent.id);
      if (w) w.visible = false;
    }
  }
  free(v: Value) {
    const o = this.require(v);
    this.close(o.id);
    this.objects.delete(o.id);
    for (const child of [...this.objects.values()])
      if (child.props.parent === o || child.props.owner === o) this.free(child);
  }
}
