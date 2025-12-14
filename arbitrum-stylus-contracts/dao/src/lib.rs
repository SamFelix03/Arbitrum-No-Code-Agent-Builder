// SPDX-License-Identifier: MIT
#![cfg_attr(not(feature = "export-abi"), no_main)]
#![cfg_attr(feature = "contract-client-gen", allow(unused_imports))]

extern crate alloc;

use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use stylus_sdk::{prelude::*, msg, block, evm};

// Declare Solidity error types
sol! {
    error NotMember();
    error AlreadyMember();
    error InvalidVotingPower();
    error CannotRemoveCreator();
    error VotingPeriodEnded();
    error AlreadyVoted();
    error VotingPeriodNotEnded();
    error AlreadyExecuted();
}

/// Represents the ways methods may fail.
#[derive(SolidityError)]
pub enum DAOError {
    NotMember(NotMember),
    AlreadyMember(AlreadyMember),
    InvalidVotingPower(InvalidVotingPower),
    CannotRemoveCreator(CannotRemoveCreator),
    VotingPeriodEnded(VotingPeriodEnded),
    AlreadyVoted(AlreadyVoted),
    VotingPeriodNotEnded(VotingPeriodNotEnded),
    AlreadyExecuted(AlreadyExecuted),
}

// Declare Solidity event types
sol! {
    event MemberAdded(address indexed member, uint256 votingPower);
    event MemberRemoved(address indexed member);
    event ProposalCreated(uint256 indexed proposalId, string description, address proposer);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, bool passed);
}

sol_storage! {
    #[entrypoint]
    pub struct DAO {
        string name;
        address creator;
        uint256 proposal_count;
        uint256 member_count;
        uint256 voting_period;
        uint256 quorum_percentage;
        address[] member_list;
        mapping(address => Member) members;
        mapping(uint256 => Proposal) proposals;
    }
}

sol_storage! {
    pub struct Member {
        bool is_member;
        uint256 voting_power;
        uint256 joined_at;
    }
}

sol_storage! {
    pub struct Proposal {
        uint256 id;
        string description;
        address proposer;
        uint256 for_votes;
        uint256 against_votes;
        uint256 start_time;
        uint256 end_time;
        bool executed;
        bool passed;
        mapping(address => bool) has_voted;
    }
}

#[public]
impl DAO {
    /// Constructor - initializes the DAO
    pub fn init(
        &mut self,
        name: String,
        creator: Address,
        voting_period: U256,
        quorum_percentage: U256,
    ) -> Result<(), DAOError> {
        self.name.set_str(name);
        self.creator.set(creator);
        self.voting_period.set(voting_period);
        self.quorum_percentage.set(quorum_percentage);

        // Add creator as first member
        let mut member = self.members.setter(creator);
        member.is_member.set(true);
        member.voting_power.set(U256::from(1));
        member.joined_at.set(U256::from(block::timestamp()));

        self.member_list.push(creator);
        self.member_count.set(U256::from(1));

        Ok(())
    }

    /// Get DAO name
    pub fn name(&self) -> Result<String, DAOError> {
        Ok(self.name.get_string())
    }

    /// Get creator address
    pub fn creator(&self) -> Result<Address, DAOError> {
        Ok(self.creator.get())
    }

    /// Get proposal count
    pub fn proposal_count(&self) -> Result<U256, DAOError> {
        Ok(self.proposal_count.get())
    }

    /// Get member count
    pub fn member_count(&self) -> Result<U256, DAOError> {
        Ok(self.member_count.get())
    }

    /// Get voting period
    pub fn voting_period(&self) -> Result<U256, DAOError> {
        Ok(self.voting_period.get())
    }

    /// Get quorum percentage
    pub fn quorum_percentage(&self) -> Result<U256, DAOError> {
        Ok(self.quorum_percentage.get())
    }

    /// Add a member (only existing members can add)
    pub fn add_member(&mut self, member: Address, voting_power: U256) -> Result<(), DAOError> {
        if !self.members.getter(msg::sender()).is_member.get() {
            return Err(DAOError::NotMember(NotMember {}));
        }
        if self.members.getter(member).is_member.get() {
            return Err(DAOError::AlreadyMember(AlreadyMember {}));
        }
        if voting_power == U256::ZERO {
            return Err(DAOError::InvalidVotingPower(InvalidVotingPower {}));
        }

        let mut new_member = self.members.setter(member);
        new_member.is_member.set(true);
        new_member.voting_power.set(voting_power);
        new_member.joined_at.set(U256::from(block::timestamp()));

        self.member_list.push(member);
        self.member_count.set(self.member_count.get() + U256::from(1));

        evm::log(MemberAdded {
            member,
            votingPower: voting_power,
        });

        Ok(())
    }

