#![no_std]
//! Minimal custom SEP-41 fungible token for the Exchange Deposit Simulator (testnet demo).
//!
//! Implements the full SEP-41 token interface (allowance/approve/balance/transfer/
//! transfer_from/burn/burn_from/decimals/name/symbol) plus an admin `mint`/`set_admin`.
//! Events follow the standard Stellar token event shape so they show up as `transfer`
//! events for the simulator's RPC `getEvents` detection.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Map,
    MuxedAddress, String, Symbol, Val,
};

const DAY_IN_LEDGERS: u32 = 17280; // ~1 day at 5s ledgers
const INSTANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;
const BALANCE_BUMP: u32 = 30 * DAY_IN_LEDGERS;
const BALANCE_THRESHOLD: u32 = BALANCE_BUMP - DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NegativeAmount = 1,
    InsufficientBalance = 2,
    InsufficientAllowance = 3,
    AllowanceExpired = 4,
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceKey {
    pub from: Address,
    pub spender: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct Metadata {
    pub decimals: u32,
    pub name: String,
    pub symbol: String,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Metadata,
    Balance(Address),
    Allowance(AllowanceKey),
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}

fn read_balance(env: &Env, addr: &Address) -> i128 {
    let key = DataKey::Balance(addr.clone());
    if let Some(bal) = env.storage().persistent().get::<DataKey, i128>(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, BALANCE_THRESHOLD, BALANCE_BUMP);
        bal
    } else {
        0
    }
}

fn write_balance(env: &Env, addr: &Address, amount: i128) {
    let key = DataKey::Balance(addr.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, BALANCE_THRESHOLD, BALANCE_BUMP);
}

fn receive_balance(env: &Env, addr: &Address, amount: i128) {
    let balance = read_balance(env, addr);
    write_balance(env, addr, balance + amount);
}

fn spend_balance(env: &Env, addr: &Address, amount: i128) -> Result<(), Error> {
    let balance = read_balance(env, addr);
    if balance < amount {
        return Err(Error::InsufficientBalance);
    }
    write_balance(env, addr, balance - amount);
    Ok(())
}

fn read_allowance(env: &Env, from: &Address, spender: &Address) -> AllowanceValue {
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    env.storage()
        .temporary()
        .get::<DataKey, AllowanceValue>(&key)
        .unwrap_or(AllowanceValue {
            amount: 0,
            expiration_ledger: 0,
        })
}

fn write_allowance(
    env: &Env,
    from: &Address,
    spender: &Address,
    amount: i128,
    expiration_ledger: u32,
) {
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    let value = AllowanceValue {
        amount,
        expiration_ledger,
    };
    env.storage().temporary().set(&key, &value);
    if amount > 0 {
        let live_for = expiration_ledger
            .checked_sub(env.ledger().sequence())
            .unwrap_or(0);
        if live_for > 0 {
            env.storage()
                .temporary()
                .extend_ttl(&key, live_for, live_for);
        }
    }
}

fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) -> Result<(), Error> {
    let allowance = read_allowance(env, from, spender);
    if allowance.amount < amount {
        return Err(Error::InsufficientAllowance);
    }
    if allowance.expiration_ledger < env.ledger().sequence() {
        return Err(Error::AllowanceExpired);
    }
    write_allowance(
        env,
        from,
        spender,
        allowance.amount - amount,
        allowance.expiration_ledger,
    );
    Ok(())
}

fn read_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn read_metadata(env: &Env) -> Metadata {
    env.storage().instance().get(&DataKey::Metadata).unwrap()
}

fn check_nonnegative(amount: i128) -> Result<(), Error> {
    if amount < 0 {
        Err(Error::NegativeAmount)
    } else {
        Ok(())
    }
}

#[contract]
pub struct Sep41Token;

