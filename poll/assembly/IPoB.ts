import { System, Protobuf, StringBytes } from "@koinos/sdk-as";
import { common } from "./proto/common";

export class PoB {
  _contractId: Uint8Array;

  /**
   * Create an instance of a PoB contract
   * @example
   * ```ts
   *   const contract = new PoB(Base58.decode("1DQzuCcTKacbs9GGScFTU1Hc8BsyARTPqe"));
   * ```
   */
  constructor(contractId: Uint8Array) {
    this._contractId = contractId;
  }

  /**
   * @external
   * @readonly
   */
  get_public_key(args: common.address): common.data {
    const argsBuffer = Protobuf.encode(args, common.address.encode);
    const callRes = System.call(this._contractId, 0x96634f68, argsBuffer);
    if (callRes.code != 0) {
      const errorMessage = `failed to call 'PoB.get_public_key': ${
        callRes.res.error && callRes.res.error!.message
          ? callRes.res.error!.message!
          : ""
      }`;
      System.exit(callRes.code, StringBytes.stringToBytes(errorMessage));
    }
    if (!callRes.res.object) return new common.data();
    return Protobuf.decode<common.data>(
      callRes.res.object!,
      common.data.decode
    );
  }
}
