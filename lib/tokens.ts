import { XLM_SAC } from "@/lib/stellar";

export type AccountType = "G" | "C";

/** How a deposit of this token is actually sent on-chain. */
export type TokenMechanism = "classic-native" | "contract-transfer";

export interface TokenOption {
  key: string;
  label: string;
  /** Asset symbol shown in the UI. */
  symbol: string;
  /** Contract id used BOTH for sending (when contract-transfer) and for event filtering. */
  contractId: string;
  mechanism: TokenMechanism;
  /** Disabled in the UI until its env var is set. */
  enabled: boolean;
  /** Env var that enables this option (shown in the disabled hint). */
  envVar?: string;
  /** Short description of the send mechanism, shown under the selector. */
  note: string;
}

const USDC_SAC = process.env.NEXT_PUBLIC_USDC_SAC || "";
const SEP41_TOKEN = process.env.NEXT_PUBLIC_SEP41_TOKEN || "";

/** Token choices for a Classic (G) source account. */
const G_TOKENS: TokenOption[] = [
  {
    key: "xlm",
    label: "XLM (native)",
    symbol: "XLM",
    contractId: XLM_SAC,
    mechanism: "classic-native",
    enabled: true,
    note: "Classic payment operation. Emits a unified transfer event on the XLM SAC.",
  },
  {
    key: "usdc",
    label: "USDC",
    symbol: "USDC",
    contractId: USDC_SAC,
    mechanism: "contract-transfer",
    enabled: !!USDC_SAC,
    envVar: "NEXT_PUBLIC_USDC_SAC",
    note: "Classic asset moved via its Stellar Asset Contract (token.transfer).",
  },
  {
    key: "sep41",
    label: "Custom SEP-41 token",
    symbol: "SEP41",
    contractId: SEP41_TOKEN,
    mechanism: "contract-transfer",
    enabled: !!SEP41_TOKEN,
    envVar: "NEXT_PUBLIC_SEP41_TOKEN",
    note: "Custom SEP-41 token contract — G account authorizes token.transfer.",
  },
];

/** Token choices for a Contract (C) source account — all via execute_as_admin. */
const C_TOKENS: TokenOption[] = [
  {
    key: "xlm-sac",
    label: "XLM (SAC)",
    symbol: "XLM",
    contractId: XLM_SAC,
    mechanism: "contract-transfer",
    enabled: true,
    note: "SAC token.transfer driven by the contract via execute_as_admin.",
  },
  {
    key: "usdc-sac",
    label: "USDC (SAC)",
    symbol: "USDC",
    contractId: USDC_SAC,
    mechanism: "contract-transfer",
    enabled: !!USDC_SAC,
    envVar: "NEXT_PUBLIC_USDC_SAC",
    note: "USDC Stellar Asset Contract transfer via execute_as_admin.",
  },
  {
    key: "sep41",
    label: "Custom SEP-41 token",
    symbol: "SEP41",
    contractId: SEP41_TOKEN,
    mechanism: "contract-transfer",
    enabled: !!SEP41_TOKEN,
    envVar: "NEXT_PUBLIC_SEP41_TOKEN",
    note: "Custom Soroban SEP-41 token transfer via execute_as_admin.",
  },
];

export function getTokensForAccount(accountType: AccountType): TokenOption[] {
  return accountType === "G" ? G_TOKENS : C_TOKENS;
}

/**
 * Token choices for a *withdrawal* — the exchange's Classic (G) account sends
 * out to a user address. The send mechanism depends on the DESTINATION type:
 *
 *   - to a G address: XLM moves with a classic `payment` op; other assets move
 *     via their token contract's `transfer`.
 *   - to a C address: a contract can't be the destination of a classic payment,
 *     so EVERY asset (including XLM) moves via the token contract's `transfer`.
 */
const WITHDRAW_G_TOKENS: TokenOption[] = [
  {
    key: "xlm",
    label: "XLM (native)",
    symbol: "XLM",
    contractId: XLM_SAC,
    mechanism: "classic-native",
    enabled: true,
    note: "Classic payment operation from the exchange's G account straight to the user's G address.",
  },
  {
    key: "usdc",
    label: "USDC",
    symbol: "USDC",
    contractId: USDC_SAC,
    mechanism: "contract-transfer",
    enabled: !!USDC_SAC,
    envVar: "NEXT_PUBLIC_USDC_SAC",
    note: "Exchange G account invokes the USDC Stellar Asset Contract's transfer (from = exchange G).",
  },
  {
    key: "sep41",
    label: "Custom SEP-41 token",
    symbol: "SEP41",
    contractId: SEP41_TOKEN,
    mechanism: "contract-transfer",
    enabled: !!SEP41_TOKEN,
    envVar: "NEXT_PUBLIC_SEP41_TOKEN",
    note: "Exchange G account calls the SEP-41 token contract's transfer.",
  },
];

const WITHDRAW_C_TOKENS: TokenOption[] = [
  {
    key: "xlm",
    label: "XLM (SAC)",
    symbol: "XLM",
    contractId: XLM_SAC,
    mechanism: "contract-transfer",
    enabled: true,
    note: "A contract can't receive a classic payment, so XLM moves via its SAC transfer to the user's C address.",
  },
  {
    key: "usdc",
    label: "USDC (SAC)",
    symbol: "USDC",
    contractId: USDC_SAC,
    mechanism: "contract-transfer",
    enabled: !!USDC_SAC,
    envVar: "NEXT_PUBLIC_USDC_SAC",
    note: "Exchange G account invokes the USDC Stellar Asset Contract's transfer to the user's C address.",
  },
  {
    key: "sep41",
    label: "Custom SEP-41 token",
    symbol: "SEP41",
    contractId: SEP41_TOKEN,
    mechanism: "contract-transfer",
    enabled: !!SEP41_TOKEN,
    envVar: "NEXT_PUBLIC_SEP41_TOKEN",
    note: "Exchange G account calls the custom SEP-41 token's transfer to the user's C address.",
  },
];

/** Token choices for a withdrawal, keyed by the DESTINATION account type. */
export function getWithdrawalTokens(destType: AccountType): TokenOption[] {
  return destType === "G" ? WITHDRAW_G_TOKENS : WITHDRAW_C_TOKENS;
}

export function findWithdrawalToken(
  destType: AccountType,
  key: string
): TokenOption | undefined {
  return getWithdrawalTokens(destType).find((t) => t.key === key);
}

export function findToken(
  accountType: AccountType,
  key: string
): TokenOption | undefined {
  return getTokensForAccount(accountType).find((t) => t.key === key);
}

/** Every configured token contract id — the set we filter getEvents against. */
export function allTokenContractIds(): string[] {
  return Array.from(
    new Set([XLM_SAC, USDC_SAC, SEP41_TOKEN].filter(Boolean))
  );
}
