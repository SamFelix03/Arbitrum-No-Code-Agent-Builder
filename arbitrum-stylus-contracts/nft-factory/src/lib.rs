// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "export-abi"), no_main)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::{prelude::*, msg, block, evm};

// Declare Solidity error types
sol! {
    error InvalidInput();
    error CollectionNotFound();
}

/// Represents the ways methods may fail.
#[derive(SolidityError)]
pub enum FactoryError {
    InvalidInput(InvalidInput),
    CollectionNotFound(CollectionNotFound),
}

// Declare Solidity event types
sol! {
    event CollectionCreated(
        address indexed collectionAddress,
        address indexed creator,
        string name,
        string symbol,
        string baseURI,
        uint256 timestamp
    );
}

sol_storage! {
    #[entrypoint]
    pub struct NFTFactory {
        address[] deployed_collections;
        mapping(address => address[]) creator_to_collections;
        mapping(address => CollectionInfo) collection_info;
    }
}

sol_storage! {
    pub struct CollectionInfo {
        address collection_address;
        address creator;
        string name;
        string symbol;
        string base_uri;
        uint256 deployed_at;
    }
}

#[public]
impl NFTFactory {
    /// Register a collection that was deployed externally
    /// Note: Actual collection deployment should be done via cargo-stylus
    /// This function registers the collection address and metadata
    pub fn register_collection(
        &mut self,
        collection_address: Address,
        name: String,
        symbol: String,
        base_uri: String,
    ) -> Result<(), FactoryError> {
        if collection_address == Address::ZERO {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }
        if name.is_empty() || symbol.is_empty() {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }

        let creator = msg::sender();
        let timestamp = U256::from(block::timestamp());

        // Check if collection already registered
        let existing_info = self.collection_info.getter(collection_address);
        if existing_info.collection_address.get() != Address::ZERO {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }

        // Store collection information
        let mut info = self.collection_info.setter(collection_address);
        info.collection_address.set(collection_address);
        info.creator.set(creator);
        info.name.set_str(name.clone());
        info.symbol.set_str(symbol.clone());
        info.base_uri.set_str(base_uri.clone());
        info.deployed_at.set(timestamp);

        // Add to deployed collections array
        self.deployed_collections.push(collection_address);

        // Add to creator's collection list
        self.creator_to_collections.setter(creator).push(collection_address);

        evm::log(CollectionCreated {
            collectionAddress: collection_address,
            creator,
            name,
            symbol,
            baseURI: base_uri,
            timestamp,
        });

        Ok(())
    }

    /// Get total number of collections deployed
    pub fn get_total_collections_deployed(&self) -> Result<U256, FactoryError> {
        Ok(U256::from(self.deployed_collections.len()))
    }

    /// Get all deployed collection addresses
    pub fn get_all_deployed_collections(&self) -> Result<Vec<Address>, FactoryError> {
        let len = self.deployed_collections.len();
        let mut collections = Vec::with_capacity(len);
        for i in 0..len {
            collections.push(self.deployed_collections.get(i).unwrap());
        }
        Ok(collections)
    }

    /// Get collections created by a specific address
    pub fn get_collections_by_creator(
        &self,
        creator: Address,
    ) -> Result<Vec<Address>, FactoryError> {
        let creator_collections = self.creator_to_collections.getter(creator);
        let len = creator_collections.len();
        let mut collections = Vec::with_capacity(len);
        for i in 0..len {
            collections.push(creator_collections.get(i).unwrap());
        }
        Ok(collections)
    }

    /// Get detailed information about a collection
    pub fn get_collection_info(
        &self,
        collection_address: Address,
    ) -> Result<(Address, String, String, String, U256), FactoryError> {
        let info = self.collection_info.getter(collection_address);
        if info.collection_address.get() == Address::ZERO {
            return Err(FactoryError::CollectionNotFound(CollectionNotFound {}));
        }

        Ok((
            info.creator.get(),
            info.name.get_string(),
            info.symbol.get_string(),
            info.base_uri.get_string(),
            info.deployed_at.get(),
        ))
    }

    /// Get paginated list of deployed collections
    pub fn get_deployed_collections_paginated(
        &self,
        start_index: U256,
        count: U256,
    ) -> Result<Vec<Address>, FactoryError> {
        let start = start_index.to::<u64>() as usize;
        let count_usize = count.to::<u64>() as usize;
        let total = self.deployed_collections.len();

        if start >= total {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }

        let end = (start + count_usize).min(total);
        let mut result = Vec::with_capacity(end - start);

        for i in start..end {
            result.push(self.deployed_collections.get(i).unwrap());
        }

        Ok(result)
    }

    /// Get the latest N collections deployed
    pub fn get_latest_collections(&self, count: U256) -> Result<Vec<Address>, FactoryError> {
        let total = self.deployed_collections.len();
        if total == 0 {
            return Err(FactoryError::InvalidInput(InvalidInput {}));
        }

        let count_usize = (count.to::<u64>() as usize).min(total);
        let mut result = Vec::with_capacity(count_usize);

        for i in 0..count_usize {
            result.push(self.deployed_collections.get(total - 1 - i).unwrap());
        }

        Ok(result)
    }
}