#[contractimpl]
impl Sep41Token {
    /// Atomic init at deploy time. `admin` controls mint/set_admin.
    pub fn __constructor(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(
            &DataKey::Metadata,
            &Metadata {
                decimals,
                name,
                symbol,
            },
        );
        bump_instance(&env);
    }

    // ----- Admin -----

    /// Mint `amount` of new tokens to `to`. Requires admin authorization.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        check_nonnegative(amount)?;
        let admin = read_admin(&env);
        admin.require_auth();
        bump_instance(&env);

        receive_balance(&env, &to, amount);
        env.events()
            .publish((symbol_short!("mint"), admin, to), amount);
        Ok(())
    }

    /// Transfer admin rights to `new_admin`. Requires current admin authorization.
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin = read_admin(&env);
        admin.require_auth();
        bump_instance(&env);

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.events()
            .publish((symbol_short!("set_admin"), admin), new_admin);
    }

    pub fn admin(env: Env) -> Address {
        read_admin(&env)
    }

    // ----- SEP-41 interface -----

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let allowance = read_allowance(&env, &from, &spender);
        if allowance.expiration_ledger < env.ledger().sequence() {
            0
        } else {
            allowance.amount
        }
    }

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) -> Result<(), Error> {
        check_nonnegative(amount)?;
        from.require_auth();
        bump_instance(&env);

        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            return Err(Error::AllowanceExpired);
        }
        write_allowance(&env, &from, &spender, amount, expiration_ledger);
        env.events().publish(
            (symbol_short!("approve"), from, spender),
            (amount, expiration_ledger),
        );
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        read_balance(&env, &id)
    }

    /// Transfer `amount` from `from` to `to`. `to` is a `MuxedAddress`, so it
    /// accepts a plain `G…`/`C…` address or a muxed `M…` address (CAP-67).
    ///
    /// Emits the standard SEP-41 transfer event:
    /// * topics `["transfer", from: Address, to: Address]` (the base address)
    /// * data `amount: i128`                         when `to` is not muxed
    /// * data `{ to_muxed_id: u64, amount: i128 }`   when `to` carries a mux id
    pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) -> Result<(), Error> {
        check_nonnegative(amount)?;
        from.require_auth();
        bump_instance(&env);

        let to_base = to.address();
        spend_balance(&env, &from, amount)?;
        receive_balance(&env, &to_base, amount);

        let topics = (symbol_short!("transfer"), from, to_base);
        match to.id() {
            Some(id) => {
                let mut data = Map::<Symbol, Val>::new(&env);
                data.set(symbol_short!("amount"), amount.into_val(&env));
                data.set(Symbol::new(&env, "to_muxed_id"), id.into_val(&env));
                env.events().publish(topics, data);
            }
            None => {
                env.events().publish(topics, amount);
            }
        }
        Ok(())
    }

    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        check_nonnegative(amount)?;
        spender.require_auth();
        bump_instance(&env);

        spend_allowance(&env, &from, &spender, amount)?;
        spend_balance(&env, &from, amount)?;
        receive_balance(&env, &to, amount);
        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);
        Ok(())
    }

    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        check_nonnegative(amount)?;
        from.require_auth();
        bump_instance(&env);

        spend_balance(&env, &from, amount)?;
        env.events()
            .publish((symbol_short!("burn"), from), amount);
        Ok(())
    }

    pub fn burn_from(
        env: Env,
        spender: Address,
        from: Address,
        amount: i128,
    ) -> Result<(), Error> {
        check_nonnegative(amount)?;
        spender.require_auth();
        bump_instance(&env);

        spend_allowance(&env, &from, &spender, amount)?;
        spend_balance(&env, &from, amount)?;
        env.events()
            .publish((symbol_short!("burn"), from), amount);
        Ok(())
    }

    pub fn decimals(env: Env) -> u32 {
        read_metadata(&env).decimals
    }

    pub fn name(env: Env) -> String {
        read_metadata(&env).name
    }

    pub fn symbol(env: Env) -> String {
        read_metadata(&env).symbol
    }
}

mod test;
