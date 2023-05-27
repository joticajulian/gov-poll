import {
  Arrays,
  System,
  authority,
  Storage,
  Protobuf,
  StringBytes,
  Base58,
  Token,
} from "@koinos/sdk-as";
import { poll } from "./proto/poll";
import { common } from "./proto/common";

const OFFSET_SPACE_ID_VOTES = 1000;

export class PollContract {
  callArgs: System.getArgumentsReturn | null;

  contractId: Uint8Array;

  pollCounter: Storage.Obj<common.uint64>;

  polls: Storage.ProtoMap<common.uint64, poll.poll_data>;

  balances: Storage.Map<Uint8Array, common.uint64>;

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
      common.uint64.decode,
      common.uint64.encode,
      () => new common.uint64(0)
    );

    this.polls = new Storage.ProtoMap(
      this.contractId,
      1,
      common.uint64.decode,
      common.uint64.encode,
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
    const pollCounter = this.pollCounter.get()!;
    this.polls.put(pollCounter, new poll.poll_data(args));
    pollCounter.value += 1;
    this.pollCounter.put(pollCounter);
  }

  /**
   * Vote in a poll
   * @external
   */
  vote(args: poll.vote_args): void {
    const pollId = new common.uint64(args.poll_id);
    const poll = this.polls.get(pollId);
    System.require(poll, `poll ID ${args.poll_id} does not exist`);
    const tierMap = new Storage.Map(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * args.poll_id,
      common.uint64.decode,
      common.uint64.encode,
      null
    );
    const oldTier = tierMap.get(args.voter);
    let oldWeightVote = new poll.weight_vote(0, poll.vote.undef);
    if (oldTier) {
      const weightVotes = new Storage.Map(
        this.contractId,
        OFFSET_SPACE_ID_VOTES + 6 * args.poll_id + oldTier.value,
        poll.weight_vote.decode,
        poll.weight_vote.encode,
        () => new poll.weight_vote(0, poll.vote.undef)
      );
      oldWeightVote = weightVotes.get(args.voter)!;
      weightVotes.remove(args.voter);
    }

    if (args.vote == poll.vote.undef) {
      return;
    }

    const vhp = new Token(System.getContractAddress("vhp"));
    const currentBalance = vhp.balanceOf(args.voter);

    let tier = 0;
    if (currentBalance >= poll.params.minTier1) {
      tier = 1;
    } else if (currentBalance >= poll.params.minTier2) {
      tier = 2;
    } else if (currentBalance >= poll.params.minTier3) {
      tier = 3;
    } else if (currentBalance >= poll.params.minTier4) {
      tier = 4;
    } else if (currentBalance >= poll.params.minTier5) {
      tier = 5;
    } else {
      System.fail(
        `The balance ${currentBalance} is lower than the tier 5 ${poll.params.minTier5}`
      );
    }

    const weightVotes = new Storage.Map(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * args.poll_id + tier,
      poll.weight_vote.decode,
      poll.weight_vote.encode,
      () => new poll.weight_vote(0, poll.vote.undef)
    );
    weightVotes.put(
      args.voter,
      new poll.weight_vote(currentBalance, args.vote)
    );

    if (oldWeightVote.vote == poll.vote.yes) {
      poll.weight_votes -= oldWeightVote.weight;
    }
    if (args.vote == poll.vote.yes) {
      poll.weight_votes += currentBalance;
    }

    this.polls.put(pollId, poll);
  }
}
