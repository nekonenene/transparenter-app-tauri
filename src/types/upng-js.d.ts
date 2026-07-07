declare module "upng-js" {
  const UPNG: {
    /** cnum: パレット色数(0 = 減色なしのロスレス) */
    encode(
      imgs: ArrayBuffer[],
      w: number,
      h: number,
      cnum: number,
      dels?: number[],
    ): ArrayBuffer;
  };
  export default UPNG;
}
