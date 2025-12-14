// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use stylus_sdk::{
    prelude::*,
    alloy_primitives::{Address, U256},
    storage::*,
    call::transfer_eth,
    msg,
    block,
    contract,
    evm,
};
use alloy_sol_types::sol;

// Declare Solidity event types
sol! {
    event AirdropExecuted(
        address indexed executor,
        address[] recipients,
        uint256 amount,
        uint256 totalAmount,
        uint256 timestamp
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
}

#[storage]
#[entrypoint]
pub struct Airdrop {
    owner: StorageAddress,
}

#[public]
impl Airdrop {
    /// Gets the owner address
    pub fn owner(&self) -> Result<Address, Vec<u8>> {
        Ok(self.owner.get())
    }

    /// Constructor - sets the contract owner
    pub fn init(&mut self) -> Result<(), Vec<u8>> {
        let sender = msg::sender();
        self.owner.set(sender);
        evm::log(OwnershipTransferred {
            previousOwner: Address::ZERO,
            newOwner: sender,
        });
        Ok(())
    }

    /// Transfer ownership of the contract to a new account
    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        if msg::sender() != self.owner.get() {
            return Err(b"NotOwner".to_vec());
        }
        if new_owner == Address::ZERO {
            return Err(b"InvalidRecipient".to_vec());
        }
        let old_owner = self.owner.get();
        self.owner.set(new_owner);
        evm::log(OwnershipTransferred {
            previousOwner: old_owner,
            newOwner: new_owner,
        });
        Ok(())
    }

    /// Execute airdrop to multiple addresses with the same amount
    #[payable]
    pub fn airdrop(
        &mut self,
        recipients: Vec<Address>,
        amount: U256,
    ) -> Result<(), Vec<u8>> {
        if recipients.is_empty() {
            return Err(b"InvalidRecipient".to_vec());
        }
        if amount == U256::ZERO {
            return Err(b"InvalidAmount".to_vec());
        }

        let total_amount = amount
            .checked_mul(U256::from(recipients.len()))
            .ok_or_else(|| b"IncorrectPayment".to_vec())?;

        let msg_value = msg::value();
        if msg_value != total_amount {
            return Err(b"IncorrectPayment".to_vec());
        }

        // Batch transfer using transfer_eth
        for recipient in &recipients {
            if *recipient == Address::ZERO {
                return Err(b"InvalidRecipient".to_vec());
            }
            transfer_eth(*recipient, amount)?;
        }

        let timestamp = U256::from(block::timestamp());
        evm::log(AirdropExecuted {
            executor: msg::sender(),
            recipients: recipients.clone(),
            amount,
            totalAmount: total_amount,
            timestamp,
        });

        Ok(())
    }

    /// Execute airdrop to multiple addresses with different amounts
    #[payable]
    pub fn airdrop_with_amounts(
        &mut self,
        recipients: Vec<Address>,
        amounts: Vec<U256>,
    ) -> Result<(), Vec<u8>> {
        if recipients.is_empty() {
            return Err(b"InvalidRecipient".to_vec());
        }
        if recipients.len() != amounts.len() {
            return Err(b"ArraysLengthMismatch".to_vec());
        }

        let mut total_amount = U256::ZERO;
        for amount in &amounts {
            if *amount == U256::ZERO {
                return Err(b"InvalidAmount".to_vec());
            }
            total_amount = total_amount
                .checked_add(*amount)
                .ok_or_else(|| b"IncorrectPayment".to_vec())?;
        }

        let msg_value = msg::value();
        if msg_value != total_amount {
            return Err(b"IncorrectPayment".to_vec());
        }

        // Batch transfer using transfer_eth
        for (i, recipient) in recipients.iter().enumerate() {
            if *recipient == Address::ZERO {
                return Err(b"InvalidRecipient".to_vec());
            }
            transfer_eth(*recipient, amounts[i])?;
        }

        let timestamp = U256::from(block::timestamp());
        evm::log(AirdropExecuted {
            executor: msg::sender(),
            recipients: recipients.clone(),
            amount: U256::ZERO, // Using 0 as placeholder since amounts vary
            totalAmount: total_amount,
            timestamp,
        });

        Ok(())
    }

    /// Withdraw any accidental balance (emergency function for owner only)
    pub fn withdraw(&mut self, to: Address) -> Result<(), Vec<u8>> {
        if msg::sender() != self.owner.get() {
            return Err(b"NotOwner".to_vec());
        }
        if to == Address::ZERO {
            return Err(b"InvalidRecipient".to_vec());
        }

        let balance = contract::balance();
        if balance == U256::ZERO {
            return Err(b"NoBalanceToWithdraw".to_vec());
        }

        transfer_eth(to, balance)?;
        Ok(())
    }

    /// Get contract balance
    pub fn get_balance(&self) -> Result<U256, Vec<u8>> {
        Ok(contract::balance())
    }
}
