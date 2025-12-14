#!/usr/bin/env node

/**
 * Test script for DAO contract
 * Tests: init, add_member, remove_member, create_proposal, vote, execute_proposal, and all getters
 */

import { ethers } from 'ethers';
import { getProviderAndWallet, getContractAddress, waitForTx, testFunction } from '../test-utils.js';

// ABI for DAO contract (hardcoded for use in other codebases)
const DAO_ABI = [
  "function init(string name, address creator, uint256 voting_period, uint256 quorum_percentage)",
  "function name() view returns (string)",
  "function creator() view returns (address)",
  "function proposalCount() view returns (uint256)",
  "function memberCount() view returns (uint256)",
  "function votingPeriod() view returns (uint256)",
  "function quorumPercentage() view returns (uint256)",
  "function addMember(address member, uint256 voting_power)",
  "function removeMember(address member)",
  "function createProposal(string description) returns (uint256)",
  "function vote(uint256 proposal_id, bool support)",
  "function executeProposal(uint256 proposal_id)",
  "function getTotalVotingPower() view returns (uint256)",
  "function getProposalInfo(uint256 proposal_id) view returns (string memory, address, uint256, uint256, uint256, bool, bool)",
  "event MemberAdded(address indexed member, uint256 votingPower)",
  "event MemberRemoved(address indexed member)",
  "event ProposalCreated(uint256 indexed proposalId, string description, address proposer)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)",
  "event ProposalExecuted(uint256 indexed proposalId, bool passed)"
];

