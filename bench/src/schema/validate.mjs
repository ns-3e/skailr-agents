// DOC: Dependency-free JSON-Schema (draft 2020-12 subset) validator for the
// frozen bench contracts. Supports: type, required, properties,
// additionalProperties (bool|schema), enum, const, items, minimum/maximum,
// pattern, format:"date-time", oneOf/anyOf, $ref ("#/$defs/x" only).
// This is a focused subset sufficient for run/config/task/grader/
// fixture-layout/mock-streamjson — not a general-purpose validator.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Registry of named schemas. Sub-entries with a `pointer` validate against a
// nested schema fragment of the same file (used by mock-streamjson, whose
// sidecar wraps two independent shapes — event / telemetry — as sibling
// properties rather than one instance type).
const SCHEMA_REGISTRY = {
  run: { file: "run.schema.json" },
  config: { file: "config.schema.json" },
  task: { file: "task.schema.json" },
  grader: { file: "grader.schema.json" },
  "fixture-layout": { file: "fixture-layout.schema.json" },
  "mock-event": { file: "mock-streamjson.schema.json", pointer: ["properties", "event"] },
  "mock-telemetry": { file: "mock-streamjson.schema.json", pointer: ["properties", "telemetry"] },
};

const fileCache = new Map();

function loadSchemaFile(file) {
  if (!fileCache.has(file)) {
    const text = readFileSync(path.join(__dirname, file), "utf8");
    fileCache.set(file, JSON.parse(text));
  }
  return fileCache.get(file);
}

function resolveNamed(schemaName) {
  const entry = SCHEMA_REGISTRY[schemaName];
  if (!entry) {
    throw new Error(`validate.mjs: unknown schema name "${schemaName}"`);
  }
  const root = loadSchemaFile(entry.file);
  let schema = root;
  if (entry.pointer) {
    for (const key of entry.pointer) schema = schema[key];
  }
  return { schema, root };
}

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value; // "string" | "boolean" | "object"
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) {
    throw new Error(`validate.mjs: only local $ref supported, got "${ref}"`);
  }
  const parts = ref.slice(2).split("/");
  let node = root;
  for (const part of parts) node = node[part];
  if (!node) throw new Error(`validate.mjs: unresolved $ref "${ref}"`);
  return node;
}

// Returns array of error strings (empty = valid).
function validateNode(instance, schema, root, instancePath, errors) {
  if (schema.$ref) {
    validateNode(instance, resolveRef(schema.$ref, root), root, instancePath, errors);
    return;
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((sub) => {
      const subErrors = [];
      validateNode(instance, sub, root, instancePath, subErrors);
      return subErrors.length === 0;
    });
    if (matches.length !== 1) {
      errors.push(`${instancePath || "/"}: expected exactly 1 oneOf branch to match, got ${matches.length}`);
    }
    return;
  }
  if (schema.anyOf) {
    const anyMatch = schema.anyOf.some((sub) => {
      const subErrors = [];
      validateNode(instance, sub, root, instancePath, subErrors);
      return subErrors.length === 0;
    });
    if (!anyMatch) errors.push(`${instancePath || "/"}: no anyOf branch matched`);
    return;
  }

  if (schema.const !== undefined) {
    if (instance !== schema.const) {
      errors.push(`${instancePath || "/"}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`);
    }
    return;
  }

  if (schema.enum) {
    if (!schema.enum.includes(instance)) {
      errors.push(`${instancePath || "/"}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(instance)}`);
    }
    return;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(instance, t))) {
      errors.push(`${instancePath || "/"}: expected type ${types.join("|")}, got ${typeOf(instance)}`);
      return; // downstream checks meaningless if base type wrong
    }
  }

  if (instance === null) return; // null already satisfied type check above

  if (schema.format === "date-time" && typeof instance === "string") {
    if (!DATE_TIME_RE.test(instance)) {
      errors.push(`${instancePath || "/"}: does not match date-time format`);
    }
  }

  if (schema.pattern && typeof instance === "string") {
    if (!new RegExp(schema.pattern).test(instance)) {
      errors.push(`${instancePath || "/"}: does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof instance === "number") {
    if (schema.minimum !== undefined && instance < schema.minimum) {
      errors.push(`${instancePath || "/"}: ${instance} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && instance > schema.maximum) {
      errors.push(`${instancePath || "/"}: ${instance} > maximum ${schema.maximum}`);
    }
  }

  if (typeOf(instance) === "object") {
    const props = schema.properties || {};
    for (const req of schema.required || []) {
      if (!(req in instance)) {
        errors.push(`${instancePath || "/"}: missing required property "${req}"`);
      }
    }
    for (const [key, value] of Object.entries(instance)) {
      const childPath = `${instancePath}/${key}`;
      if (key in props) {
        validateNode(value, props[key], root, childPath, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${instancePath || "/"}: unexpected property "${key}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateNode(value, schema.additionalProperties, root, childPath, errors);
      }
      // additionalProperties undefined or true => no-op (allowed, unchecked)
    }
  }

  if (typeOf(instance) === "array" && schema.items) {
    instance.forEach((item, i) => {
      validateNode(item, schema.items, root, `${instancePath}/${i}`, errors);
    });
  }
}

/**
 * Validate `obj` against the named contract schema.
 * @param {*} obj
 * @param {string} schemaName one of the SCHEMA_REGISTRY keys
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validate(obj, schemaName) {
  const { schema, root } = resolveNamed(schemaName);
  const errors = [];
  validateNode(obj, schema, root, "", errors);
  return { valid: errors.length === 0, errors };
}

/**
 * Throw-on-write helper: validates `obj` against `schemaName` and throws a
 * single Error (all violations joined) if invalid. Intended to be called
 * immediately before any consumer persists a contract-shaped file.
 */
export function validateOrThrow(obj, schemaName) {
  const { valid, errors } = validate(obj, schemaName);
  if (!valid) {
    throw new Error(
      `validate.mjs: "${schemaName}" failed schema validation:\n  - ${errors.join("\n  - ")}`
    );
  }
  return obj;
}

export const SCHEMA_NAMES = Object.keys(SCHEMA_REGISTRY);
