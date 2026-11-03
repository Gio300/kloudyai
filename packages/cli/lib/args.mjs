const BOOLEAN_FLAGS = new Set(["--user", "--push", "--remote", "--fetch"]);
const VALUE_FLAGS = new Set(["--api", "--add", "--remove", "--mode", "--vis"]);

export function parseArgs(argv) {
  const flags = {
    api: undefined,
    user: false,
    push: false,
    remote: false,
    fetch: false,
    add: [],
    remove: [],
    mode: undefined,
    vis: undefined,
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") {
      positionals.push("--help");
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined) throw new Error("Unknown flag: " + arg);
      if (name === "--user") flags.user = true;
      else if (name === "--push") flags.push = true;
      else if (name === "--remote") flags.remote = true;
      else flags.fetch = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new Error("Unknown flag: " + arg);
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined) throw new Error("Missing value for " + name);
    if (name === "--api") flags.api = value;
    else if (name === "--mode") flags.mode = value;
    else if (name === "--vis") flags.vis = value;
    else if (name === "--add") flags.add.push(value);
    else flags.remove.push(value);
  }

  return { cmd: positionals[0] || "help", positionals, flags };
}

export function splitList(values) {
  const out = [];
  for (const value of values) {
    if (value == null || String(value).trim() === "") throw new Error("Expected a capability name.");
    for (const part of String(value).split(",")) {
      const item = part.trim();
      if (!item) throw new Error("Expected a capability name.");
      out.push(item);
    }
  }
  return out;
}
