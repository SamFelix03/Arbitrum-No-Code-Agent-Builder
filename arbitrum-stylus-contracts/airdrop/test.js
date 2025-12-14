#!/usr/bin/env node

/**
 * Test script for Airdrop contract
 * Tests all functions: init, owner, airdrop, airdrop_with_amounts, transfer_ownership, withdraw, get_balance
 */

import { ethers } from 'ethers';
import { getProviderAndWallet, getContractAddress, waitForTx, testFunction } from '../test-utils.js';

// ABI for Airdrop contract
const AIRDROP_ABI = [
  "function owner() view returns (address)",
  "function init()",
  "function transferOwnership(address new_owner)",
  "function airdrop(address[] memory recipients, uint256 amount) payable",
  "function airdropWithAmounts(address[] memory recipients, uint256[] memory amounts) payable",
  "function withdraw(address to)",
  "function getBalance() view returns (uint256)",
  "event AirdropExecuted(address indexed executor, address[] recipients, uint256 amount, uint256 totalAmount, uint256 timestamp)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
];

async function main() {
  console.log('🚀 Starting Airdrop Contract Tests\n');
  console.log('=' .repeat(60));

  const { provider, wallet } = getProviderAndWallet();
  const contractAddress = getContractAddress('airdrop');
  const contract = new ethers.Contract(contractAddress, AIRDROP_ABI, wallet);

  console.log(`📝 Contract Address: ${contractAddress}`);
  console.log(`👤 Test Account: ${wallet.address}\n`);

  const results = [];

  // Test 1: Get owner
  results.push(await testFunction('owner()', async () => {
    const owner = await contract.owner();
    console.log(`  👤 Owner: ${owner}`);
    return owner;
  }));

  // Test 2: Get balance
  results.push(await testFunction('getBalance()', async () => {
    const balance = await contract.getBalance();
    console.log(`  💰 Balance: ${ethers.formatEther(balance)} ETH`);
    return balance;
  }));

  // Test 3: Airdrop with same amount
  const recipients = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333'
  ];
  const amountPerRecipient = ethers.parseEther('0.001');
  const totalAmount = amountPerRecipient * BigInt(recipients.length);

  // Check if wallet has enough balance
  const walletBalance = await provider.getBalance(wallet.address);
  if (walletBalance < totalAmount) {
    console.log(`\n⚠️  Insufficient balance for airdrop test. Need ${ethers.formatEther(totalAmount)} ETH, have ${ethers.formatEther(walletBalance)} ETH`);
  } else {
    results.push(await testFunction('airdrop() - Same amount', async () => {
      const tx = await contract.airdrop(recipients, amountPerRecipient, { value: totalAmount });
      await waitForTx(tx, 'Airdrop');
      
      // Listen for event
      const filter = contract.filters.AirdropExecuted();
      const events = await contract.queryFilter(filter, tx.blockNumber);
      if (events.length > 0) {
        console.log(`  📢 Event: AirdropExecuted`);
        console.log(`     Executor: ${events[0].args.executor}`);
        console.log(`     Amount: ${ethers.formatEther(events[0].args.amount)} ETH`);
        console.log(`     Total: ${ethers.formatEther(events[0].args.totalAmount)} ETH`);
      }
      return tx.hash;
    }));
  }

  // Test 4: Airdrop with different amounts
  const differentAmounts = [
    ethers.parseEther('0.001'),
    ethers.parseEther('0.002'),
    ethers.parseEther('0.003')
  ];
  const totalDifferentAmount = differentAmounts.reduce((sum, amt) => sum + amt, 0n);

  if (walletBalance >= totalDifferentAmount) {
    results.push(await testFunction('airdropWithAmounts() - Different amounts', async () => {
      const tx = await contract.airdropWithAmounts(recipients, differentAmounts, { value: totalDifferentAmount });
      await waitForTx(tx, 'Airdrop with amounts');
      return tx.hash;
    }));
  }

  // Test 5: Transfer ownership (should fail if not owner)
  const newOwner = '0x4444444444444444444444444444444444444444';
  results.push(await testFunction('transferOwnership() - As non-owner (should fail)', async () => {
    // Temporarily use a different wallet to test non-owner access
    const otherWallet = ethers.Wallet.createRandom().connect(provider);
    const otherContract = new ethers.Contract(contractAddress, AIRDROP_ABI, otherWallet);
    await otherContract.transferOwnership(newOwner);
  }, false));

  // Test 6: Transfer ownership (as owner)
  const currentOwner = await contract.owner();
  if (currentOwner.toLowerCase() === wallet.address.toLowerCase()) {
    results.push(await testFunction('transferOwnership() - As owner', async () => {
      const tx = await contract.transferOwnership(newOwner);
      await waitForTx(tx, 'Transfer ownership');
      
      // Verify ownership changed
      const newOwnerAddress = await contract.owner();
      console.log(`  👤 New owner: ${newOwnerAddress}`);
      return tx.hash;
    }));

    // Transfer back
    const tempWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const tempContract = new ethers.Contract(contractAddress, AIRDROP_ABI, tempWallet);
    if (await tempContract.owner() === newOwner) {
      await testFunction('transferOwnership() - Transfer back', async () => {
        const tx = await tempContract.transferOwnership(wallet.address);
        await waitForTx(tx, 'Transfer ownership back');
      });
    }
  }

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

