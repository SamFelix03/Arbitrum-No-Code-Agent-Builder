// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::{prelude::*, msg, evm};

// Declare Solidity error types
sol! {
    error InvalidInput();
    error DAONotFound();
}

/// Represents the ways methods may fail.
#[derive(SolidityError)]
pub enum FactoryError {
    InvalidInput(InvalidInput),
    DAONotFound(DAONotFound),
}

// Declare Solidity event types
sol! {
    event DAOCreated(
        address indexed daoAddress,
        string name,
        address indexed creator,
        uint256 votingPeriod,
        uint256 quorumPercentage
    );
}

sol_storage! {
    #[entrypoint]
    pub struct DAOFactory {
        address[] all_daos;
        mapping(address => address[]) creator_daos;
    }
}

#[public]
impl DAOFactory {
    /// Register a DAO that was deployed externally
    /// Note: Actual DAO deployment should be done via cargo-stylus
    /// This function registers the DAO address and metadata
    pub fn register_dao(
        &mut self,
        dao_address: Address,
        name: String,
        voting_period: U256,
        quorum_percentage: U256,
    ) -> Result<(), FactoryError> {
        if dao_address == Address::ZERO {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }
        if name.is_empty() {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }
        if voting_period == U256::ZERO {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }
        if quorum_percentage == U256::ZERO || quorum_percentage > U256::from(100) {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }

        let creator = msg::sender();

        // Add to all DAOs array
        self.all_daos.push(dao_address);

        // Add to creator's DAO list
        self.creator_daos.setter(creator).push(dao_address);

        evm::log(DAOCreated {
            daoAddress: dao_address,
            name,
            creator,
            votingPeriod: voting_period,
            quorumPercentage: quorum_percentage,
        });

        Ok(())
    }

    /// Get total number of DAOs
    pub fn get_dao_count(&self) -> Result<U256, FactoryError> {
        Ok(U256::from(self.all_daos.len()))
    }

    /// Get all DAO addresses
    pub fn get_all_daos(&self) -> Result<Vec<Address>, FactoryError> {
        let len = self.all_daos.len();
        let mut daos = Vec::with_capacity(len);
        for i in 0..len {
            daos.push(self.all_daos.get(i).unwrap());
        }
        Ok(daos)
    }

    /// Get DAOs created by a specific address
    pub fn get_creator_daos(&self, creator: Address) -> Result<Vec<Address>, FactoryError> {
        let creator_daos = self.creator_daos.getter(creator);
        let len = creator_daos.len();
        let mut daos = Vec::with_capacity(len);
        for i in 0..len {
            daos.push(creator_daos.get(i).unwrap());
        }
        Ok(daos)
    }
}

