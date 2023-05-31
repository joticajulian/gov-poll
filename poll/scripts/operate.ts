import { Signer, Contract, Provider, utils, Transaction } from "koilib";
import abi from "../build/pollcontract-abi.json";
import koinosConfig from "../koinos.config.js";
import HDKoinos from "./HDKoinos";

const [command] = process.argv.slice(2);

async function main() {
  const networkName = "harbinger";
  const network = koinosConfig.networks[networkName];
  if (!network) throw new Error(`network ${networkName} not found`);
  const provider = new Provider(network.rpcNodes);
  const accountWithFunds = Signer.fromWif(
    network.accounts.manaSharer.privateKey
  );
  accountWithFunds.provider = provider;

  const transaction = new Transaction({
    signer: accountWithFunds,
    provider,
    options: {
      rcLimit: "10000000000",
    },
  });

  switch (command) {
    case "fund-voters": {
      const hdKoinos = new HDKoinos(network.accounts.voters.seed);
      for (let i = 0; i < 5; i += 1) {
        const voter = hdKoinos.deriveKeyAccount(i, `voter${i}`).public.address;
        const pob = new Contract({
          id: "198RuEouhgiiaQm7uGfaXS6jqZr6g6nyoR",
          abi: utils.tokenAbi,
          provider,
        });
        await pob.fetchAbi();
        await transaction.pushOperation(pob.functions.burn, {
          token_amount: "1000",
          burn_address: accountWithFunds.address,
          vhp_address: voter,
        });
      }
      break;
    }
    default:
      throw new Error(`invalid command. expected commands: fund-voters`);
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
