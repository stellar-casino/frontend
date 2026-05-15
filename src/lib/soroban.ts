import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  xdr,
  scValToNative,
} from "@stellar/stellar-sdk";

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL!;
const PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;

export const server = new SorobanRpc.Server(RPC_URL);

export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerAddress: string
) {
  const { signTransaction } = await import("@stellar/freighter-api");
  const account = await server.getAccount(signerAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTransaction(prepared.toXDR(), {
    network: "TESTNET",
  });
  const { TransactionBuilder: TB } = await import("@stellar/stellar-sdk");
  const signed = TB.fromXDR(signedXdr, PASSPHRASE);
  return server.sendTransaction(signed);
}

export async function simulateContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerAddress: string
) {
  const account = await server.getAccount(signerAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (!("result" in result)) throw new Error("Simulation failed");
  return scValToNative(
    (result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval
  );
}

export function makeI128(amount: bigint): xdr.ScVal {
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      hi: xdr.Int64.fromString("0"),
      lo: xdr.Uint64.fromString(amount.toString()),
    })
  );
}
