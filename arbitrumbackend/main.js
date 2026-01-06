const express = require("express");
const { ethers } = require("ethers");
const solc = require("solc");
const axios = require("axios");
const FormData = require("form-data");
const OpenAI = require("openai");
const YieldCalculatorTool = require("./yieldCalculator");
require("dotenv").config();

const app = express();
app.use(express.json());

// Arbitrum Sepolia RPC URL
const ARBITRUM_SEPOLIA_RPC = "https://sepolia-rollup.arbitrum.io/rpc";

// TokenFactory Contract Address
const FACTORY_ADDRESS = "0x19Fae13F4C2fac0539b5E0baC8Ad1785f1C7dEE1";

// TokenFactory ABI
const FACTORY_ABI = [
  "function createToken(string name, string symbol, uint256 initialSupply) returns (address)",
  "function getTotalTokensDeployed() view returns (uint256)",
  "function getTokensByCreator(address creator) view returns (address[])",
  "function getLatestTokens(uint256 count) view returns (address[])",
  "function getAllDeployedTokens() view returns (address[])",
  "function getTokenInfo(address tokenAddress) view returns (address creator, string name, string symbol, uint256 initialSupply, uint256 deployedAt, uint256 currentSupply, address owner)",
  "event TokenCreated(address indexed tokenAddress, address indexed creator, string name, string symbol, uint256 initialSupply, uint256 timestamp)",
];

// NFTFactory Contract Address
const NFT_FACTORY_ADDRESS = "0x83B831848eE0A9a2574Cf62a13c23d8eDCa84E9F";

// NFTFactory ABI
const NFT_FACTORY_ABI = [
  "function createCollection(string memory name, string memory symbol, string memory baseURI) external returns (address)",
  "function getCollectionsByCreator(address creator) external view returns (address[] memory)",
  "function getCollectionInfo(address collectionAddress) external view returns (address creator, string memory name, string memory symbol, string memory baseURI, uint256 deployedAt, uint256 totalMinted, address owner)",
  "event CollectionCreated(address indexed collectionAddress, address indexed creator, string name, string symbol, string baseURI, uint256 timestamp)",
];

// DAO Contract Address (Arbitrum Sepolia - Template/Instance)
const DAO_CONTRACT_ADDRESS = "0x95d7bc3f2f8172298c2487dfeca23d86b09572f5";

// DAOFactory Contract Address (Arbitrum Sepolia)
const DAO_FACTORY_ADDRESS = "0xf4242a5bebdd12abc7d01ab9fd3f7473b3295d46";

// DAOFactory ABI (Arbitrum Stylus)
const DAO_FACTORY_ABI = [
  "function registerDao(address dao_address, string name, uint256 voting_period, uint256 quorum_percentage)",
  "function getDaoCount() view returns (uint256)",
  "function getAllDaos() view returns (address[])",
  "function getCreatorDaos(address creator) view returns (address[])",
  "event DAOCreated(address indexed daoAddress, string name, address indexed creator, uint256 votingPeriod, uint256 quorumPercentage)",
];

// DAO ABI (Arbitrum Stylus)
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
  "event ProposalExecuted(uint256 indexed proposalId, bool passed)",
];

// Airdrop Contract Address (Arbitrum Sepolia)
const AIRDROP_CONTRACT_ADDRESS = "0x6239a115e23a11033930c1892eb6b67649c12f18";

// Yield Calculator Contract Address (Arbitrum Sepolia)
const YIELD_CALCULATOR_ADDRESS = "0x70f749501b44ea186550dfca4e9f87a5d120bb4d";

// Airdrop Contract ABI (Arbitrum Stylus)
const AIRDROP_ABI = [
  "function owner() view returns (address)",
  "function init()",
  "function transferOwnership(address new_owner)",
  "function airdrop(address[] memory recipients, uint256 amount) payable",
  "function airdropWithAmounts(address[] memory recipients, uint256[] memory amounts) payable",
  "function withdraw(address to)",
  "function getBalance() view returns (uint256)",
  "event AirdropExecuted(address indexed executor, address[] recipients, uint256 amount, uint256 totalAmount, uint256 timestamp)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
];

// ERC20 Token Contract Source
const TOKEN_CONTRACT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract CustomToken {
    string private _name;
    string private _symbol;
    uint8 private _decimals;
    uint256 private _totalSupply;
    address public owner;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 totalSupply_
    ) {
        owner = msg.sender;
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        _totalSupply = totalSupply_;
        _balances[msg.sender] = totalSupply_;
        emit Transfer(address(0), msg.sender, totalSupply_);
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address tokenOwner, address spender) public view returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _transfer(from, to, amount);
        _approve(from, msg.sender, currentAllowance - amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(_balances[from] >= amount, "ERC20: transfer amount exceeds balance");
        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address tokenOwner, address spender, uint256 amount) internal {
        require(tokenOwner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowances[tokenOwner][spender] = amount;
        emit Approval(tokenOwner, spender, amount);
    }

    function sendToken(address recipient, uint256 amount) external onlyOwner {
        _transfer(address(this), recipient, amount);
    }
}
`;

// Compile Solidity contract
function compileContract() {
  const input = {
    language: "Solidity",
    sources: {
      "CustomToken.sol": {
        content: TOKEN_CONTRACT_SOURCE,
      },
    },
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Log compilation warnings
  if (output.errors) {
    const warnings = output.errors.filter((e) => e.severity === "warning");
    if (warnings.length > 0) {
      console.warn("Compilation warnings:", warnings);
    }

    const errors = output.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
      throw new Error("Compilation failed: " + JSON.stringify(errors, null, 2));
    }
  }

  if (
    !output.contracts ||
    !output.contracts["CustomToken.sol"] ||
    !output.contracts["CustomToken.sol"]["CustomToken"]
  ) {
    throw new Error("Contract not found in compilation output");
  }

  const contract = output.contracts["CustomToken.sol"]["CustomToken"];

  if (!contract.abi) {
    throw new Error("ABI not found in compilation output");
  }

  if (
    !contract.evm ||
    !contract.evm.bytecode ||
    !contract.evm.bytecode.object
  ) {
    throw new Error("Bytecode not found in compilation output");
  }

  let bytecode = contract.evm.bytecode.object;

  // Ensure bytecode has 0x prefix
  if (!bytecode.startsWith("0x")) {
    bytecode = "0x" + bytecode;
  }

  if (bytecode === "0x" || bytecode.length < 4) {
    throw new Error("Invalid bytecode generated");
  }

  return {
    abi: contract.abi,
    bytecode: bytecode,
  };
}

app.post("/transfer", async (req, res) => {
  try {
    const { privateKey, toAddress, amount, tokenAddress } = req.body;

    // Validation
    if (!privateKey || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: privateKey, toAddress, amount",
      });
    }

    // Validate and normalize address format
    let normalizedToAddress;
    try {
      // Trim whitespace first
      const trimmedAddress = toAddress.trim();

      // Basic format validation
      if (!trimmedAddress.startsWith("0x") || trimmedAddress.length !== 42) {
        return res.status(400).json({
          success: false,
          error: "Invalid recipient address format",
          details:
            "Address must start with 0x and be exactly 42 characters (0x + 40 hex chars)",
        });
      }

      // Check if it's a valid hex string
      const hexPattern = /^0x[a-fA-F0-9]{40}$/;
      if (!hexPattern.test(trimmedAddress)) {
        return res.status(400).json({
          success: false,
          error: "Invalid recipient address format",
          details:
            "Address must be a valid hex string (0x followed by 40 hex characters)",
        });
      }

      // Try to normalize to checksummed address
      // If checksum is incorrect, getAddress will fix it
      try {
        normalizedToAddress = ethers.getAddress(trimmedAddress);
      } catch (checksumError) {
        // If getAddress fails, try with lowercase (fixes checksum issues)
        try {
          normalizedToAddress = ethers.getAddress(trimmedAddress.toLowerCase());
        } catch (lowercaseError) {
          // If both fail, use the address as-is if it passed basic validation
          // This handles edge cases where the address format is valid but checksum is problematic
          normalizedToAddress = trimmedAddress.toLowerCase();
        }
      }
    } catch (addressError) {
      return res.status(400).json({
        success: false,
        error: "Invalid recipient address format",
        details: addressError.message,
      });
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be a positive number",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check native balance for gas fees
    const nativeBalance = await provider.getBalance(wallet.address);
    if (nativeBalance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient native token balance for gas fees",
        currentBalance: ethers.formatEther(nativeBalance),
        network: "Arbitrum Sepolia",
      });
    }

    // If tokenAddress is provided, transfer ERC20 tokens
    if (tokenAddress) {
      // Validate and normalize token address format
      let normalizedTokenAddress;
      try {
        normalizedTokenAddress = ethers.getAddress(tokenAddress.trim());
      } catch (tokenAddressError) {
        return res.status(400).json({
          success: false,
          error: "Invalid token address format",
          details: tokenAddressError.message,
        });
      }

      console.log(
        "Transferring ERC20 token on Arbitrum Sepolia:",
        normalizedTokenAddress
      );

      // ERC20 Token ABI for transfer
      const TOKEN_ABI = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)",
      ];

      const tokenContract = new ethers.Contract(
        normalizedTokenAddress,
        TOKEN_ABI,
        wallet
      );

      // Get token decimals
      let decimals;
      let tokenSymbol = "TOKEN";
      let tokenName = "Token";
      try {
        decimals = await tokenContract.decimals();
        tokenSymbol = await tokenContract.symbol().catch(() => "TOKEN");
        tokenName = await tokenContract.name().catch(() => "Token");
      } catch (error) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid token address or token does not support required functions",
          details: error.message,
        });
      }

      // Parse amount with proper decimals
      const amountInWei = ethers.parseUnits(amount.toString(), decimals);

      // Check token balance
      const tokenBalance = await tokenContract.balanceOf(wallet.address);
      if (tokenBalance < amountInWei) {
        return res.status(400).json({
          success: false,
          error: "Insufficient token balance",
          tokenAddress: normalizedTokenAddress,
          tokenSymbol: tokenSymbol,
          currentBalance: ethers.formatUnits(tokenBalance, decimals),
          requestedAmount: amount.toString(),
        });
      }

      // Estimate gas before transfer
      let gasEstimate;
      let gasLimit;
      try {
        gasEstimate = await tokenContract.transfer.estimateGas(
          normalizedToAddress,
          amountInWei
        );
        // Add 20% buffer for Arbitrum
        gasLimit = (gasEstimate * 120n) / 100n;
        console.log(
          `Estimated gas: ${gasEstimate.toString()}, Using: ${gasLimit.toString()}`
        );
      } catch (estimateError) {
        console.warn(
          "Gas estimation failed, proceeding without gas limit:",
          estimateError.message
        );
        gasLimit = null;
      }

      // Transfer tokens
      console.log(
        `Transferring ${amount} ${tokenSymbol} (${amountInWei.toString()} with ${decimals} decimals) on Arbitrum Sepolia`
      );

      const txOptions = {};
      if (gasLimit) {
        txOptions.gasLimit = gasLimit;
      }

      const tx = await tokenContract.transfer(
        normalizedToAddress,
        amountInWei,
        txOptions
      );
      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      console.log(`✅ Transfer confirmed in block: ${receipt.blockNumber}`);

      return res.json({
        success: true,
        type: "ERC20",
        network: "Arbitrum Sepolia",
        transactionHash: receipt.hash,
        from: wallet.address,
        to: normalizedToAddress,
        tokenAddress: normalizedTokenAddress,
        tokenName: tokenName,
        tokenSymbol: tokenSymbol,
        amount: amount,
        amountWei: amountInWei.toString(),
        decimals: Number(decimals),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: receipt.gasPrice ? receipt.gasPrice.toString() : null,
        explorerUrl: `https://sepolia.arbiscan.io/tx/${receipt.hash}`,
      });
    }

    // Native token transfer (ETH/STT on Arbitrum Sepolia)
    console.log("Transferring native token (ETH/STT) on Arbitrum Sepolia");
    const balance = await provider.getBalance(wallet.address);
    const amountInWei = ethers.parseEther(amount.toString());

    // Check if balance is sufficient (including gas)
    const feeData = await provider.getFeeData();
    const estimatedGasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
    const estimatedGasCost = estimatedGasPrice * 21000n; // Base gas for simple transfer

    if (balance < amountInWei + estimatedGasCost) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance (including gas fees)",
        currentBalance: ethers.formatEther(balance),
        requestedAmount: amount,
        estimatedGasCost: ethers.formatEther(estimatedGasCost),
        network: "Arbitrum Sepolia",
      });
    }

    // Check if recipient is a contract address
    const code = await provider.getCode(normalizedToAddress);
    const isContract = code && code !== "0x";

    if (isContract) {
      // Check if contract can receive native tokens by attempting a small call
      try {
        // Try to estimate gas with a small test amount to see if contract accepts native tokens
        await provider.estimateGas({
          to: normalizedToAddress,
          value: 1n, // Test with 1 wei
          from: wallet.address,
        });
        console.log("Contract appears to accept native token transfers");
      } catch (contractError) {
        return res.status(400).json({
          success: false,
          error: "Cannot send native tokens to this contract address",
          details:
            "The recipient address is a contract that does not accept native token transfers. Use the tokenAddress parameter to transfer ERC20 tokens instead.",
          recipientAddress: normalizedToAddress,
          isContract: true,
          suggestion:
            "If you want to transfer tokens, include the 'tokenAddress' parameter in your request",
          network: "Arbitrum Sepolia",
        });
      }
    }

    // Estimate gas for native transfer
    let gasEstimate;
    try {
      gasEstimate = await provider.estimateGas({
        to: normalizedToAddress,
        value: amountInWei,
        from: wallet.address,
      });
      console.log(
        `Estimated gas for native transfer: ${gasEstimate.toString()}`
      );
    } catch (estimateError) {
      // If gas estimation fails, provide helpful error message
      if (
        estimateError.reason &&
        estimateError.reason.includes("require(false)")
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Transaction would fail - recipient cannot receive native tokens",
          details:
            "The recipient address may be a contract that rejects native token transfers, or there may be insufficient balance for gas fees.",
          recipientAddress: normalizedToAddress,
          isContract: isContract,
          suggestion: isContract
            ? "If transferring tokens, use the 'tokenAddress' parameter. If sending to a contract, ensure it has a payable receive() or fallback() function."
            : "Ensure the recipient address is correct and can receive native tokens.",
          network: "Arbitrum Sepolia",
        });
      }
      console.warn("Gas estimation failed:", estimateError.message);
      gasEstimate = null;
    }

    const tx = {
      to: normalizedToAddress,
      value: amountInWei,
    };

    if (gasEstimate) {
      tx.gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer
    }

    try {
      const transactionResponse = await wallet.sendTransaction(tx);
      console.log(`Transaction sent: ${transactionResponse.hash}`);
      const receipt = await transactionResponse.wait();
      console.log(`✅ Transfer confirmed in block: ${receipt.blockNumber}`);

      return res.json({
        success: true,
        type: "native",
        network: "Arbitrum Sepolia",
        transactionHash: receipt.hash,
        from: wallet.address,
        to: normalizedToAddress,
        amount: amount,
        amountWei: amountInWei.toString(),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: receipt.gasPrice ? receipt.gasPrice.toString() : null,
        explorerUrl: `https://sepolia.arbiscan.io/tx/${receipt.hash}`,
      });
    } catch (txError) {
      // Handle transaction errors specifically
      if (txError.reason && txError.reason.includes("require(false)")) {
        return res.status(400).json({
          success: false,
          error:
            "Transaction reverted - recipient cannot receive native tokens",
          details:
            "The recipient contract does not accept native token transfers.",
          recipientAddress: normalizedToAddress,
          suggestion:
            "Use the 'tokenAddress' parameter to transfer ERC20 tokens instead",
          network: "Arbitrum Sepolia",
        });
      }
      throw txError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error("Transfer error:", error);

    // Provide more specific error messages
    if (error.reason && error.reason.includes("require(false)")) {
      return res.status(400).json({
        success: false,
        error: "Transaction would fail",
        details:
          "The transaction would revert. This usually means the recipient cannot receive native tokens or there's insufficient balance.",
        recipientAddress: normalizedToAddress,
        suggestion:
          "If sending to a contract, ensure it accepts native tokens. If transferring tokens, use the 'tokenAddress' parameter.",
        network: "Arbitrum Sepolia",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
      network: "Arbitrum Sepolia",
    });
  }
});

