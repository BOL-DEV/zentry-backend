// @ts-nocheck
import crypto from "crypto";
import { query, PostgresSession } from "./pg";

const registry = new Map<string, any>();

const randomId = () => crypto.randomBytes(12).toString("hex");
const normalizeId = (value: any) => {
  if (value == null) return value;
  if (typeof value === "object" && "_id" in value) return normalizeId(value._id);
  return String(value);
};

const camelize = (value: string) => value.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const toSnake = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();

const isObject = (value: any) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date));

const rowToEntity = (row: any) => {
  const entity: any = {};
  for (const [key, value] of Object.entries(row || {})) {
    entity[camelize(key)] = value;
  }
  if (entity.id && !entity._id) {
    entity._id = entity.id;
    delete entity.id;
  }
  return entity;
};

const getValue = (obj: any, path: string) => {
  let current = obj;
  for (const part of path.split(".")) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};

const setValue = (obj: any, path: string, value: any) => {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!isObject(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
};

const compareValues = (left: any, right: any) => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() - new Date(right).getTime();
  }
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
};

const matchesFilterValue = (candidate: any, filterValue: any) => {
  if (Array.isArray(filterValue)) {
    return filterValue.map(normalizeId).includes(normalizeId(candidate));
  }
  if (!isObject(filterValue)) {
    return normalizeId(candidate) === normalizeId(filterValue);
  }
  if (filterValue.$in) return filterValue.$in.map(normalizeId).includes(normalizeId(candidate));
  if (filterValue.$ne !== undefined) return normalizeId(candidate) !== normalizeId(filterValue.$ne);
  if (filterValue.$gte !== undefined) return compareValues(candidate, filterValue.$gte) >= 0;
  if (filterValue.$lte !== undefined) return compareValues(candidate, filterValue.$lte) <= 0;
  if (filterValue.$gt !== undefined) return compareValues(candidate, filterValue.$gt) > 0;
  if (filterValue.$lt !== undefined) return compareValues(candidate, filterValue.$lt) < 0;
  if (filterValue.$regex !== undefined) {
    const flags = String(filterValue.$options || "").includes("i") ? "i" : "";
    return new RegExp(filterValue.$regex, flags).test(String(candidate ?? ""));
  }
  return normalizeId(candidate) === normalizeId(filterValue);
};

const matchesFilter = (row: any, filter: any): boolean => {
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === "$or" && Array.isArray(value)) {
      if (!value.some((entry) => matchesFilter(row, entry))) return false;
      continue;
    }
    if (key === "$and" && Array.isArray(value)) {
      if (!value.every((entry) => matchesFilter(row, entry))) return false;
      continue;
    }
    if (!matchesFilterValue(getValue(row, key), value)) return false;
  }
  return true;
};

const resolveExpression = (expr: any, row: any) => {
  if (Array.isArray(expr)) return expr.map((item) => resolveExpression(item, row));
  if (expr instanceof Date) return expr;
  if (!isObject(expr)) {
    if (typeof expr === "string" && expr.startsWith("$")) return getValue(row, expr.slice(1));
    return expr;
  }
  if (expr.$cond && Array.isArray(expr.$cond)) {
    const [condition, whenTrue, whenFalse] = expr.$cond;
    return resolveCondition(condition, row) ? resolveExpression(whenTrue, row) : resolveExpression(whenFalse, row);
  }
  if (expr.$in && Array.isArray(expr.$in)) {
    const [candidateExpr, arrayExpr] = expr.$in;
    const candidate = resolveExpression(candidateExpr, row);
    const arrayValue = resolveExpression(arrayExpr, row);
    return Array.isArray(arrayValue) ? arrayValue.map(normalizeId).includes(normalizeId(candidate)) : false;
  }
  if (expr.$eq && Array.isArray(expr.$eq)) {
    const [leftExpr, rightExpr] = expr.$eq;
    return normalizeId(resolveExpression(leftExpr, row)) === normalizeId(resolveExpression(rightExpr, row));
  }
  const resolved: any = {};
  for (const [key, value] of Object.entries(expr)) {
    resolved[key] = resolveExpression(value, row);
  }
  return resolved;
};

