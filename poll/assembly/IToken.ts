import { System, Protobuf, StringBytes } from "@koinos/sdk-as";
import { common } from "./proto/common";

export class Token {
  _contractId: Uint8Array;

  /**
   * Create an instance of a PollContract contract
   * @example
   * ```ts
   *   const contract = new PollContract(Base58.decode("1DQzuCcTKacbs9GGScFTU1Hc8BsyARTPqe"));
   * ```
   */
  constructor(contractId: Uint8Array) {
    this._contractId = contractId;
  }

  balanceOf(args: common.address): common.uint64 {
    const argsBuffer = Protobuf.encode(args, common.address.encode);
    const callRes = System.call(this._contractId, 0x5c721497, argsBuffer);
    if (callRes.code != 0) {
      const errorMessage = `failed to call 'Token.balanceOf': ${
        callRes.res.error && callRes.res.error!.message
          ? callRes.res.error!.message!
          : ""
      }`;
      System.exit(callRes.code, StringBytes.stringToBytes(errorMessage));
    }
    if (!callRes.res.object) return new common.uint64();
    return Protobuf.decode<common.uint64>(
      callRes.res.object!,
      common.uint64.decode
    );
  }

  totalSupply(): common.uint64 {
    const argsBuffer = new Uint8Array(0);
    const callRes = System.call(this._contractId, 0xb0da3934, argsBuffer);
    if (callRes.code != 0) {
      const errorMessage = `failed to call 'Token.totalSupply': ${
        callRes.res.error && callRes.res.error!.message
          ? callRes.res.error!.message!
          : ""
      }`;
      System.exit(callRes.code, StringBytes.stringToBytes(errorMessage));
    }
    if (!callRes.res.object) return new common.uint64();
    return Protobuf.decode<common.uint64>(
      callRes.res.object!,
      common.uint64.decode
    );
  }
}
