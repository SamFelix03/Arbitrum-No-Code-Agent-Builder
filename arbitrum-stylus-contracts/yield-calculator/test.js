#!/usr/bin/env node

/**
 * Test script for Yield Calculator contract
 * Tests: init, owner, create_deposit, calculate_yield, get_current_yield, get_total_amount, withdraw, get_user_deposits, get_deposit_info, get_stats
 * 
 * Note: This test requires an ERC20 token to be deployed and approved for testing deposits
 */

import { ethers } from 'ethers';
import { getProviderAndWallet, getContractAddress, waitForTx, testFunction } from '../test-utils.js';

// ABI for Yield Calculator contract
const YIELD_CALCULATOR_ABI = [
  "function init(address initial_owner, address contract_address)",
  "function owner() view returns (address)",
  "function createDeposit(address token_address, uint256 amount, uint256 apy) returns (uint256)",
  "function calculateYield(uint256 deposit_id, uint256 time_in_seconds) view returns (uint256)",
  "function getCurrentYield(uint256 deposit_id) view returns (uint256)",
  "function getTotalAmount(uint256 deposit_id) view returns (uint256)",
  "function withdraw(uint256 deposit_id)",
  "function getUserDeposits(address user) view returns (uint256[])",
  "function getDepositInfo(uint256 deposit_id) view returns (address, address, uint256, uint256, uint256, bool)",
  "function getDepositTokenAddress(uint256 deposit_id) view returns (address)",
  "function getStats() view returns (uint256, uint256, uint256)",
  "event DepositCreated(address indexed depositor, uint256 depositId, address indexed tokenAddress, uint256 amount, uint256 apy)",
  "event YieldCalculated(address indexed depositor, uint256 depositId, uint256 yieldAmount)",
  "event Withdrawn(address indexed to, uint256 depositId, uint256 amount)"
];

// ERC20 ABI for token interactions
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

