// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SentinelRegistry} from "../contracts/SentinelRegistry.sol";

contract SentinelRegistryTest {
    SentinelRegistry registry;

    function setUp() public {
        registry = new SentinelRegistry(address(this));
    }

    function testConstructorBindsOperator() public {
        setUp();
        require(registry.operator() == address(this), "operator mismatch");
    }

    function testDecisionAndRevocationEvidence() public {
        setUp();
        bytes32 decision = keccak256("decision-1");
        registry.recordDecision(decision, true, keccak256("policy-pass"));
        require(registry.lastDecision() == decision, "decision not recorded");
        registry.revoke(decision, keccak256("drift-breach"));
        require(registry.revoked(), "authority not revoked");
    }
}
