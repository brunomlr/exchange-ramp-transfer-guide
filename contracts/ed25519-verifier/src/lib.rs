#![no_std]
//! Ed25519 verifier for the demo's OpenZeppelin smart account.
//!
//! A verifier is a stateless, reusable "cryptographic oracle": the smart
//! account hands it a payload, a public key and a signature, and it answers
//! whether the signature is valid. Keeping it in its own contract means many
//! smart accounts can share one deployment.
//!
//! This is OpenZeppelin's `stellar_accounts::verifiers::ed25519` wired up as a
//! contract — the same shape as the upstream
//! `examples/multisig-smart-account/ed25519-verifier`.

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec};
use stellar_accounts::verifiers::{ed25519, Verifier};

#[contract]
pub struct Ed25519Verifier;

#[contractimpl]
impl Verifier for Ed25519Verifier {
    type KeyData = BytesN<32>;
    type SigData = BytesN<64>;

    fn verify(
        e: &Env,
        signature_payload: Bytes,
        key_data: BytesN<32>,
        sig_data: BytesN<64>,
    ) -> bool {
        ed25519::verify(e, &signature_payload, &key_data, &sig_data)
    }

    fn canonicalize_key(e: &Env, key_data: BytesN<32>) -> Bytes {
        ed25519::canonicalize_key(e, &key_data)
    }

    fn batch_canonicalize_key(e: &Env, keys_data: Vec<BytesN<32>>) -> Vec<Bytes> {
        ed25519::batch_canonicalize_key(e, &keys_data)
    }
}
