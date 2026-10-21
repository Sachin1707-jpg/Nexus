// Test schema dereferencing & normalization logic

const DISALLOWED_GEMINI_SCHEMA_KEYS = new Set([
  '$schema',
  '$defs',
  'definitions',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'additionalProperties',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'default',
]);

function decodePointerSegment(segment) {
  return decodeURIComponent(segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function resolveJsonPointer(root, pointer) {
  if (typeof pointer !== 'string') return null;
  if (!pointer.startsWith('#')) return null;

  const path = pointer.slice(1);
  if (path === '' || path === '/') return root;

  const segments = path.split('/').slice(1).map(decodePointerSegment);
  let current = root;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return null;
    if (!(seg in current)) return null;
    current = current[seg];
  }
  return current;
}

export function normalizeSchema(schema, root = schema, visitedRefs = new Set()) {
  if (!schema || typeof schema !== 'object') return schema;

  // 1. If this node has a $ref, resolve it
  if (schema.$ref) {
    const ref = schema.$ref;
    if (visitedRefs.has(ref)) {
      throw new Error(`Circular reference detected in schema: "${ref}"`);
    }
    const resolved = resolveJsonPointer(root, ref);
    if (!resolved) {
      throw new Error(`Cannot resolve $ref: "${ref}"`);
    }
    const nextVisited = new Set(visitedRefs);
    nextVisited.add(ref);

    // Merge resolved schema with any local overrides (excluding $ref)
    const { $ref, ...localOverrides } = schema;
    const merged = { ...resolved, ...localOverrides };
    return normalizeSchema(merged, root, nextVisited);
  }

  // Handle anyOf with null (e.g. z.string().nullable() -> anyOf: [{type:'string'}, {type:'null'}])
  let isNullable = schema.nullable === true;
  let effectiveSchema = schema;
  if (Array.isArray(schema.anyOf)) {
    const hasNull = schema.anyOf.some((s) => s?.type === 'null');
    const nonNull = schema.anyOf.filter((s) => s?.type !== 'null');
    if (hasNull) isNullable = true;
    if (nonNull.length === 1) {
      effectiveSchema = { ...nonNull[0], ...(schema.description ? { description: schema.description } : {}) };
    }
  }

  const out = {};
  if (isNullable) out.nullable = true;

  for (const [k, v] of Object.entries(effectiveSchema)) {
    if (DISALLOWED_GEMINI_SCHEMA_KEYS.has(k) || k === '$ref') continue;

    if (k === 'type') {
      if (typeof v === 'string') {
        out.type = v.toUpperCase();
      } else if (Array.isArray(v)) {
        // e.g. type: ['string', 'null']
        const nonNull = v.filter((t) => t !== 'null');
        if (v.includes('null')) out.nullable = true;
        out.type = (nonNull[0] || 'STRING').toUpperCase();
      }
    } else if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
      out.properties = {};
      for (const [propKey, propVal] of Object.entries(v)) {
        out.properties[propKey] = normalizeSchema(propVal, root, visitedRefs);
      }
    } else if (k === 'items') {
      if (Array.isArray(v)) {
        out.items = v.length > 0 ? normalizeSchema(v[0], root, visitedRefs) : { type: 'STRING' };
      } else if (v && typeof v === 'object') {
        out.items = normalizeSchema(v, root, visitedRefs);
      } else {
        out.items = { type: 'STRING' };
      }
    } else if (k === 'required' && Array.isArray(v)) {
      if (v.length > 0) out.required = v;
    } else if (k === 'enum' && Array.isArray(v)) {
      out.enum = v.map(String);
    } else if (k === 'description' && typeof v === 'string') {
      out.description = v;
    }
  }

  // Ensure arrays have an items schema
  if (out.type === 'ARRAY' && !out.items) {
    out.items = { type: 'STRING' };
  }

  // Ensure root or object schemas default to OBJECT if properties exist
  if (!out.type && out.properties) {
    out.type = 'OBJECT';
  }

  return out;
}
