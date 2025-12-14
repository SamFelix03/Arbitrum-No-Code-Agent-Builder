// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::{prelude::*, msg, evm};

// Declare Solidity error types
sol! {
    error NotOwner();
    error NotApproved();
    error InvalidTokenId();
    error Paused();
    error NotPaused();
    error TransferToZero();
}

/// Represents the ways methods may fail.
#[derive(SolidityError)]
pub enum NFTError {
    NotOwner(NotOwner),
    NotApproved(NotApproved),
    InvalidTokenId(InvalidTokenId),
    Paused(Paused),
    NotPaused(NotPaused),
    TransferToZero(TransferToZero),
}

// Declare Solidity event types
sol! {
    event Transfer(address indexed from, address indexed to, uint256 indexed token_id);
    event Approval(address indexed owner, address indexed approved, uint256 indexed token_id);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event TokenPaused(address account);
    event TokenUnpaused(address account);
    event BaseURIUpdated(string newBaseURI);
}

sol_storage! {
    #[entrypoint]
    pub struct MyNFT {
        mapping(uint256 => address) owners;
        mapping(address => uint256) balances;
        mapping(uint256 => address) token_approvals;
        mapping(address => mapping(address => bool)) operator_approvals;
        uint256 total_supply;
        uint256 next_token_id;
        address owner;
        bool paused;
        string name;
        string symbol;
        string base_token_uri;
    }
}

#[public]
impl MyNFT {
    /// Constructor - initializes the NFT collection
    pub fn init(&mut self, name: String, symbol: String, base_uri: String) -> Result<(), NFTError> {
        let sender = msg::sender();
        self.owner.set(sender);
        self.paused.set(false);
        self.name.set_str(name);
        self.symbol.set_str(symbol);
        self.base_token_uri.set_str(base_uri);
        self.next_token_id.set(U256::from(1)); // Start token IDs from 1
        Ok(())
    }

    /// Returns the collection name
    pub fn name(&self) -> Result<String, NFTError> {
        Ok(self.name.get_string())
    }

    /// Returns the collection symbol
    pub fn symbol(&self) -> Result<String, NFTError> {
        Ok(self.symbol.get_string())
    }

    /// Returns the total supply
    pub fn total_supply(&self) -> Result<U256, NFTError> {
        Ok(self.total_supply.get())
    }

    /// Returns the balance of an account
    pub fn balance_of(&self, owner: Address) -> Result<U256, NFTError> {
        Ok(self.balances.get(owner))
    }

    /// Returns the owner of a token
    pub fn owner_of(&self, token_id: U256) -> Result<Address, NFTError> {
        let owner = self.owners.get(token_id);
        if owner == Address::ZERO {
            return Err(NFTError::InvalidTokenId(InvalidTokenId {}));
        }
        Ok(owner)
    }

    /// Returns the approved address for a token
    pub fn get_approved(&self, token_id: U256) -> Result<Address, NFTError> {
        Ok(self.token_approvals.get(token_id))
    }

    /// Returns whether an operator is approved for all tokens of an owner
    pub fn is_approved_for_all(&self, owner: Address, operator: Address) -> Result<bool, NFTError> {
        Ok(self.operator_approvals.getter(owner).get(operator))
    }

    /// Returns the owner address
    pub fn owner(&self) -> Result<Address, NFTError> {
        Ok(self.owner.get())
    }

    /// Returns true if the contract is paused
    pub fn paused(&self) -> Result<bool, NFTError> {
        Ok(self.paused.get())
    }

    /// Returns the base URI
    pub fn base_uri(&self) -> Result<String, NFTError> {
        Ok(self.base_token_uri.get_string())
    }


    /// Mint a new NFT to the specified address (only owner can call)
    pub fn mint(&mut self, to: Address) -> Result<U256, NFTError> {
        if msg::sender() != self.owner.get() {
            return Err(NFTError::NotOwner(NotOwner {}));
        }
        if to == Address::ZERO {
            return Err(NFTError::TransferToZero(TransferToZero {}));
        }

        let token_id = self.next_token_id.get();
        self.next_token_id.set(token_id + U256::from(1));

        self.owners.insert(token_id, to);
        let mut balance = self.balances.setter(to);
        let current_balance = balance.get();
        balance.set(current_balance + U256::from(1));
        self.total_supply.set(self.total_supply.get() + U256::from(1));

        evm::log(Transfer {
            from: Address::ZERO,
            to,
            token_id,
        });

        Ok(token_id)
    }


    /// Transfer from
    pub fn transfer_from(
        &mut self,
        from: Address,
        to: Address,
        token_id: U256,
    ) -> Result<(), NFTError> {
        if self.paused.get() {
            return Err(NFTError::Paused(Paused {}));
        }
        if to == Address::ZERO {
            return Err(NFTError::TransferToZero(TransferToZero {}));
        }

        self.require_authorized_to_spend(from, token_id)?;
        self._transfer(from, to, token_id)?;
        Ok(())
    }

    /// Safe transfer from (without data)
    pub fn safe_transfer_from(
        &mut self,
        from: Address,
        to: Address,
        token_id: U256,
    ) -> Result<(), NFTError> {
        self.transfer_from(from, to, token_id)?;
        // Note: In a full implementation, we'd check if 'to' is a contract and call onERC721Received
        Ok(())
    }

