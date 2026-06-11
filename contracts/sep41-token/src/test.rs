#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, MuxedAddress as _};
use soroban_sdk::{Address, Env, MuxedAddress, String};

fn setup() -> (Env, Sep41TokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(
        Sep41Token,
        (
            admin.clone(),
            7u32,
            String::from_str(&env, "Demo Token"),
            String::from_str(&env, "DEMO"),
        ),
    );
    let client = Sep41TokenClient::new(&env, &contract_id);
    (env, client, admin)
}

#[test]
fn mint_and_metadata() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);

    client.mint(&user, &1_000_0000000i128);
    assert_eq!(client.balance(&user), 1_000_0000000i128);
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.name(), String::from_str(&env, "Demo Token"));
    assert_eq!(client.symbol(), String::from_str(&env, "DEMO"));
}

#[test]
fn transfer_moves_balance() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    client.mint(&a, &100i128);
    client.transfer(&a, &MuxedAddress::from(b.clone()), &30i128);
    assert_eq!(client.balance(&a), 70i128);
    assert_eq!(client.balance(&b), 30i128);
}

#[test]
fn transfer_to_muxed_credits_base_address() {
    // The regression that broke the live send: a muxed `M…` destination must not
    // trap, must credit the BASE address, and must surface the mux id in the event.
    let (env, client, _admin) = setup();
    let from = Address::generate(&env);
    client.mint(&from, &100i128);

    // Account-based muxed address (M…); only accounts can be multiplexed.
    let muxed = MuxedAddress::generate(&env);
    let base = muxed.address();
    client.transfer(&from, &muxed, &40i128);

    // Balance credited to the base address, not a separate muxed identity.
    assert_eq!(client.balance(&base), 40i128);
    assert_eq!(client.balance(&from), 60i128);
}

#[test]
fn approve_and_transfer_from() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let dest = Address::generate(&env);

    client.mint(&owner, &100i128);
    client.approve(&owner, &spender, &40i128, &(env.ledger().sequence() + 1000));
    assert_eq!(client.allowance(&owner, &spender), 40i128);

    client.transfer_from(&spender, &owner, &dest, &25i128);
    assert_eq!(client.balance(&dest), 25i128);
    assert_eq!(client.allowance(&owner, &spender), 15i128);
}
