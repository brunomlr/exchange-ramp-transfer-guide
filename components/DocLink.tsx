import { cn } from "@/lib/utils";

/**
 * Canonical Stellar documentation targets for the technical terms used across
 * the app. Each URL was verified to exist and to actually cover the term it's
 * mapped to — keep that invariant if you add more.
 */
export const DOC_URLS = {
  /** CAP-67 — "Unified Asset Events" (the protocol spec itself). */
  cap67:
    "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md",
  /** Stellar Asset Contract (SAC). */
  sac: "https://developers.stellar.org/docs/tokens/stellar-asset-contract",
  /** SEP-41 token interface for contract tokens. */
  sep41: "https://developers.stellar.org/docs/tokens/token-interface",
  /** Soroban smart contracts overview. */
  soroban: "https://developers.stellar.org/docs/build/smart-contracts/overview",
  /** Muxed accounts & memos for pooled/custodial accounts. */
  muxed:
    "https://developers.stellar.org/docs/build/guides/transactions/pooled-accounts-muxed-accounts-memos",
  /** Same page covers memos. */
  memo: "https://developers.stellar.org/docs/build/guides/transactions/pooled-accounts-muxed-accounts-memos",
  /** Stellar RPC API. */
  rpc: "https://developers.stellar.org/docs/data/apis/rpc",
  /** Horizon API (legacy). */
  horizon: "https://developers.stellar.org/docs/data/apis/horizon",
  /** Soroban authorization (require_auth). */
  requireAuth:
    "https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization",
  /** RPC getEvents method. */
  getEvents:
    "https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents",
  /** RPC sendTransaction method. */
  sendTransaction:
    "https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/sendTransaction",
  /** Lumens (XLM), the native asset. */
  lumens: "https://developers.stellar.org/docs/learn/fundamentals/lumens",
} as const;

export type DocKey = keyof typeof DOC_URLS;

/**
 * A technical term rendered with a dashed underline that links out to the
 * relevant Stellar docs page. Used inline in explanatory copy for terms like
 * SAC, CAP-67, SEP-41, Soroban, muxed accounts, etc.
 *
 * Pass `code` to render the term in the monospace font (for API method names
 * and identifiers such as `getEvents` or `require_auth`).
 */
export function DocLink({
  doc,
  children,
  code,
  className,
}: {
  doc: DocKey;
  children: React.ReactNode;
  code?: boolean;
  className?: string;
}) {
  return (
    <a
      href={DOC_URLS[doc]}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "underline decoration-dashed decoration-muted-foreground/60 underline-offset-4 transition-colors hover:decoration-primary hover:text-primary",
        code && "font-mono",
        className
      )}
    >
      {children}
    </a>
  );
}
