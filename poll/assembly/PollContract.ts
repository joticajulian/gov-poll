import {
  Arrays,
  System,
  authority,
  Storage,
  Protobuf,
  StringBytes,
  Base58,
  Token,
  error,
} from "@koinos/sdk-as";
import { poll } from "./proto/poll";
import { common } from "./proto/common";

const OFFSET_SPACE_ID_VOTES = 1000;

export class PollContract {
  callArgs: System.getArgumentsReturn | null;

  contractId: Uint8Array;

  pollCounter: Storage.Obj<common.uint32>;

  polls: Storage.ProtoMap<common.uint32, poll.poll_data>;

  constructor() {
    this.contractId = System.getContractId();

    /**
     * The Space IDs from 1000 to 4294967295 are reserved to store
     * vhp balances. For each poll there are 5 spaces, called tiers,
     * each one to store a group of miners with a specific range
     * of VHP.
     *
     * For example:
     * - tier 1: voters with more than 1M VHP
     * - tier 2: voters between 100K - 1M VHP
     * - tier 3: voters between 10K - 100K VHP
     * - tier 4: voters between 1K - 10K VHP
     * - tier 5: voters with less than 1K VHP
     *
     * The reason of these tiers is to optimize the recalculation
     * of votes by starting with the voters with more VHP, and maybe
     * skip the voters with low VHP if the computation gets large
     * and unmanageable.
     *
     * The limits of these tiers are defined by the creator of
     * each poll.
     */

    this.pollCounter = new Storage.Obj(
      this.contractId,
      0,
      common.uint32.decode,
      common.uint32.encode,
      () => new common.uint32(0)
    );

    this.polls = new Storage.ProtoMap(
      this.contractId,
      1,
      common.uint32.decode,
      common.uint32.encode,
      poll.poll_data.decode,
      poll.poll_data.encode,
      null
    );
  }

  /**
   * Create a new Poll
   * @external
   */
  createPoll(args: poll.poll_params): void {
    System.require(
      System.checkAuthority(
        authority.authorization_type.contract_call,
        args.creator!,
        this.callArgs!.args
      ),
      `account ${Base58.encode(args.creator!)} authorization failed`,
      error.error_code.authorization_failure
    );
    System.require(args.start_date <= args.end_date, "invalid dates");
    System.require(
      args.end_date > System.getHeadInfo().head_block_time,
      "end date must be in the future"
    );
    System.require(!!args.title && args.title!.length > 0, "invalid title");
    System.require(args.tiers.length > 0, "no tiers defined");

    const pollCounter = this.pollCounter.get()!;
    this.polls.put(pollCounter, new poll.poll_data(args, 0, 0));
    pollCounter.value += 1;
    this.pollCounter.put(pollCounter);
  }

  /**
   * Vote in a poll
   * @external
   */
  vote(args: poll.vote_args): void {
    const pollId = new common.uint32(args.poll_id);
    const pollObjAux = this.polls.get(pollId);
    System.require(pollObjAux, `poll ID ${args.poll_id} does not exist`);
    const pollObj = pollObjAux!;
    System.require(
      System.checkAuthority(
        authority.authorization_type.contract_call,
        args.voter!,
        this.callArgs!.args
      ),
      `account ${Base58.encode(args.voter!)} authorization failed`,
      error.error_code.authorization_failure
    );
    const tierMap = new Storage.Map<Uint8Array, common.uint32>(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * args.poll_id,
      common.uint32.decode,
      common.uint32.encode,
      null
    );
    const oldTier = tierMap.get(args.voter!);
    let oldWeightVote = new poll.weight_vote(0, poll.vote.undef);
    if (oldTier) {
      const weightVotes = new Storage.Map<Uint8Array, poll.weight_vote>(
        this.contractId,
        OFFSET_SPACE_ID_VOTES + 6 * args.poll_id + oldTier.value,
        poll.weight_vote.decode,
        poll.weight_vote.encode,
        () => new poll.weight_vote(0, poll.vote.undef)
      );
      oldWeightVote = weightVotes.get(args.voter!)!;
      weightVotes.remove(args.voter!);
    }

    if (args.vote == poll.vote.undef) {
      return;
    }

    const vhp = new Token(System.getContractAddress("vhp"));
    const currentBalance = vhp.balanceOf(args.voter!);

    let tier = 0;
    let tierValue: u64 = 0;
    for (let i = 0; i < pollObj.params!.tiers.length; i += 1) {
      tierValue = pollObj.params!.tiers[i];
      if (currentBalance >= tierValue) {
        tier = i + 1;
        break;
      }
    }
    if (tier == 0) {
      System.fail(
        `The balance ${currentBalance} is lower than ${tierValue}, the minimum VHP expected in the last tier`
      );
    }

    const weightVotes = new Storage.Map<Uint8Array, poll.weight_vote>(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * args.poll_id + tier,
      poll.weight_vote.decode,
      poll.weight_vote.encode,
      () => new poll.weight_vote(0, poll.vote.undef)
    );
    weightVotes.put(
      args.voter!,
      new poll.weight_vote(currentBalance, args.vote)
    );

    if (oldWeightVote.vote == poll.vote.yes) {
      pollObj.weight_votes -= oldWeightVote.weight;
    }
    if (args.vote == poll.vote.yes) {
      pollObj.weight_votes += currentBalance;
    }

    this.polls.put(pollId, pollObj);
    System.event("vote", Protobuf.encode(args, poll.vote_args.encode), [
      args.voter!,
    ]);
  }
}
