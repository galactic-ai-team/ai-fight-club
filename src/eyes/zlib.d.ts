/** Local typings so tests can verify the pure-JS PNG encoder's output with Node's zlib, without adding @types/node. */
declare module "node:zlib" {
  export function inflateSync(data: Uint8Array): Uint8Array;
}
