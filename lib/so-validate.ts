// /lib/so-validate.ts
// Client/server-safe validator that reflects the Structured Outputs subset
// Only uses rules documented publicly (depth ≤ 5, ≤ 100 props total,
// objects require additionalProperties:false and every property listed in required,
// root cannot be anyOf; types limited; some keywords unsupported).

export type Issue = { title: string; detail?: string };

const SUPPORTED_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  // union supports 'null' only inside a union array in "type"
]);

const UNSUPPORTED: Record<string, string[]> = {
  string: ['minlength', 'minLength', 'maxLength', 'pattern', 'format'],
  number: ['minimum', 'maximum', 'multipleOf'],
  integer: ['minimum', 'maximum', 'multipleOf'],
  object: ['patternProperties', 'unevaluatedProperties', 'propertyNames', 'minProperties', 'maxProperties'],
  array: ['unevaluatedItems', 'contains', 'minContains', 'maxContains', 'minItems', 'maxItems', 'uniqueItems'],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateSchema(schema: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isObject(schema)) {
    return [{ title: 'Schema inválido', detail: 'O schema deve ser um objeto JSON.' }];
  }

  if ('anyOf' in schema) {
    issues.push({ title: 'Root anyOf não suportado', detail: 'O objeto raiz não pode ser do tipo anyOf.' });
  }

  let totalProps = 0;
  const seen = new WeakSet<object>();

  function walk(node: unknown, depth: number, path: string) {
    if (!isObject(node)) return;

    if (seen.has(node)) return;
    seen.add(node);

    if (depth > 5) {
      issues.push({ title: 'Profundidade excedida', detail: `Profundidade máxima é 5 (em ${path}).` });
      return;
    }

    // $ref allowed; assume resolved elsewhere (avoid cycles)
    if ('$ref' in node) return;

    const t = node.type;
    if (typeof t === 'string') {
      if (!SUPPORTED_TYPES.has(t) && t !== 'null') {
        issues.push({ title: 'Tipo não suportado', detail: `Tipo "${t}" em ${path} não é suportado.` });
      }
    } else if (Array.isArray(t)) {
      for (const tt of t) {
        if (typeof tt !== 'string') {
          issues.push({ title: 'Tipo inválido', detail: `Tipo não textual em ${path}.` });
        } else if (!SUPPORTED_TYPES.has(tt) && tt !== 'null') {
          issues.push({ title: 'Tipo não suportado', detail: `Tipo "${tt}" em ${path} não é suportado.` });
        }
      }
    }

    // nested anyOf is allowed
    if (Array.isArray(node.anyOf)) {
      node.anyOf.forEach((branch, i) => walk(branch, depth + 1, `${path}.anyOf[${i}]`));
    }

    if (isObject(node.$defs)) {
      for (const [name, def] of Object.entries(node.$defs)) {
        walk(def, depth + 1, `${path}.$defs.${name}`);
      }
    }

    // type-specific unsupported keywords
    if (node.type === 'string') {
      for (const k of UNSUPPORTED.string) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
    }
    if (node.type === 'number' || node.type === 'integer') {
      for (const k of UNSUPPORTED.number) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
    }

    if (node.type === 'object') {
      for (const k of UNSUPPORTED.object) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });

      if (node.additionalProperties !== false) {
        issues.push({ title: 'additionalProperties obrigatório', detail: `Defina "additionalProperties": false em ${path}.` });
      }

      const props = isObject(node.properties) ? node.properties : {};
      const names = Object.keys(props);
      totalProps += names.length;

      const req = Array.isArray(node.required) ? new Set(node.required as string[]) : new Set<string>();
      for (const p of names) {
        if (!req.has(p)) {
          issues.push({ title: 'Campo obrigatório ausente', detail: `O campo "${p}" em ${path} deve constar em "required".` });
        }
      }
      for (const p of names) {
        walk(props[p], depth + 1, `${path}.${p}`);
      }
    }

    if (node.type === 'array') {
      for (const k of UNSUPPORTED.array) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
      if (!('items' in node)) {
        issues.push({ title: 'Array sem "items"', detail: `Arrays devem definir "items" (${path}).` });
      } else {
        walk((node as Record<string, unknown>).items, depth + 1, `${path}[]`);
      }
    }
  }

  walk(schema, 1, '$');

  if (totalProps > 100) {
    issues.push({ title: 'Número de propriedades excedido', detail: `Até 100 propriedades no total são suportadas (encontradas ${totalProps}).` });
  }
  return issues;
}
