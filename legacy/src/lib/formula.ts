import type { CellValue, Database, DatabaseRow, PropertyDef } from "../types";

/**
 * Tiny, safe formula language for computed columns. No eval — a hand-rolled
 * tokenizer + recursive-descent parser + tree-walking evaluator.
 *
 * Reference other columns by name: bare identifiers (`Price * Qty`) or
 * `{Name With Spaces}`. Select values resolve to the option name.
 *
 * Operators:  + - * / %   == != > < >= <=   and or not   ( )
 * Functions:  if(cond, a, b), round(x, digits?), abs(x), min(…), max(…),
 *             concat(…), len(x), lower(x), upper(x), empty(x)
 * Literals:   numbers, "strings", 'strings', true, false, null
 */

export type FormulaValue = string | number | boolean | null;

/* ------------------------------ tokenizer ------------------------------ */

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "field"; value: string }
  | { kind: "op"; value: string };

const OPS = ["==", "!=", ">=", "<=", "&&", "||", ">", "<", "+", "-", "*", "/", "%", "(", ")", ",", "!", "="];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "{") {
      const end = src.indexOf("}", i);
      if (end === -1) throw new Error("unclosed {field}");
      tokens.push({ kind: "field", value: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== ch) {
        out += src[j] === "\\" && src[j + 1] === ch ? src[++j] : src[j];
        j++;
      }
      if (j >= src.length) throw new Error("unclosed string");
      tokens.push({ kind: "str", value: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!;
      tokens.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      tokens.push({ kind: "ident", value: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    const op = OPS.includes(two) ? two : OPS.includes(ch) ? ch : null;
    if (!op) throw new Error(`unexpected character "${ch}"`);
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

/* -------------------------------- parser ------------------------------- */

type Node =
  | { t: "lit"; v: FormulaValue }
  | { t: "field"; name: string }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; name: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.kind === "op" && t.value === v;
  }
  private isIdent(v: string): boolean {
    const t = this.peek();
    return t?.kind === "ident" && t.value.toLowerCase() === v;
  }
  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("unexpected end of formula");
    return t;
  }
  private expectOp(v: string) {
    const t = this.next();
    if (t.kind !== "op" || t.value !== v) throw new Error(`expected "${v}"`);
  }

  parse(): Node {
    const node = this.parseOr();
    if (this.pos < this.tokens.length) throw new Error("unexpected trailing input");
    return node;
  }

  private parseOr(): Node {
    let a = this.parseAnd();
    while (this.isOp("||") || this.isIdent("or")) {
      this.next();
      a = { t: "bin", op: "or", a, b: this.parseAnd() };
    }
    return a;
  }
  private parseAnd(): Node {
    let a = this.parseNot();
    while (this.isOp("&&") || this.isIdent("and")) {
      this.next();
      a = { t: "bin", op: "and", a, b: this.parseNot() };
    }
    return a;
  }
  private parseNot(): Node {
    if (this.isOp("!") || this.isIdent("not")) {
      this.next();
      return { t: "un", op: "not", a: this.parseNot() };
    }
    return this.parseCmp();
  }
  private parseCmp(): Node {
    const a = this.parseAdd();
    const t = this.peek();
    if (t?.kind === "op" && ["==", "!=", ">", "<", ">=", "<=", "="].includes(t.value)) {
      this.next();
      const op = t.value === "=" ? "==" : t.value;
      return { t: "bin", op, a, b: this.parseAdd() };
    }
    return a;
  }
  private parseAdd(): Node {
    let a = this.parseMul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.next() as { value: string }).value;
      a = { t: "bin", op, a, b: this.parseMul() };
    }
    return a;
  }
  private parseMul(): Node {
    let a = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.next() as { value: string }).value;
      a = { t: "bin", op, a, b: this.parseUnary() };
    }
    return a;
  }
  private parseUnary(): Node {
    if (this.isOp("-")) {
      this.next();
      return { t: "un", op: "neg", a: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Node {
    const t = this.next();
    if (t.kind === "num") return { t: "lit", v: t.value };
    if (t.kind === "str") return { t: "lit", v: t.value };
    if (t.kind === "field") return { t: "field", name: t.value };
    if (t.kind === "op" && t.value === "(") {
      const inner = this.parseOr();
      this.expectOp(")");
      return inner;
    }
    if (t.kind === "ident") {
      const lower = t.value.toLowerCase();
      if (lower === "true") return { t: "lit", v: true };
      if (lower === "false") return { t: "lit", v: false };
      if (lower === "null") return { t: "lit", v: null };
      if (this.isOp("(")) {
        this.next();
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.parseOr());
          while (this.isOp(",")) {
            this.next();
            args.push(this.parseOr());
          }
        }
        this.expectOp(")");
        return { t: "call", name: lower, args };
      }
      // Bare identifier = field reference.
      return { t: "field", name: t.value };
    }
    throw new Error("unexpected token");
  }
}

/* ------------------------------ evaluator ------------------------------ */

function truthy(v: FormulaValue): boolean {
  return !(v === null || v === false || v === 0 || v === "");
}

function num(v: FormulaValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === "") return 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`"${v}" is not a number`);
  return n;
}

function str(v: FormulaValue): string {
  if (v === null) return "";
  return String(v);
}

