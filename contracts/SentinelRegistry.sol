// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SentinelRegistry {
    address public immutable operator;
    bool public revoked;
    bytes32 public lastDecision;

    event DecisionRecorded(bytes32 indexed decisionId, bool allowed, bytes32 reason);
    event AuthorityRevoked(bytes32 indexed decisionId, bytes32 reason);

    constructor(address operator_) {
        require(operator_ != address(0), "operator required");
        operator = operator_;
    }

    function recordDecision(bytes32 decisionId, bool allowed, bytes32 reason) external {
        require(msg.sender == operator, "operator only");
        require(!revoked, "authority revoked");
        lastDecision = decisionId;
        emit DecisionRecorded(decisionId, allowed, reason);
    }

    function revoke(bytes32 decisionId, bytes32 reason) external {
        require(msg.sender == operator, "operator only");
        revoked = true;
        emit AuthorityRevoked(decisionId, reason);
    }
}
