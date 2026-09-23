/**
 * @file db.ts
 * @description PostgreSQL database adapter with a Prisma-like API.
 * Provides strong typing for dynamic table access.
 */

import { Pool, PoolClient } from "pg";
import { config } from "../config/config-manager";

const pool = new Pool({
    connectionString: config.get("databaseUrl"),
});

// --- Types ---

export type WhereValue =
    | any
    | {
        equals?: any;
        not?: any;
        in?: any[];
        gt?: any;
        gte?: any;
        lt?: any;
        lte?: any;
    };

export interface QueryArgs {
    where?: Record<string, WhereValue>;
    orderBy?: any;
    skip?: number;
    take?: number;
}

export interface CreateArgs<T> {
    data: T;
}

export interface CreateManyArgs<T> {
    data: T[];
}

export interface UpdateArgs<T> {
    where: Record<string, any>;
    data: Partial<T>;
}

export interface UpdateManyArgs<T> {
    where: Record<string, any>;
    data: Partial<T>;
}

export interface DeleteManyArgs {
    where: Record<string, any>;
}

export interface CountArgs {
    where?: Record<string, any>;
}

export interface UpsertArgs<T> {
    where: Record<string, any>;
    update: Partial<T>;
    create: T;
}

export interface TableClient<T = any> {
    findMany: (args?: QueryArgs) => Promise<T[]>;
    findUnique: (args: { where: Record<string, any> }) => Promise<T | null>;
    findFirst: (args?: QueryArgs) => Promise<T | null>;
    create: (args: CreateArgs<T>) => Promise<T>;
    createMany: (args: CreateManyArgs<T>) => Promise<{ count: number }>;
    update: (args: UpdateArgs<T>) => Promise<T | null>;
    updateMany: (args: UpdateManyArgs<T>) => Promise<{ count: number }>;
    deleteMany: (args: DeleteManyArgs) => Promise<{ count: number }>;
    count: (args?: CountArgs) => Promise<number>;
    upsert: (args: UpsertArgs<T>) => Promise<T | null>;
}

export interface DbClient {
    query: (text: string, params?: any[]) => Promise<any>;
    transaction: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
    $transaction: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
    table: {
        [tableName: string]: TableClient;
    };
}

// --- Helpers ---

function quoteIdentifier(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
        throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
    return `"${identifier}"`;
}

function buildWhere(
    where: Record<string, any> | undefined,
    params: any[]
): string {
    if (!where || typeof where !== "object") {
        return "";
    }

    const parts: string[] = [];

    for (const [key, value] of Object.entries(where)) {
        if (value === undefined) continue;

        if (key === "OR") {
            if (!Array.isArray(value) || value.length === 0) continue;
            const orParts = value.map((condition) => buildWhere(condition, params)).filter(Boolean);
            if (orParts.length > 0) parts.push(`(${orParts.join(" OR ")})`);
            continue;
        }

        if (key === "AND") {
            if (!Array.isArray(value) || value.length === 0) continue;
            const andParts = value.map((condition) => buildWhere(condition, params)).filter(Boolean);
            if (andParts.length > 0) parts.push(`(${andParts.join(" AND ")})`);
            continue;
        }

        const column = quoteIdentifier(key);

        if (value === null) {
            parts.push(`${column} IS NULL`);
            continue;
        }

        if (typeof value !== "object" || value instanceof Date) {
            params.push(value);
            parts.push(`${column} = $${params.length}`);
            continue;
        }

        const operators: string[] = [];

        if (Object.prototype.hasOwnProperty.call(value, "equals")) {
            const v = value.equals;
            if (v === null) operators.push(`${column} IS NULL`);
            else {
                params.push(v);
                operators.push(`${column} = $${params.length}`);
            }
        }

        if (Object.prototype.hasOwnProperty.call(value, "not")) {
            const v = value.not;
            if (v === null) operators.push(`${column} IS NOT NULL`);
            else {
                params.push(v);
                operators.push(`${column} <> $${params.length}`);
            }
        }

        if (Object.prototype.hasOwnProperty.call(value, "in")) {
            const values = value.in;
            if (Array.isArray(values)) {
                if (values.length === 0) operators.push("FALSE");
                else {
                    const placeholders = values.map((v) => {
                        params.push(v);
                        return `$${params.length}`;
                    });
                    operators.push(`${column} IN (${placeholders.join(", ")})`);
                }
            }
        }

        if (Object.prototype.hasOwnProperty.call(value, "gt")) {
            params.push(value.gt);
            operators.push(`${column} > $${params.length}`);
        }

        if (Object.prototype.hasOwnProperty.call(value, "gte")) {
            params.push(value.gte);
            operators.push(`${column} >= $${params.length}`);
        }

        if (Object.prototype.hasOwnProperty.call(value, "lt")) {
            params.push(value.lt);
            operators.push(`${column} < $${params.length}`);
        }

        if (Object.prototype.hasOwnProperty.call(value, "lte")) {
            params.push(value.lte);
            operators.push(`${column} <= $${params.length}`);
        }

        if (operators.length > 0) {
            parts.push(operators.length === 1 ? operators[0] : `(${operators.join(" AND ")})`);
        }
    }

    return parts.length > 0 ? parts.join(" AND ") : "";
}