function evalNode(node: Node, resolve: (name: string) => FormulaValue): FormulaValue {
  switch (node.t) {
    case "lit":
      return node.v;
    case "field":
      return resolve(node.name);
    case "un": {
      const a = evalNode(node.a, resolve);
      return node.op === "not" ? !truthy(a) : -num(a);
    }
    case "bin": {
      if (node.op === "and") {
        const a = evalNode(node.a, resolve);
        return truthy(a) ? evalNode(node.b, resolve) : a;
      }
      if (node.op === "or") {
        const a = evalNode(node.a, resolve);
        return truthy(a) ? a : evalNode(node.b, resolve);
      }
      const a = evalNode(node.a, resolve);
      const b = evalNode(node.b, resolve);
      switch (node.op) {
        case "+":
          // String concat when either side is a string; numeric otherwise.
          return typeof a === "string" || typeof b === "string"
            ? str(a) + str(b)
            : num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/":
          return num(a) / num(b);
        case "%":
          return num(a) % num(b);
        case "==":
          return cmp(a, b) === 0;
        case "!=":
          return cmp(a, b) !== 0;
        case ">":
          return cmp(a, b) > 0;
        case "<":
          return cmp(a, b) < 0;
        case ">=":
          return cmp(a, b) >= 0;
        case "<=":
          return cmp(a, b) <= 0;
        default:
          throw new Error(`unknown operator ${node.op}`);
      }
    }
    case "call": {
      const args = node.args.map((a) => evalNode(a, resolve));
      switch (node.name) {
        case "if":
          return truthy(args[0] ?? null) ? args[1] ?? null : args[2] ?? null;
        case "round": {
          const f = Math.pow(10, num(args[1] ?? 0));
          return Math.round(num(args[0] ?? 0) * f) / f;
        }
        case "abs":
          return Math.abs(num(args[0] ?? 0));
        case "min":
          return Math.min(...args.map(num));
        case "max":
          return Math.max(...args.map(num));
        case "concat":
          return args.map(str).join("");
        case "len":
          return str(args[0] ?? "").length;
        case "lower":
          return str(args[0] ?? "").toLowerCase();
        case "upper":
          return str(args[0] ?? "").toUpperCase();
        case "empty":
          return !truthy(args[0] ?? null);
        default:
          throw new Error(`unknown function ${node.name}()`);
      }
    }
  }
}

function cmp(a: FormulaValue, b: FormulaValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = str(a);
  const bs = str(b);
  const an = Number(as);
  const bn = Number(bs);
  if (as !== "" && bs !== "" && !Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return as.localeCompare(bs);
}

/* ------------------------- cell-facing interface ------------------------ */

const astCache = new Map<string, Node | Error>();

function parseCached(formula: string): Node {
  let cached = astCache.get(formula);
  if (!cached) {
    try {
      cached = new Parser(tokenize(formula)).parse();
    } catch (e) {
      cached = e as Error;
    }
    astCache.set(formula, cached);
  }
  if (cached instanceof Error) throw cached;
  return cached;
}

/** Raw value a property yields for a row — computed types included. */
export function computedCellValue(
  db: Database,
  row: DatabaseRow,
  prop: PropertyDef,
  depth = 0
): CellValue {
  switch (prop.type) {
    case "created_time":
      return row.createdAt;
    case "last_edited_time":
      return row.updatedAt ?? row.createdAt;
    case "auto_id":
      return row.seq ?? null;
    case "formula": {
      if (!prop.formula || !prop.formula.trim()) return null;
      if (depth > 4) return "#REF"; // formula-references-formula depth guard
      try {
        const ast = parseCached(prop.formula);
        const value = evalNode(ast, (name) => {
          const target = db.properties.find(
            (p) => p.name.toLowerCase() === name.toLowerCase()
          );
          if (!target) throw new Error(`unknown field "${name}"`);
          if (target.id === prop.id) throw new Error("self reference");
          return toFormulaValue(db, row, target, depth + 1);
        });
        return value;
      } catch {
        return "#ERR";
      }
    }
    default:
      return row.cells[prop.id] ?? null;
  }
}

/** Convert a property's value for use inside formulas (options -> names). */
function toFormulaValue(
  db: Database,
  row: DatabaseRow,
  prop: PropertyDef,
  depth: number
): FormulaValue {
  const v = computedCellValue(db, row, prop, depth);
  if (Array.isArray(v)) {
    return v
      .map((id) => prop.options?.find((o) => o.id === id)?.name ?? id)
      .join(", ");
  }
  if (prop.type === "select" && typeof v === "string") {
    return prop.options?.find((o) => o.id === v)?.name ?? v;
  }
  return v as FormulaValue;
}

/** Human-readable rendering for computed cells. */
export function formatComputed(prop: PropertyDef, value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (prop.type === "created_time" || prop.type === "last_edited_time") {
    return new Date(Number(value)).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (prop.type === "auto_id") return String(value);
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "number" && !Number.isInteger(value)) {
    return String(Math.round(value * 1e6) / 1e6);
  }
  return String(value);
}

export function isComputedType(type: PropertyDef["type"]): boolean {
  return (
    type === "formula" ||
    type === "created_time" ||
    type === "last_edited_time" ||
    type === "auto_id"
  );
}
