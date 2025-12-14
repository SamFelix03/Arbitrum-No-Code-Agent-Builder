// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::{prelude::*, msg, block, evm, call::Call};

// Declare Solidity error types
sol! {
    error InvalidTokenAddress();
    error InvalidAmount();
    error InvalidAPY();
    error InvalidDepositId();
    error DepositNotActive();
    error OnlyDepositor();
    error InsufficientBalance();
}

/// Represents the ways methods may fail.
#[derive(SolidityError)]
pub enum YieldError {
    InvalidTokenAddress(InvalidTokenAddress),
    InvalidAmount(InvalidAmount),
    InvalidAPY(InvalidAPY),
    InvalidDepositId(InvalidDepositId),
    DepositNotActive(DepositNotActive),
    OnlyDepositor(OnlyDepositor),
    InsufficientBalance(InsufficientBalance),
}

// Declare Solidity event types
sol! {
    event DepositCreated(
        address indexed depositor,
        uint256 depositId,
        address indexed tokenAddress,
        uint256 amount,
        uint256 apy
    );
    event YieldCalculated(
        address indexed depositor,
        uint256 depositId,
        uint256 yieldAmount
    );
    event Withdrawn(
        address indexed to,
        uint256 depositId,
        uint256 amount
    );
}

sol_storage! {
    #[entrypoint]
    pub struct YieldCalculator {
        address owner;
        address contract_addr;
        Deposit[] deposits;
        mapping(address => uint256[]) user_deposits;
        uint256 total_deposits;
        uint256 total_yield_generated;
    }
}

sol_storage! {
    pub struct Deposit {
        address depositor;
        address token_address;
        uint256 amount;
        uint256 apy;
        uint256 deposit_time;
        bool active;
    }
}

// ERC20 interface for token transfers
sol_interface! {
    interface IERC20 {
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
        function transfer(address to, uint256 amount) external returns (bool);
        function balanceOf(address account) external view returns (uint256);
    }
}

#[public]
impl YieldCalculator {
    /// Constructor - initializes the contract
    pub fn init(&mut self, initial_owner: Address, contract_address: Address) -> Result<(), YieldError> {
        self.owner.set(initial_owner);
        self.contract_addr.set(contract_address);
        Ok(())
    }

    /// Get owner address
    pub fn owner(&self) -> Result<Address, YieldError> {
        Ok(self.owner.get())
    }

    /// Create a new deposit with specified APY using ANY ERC20 token
    /// Note: User must approve this contract to spend tokens first
    pub fn create_deposit(
        &mut self,
        token_address: Address,
        amount: U256,
        apy: U256,
    ) -> Result<U256, YieldError> {
        if token_address == Address::ZERO {
            return Err(YieldError::InvalidTokenAddress(InvalidTokenAddress {}));
        }
        if amount == U256::ZERO {
            return Err(YieldError::InvalidAmount(InvalidAmount {}));
        }
        if apy == U256::ZERO || apy > U256::from(10000) {
            return Err(YieldError::InvalidAPY(InvalidAPY {}));
        }

        let depositor = msg::sender();
        // Get contract address from storage (set during init)
        let contract_address = self.contract_addr.get();

        // Transfer tokens from user to contract using ERC20 interface
        // Note: This requires the token contract to exist and user to have approved this contract
        let token = IERC20::new(token_address);
        token
            .transfer_from(Call::new_in(self), depositor, contract_address, amount)
            .map_err(|_| YieldError::InsufficientBalance(InsufficientBalance {}))?;

        let deposit_id = U256::from(self.deposits.len());
        let timestamp = U256::from(block::timestamp());

        // Use grow() to add a new deposit to the array
        let mut deposit = self.deposits.grow();
        deposit.depositor.set(depositor);
        deposit.token_address.set(token_address);
        deposit.amount.set(amount);
        deposit.apy.set(apy);
        deposit.deposit_time.set(timestamp);
        deposit.active.set(true);

        self.user_deposits.setter(depositor).push(deposit_id);
        self.total_deposits.set(self.total_deposits.get() + amount);

        evm::log(DepositCreated {
            depositor,
            depositId: deposit_id,
            tokenAddress: token_address,
            amount,
            apy,
        });

        Ok(deposit_id)
    }

    /// Calculate yield for a deposit after a given time period
    pub fn calculate_yield(
        &self,
        deposit_id: U256,
        time_in_seconds: U256,
    ) -> Result<U256, YieldError> {
        let deposit_id_usize = deposit_id.to::<u64>() as usize;
        if deposit_id_usize >= self.deposits.len() {
            return Err(YieldError::InvalidDepositId(InvalidDepositId {}));
        }

        let deposit = self.deposits.getter(deposit_id_usize)
            .ok_or(YieldError::InvalidDepositId(InvalidDepositId {}))?;
        if !deposit.active.get() {
            return Err(YieldError::DepositNotActive(DepositNotActive {}));
        }

        // Calculate yield: amount * (apy / 10000) * (timeInSeconds / 31536000)
        // 31536000 = seconds in a year
        let seconds_per_year = U256::from(31536000u64);
        let apy_basis_points = deposit.apy.get();
        let amount = deposit.amount.get();

        let yield_amount = (amount * apy_basis_points * time_in_seconds)
            / (U256::from(10000) * seconds_per_year);

        Ok(yield_amount)
    }

