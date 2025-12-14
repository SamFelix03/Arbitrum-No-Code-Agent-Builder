#!/usr/bin/env node

/**
 * Test script for DAO Factory contract
 * Tests: register_dao, get_dao_count, get_all_daos, get_creator_daos
 */

import { ethers } from 'ethers';
import { getProviderAndWallet, getContractAddress, waitForTx, testFunction } from '../test-utils.js';

// ABI for DAO Factory contract (hardcoded for use in other codebases)
const DAO_FACTORY_ABI = [
  "function registerDao(address dao_address, string name, uint256 voting_period, uint256 quorum_percentage)",
  "function getDaoCount() view returns (uint256)",
  "function getAllDaos() view returns (address[])",
  "function getCreatorDaos(address creator) view returns (address[])",
  "event DAOCreated(address indexed daoAddress, string name, address indexed creator, uint256 votingPeriod, uint256 quorumPercentage)"
];

async function main() {
  console.log('🚀 Starting DAO Factory Contract Tests\n');
  console.log('='.repeat(60));

  const { provider, wallet } = getProviderAndWallet();
  const contractAddress = getContractAddress('dao-factory');
  const contract = new ethers.Contract(contractAddress, DAO_FACTORY_ABI, wallet);

  console.log(`📝 Contract Address: ${contractAddress}`);
  console.log(`👤 Test Account: ${wallet.address}\n`);

  const results = [];

  // Test 1: Get initial DAO count
  results.push(await testFunction('getDaoCount() - Initial', async () => {
    const count = await contract.getDaoCount();
    console.log(`  📊 DAO Count: ${count}`);
    return count;
  }));

  // Test 2: Get all DAOs
  results.push(await testFunction('getAllDaos()', async () => {
    const daos = await contract.getAllDaos();
    console.log(`  📋 Total DAOs: ${daos.length}`);
    daos.forEach((addr, i) => console.log(`     ${i + 1}. ${addr}`));
    return daos;
  }));

  // Test 3: Get creator's DAOs
  results.push(await testFunction('getCreatorDaos()', async () => {
    const daos = await contract.getCreatorDaos(wallet.address);
    console.log(`  👤 Creator's DAOs: ${daos.length}`);
    daos.forEach((addr, i) => console.log(`     ${i + 1}. ${addr}`));
    return daos;
  }));

  // Test 4: Register a DAO (using the deployed DAO address)
  const daoAddress = getContractAddress('dao');
  const daoName = "Test DAO";
  const votingPeriod = 86400; // 1 day
  const quorumPercentage = 50; // 50%

  results.push(await testFunction('registerDao()', async () => {
    const tx = await contract.registerDao(daoAddress, daoName, votingPeriod, quorumPercentage);
    await waitForTx(tx, 'Register DAO');
    
    // Listen for event
    const filter = contract.filters.DAOCreated();
    const events = await contract.queryFilter(filter, tx.blockNumber);
    if (events.length > 0) {
      console.log(`  📢 Event: DAOCreated`);
      console.log(`     DAO Address: ${events[0].args.daoAddress}`);
      console.log(`     Name: ${events[0].args.name}`);
      console.log(`     Creator: ${events[0].args.creator}`);
    }
    return tx.hash;
  }));

  // Test 5: Verify DAO count increased
  results.push(await testFunction('getDaoCount() - After registration', async () => {
    const count = await contract.getDaoCount();
    console.log(`  📊 DAO Count: ${count}`);
    return count;
  }));

  // Test 6: Try to register same DAO again (should fail)
  results.push(await testFunction('registerDao() - Duplicate (should fail)', async () => {
    await contract.registerDao(daoAddress, daoName, votingPeriod, quorumPercentage);
  }, false));

  // Test 7: Register with invalid input (should fail)
  results.push(await testFunction('registerDao() - Invalid address (should fail)', async () => {
    await contract.registerDao(ethers.ZeroAddress, daoName, votingPeriod, quorumPercentage);
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

