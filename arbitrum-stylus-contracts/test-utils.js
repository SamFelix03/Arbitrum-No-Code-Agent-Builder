// Shared utilities for testing Stylus contracts
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// Network configuration
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://sepolia-rollup.arbitrum.io/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

// Load deployment config
const deploymentConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'deployment-config.json'), 'utf8')
);

// Helper function to create provider and wallet
function getProviderAndWallet() {
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not found in .env file');
  }
  const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  return { provider, wallet };
}

// Helper function to get contract address from config
function getContractAddress(contractName) {
  const contract = deploymentConfig.contracts[contractName];
  if (!contract) {
    throw new Error(`Contract ${contractName} not found in deployment config`);
  }
  return contract.address;
}

// Helper function to wait for transaction
async function waitForTx(tx, label = 'Transaction') {
  console.log(`  ⏳ ${label} submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✅ ${label} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// Helper function to format error
function formatError(error) {
  if (error.reason) return error.reason;
  if (error.message) return error.message;
  return String(error);
}

// Helper function to test function call
async function testFunction(name, fn, expectedSuccess = true) {
  try {
    console.log(`\n📋 Testing: ${name}`);
    const result = await fn();
    if (expectedSuccess) {
      console.log(`  ✅ ${name} - Success`);
      if (result !== undefined && result !== null) {
        console.log(`  📊 Result: ${JSON.stringify(result, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        )}`);
      }
    } else {
      console.log(`  ❌ ${name} - Expected failure but succeeded`);
    }
    return { success: true, result };
  } catch (error) {
    if (!expectedSuccess) {
      console.log(`  ✅ ${name} - Failed as expected: ${formatError(error)}`);
      return { success: true, error: formatError(error) };
    } else {
      console.log(`  ❌ ${name} - Failed: ${formatError(error)}`);
      return { success: false, error: formatError(error) };
    }
  }
}

export {
  getProviderAndWallet,
  getContractAddress,
  waitForTx,
  formatError,
  testFunction,
  RPC_ENDPOINT,
  deploymentConfig,
};