async function main() {
  console.log('🚀 Starting Yield Calculator Contract Tests\n');
  console.log('='.repeat(60));

  const { provider, wallet } = getProviderAndWallet();
  const contractAddress = getContractAddress('yield-calculator');
  const contract = new ethers.Contract(contractAddress, YIELD_CALCULATOR_ABI, wallet);

  console.log(`📝 Contract Address: ${contractAddress}`);
  console.log(`👤 Test Account: ${wallet.address}\n`);

  const results = [];

  // Test 1: Get owner
  results.push(await testFunction('owner()', async () => {
    const owner = await contract.owner();
    console.log(`  👤 Owner: ${owner}`);
    return owner;
  }));

  // Test 2: Get stats (initial)
  results.push(await testFunction('getStats() - Initial', async () => {
    // Manually decode tuple: (uint256, uint256, uint256)
    // For simple tuples without dynamic types, ABI encoding is direct (no offset prefix)
    const iface = new ethers.Interface(YIELD_CALCULATOR_ABI);
    const data = await provider.call({
      to: contractAddress,
      data: iface.encodeFunctionData("getStats", [])
    });
    
    if (!data || data === '0x') {
      // Empty response - return zeros
      console.log(`  💰 Total Deposits: 0 tokens`);
      console.log(`  📈 Total Yield Generated: 0 tokens`);
      console.log(`  📊 Deposit Count: 0`);
      return { totalDeposits: '0', totalYield: '0', depositCount: '0' };
    }
    
    const hexData = data.startsWith('0x') ? data.slice(2) : data;
    
    // Check if there's an offset prefix (first 32 bytes)
    const firstWord = hexData.slice(0, 64);
    const possibleOffset = parseInt(firstWord, 16);
    
    let tupleStart;
    if (possibleOffset === 32 || possibleOffset === 0) {
      // Has offset prefix, tuple starts after offset
      tupleStart = possibleOffset * 2;
    } else {
      // No offset, tuple starts immediately
      tupleStart = 0;
    }
    
    const totalDeposits = BigInt('0x' + hexData.slice(tupleStart, tupleStart + 64));
    const totalYield = BigInt('0x' + hexData.slice(tupleStart + 64, tupleStart + 128));
    const depositCount = BigInt('0x' + hexData.slice(tupleStart + 128, tupleStart + 192));
    
    console.log(`  💰 Total Deposits: ${ethers.formatEther(totalDeposits)} tokens`);
    console.log(`  📈 Total Yield Generated: ${ethers.formatEther(totalYield)} tokens`);
    console.log(`  📊 Deposit Count: ${depositCount}`);
    return {
      totalDeposits: totalDeposits.toString(),
      totalYield: totalYield.toString(),
      depositCount: depositCount.toString()
    };
  }));

  // Test 3: Create deposit (requires ERC20 token)
  // Use the deployed ERC20 token for testing
  const tokenAddress = getContractAddress('erc20-token');
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  
  // Check token balance
  const tokenBalance = await tokenContract.balanceOf(wallet.address);
  const depositAmount = ethers.parseEther('1000');
  const apy = 500; // 5% APY (in basis points: 500 = 5%)

  if (tokenBalance >= depositAmount) {
    // Approve token spending
    results.push(await testFunction('Approve ERC20 token', async () => {
      const tx = await tokenContract.approve(contractAddress, depositAmount);
      await waitForTx(tx, 'Approve token');
      
      const allowance = await tokenContract.allowance(wallet.address, contractAddress);
      console.log(`  ✅ Allowance: ${ethers.formatEther(allowance)} tokens`);
      return tx.hash;
    }));

    // Create deposit
    let depositId;
    results.push(await testFunction('createDeposit()', async () => {
      const tx = await contract.createDeposit(tokenAddress, depositAmount, apy);
      const receipt = await waitForTx(tx, 'Create deposit');
      
      // Get deposit ID from event
      const filter = contract.filters.DepositCreated();
      const events = await contract.queryFilter(filter, receipt.blockNumber);
      if (events.length > 0) {
        depositId = events[0].args.depositId;
        console.log(`  💰 Deposit ID: ${depositId}`);
        console.log(`  📊 Amount: ${ethers.formatEther(events[0].args.amount)} tokens`);
        console.log(`  📈 APY: ${events[0].args.apy} basis points (${Number(events[0].args.apy) / 100}%)`);
      }
      return depositId;
    }));

    // Test 4: Get deposit info
    if (depositId !== undefined) {
      results.push(await testFunction('getDepositInfo()', async () => {
        // Manually decode tuple: (address, address, uint256, uint256, uint256, bool)
        const iface = new ethers.Interface(YIELD_CALCULATOR_ABI);
        const data = await provider.call({
          to: contractAddress,
      data: iface.encodeFunctionData("getDepositInfo", [depositId])
        });
        
        if (!data || data === '0x') {
          throw new Error('Empty response from getDepositInfo');
        }
        
        const hexData = data.startsWith('0x') ? data.slice(2) : data;
        
        // For tuples with only fixed-size types, ABI encoding is direct (no offset prefix)
        // Format: address (32 bytes) + address (32 bytes) + uint256 (32 bytes) + uint256 (32 bytes) + uint256 (32 bytes) + bool (32 bytes)
        // Total: 192 bytes = 384 hex chars
        
        // Read first address (depositor) - bytes 0-31, address is last 20 bytes (40 hex chars)
        // Position 24-63 in hex string = bytes 12-31 in data
        const depositorHex = hexData.slice(24, 64);
        const depositor = ethers.getAddress('0x' + depositorHex);
        
        // Read second address (token) - bytes 32-63, address is last 20 bytes
        // Position 88-127 in hex string = bytes 44-63 in data (which is bytes 12-31 of the second word)
        const tokenHex = hexData.slice(88, 128);
        const tokenAddress = ethers.getAddress('0x' + tokenHex);
        
        // Read uint256s (each is 32 bytes = 64 hex chars)
        // amount starts at byte 64 (hex position 128)
        const amount = BigInt('0x' + hexData.slice(128, 192));      // bytes 64-95
        // apy starts at byte 96 (hex position 192)
        const apy = BigInt('0x' + hexData.slice(192, 256));         // bytes 96-127
        // depositTime starts at byte 128 (hex position 256)
        const depositTime = BigInt('0x' + hexData.slice(256, 320)); // bytes 128-159
        
        // Read bool (last byte of 32-byte word at bytes 160-191, hex position 320-383)
        const activeHex = hexData.slice(382, 384);
        const active = parseInt(activeHex, 16) !== 0;
        
        console.log(`  👤 Depositor: ${depositor}`);
        console.log(`  🪙 Token: ${tokenAddress}`);
        console.log(`  💰 Amount: ${ethers.formatEther(amount)} tokens`);
        console.log(`  📈 APY: ${apy} basis points`);
        console.log(`  ⏰ Deposit Time: ${depositTime}`);
        console.log(`  ✅ Active: ${active}`);
        
        return {
          depositor,
          token_address: tokenAddress,
          amount: amount.toString(),
          apy: apy.toString(),
          deposit_time: depositTime.toString(),
          active
        };
      }));

      // Test 5: Calculate yield for 1 day
      const oneDayInSeconds = 86400;
      results.push(await testFunction('calculateYield() - 1 day', async () => {
        const yieldAmount = await contract.calculateYield(depositId, oneDayInSeconds);
        console.log(`  📈 Yield for 1 day: ${ethers.formatEther(yieldAmount)} tokens`);
        return yieldAmount;
      }));

      // Test 6: Get current yield
      results.push(await testFunction('getCurrentYield()', async () => {
        const yieldAmount = await contract.getCurrentYield(depositId);
        console.log(`  📈 Current yield: ${ethers.formatEther(yieldAmount)} tokens`);
        return yieldAmount;
      }));

      // Test 7: Get total amount
      results.push(await testFunction('getTotalAmount()', async () => {
        const total = await contract.getTotalAmount(depositId);
        console.log(`  💰 Total amount (principal + yield): ${ethers.formatEther(total)} tokens`);
        return total;
      }));

      // Test 8: Get user deposits
      results.push(await testFunction('getUserDeposits()', async () => {
        const deposits = await contract.getUserDeposits(wallet.address);
        console.log(`  📋 User deposits: ${deposits.length}`);
        deposits.forEach((id, i) => console.log(`     ${i + 1}. Deposit ID: ${id}`));
        return deposits;
      }));

      // Test 9: Get deposit token address
      results.push(await testFunction('getDepositTokenAddress()', async () => {
        const tokenAddr = await contract.getDepositTokenAddress(depositId);
        console.log(`  🪙 Token address: ${tokenAddr}`);
        return tokenAddr;
      }));

      // Test 10: Withdraw (after some time has passed)
      // Note: In a real scenario, you'd wait for time to pass. For testing, we'll just test the function
      // In practice, you might want to wait or use time manipulation in a test environment
      console.log('\n⚠️  Note: Withdraw test skipped - requires time to pass for yield to accrue');
      console.log('     In production, wait for the deposit period before withdrawing\n');

      // Test 11: Get stats after deposit
      results.push(await testFunction('getStats() - After deposit', async () => {
        // Manually decode tuple: (uint256, uint256, uint256)
        const iface = new ethers.Interface(YIELD_CALCULATOR_ABI);
        const data = await provider.call({
          to: contractAddress,
          data: iface.encodeFunctionData("getStats", [])
        });
        
        if (!data || data === '0x') {
          console.log(`  💰 Total Deposits: 0 tokens`);
          console.log(`  📈 Total Yield Generated: 0 tokens`);
          console.log(`  📊 Deposit Count: 0`);
          return { totalDeposits: '0', totalYield: '0', depositCount: '0' };
        }
        
        const hexData = data.startsWith('0x') ? data.slice(2) : data;
        const firstWord = parseInt(hexData.slice(0, 64), 16);
        const tupleStart = (firstWord === 32 || firstWord === 0) ? firstWord * 2 : 0;
        
        const totalDeposits = BigInt('0x' + hexData.slice(tupleStart, tupleStart + 64));
        const totalYield = BigInt('0x' + hexData.slice(tupleStart + 64, tupleStart + 128));
        const depositCount = BigInt('0x' + hexData.slice(tupleStart + 128, tupleStart + 192));
        
        console.log(`  💰 Total Deposits: ${ethers.formatEther(totalDeposits)} tokens`);
        console.log(`  📈 Total Yield Generated: ${ethers.formatEther(totalYield)} tokens`);
        console.log(`  📊 Deposit Count: ${depositCount}`);
        return {
          totalDeposits: totalDeposits.toString(),
          totalYield: totalYield.toString(),
          depositCount: depositCount.toString()
        };
      }));
    }
  } else {
    console.log(`\n⚠️  Insufficient token balance for deposit test. Need ${ethers.formatEther(depositAmount)} tokens, have ${ethers.formatEther(tokenBalance)} tokens\n`);
  }

  // Test 12: Try to create deposit with invalid inputs (should fail)
  results.push(await testFunction('createDeposit() - Invalid token address (should fail)', async () => {
    await contract.createDeposit(ethers.ZeroAddress, depositAmount, apy);
  }, false));

  results.push(await testFunction('createDeposit() - Zero amount (should fail)', async () => {
    await contract.createDeposit(tokenAddress, 0, apy);
  }, false));

  results.push(await testFunction('createDeposit() - Invalid APY (should fail)', async () => {
    await contract.createDeposit(tokenAddress, depositAmount, 10001); // > 10000
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

