/**
 * Much the same as Array.map, only it takes an async fn as an element handler, and ensures that each element handler
 * is executed sequentially.
 * The pattern of `await Promise.all(arr.map(async e => { ... }))` only works if one's happy with each element handler
 * being run concurrently.
 * If one required sequential execution of async fn's, the only alternative was regular loops with mutable state vars.
 * The equivalent with asyncMap: `await asyncMap(arr, async e => { ... })`.
 */
export declare function asyncMap<T, U>(arr: T[], fn: (e: T, i: number) => Promise<U>): Promise<U[]>;
//# sourceMappingURL=index.d.ts.map