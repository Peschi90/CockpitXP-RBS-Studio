// Bounded Pascal interpreter. Script code never becomes JavaScript or native code.
export type Value =
  | number
  | string
  | boolean
  | null
  | { list: string[] }
  | ArrayValue
  | ObjectValue
  | RoutineValue;
export interface ArrayValue {
  array: Value[];
  lower: number;
}
export interface ObjectValue {
  object: string;
  id: number;
  props: Record<string, Value>;
}
export interface RoutineValue {
  routine: (args: Value[]) => Execution;
}
export interface Reference {
  get(): Value;
  set(value: Value): void;
}
type Token = { text: string; kind: string; line: number };
type Expr =
  | { kind: "literal"; value: Value }
  | { kind: "name"; name: string }
  | { kind: "member"; base: Expr; name: string }
  | { kind: "index"; base: Expr; indices: Expr[] }
  | { kind: "call"; callee: Expr; args: Expr[] }
  | { kind: "address"; value: Expr }
  | { kind: "array"; items: Expr[] }
  | { kind: "unary"; op: string; value: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr };
type TypeSpec = {
  name: string;
  ranges?: { low: Expr; high: Expr }[];
  element?: TypeSpec;
};
type Statement = {
  kind: string;
  line: number;
  body?: Statement[];
  other?: Statement[];
  expression?: Expr;
  target?: Expr;
  start?: Expr;
  end?: Expr;
  step?: number;
  branches?: { labels: { low: Expr; high?: Expr }[]; body: Statement[] }[];
};
type Declaration = { name: string; initial?: Expr; type?: TypeSpec };
export interface Program {
  declarations: Declaration[];
  routines: Map<string, Routine>;
  body: Statement[];
}
interface Routine {
  params: { name: string; reference: boolean }[];
  program: Program;
}
export class UnsupportedPascal extends Error {}
export interface PascalHost {
  beforeSleep?(): void;
  get(name: string): Value;
  set(name: string, value: Value): void;
  call(name: string, args: Value[], refs?: (Reference | undefined)[]): Value;
  member?(object: Value, name: string, args?: Value[]): Value;
  memberSet?(object: Value, name: string, value: Value): void;
  index?(object: Value, indices: Value[]): Value;
  indexSet?(object: Value, indices: Value[], value: Value): void;
  lock?(name: string, enter: boolean): boolean;
}
export type Effect = { sleep: number } | { step: number } | { poll: true };
export type Execution = Generator<Effect, Value, void>;
function tokenize(source: string): Token[] {
  if (source.length > 1_000_000) throw Error("Skript größer als 1 MB");
  const out: Token[] = [];
  let p = 0,
    line = 1;
  while (p < source.length) {
    const rest = source.slice(p);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\s+/))) {
      line += (m[0].match(/\n/g) || []).length;
      p += m[0].length;
      continue;
    }
    if (rest.startsWith("//")) {
      const end = source.indexOf("\n", p);
      p = end < 0 ? source.length : end;
      continue;
    }
    if (rest.startsWith("{") || rest.startsWith("(*")) {
      const closing = rest.startsWith("{") ? "}" : "*)",
        end = source.indexOf(closing, p + 1);
      if (end < 0) throw Error(`Zeile ${line}: Kommentar nicht abgeschlossen`);
      line += (source.slice(p, end).match(/\n/g) || []).length;
      p = end + closing.length;
      continue;
    }
    const at = line;
    if (rest[0] === "'") {
      let value = "",
        closed = false;
      p++;
      while (p < source.length) {
        const c = source[p++]!;
        if (c === "'") {
          if (source[p] === "'") {
            value += "'";
            p++;
          } else {
            closed = true;
            break;
          }
        } else {
          value += c;
          if (c === "\n") line++;
        }
      }
      if (!closed) throw Error(`Zeile ${at}: Zeichenkette nicht abgeschlossen`);
      out.push({ text: value, kind: "string", line: at });
      continue;
    }
    if ((m = rest.match(/^#(\$[\da-f]+|\d+)/i))) {
      const v = m[1]!;
      out.push({
        text: String.fromCharCode(
          v[0] === "$" ? parseInt(v.slice(1), 16) : Number(v),
        ),
        kind: "string",
        line,
      });
      p += m[0].length;
      continue;
    }
    if ((m = rest.match(/^(\$[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i))) {
      out.push({ text: m[0], kind: "number", line });
      p += m[0].length;
      continue;
    }
    if ((m = rest.match(/^[a-z_][a-z_\d]*/i))) {
      out.push({ text: m[0].toLowerCase(), kind: "word", line });
      p += m[0].length;
      continue;
    }
    if ((m = rest.match(/^(?::=|<>|<=|>=|\.\.|[+*/=<>;:.,()[\]@\-])/))) {
      out.push({ text: m[0], kind: "symbol", line });
      p += m[0].length;
      continue;
    }
    throw Error(`Zeile ${line}: Nicht unterstütztes Zeichen „${rest[0]}“`);
  }
  out.push({ text: "<eof>", kind: "eof", line });
  return out;
}
export function compilePascal(source: string): Program {
  const ts = tokenize(source);
  let pos = 0;
  const token = () => ts[pos]!;
  const is = (s: string) => token().text === s && token().kind !== "string";
  const take = (s: string) => {
    if (is(s)) {
      pos++;
      return true;
    }
    return false;
  };
  const fail = (s: string): never => {
    throw Error(`Zeile ${token().line}: ${s} (bei „${token().text}“)`);
  };
  const need = (s: string) => {
    if (!take(s)) fail(`„${s}“ erwartet`);
  };
  const identifier = () => {
    if (token().kind !== "word") fail("Name erwartet");
    return ts[pos++]!.text;
  };
  const precedence: Record<string, number> = {
    "=": 1,
    "<>": 1,
    "<": 1,
    ">": 1,
    "<=": 1,
    ">=": 1,
    or: 2,
    xor: 2,
    "+": 3,
    "-": 3,
    and: 4,
    "*": 5,
    "/": 5,
    div: 5,
    mod: 5,
    shl: 5,
    shr: 5,
  };
  function expression(min = 0): Expr {
    let left: Expr;
    if (take("not")) left = { kind: "unary", op: "not", value: expression(6) };
    else if (take("-")) left = { kind: "unary", op: "-", value: expression(6) };
    else if (take("+")) left = expression(6);
    else if (take("@"))
      left = { kind: "address", value: { kind: "name", name: identifier() } };
    else if (take("(")) {
      left = expression();
      need(")");
    } else if (take("[")) {
      const items: Expr[] = [];
      if (!is("]"))
        do {
          items.push(expression());
        } while (take(","));
      need("]");
      left = { kind: "array", items };
    } else if (token().kind === "string") {
      let value = ts[pos++]!.text;
      while (token().kind === "string") value += ts[pos++]!.text;
      left = { kind: "literal", value };
    } else if (token().kind === "number") {
      const n = ts[pos++]!.text;
      left = {
        kind: "literal",
        value: n[0] === "$" ? parseInt(n.slice(1), 16) : Number(n),
      };
    } else if (take("true")) left = { kind: "literal", value: true };
    else if (take("false")) left = { kind: "literal", value: false };
    else if (take("nil")) left = { kind: "literal", value: null };
    else left = { kind: "name", name: identifier() };
    while (true) {
      if (take(".")) left = { kind: "member", base: left, name: identifier() };
      else if (take("[")) {
        const indices: Expr[] = [];
        do {
          indices.push(expression());
        } while (take(","));
        need("]");
        left = { kind: "index", base: left, indices };
      } else if (take("(")) {
        const args: Expr[] = [];
        if (!is(")"))
          do {
            args.push(expression());
          } while (take(","));
        need(")");
        left = { kind: "call", callee: left, args };
      } else break;
    }
    while (
      token().kind !== "string" &&
      (precedence[token().text] ?? -1) >= min
    ) {
      const op = ts[pos++]!.text;
      left = {
        kind: "binary",
        op,
        left,
        right: expression(precedence[op]! + 1),
      };
    }
    return left;
  }
  function sequence(stops: string[]): Statement[] {
    const out: Statement[] = [];
    while (!stops.some(is)) {
      if (is("<eof>")) fail("Unerwartetes Skriptende");
      if (take(";")) continue;
      out.push(statement());
      if (!take(";") && !stops.some(is)) fail("Semikolon erwartet");
    }
    return out;
  }
  function statement(): Statement {
    const line = token().line;
    if (take("begin")) {
      const body = sequence(["end"]);
      need("end");
      return { kind: "block", line, body };
    }
    if (take("if")) {
      const condition = expression();
      need("then");
      const body = [statement()],
        other = take("else") ? [statement()] : [];
      return { kind: "if", line, expression: condition, body, other };
    }
    if (take("case")) {
      const exp = expression();
      need("of");
      const branches: NonNullable<Statement["branches"]> = [];
      while (!is("end") && !is("else")) {
        const labels: { low: Expr; high?: Expr }[] = [];
        do {
          const low = expression(),
            high = take("..") ? expression() : undefined;
          labels.push({ low, high });
        } while (take(","));
        need(":");
        branches.push({ labels, body: [statement()] });
        if (!take(";") && !is("end") && !is("else")) fail("Semikolon erwartet");
      }
      const other = take("else") ? sequence(["end"]) : [];
      need("end");
      return { kind: "case", line, expression: exp, branches, other };
    }
    if (take("while")) {
      const exp = expression();
      need("do");
      return { kind: "while", line, expression: exp, body: [statement()] };
    }
    if (take("repeat")) {
      const body = sequence(["until"]);
      need("until");
      return { kind: "repeat", line, expression: expression(), body };
    }
    if (take("for")) {
      const target = expression();
      need(":=");
      const start = expression(),
        step = take("downto") ? -1 : (need("to"), 1),
        end = expression();
      need("do");
      return {
        kind: "for",
        line,
        target,
        start,
        end,
        step,
        body: [statement()],
      };
    }
    if (take("try")) {
      const body = sequence(["except", "finally"]),
        kind = ts[pos++]!.text,
        other = sequence(["end"]);
      need("end");
      return { kind, line, body, other };
    }
    for (const kind of ["exit", "break", "continue"])
      if (take(kind)) return { kind, line };
    if (is(";") || is("end") || is("else"))
      return { kind: "block", line, body: [] };
    const exp = expression();
    if (take(":=")) {
      if (!["name", "member", "index"].includes(exp.kind))
        fail("Zuweisungsziel erwartet");
      return { kind: "assign", line, target: exp, expression: expression() };
    }
    return { kind: "call", line, expression: exp };
  }
  function typeSpec(): TypeSpec {
    const name = identifier();
    if (name === "array") {
      const ranges: { low: Expr; high: Expr }[] = [];
      if (take("[")) {
        do {
          const low = expression();
          need("..");
          ranges.push({ low, high: expression() });
        } while (take(","));
        need("]");
      }
      need("of");
      return { name, ranges, element: typeSpec() };
    }
    if (
      ![
        "integer",
        "longint",
        "cardinal",
        "byte",
        "word",
        "extended",
        "double",
        "single",
        "real",
        "boolean",
        "string",
        "ansistring",
        "variant",
        "tstringlist",
        "tadoconnection",
        "tadoquery",
        "tbarseries",
        "tbutton",
        "tchart",
        "tchartaxis",
        "tcolor",
        "tdatetime",
        "tfilestream",
        "tform",
        "tlabel",
        "tlineseries",
        "tobject",
      ].includes(name)
    )
      fail(`Datentyp ${name} wird noch nicht unterstützt`);
    return { name };
  }
  function program(): Program {
    const declarations: Declaration[] = [],
      routines = new Map<string, Routine>();
    const boundaries = ["begin", "procedure", "function", "const", "var"];
    while (!is("begin")) {
      if (take("var")) {
        do {
          const names = [identifier()];
          while (take(",")) names.push(identifier());
          need(":");
          const type = typeSpec();
          need(";");
          for (const name of names) declarations.push({ name, type });
        } while (!boundaries.some(is));
      } else if (take("const")) {
        do {
          const name = identifier();
          need("=");
          const initial = expression();
          need(";");
          declarations.push({ name, initial });
        } while (!boundaries.some(is));
      } else if (is("procedure") || is("function")) {
        const fn = take("function");
        if (!fn) need("procedure");
        const name = identifier(),
          params: Routine["params"] = [];
        if (take("(")) {
          if (!is(")"))
            do {
              const reference = take("var") || take("out");
              take("const");
              const names = [identifier()];
              while (take(",")) names.push(identifier());
              need(":");
              typeSpec();
              for (const name of names) params.push({ name, reference });
            } while (take(";"));
          need(")");
        }
        if (fn) {
          need(":");
          typeSpec();
        }
        need(";");
        const body = program();
        need(";");
        routines.set(name, { params, program: body });
      } else
        fail(
          "Deklaration oder begin erwartet; dieses Pascal-Konstrukt wird noch nicht unterstützt",
        );
    }
    need("begin");
    const body = sequence(["end"]);
    need("end");
    return { declarations, routines, body };
  }
  if (is("<eof>")) return { declarations: [], routines: new Map(), body: [] };
  const result = program();
  take(".");
  if (!is("<eof>")) fail("Unerwarteter Text nach end");
  return result;
}
class Flow {
  constructor(public kind: string) {}
}
class Scope {
  values = new Map<string, Value>();
  refs = new Map<string, Reference>();
  constructor(
    public program: Program,
    public parent?: Scope,
  ) {}
  owner(name: string): Scope | undefined {
    return this.values.has(name) || this.refs.has(name)
      ? this
      : this.parent?.owner(name);
  }
  routine(name: string): { routine: Routine; scope: Scope } | undefined {
    const routine = this.program.routines.get(name);
    return routine ? { routine, scope: this } : this.parent?.routine(name);
  }
}
export function* executePascal(program: Program, host: PascalHost): Execution {
  let depth = 0;
  const unsupported = (s: string): never => {
    throw new UnsupportedPascal(s);
  };
  function staticName(e: Expr, scope: Scope): string | undefined {
    if (e.kind === "name") return scope.owner(e.name) ? undefined : e.name;
    if (e.kind === "member") {
      const base = staticName(e.base, scope);
      return base ? `${base}.${e.name}` : undefined;
    }
  }
  function listMember(
    v: { list: string[] },
    name: string,
    args: Value[] = [],
  ): Value {
    const n = Number(args[0]);
    switch (name) {
      case "add":
        if (v.list.length >= 10000) throw Error("TStringList-Limit erreicht");
        return v.list.push(String(args[0] ?? "")) - 1;
      case "free":
      case "clear":
        v.list.length = 0;
        return null;
      case "count":
        return v.list.length;
      case "text":
        return v.list.join("\r\n");
      case "strings":
        return v;
      case "delete":
        if (!Number.isInteger(n) || n < 0 || n >= v.list.length)
          throw Error("Listenindex außerhalb des Bereichs");
        v.list.splice(n, 1);
        return null;
      case "indexof":
        return v.list.indexOf(String(args[0]));
      case "savetofile":
        return host.call("virtual.write", [args[0]!, v.list.join("\r\n")]);
      case "loadfromfile": {
        const text = String(host.call("virtual.read", args));
        v.list = text ? text.replace(/\r?\n$/, "").split(/\r?\n/) : [];
        return null;
      }
    }
    return unsupported(`TStringList.${name} wird nicht unterstützt`);
  }
  function member(v: Value, name: string, args?: Value[]): Value {
    if (v && typeof v === "object" && "list" in v)
      return listMember(v, name, args);
    if (host.member) return host.member(v, name, args);
    return unsupported(`Objekteigenschaft ${name} wird nicht unterstützt`);
  }
  function index(v: Value, indices: Value[]): Value {
    if (indices.length > 1 && v && typeof v === "object" && "array" in v) {
      let result = v as Value;
      for (const n of indices) result = index(result, [n]);
      return result;
    }
    const n = Number(indices[0]);
    if (v && typeof v === "object" && ("array" in v || "list" in v)) {
      const values = "array" in v ? v.array : v.list,
        low = "array" in v ? v.lower : 0;
      if (!Number.isInteger(n) || n < low || n >= low + values.length)
        throw Error(`Index ${n} außerhalb ${low}..${low + values.length - 1}`);
      return values[n - low]!;
    }
    if (typeof v === "string") {
      if (n < 1 || n > v.length)
        throw Error("Zeichenindex außerhalb des Bereichs");
      return v[n - 1]!;
    }
    if (host.index) return host.index(v, indices);
    return unsupported("Objekt unterstützt keinen Index");
  }
  function* reference(
    e: Expr,
    scope: Scope,
  ): Generator<Effect, Reference, void> {
    if (e.kind === "name") {
      const owner = scope.owner(e.name);
      return owner
        ? (owner.refs.get(e.name) ?? {
            get: () => owner.values.get(e.name)!,
            set: (v) => {
              owner.values.set(e.name, v);
            },
          })
        : { get: () => host.get(e.name), set: (v) => host.set(e.name, v) };
    }
    const name = staticName(e, scope);
    if (name)
      return { get: () => host.get(name), set: (v) => host.set(name, v) };
    if (e.kind === "member") {
      const base = yield* evaluate(e.base, scope);
      return {
        get: () => member(base, e.name),
        set: (v) => {
          if (
            base &&
            typeof base === "object" &&
            "list" in base &&
            e.name === "text"
          ) {
            base.list = String(v).split(/\r?\n/);
            return;
          }
          if (!host.memberSet)
            unsupported(`Zuweisung an ${e.name} nicht unterstützt`);
          host.memberSet!(base, e.name, v);
        },
      };
    }
    if (e.kind === "index") {
      let base = yield* evaluate(e.base, scope);
      const indices: Value[] = [];
      for (const i of e.indices) indices.push(yield* evaluate(i, scope));
      if (
        base &&
        typeof base === "object" &&
        "array" in base &&
        indices.length > 1
      ) {
        for (const i of indices.slice(0, -1)) base = index(base, [i]);
        indices.splice(0, indices.length - 1);
      }
      const target = base;
      return {
        get: () => index(target, indices),
        set: (v) => {
          if (
            target &&
            typeof target === "object" &&
            ("array" in target || "list" in target)
          ) {
            index(target, indices);
            const i = Number(indices[0]);
            if ("array" in target) target.array[i - target.lower] = v;
            else target.list[i] = String(v);
            return;
          }
          if (typeof target === "string")
            throw Error("Zeichenweise Stringzuweisung wird nicht unterstützt");
          if (!host.indexSet) unsupported("Indexzuweisung nicht unterstützt");
          host.indexSet!(target, indices, v);
        },
      };
    }
    throw Error("Variable als Referenz erwartet");
  }
  function clone(v: Value): Value {
    return v && typeof v === "object" && "array" in v
      ? { lower: v.lower, array: v.array.map(clone) }
      : v;
  }
  function* callRoutine(
    fn: { routine: Routine; scope: Scope },
    args: Value[],
    refs: (Reference | undefined)[] = [],
  ): Execution {
    if (++depth > 64) throw Error("Maximale Aufruftiefe erreicht");
    try {
      if (args.length !== fn.routine.params.length)
        throw Error("Falsche Parameteranzahl");
      const inner = new Scope(fn.routine.program, fn.scope);
      inner.values.set("result", 0);
      fn.routine.params.forEach((p, i) => {
        if (p.reference) {
          if (!refs[i]) throw Error("Referenzparameter benötigt Variable");
          inner.refs.set(p.name, refs[i]!);
        } else inner.values.set(p.name, clone(args[i]!));
      });
      return yield* run(inner);
    } finally {
      depth--;
    }
  }
  function* invoke(callee: Expr, argExprs: Expr[], scope: Scope): Execution {
    yield { step: 0 };
    const args: Value[] = [],
      refs: (Reference | undefined)[] = [];
    for (const a of argExprs) {
      args.push(yield* evaluate(a, scope));
      refs.push(
        ["name", "member", "index"].includes(a.kind)
          ? yield* reference(a, scope)
          : undefined,
      );
    }
    const name = staticName(callee, scope);
    if (name) {
      if (name === "cpsleep") {
        host.beforeSleep?.();
        const ms = Number(args[0]);
        if (!Number.isFinite(ms) || ms < 0 || ms > 86400000)
          throw Error("Ungültige cpSleep-Dauer");
        yield { sleep: Math.max(1, ms) };
        return null;
      }
      if (/^cp(enter|leave)criticalsection(event)?$/.test(name) && host.lock) {
        const enter = name.startsWith("cpenter");
        while (!host.lock(name.endsWith("event") ? "event" : "package", enter))
          yield { sleep: 10 };
        return null;
      }
      const fn = scope.routine(name);
      if (fn) return yield* callRoutine(fn, args, refs);
      if (["inc", "dec", "delete", "insert", "setlength"].includes(name)) {
        const r = refs[name === "insert" ? 1 : 0];
        if (!r) throw Error(`${name} benötigt eine Variable`);
        if (name === "inc" || name === "dec")
          r.set(
            Number(args[0]) + (name === "inc" ? 1 : -1) * Number(args[1] ?? 1),
          );
        if (name === "delete") {
          const s = String(args[0]),
            p = Math.max(0, Number(args[1]) - 1);
          r.set(s.slice(0, p) + s.slice(p + Math.max(0, Number(args[2]))));
        }
        if (name === "insert") {
          const s = String(args[1]),
            p = Math.max(0, Number(args[2]) - 1);
          r.set(s.slice(0, p) + String(args[0]) + s.slice(p));
        }
        if (name === "setlength") {
          const n = Number(args[1]);
          if (!Number.isInteger(n) || n < 0 || n > 10000)
            throw Error("Array-/Stringlimit erreicht");
          const v = args[0];
          if (v && typeof v === "object" && "array" in v) {
            v.array.length = n;
            for (let i = 0; i < n; i++) v.array[i] ??= 0;
          } else r.set(String(v).slice(0, n).padEnd(n, "\0"));
        }
        return null;
      }
      if (name === "length" || name === "low" || name === "high") {
        const v = args[0];
        if (v && typeof v === "object" && "array" in v)
          return name === "length"
            ? v.array.length
            : name === "low"
              ? v.lower
              : v.lower + v.array.length - 1;
        return name === "low" ? 1 : String(v ?? "").length;
      }
      const result = host.call(name, args, refs);
      if (name === "cpgetinput") yield { poll: true };
      return result;
    }
    if (callee.kind === "member")
      return member(yield* evaluate(callee.base, scope), callee.name, args);
    const v = yield* evaluate(callee, scope);
    if (v && typeof v === "object" && "routine" in v)
      return yield* v.routine(args);
    throw Error("Aufrufbares Objekt erwartet");
  }
  function* evaluate(e: Expr, scope: Scope): Execution {
    yield { step: 0 };
    if (e.kind === "literal") return e.value;
    if (e.kind === "address") {
      if (e.value.kind !== "name") throw Error("Prozedurname erwartet");
      const fn = scope.routine(e.value.name);
      if (!fn) throw Error("Unbekannte Callback-Prozedur");
      return { routine: (args) => callRoutine(fn, args) };
    }
    if (e.kind === "array") {
      const array: Value[] = [];
      for (const a of e.items) array.push(yield* evaluate(a, scope));
      return { array, lower: 0 };
    }
    if (e.kind === "name") {
      const owner = scope.owner(e.name);
      if (owner)
        return (
          owner.refs.get(e.name)?.get() ?? owner.values.get(e.name) ?? null
        );
      if (
        scope.routine(e.name) ||
        e.name.startsWith("cp") ||
        ["random", "randomize", "now"].includes(e.name)
      )
        return yield* invoke(e, [], scope);
      return host.get(e.name);
    }
    if (e.kind === "member") {
      const name = staticName(e, scope);
      if (name)
        return name.startsWith("cockpit.")
          ? host.get(name)
          : yield* invoke(e, [], scope);
      return member(yield* evaluate(e.base, scope), e.name);
    }
    if (e.kind === "index") {
      const values: Value[] = [];
      for (const i of e.indices) values.push(yield* evaluate(i, scope));
      return index(yield* evaluate(e.base, scope), values);
    }
    if (e.kind === "call") return yield* invoke(e.callee, e.args, scope);
    if (e.kind === "unary") {
      const v = yield* evaluate(e.value, scope);
      return e.op === "not"
        ? typeof v === "boolean"
          ? !v
          : ~Number(v)
        : -Number(v);
    }
    const a = yield* evaluate(e.left, scope);
    if (e.op === "and" && a === false) return false;
    if (e.op === "or" && a === true) return true;
    const b = yield* evaluate(e.right, scope);
    switch (e.op) {
      case "+": {
        const v =
          typeof a === "string" || typeof b === "string"
            ? String(a) + String(b)
            : Number(a) + Number(b);
        if (typeof v === "string" && v.length > 1_000_000)
          throw Error("Zeichenkettenlimit erreicht");
        return v;
      }
      case "-":
        return Number(a) - Number(b);
      case "*":
        return Number(a) * Number(b);
      case "/":
      case "div":
      case "mod":
        if (Number(b) === 0) throw Error("Division durch null");
        return e.op === "div"
          ? Math.trunc(Number(a) / Number(b))
          : e.op === "mod"
            ? Number(a) % Number(b)
            : Number(a) / Number(b);
      case "=":
        return a === b;
      case "<>":
        return a !== b;
      case "<":
        return a! < b!;
      case ">":
        return a! > b!;
      case "<=":
        return a! <= b!;
      case ">=":
        return a! >= b!;
      case "and":
        return typeof a === "boolean" ? Boolean(a && b) : Number(a) & Number(b);
      case "or":
        return typeof a === "boolean" ? Boolean(a || b) : Number(a) | Number(b);
      case "xor":
        return typeof a === "boolean"
          ? Boolean(a) !== Boolean(b)
          : Number(a) ^ Number(b);
      case "shl":
        return Number(a) << Number(b);
      case "shr":
        return Number(a) >>> Number(b);
    }
    throw Error(`Operator ${e.op} nicht unterstützt`);
  }
  function* statements(list: Statement[], scope: Scope): Execution {
    for (const s of list) {
      yield { step: s.line };
      switch (s.kind) {
        case "block":
          yield* statements(s.body!, scope);
          break;
        case "assign": {
          const r = yield* reference(s.target!, scope);
          r.set(yield* evaluate(s.expression!, scope));
          break;
        }
        case "call":
          yield* evaluate(s.expression!, scope);
          break;
        case "if":
          yield* statements(
            (yield* evaluate(s.expression!, scope)) ? s.body! : s.other!,
            scope,
          );
          break;
        case "case": {
          const v = yield* evaluate(s.expression!, scope);
          let body = s.other!;
          outer: for (const branch of s.branches!)
            for (const l of branch.labels) {
              const low = yield* evaluate(l.low, scope),
                high = l.high ? yield* evaluate(l.high, scope) : low;
              if (v! >= low! && v! <= high!) {
                body = branch.body;
                break outer;
              }
            }
          yield* statements(body, scope);
          break;
        }
        case "while":
        case "repeat": {
          let first = true;
          while (
            s.kind === "repeat"
              ? first || !(yield* evaluate(s.expression!, scope))
              : Boolean(yield* evaluate(s.expression!, scope))
          ) {
            first = false;
            try {
              yield* statements(s.body!, scope);
            } catch (e) {
              if (e instanceof Flow && e.kind === "break") break;
              if (!(e instanceof Flow && e.kind === "continue")) throw e;
            }
          }
          break;
        }
        case "for": {
          const start = Number(yield* evaluate(s.start!, scope)),
            end = Number(yield* evaluate(s.end!, scope));
          const r = yield* reference(s.target!, scope);
          for (let i = start; s.step! > 0 ? i <= end : i >= end; i += s.step!) {
            r.set(i);
            try {
              yield* statements(s.body!, scope);
            } catch (e) {
              if (e instanceof Flow && e.kind === "break") break;
              if (!(e instanceof Flow && e.kind === "continue")) throw e;
            }
          }
          break;
        }
        case "except":
          try {
            yield* statements(s.body!, scope);
          } catch (e) {
            if (e instanceof Flow || e instanceof UnsupportedPascal) throw e;
            yield* statements(s.other!, scope);
          }
          break;
        case "finally":
          try {
            yield* statements(s.body!, scope);
          } finally {
            yield* statements(s.other!, scope);
          }
          break;
        default:
          throw new Flow(s.kind);
      }
    }
    return null;
  }
  function* defaultValue(
    type: TypeSpec,
    scope: Scope,
    budget: { left: number },
  ): Execution {
    if (--budget.left < 0) throw Error("Arraylimit erreicht");
    if (type.name === "array") {
      if (!type.ranges?.length) return { array: [], lower: 0 };
      const [first, ...rest] = type.ranges,
        low = Number(yield* evaluate(first!.low, scope)),
        high = Number(yield* evaluate(first!.high, scope));
      if (
        !Number.isInteger(low) ||
        !Number.isInteger(high) ||
        high < low ||
        high - low > 10000
      )
        throw Error("Ungültige Arraygrenzen");
      const array: Value[] = [];
      for (let i = low; i <= high; i++)
        array.push(
          yield* defaultValue(
            rest.length ? { ...type, ranges: rest } : type.element!,
            scope,
            budget,
          ),
        );
      return { array, lower: low };
    }
    return ["string", "ansistring"].includes(type.name)
      ? ""
      : type.name === "boolean"
        ? false
        : (type.name.startsWith("t") &&
              !["tdatetime", "tcolor"].includes(type.name)) ||
            type.name === "variant"
          ? null
          : 0;
  }
  function* run(scope: Scope): Execution {
    const budget = { left: 20000 };
    for (const d of scope.program.declarations)
      scope.values.set(
        d.name,
        d.initial
          ? yield* evaluate(d.initial, scope)
          : yield* defaultValue(d.type!, scope, budget),
      );
    try {
      yield* statements(scope.program.body, scope);
    } catch (e) {
      if (!(e instanceof Flow && e.kind === "exit")) throw e;
    }
    return scope.values.get("result") ?? null;
  }
  return yield* run(new Scope(program));
}