// Deploy ERC20 Token endpoint using TokenFactory
app.post("/deploy-token", async (req, res) => {
  try {
    const { privateKey, name, symbol, initialSupply } = req.body;

    // Validation
    if (!privateKey || !name || !symbol || !initialSupply) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: privateKey, name, symbol, initialSupply",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check balance for gas
    const balance = await provider.getBalance(wallet.address);
    console.log("Wallet balance:", ethers.formatEther(balance), "STT");

    if (balance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance for gas fees",
        currentBalance: ethers.formatEther(balance),
        required: "Some testnet tokens for gas",
      });
    }

    console.log("Creating token via TokenFactory:", {
      name,
      symbol,
      initialSupply,
    });
    console.log("Factory address:", FACTORY_ADDRESS);

    // Connect to TokenFactory contract
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

    // Convert initialSupply to BigInt (assuming it's provided as a number/string)
    const initialSupplyBigInt = BigInt(initialSupply.toString());

    // Estimate gas before sending transaction (for logging and optional gas limit)
    console.log("Estimating gas for createToken...");
    let gasEstimate;
    let estimatedCost = null;
    try {
      gasEstimate = await factory.createToken.estimateGas(
        name,
        symbol,
        initialSupplyBigInt
      );
      console.log("Estimated gas:", gasEstimate.toString());

      // Get current gas price for informational purposes only
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

      if (gasPrice && gasPrice > 0n) {
        estimatedCost = gasEstimate * gasPrice;
        console.log(
          "Estimated transaction cost:",
          ethers.formatEther(estimatedCost),
          "STT"
        );
        console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");

        // Only warn if balance seems insufficient, but don't block the transaction
        // Let the network reject it if truly insufficient
        if (balance < estimatedCost) {
          console.warn(
            "⚠️  Warning: Balance may be insufficient for transaction"
          );
          console.warn("   Balance:", ethers.formatEther(balance), "STT");
          console.warn(
            "   Estimated cost:",
            ethers.formatEther(estimatedCost),
            "STT"
          );
          // Continue anyway - let the transaction fail naturally if needed
        }
      }
    } catch (estimateError) {
      console.warn(
        "Gas estimation failed (will proceed anyway):",
        estimateError.message
      );
      // If estimation fails, we'll still try to send - ethers will handle it
      gasEstimate = null;
    }

    // Create token via factory with estimated gas
    console.log("Sending createToken transaction...");
    let tx;
    if (gasEstimate) {
      // Add 20% buffer to gas estimate
      const gasLimit = (gasEstimate * 120n) / 100n;
      console.log("Using gas limit:", gasLimit.toString());
      tx = await factory.createToken(name, symbol, initialSupplyBigInt, {
        gasLimit,
      });
    } else {
      // Let ethers estimate automatically if our estimation failed
      tx = await factory.createToken(name, symbol, initialSupplyBigInt);
    }
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the TokenCreated event to get the token address
    const factoryInterface = new ethers.Interface(FACTORY_ABI);
    let newTokenAddress = null;

    for (const log of receipt.logs) {
      try {
        const parsedLog = factoryInterface.parseLog(log);
        if (parsedLog && parsedLog.name === "TokenCreated") {
          newTokenAddress = parsedLog.args.tokenAddress;
          break;
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }

    if (!newTokenAddress) {
      throw new Error(
        "TokenCreated event not found in transaction receipt. Token creation may have failed."
      );
    }

    console.log("Token created at address:", newTokenAddress);

    // IMPORTANT: The tokens are minted to the factory contract, not the creator
    // We need to check the factory's balance and transfer tokens to the creator
    const TOKEN_ABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
      "function owner() view returns (address)",
      "function mint(address to, uint256 amount) returns ()",
    ];

    const tokenContract = new ethers.Contract(
      newTokenAddress,
      TOKEN_ABI,
      wallet
    );

    // Check factory's token balance
    const factoryBalance = await tokenContract.balanceOf(FACTORY_ADDRESS);
    const tokenDecimals = await tokenContract.decimals().catch(() => 18);
    const expectedSupply =
      BigInt(initialSupply.toString()) * 10n ** BigInt(tokenDecimals);

    console.log(
      `Factory token balance: ${ethers.formatUnits(
        factoryBalance,
        tokenDecimals
      )}`
    );
    console.log(
      `Expected supply: ${ethers.formatUnits(expectedSupply, tokenDecimals)}`
    );

    // Try to transfer tokens from factory to creator
    // Since the factory owns the tokens initially, we need to use the owner's mint function
    // OR if the factory has a way to transfer, we'd use that
    // For now, check if creator is owner and can mint (though this increases supply)
    let transferSuccess = false;
    let transferTxHash = null;

    try {
      const tokenOwner = await tokenContract.owner();
      console.log(`Token owner: ${tokenOwner}`);
      console.log(`Creator wallet: ${wallet.address}`);

      if (tokenOwner.toLowerCase() === wallet.address.toLowerCase()) {
        // Creator is the owner - we can mint new tokens to the creator
        // But this increases total supply, so we'll check if factory has tokens first
        if (factoryBalance > 0n) {
          console.log(
            "⚠️  Tokens are in factory contract. Attempting to use mint function..."
          );
          // Note: Minting will increase total supply, but it's the only way without modifying factory
          // Actually, we can't transfer from factory without factory's approval
          // So we'll mint equivalent tokens to creator
          const mintTx = await tokenContract.mint(
            wallet.address,
            initialSupplyBigInt
          );
          const mintReceipt = await mintTx.wait();
          transferSuccess = true;
          transferTxHash = mintReceipt.hash;
          console.log(
            `✅ Minted ${initialSupply} tokens to creator: ${mintReceipt.hash}`
          );
        }
      } else {
        console.log("⚠️  Creator is not the token owner. Cannot mint tokens.");
      }
    } catch (transferError) {
      console.warn(
        "Could not transfer/mint tokens to creator:",
        transferError.message
      );
      // Continue anyway - user can manually transfer later if needed
    }

    // Optionally get token info from factory
    let tokenInfo = null;
    try {
      const info = await factory.getTokenInfo(newTokenAddress);
      tokenInfo = {
        name: info.name,
        symbol: info.symbol,
        initialSupply: info.initialSupply.toString(),
        currentSupply: ethers.formatUnits(info.currentSupply, 18),
        creator: info.creator,
        owner: info.owner,
        deployedAt: new Date(Number(info.deployedAt) * 1000).toISOString(),
      };
    } catch (infoError) {
      console.warn(
        "Could not fetch token info from factory:",
        infoError.message
      );
      // Fallback to basic info
      tokenInfo = {
        name,
        symbol,
        initialSupply: initialSupply.toString(),
      };
    }

    // Check creator's final balance
    const creatorBalance = await tokenContract.balanceOf(wallet.address);

    return res.json({
      success: true,
      message: "Token created successfully via TokenFactory",
      contractAddress: newTokenAddress,
      tokenInfo: tokenInfo,
      creator: wallet.address,
      factoryAddress: FACTORY_ADDRESS,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: `https://sepolia.arbiscan.io/tx/${tx.hash}`,
      tokenTransfer: {
        success: transferSuccess,
        method: transferSuccess ? "minted" : "none",
        transactionHash: transferTxHash,
        note: transferSuccess
          ? `Tokens minted to your wallet. Note: This increases total supply.`
          : `Initial tokens are in factory contract. You may need to mint tokens using the owner's mint function.`,
      },
      balances: {
        factory: ethers.formatUnits(factoryBalance, tokenDecimals),
        creator: ethers.formatUnits(creatorBalance, tokenDecimals),
        expected: initialSupply.toString(),
      },
      note: transferSuccess
        ? `${initialSupply} tokens have been minted to your wallet address.`
        : `⚠️  Initial tokens (${initialSupply}) are in the factory contract. You are the token owner and can mint tokens using the mint function.`,
      nextSteps: transferSuccess
        ? [
            `✅ ${initialSupply} tokens are now in your wallet: ${wallet.address}`,
            `To transfer tokens to someone, use the /transfer endpoint with:`,
            `  - privateKey: Your wallet private key`,
            `  - toAddress: Recipient's wallet address`,
            `  - amount: Amount of tokens to send (as a number, e.g., "100")`,
            `  - tokenAddress: ${newTokenAddress}`,
          ]
        : [
            `⚠️  Note: Initial tokens are in the factory contract (${FACTORY_ADDRESS})`,
            `You are the token owner and can mint tokens using the token contract's mint function.`,
            `To transfer tokens to someone, first ensure you have tokens in your wallet, then use the /transfer endpoint.`,
          ],
    });
  } catch (error) {
    console.error("Deploy token error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

// Deploy ERC-721 NFT Collection endpoint using NFTFactory
app.post("/deploy-nft-collection", async (req, res) => {
  try {
    const { privateKey, name, symbol, baseURI } = req.body;

    // Validation
    if (!privateKey || !name || !symbol || !baseURI) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: privateKey, name, symbol, baseURI",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check balance for gas
    const balance = await provider.getBalance(wallet.address);
    console.log("Wallet balance:", ethers.formatEther(balance), "STT");

    if (balance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance for gas fees",
        currentBalance: ethers.formatEther(balance),
        required: "Some testnet tokens for gas",
      });
    }

    console.log("Creating NFT collection via NFTFactory:", {
      name,
      symbol,
      baseURI,
    });
    console.log("Factory address:", NFT_FACTORY_ADDRESS);

    // Connect to NFTFactory contract
    const factory = new ethers.Contract(
      NFT_FACTORY_ADDRESS,
      NFT_FACTORY_ABI,
      wallet
    );

    // Estimate gas before sending transaction (for logging and optional gas limit)
    console.log("Estimating gas for createCollection...");
    let gasEstimate;
    let estimatedCost = null;
    try {
      gasEstimate = await factory.createCollection.estimateGas(
        name,
        symbol,
        baseURI
      );
      console.log("Estimated gas:", gasEstimate.toString());

      // Get current gas price for informational purposes only
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

      if (gasPrice && gasPrice > 0n) {
        estimatedCost = gasEstimate * gasPrice;
        console.log(
          "Estimated transaction cost:",
          ethers.formatEther(estimatedCost),
          "STT"
        );
        console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");

        // Only warn if balance seems insufficient, but don't block the transaction
        if (balance < estimatedCost) {
          console.warn(
            "⚠️  Warning: Balance may be insufficient for transaction"
          );
          console.warn("   Balance:", ethers.formatEther(balance), "STT");
          console.warn(
            "   Estimated cost:",
            ethers.formatEther(estimatedCost),
            "STT"
          );
        }
      }
    } catch (estimateError) {
      console.warn(
        "Gas estimation failed (will proceed anyway):",
        estimateError.message
      );
      gasEstimate = null;
    }

    // Create collection via factory with estimated gas
    console.log("Sending createCollection transaction...");
    let tx;
    if (gasEstimate) {
      // Add 20% buffer to gas estimate
      const gasLimit = (gasEstimate * 120n) / 100n;
      console.log("Using gas limit:", gasLimit.toString());
      tx = await factory.createCollection(name, symbol, baseURI, { gasLimit });
    } else {
      // Let ethers estimate automatically if our estimation failed
      tx = await factory.createCollection(name, symbol, baseURI);
    }
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the CollectionCreated event to get the collection address
    const factoryInterface = new ethers.Interface(NFT_FACTORY_ABI);
    let collectionAddress = null;

    for (const log of receipt.logs) {
      try {
        const parsedLog = factoryInterface.parseLog(log);
        if (parsedLog && parsedLog.name === "CollectionCreated") {
          collectionAddress = parsedLog.args.collectionAddress;
          break;
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }

    if (!collectionAddress) {
      throw new Error(
        "CollectionCreated event not found in transaction receipt. Collection creation may have failed."
      );
    }

    console.log("NFT collection created at address:", collectionAddress);

    // Optionally get collection info from factory
    let collectionInfo = null;
    try {
      const info = await factory.getCollectionInfo(collectionAddress);
      collectionInfo = {
        name: info.name,
        symbol: info.symbol,
        baseURI: info.baseURI,
        totalMinted: info.totalMinted.toString(),
        creator: info.creator,
        owner: info.owner,
        deployedAt: new Date(Number(info.deployedAt) * 1000).toISOString(),
      };
    } catch (infoError) {
      console.warn(
        "Could not fetch collection info from factory:",
        infoError.message
      );
      // Fallback to basic info
      collectionInfo = {
        name,
        symbol,
        baseURI,
      };
    }

    return res.json({
      success: true,
      message: "NFT collection created successfully via NFTFactory",
      collectionAddress: collectionAddress,
      collectionInfo: collectionInfo,
      creator: wallet.address,
      factoryAddress: NFT_FACTORY_ADDRESS,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: `https://sepolia.arbiscan.io/tx/${tx.hash}`,
    });
  } catch (error) {
    console.error("Deploy NFT collection error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

// NFT Collection ABI for minting
const NFT_COLLECTION_ABI = [
  "function mint(address to) returns (uint256)",
  "function mintWithURI(address to, string memory uri) returns (uint256)",
  "function owner() view returns (address)",
  "function totalMinted() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];

// Function to upload JSON metadata to IPFS using Pinata
async function uploadToIPFS(metadata) {
  try {
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

    // If Pinata keys are not set, use public IPFS gateway (for demo - not recommended for production)
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      console.warn("⚠️  PINATA_API_KEY or PINATA_SECRET_KEY not set in .env");
      console.warn(
        "   Using alternative method - uploading to public IPFS gateway"
      );

      // Alternative: Use NFT.Storage or web3.storage
      // For now, return a placeholder that user needs to upload manually
      // Or use a free service like Pinata public gateway
      throw new Error(
        "IPFS upload requires PINATA_API_KEY and PINATA_SECRET_KEY in .env file. Please add them."
      );
    }

    // Convert metadata to JSON string
    const metadataJSON = JSON.stringify(metadata);

    // Create FormData for Pinata
    const formData = new FormData();
    formData.append("file", Buffer.from(metadataJSON), {
      filename: "metadata.json",
      contentType: "application/json",
    });

    // Pinata pinJSONToIPFS endpoint
    const pinataMetadata = JSON.stringify({
      name: `NFT Metadata - ${metadata.name || "Untitled"}`,
    });

    formData.append("pinataMetadata", pinataMetadata);

    const pinataOptions = JSON.stringify({
      cidVersion: 1,
    });
    formData.append("pinataOptions", pinataOptions);

    // Upload to Pinata
    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const ipfsHash = response.data.IpfsHash;
    const ipfsUrl = `ipfs://${ipfsHash}`;

    console.log("✅ Metadata uploaded to IPFS:", ipfsUrl);
    return ipfsUrl;
  } catch (error) {
    console.error("IPFS upload error:", error.message);

    // If Pinata fails, try alternative: upload metadata JSON to a folder structure
    // For this, we'll use Pinata's pinJSONToIPFS for the baseURI folder
    if (error.message.includes("PINATA")) {
      throw error;
    }

    // Try using pinJSONToIPFS directly (simpler but less flexible)
    try {
      const PINATA_API_KEY = process.env.PINATA_API_KEY;
      const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

      if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
        throw new Error(
          "PINATA_API_KEY and PINATA_SECRET_KEY required for IPFS upload"
        );
      }

      const response = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: metadata,
          pinataMetadata: {
            name: `metadata-${Date.now()}.json`,
          },
        },
        {
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      const ipfsHash = response.data.IpfsHash;
      const ipfsUrl = `ipfs://${ipfsHash}`;

      console.log("✅ Metadata uploaded to IPFS:", ipfsUrl);
      return ipfsUrl;
    } catch (fallbackError) {
      throw new Error(`IPFS upload failed: ${fallbackError.message}`);
    }
  }
}

// Function to upload directory structure to IPFS (for baseURI)
async function uploadBaseURIToIPFS(collectionName, collectionSymbol) {
  try {
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error(
        "PINATA_API_KEY and PINATA_SECRET_KEY required for IPFS upload"
      );
    }

    // Create a placeholder metadata file for the directory
    const placeholderMetadata = {
      name: `${collectionName} - Token #1`,
      description: `An NFT from ${collectionName} collection`,
      image: "ipfs://placeholder", // User should upload images separately
      attributes: [],
    };

    // For baseURI, we'll return a Pinata IPFS gateway URL structure
    // Users will upload individual token metadata files later
    // For now, we'll create a directory structure reference
    const directoryMetadata = {
      name: `${collectionName} Collection`,
      description: `Base directory for ${collectionName} NFT metadata`,
      collection: collectionName,
      symbol: collectionSymbol,
    };

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: directoryMetadata,
        pinataMetadata: {
          name: `${collectionSymbol}-base-directory`,
        },
      },
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const ipfsHash = response.data.IpfsHash;
    // Return baseURI pointing to this directory (tokens will be numbered: 1, 2, 3, etc.)
    const baseURI = `ipfs://${ipfsHash}/`;

    console.log("✅ Base directory created on IPFS:", baseURI);
    return baseURI;
  } catch (error) {
    throw new Error(`Failed to create IPFS base directory: ${error.message}`);
  }
}

// Simplified NFT collection creation with automatic IPFS upload
app.post("/create-nft-collection", async (req, res) => {
  try {
    const { privateKey, name, symbol } = req.body;

    // Validation
    if (!privateKey || !name || !symbol) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: privateKey, name, symbol",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log("Wallet balance:", ethers.formatEther(balance), "STT");

    if (balance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance for gas fees",
        currentBalance: ethers.formatEther(balance),
      });
    }

    console.log("🚀 Creating NFT collection with automatic IPFS upload...");
    console.log(`Collection: ${name} (${symbol})`);

    // Step 1: Generate metadata for first NFT
    const firstTokenMetadata = {
      name: `${name} #1`,
      description: `The first NFT from ${name} collection`,
      image: `ipfs://placeholder`, // Users can upload images later
      attributes: [
        {
          trait_type: "Collection",
          value: name,
        },
        {
          trait_type: "Token Number",
          value: "1",
        },
      ],
    };

    // Step 2: Upload first token metadata to IPFS
    console.log("📤 Uploading metadata to IPFS...");
    let tokenMetadataIPFS;
    try {
      tokenMetadataIPFS = await uploadToIPFS(firstTokenMetadata);
      console.log("✅ Metadata uploaded:", tokenMetadataIPFS);
    } catch (ipfsError) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata to IPFS",
        details: ipfsError.message,
        instruction:
          "Please set PINATA_API_KEY and PINATA_SECRET_KEY in your .env file",
      });
    }

    // Step 3: Create baseURI directory on IPFS
    // Extract the IPFS hash from the metadata URL and use it as base
    // For simplicity, we'll use a pattern where tokenId is appended
    const ipfsHashMatch = tokenMetadataIPFS.match(/ipfs:\/\/([^\/]+)/);
    if (!ipfsHashMatch) {
      throw new Error("Failed to extract IPFS hash from metadata URL");
    }

    // For baseURI, we'll use a directory structure
    // Since we have the hash, we'll create a parent directory reference
    // In practice, you'd want to pin a directory structure
    // For now, we'll use the hash pattern where {tokenId} gets appended
    const ipfsHash = ipfsHashMatch[1];
    const baseURI = `ipfs://${ipfsHash.substring(0, ipfsHash.length - 2)}/`; // Simplified approach

    // Better approach: Use the actual IPFS directory structure
    // Let's upload to a proper directory structure
    let finalBaseURI;
    try {
      finalBaseURI = await uploadBaseURIToIPFS(name, symbol);
      // Update to use directory structure
      const dirHashMatch = finalBaseURI.match(/ipfs:\/\/([^\/]+)/);
      if (dirHashMatch) {
        finalBaseURI = `ipfs://${dirHashMatch[1]}/`;
      }
    } catch (dirError) {
      // Fallback to using metadata hash pattern
      console.warn(
        "Could not create directory structure, using metadata hash pattern"
      );
      finalBaseURI = `ipfs://${ipfsHash.substring(0, 20)}/`; // Simplified pattern
    }

    console.log("📁 Base URI:", finalBaseURI);

    // Step 4: Create NFT collection with IPFS baseURI
    console.log("🏭 Creating NFT collection on blockchain...");
    const factory = new ethers.Contract(
      NFT_FACTORY_ADDRESS,
      NFT_FACTORY_ABI,
      wallet
    );

    let createTx;
    try {
      const gasEstimate = await factory.createCollection.estimateGas(
        name,
        symbol,
        finalBaseURI
      );
      const gasLimit = (gasEstimate * 120n) / 100n;
      createTx = await factory.createCollection(name, symbol, finalBaseURI, {
        gasLimit,
      });
    } catch (estimateError) {
      console.warn("Gas estimation failed, proceeding without gas limit");
      createTx = await factory.createCollection(name, symbol, finalBaseURI);
    }

    const createReceipt = await createTx.wait();

    // Parse CollectionCreated event
    const factoryInterface = new ethers.Interface(NFT_FACTORY_ABI);
    let collectionAddress = null;

    for (const log of createReceipt.logs) {
      try {
        const parsedLog = factoryInterface.parseLog(log);
        if (parsedLog && parsedLog.name === "CollectionCreated") {
          collectionAddress = parsedLog.args.collectionAddress;
          break;
        }
      } catch (e) {}
    }

    if (!collectionAddress) {
      throw new Error("Failed to extract collection address from transaction");
    }

    console.log("✅ Collection created:", collectionAddress);

    // Step 5: Mint first NFT to the wallet owner
    console.log("🎨 Minting first NFT...");
    const nftContract = new ethers.Contract(
      collectionAddress,
      NFT_COLLECTION_ABI,
      wallet
    );

    // Mint with the specific metadata URI
    const mintTx = await nftContract.mintWithURI(
      wallet.address,
      tokenMetadataIPFS
    );
    const mintReceipt = await mintTx.wait();

    const totalMinted = await nftContract.totalMinted();
    const tokenId = Number(totalMinted);

    console.log("✅ NFT minted successfully!");

    return res.json({
      success: true,
      message: "NFT collection created and first NFT minted successfully",
      collection: {
        address: collectionAddress,
        name: name,
        symbol: symbol,
        baseURI: finalBaseURI,
      },
      firstNFT: {
        tokenId: tokenId.toString(),
        owner: wallet.address,
        metadataURI: tokenMetadataIPFS,
        metadata: firstTokenMetadata,
      },
      transactions: {
        collectionCreation: createReceipt.hash,
        minting: mintReceipt.hash,
      },
      blockNumber: mintReceipt.blockNumber,
      gasUsed: (
        BigInt(createReceipt.gasUsed) + BigInt(mintReceipt.gasUsed)
      ).toString(),
      explorerUrls: {
        collection: `https://sepolia.arbiscan.io/tx/${createReceipt.hash}`,
        mint: `https://sepolia.arbiscan.io/tx/${mintReceipt.hash}`,
      },
      nextSteps: [
        `Your collection is live at: ${collectionAddress}`,
        `Upload NFT images to IPFS and update metadata`,
        `Use the collection address to mint more NFTs`,
        `Metadata for token #${tokenId} is available at: ${tokenMetadataIPFS}`,
      ],
    });
  } catch (error) {
    console.error("Create NFT collection error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

// Complete NFT creation and minting flow
app.post("/create-and-mint-nft", async (req, res) => {
  try {
    const {
      privateKey,
      collectionAddress, // Optional: if provided, uses existing collection
      // Collection creation params (if collectionAddress not provided)
      collectionName,
      collectionSymbol,
      baseURI, // Optional: if not provided, will be generated
      // NFT minting params
      recipientAddress, // Address to receive the NFT
      // NFT metadata
      nftName,
      nftDescription,
      imageUrl, // URL or IPFS hash of the image
      attributes, // Optional: array of {trait_type, value} objects
    } = req.body;

    // Validation
    if (!privateKey || !recipientAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: privateKey, recipientAddress",
      });
    }

    // If collectionAddress not provided, need collection creation params
    if (!collectionAddress && (!collectionName || !collectionSymbol)) {
      return res.status(400).json({
        success: false,
        error:
          "Either provide collectionAddress or collectionName + collectionSymbol",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log("Wallet balance:", ethers.formatEther(balance), "STT");

    if (balance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance for gas fees",
        currentBalance: ethers.formatEther(balance),
      });
    }

    let finalCollectionAddress = collectionAddress;
    let finalBaseURI = baseURI;

    // Step 1: Create collection if not provided
    if (!collectionAddress) {
      console.log("Creating new NFT collection...");

      // If baseURI not provided, create a placeholder
      if (!finalBaseURI) {
        finalBaseURI = `https://api.example.com/metadata/${collectionSymbol.toLowerCase()}/`;
        console.log(
          "⚠️  No baseURI provided, using placeholder. Update collection baseURI later if needed."
        );
      }

      const factory = new ethers.Contract(
        NFT_FACTORY_ADDRESS,
        NFT_FACTORY_ABI,
        wallet
      );

      // Estimate and create collection
      let tx;
      try {
        const gasEstimate = await factory.createCollection.estimateGas(
          collectionName,
          collectionSymbol,
          finalBaseURI
        );
        const gasLimit = (gasEstimate * 120n) / 100n;
        tx = await factory.createCollection(
          collectionName,
          collectionSymbol,
          finalBaseURI,
          { gasLimit }
        );
      } catch (estimateError) {
        console.warn("Gas estimation failed, proceeding without gas limit");
        tx = await factory.createCollection(
          collectionName,
          collectionSymbol,
          finalBaseURI
        );
      }

      const receipt = await tx.wait();

      // Parse CollectionCreated event
      const factoryInterface = new ethers.Interface(NFT_FACTORY_ABI);
      for (const log of receipt.logs) {
        try {
          const parsedLog = factoryInterface.parseLog(log);
          if (parsedLog && parsedLog.name === "CollectionCreated") {
            finalCollectionAddress = parsedLog.args.collectionAddress;
            break;
          }
        } catch (e) {}
      }

      if (!finalCollectionAddress) {
        throw new Error(
          "Failed to extract collection address from transaction"
        );
      }

      console.log("✅ Collection created at:", finalCollectionAddress);
    } else {
      console.log("Using existing collection:", finalCollectionAddress);
    }

    // Step 2: Connect to NFT collection contract
    const nftContract = new ethers.Contract(
      finalCollectionAddress,
      NFT_COLLECTION_ABI,
      wallet
    );

    // Verify ownership (only owner can mint)
    const owner = await nftContract.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: "Only collection owner can mint NFTs",
        collectionOwner: owner,
        yourAddress: wallet.address,
      });
    }

    // Step 3: Generate metadata JSON
    const tokenId = Number(await nftContract.totalMinted()) + 1; // Next token ID
    const metadata = {
      name: nftName || `NFT #${tokenId}`,
      description:
        nftDescription || `An NFT from ${collectionName || "collection"}`,
      image: imageUrl || "",
      attributes: attributes || [],
    };

    // Construct metadata URI
    // Option 1: If using baseURI with token ID
    let tokenMetadataURI = "";
    if (finalBaseURI && !finalBaseURI.endsWith("/")) {
      finalBaseURI = finalBaseURI + "/";
    }

    if (finalBaseURI && finalBaseURI.startsWith("http")) {
      // HTTP/HTTPS baseURI - append token ID
      tokenMetadataURI = `${finalBaseURI}${tokenId}`;
    } else if (finalBaseURI && finalBaseURI.startsWith("ipfs://")) {
      // IPFS baseURI - append token ID
      tokenMetadataURI = `${finalBaseURI}${tokenId}`;
    } else {
      // No baseURI or custom - would need to upload metadata separately
      // For now, we'll use mintWithURI if they provide a custom URI
      tokenMetadataURI = finalBaseURI || "";
    }

    console.log("📝 Generated metadata:", JSON.stringify(metadata, null, 2));
    console.log(
      "🔗 Token metadata URI:",
      tokenMetadataURI || "(will use baseURI + tokenId)"
    );

    // Step 4: Mint the NFT
    let mintTx;
    if (tokenMetadataURI && !tokenMetadataURI.endsWith(tokenId.toString())) {
      // Custom URI provided - use mintWithURI
      console.log("Minting NFT with custom URI...");
      mintTx = await nftContract.mintWithURI(
        recipientAddress,
        tokenMetadataURI
      );
    } else {
      // Use standard mint (will use baseURI + tokenId)
      console.log("Minting NFT...");
      mintTx = await nftContract.mint(recipientAddress);
    }

    console.log("Transaction hash:", mintTx.hash);
    const mintReceipt = await mintTx.wait();
    console.log("✅ NFT minted successfully");

    // Get final token ID (in case it changed)
    const totalMinted = await nftContract.totalMinted();
    const finalTokenId = Number(totalMinted);
    const finalTokenURI = await nftContract
      .tokenURI(finalTokenId)
      .catch(() => "");

    return res.json({
      success: true,
      message: "NFT created and minted successfully",
      collectionAddress: finalCollectionAddress,
      tokenId: finalTokenId.toString(),
      recipient: recipientAddress,
      metadata: metadata,
      metadataURI:
        finalTokenURI || tokenMetadataURI || `${finalBaseURI}${finalTokenId}`,
      mintTransactionHash: mintReceipt.hash,
      blockNumber: mintReceipt.blockNumber,
      gasUsed: mintReceipt.gasUsed.toString(),
      explorerUrl: `https://sepolia.arbiscan.io/tx/${mintReceipt.hash}`,
      nextSteps: tokenMetadataURI
        ? []
        : [
            "Upload the metadata JSON to your storage (IPFS, Arweave, or your server)",
            `Update the collection baseURI to point to your metadata location`,
            `Metadata should be accessible at: ${finalBaseURI}${finalTokenId}`,
          ],
    });
  } catch (error) {
    console.error("Create and mint NFT error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

// Create DAO endpoint using DAOFactory
app.post("/create-dao", async (req, res) => {
  try {
    const {
      privateKey,
      name,
      votingPeriod, // in seconds (e.g., 604800 for 7 days)
      quorumPercentage, // percentage (e.g., 51 for 51%)
    } = req.body;

    // Validation
    if (!privateKey || !name || !votingPeriod || !quorumPercentage) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: privateKey, name, votingPeriod, quorumPercentage",
      });
    }

    // Validate quorum percentage (should be between 0 and 100)
    const quorum = Number(quorumPercentage);
    if (isNaN(quorum) || quorum < 0 || quorum > 100) {
      return res.status(400).json({
        success: false,
        error: "quorumPercentage must be a number between 0 and 100",
      });
    }

    // Validate voting period (should be positive)
    const votingPeriodNum = Number(votingPeriod);
    if (isNaN(votingPeriodNum) || votingPeriodNum <= 0) {
      return res.status(400).json({
        success: false,
        error: "votingPeriod must be a positive number (in seconds)",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Check balance for gas
    const balance = await provider.getBalance(wallet.address);
    console.log("Wallet balance:", ethers.formatEther(balance), "STT");

    if (balance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance for gas fees",
        currentBalance: ethers.formatEther(balance),
        required: "Some testnet tokens for gas",
      });
    }

    // Use provided DAO address or default to template
    const daoAddress = req.body.daoAddress || DAO_CONTRACT_ADDRESS;

    if (!ethers.isAddress(daoAddress)) {
      return res.status(400).json({
        success: false,
        error: "Invalid DAO contract address",
      });
    }

    console.log("Creating DAO:", {
      name,
      votingPeriod,
      quorumPercentage,
      daoAddress: daoAddress,
    });
    console.log("Factory address:", DAO_FACTORY_ADDRESS);

    // Convert to BigInt
    const votingPeriodBigInt = BigInt(votingPeriod.toString());
    const quorumPercentageBigInt = BigInt(quorumPercentage.toString());

    // Step 1: Initialize the DAO contract
    console.log("Step 1: Initializing DAO contract...");
    const daoContract = new ethers.Contract(daoAddress, DAO_ABI, wallet);

    let initTx;
    let initReceipt;
    try {
      // Estimate gas for init
      let initGasEstimate;
      try {
        initGasEstimate = await daoContract.init.estimateGas(
          name,
          wallet.address, // creator
          votingPeriodBigInt,
          quorumPercentageBigInt
        );
        console.log("Init gas estimate:", initGasEstimate.toString());
      } catch (estimateError) {
        console.warn("Init gas estimation failed:", estimateError.message);
        initGasEstimate = null;
      }

      // Call init
      if (initGasEstimate) {
        const initGasLimit = (initGasEstimate * 120n) / 100n;
        initTx = await daoContract.init(
          name,
          wallet.address,
          votingPeriodBigInt,
          quorumPercentageBigInt,
          { gasLimit: initGasLimit }
        );
      } else {
        initTx = await daoContract.init(
          name,
          wallet.address,
          votingPeriodBigInt,
          quorumPercentageBigInt
        );
      }

      console.log("Init transaction hash:", initTx.hash);
      initReceipt = await initTx.wait();
      console.log("✅ DAO initialized in block:", initReceipt.blockNumber);
    } catch (initError) {
      // If init fails, it might already be initialized - continue anyway
      console.warn(
        "DAO init failed (may already be initialized):",
        initError.message
      );
      // Continue to registration - the factory will handle duplicates
    }

    // Step 2: Register DAO in factory
    console.log("Step 2: Registering DAO in factory...");
    const factory = new ethers.Contract(
      DAO_FACTORY_ADDRESS,
      DAO_FACTORY_ABI,
      wallet
    );

    // Estimate gas for registration
    let registerGasEstimate;
    try {
      registerGasEstimate = await factory.registerDao.estimateGas(
        daoAddress,
        name,
        votingPeriodBigInt,
        quorumPercentageBigInt
      );
      console.log("Register gas estimate:", registerGasEstimate.toString());
    } catch (estimateError) {
      console.warn("Register gas estimation failed:", estimateError.message);
      registerGasEstimate = null;
    }

    // Register DAO
    let registerTx;
    if (registerGasEstimate) {
      const registerGasLimit = (registerGasEstimate * 120n) / 100n;
      registerTx = await factory.registerDao(
        daoAddress,
        name,
        votingPeriodBigInt,
        quorumPercentageBigInt,
        { gasLimit: registerGasLimit }
      );
    } else {
      registerTx = await factory.registerDao(
        daoAddress,
        name,
        votingPeriodBigInt,
        quorumPercentageBigInt
      );
    }

    console.log("Register transaction hash:", registerTx.hash);
    const registerReceipt = await registerTx.wait();
    console.log("✅ DAO registered in block:", registerReceipt.blockNumber);

    // Parse the DAOCreated event from factory
    const factoryInterface = new ethers.Interface(DAO_FACTORY_ABI);
    let eventData = null;

    for (const log of registerReceipt.logs) {
      try {
        const parsedLog = factoryInterface.parseLog(log);
        if (parsedLog && parsedLog.name === "DAOCreated") {
          eventData = parsedLog.args;
          break;
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }

    // Get DAO info from the contract
    let daoInfo = null;
    try {
      daoInfo = {
        name: await daoContract.name(),
        creator: await daoContract.creator(),
        memberCount: (await daoContract.memberCount()).toString(),
        votingPeriod: (await daoContract.votingPeriod()).toString(),
        quorumPercentage: (await daoContract.quorumPercentage()).toString(),
        proposalCount: (await daoContract.proposalCount()).toString(),
        totalVotingPower: (await daoContract.getTotalVotingPower()).toString(),
      };
    } catch (infoError) {
      console.warn("Could not fetch DAO info:", infoError.message);
      // Fallback to basic info
      daoInfo = {
        name: name,
        votingPeriod: votingPeriod.toString(),
        quorumPercentage: quorumPercentage.toString(),
      };
    }

    // Calculate voting period in days for readability
    const votingPeriodDays = votingPeriodNum / (24 * 60 * 60);

    return res.json({
      success: true,
      message: "DAO initialized and registered successfully",
      dao: {
        address: daoAddress,
        name: daoInfo.name || name,
        creator: daoInfo.creator || wallet.address,
        memberCount: daoInfo.memberCount || "1", // Creator is automatically added
        votingPeriod: {
          seconds: votingPeriod.toString(),
          days: (votingPeriodNum / (24 * 60 * 60)).toFixed(2),
        },
        quorumPercentage:
          daoInfo.quorumPercentage || quorumPercentage.toString(),
        proposalCount: daoInfo.proposalCount || "0",
        totalVotingPower: daoInfo.totalVotingPower || "1", // Creator has 1 voting power
      },
      transactions: {
        init: initReceipt
          ? {
              hash: initReceipt.hash,
              blockNumber: initReceipt.blockNumber,
              gasUsed: initReceipt.gasUsed.toString(),
            }
          : null,
        register: {
          hash: registerReceipt.hash,
          blockNumber: registerReceipt.blockNumber,
          gasUsed: registerReceipt.gasUsed.toString(),
        },
      },
      factoryAddress: DAO_FACTORY_ADDRESS,
      explorerUrls: {
        init: initReceipt
          ? `https://sepolia.arbiscan.io/tx/${initReceipt.hash}`
          : null,
        register: `https://sepolia.arbiscan.io/tx/${registerReceipt.hash}`,
      },
      event: eventData
        ? {
            daoAddress: eventData.daoAddress,
            name: eventData.name,
            creator: eventData.creator,
            votingPeriod: eventData.votingPeriod.toString(),
            quorumPercentage: eventData.quorumPercentage.toString(),
          }
        : null,
      nextSteps: [
        `Your DAO is live at: ${daoAddress}`,
        `Add members using addMember function`,
        `Create proposals using createProposal function`,
        `Members can vote using vote function`,
        `Execute proposals after voting period ends using executeProposal`,
      ],
    });
  } catch (error) {
    console.error("Create DAO error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

// Swap helper functions (from swap.js)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTokenDecimals(contract) {
  try {
    return await contract.decimals();
  } catch {
    return 18; // Default to 18 if call fails
  }
}

async function checkBalance(tokenContract, walletAddress, amountWei, decimals) {
  const balance = await tokenContract.balanceOf(walletAddress);
  const balanceReadable = ethers.formatUnits(balance, decimals);

  console.log(`Token balance: ${balanceReadable}`);

  if (balance < amountWei) {
    const amountReadable = ethers.formatUnits(amountWei, decimals);
    console.log(
      `❌ Insufficient balance! Need ${amountReadable} but have ${balanceReadable}`
    );
    return false;
  }
  return true;
}

async function approveToken(
  tokenContract,
  spenderAddress,
  amountWei,
  wallet,
  decimals
) {
  // Check current allowance (for info only)
  const currentAllowance = await tokenContract.allowance(
    wallet.address,
    spenderAddress
  );
  console.log(
    `Current allowance: ${ethers.formatUnits(currentAllowance, decimals)}`
  );

  // If allowance is sufficient, skip approval
  if (currentAllowance >= amountWei) {
    console.log("✅ Sufficient allowance already exists");
    return { hash: null, success: true };
  }

  console.log("Approving tokens...");

  // Estimate gas
  let gasLimit;
  try {
    const gasEstimate = await tokenContract.approve.estimateGas(
      spenderAddress,
      amountWei
    );
    gasLimit = (gasEstimate * 120n) / 100n; // Add 20% buffer
  } catch (e) {
    console.log(`⚠ Gas estimation failed, using fallback: 100000`);
    gasLimit = 100000;
  }

  // Send approve transaction
  const tx = await tokenContract.approve(spenderAddress, amountWei, {
    gasLimit: gasLimit,
  });

  console.log(`Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();

  console.log(`✓ Approved: ${receipt.hash}`);
  console.log(`  Gas used: ${receipt.gasUsed.toString()}\n`);

  await sleep(3000); // Wait for state sync
  return { hash: receipt.hash, success: receipt.status === 1 };
}

async function swapUniswapV3(
  swapContract,
  tokenIn,
  tokenOut,
  amountWei,
  amountOutMin,
  fee,
  wallet
) {
  const params = {
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: fee,
    recipient: wallet.address,
    amountIn: amountWei,
    amountOutMinimum: amountOutMin,
    sqrtPriceLimitX96: 0,
  };

  return swapContract.exactInputSingle.populateTransaction(params);
}

async function swapUniswapV2(
  swapContract,
  tokenIn,
  tokenOut,
  amountWei,
  amountOutMin,
  wallet
) {
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
  const path = [tokenIn, tokenOut];

  return swapContract.swapExactTokensForTokens.populateTransaction(
    amountWei,
    amountOutMin,
    path,
    wallet.address,
    deadline
  );
}

// Enhanced swap endpoint using swap.js logic
app.post("/swap", async (req, res) => {
  try {
    const {
      privateKey,
      tokenIn,
      tokenOut,
      amountIn,
      slippageTolerance = 5,
      poolFee = 500,
      routerType = "uniswap_v3",
    } = req.body;

    // Validation
    if (!privateKey || !tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: privateKey, tokenIn, tokenOut, amountIn",
      });
    }

    // Normalize and validate tokenOut address
    let tokenOutAddress;
    try {
      if (typeof tokenOut !== "string") {
        return res.status(400).json({
          success: false,
          error: "tokenOut must be a string address",
          received: typeof tokenOut,
        });
      }

      // Normalize address (remove whitespace)
      const normalizedTokenOut = tokenOut.trim();

      // Basic format check first
      if (
        !normalizedTokenOut.startsWith("0x") ||
        normalizedTokenOut.length !== 42
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid tokenOut address format",
          received: tokenOut,
          normalized: normalizedTokenOut,
          length: normalizedTokenOut.length,
          hint: "Address must start with 0x and be exactly 42 characters (0x + 40 hex chars)",
        });
      }

      // Try to get checksummed address directly
      // getAddress() will validate the address format and fix checksum if needed
      try {
        tokenOutAddress = ethers.getAddress(normalizedTokenOut);
      } catch (addressError) {
        // If getAddress fails, try with lowercase version (fixes checksum issues)
        try {
          tokenOutAddress = ethers.getAddress(normalizedTokenOut.toLowerCase());
          console.log(`⚠️  Fixed checksum for tokenOut: ${tokenOutAddress}`);
        } catch (lowercaseError) {
          // If both fail, check if it's at least a valid hex format
          const hexPattern = /^0x[a-fA-F0-9]{40}$/;
          if (!hexPattern.test(normalizedTokenOut)) {
            return res.status(400).json({
              success: false,
              error: "Invalid tokenOut address format",
              received: tokenOut,
              normalized: normalizedTokenOut,
              details:
                "Address must be a valid hex string (0x followed by 40 hex characters)",
              hint: "Ensure the address is a valid Ethereum address",
            });
          }

          // If hex format is valid but getAddress fails, use lowercase version
          tokenOutAddress = normalizedTokenOut.toLowerCase();
          console.log(
            `⚠️  Using lowercase address for tokenOut: ${tokenOutAddress}`
          );
        }
      }

      // Final validation - ensure we have a valid address
      if (!ethers.isAddress(tokenOutAddress)) {
        return res.status(400).json({
          success: false,
          error: "Invalid tokenOut address format after normalization",
          received: tokenOut,
          normalized: tokenOutAddress,
          hint: "Could not validate address format",
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid tokenOut address format",
        details: error.message,
        received: tokenOut,
      });
    }

    // Validate amount
    const amountNum = parseFloat(amountIn);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: "amountIn must be a positive number",
      });
    }

    // Validate slippage tolerance (0-100)
    const slippage = parseFloat(slippageTolerance);
    if (isNaN(slippage) || slippage < 0 || slippage > 100) {
      return res.status(400).json({
        success: false,
        error: "slippageTolerance must be a number between 0 and 100",
      });
    }

    // Validate router type
    if (routerType !== "uniswap_v3" && routerType !== "uniswap_v2") {
      return res.status(400).json({
        success: false,
        error: "routerType must be 'uniswap_v3' or 'uniswap_v2'",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Uniswap SwapRouter02 address for Arbitrum Sepolia
    // Note: Verify this is the correct router address for Arbitrum Sepolia
    const SWAP_ROUTER_ADDRESS = "0x6aac14f090a35eea150705f72d90e4cdc4a49b2c";

    // Common token addresses on Arbitrum Sepolia testnet
    // WETH (Wrapped ETH) - used for native token swaps
    const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // Verify this is correct for Sepolia
    // USDC testnet address (if available)
    const USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58cE45D4C7"; // Arbitrum Sepolia USDC (verify)

    // Check if swapping native token (ETH/STT)
    const isNativeTokenIn =
      !tokenIn ||
      (typeof tokenIn === "string" &&
        (tokenIn.toLowerCase() === "native" ||
          tokenIn.toLowerCase() === "eth" ||
          tokenIn === ethers.ZeroAddress));

    // If native token swap, use WETH as intermediary
    let actualTokenIn = tokenIn;
    if (isNativeTokenIn) {
      actualTokenIn = WETH_ADDRESS;
      console.log(
        `🔄 Native token swap detected - using WETH (${WETH_ADDRESS}) as intermediary`
      );
    } else {
      // Validate tokenIn address format
      if (!ethers.isAddress(tokenIn)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid tokenIn address format. Use 'native' or 'eth' for native token swaps",
          received: tokenIn,
        });
      }
      actualTokenIn = ethers.getAddress(tokenIn); // Normalize to checksummed address
    }

    const TOKEN_ABI = [
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address account) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
      "function name() view returns (string)",
    ];

    const UNISWAP_V3_ROUTER_ABI = [
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)",
    ];

    const UNISWAP_V2_ROUTER_ABI = [
      "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
    ];

    console.log(`🔍 Swap request on Arbitrum Sepolia from ${wallet.address}`);
    console.log(`   Token In: ${tokenIn}`);
    console.log(`   Token Out: ${tokenOut}`);
    console.log(`   Amount: ${amountIn}`);
    console.log(`   Router Type: ${routerType}`);
    console.log(`   Slippage Tolerance: ${slippageTolerance}%`);

    // Check native balance for gas fees
    let nativeBalance = await provider.getBalance(wallet.address);
    if (nativeBalance === 0n) {
      return res.status(400).json({
        success: false,
        error: "Insufficient native token balance for gas fees",
        currentBalance: ethers.formatEther(nativeBalance),
        network: "Arbitrum Sepolia",
      });
    }

    // Create token contracts
    // For native token swaps, we don't need to check WETH balance
    // The router will handle wrapping ETH to WETH during the swap
    let tokenInContract;
    if (isNativeTokenIn) {
      // For native swaps, we'll use WETH address for the swap but don't need to check balance
      // Create a minimal contract just for getting decimals if needed
      tokenInContract = new ethers.Contract(actualTokenIn, TOKEN_ABI, wallet);
    } else {
      tokenInContract = new ethers.Contract(actualTokenIn, TOKEN_ABI, wallet);
    }

    const tokenOutContract = new ethers.Contract(
      tokenOutAddress,
      TOKEN_ABI,
      wallet
    );

    // Get token decimals and symbols
    let decimalsIn, decimalsOut, symbolIn, symbolOut;

    // For native token, decimals are always 18 - no need to query WETH contract
    if (isNativeTokenIn) {
      decimalsIn = 18;
      symbolIn = "ETH/STT";
      console.log("💰 Native token swap - using ETH/STT (18 decimals)");
    } else {
      // For ERC20 tokens, fetch decimals and symbol
      try {
        decimalsIn = await getTokenDecimals(tokenInContract);
        symbolIn = await tokenInContract.symbol().catch(() => "TOKEN_IN");
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: "Failed to fetch tokenIn information",
          details: error.message,
          tokenIn: tokenIn,
        });
      }
    }

    // Always fetch tokenOut information
    try {
      decimalsOut = await getTokenDecimals(tokenOutContract);
      symbolOut = await tokenOutContract.symbol().catch(() => "TOKEN_OUT");
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Failed to fetch tokenOut information",
        details: error.message,
        tokenOut: tokenOutAddress,
        hint: "The tokenOut address might not be a valid ERC20 token contract",
      });
    }

    console.log(`Token IN (${symbolIn}) decimals: ${decimalsIn}`);
    console.log(`Token OUT (${symbolOut}) decimals: ${decimalsOut}`);

    // Parse amounts
    const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);

    // Note: amountOutMin calculation is simplified - in production, you'd want to query
    // the actual expected output from the DEX router/quote function
    // For now, we use a conservative estimate based on slippage
    const amountOutMin = ethers.parseUnits(
      ((Number(amountIn) * (100 - slippage)) / 100).toString(),
      decimalsOut
    );

    console.log(
      `Amount In: ${amountIn} ${symbolIn} (${amountInWei.toString()} wei)`
    );
    console.log(
      `Minimum Amount Out: ${ethers.formatUnits(
        amountOutMin,
        decimalsOut
      )} ${symbolOut} (${amountOutMin.toString()} wei)`
    );

    // Check balance before approval
    let tokenBalance = null;
    let approveResult = { hash: null, success: true }; // Initialize for native token swaps

    if (isNativeTokenIn) {
      // For native token, check ETH balance (reuse nativeBalance from above)
      nativeBalance = await provider.getBalance(wallet.address);
      if (nativeBalance < amountInWei) {
        return res.status(400).json({
          success: false,
          error: "Insufficient native token balance",
          tokenIn: "ETH/STT (native)",
          currentBalance: ethers.formatEther(nativeBalance),
          requestedAmount: amountIn.toString(),
          network: "Arbitrum Sepolia",
        });
      }

      // For native token swaps, we need to wrap ETH to WETH first
      // The Uniswap router can handle this, but we need to send ETH as value
      // No approval needed for native tokens
      console.log(`💰 Native token swap - will wrap ETH to WETH during swap`);
      approveResult = {
        hash: null,
        success: true,
        note: "No approval needed for native token swaps",
      };
    } else {
      // For ERC20 tokens, check balance and approve
      tokenBalance = await tokenInContract.balanceOf(wallet.address);
      if (tokenBalance < amountInWei) {
        return res.status(400).json({
          success: false,
          error: "Insufficient token balance",
          tokenIn: tokenIn,
          tokenSymbol: symbolIn,
          currentBalance: ethers.formatUnits(tokenBalance, decimalsIn),
          requestedAmount: amountIn.toString(),
          network: "Arbitrum Sepolia",
        });
      }

      // Approve tokens for swap router
      console.log(`Approving ${symbolIn} tokens for swap router...`);
      approveResult = await approveToken(
        tokenInContract,
        SWAP_ROUTER_ADDRESS,
        amountInWei,
        wallet,
        decimalsIn
      );

      if (!approveResult.success) {
        return res.status(400).json({
          success: false,
          error: "Token approval failed",
          details: "Could not approve tokens for swap router",
          network: "Arbitrum Sepolia",
        });
      }

      if (approveResult.hash) {
        console.log(`✅ Approval transaction: ${approveResult.hash}`);
      } else {
        console.log(`✅ Sufficient allowance already exists`);
      }
    }

    // Build swap transaction based on router type
    console.log("Building swap transaction...");
    let swapTx;
    let swapContract;

    try {
      if (routerType === "uniswap_v3") {
        swapContract = new ethers.Contract(
          SWAP_ROUTER_ADDRESS,
          UNISWAP_V3_ROUTER_ABI,
          wallet
        );
        // For native token swaps, use WETH address
        swapTx = await swapUniswapV3(
          swapContract,
          actualTokenIn, // Use WETH if native token
          tokenOutAddress, // Use checksummed address
          amountInWei,
          amountOutMin,
          poolFee,
          wallet
        );

        // For native token swaps, add value to transaction
        if (isNativeTokenIn) {
          swapTx.value = amountInWei;
        }
      } else if (routerType === "uniswap_v2") {
        swapContract = new ethers.Contract(
          SWAP_ROUTER_ADDRESS,
          UNISWAP_V2_ROUTER_ABI,
          wallet
        );
        swapTx = await swapUniswapV2(
          swapContract,
          actualTokenIn, // Use WETH if native token
          tokenOutAddress, // Use checksummed address
          amountInWei,
          amountOutMin,
          wallet
        );

        // For native token swaps, add value to transaction
        if (isNativeTokenIn) {
          swapTx.value = amountInWei;
        }
      } else {
        return res.status(400).json({
          success: false,
          error: `Unknown router type: ${routerType}. Use 'uniswap_v3' or 'uniswap_v2'`,
        });
      }

      // Estimate gas
      try {
        const gasEstimate = await provider.estimateGas({
          ...swapTx,
          from: wallet.address,
        });

        const gasLimit = (gasEstimate * 150n) / 100n; // Add 50% buffer
        console.log(
          `Estimated gas: ${gasEstimate.toString()}, Using: ${gasLimit.toString()}`
        );

        swapTx.gasLimit = gasLimit;
      } catch (e) {
        console.log(`⚠ Gas estimation failed: ${e.message.substring(0, 150)}`);
        console.log("Using fallback gas: 1000000");
        swapTx.gasLimit = 1000000;
      }
    } catch (e) {
      throw new Error(`Failed to build swap transaction: ${e.message}`);
    }

    // Execute swap
    console.log("Executing swap...");

    const tx = await wallet.sendTransaction(swapTx);
    console.log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();

    if (receipt.status === 1) {
      // Get final balances for verification
      let balanceInAfter = null;
      let balanceOutAfter = null;

      // For native token swaps, skip balance check (WETH might not exist on testnet)
      if (!isNativeTokenIn) {
        try {
          balanceInAfter = await tokenInContract.balanceOf(wallet.address);
        } catch (error) {
          console.warn(
            "Could not fetch tokenIn balance after swap:",
            error.message
          );
        }
      } else {
        // For native token, get ETH balance instead
        try {
          const nativeBalance = await provider.getBalance(wallet.address);
          balanceInAfter = nativeBalance;
        } catch (error) {
          console.warn(
            "Could not fetch native balance after swap:",
            error.message
          );
        }
      }

      try {
        balanceOutAfter = await tokenOutContract.balanceOf(wallet.address);
      } catch (error) {
        console.warn(
          "Could not fetch tokenOut balance after swap:",
          error.message
        );
      }

      return res.json({
        success: true,
        network: "Arbitrum Sepolia",
        wallet: wallet.address,
        swap: {
          tokenIn: {
            address: tokenIn,
            symbol: symbolIn,
            amountIn: amountIn.toString(),
            decimals: Number(decimalsIn),
          },
          tokenOut: {
            address: tokenOutAddress,
            symbol: symbolOut,
            decimals: Number(decimalsOut),
          },
          slippageTolerance: `${slippageTolerance}%`,
          routerType: routerType,
          poolFee:
            routerType === "uniswap_v3"
              ? `${poolFee} (${poolFee / 10000}%)`
              : null,
        },
        transactions: {
          approval: approveResult.hash
            ? {
                hash: approveResult.hash,
                explorerUrl: `https://sepolia.arbiscan.io/tx/${approveResult.hash}`,
              }
            : {
                note: "Approval not needed - sufficient allowance exists",
              },
          swap: {
            hash: receipt.hash,
            blockNumber: receipt.blockNumber
              ? Number(receipt.blockNumber)
              : null,
            gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : null,
            gasPrice: receipt.gasPrice ? receipt.gasPrice.toString() : null,
            explorerUrl: `https://sepolia.arbiscan.io/tx/${receipt.hash}`,
          },
        },
        balances: {
          tokenIn: isNativeTokenIn
            ? {
                before: ethers.formatEther(nativeBalance.toString()),
                after: balanceInAfter
                  ? ethers.formatEther(balanceInAfter.toString())
                  : "N/A",
                note: "Native token balance (ETH/STT)",
              }
            : {
                before: tokenBalance
                  ? ethers.formatUnits(tokenBalance.toString(), decimalsIn)
                  : "N/A",
                after: balanceInAfter
                  ? ethers.formatUnits(balanceInAfter.toString(), decimalsIn)
                  : "N/A",
              },
          tokenOut: {
            after: balanceOutAfter
              ? ethers.formatUnits(balanceOutAfter.toString(), decimalsOut)
              : "N/A",
          },
        },
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Swap transaction failed",
        transactionHash: receipt.hash,
        network: "Arbitrum Sepolia",
      });
    }
  } catch (error) {
    console.error("Swap error:", error);

    // Provide more specific error messages
    if (error.reason && error.reason.includes("STF")) {
      return res.status(400).json({
        success: false,
        error: "Swap failed - insufficient liquidity or invalid pool",
        details:
          "The swap may have failed due to insufficient liquidity in the pool or invalid token pair",
        network: "Arbitrum Sepolia",
      });
    }

    if (error.reason && error.reason.includes("SPL")) {
      return res.status(400).json({
        success: false,
        error: "Swap failed - slippage tolerance exceeded",
        details:
          "The price moved beyond your slippage tolerance. Try increasing slippageTolerance or reducing amountIn",
        network: "Arbitrum Sepolia",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
      network: "Arbitrum Sepolia",
    });
  }
});

// Wallet Analytics endpoint - Comprehensive wallet analysis using Alchemy API
app.post("/wallet-analytics", async (req, res) => {
  try {
    const { address } = req.body;

    // Validation
    if (!address) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: address",
      });
    }

    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      });
    }

    // Check if Alchemy API key is available
    const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
    let alchemyRpcUrl = null;

    if (ALCHEMY_API_KEY) {
      alchemyRpcUrl = `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
    }

    console.log(`🔍 Fetching wallet analytics for: ${address}`);

    // Helper function to get ETH balance
    async function getEthBalance(walletAddress, rpcUrl) {
      try {
        if (rpcUrl) {
          // Use Alchemy RPC
          const response = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [walletAddress, "latest"],
          });

          if (response.data.error) {
            throw new Error(response.data.error.message);
          }

          const balanceWei = BigInt(response.data.result);
          const balanceEth = Number(balanceWei) / 1e18;
          return balanceEth;
        } else {
          // Fallback to standard provider
          const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
          const balance = await provider.getBalance(walletAddress);
          return parseFloat(ethers.formatEther(balance));
        }
      } catch (error) {
        console.error("Error fetching ETH balance:", error.message);
        // Fallback to standard provider
        try {
          const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
          const balance = await provider.getBalance(walletAddress);
          return parseFloat(ethers.formatEther(balance));
        } catch (fallbackError) {
          return 0;
        }
      }
    }

    // Helper function to get token metadata
    async function getTokenMetadata(contractAddress, rpcUrl) {
      try {
        if (rpcUrl) {
          const response = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            id: 1,
            method: "alchemy_getTokenMetadata",
            params: [contractAddress],
          });

          if (response.data.error) {
            throw new Error(response.data.error.message);
          }

          return response.data.result;
        } else {
          // Fallback: use ethers to get basic token info
          const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
          const tokenAbi = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
          ];

          try {
            const contract = new ethers.Contract(
              contractAddress,
              tokenAbi,
              provider
            );
            const [name, symbol, decimals] = await Promise.all([
              contract.name().catch(() => "Unknown"),
              contract.symbol().catch(() => "UNKNOWN"),
              contract.decimals().catch(() => 18),
            ]);

            return { name, symbol, decimals: Number(decimals) };
          } catch (contractError) {
            return { name: "Unknown", symbol: "UNKNOWN", decimals: 18 };
          }
        }
      } catch (error) {
        console.error(
          `Error fetching metadata for ${contractAddress}:`,
          error.message
        );
        return { name: "Unknown", symbol: "UNKNOWN", decimals: 18 };
      }
    }

    // Get ETH balance
    const ethBalance = await getEthBalance(address, alchemyRpcUrl);

    // Get all ERC20 token balances
    let tokenBalances = [];
    let allTokens = [];

    if (alchemyRpcUrl) {
      // Use Alchemy API to get all ERC20 tokens
      try {
        console.log("📡 Using Alchemy API to fetch token balances...");
        const response = await axios.post(alchemyRpcUrl, {
          jsonrpc: "2.0",
          id: 1,
          method: "alchemy_getTokenBalances",
          params: [address, "erc20"],
        });

        if (response.data.error) {
          throw new Error(response.data.error.message);
        }

        allTokens = response.data.result.tokenBalances || [];
        console.log(`Found ${allTokens.length} tokens via Alchemy API`);
      } catch (alchemyError) {
        console.warn(
          "Alchemy API failed, falling back to standard RPC:",
          alchemyError.message
        );
        // Fallback: return empty array - user can query specific tokens if needed
        allTokens = [];
      }
    } else {
      console.log(
        "⚠️  ALCHEMY_API_KEY not set - cannot fetch all tokens automatically"
      );
      console.log(
        "   Set ALCHEMY_API_KEY in .env to enable comprehensive token discovery"
      );
    }

    // Process tokens and get metadata for non-zero balances
    const nonZeroBalances = [];

    for (const token of allTokens) {
      const balance = BigInt(token.tokenBalance || "0");

      if (balance > 0n) {
        // Get token metadata
        const metadata = await getTokenMetadata(
          token.contractAddress,
          alchemyRpcUrl
        );

        const decimals = metadata.decimals || 18;
        const humanReadableBalance = Number(balance) / Math.pow(10, decimals);

        nonZeroBalances.push({
          contractAddress: token.contractAddress,
          name: metadata.name || "Unknown",
          symbol: metadata.symbol || "UNKNOWN",
          balance: humanReadableBalance,
          balanceFormatted: humanReadableBalance.toFixed(6),
          rawBalance: token.tokenBalance,
          decimals: decimals,
        });
      }
    }

    // Calculate summary statistics
    const totalTokens = nonZeroBalances.length;
    const totalTokenValue = nonZeroBalances.reduce(
      (sum, token) => sum + token.balance,
      0
    );

    // Sort tokens by balance (descending)
    const sortedTokens = nonZeroBalances.sort((a, b) => b.balance - a.balance);

    return res.json({
      success: true,
      address: address,
      network: "Arbitrum Sepolia",
      timestamp: new Date().toISOString(),
      analytics: {
        nativeBalance: {
          balance: ethBalance,
          balanceFormatted: ethBalance.toFixed(6),
          symbol: "ETH/STT",
          unit: "ETH",
        },
        tokens: {
          total: totalTokens,
          nonZero: nonZeroBalances.length,
          list: sortedTokens,
        },
        summary: {
          nativeBalance: `${ethBalance.toFixed(6)} ETH`,
          totalTokens: totalTokens,
          totalTokenTypes: allTokens.length,
          hasTokens: totalTokens > 0,
        },
      },
      metadata: {
        dataSource: alchemyRpcUrl ? "Alchemy API" : "Standard RPC",
        note: alchemyRpcUrl
          ? "Comprehensive token discovery enabled via Alchemy API"
          : "Set ALCHEMY_API_KEY in .env to enable automatic token discovery",
      },
    });
  } catch (error) {
    console.error("Wallet analytics error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || error.code,
    });
  }
});

// Airdrop endpoint - batch transfer ETH to multiple addresses (Arbitrum Sepolia)
// Supports both same amount and different amounts per recipient
app.post("/airdrop", async (req, res) => {
  try {
    const {
      privateKey,
      recipients,
      amount, // For same amount per recipient
      amounts, // For different amounts per recipient (array)
    } = req.body;

    // Validation
    if (!privateKey || !recipients) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: privateKey, recipients",
      });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: "recipients must be a non-empty array of addresses",
      });
    }

    // Validate all recipient addresses
    const invalidAddresses = recipients.filter(
      (addr) => !ethers.isAddress(addr)
    );
    if (invalidAddresses.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid recipient addresses found",
        invalidAddresses: invalidAddresses,
      });
    }

    // Determine which airdrop function to use
    const useDifferentAmounts = Array.isArray(amounts) && amounts.length > 0;

    if (
      !useDifferentAmounts &&
      (!amount || Number(amount) <= 0 || isNaN(Number(amount)))
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Either provide amount (for same amount) or amounts array (for different amounts)",
      });
    }

    if (useDifferentAmounts) {
      if (amounts.length !== recipients.length) {
        return res.status(400).json({
          success: false,
          error: "amounts array length must match recipients array length",
        });
      }

      const invalidAmounts = amounts.filter(
        (amt) => Number(amt) <= 0 || isNaN(Number(amt))
      );
      if (invalidAmounts.length > 0) {
        return res.status(400).json({
          success: false,
          error: "All amounts must be positive numbers",
        });
      }
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Calculate total amount needed
    let totalAmount;
    let amountPerRecipient;
    let amountsArray;

    if (useDifferentAmounts) {
      // Different amounts per recipient
      amountsArray = amounts.map((amt) => ethers.parseEther(amt.toString()));
      totalAmount = amountsArray.reduce((sum, amt) => sum + amt, 0n);
    } else {
      // Same amount per recipient
      amountPerRecipient = ethers.parseEther(amount.toString());
      totalAmount = amountPerRecipient * BigInt(recipients.length);
    }

    // Check wallet balance
    const walletBalance = await provider.getBalance(wallet.address);

    console.log("Airdrop request:", {
      from: wallet.address,
      recipients: recipients.length,
      useDifferentAmounts: useDifferentAmounts,
      amountPerRecipient: useDifferentAmounts ? "varies" : amount,
      totalAmount: ethers.formatEther(totalAmount),
    });

    if (walletBalance < totalAmount) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance",
        walletBalance: ethers.formatEther(walletBalance),
        required: ethers.formatEther(totalAmount),
        shortage: ethers.formatEther(totalAmount - walletBalance),
      });
    }

    // Connect to Airdrop contract
    const airdropContract = new ethers.Contract(
      AIRDROP_CONTRACT_ADDRESS,
      AIRDROP_ABI,
      wallet
    );

    // Estimate gas and execute airdrop
    console.log("Estimating gas for airdrop...");
    let gasEstimate;
    try {
      if (useDifferentAmounts) {
        gasEstimate = await airdropContract.airdropWithAmounts.estimateGas(
          recipients,
          amountsArray,
          {
            value: totalAmount,
          }
        );
      } else {
        gasEstimate = await airdropContract.airdrop.estimateGas(
          recipients,
          amountPerRecipient,
          {
            value: totalAmount,
          }
        );
      }
      console.log("Estimated gas:", gasEstimate.toString());
    } catch (estimateError) {
      console.warn(
        "Gas estimation failed (will proceed anyway):",
        estimateError.message
      );
      gasEstimate = null;
    }

    // Execute airdrop
    console.log("Executing airdrop transaction...");
    let tx;
    const txOptions = {
      value: totalAmount,
    };

    if (gasEstimate) {
      // Add 20% buffer to gas estimate
      txOptions.gasLimit = (gasEstimate * 120n) / 100n;
    }

    if (useDifferentAmounts) {
      tx = await airdropContract.airdropWithAmounts(
        recipients,
        amountsArray,
        txOptions
      );
    } else {
      tx = await airdropContract.airdrop(
        recipients,
        amountPerRecipient,
        txOptions
      );
    }

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the AirdropExecuted event
    const contractInterface = new ethers.Interface(AIRDROP_ABI);
    let eventData = null;

    for (const log of receipt.logs) {
      try {
        const parsedLog = contractInterface.parseLog(log);
        if (parsedLog && parsedLog.name === "AirdropExecuted") {
          eventData = parsedLog.args;
          break;
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }

    // Check contract balance after airdrop (should be 0 or minimal)
    const contractBalance = await airdropContract.getBalance();

    // Get final wallet balance
    const walletBalanceAfter = await provider.getBalance(wallet.address);
    const balanceUsed = walletBalance - walletBalanceAfter;

    // Prepare response data
    const responseData = {
      success: true,
      message: "Airdrop executed successfully",
      airdrop: {
        from: wallet.address,
        recipientsCount: recipients.length,
        recipients: recipients,
        method: useDifferentAmounts ? "airdropWithAmounts" : "airdrop",
        totalAmount: ethers.formatEther(totalAmount),
        totalAmountWei: totalAmount.toString(),
      },
      transaction: {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: `https://sepolia.arbiscan.io/tx/${receipt.hash}`,
      },
      balances: {
        walletBefore: ethers.formatEther(walletBalance),
        walletAfter: ethers.formatEther(walletBalanceAfter),
        balanceUsed: ethers.formatEther(balanceUsed),
        contractBalance: ethers.formatEther(contractBalance),
      },
      event: eventData
        ? {
            executor: eventData.executor,
            totalAmount: eventData.totalAmount.toString(),
            timestamp: new Date(
              Number(eventData.timestamp) * 1000
            ).toISOString(),
          }
        : null,
    };

    // Add amount details based on method used
    if (useDifferentAmounts) {
      responseData.airdrop.amounts = amounts.map((amt, idx) => ({
        recipient: recipients[idx],
        amount: amt,
        amountWei: amountsArray[idx].toString(),
      }));
    } else {
      responseData.airdrop.amountPerRecipient = amount;
      responseData.airdrop.amountPerRecipientWei =
        amountPerRecipient.toString();
    }

    return res.json(responseData);
  } catch (error) {
    console.error("Airdrop error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

// Initialize OpenAI client for token price fetching
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// System prompt for fetching token prices from natural language
const PRICE_SYSTEM_PROMPT = `You are a cryptocurrency price data assistant. Your task is to understand natural language queries about cryptocurrency prices and fetch the current prices from the web.

INSTRUCTIONS:
1. Parse the user's natural language query to identify which cryptocurrencies they want prices for
2. Understand queries like:
   - "bitcoin price" → BTC
   - "what's ethereum worth" → ETH
   - "show me solana and cardano prices" → SOL, ADA
   - "how much is dogecoin" → DOGE
   - "prices for BTC, ETH, and BNB" → BTC, ETH, BNB
   - "bitcoin ethereum solana" → BTC, ETH, SOL
3. Search for the CURRENT/LIVE price of each identified token
4. Return prices in USD
5. Provide the price information in a clear and structured format
6. Include price, 24h change percentage if available, and data source for each token
7. Use reliable sources like CoinMarketCap, CoinGecko, or Binance

Be accurate, understand the query intent, and use the most current prices available from authoritative sources.`;

// Token price endpoint - fetch current token prices using natural language queries
app.post("/token-price", async (req, res) => {
  try {
    const { query } = req.body;

    // Validation
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: "query is required and must be a non-empty string",
      });
    }

    if (query.length > 500) {
      return res.status(400).json({
        success: false,
        error: "Query too long (max 500 characters)",
      });
    }

    if (!openaiClient) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY not configured. Please set it in your .env file",
      });
    }

    console.log(`🔍 Processing price query: ${query}`);

    // Use OpenAI's web search model
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [
        {
          role: "system",
          content: PRICE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    const response = completion.choices[0].message.content;

    // Log the raw response for debugging
    console.log(`📄 Raw response from OpenAI:`, response.substring(0, 500)); // Log first 500 chars

    // Return whatever OpenAI gives us
    return res.json({
      success: true,
      query: query,
      response: response,
      timestamp: new Date().toISOString(),
      model_used: "gpt-4o-search-preview",
    });
  } catch (error) {
    console.error("Token price error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Error fetching token prices",
      details: error.response?.data || error.code,
    });
  }
});

