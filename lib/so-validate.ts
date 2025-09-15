// ONLY the Structured Outputs rules publicly documented by OpenAI are enforced here.
// Subset: depth ≤ 5, ≤ 100 total object properties, object nodes require
// additionalProperties:false, every defined property listed in "required",
// no root anyOf, allow nested anyOf, support $defs and $ref without expanding.

export type Issue = { title: string; detail?: string };

type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
  anyOf?: JSONSchema[];
  $defs?: Record<string, JSONSchema>;
  $ref?: string;
  [key: string]: unknown;
}

const SUPPORTED_TYPES = new Set<Exclude<JSONSchemaType, 'null'>>([
  'string', 'number', 'integer', 'boolean', 'object', 'array',
]);

const UNSUPPORTED: Record<string, string[]> = {
  string: ['minlength', 'minLength', 'maxLength', 'pattern', 'format'],
  number: ['minimum', 'maximum', 'multipleOf'],
  integer: ['minimum', 'maximum', 'multipleOf'],
  object: ['patternProperties', 'unevaluatedProperties', 'propertyNames', 'minProperties', 'maxProperties'],
  array: ['unevaluatedItems', 'contains', 'minContains', 'maxContains', 'minItems', 'maxItems', 'uniqueItems'],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function validateSchema(schema: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isObject(schema)) {
    return [{ title: 'Schema inválido', detail: 'O schema deve ser um objeto JSON.' }];
  }

  const root = schema as JSONSchema;

  if (root.anyOf) {
    issues.push({ title: 'Root anyOf não suportado', detail: 'O objeto raiz não pode ser do tipo anyOf.' });
  }

  let totalProps = 0;
  const seen = new WeakSet<object>();

  function walk(nodeRaw: JSONSchema, depth: number, path: string) {
    const node = nodeRaw as JSONSchema;

    if (isObject(node)) {
      if (seen.has(node as object)) return;
      seen.add(node as object);
    }
    if (depth > 5) {
      issues.push({ title: 'Profundidade excedida', detail: `Profundidade máxima é 5 (em ${path}).` });
      return;
    }
    if (!isObject(node)) return;

    if (node.$ref) return;

    const t = node.type;

    if (typeof t === 'string') {
      if (!SUPPORTED_TYPES.has(t as Exclude<JSONSchemaType, 'null'>)) {
        if (t !== 'null') {
          issues.push({ title: 'Tipo não suportado', detail: `Tipo "${t}" em ${path} não é suportado.` });
        }
      }
    } else if (Array.isArray(t)) {
      for (const tt of t) {
        if (typeof tt !== 'string') {
          issues.push({ title: 'Tipo inválido', detail: `Tipo não textual em ${path}.` });
        } else if (!(SUPPORTED_TYPES.has(tt as Exclude<JSONSchemaType, 'null'>) || tt === 'null')) {
          issues.push({ title: 'Tipo não suportado', detail: `Tipo "${tt}" em ${path} não é suportado.` });
        }
      }
    }

    if (Array.isArray(node.anyOf)) {
      node.anyOf.forEach((branch, i) => walk(branch, depth + 1, `${path}.anyOf[${i}]`));
    }

    if (node.$defs && isObject(node.$defs)) {
      for (const [name, def] of Object.entries(node.$defs)) {
        walk(def as JSONSchema, depth + 1, `${path}.$defs.${name}`);
      }
    }

    if (t === 'string') {
      for (const k of UNSUPPORTED.string) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
    }
    if (t === 'number' || t === 'integer') {
      for (const k of UNSUPPORTED.number) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
    }

    if (t === 'object') {
      for (const k of UNSUPPORTED.object) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });

      if (node.additionalProperties !== false) {
        issues.push({ title: 'additionalProperties obrigatório', detail: `Defina "additionalProperties": false em ${path}.` });
      }

      const props = node.properties;
      if (props && isObject(props)) {
        const names = Object.keys(props);
        totalProps += names.length;

        const req = Array.isArray(node.required) ? new Set(node.required) : new Set<string>();
        for (const p of names) {
          if (!req.has(p)) {
            issues.push({ title: 'Campo obrigatório ausente', detail: `O campo "${p}" em ${path} deve constar em "required".` });
          }
        }
        for (const p of names) {
          const child = (props as Record<string, JSONSchema>)[p];
          walk(child, depth + 1, `${path}.${p}`);
        }
      }
    }

    if (t === 'array') {
      for (const k of UNSUPPORTED.array) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
      if (!('items' in node)) {
        issues.push({ title: 'Array sem "items"', detail: `Arrays devem definir "items" (${path}).` });
      } else if (node.items) {
        walk(node.items, depth + 1, `${path}[]`);
      }
    }
  }

  walk(root, 1, '$');

  if (totalProps > 100) {
    issues.push({ title: 'Número de propriedades excedido', detail: `Até 100 propriedades no total são suportadas (encontradas ${totalProps}).` });
  }
  return issues;
}
