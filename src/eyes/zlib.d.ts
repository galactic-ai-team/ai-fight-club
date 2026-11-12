/** Local typings so the PNG encoder can use Node's zlib without adding @types/node. */
declare module "node:zlib" {
  export function deflateSync(data: Uint8Array, options?: { level?: number }): Uint8Array;
}
