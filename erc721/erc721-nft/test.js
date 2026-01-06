#!/usr/bin/env node

/**
 * Test script for ERC-721 NFT contract
 * Tests: init, name, symbol, mint, mint_batch, transfer_from, approve, get_approved, owner_of, balance_of, token_uri, pause, unpause
 */

import { ethers } from 'ethers';
import { getProviderAndWallet, getContractAddress, waitForTx, testFunction } from '../test-utils.js';

// ABI for ERC-721 NFT contract
const NFT_ABI = [
  "function init(string name, string symbol, string base_uri)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 token_id) view returns (address)",
  "function getApproved(uint256 token_id) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function baseUri() view returns (string)",
  "function mint(address to) returns (uint256)",
  "function approve(address to, uint256 token_id)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transferFrom(address from, address to, uint256 token_id)",
  "function safeTransferFrom(address from, address to, uint256 token_id)",
  "function pause()",
  "function unpause()",
  "function setBaseUri(string new_base_uri)",
  "function tokenUri(uint256 token_id) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed token_id)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed token_id)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)"
];

async function main() {
  console.log('🚀 Starting ERC-721 NFT Contract Tests\n');
  console.log('='.repeat(60));

  const { provider, wallet } = getProviderAndWallet();
  const contractAddress = getContractAddress('erc721-nft');
  const contract = new ethers.Contract(contractAddress, NFT_ABI, wallet);

  console.log(`📝 Contract Address: ${contractAddress}`);
  console.log(`👤 Test Account: ${wallet.address}\n`);

  const results = [];

  // Test 1: Get NFT info
  results.push(await testFunction('name()', async () => {
    const name = await contract.name();
    console.log(`  📛 Name: ${name}`);
    return name;
  }));

  results.push(await testFunction('symbol()', async () => {
    const symbol = await contract.symbol();
    console.log(`  🏷️  Symbol: ${symbol}`);
    return symbol;
  }));

  results.push(await testFunction('baseUri()', async () => {
    const baseUri = await contract.baseUri();
    console.log(`  🔗 Base URI: ${baseUri}`);
    return baseUri;
  }));

  results.push(await testFunction('totalSupply()', async () => {
    const supply = await contract.totalSupply();
    console.log(`  📊 Total Supply: ${supply} NFTs`);
    return supply;
  }));

  // Test 2: Get balance
  results.push(await testFunction('balanceOf()', async () => {
    const balance = await contract.balanceOf(wallet.address);
    console.log(`  💰 Balance: ${balance} NFTs`);
    return balance;
  }));

  // Test 3: Mint NFT (only owner)
  const owner = await contract.owner();
  let mintedTokenId;
  
  if (owner.toLowerCase() === wallet.address.toLowerCase()) {
    results.push(await testFunction('mint()', async () => {
      const tx = await contract.mint(wallet.address);
      const receipt = await waitForTx(tx, 'Mint NFT');
      
      // Get token ID from event
      const filter = contract.filters.Transfer();
      const events = await contract.queryFilter(filter, receipt.blockNumber);
      if (events.length > 0) {
        mintedTokenId = events[0].args.token_id;
        console.log(`  🎨 Minted Token ID: ${mintedTokenId}`);
      }
      return mintedTokenId;
    }));

    // Test 4: Mint batch
    results.push(await testFunction('mint_batch()', async () => {
      const quantity = 3;
      const tx = await contract.mint_batch(wallet.address, quantity);
      await waitForTx(tx, 'Mint batch');
      
      // Get token IDs from return value
      const receipt = await tx.wait();
      const filter = contract.filters.Transfer();
      const events = await contract.queryFilter(filter, receipt.blockNumber);
      const tokenIds = events.slice(-quantity).map(e => e.args.token_id);
      console.log(`  🎨 Minted Token IDs: ${tokenIds.join(', ')}`);
      return tokenIds;
    }));
  }

  // Test 5: Owner of token
  if (mintedTokenId !== undefined) {
    results.push(await testFunction('owner_of()', async () => {
      const owner = await contract.ownerOf(mintedTokenId);
      console.log(`  👤 Owner of token ${mintedTokenId}: ${owner}`);
      return owner;
    }));

    // Test 6: Token URI
    results.push(await testFunction('token_uri()', async () => {
      const uri = await contract.tokenUri(mintedTokenId);
      console.log(`  🔗 Token URI: ${uri}`);
      return uri;
    }));

    // Test 7: Approve
    const approvedAddress = '0x8888888888888888888888888888888888888888';
    results.push(await testFunction('approve()', async () => {
      const tx = await contract.approve(approvedAddress, mintedTokenId);
      await waitForTx(tx, 'Approve');
      
      const approved = await contract.getApproved(mintedTokenId);
      console.log(`  ✅ Approved address: ${approved}`);
      return tx.hash;
    }));

    // Test 8: Get approved
    results.push(await testFunction('getApproved()', async () => {
      const approved = await contract.getApproved(mintedTokenId);
      console.log(`  ✅ Approved: ${approved}`);
      return approved;
    }));

    // Test 9: Transfer from
    const recipient = '0x9999999999999999999999999999999999999999';
    results.push(await testFunction('transferFrom()', async () => {
      const tx = await contract.transferFrom(wallet.address, recipient, mintedTokenId);
      await waitForTx(tx, 'Transfer from');
      
      const newOwner = await contract.owner_of(mintedTokenId);
      console.log(`  ✅ New owner: ${newOwner}`);
      return tx.hash;
    }));
  }

  // Test 10: Set approval for all
  const operator = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  results.push(await testFunction('setApprovalForAll()', async () => {
    const tx = await contract.setApprovalForAll(operator, true);
    await waitForTx(tx, 'Set approval for all');
    
    const isApproved = await contract.isApprovedForAll(wallet.address, operator);
    console.log(`  ✅ Approved for all: ${isApproved}`);
    return tx.hash;
  }));

  // Test 11: Pause (only owner)
  if (owner.toLowerCase() === wallet.address.toLowerCase()) {
    results.push(await testFunction('pause()', async () => {
      const tx = await contract.pause();
      await waitForTx(tx, 'Pause');
      
      const isPaused = await contract.paused();
      console.log(`  ⏸️  Paused: ${isPaused}`);
      return tx.hash;
    }));

    // Test 12: Try mint when paused (should fail)
    results.push(await testFunction('mint() - When paused (should fail)', async () => {
      await contract.mint(wallet.address);
    }, false));

    // Test 13: Unpause
    results.push(await testFunction('unpause()', async () => {
      const tx = await contract.unpause();
      await waitForTx(tx, 'Unpause');
      
      const isPaused = await contract.paused();
      console.log(`  ▶️  Paused: ${isPaused}`);
      return tx.hash;
    }));

    // Test 14: Set base URI (only owner)
    const newBaseUri = "https://example.com/api/token/";
    results.push(await testFunction('setBaseUri()', async () => {
      const tx = await contract.setBaseUri(newBaseUri);
      await waitForTx(tx, 'Set base URI');
      
      const updatedUri = await contract.baseUri();
      console.log(`  🔗 Updated Base URI: ${updatedUri}`);
      return tx.hash;
    }));
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

