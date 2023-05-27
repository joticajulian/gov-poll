import {
  Arrays,
  System,
  authority,
  Storage,
  Protobuf,
  StringBytes,
  Base58,
} from "@koinos/sdk-as";
import { poll } from "./proto/poll";
import { common } from "./proto/common";

export class PollContract {
  callArgs: System.getArgumentsReturn | null;

  contractId: Uint8Array;

  supply: Storage.Obj<common.uint64>;

  balances: Storage.Map<Uint8Array, common.uint64>;

  constructor() {
    this.contractId = System.getContractId();

    this.supply = new Storage.Obj(
      this.contractId,
      1,
      common.uint64.decode,
      common.uint64.encode,
      () => new common.uint64(0)
    );

    this.balances = new Storage.Map(
      this.contractId,
      3,
      common.uint64.decode,
      common.uint64.encode,
      () => new common.uint64(0)
    );
  }

  /**
   * Create a new Poll
   * @external
   */
  createPoll(args: poll.poll_params): void {}
}
