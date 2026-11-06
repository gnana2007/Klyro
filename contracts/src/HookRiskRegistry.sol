// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Report provenance registry. Publication never certifies hook safety.
contract HookRiskRegistry {
    error Unauthorized();
    error InvalidPublication();
    error DuplicatePublication();
    address public owner;
    address public forwarder;
    mapping(address => bool) public publishers;
    mapping(bytes32 => bool) public workflowIds;

    struct Publication {
        address hook;
        uint256 chainId;
        bytes32 fingerprintHash;
        bytes32 reportHash;
        uint8 riskLevel;
        uint64 publishedAt;
        address publisher;
    }
    mapping(bytes32 => Publication) public publications;
    mapping(bytes32 => bytes32) public latest;
    event Published(
        address indexed hook,
        uint256 indexed chainId,
        bytes32 indexed reportHash,
        bytes32 fingerprintHash,
        uint8 riskLevel,
        address publisher
    );
    event PublisherSet(address indexed publisher, bool authorized);
    event ForwarderSet(address indexed forwarder);
    event WorkflowSet(bytes32 indexed workflowId, bool authorized);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert Unauthorized();
        owner = initialOwner;
        publishers[initialOwner] = true;
    }
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setPublisher(address who, bool enabled) external onlyOwner {
        if (who == address(0)) revert Unauthorized();
        publishers[who] = enabled;
        emit PublisherSet(who, enabled);
    }

    function setForwarder(address who) external onlyOwner {
        forwarder = who;
        emit ForwarderSet(who);
    }

    function setWorkflow(bytes32 id, bool enabled) external onlyOwner {
        workflowIds[id] = enabled;
        emit WorkflowSet(id, enabled);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == bytes4(keccak256("onReport(bytes,bytes)"));
    }

    function publish(address hook, uint256 chainId, bytes32 fingerprintHash, bytes32 reportHash, uint8 riskLevel)
        external
    {
        if (!publishers[msg.sender]) revert Unauthorized();
        _publish(hook, chainId, fingerprintHash, reportHash, riskLevel, msg.sender);
    }

    /// @dev Receiver checks BOTH the trusted CRE forwarder and workflow identity in metadata.
    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder || forwarder == address(0) || (metadata.length != 62 && metadata.length != 64)) {
            revert Unauthorized();
        }
        bytes32 workflowId;
        assembly { workflowId := calldataload(metadata.offset) }
        if (!workflowIds[workflowId]) revert Unauthorized();
        (address hook, uint256 chainId, bytes32 fingerprintHash, bytes32 reportHash, uint8 riskLevel) =
            abi.decode(report, (address, uint256, bytes32, bytes32, uint8));
        _publish(hook, chainId, fingerprintHash, reportHash, riskLevel, msg.sender);
    }

    function _publish(
        address hook,
        uint256 chainId,
        bytes32 fingerprintHash,
        bytes32 reportHash,
        uint8 riskLevel,
        address publisher
    ) internal {
        if (
            hook == address(0) || chainId == 0 || fingerprintHash == bytes32(0) || reportHash == bytes32(0)
                || riskLevel > 3
        ) revert InvalidPublication();
        if (publications[reportHash].publishedAt != 0) revert DuplicatePublication();
        publications[reportHash] =
            Publication(hook, chainId, fingerprintHash, reportHash, riskLevel, uint64(block.timestamp), publisher);
        latest[keccak256(abi.encode(chainId, hook))] = reportHash;
        emit Published(hook, chainId, reportHash, fingerprintHash, riskLevel, publisher);
    }
}
