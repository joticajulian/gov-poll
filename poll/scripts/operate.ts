import { Signer, Contract, Provider, utils, Transaction } from "koilib";
import abi from "../build/pollcontract-abi.json";
import koinosConfig from "../koinos.config.js";
import HDKoinos from "./HDKoinos";

const [command, command1] = process.argv.slice(2);

async function main() {
  const networkName = "harbinger";
  const network = koinosConfig.networks[networkName];
  if (!network) throw new Error(`network ${networkName} not found`);
  const provider = new Provider(network.rpcNodes);
  const accountWithFunds = Signer.fromWif(
    network.accounts.manaSharer.privateKey
  );
  accountWithFunds.provider = provider;

  const hdKoinos = new HDKoinos(network.accounts.voters.seed);
  const transaction = new Transaction({
    signer: accountWithFunds,
    provider,
    options: {
      rcLimit: "10000000000",
    },
  });

  switch (command) {
    case "fund-voters": {
      const pob = new Contract({
        id: "198RuEouhgiiaQm7uGfaXS6jqZr6g6nyoR",
        provider,
      });
      await pob.fetchAbi();
      pob.abi.methods.burn.entry_point = Number(
        pob.abi.methods.burn["entry-point"]
      );
      pob.abi.methods.burn.read_only = pob.abi.methods.burn["read-only"];

      for (let i = 0; i < 5; i += 1) {
        const voter = hdKoinos.deriveKeyAccount(i, `voter${i}`).public.address;
        await transaction.pushOperation(pob.functions.burn, {
          token_amount: "1000",
          burn_address: accountWithFunds.address,
          vhp_address: voter,
        });
      }
      break;
    }
    case "get-voters": {
      for (let i = 0; i < 5; i += 1) {
        const voter = hdKoinos.deriveKeyAccount(i, `voter${i}`).public.address;
        console.log(voter);
      }
      return;
    }
    case "transfer-vhp": {
      const vhp = new Contract({
        id: "1JZqj7dDrK5LzvdJgufYBJNUFo88xBoWC8",
        provider,
      });
      await vhp.fetchAbi();
      vhp.abi.methods.transfer.entry_point = Number(
        vhp.abi.methods.transfer["entry-point"]
      );
      vhp.abi.methods.transfer.read_only =
        vhp.abi.methods.transfer["read-only"];

      const voter = hdKoinos.deriveKeyAccount(2, `voter${2}`).public.address;
      await transaction.pushOperation(vhp.functions.transfer, {
        from: voter,
        to: accountWithFunds.address,
        value: "12",
      });
      break;
    }
    case "vote-poll": {
      const poll = new Contract({
        id: network.accounts.contract.id,
        provider,
      });
      await poll.fetchAbi();

      for (let i = 0; i < 5; i += 1) {
        const voter = hdKoinos.deriveKeyAccount(i, `voter${i}`).public.address;
        await transaction.pushOperation(poll.functions.vote, {
          poll_id: 0,
          voter: voter,
          vote: 1,
        });
      }
      break;
    }
    case "update-votes": {
      const poll = new Contract({
        id: network.accounts.contract.id,
        provider,
      });
      await poll.fetchAbi();
      await transaction.pushOperation(poll.functions.updateVotes, {
        poll_id: 0,
      });
      break;
    }
    case "vote-no": {
      const poll = new Contract({
        id: network.accounts.contract.id,
        provider,
      });
      const voter =
        command1 === "manaSharerIsVoter"
          ? accountWithFunds.address
          : hdKoinos.deriveKeyAccount(2, `voter${2}`).public.address;
      await poll.fetchAbi();
      await transaction.pushOperation(poll.functions.vote, {
        poll_id: 1,
        voter: voter,
        vote: 2,
      });
      break;
    }
    default:
      throw new Error(
        `invalid command. expected commands: ${[
          "fund-voters",
          "vote-poll",
          "vote-no",
          "transfer-vhp",
          "update-votes",
        ].join(", ")}`
      );
  }

  await transaction.prepare();
  await accountWithFunds.signTransaction(transaction.transaction);
  for (let i = 0; i < 5; i += 1) {
    const voter = Signer.fromWif(
      hdKoinos.deriveKeyAccount(i, `voter${i}`).private.privateKey
    );
    await voter.signTransaction(transaction.transaction);
  }
  const receipt = await transaction.send();
  console.log("Transaction submitted. Receipt: ");
  console.log(receipt);
  const { blockNumber } = await transaction.wait("byBlock", 60000);
  console.log(
    `Transaction mined in block number ${blockNumber} (${networkName})`
  );
}

main()
  .then(() => {})
  .catch((error) => console.error(error));