const resolveCondition = (condition: any, row: any) => {
  if (isObject(condition)) {
    if (condition.$in) {
      const [candidateExpr, arrayExpr] = condition.$in;
      const candidate = resolveExpression(candidateExpr, row);
      const arrayValue = resolveExpression(arrayExpr, row);
      return Array.isArray(arrayValue) ? arrayValue.map(normalizeId).includes(normalizeId(candidate)) : false;
    }
    if (condition.$eq) {
      const [leftExpr, rightExpr] = condition.$eq;
      return normalizeId(resolveExpression(leftExpr, row)) === normalizeId(resolveExpression(rightExpr, row));
    }
  }
  return Boolean(resolveExpression(condition, row));
};

class PgDocument {
  constructor(model: any, data: any) {
    this.__model = model;
    Object.assign(this, data);
  }

  async save(session?: PostgresSession) {
    const saved = await this.__model.saveDocument(this, session);
    Object.assign(this, saved);
    return this;
  }

  set(values: any) {
    Object.assign(this, values);
  }

  toJSON() {
    const out: any = {};
    for (const [key, value] of Object.entries(this)) {
      if (!key.startsWith("__")) out[key] = value;
    }
    return out;
  }
}

class PgQuery {
  constructor(model: any, filter: any = {}, one = false) {
    this.model = model;
    this.filter = filter;
    this.one = one;
    this.populateSpecs = [];
  }

  select(fields: string) {
    this.selectedFields = fields
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/^\+/, ""));
    this.includeHidden = fields.includes("+");
    return this;
  }

  sort(spec: any) {
    this.sortSpec = { ...(this.sortSpec || {}), ...spec };
    return this;
  }

  skip(value: number) {
    this.skipCount = Math.max(0, value);
    return this;
  }

  limit(value: number) {
    this.limitCount = Math.max(0, value);
    return this;
  }

  populate(spec: any) {
    this.populateSpecs.push(spec);
    return this;
  }

  session(session: PostgresSession) {
    this.transactionSession = session;
    return this;
  }

  async lean() {
    return this.exec(true);
  }

  async exec(lean = false) {
    const rows = await this.model.findRows({
      filter: this.filter,
      selectedFields: this.selectedFields,
      includeHidden: this.includeHidden,
      sortSpec: this.sortSpec,
      skipCount: this.skipCount,
      limitCount: this.limitCount,
      session: this.transactionSession,
    });

    const populated = await this.model.populateRows(rows, this.populateSpecs, this.transactionSession);
    const payload = this.one ? populated[0] ?? null : populated;
    if (lean) return payload;
    if (this.one) return payload == null ? null : new PgDocument(this.model, payload);
    return payload.map((row: any) => new PgDocument(this.model, row));
  }

  then(onfulfilled?: any, onrejected?: any) {
    return this.exec(false).then(onfulfilled, onrejected);
  }
}

class PgModel {
  constructor(meta: any) {
    this.meta = meta;
    registry.set(meta.modelName, this);
    registry.set(meta.tableName, this);
  }

  makeDocument(data: any) {
    return new PgDocument(this, data);
  }

  _buildSelectList(selectedFields: string[] | null, includeHidden = false) {
    const fields = selectedFields && selectedFields.length ? selectedFields : Object.keys(this.meta.fields);
    const set = new Set(fields);
    const selectParts: string[] = [];

    for (const [field, column] of Object.entries(this.meta.fields)) {
      if (field === "_id") continue;
      const hidden = this.meta.hiddenFields?.includes(field);
      if (hidden && !includeHidden && !set.has(field)) continue;
      if (selectedFields && !set.has(field)) continue;
      if (!selectedFields && hidden && !includeHidden) continue;
      selectParts.push(`${column} AS "${field}"`);
    }

    if (!selectedFields || set.has("_id")) {
      selectParts.unshift(`id AS "_id"`);
    }

    return selectParts.join(", ");
  }