    /// Safe transfer from (with data)
    pub fn safe_transfer_from_with_data(
        &mut self,
        from: Address,
        to: Address,
        token_id: U256,
        _data: Vec<u8>,
    ) -> Result<(), NFTError> {
        self.transfer_from(from, to, token_id)?;
        // Note: In a full implementation, we'd check if 'to' is a contract and call onERC721Received
        Ok(())
    }

    /// Approve
    pub fn approve(&mut self, approved: Address, token_id: U256) -> Result<(), NFTError> {
        let owner = self.owner_of(token_id)?;
        let msg_sender = msg::sender();
        if msg_sender != owner
            && !self.operator_approvals.getter(owner).get(msg_sender)
        {
            return Err(NFTError::NotOwner(NotOwner {}));
        }

        self.token_approvals.insert(token_id, approved);
        evm::log(Approval {
            owner,
            approved,
            token_id,
        });
        Ok(())
    }

    /// Set approval for all
    pub fn set_approval_for_all(
        &mut self,
        operator: Address,
        approved: bool,
    ) -> Result<(), NFTError> {
        let owner = msg::sender();
        self.operator_approvals.setter(owner).insert(operator, approved);
        evm::log(ApprovalForAll {
            owner,
            operator,
            approved,
        });
        Ok(())
    }

    /// Burn token
    pub fn burn(&mut self, token_id: U256) -> Result<(), NFTError> {
        let owner = self.owner_of(token_id)?;
        let msg_sender = msg::sender();
        if msg_sender != owner
            && !self.operator_approvals.getter(owner).get(msg_sender)
        {
            return Err(NFTError::NotOwner(NotOwner {}));
        }

        self.owners.delete(token_id);
        let mut balance = self.balances.setter(owner);
        let current_balance = balance.get();
        balance.set(current_balance - U256::from(1));
        self.total_supply.set(self.total_supply.get() - U256::from(1));
        self.token_approvals.delete(token_id);

        evm::log(Transfer {
            from: owner,
            to: Address::ZERO,
            token_id,
        });

        Ok(())
    }

    /// Pause transfers (owner only)
    pub fn pause(&mut self) -> Result<(), NFTError> {
        if msg::sender() != self.owner.get() {
            return Err(NFTError::NotOwner(NotOwner {}));
        }
        if self.paused.get() {
            return Err(NFTError::Paused(Paused {}));
        }
        self.paused.set(true);
        evm::log(TokenPaused {
            account: msg::sender(),
        });
        Ok(())
    }

    /// Unpause transfers (owner only)
    pub fn unpause(&mut self) -> Result<(), NFTError> {
        if msg::sender() != self.owner.get() {
            return Err(NFTError::NotOwner(NotOwner {}));
        }
        if !self.paused.get() {
            return Err(NFTError::NotPaused(NotPaused {}));
        }
        self.paused.set(false);
        evm::log(TokenUnpaused {
            account: msg::sender(),
        });
        Ok(())
    }

    /// Update base URI (owner only)
    pub fn set_base_uri(&mut self, base_uri: String) -> Result<(), NFTError> {
        if msg::sender() != self.owner.get() {
            return Err(NFTError::NotOwner(NotOwner {}));
        }
        self.base_token_uri.set_str(base_uri.clone());
        evm::log(BaseURIUpdated { newBaseURI: base_uri });
        Ok(())
    }


    /// Get token URI
    pub fn token_uri(&self, token_id: U256) -> Result<String, NFTError> {
        self.owner_of(token_id)?; // Verify token exists
        let base_uri = self.base_token_uri.get_string();
        if base_uri.is_empty() {
            return Ok(String::new());
        }
        Ok(format!("{}{}", base_uri, token_id))
    }

    /// Transfer ownership (owner only)
    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), NFTError> {
        if msg::sender() != self.owner.get() {
            return Err(NFTError::NotOwner(NotOwner {}));
        }
        self.owner.set(new_owner);
        Ok(())
    }

    // Internal functions

    fn require_authorized_to_spend(
        &self,
        from: Address,
        token_id: U256,
    ) -> Result<(), NFTError> {
        let owner = self.owner_of(token_id)?;
        if from != owner {
            return Err(NFTError::NotOwner(NotOwner {}));
        }

        let msg_sender = msg::sender();
        if msg_sender == owner {
            return Ok(());
        }

        if self.operator_approvals.getter(owner).get(msg_sender) {
            return Ok(());
        }

        if msg_sender == self.token_approvals.get(token_id) {
            return Ok(());
        }

        Err(NFTError::NotApproved(NotApproved {}))
    }

    fn _transfer(&mut self, from: Address, to: Address, token_id: U256) -> Result<(), NFTError> {
        let mut owner = self.owners.setter(token_id);
        let previous_owner = owner.get();
        if previous_owner != from {
            return Err(NFTError::NotOwner(NotOwner {}));
        }
        owner.set(to);

        let mut from_balance = self.balances.setter(from);
        let current_from_balance = from_balance.get();
        from_balance.set(current_from_balance - U256::from(1));

        let mut to_balance = self.balances.setter(to);
        let current_to_balance = to_balance.get();
        to_balance.set(current_to_balance + U256::from(1));

        self.token_approvals.delete(token_id);

        evm::log(Transfer { from, to, token_id });
        Ok(())
    }
}

