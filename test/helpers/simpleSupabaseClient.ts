// test/helpers/simpleSupabaseClient.ts

/**
 * Cloudflare Workers環境用のシンプルなSupabaseクライアント
 * node:punycode などのNode.js依存を回避
 */
export class SimpleSupabaseClient {
    constructor(
        private readonly url: string,
        private readonly key: string
    ) {}

    from(table: string) {
        const baseUrl = `${this.url}/rest/v1/${table}`;

        return {
            select: (columns = "*") => {
                return {
                    eq: async (column: string, value: any) => {
                        const response = await fetch(
                            `${baseUrl}?${column}=eq.${value}&select=${columns}`,
                            {
                                headers: {
                                    "apikey": this.key,
                                    "Authorization": `Bearer ${this.key}`,
                                },
                            }
                        );

                        if (!response.ok) {
                            const text = await response.text();
                            return {
                                data: null,
                                error: new Error(`Query failed: ${text}`)
                            };
                        }

                        const data = await response.json();
                        return { data, error: null };
                    },

                    single: async () => {
                        const response = await fetch(
                            `${baseUrl}?select=${columns}`,
                            {
                                headers: {
                                    "apikey": this.key,
                                    "Authorization": `Bearer ${this.key}`,
                                    "Accept": "application/vnd.pgrst.object+json",
                                },
                            }
                        );

                        if (!response.ok) {
                            return {
                                data: null,
                                error: new Error("Not found")
                            };
                        }

                        const data = await response.json();
                        return { data, error: null };
                    },

                    gte: (column: string, value: any) => {
                        return {
                            order: (orderColumn: string, options: { ascending: boolean }) => {
                                return this._executeQuery(
                                    baseUrl,
                                    `${column}=gte.${this._encodeValue(value)}&select=${columns}&order=${orderColumn}.${options.ascending ? "asc" : "desc"}`
                                );
                            },
                        };
                    },

                    lt: (column: string, value: any) => {
                        return this._executeQuery(
                            baseUrl,
                            `${column}=lt.${this._encodeValue(value)}&select=${columns}`
                        );
                    },
                };
            },

            insert: async (records: any | any[]) => {
                const body = Array.isArray(records) ? records : [records];

                const response = await fetch(baseUrl, {
                    method: "POST",
                    headers: {
                        "apikey": this.key,
                        "Authorization": `Bearer ${this.key}`,
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const text = await response.text();
                    return {
                        data: null,
                        error: new Error(`Insert failed: ${text}`)
                    };
                }

                return { data: null, error: null };
            },

            delete: () => {
                return {
                    in: async (column: string, values: any[]) => {
                        const response = await fetch(
                            `${baseUrl}?${column}=in.(${values.join(",")})`,
                            {
                                method: "DELETE",
                                headers: {
                                    "apikey": this.key,
                                    "Authorization": `Bearer ${this.key}`,
                                },
                            }
                        );

                        if (!response.ok) {
                            const text = await response.text();
                            return {
                                data: null,
                                error: new Error(`Delete failed: ${text}`)
                            };
                        }

                        return { data: null, error: null };
                    },
                };
            },
        };
    }

    private async _executeQuery(baseUrl: string, query: string) {
        const response = await fetch(`${baseUrl}?${query}`, {
            headers: {
                "apikey": this.key,
                "Authorization": `Bearer ${this.key}`,
            },
        });

        if (!response.ok) {
            const text = await response.text();
            return {
                data: null,
                error: new Error(`Query failed: ${text}`)
            };
        }

        const data = await response.json();
        return { data, error: null };
    }

    private _encodeValue(value: any): string {
        if (value instanceof Date) {
            return encodeURIComponent(value.toISOString());
        }
        return encodeURIComponent(String(value));
    }
}

export function createSimpleSupabaseClient(url: string, key: string) {
    return new SimpleSupabaseClient(url, key);
}