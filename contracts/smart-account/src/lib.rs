#![no_std]
//! The demo's user Contract (C) account — an OpenZeppelin smart account.
//!
//! This is the `NEXT_PUBLIC_USER_CONTRACT_C` source wallet. It is a thin
//! wrapper over `stellar_accounts::smart_account`, following the upstream
//! `examples/multisig-smart-account/account` contract:
//!
//! * `__constructor` installs a single `Default` context rule holding the
//!   signers (and optional policies) that may authorize anything this account
//!   does. The demo installs one `External` signer — an ed25519 public key
//!   paired with the `ed25519-verifier` contract — which makes it a 1-of-1.
//! * `__check_auth` delegates to `smart_account::do_check_auth`, so *every*
//!   outgoing call is really authorized. There is deliberately no admin
//!   bypass: the account has one door.
//! * `ExecutionEntryPoint::execute(target, target_fn, target_args)` is that
//!   door. It calls `require_auth()` on the account itself, so the invoking
//!   transaction must carry a `SorobanAuthorizationEntry` whose signature is
//!   an `AuthPayload`. Signers sign
//!   `sha256(signature_payload || xdr(context_rule_ids))`, not the raw host
//!   payload — the rule ids are bound into the digest so they cannot be
//!   swapped for a weaker rule after signatures are collected.
//!
//! The demo drives a token deposit as
//! `execute(<token contract>, "transfer", [self, <muxed exchange address>, amount])`.

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};

#[contract]
pub struct UserSmartAccount;

#[contractimpl]
impl UserSmartAccount {
    /// Installs the default context rule.
    ///
    /// # Arguments
    ///
    /// * `signers` - Signers (`External` or `Delegated`) allowed to authorize
    ///   any invocation made by this account.
    /// * `policies` - Policy contracts to install, mapped to their parameters.
    ///   The demo passes an empty map (1-of-1 needs no policy).
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "default"),
            None,
            &signers,
            &policies,
        );
    }
}

#[contractimpl]
impl CustomAccountInterface for UserSmartAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for UserSmartAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for UserSmartAccount {}