    /// Remove a member (only existing members can remove)
    pub fn remove_member(&mut self, member: Address) -> Result<(), DAOError> {
        if !self.members.getter(member).is_member.get() {
            return Err(DAOError::NotMember(NotMember {}));
        }
        if member == self.creator.get() {
            return Err(DAOError::CannotRemoveCreator(CannotRemoveCreator {}));
        }

        let mut member_data = self.members.setter(member);
        member_data.is_member.set(false);
        self.member_count.set(self.member_count.get() - U256::from(1));

        evm::log(MemberRemoved { member });

        Ok(())
    }

    /// Create a proposal (only members can create)
    pub fn create_proposal(&mut self, description: String) -> Result<U256, DAOError> {
        if !self.members.getter(msg::sender()).is_member.get() {
            return Err(DAOError::NotMember(NotMember {}));
        }

        let proposal_id = self.proposal_count.get();
        self.proposal_count.set(proposal_id + U256::from(1));

        let mut proposal = self.proposals.setter(proposal_id);
        proposal.id.set(proposal_id);
        proposal.description.set_str(description.clone());
        proposal.proposer.set(msg::sender());
        proposal.start_time.set(U256::from(block::timestamp()));
        proposal.end_time.set(
            U256::from(block::timestamp()) + self.voting_period.get(),
        );
        proposal.executed.set(false);
        proposal.passed.set(false);

        evm::log(ProposalCreated {
            proposalId: proposal_id,
            description,
            proposer: msg::sender(),
        });

        Ok(proposal_id)
    }

    /// Vote on a proposal (only members can vote)
    pub fn vote(&mut self, proposal_id: U256, support: bool) -> Result<(), DAOError> {
        if !self.members.getter(msg::sender()).is_member.get() {
            return Err(DAOError::NotMember(NotMember {}));
        }

        let mut proposal = self.proposals.setter(proposal_id);
        let current_time = U256::from(block::timestamp());

        if current_time >= proposal.end_time.get() {
            return Err(DAOError::VotingPeriodEnded(VotingPeriodEnded {}));
        }

        let voter = msg::sender();
        if proposal.has_voted.getter(voter).get() {
            return Err(DAOError::AlreadyVoted(AlreadyVoted {}));
        }

        proposal.has_voted.setter(voter).set(true);

        let voting_power = self.members.getter(voter).voting_power.get();
        let current_for = proposal.for_votes.get();
        let current_against = proposal.against_votes.get();
        if support {
            proposal.for_votes.set(current_for + voting_power);
        } else {
            proposal.against_votes.set(current_against + voting_power);
        }

        evm::log(VoteCast {
            proposalId: proposal_id,
            voter,
            support,
            weight: voting_power,
        });

        Ok(())
    }

    /// Execute a proposal
    pub fn execute_proposal(&mut self, proposal_id: U256) -> Result<(), DAOError> {
        let current_time = U256::from(block::timestamp());
        let quorum_percentage = self.quorum_percentage.get();
        let total_voting_power = self.get_total_voting_power()?;
        
        let mut proposal = self.proposals.setter(proposal_id);

        if current_time < proposal.end_time.get() {
            return Err(DAOError::VotingPeriodNotEnded(VotingPeriodNotEnded {}));
        }
        if proposal.executed.get() {
            return Err(DAOError::AlreadyExecuted(AlreadyExecuted {}));
        }

        let total_votes = proposal.for_votes.get() + proposal.against_votes.get();
        let for_votes = proposal.for_votes.get();
        let against_votes = proposal.against_votes.get();

        // Check if quorum is met and majority voted for
        let quorum_met = (total_votes * U256::from(100))
            >= (total_voting_power * quorum_percentage);
        let majority_for = for_votes > against_votes;

        proposal.executed.set(true);
        proposal.passed.set(quorum_met && majority_for);

        evm::log(ProposalExecuted {
            proposalId: proposal_id,
            passed: proposal.passed.get(),
        });

        Ok(())
    }

    /// Get total voting power
    pub fn get_total_voting_power(&self) -> Result<U256, DAOError> {
        let len = self.member_list.len();
        let mut total = U256::ZERO;

        for i in 0..len {
            let member_addr = self.member_list.get(i).unwrap();
            let member = self.members.getter(member_addr);
            if member.is_member.get() {
                total = total + member.voting_power.get();
            }
        }

        Ok(total)
    }

    /// Get proposal information
    pub fn get_proposal_info(
        &self,
        proposal_id: U256,
    ) -> Result<(String, Address, U256, U256, U256, bool, bool), DAOError> {
        let proposal = self.proposals.getter(proposal_id);
        Ok((
            proposal.description.get_string(),
            proposal.proposer.get(),
            proposal.for_votes.get(),
            proposal.against_votes.get(),
            proposal.end_time.get(),
            proposal.executed.get(),
            proposal.passed.get(),
        ))
    }
}

