import {
  System,
  authority,
  Storage,
  Protobuf,
  Base58,
  error,
} from "@koinos/sdk-as";
import { poll } from "./proto/poll";
import { common } from "./proto/common";
import { Token } from "./IToken";
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
   * Authorize function
   * @external
   */
  authorize(args: common.nothing): common.boole {
    return new common.boole(false);
  }

  getTier(pollId: u32, tierId: u32): Storage.Map<Uint8Array, poll.vhp_vote> {
    return new Storage.Map<Uint8Array, poll.vhp_vote>(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * pollId + tierId,
      poll.vhp_vote.decode,
      poll.vhp_vote.encode,
      () => new poll.vhp_vote(new Uint8Array(0), poll.vote.undef, 0)
    );
  }

  _getTierId(pollId: u32, voter: Uint8Array): common.uint32 {
    const tierMap = new Storage.Map<Uint8Array, common.uint32>(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * pollId,
      common.uint32.decode,
      common.uint32.encode,
      () => new common.uint32(0)
    );
    return tierMap.get(voter)!;
  }

  _setTierId(pollId: u32, voter: Uint8Array, tierId: u32): void {
    const tierMap = new Storage.Map<Uint8Array, common.uint32>(
      this.contractId,
      OFFSET_SPACE_ID_VOTES + 6 * pollId,
      common.uint32.decode,
      common.uint32.encode,
      null
    );
    if (tierId == 0) {
      tierMap.remove(voter);
    } else {
      tierMap.put(voter, new common.uint32(tierId));
    }
  }

  getTierId(args: poll.vote_path_args): common.uint32 {
    const tier = this._getTierId(args.poll_id, args.voter!)!;
    System.require(tier.value > 0, "voter not found");
    return tier!;
  }

  /**
   * Get list of polls
   * @external
   * @readonly
   */
  getPolls(args: poll.poll_list_args): poll.polls {
    const polls = new poll.polls([]);
    const pollCounter = this.pollCounter.get()!;
    let i = args.start;
    while (
      u32(polls.polls.length) < args.limit &&
      ((args.direction == poll.direction.ascending && i < pollCounter.value) ||
        (args.direction == poll.direction.descending && i >= 0))
    ) {
      const pollObj = this.polls.get(new common.uint32(i));
      if (pollObj) polls.polls.push(pollObj);
      if (args.direction == poll.direction.ascending) i += 1;
      else i -= 1;
    }
    return polls;
  }

  /**
   * Create a new Poll
   * @external
   * @event poll_created poll.poll_params
   */
  createPoll(args: poll.poll_params): common.nothing {
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

    const now = System.getHeadInfo().head_block_time;
    const vhpToken = new Token(System.getContractAddress("vhp"));
    const pollCounter = this.pollCounter.get()!;
    this.polls.put(
      pollCounter,
      new poll.poll_data(
        pollCounter.value,
        args,
        0,
        0,
        vhpToken.totalSupply().value,
        now
      )
    );
    pollCounter.value += 1;
    this.pollCounter.put(pollCounter);
    System.event("poll_created", this.callArgs!.args, [args.creator!]);
    return new common.nothing();
  }

  /**
   * Get list of votes
   * @external
   * @readonly
   */
  getVotes(args: poll.poll_tier_list_args): poll.vhp_votes {
    System.require(args.tier_id > 0, "invalid tier id");
    const pollId = new common.uint32(args.poll_id);
    const pollObj = this.polls.get(pollId);
    System.require(pollObj, `poll ID ${args.poll_id} does not exist`);
    System.require(
      args.tier_id <= u32(pollObj!.params!.tiers.length),
      `max tier id is ${pollObj!.params!.tiers.length}`
    );

    const tier = this.getTier(args.poll_id, args.tier_id);
    const direction =
      args.direction == poll.direction.ascending
        ? Storage.Direction.Ascending
        : Storage.Direction.Descending;
    const votes = tier.getManyValues(
      args.start ? args.start! : new Uint8Array(0),
      i32(args.limit),
      direction
    );
    return new poll.vhp_votes(votes);
  }

  updateVote(
    pollId: u32,
    pollObj: poll.poll_data,
    tierId: u32,
    tier: Storage.Map<Uint8Array, poll.vhp_vote>,
    vhpToken: Token,
    vhpVote: poll.vhp_vote,
    newVote: poll.vote
  ): i32 {
    let oldVhpVote: u64;
    let oldYesVhpVote: u64;
    let newVhpVote: u64;
    let newYesVhpVote: u64;

    // previous vote participation
    if (vhpVote.vote == poll.vote.undef) {
      oldVhpVote = 0;
      oldYesVhpVote = 0;
    } else if (vhpVote.vote == poll.vote.no) {
      oldVhpVote = vhpVote.vhp;
      oldYesVhpVote = 0;
    } else {
      oldVhpVote = vhpVote.vhp;
      oldYesVhpVote = vhpVote.vhp;
    }

    const voteExists = tierId > 0;
    let newTierId: i32 = 0;

    // new vote participation
    if (newVote == poll.vote.undef) {
      if (voteExists) tier.remove(vhpVote.voter!);
      this._setTierId(pollId, vhpVote.voter!, 0);
      newVhpVote = 0;
      newYesVhpVote = 0;
    } else {
      // new vote is yes or no
      vhpVote.vote = newVote;
      vhpVote.vhp = vhpToken.balanceOf(new common.address(vhpVote.voter)).value;

      newVhpVote = vhpVote.vhp;
      newYesVhpVote = newVote == poll.vote.yes ? vhpVote.vhp : 0;

      // manage tiers
      let tierValue: u64 = 0;
      for (let i = 0; i < pollObj.params!.tiers.length; i += 1) {
        tierValue = pollObj.params!.tiers[i].value;
        if (newVhpVote >= tierValue) {
          newTierId = i + 1;
          break;
        }
      }

      if (newTierId == 0) {
        // not enough to enter any tier. Its balance is considered 0
        newVhpVote = 0;
        newYesVhpVote = 0;
        if (voteExists) tier.remove(vhpVote.voter!);
        this._setTierId(pollId, vhpVote.voter!, 0);
      } else if (newTierId == tierId) {
        // update vote in the same tier
        tier.put(vhpVote.voter!, vhpVote);
      } else {
        // change of tier
        const newTier = this.getTier(pollId, newTierId);
        if (voteExists) tier.remove(vhpVote.voter!);
        newTier.put(vhpVote.voter!, vhpVote);
        this._setTierId(pollId, vhpVote.voter!, newTierId);
      }
    }

    pollObj.yes_vhp_votes =
      pollObj.yes_vhp_votes + newYesVhpVote - oldYesVhpVote;
    pollObj.total_vhp_votes = pollObj.total_vhp_votes + newVhpVote - oldVhpVote;

    return newTierId;
  }

  /**
   * Vote in a poll
   * @external
   * @event vote poll.vote_args
   */
  vote(args: poll.vote_args): common.nothing {
    const pollId = new common.uint32(args.poll_id);
    const pollObjAux = this.polls.get(pollId);
    System.require(pollObjAux, `poll ID ${args.poll_id} does not exist`);
    const pollObj = pollObjAux!;
    const now = System.getHeadInfo().head_block_time;
    System.require(now >= pollObj.params!.start_date, "poll has not started");
    System.require(now <= pollObj.params!.end_date, "poll has ended");
    System.require(
      System.checkAuthority(
        authority.authorization_type.contract_call,
        args.voter!,
        this.callArgs!.args
      ),
      `account ${Base58.encode(args.voter!)} authorization failed`,
      error.error_code.authorization_failure
    );
    const oldTierId = this._getTierId(args.poll_id, args.voter!);
    const oldTier = this.getTier(args.poll_id, oldTierId.value);
    const vhpToken = new Token(System.getContractAddress("vhp"));

    const oldWeightVote =
      oldTierId.value > 0
        ? oldTier.get(args.voter!)!
        : new poll.vhp_vote(args.voter, poll.vote.undef, 0);
    System.require(
      oldWeightVote.vote != args.vote,
      `vote is already ${args.vote}`
    );

    const newTierId = this.updateVote(
      args.poll_id,
      pollObj,
      oldTierId.value,
      oldTier,
      vhpToken,
      oldWeightVote,
      args.vote
    );

    System.require(
      newTierId > 0 || args.vote == poll.vote.undef,
      "The VHP balance is lower than the minimum VHP expected in the last tier"
    );

    this.polls.put(pollId, pollObj);
    System.event("vote", Protobuf.encode(args, poll.vote_args.encode), [
      args.voter!,
    ]);
    return new common.nothing();
  }

  /**
   * Update the VHP balances and compute the votes
   * @external
   * @event update_votes update_votes_event
   */
  updateVotes(args: poll.poll_tier): common.nothing {
    const pollId = new common.uint32(args.poll_id);
    const pollObjAux = this.polls.get(pollId);
    System.require(pollObjAux, `poll ID ${args.poll_id} does not exist`);
    const pollObj = pollObjAux!;
    const now = System.getHeadInfo().head_block_time;
    System.require(now >= pollObj.params!.start_date, "poll has not started");
    System.require(now <= pollObj.params!.end_date, "poll has ended");
    System.require(args.tier_id > 0, "invalid tier id");
    System.require(
      args.tier_id <= u32(pollObj.params!.tiers.length),
      `max tier id is ${pollObj.params!.tiers.length}`
    );
    const vhpToken = new Token(System.getContractAddress("vhp"));

    const tier = this.getTier(args.poll_id, args.tier_id);
    // TODO: handle computation when there are more than 1000 voters
    const objs = tier.getManyValues(new Uint8Array(0), 1000);
    for (let i = 0; i < objs.length; i += 1) {
      const obj = objs[i];
      this.updateVote(
        args.poll_id,
        pollObj,
        args.tier_id,
        tier,
        vhpToken,
        obj,
        obj.vote
      );
    }

    pollObj.last_update = System.getHeadInfo().head_block_time;
    pollObj.total_vhp_supply = vhpToken.totalSupply().value;

    this.polls.put(pollId, pollObj);

    const eventData = new poll.update_votes_event(
      args.poll_id,
      args.tier_id,
      objs.length,
      pollObj.yes_vhp_votes,
      pollObj.total_vhp_votes,
      pollObj.total_vhp_supply
    );
    System.event(
      "update_votes",
      Protobuf.encode(eventData, poll.update_votes_event.encode),
      []
    );

    return new common.nothing();
  }
}
