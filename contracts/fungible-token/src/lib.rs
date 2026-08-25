#![no_std]
//! The demo's custom SEP-41 token, built on OpenZeppelin `stellar-tokens`.
//!
//! `NEXT_PUBLIC_SEP41_TOKEN` points at a deployment of this contract. It is
//! the "Custom SEP-41 token" option in the simulator, used from both the
//! Classic (G) and Contract (C) source accounts.
//!
//! Everything SEP-41 comes from OpenZeppelin's `Base` contract type via the
//! `FungibleToken` / `FungibleBurnable` traits; ownership comes from
//! `stellar_access::ownable`. The only bespoke function is `mint`, which
//! SEP-41 does not standardize.
//!
//! What matters for this demo is that `Base::transfer` takes a `MuxedAddress`
//! and emits the CAP-67 unified event:
//!
//! * plain `G…`/`C…` destination → topics `["transfer", from, to]`, data `i128`
//! * muxed `M…` destination      → same topics, data
//!   `{ amount: i128, to_muxed_id: Option<u64> }`
//!
//! which is exactly what `lib/events.ts` matches the deposit id against.

use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress, String};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_macros::only_owner;
use stellar_tokens::fungible::{burnable::FungibleBurnable, Base, FungibleToken};

#[contract]
pub struct DemoToken;

#[contractimpl]
impl DemoToken {
    /// Atomic init at deploy time. `owner` is the only address allowed to mint.
    pub fn __constructor(e: &Env, owner: Address, decimals: u32, name: String, symbol: String) {
        Base::set_metadata(e, decimals, name, symbol);
        set_owner(e, &owner);
    }

    /// Mint `amount` of new tokens to `to`. Owner only.
    ///
    /// Not part of SEP-41 — the standard leaves minting to the implementation.
    #[only_owner]
    pub fn mint(e: &Env, to: Address, amount: i128) {
        Base::mint(e, &to, amount);
    }
}

#[contractimpl(contracttrait)]
impl Ownable for DemoToken {}

#[contractimpl(contracttrait)]
impl FungibleToken for DemoToken {
    type ContractType = Base;
}

#[contractimpl(contracttrait)]
impl FungibleBurnable for DemoToken {}
