import { Signer, Contract, Provider } from "koilib";
import abi from "../build/pollcontract-abi.json";
import koinosConfig from "../koinos.config.js";

const [inputNetworkName] = process.argv.slice(2);

async function main() {
  const networkName = inputNetworkName || "harbinger";
  const network = koinosConfig.networks[networkName];
  if (!network) throw new Error(`network ${networkName} not found`);
  const provider = new Provider(network.rpcNodes);
  const accountWithFunds = Signer.fromWif(
    network.accounts.manaSharer.privateKey
  );
  accountWithFunds.provider = provider;

  if (!network.accounts.contract.id) throw new Error("contract id not defined");
  const contract = new Contract({
    id: network.accounts.contract.id,
    abi,
    signer: accountWithFunds,
    provider,
    options: {
      rcLimit: "10000000000",
    },
  });

  const { receipt, transaction } = await contract.functions.createPoll({
    title: "test",
    summary: "test",
    url: "http://example.com",
    creator: accountWithFunds.address,
    start_date: Date.now().toString(),
    end_date: (Date.now() + 86400_000).toString(),
    tiers: [{ value: "10" }],
  });
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