    /// Get current yield for a deposit (based on actual time passed)
    pub fn get_current_yield(&self, deposit_id: U256) -> Result<U256, YieldError> {
        let deposit_id_usize = deposit_id.to::<u64>() as usize;
        if deposit_id_usize >= self.deposits.len() {
            return Err(YieldError::InvalidDepositId(InvalidDepositId {}));
        }

        let deposit = self.deposits.getter(deposit_id_usize)
            .ok_or(YieldError::InvalidDepositId(InvalidDepositId {}))?;
        if !deposit.active.get() {
            return Err(YieldError::DepositNotActive(DepositNotActive {}));
        }

        let time_passed = U256::from(block::timestamp()) - deposit.deposit_time.get();
        self.calculate_yield(deposit_id, time_passed)
    }

    /// Get total amount (principal + yield) for a deposit
    pub fn get_total_amount(&self, deposit_id: U256) -> Result<U256, YieldError> {
        let deposit_id_usize = deposit_id.to::<u64>() as usize;
        if deposit_id_usize >= self.deposits.len() {
            return Err(YieldError::InvalidDepositId(InvalidDepositId {}));
        }

        let deposit = self.deposits.getter(deposit_id_usize)
            .ok_or(YieldError::InvalidDepositId(InvalidDepositId {}))?;
        if !deposit.active.get() {
            return Err(YieldError::DepositNotActive(DepositNotActive {}));
        }

        let yield_amount = self.get_current_yield(deposit_id)?;
        Ok(deposit.amount.get() + yield_amount)
    }

    /// Withdraw a deposit (principal + accrued yield)
    pub fn withdraw(&mut self, deposit_id: U256) -> Result<(), YieldError> {
        let deposit_id_usize = deposit_id.to::<u64>() as usize;
        if deposit_id_usize >= self.deposits.len() {
            return Err(YieldError::InvalidDepositId(InvalidDepositId {}));
        }

        // Get all info first before any mutable borrows
        let deposit_info = self.get_deposit_info(deposit_id)?;
        let (depositor, token_address, deposit_amount, _apy, _deposit_time, is_active) = deposit_info;
        
        if !is_active {
            return Err(YieldError::DepositNotActive(DepositNotActive {}));
        }

        if depositor != msg::sender() {
            return Err(YieldError::OnlyDepositor(OnlyDepositor {}));
        }

        // Get yield amount
        let yield_amount = self.get_current_yield(deposit_id)?;
        let total_amount = deposit_amount + yield_amount;

        // Get contract address from storage
        let contract_address = self.contract_addr.get();

        // Check contract balance (view call - use Call::new() to avoid moving self)
        let token = IERC20::new(token_address);
        let balance = token
            .balance_of(Call::new(), contract_address)
            .map_err(|_| YieldError::InsufficientBalance(InsufficientBalance {}))?;

        if balance < total_amount {
            return Err(YieldError::InsufficientBalance(InsufficientBalance {}));
        }

        // Now take mutable borrow to update deposit
        let mut deposit = self.deposits.setter(deposit_id_usize)
            .ok_or(YieldError::InvalidDepositId(InvalidDepositId {}))?;
        deposit.active.set(false);
        self.total_deposits.set(self.total_deposits.get() - deposit_amount);
        self.total_yield_generated
            .set(self.total_yield_generated.get() + yield_amount);

        // Transfer tokens back to user
        token
            .transfer(Call::new_in(self), depositor, total_amount)
            .map_err(|_| YieldError::InsufficientBalance(InsufficientBalance {}))?;

        evm::log(Withdrawn {
            to: depositor,
            depositId: deposit_id,
            amount: total_amount,
        });

        Ok(())
    }

    /// Get all deposit IDs for a user
    pub fn get_user_deposits(&self, user: Address) -> Result<Vec<U256>, YieldError> {
        let user_deposits = self.user_deposits.getter(user);
        let len = user_deposits.len();
        let mut deposits = Vec::with_capacity(len);
        for i in 0..len {
            deposits.push(user_deposits.get(i).unwrap());
        }
        Ok(deposits)
    }

    /// Get deposit information
    pub fn get_deposit_info(
        &self,
        deposit_id: U256,
    ) -> Result<(Address, Address, U256, U256, U256, bool), YieldError> {
        let deposit_id_usize = deposit_id.to::<u64>() as usize;
        if deposit_id_usize >= self.deposits.len() {
            return Err(YieldError::InvalidDepositId(InvalidDepositId {}));
        }

        let deposit = self.deposits.getter(deposit_id_usize)
            .ok_or(YieldError::InvalidDepositId(InvalidDepositId {}))?;
        Ok((
            deposit.depositor.get(),
            deposit.token_address.get(),
            deposit.amount.get(),
            deposit.apy.get(),
            deposit.deposit_time.get(),
            deposit.active.get(),
        ))
    }

    /// Get the token address for a specific deposit
    pub fn get_deposit_token_address(&self, deposit_id: U256) -> Result<Address, YieldError> {
        let deposit_id_usize = deposit_id.to::<u64>() as usize;
        if deposit_id_usize >= self.deposits.len() {
            return Err(YieldError::InvalidDepositId(InvalidDepositId {}));
        }

        Ok(self.deposits.getter(deposit_id_usize)
            .ok_or(YieldError::InvalidDepositId(InvalidDepositId {}))?
            .token_address.get())
    }

    /// Get contract statistics
    pub fn get_stats(
        &self,
    ) -> Result<(U256, U256, U256), YieldError> {
        Ok((
            self.total_deposits.get(),
            self.total_yield_generated.get(),
            U256::from(self.deposits.len()),
        ))
    }
}