  _buildWhere(filter: any) {
    const params: any[] = [];
    let index = 1;
    const push = (value: any) => {
      params.push(value instanceof Date ? value.toISOString() : normalizeId(value));
      return `$${index++}`;
    };
    const compile = (current: any): string => {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(current || {})) {
        if (key === "$or" && Array.isArray(value)) {
          const inner = value.map((entry) => `(${compile(entry)})`).filter(Boolean);
          if (inner.length) parts.push(`(${inner.join(" OR ")})`);
          continue;
        }
        if (key === "$and" && Array.isArray(value)) {
          const inner = value.map((entry) => `(${compile(entry)})`).filter(Boolean);
          if (inner.length) parts.push(`(${inner.join(" AND ")})`);
          continue;
        }
        const column = this.meta.fields[key] || toSnake(key);
        if (isObject(value)) {
          if (value.$in) {
            const placeholders = value.$in.map((item: any) => push(item));
            parts.push(`${column} = ANY(ARRAY[${placeholders.join(", ")}]::text[])`);
            continue;
          }
          if (value.$ne !== undefined) {
            parts.push(`${column} <> ${push(value.$ne)}`);
            continue;
          }
          if (value.$gte !== undefined) {
            parts.push(`${column} >= ${push(value.$gte)}`);
            continue;
          }
          if (value.$lte !== undefined) {
            parts.push(`${column} <= ${push(value.$lte)}`);
            continue;
          }
          if (value.$gt !== undefined) {
            parts.push(`${column} > ${push(value.$gt)}`);
            continue;
          }
          if (value.$lt !== undefined) {
            parts.push(`${column} < ${push(value.$lt)}`);
            continue;
          }
          if (value.$regex !== undefined) {
            const op = String(value.$options || "").includes("i") ? "~*" : "~";
            parts.push(`${column} ${op} ${push(value.$regex)}`);
            continue;
          }
        }
        parts.push(value === null ? `${column} IS NULL` : `${column} = ${push(value)}`);
      }
      return parts.join(" AND ");
    };
    const clause = compile(filter);
    return { clause: clause ? `WHERE ${clause}` : "", params };
  }

  _orderClause(sortSpec: any) {
    const entries = Object.entries(sortSpec || {});
    if (!entries.length) return "";
    const parts = entries.map(([field, direction]: any) => {
      const column = this.meta.fields[field] || toSnake(field);
      return `${column} ${direction === -1 ? "DESC" : "ASC"}`;
    });
    return `ORDER BY ${parts.join(", ")}`;
  }

  _client(session?: PostgresSession) {
    return session?.getClient();
  }

  async findRows({ filter, selectedFields, includeHidden, sortSpec, skipCount, limitCount, session }: any) {
    const select = this._buildSelectList(selectedFields, includeHidden);
    const { clause, params } = this._buildWhere(filter);
    const orderClause = this._orderClause(sortSpec);
    const limitClause = typeof limitCount === "number" ? `LIMIT ${limitCount}` : "";
    const offsetClause = skipCount ? `OFFSET ${skipCount}` : "";
    const sql = `SELECT ${select} FROM ${this.meta.tableName} ${clause} ${orderClause} ${limitClause} ${offsetClause}`.trim();
    const result = await query(sql, params, this._client(session));
    return result.rows.map(rowToEntity);
  }

  find(filter: any = {}) {
    return new PgQuery(this, filter, false);
  }

  findOne(filter: any = {}) {
    return new PgQuery(this, filter, true);
  }

  findById(id: any) {
    return this.findOne({ _id: normalizeId(id) });
  }

  async countDocuments(filter: any = {}) {
    const { clause, params } = this._buildWhere(filter);
    const result = await query(`SELECT COUNT(*)::int AS count FROM ${this.meta.tableName} ${clause}`, params);
    return result.rows[0]?.count ?? 0;
  }

  async exists(filter: any = {}) {
    return (await this.countDocuments(filter)) > 0;
  }

  _toInsertRow(data: any) {
    const row: any = {};
    for (const [field, column] of Object.entries(this.meta.fields)) {
      if (field in data) row[column] = data[field];
    }
    row.id = normalizeId(data._id || data.id || randomId());
    row.created_at = data.createdAt || new Date().toISOString();
    row.updated_at = data.updatedAt || new Date().toISOString();
    return row;
  }

  async create(data: any, session?: PostgresSession) {
    const row = this._toInsertRow(data);
    const columns = Object.keys(row);
    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const sql = `INSERT INTO ${this.meta.tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
    const result = await query(sql, values, this._client(session));
    return this.makeDocument(rowToEntity(result.rows[0]));
  }

  async insertMany(items: any[], options: any = {}) {
    const out: any[] = [];
    for (const item of items) {
      out.push(await this.create(item, options.session));
    }
    return out;
  }

  async saveDocument(document: any, session?: PostgresSession) {
    const id = normalizeId(document._id || document.id);
    if (!id) {
      return this.create(document, session);
    }

    const existing = await this.findById(id).lean();
    if (!existing) {
      document._id = id;
      return this.create(document, session);
    }

    const row: any = {};
    for (const [field, column] of Object.entries(this.meta.fields)) {
      if (field === "_id") continue;
      if (document[field] !== undefined) row[column] = document[field];
    }
    row.updated_at = new Date().toISOString();

    const columns = Object.keys(row);
    const values = columns.map((column) => row[column]);
    const assignments = columns.map((column, idx) => `${column} = $${idx + 1}`);
    values.push(id);
    const sql = `UPDATE ${this.meta.tableName} SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values, this._client(session));
    return rowToEntity(result.rows[0]);
  }

  _splitUpdate(update: any) {
    if (Object.keys(update || {}).some((key) => key.startsWith("$"))) {
      return {
        set: update.$set || {},
        inc: update.$inc || {},
        unset: update.$unset ? Object.keys(update.$unset) : [],
      };
    }
    return { set: update || {}, inc: {}, unset: [] };
  }

  async updateOne(filter: any, update: any, options: any = {}) {
    const rows = await this.find(filter).session(options.session).lean();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { matchedCount: 0, modifiedCount: 0, rows: [] };
    const result = await this.updateMany({ _id: row._id }, update, options);
    return result;
  }

  async updateMany(filter: any, update: any, options: any = {}) {
    const matched = await this.find(filter).session(options.session).lean();
    const rows = Array.isArray(matched) ? matched : matched ? [matched] : [];
    if (!rows.length) return { matchedCount: 0, modifiedCount: 0, rows: [] };

    const { set, inc, unset } = this._splitUpdate(update);
    const ids = rows.map((row) => normalizeId(row._id));
    const values: any[] = [];
    let i = 1;
    const push = (value: any) => {
      values.push(value instanceof Date ? value.toISOString() : value);
      return `$${i++}`;
    };
    const assignments: string[] = [];
    for (const [field, value] of Object.entries(set)) {
      const column = this.meta.fields[field] || toSnake(field);
      assignments.push(`${column} = ${push(value)}`);
    }
    for (const [field, amount] of Object.entries(inc)) {
      const column = this.meta.fields[field] || toSnake(field);
      assignments.push(`${column} = COALESCE(${column}, 0) + ${push(amount)}`);
    }
    for (const field of unset) {
      const column = this.meta.fields[field] || toSnake(field);
      assignments.push(`${column} = NULL`);
    }
    assignments.push(`updated_at = ${push(new Date().toISOString())}`);
    const placeholders = ids.map((id) => push(id));
    const whereClause = ids.length === 1 ? `id = ${placeholders[0]}` : `id = ANY(ARRAY[${placeholders.join(", ")}]::text[])`;
    const sql = `UPDATE ${this.meta.tableName} SET ${assignments.join(", ")} WHERE ${whereClause} RETURNING *`;
    const result = await query(sql, values, this._client(options.session));
    return {
      matchedCount: result.rowCount,
      modifiedCount: result.rowCount,
      rows: result.rows.map(rowToEntity),
    };
  }

  async findOneAndUpdate(filter: any, update: any, options: any = {}) {
    const existing = await this.findOne(filter).session(options.session).lean();
    if (!existing) {
      if (!options.upsert) return null;
      return this.create({ ...filter, ...(update.$set || update) }, options.session);
    }
    await this.updateOne({ _id: existing._id }, update.$set || update, options);
    return options.new === false ? existing : this.findById(existing._id).session(options.session);
  }

  async deleteOne(filter: any) {
    const { clause, params } = this._buildWhere(filter);
    const result = await query(`DELETE FROM ${this.meta.tableName} ${clause} RETURNING *`, params);
    return { deletedCount: result.rowCount };
  }

  async aggregate(pipeline: any[]) {
    let rows = await this.find({}).lean();

    const lookupRows = async (lookup: any) => {
      const target = registry.get(lookup.from) || registry.get(camelize(lookup.from));
      return target ? target.find({}).lean() : [];
    };

    for (const stage of pipeline || []) {
      if (stage.$match) {
        rows = rows.filter((row: any) => matchesFilter(row, stage.$match));
      } else if (stage.$sort) {
        const entries = Object.entries(stage.$sort);
        rows = [...rows].sort((a, b) => {
          for (const [field, dir] of entries) {
            const cmp = compareValues(getValue(a, field), getValue(b, field));
            if (cmp !== 0) return dir === -1 ? -cmp : cmp;
          }
          return 0;
        });
      } else if (stage.$lookup) {
        const foreignRows = await lookupRows(stage.$lookup);
        rows = rows.map((row: any) => {
          const localValue = getValue(row, stage.$lookup.localField);
          return {
            ...row,
            [stage.$lookup.as]: foreignRows.filter(
              (foreignRow: any) =>
                normalizeId(getValue(foreignRow, stage.$lookup.foreignField)) === normalizeId(localValue),
            ),
          };
        });
      } else if (stage.$unwind) {
        const path =
          typeof stage.$unwind === "string"
            ? stage.$unwind.replace(/^\$/, "")
            : String(stage.$unwind.path || "").replace(/^\$/, "");
        const next: any[] = [];
        for (const row of rows) {
          const value = getValue(row, path);
          if (Array.isArray(value)) {
            for (const item of value) next.push({ ...row, [path]: item });
          } else if (value != null) {
            next.push(row);
          }
        }
        rows = next;
      } else if (stage.$addFields) {
        rows = rows.map((row: any) => {
          const next = { ...row };
          for (const [field, expr] of Object.entries(stage.$addFields)) {
            setValue(next, field, resolveExpression(expr, row));
          }
          return next;
        });
      } else if (stage.$group) {
        const grouped = new Map<string, any>();
        for (const row of rows) {
          const groupId = resolveExpression(stage.$group._id, row);
          const key = JSON.stringify(groupId ?? null);
          if (!grouped.has(key)) grouped.set(key, { _id: groupId ?? null });
          const target = grouped.get(key);
          for (const [field, expr] of Object.entries(stage.$group)) {
            if (field === "_id") continue;
            if (expr && typeof expr === "object" && "$sum" in expr) {
              const sumExpr = expr.$sum;
              const addition = typeof sumExpr === "number" ? sumExpr : Number(resolveExpression(sumExpr, row) || 0);
              target[field] = Number(target[field] || 0) + addition;
            } else if (expr && typeof expr === "object" && "$first" in expr) {
              if (target[field] === undefined) target[field] = resolveExpression(expr.$first, row);
            } else if (expr && typeof expr === "object" && "$max" in expr) {
              const nextValue = resolveExpression(expr.$max, row);
              if (target[field] === undefined || compareValues(nextValue, target[field]) > 0) {
                target[field] = nextValue;
              }
            }
          }
        }
        rows = Array.from(grouped.values());
      } else if (stage.$count) {
        rows = [{ [stage.$count]: rows.length }];
      }
    }

    return rows;
  }

  async populateRows(rows: any[], specs: any[], session?: PostgresSession) {
    let current = rows;
    for (const spec of specs || []) {
      const normalized = typeof spec === "string" ? { path: spec } : spec;
      const relation = this.meta.relations?.[normalized.path];
      if (!relation) continue;
      const target = registry.get(relation.modelName);
      if (!target) continue;
      const foreignField = relation.foreignField || "_id";
      const localField = relation.localField || normalized.path;
      current = await Promise.all(
        current.map(async (row: any) => {
          const localValue = getValue(row, localField);
          if (localValue == null) return row;
          const q = target.findOne({ [foreignField]: localValue });
          if (normalized.select) q.select(normalized.select);
          if (session) q.session(session);
          const populated = await q.lean();
          return populated ? { ...row, [normalized.path]: populated } : row;
        }),
      );
      if (normalized.populate) {
        current = await Promise.all(
          current.map(async (row: any) => {
            const value = row[normalized.path];
            if (!value || typeof value !== "object") return row;
            const nested = await target.populateRows([value], [normalized.populate], session);
            return { ...row, [normalized.path]: nested[0] };
          }),
        );
      }
    }
    return current;
  }
}

export const createModel = <T = any>(meta: any) => registerModel(new PgModel(meta));
export const registerModel = (model: any) => {
  registry.set(model.meta.modelName, model);
  registry.set(model.meta.tableName, model);
  return model;
};
export const getModel = (nameOrTable: string) => registry.get(nameOrTable);
export { PostgresSession, normalizeId };