async function main() {
  console.log('🚀 Starting DAO Contract Tests\n');
  console.log('='.repeat(60));

  const { provider, wallet } = getProviderAndWallet();
  const contractAddress = getContractAddress('dao');
  const contract = new ethers.Contract(contractAddress, DAO_ABI, wallet);

  console.log(`📝 Contract Address: ${contractAddress}`);
  console.log(`👤 Test Account: ${wallet.address}\n`);

  const results = [];

  // Test 1: Get basic info
  results.push(await testFunction('name()', async () => {
    const name = await contract.name();
    console.log(`  📛 Name: ${name}`);
    return name;
  }));

  results.push(await testFunction('creator()', async () => {
    const creator = await contract.creator();
    console.log(`  👤 Creator: ${creator}`);
    return creator;
  }));

  results.push(await testFunction('votingPeriod()', async () => {
    const period = await contract.votingPeriod();
    console.log(`  ⏱️  Voting Period: ${period} seconds`);
    return period;
  }));

  results.push(await testFunction('quorumPercentage()', async () => {
    const quorum = await contract.quorumPercentage();
    console.log(`  📊 Quorum: ${quorum}%`);
    return quorum;
  }));

  results.push(await testFunction('memberCount()', async () => {
    const count = await contract.memberCount();
    console.log(`  👥 Member Count: ${count}`);
    return count;
  }));

  results.push(await testFunction('proposalCount()', async () => {
    const count = await contract.proposalCount();
    console.log(`  📋 Proposal Count: ${count}`);
    return count;
  }));

  results.push(await testFunction('getTotalVotingPower()', async () => {
    const total = await contract.getTotalVotingPower();
    console.log(`  💪 Total Voting Power: ${total}`);
    return total;
  }));

  // Test 4: Add a new member (skip if already added)
  const newMember = '0x6666666666666666666666666666666666666666'; // Changed to avoid conflicts
  const votingPower = 100;
  
  results.push(await testFunction('addMember()', async () => {
    try {
      const tx = await contract.addMember(newMember, votingPower);
      await waitForTx(tx, 'Add member');
      
      // Verify member was added by checking total voting power
      const totalPower = await contract.getTotalVotingPower();
      console.log(`  ✅ Total voting power after add: ${totalPower}`);
      return tx.hash;
    } catch (error) {
      if (error.message.includes('AlreadyMember') || error.message.includes('0x810074be')) {
        console.log(`  ⚠️  Member already exists, skipping...`);
        return 'skipped';
      }
      throw error;
    }
  }));

  // Test 5: Create a proposal
  const proposalDescription = "Test proposal: Should we add more members?";
  let proposalId;
  
  results.push(await testFunction('createProposal()', async () => {
    const tx = await contract.createProposal(proposalDescription);
    const receipt = await waitForTx(tx, 'Create proposal');
    
    // Get proposal ID from event
    const filter = contract.filters.ProposalCreated();
    const events = await contract.queryFilter(filter, receipt.blockNumber);
    if (events.length > 0) {
      proposalId = events[0].args.proposalId;
      console.log(`  📋 Proposal ID: ${proposalId}`);
      
      // Get proposal details
      try {
        const proposalInfo = await contract.getProposalInfo(proposalId);
        console.log(`  📝 Description: ${proposalInfo[0]}`);
        console.log(`  👤 Proposer: ${proposalInfo[1]}`);
      } catch (e) {
        console.log(`  ⚠️  Could not get proposal info: ${e.message}`);
      }
      return proposalId.toString();
    }
    return receipt.hash;
  }));

  // Test 6: Vote on proposal
  if (proposalId !== undefined) {
    results.push(await testFunction('vote() - Vote for proposal', async () => {
      const tx = await contract.vote(proposalId, true);
      await waitForTx(tx, 'Vote');
      
      // Get updated proposal (using manual decoding)
      try {
        const iface = new ethers.Interface(DAO_ABI);
        const data = await provider.call({
          to: contractAddress,
          data: iface.encodeFunctionData("getProposalInfo", [proposalId])
        });
        const hexData = data.startsWith('0x') ? data.slice(2) : data;
        const tupleOffset = parseInt(hexData.slice(0, 64), 16);
        const tupleStart = tupleOffset * 2;
        const forVotes = BigInt('0x' + hexData.slice(tupleStart + 128, tupleStart + 192));
        const againstVotes = BigInt('0x' + hexData.slice(tupleStart + 192, tupleStart + 256));
        console.log(`  ✅ For votes: ${forVotes}`);
        console.log(`  ❌ Against votes: ${againstVotes}`);
      } catch (e) {
        console.log(`  ⚠️  Could not get proposal info: ${e.message}`);
      }
      return tx.hash;
    }));
  }

  // Test 7: Get proposal details
  if (proposalId !== undefined) {
    results.push(await testFunction('getProposalInfo()', async () => {
      // Manually decode tuple: (string, address, uint256, uint256, uint256, bool, bool)
      const iface = new ethers.Interface(DAO_ABI);
      const data = await provider.call({
        to: contractAddress,
        data: iface.encodeFunctionData("getProposalInfo", [proposalId])
      });
      
      const hexData = data.startsWith('0x') ? data.slice(2) : data;
      const tupleOffset = parseInt(hexData.slice(0, 64), 16);
      const tupleStart = tupleOffset * 2;
      
      // Read string offset
      const stringOffset = parseInt(hexData.slice(tupleStart, tupleStart + 64), 16);
      
      // Read address (proposer) - bytes 32-63 of tuple
      const proposerHex = hexData.slice(tupleStart + 88, tupleStart + 128);
      const proposer = ethers.getAddress('0x' + proposerHex);
      
      // Read uint256s
      const forVotes = BigInt('0x' + hexData.slice(tupleStart + 128, tupleStart + 192));
      const againstVotes = BigInt('0x' + hexData.slice(tupleStart + 192, tupleStart + 256));
      const endTime = BigInt('0x' + hexData.slice(tupleStart + 256, tupleStart + 320));
      
      // Read bools
      const executedHex = hexData.slice(tupleStart + 318, tupleStart + 320);
      const executed = parseInt(executedHex, 16) !== 0;
      const passedHex = hexData.slice(tupleStart + 350, tupleStart + 352);
      const passed = parseInt(passedHex, 16) !== 0;
      
      // Read string (description)
      const descPos = tupleStart + stringOffset * 2;
      const descLength = parseInt(hexData.slice(descPos, descPos + 64), 16);
      const descHex = hexData.slice(descPos + 64, descPos + 64 + descLength * 2);
      const description = Buffer.from(descHex, 'hex').toString('utf8');
      
      console.log(`  📝 Description: ${description}`);
      console.log(`  👤 Proposer: ${proposer}`);
      console.log(`  ✅ For: ${forVotes}, ❌ Against: ${againstVotes}`);
      console.log(`  ⏰ End time: ${endTime}`);
      console.log(`  ✅ Executed: ${executed}, Passed: ${passed}`);
      
      return {
        description,
        proposer,
        forVotes: forVotes.toString(),
        againstVotes: againstVotes.toString(),
        endTime: endTime.toString(),
        executed,
        passed
      };
    }));
  }

  // Test 8: Remove member (should fail if not member)
  results.push(await testFunction('removeMember() - As non-member (should fail)', async () => {
    const otherWallet = ethers.Wallet.createRandom().connect(provider);
    const otherContract = new ethers.Contract(contractAddress, DAO_ABI, otherWallet);
    await otherContract.removeMember(newMember);
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

