import { Signer, Contract, Provider } from "koilib";
import abi from "../build/pollcontract-abi.json";
import koinosConfig from "../koinos.config.js";

const [inputNetworkName] = process.argv.slice(2);

async function main() {
  const networkName = inputNetworkName || "harbinger";
  const network = koinosConfig.networks[networkName];
  if (!network) throw new Error(`network ${networkName} not found`);
  const provider = new Provider(network.rpcNodes);

  if (!network.accounts.contract.id) throw new Error("contract id not defined");
  const contract = new Contract({
    id: network.accounts.contract.id,
    abi,
    provider,
  });

  const { result } = await contract.functions.getPolls({
    start: 0,
    limit: 20,
    direction: "ascending",
  });
  console.log("Result");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => {})
  .catch((error) => console.error(error));
