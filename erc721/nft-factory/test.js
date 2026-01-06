#!/usr/bin/env node

/**
 * Test script for NFT Factory contract
 * Tests: register_collection, get_collection_count, get_all_collections, get_collection_info, get_creator_collections
 */

import { ethers } from 'ethers';
import { getProviderAndWallet, getContractAddress, waitForTx, testFunction } from '../test-utils.js';

// ABI for NFT Factory contract (hardcoded for use in other codebases)
const NFT_FACTORY_ABI = [
  "function registerCollection(address collection_address, string name, string symbol, string base_uri)",
  "function getTotalCollectionsDeployed() view returns (uint256)",
  "function getAllDeployedCollections() view returns (address[])",
  "function getCollectionInfo(address collection_address) view returns (address, string, string, string, uint256)",
  "function getCollectionsByCreator(address creator) view returns (address[])",
  "function getDeployedCollectionsPaginated(uint256 start_index, uint256 count) view returns (address[])",
  "function getLatestCollections(uint256 count) view returns (address[])",
  "event CollectionCreated(address indexed collectionAddress, address indexed creator, string name, string symbol, string baseURI, uint256 timestamp)"
];

async function main() {
  console.log('🚀 Starting NFT Factory Contract Tests\n');
  console.log('='.repeat(60));

  const { provider, wallet } = getProviderAndWallet();
  const contractAddress = getContractAddress('nft-factory');
  const contract = new ethers.Contract(contractAddress, NFT_FACTORY_ABI, wallet);

  console.log(`📝 Contract Address: ${contractAddress}`);
  console.log(`👤 Test Account: ${wallet.address}\n`);

  const results = [];

  // Test 1: Get initial collection count
  results.push(await testFunction('getTotalCollectionsDeployed() - Initial', async () => {
    const count = await contract.getTotalCollectionsDeployed();
    console.log(`  📊 Collection Count: ${count}`);
    return count;
  }));

  // Test 2: Get all collections
  results.push(await testFunction('getAllDeployedCollections()', async () => {
    const collections = await contract.getAllDeployedCollections();
    console.log(`  📋 Total Collections: ${collections.length}`);
    collections.forEach((addr, i) => console.log(`     ${i + 1}. ${addr}`));
    return collections;
  }));

  // Test 3: Get creator's collections
  results.push(await testFunction('getCollectionsByCreator()', async () => {
    const collections = await contract.getCollectionsByCreator(wallet.address);
    console.log(`  👤 Creator's Collections: ${collections.length}`);
    collections.forEach((addr, i) => console.log(`     ${i + 1}. ${addr}`));
    return collections;
  }));

  // Test 4: Register a collection (using the deployed NFT address)
  const collectionAddress = getContractAddress('erc721-nft');
  const collectionName = "Test NFT Collection";
  const collectionSymbol = "TNFT";
  const baseUri = "https://example.com/api/token/";

  // Check if collection is already registered
  const existingCollections = await contract.getAllDeployedCollections();
  const isAlreadyRegistered = existingCollections.some(addr => addr.toLowerCase() === collectionAddress.toLowerCase());
  
  if (!isAlreadyRegistered) {
    results.push(await testFunction('registerCollection()', async () => {
      const tx = await contract.registerCollection(collectionAddress, collectionName, collectionSymbol, baseUri);
      await waitForTx(tx, 'Register collection');
      
      // Listen for event
      const filter = contract.filters.CollectionCreated();
      const events = await contract.queryFilter(filter, tx.blockNumber);
      if (events.length > 0) {
        console.log(`  📢 Event: CollectionCreated`);
        console.log(`     Collection Address: ${events[0].args.collectionAddress}`);
        console.log(`     Name: ${events[0].args.name}`);
        console.log(`     Symbol: ${events[0].args.symbol}`);
        console.log(`     Base URI: ${events[0].args.baseURI}`);
      }
      return tx.hash;
    }));
  } else {
    console.log(`  ⚠️  Collection already registered, skipping registration test`);
  }

  // Test 5: Get collection info
  results.push(await testFunction('getCollectionInfo()', async () => {
    // Manually decode the tuple return value (same approach as Token Factory)
    const iface = new ethers.Interface(NFT_FACTORY_ABI);
    const data = await provider.call({
      to: contractAddress,
      data: iface.encodeFunctionData("getCollectionInfo", [collectionAddress])
    });
    
    // Remove 0x prefix
    const hexData = data.startsWith('0x') ? data.slice(2) : data;
    
    // First 32 bytes (64 hex chars) is offset to tuple start
    const tupleOffset = parseInt(hexData.slice(0, 64), 16);
    const tupleStart = tupleOffset * 2; // Convert bytes to hex string position
    
    // Read address (creator) - first 32 bytes of tuple (but address is only 20 bytes, padded)
    const creatorHex = hexData.slice(tupleStart + 24, tupleStart + 64); // Last 20 bytes (40 hex chars)
    const creator = ethers.getAddress('0x' + creatorHex);
    
    // Read string1 offset - bytes 32-63 of tuple
    const string1Offset = parseInt(hexData.slice(tupleStart + 64, tupleStart + 128), 16);
    
    // Read string2 offset - bytes 64-95 of tuple
    const string2Offset = parseInt(hexData.slice(tupleStart + 128, tupleStart + 192), 16);
    
    // Read string3 offset - bytes 96-127 of tuple
    const string3Offset = parseInt(hexData.slice(tupleStart + 192, tupleStart + 256), 16);
    
    // Read uint256 (deployed at) - bytes 128-159 of tuple
    const deployedAt = BigInt('0x' + hexData.slice(tupleStart + 256, tupleStart + 320));
    
    // Read string1 (name) - offset is relative to tuple start
    const namePos = tupleStart + string1Offset * 2;
    const nameLength = parseInt(hexData.slice(namePos, namePos + 64), 16);
    const nameHex = hexData.slice(namePos + 64, namePos + 64 + nameLength * 2);
    const name = Buffer.from(nameHex, 'hex').toString('utf8');
    
    // Read string2 (symbol) - offset is relative to tuple start
    const symbolPos = tupleStart + string2Offset * 2;
    const symbolLength = parseInt(hexData.slice(symbolPos, symbolPos + 64), 16);
    const symbolHex = hexData.slice(symbolPos + 64, symbolPos + 64 + symbolLength * 2);
    const symbol = Buffer.from(symbolHex, 'hex').toString('utf8');
    
    // Read string3 (baseUri) - offset is relative to tuple start
    const baseUriPos = tupleStart + string3Offset * 2;
    const baseUriLength = parseInt(hexData.slice(baseUriPos, baseUriPos + 64), 16);
    const baseUriHex = hexData.slice(baseUriPos + 64, baseUriPos + 64 + baseUriLength * 2);
    const baseUri = Buffer.from(baseUriHex, 'hex').toString('utf8');
    
    console.log(`  📋 Creator: ${creator}`);
    console.log(`  📛 Name: ${name}`);
    console.log(`  🏷️  Symbol: ${symbol}`);
    console.log(`  🔗 Base URI: ${baseUri}`);
    console.log(`  📅 Deployed At: ${deployedAt}`);
    
    return {
      creator,
      name,
      symbol,
      baseUri,
      deployedAt: deployedAt.toString()
    };
  }));

  // Test 6: Verify collection count increased
  results.push(await testFunction('getTotalCollectionsDeployed() - After registration', async () => {
    const count = await contract.getTotalCollectionsDeployed();
    console.log(`  📊 Collection Count: ${count}`);
    return count;
  }));

  // Test 7: Try to register same collection again (should fail)
  results.push(await testFunction('registerCollection() - Duplicate (should fail)', async () => {
    await contract.registerCollection(collectionAddress, collectionName, collectionSymbol, baseUri);
  }, false));

  // Test 8: Register with invalid input (should fail)
  results.push(await testFunction('registerCollection() - Invalid address (should fail)', async () => {
    await contract.registerCollection(ethers.ZeroAddress, collectionName, collectionSymbol, baseUri);
  }, false));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});

