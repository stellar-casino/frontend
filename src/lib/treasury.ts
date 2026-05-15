import { Address, xdr } from "@stellar/stellar-sdk";
import { invokeContract, simulateContract, makeI128 } from "./soroban";

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID!;

export function deposit(playerAddress: string, tokenAddress: string, amount: bigint) {
  return invokeContract(TREASURY, "deposit", [
    new Address(playerAddress).toScVal(),
    new Address(tokenAddress).toScVal(),
    makeI128(amount),
  ], playerAddress);
}

export function withdraw(playerAddress: string, tokenAddress: string, amount: bigint) {
  return invokeContract(TREASURY, "withdraw", [
    new Address(playerAddress).toScVal(),
    new Address(tokenAddress).toScVal(),
    makeI128(amount),
  ], playerAddress);
}

export function getBalance(playerAddress: string) {
  return simulateContract(TREASURY, "reserve_balance", [
    new Address(playerAddress).toScVal(),
  ], playerAddress);
}
