import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const schemaFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "schemas", "kloudy.card.schema.json");

let cached;

export function schemaPath() {
  return schemaFile;
}

export function loadSchema() {
  if (!cached) cached = JSON.parse(readFileSync(schemaFile, "utf8"));
  return cached;
}

function visit(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(path + " must be " + JSON.stringify(schema.const));
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(path + " must be one of " + schema.enum.join(", "));
  }

  if (schema.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) errors.push(path + " must be an integer");
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(path + " must be an array");
      return;
    }
    if (schema.items) {
      value.forEach((item, index) => visit(item, schema.items, path + "[" + index + "]", errors));
    }
    return;
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(path + " must be an object");
      return;
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined) errors.push(path + " missing required property " + key);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) visit(value[key], child, path + "." + key, errors);
    }
    return;
  }
  if (schema.type === "string" && typeof value !== "string") {
    errors.push(path + " must be a string");
    return;
  }
  if (schema.type && schema.type !== "integer" && typeof value !== schema.type) {
    errors.push(path + " must be a " + schema.type);
  }
}

export function validate(data, schema = loadSchema()) {
  const errors = [];
  visit(data, schema, "$", errors);
  return errors;
}

export function validateCard(card, schema = loadSchema()) {
  return validate(card, schema);
}

export function validatePolicy(policy, schema = loadSchema()) {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) {
    return ["policy must be an object"];
  }
  const errors = [];
  if (policy.allow !== undefined) visit(policy.allow, schema.properties.allow, "$.allow", errors);
  if (policy.deny !== undefined) visit(policy.deny, schema.properties.deny, "$.deny", errors);
  return errors;
}