function buildOrderBy(orderBy: any): string {
    if (!orderBy) return "";
    const items = Array.isArray(orderBy) ? orderBy : [orderBy];
    const clauses: string[] = [];
    for (const item of items) {
        if (!item || typeof item !== "object") continue;
        for (const [column, direction] of Object.entries(item)) {
            const dir = String(direction).toLowerCase();
            if (dir !== "asc" && dir !== "desc") throw new Error(`Invalid ORDER BY direction: ${direction}`);
            clauses.push(`${quoteIdentifier(column)} ${dir.toUpperCase()}`);
        }
    }
    return clauses.length > 0 ? ` ORDER BY ${clauses.join(", ")}` : "";
}

function buildLimitOffset(args: any, params: any[]): string {
    let sql = "";
    if (args?.skip !== undefined) {
        params.push(args.skip);
        sql += ` OFFSET $${params.length}`;
    }
    if (args?.take !== undefined) {
        params.push(args.take);
        sql += ` LIMIT $${params.length}`;
    }
    return sql;
}

function getData(args: any): Record<string, any> {
    const data = args?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected args.data to be an object");
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

async function insertRow(tableName: string, data: Record<string, any>) {
    const table = quoteIdentifier(tableName);
    const entries = Object.entries(data);
    if (entries.length === 0) {
        const result = await pool.query(`INSERT INTO ${table} DEFAULT VALUES RETURNING *`);
        return result.rows[0];
    }
    const columns = entries.map(([key]) => quoteIdentifier(key)).join(", ");
    const placeholders = entries.map((_, index) => `$${index + 1}`);
    const result = await pool.query(
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        entries.map(([, value]) => value)
    );
    return result.rows[0];
}

async function findOne(tableName: string, args: any, first: boolean) {
    const table = quoteIdentifier(tableName);
    const params: any[] = [];
    const whereSql = buildWhere(args?.where, params);
    const orderSql = buildOrderBy(args?.orderBy);
    let sql = `SELECT * FROM ${table}`;
    if (whereSql) sql += ` WHERE ${whereSql}`;
    sql += orderSql;
    sql += " LIMIT 1";
    const result = await pool.query(sql, params);
    return result.rows[0];
}

const dbImplementation: DbClient = {
    async query(text: string, params?: any[]) {
        return pool.query(text, params);
    },

    async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await callback(client);
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    },

    async $transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        return this.transaction(callback);
    },

    get table() {
        return new Proxy({}, {
            get: (_, prop: string) => {
                const tableName = prop;
                return {
                    findMany: async (args: QueryArgs = {}) => {
                        const table = quoteIdentifier(tableName);
                        const params: any[] = [];
                        const whereSql = buildWhere(args.where, params);
                        const orderSql = buildOrderBy(args.orderBy);
                        let sql = `SELECT * FROM ${table}`;
                        if (whereSql) sql += ` WHERE ${whereSql}`;
                        sql += orderSql;
                        sql += buildLimitOffset(args, params);
                        const result = await pool.query(sql, params);
                        return result.rows;
                    },
                    findUnique: async (args: { where: Record<string, any> }) => {
                        return findOne(tableName, args, false);
                    },
                    findFirst: async (args: QueryArgs = {}) => {
                        return findOne(tableName, args, true);
                    },
                    create: async (args: CreateArgs<any>) => {
                        return insertRow(tableName, getData(args));
                    },
                    createMany: async (args: CreateManyArgs<any>) => {
                        const data = args?.data;
                        if (!Array.isArray(data) || data.length === 0) return { count: 0 };
                        let count = 0;
                        for (const row of data) {
                            await insertRow(tableName, Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)));
                            count++;
                        }
                        return { count };
                    },
                    update: async (args: UpdateArgs<any>) => {
                        const data = getData(args);
                        const where = args.where || {};
                        const dataEntries = Object.entries(data);
                        if (dataEntries.length === 0) return findOne(tableName, { where }, false);
                        const params: any[] = [];
                        const setClause = dataEntries.map(([key, value]) => {
                            params.push(value);
                            return `${quoteIdentifier(key)} = $${params.length}`;
                        }).join(", ");
                        const whereSql = buildWhere(where, params);
                        if (!whereSql) throw new Error(`Refusing UPDATE on ${tableName} without WHERE`);
                        const result = await pool.query(
                            `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${whereSql} RETURNING *`,
                            params
                        );
                        return result.rows[0];
                    },
                    updateMany: async (args: UpdateManyArgs<any>) => {
                        const data = getData(args);
                        const where = args.where || {};
                        const dataEntries = Object.entries(data);
                        if (dataEntries.length === 0) return { count: 0 };
                        const params: any[] = [];
                        const setClause = dataEntries.map(([key, value]) => {
                            params.push(value);
                            return `${quoteIdentifier(key)} = $${params.length}`;
                        }).join(", ");
                        const whereSql = buildWhere(where, params);
                        if (!whereSql) throw new Error(`Refusing UPDATE MANY on ${tableName} without WHERE`);
                        const result = await pool.query(
                            `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${whereSql}`,
                            params
                        );
                        return { count: result.rowCount || 0 };
                    },
                    deleteMany: async (args: DeleteManyArgs) => {
                        const where = args.where || {};
                        const params: any[] = [];
                        const whereSql = buildWhere(where, params);
                        if (!whereSql) throw new Error(`Refusing DELETE MANY on ${tableName} without WHERE`);
                        const result = await pool.query(
                            `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${whereSql}`,
                            params
                        );
                        return { count: result.rowCount || 0 };
                    },
                    count: async (args: CountArgs = {}) => {
                        const params: any[] = [];
                        const whereSql = buildWhere(args.where, params);
                        let sql = `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`;
                        if (whereSql) sql += ` WHERE ${whereSql}`;
                        const result = await pool.query(sql, params);
                        return Number(result.rows[0]?.count || 0);
                    },
                    upsert: async (args: UpsertArgs<any>) => {
                        const where = args.where || {};
                        const update = getData({ data: args?.update || {} });
                        const create = getData({ data: args?.create || {} });
                        const client = await pool.connect();
                        try {
                            await client.query("BEGIN");
                            const params: any[] = [];
                            const whereSql = buildWhere(where, params);
                            if (!whereSql) throw new Error(`Refusing UPSERT on ${tableName} without WHERE`);
                            const existing = await client.query(
                                `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${whereSql} LIMIT 1 FOR UPDATE`,
                                params
                            );
                            if (existing.rows[0]) {
                                const updateEntries = Object.entries(update);
                                if (updateEntries.length === 0) {
                                    await client.query("COMMIT");
                                    return existing.rows[0];
                                }
                                const updateParams: any[] = [];
                                const setClause = updateEntries.map(([key, value]) => {
                                    updateParams.push(value);
                                    return `${quoteIdentifier(key)} = $${updateParams.length}`;
                                }).join(", ");
                                const updateWhereSql = buildWhere(where, updateParams);
                                const result = await client.query(
                                    `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${updateWhereSql} RETURNING *`,
                                    updateParams
                                );
                                await client.query("COMMIT");
                                return result.rows[0];
                            }
                            const createEntries = Object.entries(create);
                            if (createEntries.length === 0) throw new Error(`UPSERT create data is empty for ${tableName}`);
                            const columns = createEntries.map(([key]) => quoteIdentifier(key)).join(", ");
                            const placeholders = createEntries.map((_, index) => `$${index + 1}`);
                            const result = await client.query(
                                `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${placeholders.join(", ")}) RETURNING *`,
                                createEntries.map(([, value]) => value)
                            );
                            await client.query("COMMIT");
                            return result.rows[0];
                        } catch (error) {
                            await client.query("ROLLBACK");
                            throw error;
                        } finally {
                            client.release();
                        }
                    },
                };
            },
        });
    },
};

export async function closeDbPool(): Promise<void> {
    await pool.end();
}

export const db = new Proxy(dbImplementation, {
    get: (target, prop: string) => {
        if (prop in target) return (target as any)[prop];
        return (target.table as any)[prop];
    },
}) as unknown as DbClient & {
    [tableName: string]: TableClient;
};
