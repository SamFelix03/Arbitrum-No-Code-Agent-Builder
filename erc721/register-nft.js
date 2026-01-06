#!/usr/bin/env node

/**
 * Standalone script to register an NFT collection in the NFTFactory
 * Uses ethers.js (like the test.js) so it can run locally without Docker
 * Usage: node register-nft.js <collectionAddress> <name> <symbol> <baseUri> [factoryAddress]
 * Example: node register-nft.js 0x1234... "MyNFT" "MNFT" "https://example.com/api/token/"
 */

const { ethers } = require("ethers");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// ABI for NFT Factory contract (matching test.js exactly - using camelCase)
const NFT_FACTORY_ABI = [
  "function registerCollection(address collection_address, string name, string symbol, string base_uri)",
  "function getTotalCollectionsDeployed() view returns (uint256)",
  "function getAllDeployedCollections() view returns (address[])",
  "function getCollectionInfo(address collection_address) view returns (address, string, string, string, uint256)",
  "function getCollectionsByCreator(address creator) view returns (address[])",
  "event CollectionCreated(address indexed collectionAddress, address indexed creator, string name, string symbol, string baseURI, uint256 timestamp)",
];

// Helper to wait for transaction
async function waitForTx(tx, label = "Transaction") {
  console.log(`  ⏳ Waiting for ${label} to be mined...`);
  const receipt = await tx.wait();
  console.log(`  ✅ ${label} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

async function registerCollection(collectionAddress, name, symbol, baseUri, factoryAddress) {
  console.log("=".repeat(60));
  console.log("NFT Collection Registration Script");
  console.log("=".repeat(60));
  console.log(`Factory Address: ${factoryAddress}`);
  console.log(`Collection Address: ${collectionAddress}`);
  console.log(`Name: ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Base URI: ${baseUri}`);
  console.log("=".repeat(60));
  console.log();

  if (!process.env.PRIVATE_KEY || !process.env.RPC_ENDPOINT) {
    throw new Error("PRIVATE_KEY and RPC_ENDPOINT must be set in .env file");
  }

  if (!factoryAddress) {
    throw new Error("Factory address is required (provide as argument or set NFT_FACTORY_ADDRESS in .env)");
  }

  // Setup provider and wallet (like test.js)
  const provider = new ethers.JsonRpcProvider(process.env.RPC_ENDPOINT);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const factoryContract = new ethers.Contract(
    factoryAddress,
    NFT_FACTORY_ABI,
    wallet
  );

  console.log(`👤 Wallet Address: ${wallet.address}`);
  console.log(`🌐 Network: ${process.env.RPC_ENDPOINT}`);
  console.log();

  // Step 1: Verify factory contract exists
  console.log("Step 1: Verifying factory contract...");
  try {
    const code = await provider.getCode(factoryAddress);
    if (!code || code === "0x") {
      throw new Error("Factory contract has no code");
    }
    console.log("✅ Factory contract verified");
  } catch (err) {
    console.error("❌ Factory contract verification failed:", err.message);
    throw err;
  }
  console.log();

  // Step 2: Verify collection contract exists
  console.log("Step 2: Verifying collection contract...");
  try {
    const code = await provider.getCode(collectionAddress);
    if (!code || code === "0x") {
      throw new Error("Collection contract has no code");
    }
    console.log("✅ Collection contract verified");
  } catch (err) {
    console.error("❌ Collection contract verification failed:", err.message);
    throw err;
  }
  console.log();

  // Step 3: Check if collection is already registered (like test.js)
  console.log("Step 3: Checking if collection is already registered...");
  try {
    const existingCollections = await factoryContract.getAllDeployedCollections();
    const isAlreadyRegistered = existingCollections.some(
      (addr) => addr.toLowerCase() === collectionAddress.toLowerCase()
    );

    if (isAlreadyRegistered) {
      console.log("⚠️  Collection is already registered!");
      console.log(`Total collections in factory: ${existingCollections.length}`);
      
      // Try to get collection info
      try {
        // Use raw call to decode tuple return value (like test.js)
        const iface = new ethers.Interface(NFT_FACTORY_ABI);
        const data = await provider.call({
          to: factoryAddress,
          data: iface.encodeFunctionData("getCollectionInfo", [collectionAddress])
        });
        
        // Decode the tuple manually (same approach as test.js)
        const hexData = data.startsWith('0x') ? data.slice(2) : data;
        const tupleOffset = parseInt(hexData.slice(0, 64), 16);
        const tupleStart = tupleOffset * 2;
        
        const creatorHex = hexData.slice(tupleStart + 24, tupleStart + 64);
        const creator = ethers.getAddress('0x' + creatorHex);
        
        const string1Offset = parseInt(hexData.slice(tupleStart + 64, tupleStart + 128), 16);
        const string2Offset = parseInt(hexData.slice(tupleStart + 128, tupleStart + 192), 16);
        const string3Offset = parseInt(hexData.slice(tupleStart + 192, tupleStart + 256), 16);
        
        // Read name
        const namePos = tupleStart + string1Offset * 2;
        const nameLength = parseInt(hexData.slice(namePos, namePos + 64), 16);
        const nameHex = hexData.slice(namePos + 64, namePos + 64 + nameLength * 2);
        const decodedName = Buffer.from(nameHex, 'hex').toString('utf8');
        
        // Read symbol
        const symbolPos = tupleStart + string2Offset * 2;
        const symbolLength = parseInt(hexData.slice(symbolPos, symbolPos + 64), 16);
        const symbolHex = hexData.slice(symbolPos + 64, symbolPos + 64 + symbolLength * 2);
        const decodedSymbol = Buffer.from(symbolHex, 'hex').toString('utf8');
        
        // Read baseUri
        const baseUriPos = tupleStart + string3Offset * 2;
        const baseUriLength = parseInt(hexData.slice(baseUriPos, baseUriPos + 64), 16);
        const baseUriHex = hexData.slice(baseUriPos + 64, baseUriPos + 64 + baseUriLength * 2);
        const decodedBaseUri = Buffer.from(baseUriHex, 'hex').toString('utf8');
        
        console.log("Collection info:");
        console.log(`  Creator: ${creator}`);
        console.log(`  Name: ${decodedName}`);
        console.log(`  Symbol: ${decodedSymbol}`);
        console.log(`  Base URI: ${decodedBaseUri}`);
      } catch (infoErr) {
        console.log("Could not retrieve collection info");
      }
      
      return { success: false, message: "Collection already registered" };
    }
    console.log("✅ Collection not registered yet");
    console.log(`Total collections in factory: ${existingCollections.length}`);
  } catch (err) {
    console.warn("⚠️  Could not check registration status:", err.message);
    // Continue anyway - registration will fail if already registered
  }
  console.log();

  // Step 4: Test factory callability
  console.log("Step 4: Testing factory contract callability...");
  try {
    const totalCollections = await factoryContract.getTotalCollectionsDeployed();
    console.log(`✅ Factory is callable, total collections: ${totalCollections.toString()}`);
  } catch (err) {
    console.warn("⚠️  Factory view function test failed:", err.message);
  }
  console.log();

  // Step 5: Perform actual registration (like test.js)
  console.log("Step 5: Performing actual registration...");
  try {
    console.log("Sending transaction...");
    
    // Call registerCollection (camelCase as per test.js)
    const tx = await factoryContract.registerCollection(
      collectionAddress,
      name,
      symbol,
      baseUri
    );
    
    console.log(`Transaction hash: ${tx.hash}`);
    
    // Wait for transaction
    const receipt = await waitForTx(tx, "Registration");
    
    // Listen for CollectionCreated event
    try {
      const filter = factoryContract.filters.CollectionCreated();
      const events = await factoryContract.queryFilter(
        filter,
        receipt.blockNumber
      );
      if (events.length > 0) {
        console.log("📢 Event: CollectionCreated");
        console.log(`   Collection Address: ${events[0].args.collectionAddress}`);
        console.log(`   Creator: ${events[0].args.creator}`);
        console.log(`   Name: ${events[0].args.name}`);
        console.log(`   Symbol: ${events[0].args.symbol}`);
        console.log(`   Base URI: ${events[0].args.baseURI}`);
        console.log(`   Timestamp: ${events[0].args.timestamp.toString()}`);
      }
    } catch (eventErr) {
      console.warn("Could not retrieve event:", eventErr.message);
    }
    
    console.log("✅ Registration successful!");
    return { success: true, txHash: tx.hash, receipt };
  } catch (err) {
    console.error("❌ Registration failed!");
    console.error("Error:", err.message);
    
    // Provide helpful debugging info
    if (err.reason) {
      console.error("Reason:", err.reason);
    }
    if (err.data) {
      console.error("Error data:", err.data);
    }
    
    console.log();
    console.log("=".repeat(60));
    console.log("Debugging Information:");
    console.log("=".repeat(60));
    console.log(`Factory: ${factoryAddress}`);
    console.log(`Collection: ${collectionAddress}`);
    console.log(`Name: "${name}"`);
    console.log(`Symbol: "${symbol}"`);
    console.log(`Base URI: "${baseUri}"`);
    console.log();
    console.log("Possible issues:");
    console.log("1. Collection already registered - check with getAllDeployedCollections()");
    console.log("2. Factory contract not activated - try: cargo stylus activate");
    console.log("3. Collection contract not initialized - ensure init() was called");
    console.log("4. Invalid parameters - check name/symbol/baseUri are not empty");
    console.log("5. Network/RPC issues - verify RPC endpoint is working");
    console.log("6. Insufficient gas - check wallet has enough ETH");
    
    throw err;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.error("Usage: node register-nft.js <collectionAddress> <name> <symbol> <baseUri> [factoryAddress]");
    console.error("Example: node register-nft.js 0x1234... \"MyNFT\" \"MNFT\" \"https://example.com/api/token/\"");
    process.exit(1);
  }
  
  const [collectionAddress, name, symbol, baseUri, factoryAddress] = args;
  
  // Use factory address from args, env var, or error
  const finalFactoryAddress = factoryAddress || process.env.NFT_FACTORY_ADDRESS;
  
  if (!finalFactoryAddress) {
    console.error("Error: Factory address is required. Provide as argument or set NFT_FACTORY_ADDRESS in .env");
    process.exit(1);
  }
  
  try {
    const result = await registerCollection(
      collectionAddress,
      name,
      symbol,
      baseUri,
      finalFactoryAddress
    );
    
    if (result.success) {
      console.log("\n✅ Registration completed successfully!");
      process.exit(0);
    } else {
      console.log("\n⚠️  Registration skipped:", result.message);
      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ Registration failed:", error.message);
    process.exit(1);
  }
}

main();

