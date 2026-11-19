export interface MolangContext {
  /** query.* values, e.g. anim_time, life_time, delta_time */
  queries: Record<string, number>;
  /** variable.* values (v.*) */
  vars?: Record<string, number>;
  /** temporary.* values (t.*) */
  temps?: Record<string, number>;
}

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string };

const TOKEN_RE =
  /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|(&&|\|\||==|!=|<=|>=|[<>!+\-*/%?:(),]))/g;

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let index = 0;
  while (index < expression.length) {
    TOKEN_RE.lastIndex = index;
    const match = TOKEN_RE.exec(expression);
    if (!match || match.index !== index) {
      // Skip an unknown character instead of failing the whole animation.
      index += 1;
      continue;
    }
    index = TOKEN_RE.lastIndex;
    if (match[1] !== undefined) tokens.push({ type: "number", value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ type: "identifier", value: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: "operator", value: match[3] });
  }
  return tokens;
}

export class MolangExpression {
  private tokens: Token[];
  private pos = 0;
  private readonly source: string;

  constructor(expression: string) {
    this.source = expression;
    this.tokens = tokenize(expression);
  }

  evaluate(context: MolangContext): number {
    this.pos = 0;
    try {
      const value = this.parseTernary(context);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(value: string): boolean {
    const token = this.peek();
    if (token && token.type === "operator" && token.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) throw new Error(`Expected ${value} in "${this.source}"`);
  }

  private parseTernary(context: MolangContext): number {
    const condition = this.parseOr(context);
    if (this.eat("?")) {
      const whenTrue = this.parseTernary(context);
      this.expect(":");
      const whenFalse = this.parseTernary(context);
      return condition ? whenTrue : whenFalse;
    }
    return condition;
  }

  private parseOr(context: MolangContext): number {
    let value = this.parseAnd(context);
    while (this.eat("||")) {
      const rhs = this.parseAnd(context);
      value = value || rhs ? 1 : 0;
    }
    return value;
  }

  private parseAnd(context: MolangContext): number {
    let value = this.parseComparison(context);
    while (this.eat("&&")) {
      const rhs = this.parseComparison(context);
      value = value && rhs ? 1 : 0;
    }
    return value;
  }

  private parseComparison(context: MolangContext): number {
    let value = this.parseAdd(context);
    while (true) {
      const token = this.peek();
      if (!token || token.type !== "operator") break;
      const op = token.value;
      if (!["<", ">", "<=", ">=", "==", "!="].includes(op)) break;
      this.pos++;
      const rhs = this.parseAdd(context);
      switch (op) {
        case "<":
          value = value < rhs ? 1 : 0;
          break;
        case ">":
          value = value > rhs ? 1 : 0;
          break;
        case "<=":
          value = value <= rhs ? 1 : 0;
          break;
        case ">=":
          value = value >= rhs ? 1 : 0;
          break;
        case "==":
          value = value === rhs ? 1 : 0;
          break;
        case "!=":
          value = value !== rhs ? 1 : 0;
          break;
      }
    }
    return value;
  }

  private parseAdd(context: MolangContext): number {
    let value = this.parseMul(context);
    while (true) {
      if (this.eat("+")) value += this.parseMul(context);
      else if (this.eat("-")) value -= this.parseMul(context);
      else break;
    }
    return value;
  }

  private parseMul(context: MolangContext): number {
    let value = this.parseUnary(context);
    while (true) {
      if (this.eat("*")) value *= this.parseUnary(context);
      else if (this.eat("/")) {
        const rhs = this.parseUnary(context);
        value = rhs === 0 ? 0 : value / rhs;
      } else if (this.eat("%")) {
        const rhs = this.parseUnary(context);
        value = rhs === 0 ? 0 : value % rhs;
      } else break;
    }
    return value;
  }

  private parseUnary(context: MolangContext): number {
    if (this.eat("-")) return -this.parseUnary(context);
    if (this.eat("!")) return this.parseUnary(context) ? 0 : 1;
    return this.parsePrimary(context);
  }

  private parsePrimary(context: MolangContext): number {
    const token = this.peek();
    if (!token) return 0;

    if (token.type === "number") {
      this.pos++;
      return token.value;
    }

    if (token.type === "identifier") {
      this.pos++;
      const name = token.value;
      if (this.eat("(")) {
        const args: number[] = [];
        if (!this.eat(")")) {
          do {
            args.push(this.parseTernary(context));
          } while (this.eat(","));
          this.expect(")");
        }
        return callFunction(name, args);
      }
      return resolveIdentifier(name, context);
    }

    if (this.eat("(")) {
      const value = this.parseTernary(context);
      this.expect(")");
      return value;
    }

    return 0;
  }
}

function resolveIdentifier(name: string, context: MolangContext): number {
  if (name === "true") return 1;
  if (name === "false") return 0;
  if (name === "math.pi") return Math.PI;
  if (name === "math.e") return Math.E;

  const lower = name.toLowerCase();
  if (lower.startsWith("query.") || lower.startsWith("q.")) {
    return context.queries[name.split(".").slice(1).join(".")] ?? 0;
  }
  if (lower.startsWith("variable.") || lower.startsWith("v.")) {
    return context.vars?.[name.split(".").slice(1).join(".")] ?? 0;
  }
  if (lower.startsWith("temp.") || lower.startsWith("t.")) {
    return context.temps?.[name.split(".").slice(1).join(".")] ?? 0;
  }
  return context.vars?.[name] ?? 0;
}

function callFunction(name: string, args: number[]): number {
  const fn = name.toLowerCase().replace(/^math\./, "");
  switch (fn) {
    case "sin":
      return Math.sin(args[0] ?? 0);
    case "cos":
      return Math.cos(args[0] ?? 0);
    case "tan":
      return Math.tan(args[0] ?? 0);
    case "asin":
      return Math.asin(args[0] ?? 0);
    case "acos":
      return Math.acos(args[0] ?? 0);
    case "atan":
      return Math.atan(args[0] ?? 0);
    case "atan2":
      return Math.atan2(args[0] ?? 0, args[1] ?? 0);
    case "abs":
      return Math.abs(args[0] ?? 0);
    case "ceil":
      return Math.ceil(args[0] ?? 0);
    case "floor":
      return Math.floor(args[0] ?? 0);
    case "round":
      return Math.round(args[0] ?? 0);
    case "trunc":
      return Math.trunc(args[0] ?? 0);
    case "sqrt":
      return Math.sqrt(Math.max(0, args[0] ?? 0));
    case "pow":
      return Math.pow(args[0] ?? 0, args[1] ?? 0);
    case "exp":
      return Math.exp(args[0] ?? 0);
    case "log":
      return Math.log(Math.max(1e-9, args[0] ?? 1));
    case "log10":
      return Math.log10(Math.max(1e-9, args[0] ?? 1));
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "mod":
      return (args[0] ?? 0) % (args[1] ?? 1);
    case "lerp":
      return (args[0] ?? 0) + ((args[1] ?? 0) - (args[0] ?? 0)) * (args[2] ?? 0);
    case "clamp": {
      const [value, min, max] = args;
      return Math.min(Math.max(value ?? 0, min ?? 0), max ?? 1);
    }
    case "random":
      if (args.length >= 2) return (args[0] ?? 0) + Math.random() * ((args[1] ?? 0) - (args[0] ?? 0));
      return Math.random();
    default:
      return 0;
  }
}

const cache = new Map<string, MolangExpression>();

export function compileMolang(expression: string): MolangExpression {
  let compiled = cache.get(expression);
  if (!compiled) {
    compiled = new MolangExpression(expression);
    cache.set(expression, compiled);
  }
  return compiled;
}

export function evaluateMolangValue(value: number | string, context: MolangContext): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && !/[a-zA-Z]/.test(trimmed)) return asNumber;
  return compileMolang(trimmed).evaluate(context);
}