// Yield Calculator endpoint - Create deposit and get yield projections
app.post("/yield", async (req, res) => {
  try {
    const { privateKey, tokenAddress, depositAmount, apyPercent } = req.body;

    // Validation
    if (!privateKey || !tokenAddress || !depositAmount || !apyPercent) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: privateKey, tokenAddress, depositAmount, apyPercent",
      });
    }

    // Validate token address
    if (!ethers.isAddress(tokenAddress)) {
      return res.status(400).json({
        success: false,
        error: "Invalid token address format",
      });
    }

    // Validate APY (should be between 0 and 100)
    const apy = parseFloat(apyPercent);
    if (isNaN(apy) || apy <= 0 || apy > 100) {
      return res.status(400).json({
        success: false,
        error: "APY must be a number between 0 and 100",
      });
    }

    // Validate deposit amount
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Deposit amount must be a positive number",
      });
    }

    const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Initialize YieldCalculatorTool with the contract address
    const tool = new YieldCalculatorTool(YIELD_CALCULATOR_ADDRESS, privateKey);

    // Step 1: Check token balance
    const { token, decimals } = await tool.initializeToken(tokenAddress);
    const tokenBalance = await token.balanceOf(wallet.address);
    const tokenSymbol = await token.symbol().catch(() => "TOKEN");
    const tokenName = await token.name().catch(() => "Token");

    const requiredAmount = tool.parseToken(depositAmount, decimals);

    if (tokenBalance < requiredAmount) {
      const balanceFormatted = tool.formatToken(tokenBalance, decimals);
      return res.status(400).json({
        success: false,
        error: "Insufficient token balance",
        tokenAddress: tokenAddress,
        tokenSymbol: tokenSymbol,
        currentBalance: balanceFormatted,
        requiredAmount: depositAmount,
      });
    }

    // Step 2: Check and approve tokens if needed
    const allowance = await token.allowance(
      wallet.address,
      YIELD_CALCULATOR_ADDRESS
    );
    let approvalTxHash = null;
    let approvalNeeded = false;

    if (allowance < requiredAmount) {
      approvalNeeded = true;
      console.log(`Approving tokens for YieldCalculator...`);
      const approveTx = await token.approve(
        YIELD_CALCULATOR_ADDRESS,
        ethers.MaxUint256
      );
      const approveReceipt = await approveTx.wait();
      approvalTxHash = approveReceipt.hash;
      console.log(`✅ Approval confirmed: ${approvalTxHash}`);
    } else {
      console.log(
        `✅ Sufficient allowance already exists: ${tool.formatToken(
          allowance,
          decimals
        )}`
      );
    }

    // Step 3: Create deposit
    console.log(
      `Creating deposit: ${depositAmount} ${tokenSymbol} at ${apyPercent}% APY...`
    );
    const depositResult = await tool.createDeposit(
      tokenAddress,
      depositAmount,
      apyPercent
    );
    const depositId = depositResult.depositId;
    const depositTxHash = depositResult.transactionHash;

    // Step 4: Get current yield info
    const yieldInfo = await tool.getCurrentYield(parseInt(depositId));

    // Step 5: Calculate yield projections for specified periods
    const projectionPeriods = [7, 30, 60, 90, 180, 365]; // days
    const projections = [];

    for (const days of projectionPeriods) {
      const yieldAmount = await tool.calculateYield(parseInt(depositId), days);
      const yieldAmountNum = parseFloat(yieldAmount);
      const principalNum = parseFloat(yieldInfo.principal);
      const totalValue = (principalNum + yieldAmountNum).toFixed(6);

      projections.push({
        days: days,
        yieldAmount: yieldAmount,
        principal: yieldInfo.principal,
        totalValue: totalValue,
        tokenSymbol: yieldInfo.tokenSymbol,
      });
    }

    return res.json({
      success: true,
      message: "Deposit created successfully",
      deposit: {
        depositId: depositId,
        tokenAddress: tokenAddress,
        tokenName: tokenName,
        tokenSymbol: tokenSymbol,
        depositAmount: depositAmount,
        apyPercent: apyPercent,
        principal: yieldInfo.principal,
        currentYield: yieldInfo.yieldAmount,
        totalAmount: yieldInfo.totalAmount,
        daysPassed: yieldInfo.daysPassed,
        active: yieldInfo.active,
      },
      projections: projections,
      wallet: wallet.address,
      transactions: {
        deposit: {
          hash: depositTxHash,
          explorerUrl: `https://sepolia.arbiscan.io/tx/${depositTxHash}`,
        },
        approval: approvalTxHash
          ? {
              hash: approvalTxHash,
              explorerUrl: `https://sepolia.arbiscan.io/tx/${approvalTxHash}`,
              note: "Token approval transaction",
            }
          : {
              note: "Approval not needed - sufficient allowance already exists",
              existingAllowance: tool.formatToken(allowance, decimals),
            },
      },
      yieldCalculatorAddress: YIELD_CALCULATOR_ADDRESS,
      nextSteps: [
        `Your deposit is earning ${apyPercent}% APY`,
        `Use deposit ID ${depositId} to check yield or withdraw`,
        `Projections show total value (principal + yield) for each time period`,
      ],
    });
  } catch (error) {
    console.error("Yield deposit error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.reason || error.code,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", network: "Arbitrum Sepolia" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Network: Arbitrum Sepolia`);
});

module.exports = app;
