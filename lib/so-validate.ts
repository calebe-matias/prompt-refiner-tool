// ONLY the Structured Outputs rules publicly documented by OpenAI are enforced here.
// Subset: depth ≤ 5, ≤ 100 total object properties, object nodes require
// additionalProperties:false, every defined property listed in "required",
// no root anyOf, allow nested anyOf, support $defs and $ref without expanding.
// Disallow various keywords often unsupported by SO.

export type Issue = { title: string; detail?: string };

const SUPPORTED_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array']);
const UNSUPPORTED: Record<string, string[]> = {
  string: ['minlength', 'minLength', 'maxLength', 'pattern', 'format'],
  number: ['minimum', 'maximum', 'multipleOf'],
  integer: ['minimum', 'maximum', 'multipleOf'],
  object: ['patternProperties', 'unevaluatedProperties', 'propertyNames', 'minProperties', 'maxProperties'],
  array: ['unevaluatedItems', 'contains', 'minContains', 'maxContains', 'minItems', 'maxItems', 'uniqueItems'],
};

export function validateSchema(schema: any): Issue[] {
  const issues: Issue[] = [];
  if (!schema || typeof schema !== 'object') {
    return [{ title: 'Schema inválido', detail: 'O schema deve ser um objeto JSON.' }];
  }

  if (schema.anyOf) {
    issues.push({ title: 'Root anyOf não suportado', detail: 'O objeto raiz não pode ser do tipo anyOf.' });
  }

  let totalProps = 0;
  const seen = new WeakSet();

  function walk(node: any, depth: number, path: string) {
    if (node && typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
    }
    if (depth > 5) {
      issues.push({ title: 'Profundidade excedida', detail: `Profundidade máxima é 5 (em ${path}).` });
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (node.$ref) return;

    const t = node.type;

    if (typeof t === 'string') {
      if (!SUPPORTED_TYPES.has(t)) {
        if (t !== 'null') {
          issues.push({ title: 'Tipo não suportado', detail: `Tipo "${t}" em ${path} não é suportado.` });
        }
      }
    } else if (Array.isArray(t)) {
      for (const tt of t) {
        if (typeof tt !== 'string') {
          issues.push({ title: 'Tipo inválido', detail: `Tipo não textual em ${path}.` });
        } else if (!(SUPPORTED_TYPES.has(tt) || tt === 'null')) {
          issues.push({ title: 'Tipo não suportado', detail: `Tipo "${tt}" em ${path} não é suportado.` });
        }
      }
    }

    if (Array.isArray(node.anyOf)) {
      node.anyOf.forEach((branch: any, i: number) => walk(branch, depth + 1, `${path}.anyOf[${i}]`));
    }

    if (node.$defs && typeof node.$defs === 'object') {
      for (const [name, def] of Object.entries(node.$defs)) {
        walk(def, depth + 1, `${path}.$defs.${name}`);
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

      const props = node.properties || {};
      if (props && typeof props === 'object') {
        const names = Object.keys(props);
        totalProps += names.length;

        const req = Array.isArray(node.required) ? new Set(node.required) : new Set<string>();
        for (const p of names) {
          if (!req.has(p)) {
            issues.push({ title: 'Campo obrigatório ausente', detail: `O campo "${p}" em ${path} deve constar em "required".` });
          }
        }
        for (const p of names) {
          walk(props[p], depth + 1, `${path}.${p}`);
        }
      }
    }

    if (t === 'array') {
      for (const k of UNSUPPORTED.array) if (k in node) issues.push({ title: 'Keyword não suportada', detail: `${k} não é suportado em ${path}.` });
      if (!('items' in node)) {
        issues.push({ title: 'Array sem "items"', detail: `Arrays devem definir "items" (${path}).` });
      } else {
        walk(node.items, depth + 1, `${path}[]`);
      }
    }
  }

  walk(schema, 1, '$');

  if (totalProps > 100) {
    issues.push({ title: 'Número de propriedades excedido', detail: `Até 100 propriedades no total são suportadas (encontradas ${totalProps}).` });
  }
  return issues;
}
